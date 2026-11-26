import type { MusicSyncFrame } from '../types/studio';

export interface MusicTrackState {
  fileName: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

function generateIdolDemoWavBlob(): Blob {
  const sampleRate = 44100;
  const bpm = 128;
  const beatSec = 60 / bpm; // ~0.46875s
  const duration = beatSec * 32; // 32 beats = 8 bars (~15.0s)
  const numSamples = Math.floor(sampleRate * duration);
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16 bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Upbeat F - G - Em - Am chord frequencies (Hz)
  const chordFreqs = [
    [174.61, 220.0, 261.63, 349.23], // F4
    [196.0, 246.94, 293.66, 392.0], // G4
    [164.81, 196.0, 246.94, 329.63], // Em4
    [220.0, 261.63, 329.63, 440.0], // Am4
  ];

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatPos = (t % beatSec) / beatSec;
    const bar = Math.floor(t / (beatSec * 4)) % 4;
    const chord = chordFreqs[bar] || chordFreqs[0];

    // 1. Kick drum (140Hz -> 45Hz punch)
    let kick = 0;
    if (beatPos < 0.28) {
      const kickT = beatPos * beatSec;
      const kickFreq = 45 + 95 * Math.exp(-kickT * 35);
      kick = Math.sin(2 * Math.PI * kickFreq * kickT) * Math.exp(-kickT * 18) * 0.72;
    }

    // 2. Snare drum (beats 2 & 4)
    const beatIndex = Math.floor((t % (beatSec * 4)) / beatSec);
    let snare = 0;
    if ((beatIndex === 1 || beatIndex === 3) && beatPos < 0.32) {
      const snareT = beatPos * beatSec;
      const noise = Math.random() * 2 - 1;
      const tone = Math.sin(2 * Math.PI * 185 * snareT);
      snare = (noise * 0.65 + tone * 0.35) * Math.exp(-snareT * 22) * 0.55;
    }

    // 3. Hi-hat (16th notes)
    const sixteenth = (t % (beatSec / 4)) / (beatSec / 4);
    let hihat = 0;
    if (sixteenth < 0.16) {
      const hhT = sixteenth * (beatSec / 4);
      hihat = (Math.random() * 2 - 1) * Math.exp(-hhT * 85) * 0.22;
    }

    // 4. Synth Arpeggio (Upbeat 16th-note melody)
    const noteIdx = Math.floor(t / (beatSec / 4)) % chord.length;
    const f = chord[noteIdx] || 261.63;
    const synthT = t % (beatSec / 4);
    const saw = 2 * ((f * synthT) % 1) - 1;
    const synth = saw * Math.exp(-synthT * 12) * 0.32;

    // 5. Bassline (8th notes on root)
    const bassRoot = (chord[0] || 174.61) * 0.5;
    const bass = Math.sin(2 * Math.PI * bassRoot * t) * 0.36;

    const mixed = Math.max(-1, Math.min(1, kick + snare + hihat + synth + bass));
    const sample = Math.floor(mixed * 32767);
    view.setInt16(offset, sample, true);
    view.setInt16(offset + 2, sample, true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

class IdolMusicSyncEngine {
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private currentBlobUrl: string | null = null;
  private prevBass = 0;
  private beatPulse = 0;
  private state: MusicTrackState = {
    fileName: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.75,
  };
  private listeners = new Set<(state: MusicTrackState) => void>();

  public subscribe(cb: (state: MusicTrackState) => void): () => void {
    this.listeners.add(cb);
    cb({ ...this.state });
    return () => this.listeners.delete(cb);
  }

  private emit() {
    const snap = { ...this.state };
    this.listeners.forEach((cb) => cb(snap));
  }

  private ensureGraph(): HTMLAudioElement {
    if (!this.audioEl) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.loop = true;

      el.addEventListener('loadedmetadata', () => {
        this.state.duration = Number.isFinite(el.duration) ? el.duration : 0;
        this.emit();
      });
      el.addEventListener('timeupdate', () => {
        this.state.currentTime = el.currentTime || 0;
        this.emit();
      });
      el.addEventListener('play', () => {
        this.state.isPlaying = true;
        this.emit();
      });
      el.addEventListener('pause', () => {
        this.state.isPlaying = false;
        this.emit();
      });
      el.addEventListener('ended', () => {
        this.state.isPlaying = false;
        this.emit();
      });

      this.audioEl = el;
    }

    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audioEl);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.74;
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.state.volume;

      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }

    return this.audioEl;
  }

