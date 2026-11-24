import React, { useEffect, useRef, useState } from 'react';
import {
  Brain,
  Mic,
  MicOff,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
  Wand2,
} from 'lucide-react';
import type { ChatMessage, Persona } from '../types/studio';
import { getAffinityTier, MOOD_META, VOCAL_ARCHETYPES } from '../data/presets';
import { micSpeech } from '../services/micSpeechService';

interface ChatSidebarProps {
  persona: Persona;
  isGenerating: boolean;
  isSpeaking: boolean;
  connectionMode: 'live' | 'demo' | 'error';
  showAiStudioConnectBanner: boolean;
  providerStatus: string;
  lastAffinityDelta: number | null;
  onSendMessage: (text: string) => void;
  onSpeakMessage: (msg: ChatMessage) => void;
  onUserTypingChange?: (isTyping: boolean) => void;
  onResetHistory: () => void;
  onOpenMemoryJournal: () => void;
  onConnectAiStudioKey: () => void;
  onOpenSettings: () => void;
}

const QUICK_PROMPTS = [
  'You look really cute under the studio lights today.',
  "Ready for tonight's live stage rehearsal?",
  'Wait, are you blushing right now?',
  "Let's try a totally different outfit vibe.",
];

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  persona,
  isGenerating,
  isSpeaking,
  connectionMode,
  showAiStudioConnectBanner,
  providerStatus,
  lastAffinityDelta,
  onSendMessage,
  onSpeakMessage,
  onUserTypingChange,
  onResetHistory,
  onOpenMemoryJournal,
  onConnectAiStudioKey,
  onOpenSettings,
}) => {
  const [draft, setDraft] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [micLang, setMicLang] = useState<'en-US' | 'ja-JP'>('en-US');
  const [interimText, setInterimText] = useState('');
  const [micError, setMicError] = useState<string | null>(null);
  const [waveBars, setWaveBars] = useState<number[]>([0.15, 0.25, 0.3, 0.2, 0.3, 0.25, 0.2, 0.15]);

  const endRef = useRef<HTMLDivElement | null>(null);
  const wasSpeakingRef = useRef(false);
  const handsFreeRef = useRef(handsFreeMode);
  handsFreeRef.current = handsFreeMode;
  const onSendRef = useRef(onSendMessage);
  onSendRef.current = onSendMessage;
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const activeTyping = draft.trim().length > 0;
    onUserTypingChange?.(activeTyping);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (activeTyping) {
      typingTimerRef.current = window.setTimeout(() => {
        onUserTypingChange?.(false);
      }, 2400);
    }
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    };
  }, [draft, onUserTypingChange]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [persona.messages.length, isGenerating, persona.id]);

  // Continuous Hands-Free Conversation: automatically resume mic once TTS finishes
  useEffect(() => {
    if (wasSpeakingRef.current && !isSpeaking && handsFreeRef.current && !isGenerating) {
      const timer = window.setTimeout(() => {
        if (handsFreeRef.current && !micSpeech.getListening()) {
          startVoiceInput();
        }
      }, 450);
      return () => window.clearTimeout(timer);
    }
    wasSpeakingRef.current = isSpeaking;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, isGenerating]);

  useEffect(() => {
    return () => {
      micSpeech.stop();
    };
  }, []);

  const startVoiceInput = () => {
    setMicError(null);
    setInterimText('');
    void micSpeech.start(micLang, {
      onInterim: (txt) => setInterimText(txt),
      onFinal: (finalTxt) => {
        setInterimText('');
        if (finalTxt.trim()) {
          onSendRef.current(finalTxt.trim());
        }
      },
      onWaveform: (bars) => setWaveBars(bars),
      onStateChange: (listening, err) => {
        setIsListening(listening);
        if (err) setMicError(err);
      },
    });
  };

  const toggleMic = () => {
    if (isListening) {
      micSpeech.stop();
      setInterimText('');
    } else {
      startVoiceInput();
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isGenerating) return;
    setDraft('');
    onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const archetype = VOCAL_ARCHETYPES[persona.voice.archetype];
  const tier = getAffinityTier(persona.affinity);

  return (
    <aside className="flex h-full w-full flex-col border-l border-white/[0.08] bg-[#0b0b14]/88 backdrop-blur-2xl">
      {/* Persona Header + Tsun -> Dere Affection Gauge + Core Memory Journal (🧠) */}
      <div className="border-b border-white/[0.07] px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 font-display text-sm font-bold text-white shadow-inner"
              style={{
                background: `linear-gradient(135deg, ${persona.accentColor}cc, #141422)`,
              }}
            >
              {persona.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-display text-sm font-bold text-white">
                  {persona.name}
                </h2>
                <span className="truncate text-[11px] text-zinc-400">
                  {persona.japaneseName}
                </span>
              </div>
              <p className="truncate text-[11px] text-zinc-400">
                {persona.title} · {archetype.shortLabel} ({persona.voice.voiceName})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenMemoryJournal}
              className="flex items-center gap-1 rounded-xl border border-pink-400/25 bg-pink-500/10 px-2 py-1.5 text-[11px] font-semibold text-pink-200 transition hover:border-pink-400/50 hover:bg-pink-500/20"
              title="Open Core Memory Journal (auto-summarized every 12 messages)"
            >
              <Brain className="h-3.5 w-3.5" />
              <span>{persona.memoryJournal.length}</span>
            </button>
            <button
              type="button"
              onClick={onResetHistory}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
              title="Reset conversation for this persona"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Sleek Tsun ❄️ -> Dere 🌸 Progressive Affection Meter */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
          <div className="flex items-center justify-between text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-zinc-400">Tsun ❄️ → Dere 🌸</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[9.5px] font-semibold ${tier.badgeClass}`}
              >
                {tier.emoji} {tier.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              {lastAffinityDelta !== null && lastAffinityDelta !== 0 && (
                <span
                  className={`font-bold ${
                    lastAffinityDelta > 0 ? 'text-pink-300' : 'text-sky-300'
                  }`}
                >
                  {lastAffinityDelta > 0 ? `+${lastAffinityDelta}` : lastAffinityDelta}
                </span>
              )}
              <span className="text-zinc-200 font-semibold">{persona.affinity}/100</span>
            </div>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${tier.gradientClass}`}
              style={{ width: `${Math.max(4, persona.affinity)}%` }}
            />
          </div>
        </div>

        {/* Prominent 1-Click Google AI Studio Connect Banner when window.aistudio.openSelectKey is available */}
        {showAiStudioConnectBanner && (
          <button
            type="button"
            onClick={onConnectAiStudioKey}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/45 bg-gradient-to-r from-emerald-600/30 via-teal-600/30 to-cyan-600/30 px-3 py-2 text-xs font-semibold text-emerald-100 shadow-glow transition hover:brightness-125"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
            <span>Connect Google AI Studio Key (1-Click)</span>
          </button>
        )}
      </div>

      {/* Visual Novel Dialogue Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
        {persona.messages.map((msg) => {
          if (msg.role === 'system_event') {
            return (
              <div
                key={msg.id}
                className="flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-950/25 px-3 py-2 text-[11px] text-rose-200/85"
              >
                <Wand2 className="h-3.5 w-3.5 shrink-0 text-rose-300" />
                <span className="font-mono leading-snug">{msg.rawText}</span>
              </div>
            );
          }

          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[84%] rounded-2xl rounded-br-md border border-violet-400/25 bg-violet-600/20 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-100 shadow-sm">
                  {msg.rawText}
                </div>
              </div>
            );
          }

          const msgMoodMeta = msg.mood ? MOOD_META[msg.mood] : null;
          return (
            <div
              key={msg.id}
              className="group rounded-2xl rounded-tl-md border border-white/[0.08] bg-[#131322]/90 p-3.5 shadow-glass transition hover:border-white/[0.14]"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: persona.accentColor }}
                  />
                  <span className="font-display text-[11px] font-semibold tracking-wide text-zinc-200">
                    {persona.name}
                  </span>
                  {msgMoodMeta && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${msgMoodMeta.badgeClass}`}
                    >
                      {msgMoodMeta.label}
                    </span>
                  )}
                  {typeof msg.affinityDelta === 'number' && msg.affinityDelta !== 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-semibold ${
                        msg.affinityDelta > 0
                          ? 'bg-pink-500/15 text-pink-300'
                          : 'bg-sky-500/15 text-sky-300'
                      }`}
                    >
                      {msg.affinityDelta > 0
                        ? `+${msg.affinityDelta} 🌸`
                        : `${msg.affinityDelta} ❄️`}
                    </span>
                  )}
                  {msg.isFallback && (
                    <span className="rounded-full border border-amber-400/25 bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-300/90">
                      Demo
                    </span>
                  )}
                </div>

                {msg.spokenText && (
                  <button
                    type="button"
                    onClick={() => onSpeakMessage(msg)}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-violet-200 transition hover:border-violet-400/40 hover:bg-violet-500/20"
                    title={`Play voice: "${msg.spokenText}"`}
                  >
                    <Volume2 className="h-3 w-3" />
                    <span>Speak</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {msg.segments.map((seg, idx) => {
                  if (seg.kind === 'action') {
                    return (
                      <p key={idx} className="text-[12px] italic leading-relaxed text-zinc-400">
                        *{seg.text}*
                      </p>
                    );
                  }
                  if (seg.kind === 'dialogue') {
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border-l-2 bg-white/[0.04] px-3 py-2 text-[13.5px] font-medium leading-relaxed text-white"
                        style={{ borderLeftColor: persona.accentColor }}
                      >
                        “{seg.text}”
                      </div>
                    );
                  }
                  return (
                    <p key={idx} className="pl-3 text-[11px] leading-snug text-zinc-400/90">
                      ({seg.text})
                    </p>
                  );
                })}
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-[#131322]/75 px-4 py-3 text-xs text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 animate-spin text-violet-400" />
            <span>{persona.name} is reacting...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Live Mic Waveform Banner (when listening) */}
      {(isListening || micError) && (
        <div className="border-t border-white/[0.08] bg-rose-950/35 px-3.5 py-2">
          {isListening ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
                <span className="truncate text-[11px] font-medium text-rose-100">
                  {interimText || `Listening (${micLang})... speak now`}
                </span>
              </div>
              <div className="flex h-5 items-end gap-0.5 shrink-0">
                {waveBars.map((h, i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full bg-rose-300 transition-all duration-75"
                    style={{ height: `${Math.max(18, Math.round(h * 100))}%` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-amber-200">{micError}</div>
          )}
        </div>
      )}

      {/* Quick Prompts + Hands-Free Voice & Text Composer */}
      <div className="border-t border-white/[0.08] bg-[#090912]/90 px-3.5 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={isGenerating}
                onClick={() => onSendMessage(prompt)}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-zinc-300 transition hover:border-violet-400/40 hover:bg-violet-500/15 hover:text-white disabled:opacity-40"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Hands-Free Controls Row */}
        <div className="mb-2 flex items-center justify-between text-[10.5px]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHandsFreeMode((v) => !v)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition ${
                handsFreeMode
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                  : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
              }`}
              title="Continuous Hands-Free Conversation: auto-listens after AI finishes speaking"
            >
              <Radio className="h-3 w-3" />
              <span>Hands-Free {handsFreeMode ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMicLang((l) => (l === 'en-US' ? 'ja-JP' : 'en-US'))}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:border-violet-400/40"
              title="Switch speech-to-text recognition language"
            >
              Mic: {micLang === 'ja-JP' ? 'JP' : 'EN'}
            </button>
          </div>
          <span className="font-mono text-[10px] text-zinc-500">
            {persona.voice.language === 'ja' ? 'Japanese (日本語)' : 'English'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <button
            type="button"
            onClick={toggleMic}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition ${
              isListening
                ? 'border-rose-400 bg-rose-600 text-white shadow-[0_0_22px_rgba(244,63,94,0.5)] animate-pulse'
                : 'border-white/10 bg-[#121220] text-zinc-300 hover:border-rose-400/50 hover:text-rose-200'
            }`}
            title="Push-to-Talk Voice Chat (🎙️ Mic Input)"
            aria-label="Push-to-Talk Microphone"
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Talk or speak (🎙️) to ${persona.name}...`}
            className="max-h-28 flex-1 resize-none rounded-2xl border border-white/10 bg-[#121220] px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-violet-400/60"
          />

          <button
            type="submit"
            disabled={!draft.trim() || isGenerating}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-glow transition hover:brightness-110 disabled:opacity-35"
            title="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
          <span className="truncate">
            {(persona.pendingSystemEvents?.length ?? 0) > 0
              ? `Queued hidden wardrobe context (${persona.pendingSystemEvents?.length})`
              : providerStatus}
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold transition ${
              connectionMode === 'live'
                ? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300'
                : connectionMode === 'error'
                ? 'border-rose-400/40 bg-rose-500/15 text-rose-300'
                : 'border-amber-400/35 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
            }`}
          >
            {connectionMode === 'live'
              ? 'Live Gemini'
              : connectionMode === 'error'
              ? 'API Error · Fix'
              : 'Demo · Add Key'}
          </button>
        </div>
      </div>
    </aside>
  );
};
