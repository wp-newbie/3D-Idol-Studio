import type {
  InteractionZone,
  LipSyncFrame,
  MoodType,
  StudioSettings,
  VoiceSettings,
} from '../types/studio';
import { MOOD_META } from '../data/presets';
import { extractEnglishSubtitle, extractSpokenDialogue } from './dialogueParser';
import { resolveEffectiveApiKey, sanitizeApiKey } from './apiKeyResolver';
import {
  extractRecommendedModelFromError,
  listAvailableGeminiModels,
} from './geminiClient';
import {
  computeVoiceModulation,
  type VoiceModulationProfile,
} from './voiceToneDirector';

const NOISE_GATE_RMS = 0.06;
const MAX_AA_OPENNESS = 0.75;

function decodeBase64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Wraps raw signed 16-bit little-endian PCM into a playable WAV ArrayBuffer.
 */
function pcm16ToWav(pcmBytes: Uint8Array, sampleRate = 24000, channels = 1): ArrayBuffer {
  const headerLen = 44;
  const totalLen = headerLen + pcmBytes.byteLength;
  const buffer = new ArrayBuffer(totalLen);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, totalLen - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcmBytes.byteLength, true);

  new Uint8Array(buffer, headerLen).set(pcmBytes);
  return buffer;
}

export function getMoodVocalDirection(mood: MoodType): string {
  return MOOD_META[mood]?.tsundereVocalDirection || MOOD_META.Deadpan.tsundereVocalDirection;
}

class StudioVoiceEngine {
  private audioEl: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private currentBufferSource: AudioBufferSourceNode | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;

  private activeMode: 'none' | 'audio' | 'speechsynth' = 'none';
  private isSpeakingFlag = false;
  private synthStartTime = 0;
  private synthPulseSeed = 0;
  private synthStartedAt = 0;
  private listeners = new Set<(speaking: boolean) => void>();

  public subscribe(cb: (speaking: boolean) => void): () => void {
    this.listeners.add(cb);
    cb(this.isSpeakingFlag);
    return () => this.listeners.delete(cb);
  }

  public getIsSpeaking(): boolean {
    return this.isSpeakingFlag;
  }

  private setSpeakingState(speaking: boolean): void {
    if (this.isSpeakingFlag === speaking) return;
    this.isSpeakingFlag = speaking;
    this.listeners.forEach((cb) => cb(speaking));
  }

  private clearAudioUrl(): void {
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
  }

  private async ensureAudioContext(): Promise<{ audioCtx: AudioContext; analyser: AnalyserNode }> {
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.72;
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.analyser.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    return { audioCtx: this.audioCtx, analyser: this.analyser! };
  }

  private async ensureAudioElementPipeline(): Promise<{
    audioEl: HTMLAudioElement;
    audioCtx: AudioContext;
    analyser: AnalyserNode;
  }> {
    const { audioCtx, analyser } = await this.ensureAudioContext();

    if (!this.audioEl) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';

      el.onplay = () => {
        this.activeMode = 'audio';
        this.setSpeakingState(true);
      };
      el.onended = () => {
        if (this.activeMode === 'audio') {
          this.activeMode = 'none';
          this.setSpeakingState(false);
        }
        this.clearAudioUrl();
      };
      el.onpause = () => {
        if (this.activeMode === 'audio') {
          this.activeMode = 'none';
          this.setSpeakingState(false);
        }
      };
      el.onerror = () => {
        if (this.activeMode === 'audio') {
          this.activeMode = 'none';
          this.setSpeakingState(false);
        }
        this.clearAudioUrl();
      };

      this.audioEl = el;
    }

