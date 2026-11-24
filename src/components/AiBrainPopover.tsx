import React from 'react';
import { BookOpen, Brain, Clock, Eye, EyeOff, Footprints, Sparkles, X, Zap } from 'lucide-react';
import type { AutonomousNeedTrigger, Persona, RoamBehavior } from '../types/studio';
import { getAffinityTier, MOOD_META } from '../data/presets';
import { ROAM_BEHAVIOR_LABELS } from '../stage/roamController';
import { getCircadianContext, getStageClimate } from '../services/aiBrainService';

interface AiBrainPopoverProps {
  persona: Persona;
  roamBehavior: RoamBehavior;
  autoRoamEnabled: boolean;
  showThoughtHud: boolean;
  isGenerating: boolean;
  onToggleAutoRoam: () => void;
  onToggleThoughtHud: () => void;
  onTriggerBrainImpulse: (reason: AutonomousNeedTrigger) => void;
  onOpenMemoryJournal: () => void;
  onClose: () => void;
}

const MeterRow: React.FC<{
  label: string;
  value: number;
  barClass: string;
  badge?: string;
}> = ({ label, value, barClass, badge }) => {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-zinc-300">{label}</span>
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-200">
              {badge}
            </span>
          )}
          <span className="font-mono text-[11px] text-zinc-200">{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const AiBrainPopover: React.FC<AiBrainPopoverProps> = ({
  persona,
  roamBehavior,
  autoRoamEnabled,
  showThoughtHud,
  isGenerating,
  onToggleAutoRoam,
  onToggleThoughtHud,
  onTriggerBrainImpulse,
  onOpenMemoryJournal,
  onClose,
}) => {
  const moodMeta = MOOD_META[persona.mood];
  const affinityTier = getAffinityTier(persona.affinity);
  const intensityPct = Math.round((persona.emotionIntensity ?? 0.7) * 100);
  const brain = persona.brain;
  const circadian = getCircadianContext();
  const climate = getStageClimate(persona.stageEnvironment);
  const recentThoughts = [...(brain?.thoughtStream || [])].reverse().slice(0, 5);

  const highestNeedTrigger: AutonomousNeedTrigger =
    brain.sleepiness >= 70
      ? 'sleepiness'
      : brain.hunger >= 70
      ? 'hunger'
      : brain.comfort <= 35
      ? 'comfort'
      : 'boredom';

  return (
    <div className="absolute right-4 top-16 z-30 max-h-[calc(100%-5.5rem)] w-[352px] max-w-[92vw] overflow-y-auto rounded-3xl border border-white/[0.12] bg-[#0b0b15]/95 p-4 shadow-glass backdrop-blur-2xl space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-500/20 text-violet-300">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">🧠 AI Brain &amp; Human Needs</div>
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <Clock className="h-2.5 w-2.5 text-amber-300" />
              <span>
                {circadian.phaseEmoji} {circadian.phaseLabel} · {circadian.clockText}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          title="Close AI Brain Inspector"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Emotion Vector + Nuanced Feeling + Auto-Roam */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">
            Emotion &amp; Feeling
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${moodMeta.dotClass}`} />
            <span className="truncate text-xs font-semibold text-white">{moodMeta.label}</span>
            <span className="ml-auto font-mono text-[10.5px] text-violet-300">
              {intensityPct}%
            </span>
          </div>
          <div className="mt-1 truncate text-[10px] text-pink-200/90">
            {brain.nuancedFeeling}
          </div>
          {brain.carryover && brain.carryover.turnsRemaining > 0 && (
            <div className="mt-1 inline-block rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-medium text-rose-200">
              Carryover · {brain.carryover.turnsRemaining} turns
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400">
              Auto-Roam
            </span>
            <button
              type="button"
              onClick={onToggleAutoRoam}
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold transition ${
                autoRoamEnabled
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-white/10 text-zinc-400'
              }`}
            >
              {autoRoamEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-zinc-100">
            <Footprints className="h-3 w-3 shrink-0 text-emerald-300" />
            <span className="truncate">
              {brain.isSleeping
                ? 'Dozing Peacefully'
                : ROAM_BEHAVIOR_LABELS[roamBehavior] || roamBehavior}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[9.5px] text-zinc-500">
            Stage: {climate.label}
          </div>
        </div>
      </div>

      {/* Live Human Needs & Circadian Gauges */}
      <div className="space-y-2 rounded-2xl border border-white/10 bg-[#080812]/90 p-3">
        <MeterRow
          label="🍱 Hunger & Cravings"
          value={brain.hunger}
          barClass={
            brain.hunger > 70
              ? 'bg-gradient-to-r from-amber-500 to-rose-500'
              : 'bg-gradient-to-r from-amber-400 to-orange-400'
          }
          badge={
            brain.hunger > 70
              ? 'Hungry!'
              : circadian.mealWindow
              ? 'Meal window'
              : undefined
          }
        />
        <MeterRow
          label="😴 Sleepiness & Fatigue"
          value={brain.sleepiness}
          barClass={
            brain.sleepiness > 70
              ? 'bg-gradient-to-r from-indigo-500 to-purple-500'
              : 'bg-gradient-to-r from-indigo-400 to-sky-400'
          }
          badge={
            brain.isSleeping
              ? 'Resting 💤'
              : brain.sleepiness > 70
              ? 'Drowsy'
              : undefined
          }
        />
        <MeterRow
          label="🥱 Boredom & Restlessness"
          value={brain.boredom}
          barClass={
            brain.boredom > 65
              ? 'bg-gradient-to-r from-amber-500 to-rose-500'
              : 'bg-gradient-to-r from-violet-500 to-fuchsia-400'
          }
          badge={brain.boredom > 65 ? 'Restless' : undefined}
        />
        <MeterRow
          label="🧣 Comfort & Warmth"
          value={brain.comfort}
          barClass={
            brain.comfort < 35
              ? 'bg-gradient-to-r from-sky-400 to-cyan-300'
              : 'bg-gradient-to-r from-rose-400 to-amber-300'
          }
          badge={brain.comfort < 35 ? 'Chilly!' : brain.comfort > 80 ? 'Cozy' : undefined}
        />
        <MeterRow
          label="⚡ Energy"
          value={brain.energy}
          barClass="bg-gradient-to-r from-emerald-500 to-cyan-400"
        />
        <MeterRow
          label={`❄️→🌸 Affection (${affinityTier.label})`}
          value={persona.affinity}
          barClass="bg-gradient-to-r from-sky-400 via-violet-400 to-pink-400"
        />
      </div>

      {/* Short-Term Thought Stream */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            💭 Short-Term Thought Stream
          </span>
          <button
            type="button"
            onClick={onToggleThoughtHud}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-white/10 hover:text-white"
            title="Toggle Inner Thought HUD pill on 3D stage"
          >
            {showThoughtHud ? (
              <>
                <Eye className="h-3 w-3 text-violet-300" />
                <span>HUD ON</span>
              </>
            ) : (
              <>
                <EyeOff className="h-3 w-3 text-zinc-500" />
                <span>HUD OFF</span>
              </>
            )}
          </button>
        </div>

        <div className="max-h-28 space-y-1.5 overflow-y-auto pr-1">
          {recentThoughts.length > 0 ? (
            recentThoughts.map((th, idx) => (
              <div
                key={th.id}
                className={`rounded-xl border px-2.5 py-1.5 text-[11px] leading-snug ${
                  idx === 0
                    ? 'border-violet-400/35 bg-violet-500/15 text-violet-100'
                    : 'border-white/[0.06] bg-white/[0.02] text-zinc-400'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[9.5px] uppercase tracking-wider opacity-70">
                  <span>{th.trigger}</span>
                  <span>
                    {new Date(th.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-0.5 italic">“{th.text}”</p>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px] italic text-zinc-400">
              “{brain.currentThought}”
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          disabled={isGenerating}
          onClick={() => onTriggerBrainImpulse(highestNeedTrigger)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-[11px] font-semibold text-white shadow-glow transition hover:brightness-110 disabled:opacity-45"
          title="Manually trigger a spontaneous need-driven autonomous action right now"
        >
          {isGenerating ? (
            <Sparkles className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          <span>Trigger Autonomous Action</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenMemoryJournal();
          }}
          className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[11px] font-medium text-zinc-200 transition hover:bg-white/10"
          title="Open Long-Term Core Memory Journal"
        >
          <BookOpen className="h-3.5 w-3.5 text-pink-300" />
          <span>{persona.memoryJournal.length}</span>
        </button>
      </div>
    </div>
  );
};