  public async loadAndPlayFile(file: File): Promise<void> {
    const el = this.ensureGraph();
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
    }
    const url = URL.createObjectURL(file);
    this.currentBlobUrl = url;
    el.src = url;
    this.state.fileName = file.name;
    this.state.currentTime = 0;
    this.emit();
    try {
      await el.play();
    } catch (err) {
      console.warn('[MusicSync] Autoplay blocked until user clicks play:', err);
    }
  }

  public async playBuiltinDemoSong(): Promise<void> {
    const blob = generateIdolDemoWavBlob();
    const el = this.ensureGraph();
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
    }
    const url = URL.createObjectURL(blob);
    this.currentBlobUrl = url;
    el.src = url;
    this.state.fileName = '✨ Zeta Idol Stage Debut Beat (128 BPM)';
    this.state.currentTime = 0;
    this.emit();
    try {
      await el.play();
    } catch (err) {
      console.warn('[MusicSync] Autoplay blocked until user clicks play:', err);
    }
  }

  public async togglePlay(): Promise<void> {
    if (!this.audioEl || !this.state.fileName) return;
    if (this.audioCtx?.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (this.audioEl.paused) {
      await this.audioEl.play();
    } else {
      this.audioEl.pause();
    }
  }

  public stop(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.currentTime = 0;
    }
    this.state.isPlaying = false;
    this.state.currentTime = 0;
    this.beatPulse = 0;
    this.emit();
  }

  public clearTrack(): void {
    this.stop();
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    if (this.audioEl) {
      this.audioEl.removeAttribute('src');
    }
    this.state.fileName = null;
    this.state.duration = 0;
    this.emit();
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.state.volume = clamped;
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    }
    this.emit();
  }

  public seek(seconds: number): void {
    if (!this.audioEl || !Number.isFinite(seconds)) return;
    this.audioEl.currentTime = Math.max(0, Math.min(this.state.duration || 0, seconds));
  }

  public getFrame(): MusicSyncFrame {
    if (!this.state.isPlaying || !this.analyser || !this.freqData) {
      this.beatPulse *= 0.85;
      return {
        isPlaying: false,
        bass: 0,
        mid: 0,
        treble: 0,
        beatPulse: 0,
        aa: 0,
        ih: 0,
        ou: 0,
        bars: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    const n = this.freqData.length;

    // Bass (bins 1..10 ~ 40-220Hz) for spotlights & beat head nods
    let bassSum = 0;
    for (let i = 1; i < Math.min(11, n); i++) bassSum += this.freqData[i];
    const bass = Math.min(1, bassSum / (10 * 255));

    // Vocal band (bins 11..62 ~ 250-3000Hz) for karaoke lip-syncing
    let vocalLow = 0;
    let vocalMid = 0;
    let vocalHigh = 0;
    for (let i = 11; i < Math.min(26, n); i++) vocalLow += this.freqData[i];
    for (let i = 26; i < Math.min(46, n); i++) vocalMid += this.freqData[i];
    for (let i = 46; i < Math.min(72, n); i++) vocalHigh += this.freqData[i];

    // Apply 0.06 RMS noise-gate so quiet intros/outros keep lips closed cleanly
    let rms = 0;
    if (this.timeData) {
      this.analyser.getByteTimeDomainData(this.timeData);
      let sumSq = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        const c = (this.timeData[i] - 128) / 128;
        sumSq += c * c;
      }
      rms = Math.sqrt(sumSq / this.timeData.length);
    }

    const gated = rms >= 0.06;
    const ou = gated ? Math.min(0.55, (vocalLow / (15 * 255)) * 1.8) : 0;
    const aa = gated ? Math.min(0.75, (vocalMid / (20 * 255)) * 2.1) : 0;
    const ih = gated ? Math.min(0.55, (vocalHigh / (26 * 255)) * 2.1) : 0;
    const mid = (ou + aa) * 0.5;
    const treble = ih;

    // Beat onset detection
    const delta = bass - this.prevBass;
    this.prevBass = bass * 0.65 + this.prevBass * 0.35;
    if (delta > 0.08 && bass > 0.34) {
      this.beatPulse = Math.min(1, this.beatPulse + 0.65);
    } else {
      this.beatPulse *= 0.88;
    }

    // 12 visualizer bars
    const bars: number[] = [];
    for (let b = 0; b < 12; b++) {
      const idx = 2 + b * 6;
      const val = this.freqData[Math.min(idx, n - 1)] / 255;
      bars.push(Math.max(0.08, Math.min(1, val)));
    }

    return {
      isPlaying: true,
      bass,
      mid,
      treble,
      beatPulse: this.beatPulse,
      aa,
      ih,
      ou,
      bars,
    };
  }
}

export const musicSync = new IdolMusicSyncEngine();
