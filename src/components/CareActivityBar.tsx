import React, { useState } from 'react';
import {
  Activity,
  Brain,
  Coffee,
  Heart,
  Moon,
  Sparkles,
  Utensils,
  X,
  Zap,
} from 'lucide-react';
import type { Persona } from '../types/studio';

export interface CareActivityBarProps {
  persona: Persona;
  isSleeping: boolean;
  isGenerating: boolean;
  onResumeStudio?: () => void;
}

export const CareActivityBar: React.FC<CareActivityBarProps> = ({
  persona,
  isSleeping,
  isGenerating: _isGenerating,
  onResumeStudio: _onResumeStudio,
}) => {
  const [openVitals, setOpenVitals] = useState(false);

  const brain = persona.brain || {
    hunger: 20,
    sleepiness: 15,
    energy: 85,
    comfort: 80,
    boredom: 20,
    curiosity: 60,
  };

  // Derive her live AI-driven self-care status description
  const getAiCareStatus = () => {
    if (isSleeping || brain.isSleeping) {
      return {
        icon: <Moon className="h-3.5 w-3.5 text-indigo-300 animate-pulse" />,
        label: '💤 Resting Peacefully',
        sub: 'Restoring energy autonomously',
        badgeClass: 'border-indigo-400/40 bg-indigo-500/20 text-indigo-200',
      };
    }
    if (brain.hunger > 75) {
      return {
        icon: <Utensils className="h-3.5 w-3.5 text-amber-300" />,
        label: '🍱 Autonomously Snacking',
        sub: 'Grabbed tea & snack on her own',
        badgeClass: 'border-amber-400/40 bg-amber-500/20 text-amber-200',
      };
    }
    if (brain.comfort < 40) {
      return {
        icon: <Sparkles className="h-3.5 w-3.5 text-rose-300" />,
        label: '🧣 Cozy Warmth Active',
        sub: 'Wrapped in her blanket',
        badgeClass: 'border-rose-400/40 bg-rose-500/20 text-rose-200',
      };
    }
    if (brain.boredom > 70) {
      return {
        icon: <Heart className="h-3.5 w-3.5 text-fuchsia-300" />,
        label: '🎶 Humming & Playful',
        sub: 'Self-initiated music break',
        badgeClass: 'border-fuchsia-400/40 bg-fuchsia-500/20 text-fuchsia-200',
      };
    }
    return {
      icon: <Coffee className="h-3.5 w-3.5 text-emerald-300" />,
      label: '✨ Fully Energized & Happy',
      sub: 'Circadian needs satisfied',
      badgeClass: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200',
    };
  };

  const status = getAiCareStatus();

  return (
    <div className="absolute bottom-16 right-5 z-20 flex flex-col items-end gap-2">
      {/* Expanded AI Autonomous Wellbeing & Vitals Popover */}
      {openVitals && (
        <div className="w-80 rounded-3xl border border-white/[0.14] bg-[#0b0b15]/95 p-3.5 shadow-glass backdrop-blur-2xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <div className="flex items-center gap-1.5 min-w-0">
              <Brain className="h-4 w-4 text-violet-400 shrink-0" />
              <div className="min-w-0">
                <span className="truncate text-xs font-bold text-white block">
                  {persona.name}'s Wellbeing
                </span>
                <span className="text-[10px] text-zinc-400">
                  Fully AI-driven · Circadian &amp; Emotional Clock
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenVitals(false)}
              className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Current Autonomous Self-Care Vibe */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">{status.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-zinc-100">{status.label}</div>
                <div className="text-[10px] text-zinc-400">{status.sub}</div>
              </div>
              <span className="rounded-full border border-violet-400/35 bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold text-violet-200">
                AI Driven
              </span>
            </div>
            {brain.currentThought && (
              <p className="mt-2 border-t border-white/[0.06] pt-1.5 text-[10px] italic text-zinc-300">
                "{brain.currentThought}"
              </p>
            )}
          </div>

          {/* Autonomous Vital Needs Dashboard */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="flex items-center gap-1 text-zinc-400">
                <Zap className="h-3 w-3 text-amber-300" />
                Energy
              </span>
              <span className="font-mono text-zinc-200">{Math.round(brain.energy)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, brain.energy))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10.5px]">
              <span className="flex items-center gap-1 text-zinc-400">
                <Utensils className="h-3 w-3 text-emerald-300" />
                Satiety (Fullness)
              </span>
              <span className="font-mono text-zinc-200">{Math.round(100 - brain.hunger)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, 100 - brain.hunger))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10.5px]">
              <span className="flex items-center gap-1 text-zinc-400">
                <Moon className="h-3 w-3 text-indigo-300" />
                Restfulness
              </span>
              <span className="font-mono text-zinc-200">{Math.round(100 - brain.sleepiness)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-300 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, 100 - brain.sleepiness))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10.5px]">
              <span className="flex items-center gap-1 text-zinc-400">
                <Sparkles className="h-3 w-3 text-rose-300" />
                Comfort &amp; Warmth
              </span>
              <span className="font-mono text-zinc-200">{Math.round(brain.comfort)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-400 to-pink-300 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, brain.comfort))}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-2 text-[9.5px] leading-relaxed text-zinc-400">
            💡 {persona.name} naturally initiates snacks, takes restful naps, hums, and gets cozy
            on her own based on how she feels.
          </div>
        </div>
      )}

      {/* Autonomous AI Care & Wellbeing Pill Bar */}
      <button
        type="button"
        onClick={() => setOpenVitals((v) => !v)}
        className="flex items-center gap-2 rounded-2xl border border-white/15 bg-[#0b0b15]/90 px-3 py-1.5 shadow-glass backdrop-blur-2xl transition hover:border-violet-400/40 hover:bg-[#121225]"
        title="View Autonomous AI Character Care & Circadian Wellbeing"
      >
        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-200">
          <Activity className="h-3.5 w-3.5 text-amber-300 animate-pulse" />
          <span>Care · AI Driven</span>
        </span>

        <span
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${status.badgeClass}`}
        >
          {status.icon}
          <span>{status.label}</span>
        </span>
      </button>
    </div>
  );
};
