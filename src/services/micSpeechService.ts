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
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  public isSupported(): boolean {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return Boolean(
      w.SpeechRecognition ||
        w.webkitSpeechRecognition ||
        (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia)
    );
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
      // Electron / Browser environment without Web Speech API -> Fallback to Native MediaRecorder + Local Whisper
      await this.startMediaRecorderFallback(lang, callbacks);
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

  private async startMediaRecorderFallback(
    lang: 'ja-JP' | 'en-US',
    callbacks: MicCallbacks
  ): Promise<void> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacks.onStateChange(false, 'Microphone capture is unavailable.');
        return;
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.isListening = true;
      this.recordedChunks = [];
      callbacks.onStateChange(true);
      callbacks.onInterim('🎤 Listening... (Click mic again when finished)');

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const chunks = [...this.recordedChunks];
        this.recordedChunks = [];
        this.cleanupAudio();
        this.isListening = false;
        callbacks.onStateChange(false);

        if (chunks.length === 0) return;

        callbacks.onInterim('⏳ Transcribing speech...');
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string)?.split(',')[1];
          if (!base64) return;

          const transcribeIpc =
            (typeof window !== 'undefined' &&
              (window.studioAPI?.transcribeAudio || window.desktopBridge?.transcribeAudio)) ||
            null;

          if (transcribeIpc) {
            try {
              const res = await transcribeIpc({
                base64Audio: base64,
                mimeType,
                lang: lang.startsWith('ja') ? 'ja' : 'en',
              });
              if (res?.ok && res.text) {
                callbacks.onFinal(res.text.trim());
                return;
              }
              if (res?.error) {
                callbacks.onStateChange(false, res.error);
                return;
              }
            } catch {
              // fallback
            }
          }

          callbacks.onStateChange(
            false,
            'Local Whisper STT not running. Start a Faster-Whisper server on port 1234 or 8000 for offline voice recognition.'
          );
        };
        reader.readAsDataURL(blob);
      };

      this.mediaRecorder.start(250);
      void this.startWaveformMeter();
    } catch (err) {
      this.stop();
      callbacks.onStateChange(
        false,
        err instanceof Error ? err.message : 'Unable to access microphone'
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
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
      this.mediaRecorder = null;
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
