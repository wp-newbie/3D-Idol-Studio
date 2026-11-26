import React, { useEffect, useState } from 'react';
import {
  Eye,
  Footprints,
  Maximize2,
  MessageCircle,
  Monitor,
  Send,
  Settings,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { ChatMessage, DisplayInfo, Persona, RoamBehavior } from '../types/studio';
import { MOOD_META } from '../data/presets';
import { ROAM_BEHAVIOR_LABELS } from '../stage/roamController';

interface FloatingRoamBubbleProps {
  persona: Persona;
  headScreenX: number; // 0..100 viewport %
  headScreenY: number; // 0..100 viewport %
  roamBehavior: RoamBehavior;
  isDraggingAvatar: boolean;
  isHoveringAvatar: boolean;
  freeRoamEnabled: boolean;
  isGenerating: boolean;
  isSpeaking: boolean;
  bubbleRequestedAt: number;
  noticeActiveWindow: boolean;
  activePcApp: string | null;
  isDesktopApp?: boolean;
  displays?: DisplayInfo[];
  currentDisplayTarget?: number | string | 'all';
  onMoveToDisplay?: (target: number | string | 'all') => void;
  onToggleFreeRoam: () => void;
  onCommandBehavior: (behavior: RoamBehavior) => void;
  onExitRoamMode: () => void;
  onSendMessage: (text: string) => void;
  onSpeakMessage: (msg: ChatMessage) => void;
  onOpenSettings: () => void;
  onPointerHoverInteractive: (overInteractive: boolean) => void;
}

export const FloatingRoamBubble: React.FC<FloatingRoamBubbleProps> = ({
  persona,
  headScreenX,
  headScreenY,
  roamBehavior,
  isDraggingAvatar,
  isHoveringAvatar,
  freeRoamEnabled,
  isGenerating,
  isSpeaking,
  bubbleRequestedAt,
  noticeActiveWindow,
  activePcApp,
  isDesktopApp = false,
  displays,
  currentDisplayTarget,
  onMoveToDisplay,
  onToggleFreeRoam,
  onCommandBehavior: _onCommandBehavior,
  onExitRoamMode,
  onSendMessage,
  onSpeakMessage,
  onOpenSettings,
  onPointerHoverInteractive,
}) => {
  const [draft, setDraft] = useState('');
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [hoveringBubble, setHoveringBubble] = useState(false);
  const [hoveringDock, setHoveringDock] = useState(false);

  const latestAssistantMsg = [...persona.messages]
    .reverse()
    .find((m) => m.role === 'assistant');
  const moodMeta = MOOD_META[persona.mood];

  // Auto-open the compact speech bubble whenever she speaks, generates, or is clicked
  useEffect(() => {
    if (isSpeaking || isGenerating || bubbleRequestedAt > 0) {
      setBubbleVisible(true);
    }
  }, [isSpeaking, isGenerating, bubbleRequestedAt, latestAssistantMsg?.id]);

  // Keep click-through disabled whenever pointer is over any interactive widget UI
  useEffect(() => {
    onPointerHoverInteractive(hoveringBubble || hoveringDock);
  }, [hoveringBubble, hoveringDock, onPointerHoverInteractive]);

  // Cleanly anchor speech bubble beside her head, auto-flipping left/right so it never clips off screen
  const placeOnLeft = headScreenX > 55;
  const bubbleLeftPct = placeOnLeft
    ? Math.max(2, headScreenX - 30)
    : Math.min(72, headScreenX + 8);
  const bubbleTopPct = Math.max(4, Math.min(62, headScreenY - 8));

  const showQuickControls =
    isHoveringAvatar || hoveringBubble || hoveringDock || isDraggingAvatar || isSpeaking;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isGenerating) return;
    setDraft('');
    onSendMessage(trimmed);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Browser Mode Overlay & Click-Through Notice */}
      {typeof window !== 'undefined' && !window.desktopBridge && (
        <div className="pointer-events-auto fixed top-4 left-1/2 -translate-x-1/2 rounded-full border border-violet-400/30 bg-[#0b0b18]/85 px-3.5 py-1 text-[10.5px] font-medium text-violet-200/90 shadow-glass backdrop-blur-xl">
          <span>💡 OS-level desktop overlay &amp; click-through run in the Windows Electron app (<code className="text-white">npm run dev:desktop</code> / <code className="text-white">npm run build:win</code>)</span>
        </div>
      )}

      {/* Compact Visual-Novel Speech Bubble + Mini Reply Input (anchored beside her head) */}
      {bubbleVisible && !isDraggingAvatar && (
        <div
          onPointerEnter={() => setHoveringBubble(true)}
          onPointerLeave={() => setHoveringBubble(false)}
          style={{ left: `${bubbleLeftPct}%`, top: `${bubbleTopPct}%` }}
          className="pointer-events-auto fixed w-[340px] max-w-[88vw] rounded-3xl border border-white/[0.15] bg-[#0b0b15]/95 p-3.5 shadow-glass backdrop-blur-2xl transition-all duration-200"
        >
          {/* Header: Name + Mood + Replay Voice + Collapse */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: persona.accentColor }}
              />
              <span className="truncate font-display text-xs font-bold text-white">
                {persona.name}
              </span>
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold ${moodMeta.badgeClass}`}
              >
                {moodMeta.label}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {latestAssistantMsg?.spokenText && (
                <button
                  type="button"
                  onClick={() => onSpeakMessage(latestAssistantMsg)}
                  className="rounded-lg border border-white/10 bg-white/5 p-1 text-violet-200 hover:bg-violet-500/25"
                  title="Replay voice"
                >
                  <Volume2 className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setHoveringDock(false);
                  setHoveringBubble(false);
                  onExitRoamMode();
                }}
                className="flex items-center gap-1 rounded-lg border border-violet-400/50 bg-gradient-to-r from-violet-600/85 to-fuchsia-600/85 px-2 py-1 text-[10px] font-semibold text-white shadow-sm transition hover:brightness-115"
                title="Resume Full Studio Mode"
              >
                <Maximize2 className="h-3 w-3" />
                <span>Full Studio</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBubbleVisible(false);
                  setHoveringBubble(false);
                }}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                title="Hide speech bubble (click her anytime to reopen)"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Latest Dialogue */}
          {isGenerating ? (
            <div className="flex items-center gap-2 py-1.5 text-xs text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 animate-spin text-violet-400" />
              <span>{persona.name} is thinking...</span>
            </div>
          ) : latestAssistantMsg ? (
            <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
              {latestAssistantMsg.segments.map((seg, i) => {
                if (seg.kind === 'action') {
                  return (
                    <p key={i} className="text-[10.5px] italic text-zinc-400">
                      *{seg.text}*
                    </p>
                  );
                }
                if (seg.kind === 'dialogue') {
                  return (
                    <p
                      key={i}
                      className="rounded-xl border-l-2 bg-white/[0.05] px-2.5 py-1.5 text-[12.5px] font-medium leading-snug text-white"
                      style={{ borderLeftColor: persona.accentColor }}
                    >
                      “{seg.text}”
                    </p>
                  );
                }
                return (
                  <div
                    key={i}
                    className="flex items-start gap-1 rounded-lg border border-violet-500/25 bg-violet-950/30 px-2 py-1 text-[10.5px] text-violet-200"
                  >
                    <span className="shrink-0 rounded bg-violet-500/35 px-1 font-mono text-[8.5px] font-bold text-violet-300">
                      EN
                    </span>
                    <span className="leading-tight">{seg.text}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Mini Reply Input */}
          <form onSubmit={handleSubmit} className="mt-2.5 flex items-center gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Reply to ${persona.name}...`}
              className="flex-1 rounded-xl border border-white/10 bg-[#121220]/95 px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-400"
            />
            <button
              type="submit"
              disabled={!draft.trim() || isGenerating}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white hover:brightness-110 disabled:opacity-35"
              title="Send"
            >
              <Send className="h-3 w-3" />
            </button>
          </form>

          {/* Subtle behavior footer inside bubble */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-white/[0.08] pt-2 text-[10px] text-zinc-400">
            <span className="truncate">
              {ROAM_BEHAVIOR_LABELS[roamBehavior] || roamBehavior} · Drag her to move!
            </span>
            <div className="flex items-center gap-1">
              {isDesktopApp && displays && displays.length > 1 && onMoveToDisplay && (
                <div className="flex items-center gap-0.5 rounded-lg border border-sky-400/30 bg-sky-950/60 p-0.5">
                  <Monitor className="mx-1 h-2.5 w-2.5 text-sky-300" />
                  {displays.map((disp, i) => {
                    const isSelected =
                      currentDisplayTarget === disp.id ||
                      (currentDisplayTarget === 'primary' && disp.isPrimary);
                    return (
                      <button
                        key={disp.id}
                        type="button"
                        onClick={() => onMoveToDisplay(disp.id)}
                        className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold transition ${
                          isSelected
                            ? 'bg-sky-500/40 text-sky-100'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        title={`Move to ${disp.label}`}
                      >
                        M{i + 1}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => onMoveToDisplay('all')}
                    className={`rounded px-1.5 py-0.5 text-[9.5px] font-semibold transition ${
                      currentDisplayTarget === 'all'
                        ? 'bg-sky-500/40 text-sky-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Span All Monitors"
                  >
                    All
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setHoveringDock(false);
                  setHoveringBubble(false);
                  onExitRoamMode();
                }}
                className="flex items-center gap-1 rounded-lg border border-violet-400/50 bg-violet-500/25 px-2 py-1 text-[10px] font-semibold text-violet-100 transition hover:bg-violet-500/40 hover:text-white"
                title="Resume Full Widescreen Studio Mode"
              >
                <Maximize2 className="h-3 w-3" />
                <span>Resume Full Studio</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Floating Dock Pill (Bottom-Right): Always reachable to Expand to Full Studio (⤢) */}
      <div
        onPointerEnter={() => setHoveringDock(true)}
        onPointerLeave={() => setHoveringDock(false)}
        className={`pointer-events-auto fixed bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0b0b15]/90 px-2.5 py-1.5 text-xs text-zinc-100 shadow-glass backdrop-blur-2xl transition-opacity duration-300 ${
          showQuickControls ? 'opacity-100' : 'opacity-85 hover:opacity-100'
        }`}
      >
        {!bubbleVisible && (
          <button
            type="button"
            onClick={() => setBubbleVisible(true)}
            className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10.5px] font-medium text-violet-200 hover:bg-violet-500/30"
            title="Show floating speech bubble"
          >
            <MessageCircle className="h-3 w-3" />
            <span>Chat</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleFreeRoam}
          className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-semibold transition ${
            freeRoamEnabled
              ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-200'
              : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Toggle autonomous taskbar strolling & screen roaming"
        >
          <Footprints className="h-3 w-3" />
          <span>{freeRoamEnabled ? 'Roam ON' : 'Roam OFF'}</span>
        </button>

        {noticeActiveWindow && (
          <span
            className="flex items-center gap-1 rounded-full border border-cyan-400/35 bg-cyan-950/60 px-2 py-0.5 font-mono text-[9.5px] text-cyan-200"
            title="Active Window Awareness enabled"
          >
            <Eye className="h-3 w-3" />
            <span className="max-w-[80px] truncate">{activePcApp || 'PC'}</span>
          </span>
        )}

        {isDesktopApp && displays && displays.length > 1 && onMoveToDisplay && (
          <div
            className="flex items-center gap-0.5 rounded-full border border-sky-400/30 bg-sky-950/60 p-0.5"
            title="Multi-Monitor Display Switcher"
          >
            <Monitor className="mx-1 h-3 w-3 text-sky-300" />
            {displays.map((disp, i) => {
              const isSelected =
                currentDisplayTarget === disp.id ||
                (currentDisplayTarget === 'primary' && disp.isPrimary);
              return (
                <button
                  key={disp.id}
                  type="button"
                  onClick={() => onMoveToDisplay(disp.id)}
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition ${
                    isSelected
                      ? 'bg-sky-500/40 text-sky-100 ring-1 ring-sky-400/60 shadow-sm'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                  }`}
                  title={`Move character to ${disp.label} (${disp.bounds.width}x${disp.bounds.height} at X=${disp.bounds.x})`}
                >
                  M{i + 1}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onMoveToDisplay('all')}
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition ${
                currentDisplayTarget === 'all'
                  ? 'bg-sky-500/40 text-sky-100 ring-1 ring-sky-400/60 shadow-sm'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
              title="Span Across All Monitors (Walk freely across all screens)"
            >
              All
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          className="rounded-full p-1 text-zinc-300 hover:bg-white/10 hover:text-white"
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setHoveringDock(false);
            setHoveringBubble(false);
            onExitRoamMode();
          }}
          className="flex items-center gap-1.5 rounded-full border border-violet-400/50 bg-gradient-to-r from-violet-600/80 to-fuchsia-600/80 px-3 py-1 text-[11px] font-semibold text-white shadow-glow transition hover:brightness-115"
          title="Restore Full Widescreen Studio (Wardrobe, Persona Builder & 3D Environments)"
        >
          <Maximize2 className="h-3 w-3" />
          <span>⤢ Expand to Full Studio</span>
        </button>
      </div>
    </div>
  );
};
