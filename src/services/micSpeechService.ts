interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export interface MicCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onWaveform: (bars: number[]) => void;
  onStateChange: (listening: boolean, error?: string) => void;
}

class MicSpeechController {
  private recognition: SpeechRecognitionLike | null = null;
  private isListening = false;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId = 0;
  private callbacks: MicCallbacks | null = null;

  public isSupported(): boolean {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  public getListening(): boolean {
    return this.isListening;
  }

  public async start(lang: 'ja-JP' | 'en-US', callbacks: MicCallbacks): Promise<void> {
    this.stop();
    this.callbacks = callbacks;

    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!Ctor) {
      callbacks.onStateChange(
        false,
        'Browser SpeechRecognition API is unavailable in this environment.'
      );
      return;
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalTranscript = '';

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalTranscript += chunk;
        } else {
          interim += chunk;
        }
      }
      this.callbacks?.onInterim((finalTranscript + interim).trim());
    };

    rec.onerror = (event) => {
      const ignored = event.error === 'no-speech' || event.error === 'aborted';
      this.cleanupAudio();
      this.isListening = false;
      this.callbacks?.onStateChange(
        false,
        ignored ? undefined : `Mic error: ${event.error}`
      );
    };

    rec.onend = () => {
      const committed = finalTranscript.trim();
      this.cleanupAudio();
      this.isListening = false;
      this.callbacks?.onStateChange(false);
      if (committed) {
        this.callbacks?.onFinal(committed);
      }
    };

    this.recognition = rec;
    this.isListening = true;
    callbacks.onStateChange(true);

    void this.startWaveformMeter();

    try {
      rec.start();
    } catch (err) {
      this.stop();
      callbacks.onStateChange(
        false,
        err instanceof Error ? err.message : 'Unable to start voice recognition'
      );
    }
  }

  public stop(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
    this.cleanupAudio();
    if (this.isListening) {
      this.isListening = false;
      this.callbacks?.onStateChange(false);
    }
  }

  private async startWaveformMeter(): Promise<void> {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtx();
        const src = this.audioCtx.createMediaStreamSource(this.stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 128;
        src.connect(this.analyser);
      }
    } catch {
      // Fallback to gentle synthetic listening bars if mic meter is blocked
      this.analyser = null;
    }

    const bins = this.analyser
      ? new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount))
      : null;

    const tick = () => {
      if (!this.isListening) return;
      this.rafId = requestAnimationFrame(tick);

      if (this.analyser && bins) {
        this.analyser.getByteFrequencyData(bins);
        const bars: number[] = [];
        for (let i = 0; i < 8; i++) {
          const val = bins[i * 3 + 2] ?? 0;
          bars.push(Math.max(0.14, Math.min(1, val / 185)));
        }
        this.callbacks?.onWaveform(bars);
      } else {
        const t = performance.now() * 0.008;
        const bars = Array.from({ length: 8 }, (_, i) =>
          Math.max(0.18, Math.min(0.95, 0.45 + 0.35 * Math.sin(t + i * 0.75)))
        );
        this.callbacks?.onWaveform(bars);
      }
    };

    tick();
  }

  private cleanupAudio(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this.analyser = null;
    }
    this.callbacks?.onWaveform([0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12]);
  }
}

export const micSpeech = new MicSpeechController();