    if (!this.mediaSource) {
      this.mediaSource = audioCtx.createMediaElementSource(this.audioEl);
      this.mediaSource.connect(analyser);
    }

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    return { audioEl: this.audioEl, audioCtx, analyser };
  }

  public stop(): void {
    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.onended = null;
        this.currentBufferSource.stop();
        this.currentBufferSource.disconnect();
      } catch {
        // ignore if already stopped
      }
      this.currentBufferSource = null;
    }
    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.currentTime = 0;
        this.audioEl.removeAttribute('src');
      } catch {
        // ignore
      }
    }
    this.clearAudioUrl();
    this.currentUtterance = null;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.activeMode = 'none';
    this.setSpeakingState(false);
  }

  public getLipSyncFrame(): LipSyncFrame {
    // Safety watchdog: if browser speechSynthesis stopped silently without firing onend, clear flag
    if (
      this.activeMode === 'speechsynth' &&
      this.isSpeakingFlag &&
      performance.now() - this.synthStartedAt > 450 &&
      'speechSynthesis' in window &&
      !window.speechSynthesis.speaking
    ) {
      this.activeMode = 'none';
      this.setSpeakingState(false);
    }

    if (!this.isSpeakingFlag) {
      return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, volume: 0, isSpeaking: false };
    }

    if (
      this.activeMode === 'audio' &&
      this.analyser &&
      this.freqData &&
      this.timeData
    ) {
      // 1. Compute normalized time-domain RMS for clean noise-gating
      this.analyser.getByteTimeDomainData(this.timeData);
      let sumSq = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const centered = (this.timeData[i] - 128) / 128;
        sumSq += centered * centered;
      }
      const rms = Math.sqrt(sumSq / this.timeData.length);

      // Noise-gate: silence / low background floor below 0.06 closes lips cleanly to 0
      if (rms < NOISE_GATE_RMS) {
        return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, volume: 0, isSpeaking: true };
      }

      // 2. Map vocal frequency bands into natural vowel visemes (aa capped at 0.75)
      this.analyser.getByteFrequencyData(this.freqData);
      const binCount = this.freqData.length;
      let low = 0;
      let mid = 0;
      let high = 0;
      const lowEnd = Math.min(18, binCount);
      const midEnd = Math.min(54, binCount);
      const highEnd = Math.min(110, binCount);

      for (let i = 2; i < lowEnd; i++) low += this.freqData[i];
      for (let i = lowEnd; i < midEnd; i++) mid += this.freqData[i];
      for (let i = midEnd; i < highEnd; i++) high += this.freqData[i];

      const gatedGain = Math.min(1, (rms - NOISE_GATE_RMS) / 0.24);
      const rawOu = (low / ((lowEnd - 2) * 255)) * 1.9 * gatedGain;
      const rawAa = (mid / ((midEnd - lowEnd) * 255)) * 2.2 * gatedGain;
      const rawIh = (high / ((highEnd - midEnd) * 255)) * 2.1 * gatedGain;

      const aa = Math.min(MAX_AA_OPENNESS, Math.max(0, rawAa));
      const ih = Math.min(0.55, Math.max(0, rawIh));
      const ou = Math.min(0.55, Math.max(0, rawOu));

      return { aa, ih, ou, ee: 0, oh: 0, volume: Math.min(1, rms * 3.0), isSpeaking: true };
    }

    if (this.activeMode === 'speechsynth') {
      const t = (performance.now() - this.synthStartTime) * 0.001 + this.synthPulseSeed;
      // Natural syllable envelope with brief word-gap dips below NOISE_GATE_RMS
      const phraseGate = 0.5 + 0.5 * Math.sin(t * 2.7);
      const syllableRaw =
        (Math.sin(t * 12.5) * 0.5 + Math.sin(t * 20.4) * 0.35 + 0.22) *
        (phraseGate > 0.18 ? 1 : 0);

      if (syllableRaw < NOISE_GATE_RMS) {
        return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, volume: 0, isSpeaking: true };
      }

      const norm = Math.min(1, syllableRaw);
      const aa = Math.min(MAX_AA_OPENNESS, norm * (0.55 + 0.25 * Math.sin(t * 5.0)));
      const ih = Math.min(0.5, norm * Math.max(0, Math.cos(t * 7.4)) * 0.58);
      const ou = Math.min(0.48, norm * Math.max(0, Math.sin(t * 6.1 + 1.3)) * 0.54);
      return { aa, ih, ou, ee: 0, oh: 0, volume: norm, isSpeaking: true };
    }

    return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, volume: 0, isSpeaking: false };
  }

  public async speakRawDialogue(params: {
    rawText: string;
    mood: MoodType;
    voice: VoiceSettings;
    settings: StudioSettings;
    personaName?: string;
    emotionIntensity?: number;
    hunger?: number;
    sleepiness?: number;
    boredom?: number;
    comfort?: number;
    isSleeping?: boolean;
    nuancedFeeling?: string;
    empathySoftening?: boolean;
    recentInteractionZone?: InteractionZone | null;
    onResolvedTtsModel?: (model: string) => void;
  }): Promise<{
    usedEngine: 'gemini-tts' | 'web-speech' | 'skipped';
    spokenText: string;
    modulation: VoiceModulationProfile;
  }> {
    const modulation = computeVoiceModulation({
      personaName: params.personaName,
      mood: params.mood,
      emotionIntensity: params.emotionIntensity,
      voice: params.voice,
      hunger: params.hunger,
      sleepiness: params.sleepiness,
      boredom: params.boredom,
      comfort: params.comfort,
      isSleeping: params.isSleeping,
      nuancedFeeling: params.nuancedFeeling,
      empathySoftening: params.empathySoftening,
      recentInteractionZone: params.recentInteractionZone,
    });

    const spokenText = extractSpokenDialogue(params.rawText);
    const englishSubtitle = extractEnglishSubtitle(params.rawText);
    if (!spokenText && !englishSubtitle) {
      return { usedEngine: 'skipped', spokenText: '', modulation };
    }

    this.stop();

    const modulatedVoice: VoiceSettings = {
      ...params.voice,
      pitch: modulation.effectivePitch,
      speed: modulation.effectiveRate,
    };

    const apiKey = sanitizeApiKey(resolveEffectiveApiKey(params.settings));
    if (apiKey && !params.settings.offlineVoiceOnly) {
      try {
        const audioData = await this.requestGeminiTts({
          spokenText: spokenText || englishSubtitle,
          voice: modulatedVoice,
          settings: params.settings,
          stylePrompt: modulation.stylePrompt,
          onResolvedTtsModel: params.onResolvedTtsModel,
        });
        if (audioData) {
          await this.playAudioBytes(audioData.bytes, audioData.mimeType, modulatedVoice);
          return { usedEngine: 'gemini-tts', spokenText: spokenText || englishSubtitle, modulation };
        }
      } catch (err) {
        console.warn(
          '[TTS] Gemini TTS unavailable, falling back to native SpeechSynthesis:',
          err
        );
      }
    }

    await this.playSpeechSynthesisFallback(
      spokenText || englishSubtitle,
      modulatedVoice,
      englishSubtitle
    );
    return { usedEngine: 'web-speech', spokenText: spokenText || englishSubtitle, modulation };
  }

  private async requestSingleGeminiTts(params: {
    cleanApiKey: string;
    model: string;
    prompt: string;
    voiceName: string;
  }): Promise<
    | { ok: true; bytes: Uint8Array; mimeType: string }
    | { ok: false; status: number; errBody: string }
  > {
    const { cleanApiKey, model, prompt, voiceName } = params;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': cleanApiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { ok: false, status: res.status, errBody };
    }

    const json = (await res.json()) as {
      candidates?: {
        content?: {
          parts?: { inlineData?: { data?: string; mimeType?: string } }[];
        };
      }[];
    };

    const inline = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) {
      return { ok: false, status: 500, errBody: 'No inline audio data in response' };
    }

    return {
      ok: true,
      bytes: decodeBase64ToUint8(inline.data),
      mimeType: inline.mimeType || 'audio/L16;rate=24000',
    };
  }

  private async requestGeminiTts(params: {
    spokenText: string;
    voice: VoiceSettings;
    settings: StudioSettings;
    stylePrompt: string;
    onResolvedTtsModel?: (model: string) => void;
  }): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const { spokenText, voice, settings, stylePrompt, onResolvedTtsModel } = params;
    const cleanApiKey = sanitizeApiKey(resolveEffectiveApiKey(settings));
    if (!cleanApiKey) return null;

    const primaryModel = settings.ttsModel.trim() || 'gemini-2.5-flash-preview-tts';
    const prompt = `${stylePrompt}\nPerform ONLY the following quoted dialogue line:\n${spokenText}`;

    const first = await this.requestSingleGeminiTts({
      cleanApiKey,
      model: primaryModel,
      prompt,
      voiceName: voice.voiceName,
    });
    if (first.ok) {
      return { bytes: first.bytes, mimeType: first.mimeType };
    }

    // Automatic 404 TTS model self-healing: discover live TTS models via /v1beta/models and retry once
    if (first.status === 404) {
      const hinted = extractRecommendedModelFromError(first.errBody);
      const discovered = await listAvailableGeminiModels(cleanApiKey);
      const candidates = Array.from(
        new Set(
          [
            hinted,
            ...discovered.ttsModels,
            'gemini-2.5-flash-preview-tts',
            'gemini-2.5-pro-preview-tts',
          ].filter((m): m is string => Boolean(m && m !== primaryModel))
        )
      );

      for (const candidate of candidates) {
        const retry = await this.requestSingleGeminiTts({
          cleanApiKey,
          model: candidate,
          prompt,
          voiceName: voice.voiceName,
        });
        if (retry.ok) {
          console.info(
            `[TTS] Auto-migrated retired TTS model "${primaryModel}" -> "${candidate}"`
          );
          onResolvedTtsModel?.(candidate);
          return { bytes: retry.bytes, mimeType: retry.mimeType };
        }
        if (retry.status === 401 || retry.status === 403) break;
      }
    }

    throw new Error(
      `Gemini TTS HTTP ${first.status}${first.errBody ? `: ${first.errBody.slice(0, 240)}` : ''}`
    );
  }

  private async playAudioBytes(
    bytes: Uint8Array,
    mimeType: string,
    voice: VoiceSettings
  ): Promise<void> {
    let audioBuffer: ArrayBuffer;
    let blobType: string;
    const lowerMime = mimeType.toLowerCase();
    if (lowerMime.includes('l16') || lowerMime.includes('pcm')) {
      const rateMatch = /rate=(\d+)/i.exec(mimeType);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
      audioBuffer = pcm16ToWav(bytes, sampleRate, 1);
      blobType = 'audio/wav';
    } else {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      audioBuffer = copy.buffer;
      blobType = mimeType || 'audio/mpeg';
    }

    const playbackRate = Math.max(0.78, Math.min(1.32, voice.speed || 1.0));

    // Primary path: decode directly into AudioContext -> AudioBufferSourceNode -> AnalyserNode.
    // This guarantees audible playback + live VRM lip-sync in Electron without blob/MediaElement quirks.
    try {
      const { audioCtx, analyser } = await this.ensureAudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      const decoded = await audioCtx.decodeAudioData(audioBuffer.slice(0));
      const source = audioCtx.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = playbackRate;
      source.connect(analyser);

      source.onended = () => {
        if (this.currentBufferSource === source) {
          this.currentBufferSource = null;
          if (this.activeMode === 'audio') {
            this.activeMode = 'none';
            this.setSpeakingState(false);
          }
        }
      };

      this.currentBufferSource = source;
      this.activeMode = 'audio';
      this.setSpeakingState(true);
      source.start(0);
      return;
    } catch (decodeErr) {
      console.warn('[TTS] AudioContext decodeAudioData failed, trying HTMLAudioElement:', decodeErr);
    }

    // Fallback path: HTMLAudioElement wired through resumed AudioContext
    const { audioEl, audioCtx } = await this.ensureAudioElementPipeline();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const blob = new Blob([audioBuffer], { type: blobType });
    this.clearAudioUrl();
    const url = URL.createObjectURL(blob);
    this.currentAudioUrl = url;
    audioEl.src = url;
    audioEl.playbackRate = playbackRate;
    audioEl.load();

    try {
      await audioEl.play();
    } catch (err) {
      this.activeMode = 'none';
      this.setSpeakingState(false);
      this.clearAudioUrl();
      throw err;
    }
  }

  private waitForSpeechVoices(timeoutMs = 500): Promise<SpeechSynthesisVoice[]> {
    if (!('speechSynthesis' in window)) return Promise.resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) return Promise.resolve(existing);

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.speechSynthesis.removeEventListener?.('voiceschanged', onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      };
      const onVoicesChanged = () => {
        if (window.speechSynthesis.getVoices().length > 0) {
          finish();
        }
      };
      const timer = window.setTimeout(finish, timeoutMs);
      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
      } else {
        window.speechSynthesis.onvoiceschanged = onVoicesChanged;
      }
    });
  }

  private async playSpeechSynthesisFallback(
    spokenText: string,
    voice: VoiceSettings,
    englishSubtitle?: string
  ): Promise<void> {
    if (!('speechSynthesis' in window)) return;

    const voices = await this.waitForSpeechVoices(500);
    const isJa = voice.language === 'ja';
    const jaMatches = voices.filter((v) => v.lang.toLowerCase().startsWith('ja'));
    const enMatches = voices.filter((v) =>
      /^en[-_](us|gb)/i.test(v.lang)
    );
    const anyEnMatches =
      enMatches.length > 0
        ? enMatches
        : voices.filter((v) => v.lang.toLowerCase().startsWith('en'));

    let textToSpeak = spokenText;
    let selectedVoice: SpeechSynthesisVoice | null = null;
    let targetLang = isJa ? 'ja-JP' : 'en-US';

    if (isJa && jaMatches.length > 0) {
      const preferredJa =
        voice.gender === 'female'
          ? jaMatches.find((v) => /google\s*日本語/i.test(v.name)) ||
            jaMatches.find((v) => /microsoft\s*nanami/i.test(v.name)) ||
            jaMatches.find((v) => /haruka|kyoko|ayumi|sayaka|female/i.test(v.name))
          : jaMatches.find((v) => /microsoft\s*keita/i.test(v.name)) ||
            jaMatches.find((v) => /ichiro|otoya|male/i.test(v.name));
      selectedVoice = preferredJa || jaMatches[0];
      targetLang = selectedVoice.lang || 'ja-JP';
    } else {
      // No ja-JP voice installed (common on Windows Electron) OR English mode:
      // Fall back to best en-US / en-GB or default system voice (voices[0]) using English subtitle text.
      const pool = anyEnMatches.length > 0 ? anyEnMatches : voices;
      if (pool.length > 0) {
        const preferredEn =
          voice.gender === 'female'
            ? pool.find((v) => /aria|jenny|zira|samantha|google us english|natural.*female|female/i.test(v.name))
            : pool.find((v) => /guy|david|mark|daniel|george|male/i.test(v.name));
        selectedVoice = preferredEn || pool[0];
        targetLang = selectedVoice.lang || 'en-US';
      } else {
        targetLang = 'en-US';
      }

      if (isJa && englishSubtitle && englishSubtitle.trim().length > 0) {
        textToSpeak = englishSubtitle.trim();
        console.info(
          '[TTS] No ja-JP system voice found in Electron; falling back to English subtitle voice:',
          selectedVoice?.name || targetLang
        );
      }
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = targetLang;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    const defaultPitch = voice.gender === 'female' ? 1.25 : 0.92;
    const defaultRate = voice.gender === 'female' ? 1.08 : 1.02;
    utterance.pitch = Math.max(0.72, Math.min(1.55, voice.pitch || defaultPitch));
    utterance.rate = Math.max(0.78, Math.min(1.32, voice.speed || defaultRate));

    // Bind explicit isSpeaking strictly to onstart / onend / onerror
    utterance.onstart = () => {
      const now = performance.now();
      this.synthStartTime = now;
      this.synthStartedAt = now;
      this.synthPulseSeed = Math.random() * 10;
      this.activeMode = 'speechsynth';
      this.setSpeakingState(true);
    };
    utterance.onend = () => {
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
      }
      if (this.activeMode === 'speechsynth') {
        this.activeMode = 'none';
        this.setSpeakingState(false);
      }
    };
    utterance.onerror = (ev) => {
      console.warn('[TTS] SpeechSynthesis utterance error:', ev.error);
      if (this.currentUtterance === utterance) {
        this.currentUtterance = null;
      }
      if (this.activeMode === 'speechsynth') {
        this.activeMode = 'none';
        this.setSpeakingState(false);
      }
    };

    // Hold strong reference so Electron/Chromium never GC's the utterance mid-speech
    this.currentUtterance = utterance;

    // Cancel any stuck utterance queue right before speak() so Electron never deadlocks
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.speak(utterance);
  }
}

export const voiceEngine = new StudioVoiceEngine();
