import React, { useState } from 'react';
import { Coffee, Gamepad2, Moon, Sparkles, Sun, Utensils, X } from 'lucide-react';
import type { CareActivityId } from '../types/studio';

interface CareActivityBarProps {
  isSleeping: boolean;
  isGenerating: boolean;
  onTriggerCare: (activity: CareActivityId) => void;
}

type CareMenu = 'none' | 'snacks' | 'hangout';

const SNACK_OPTIONS: { id: CareActivityId; emoji: string; label: string; hint: string }[] = [
  { id: 'snack_tea', emoji: '☕', label: 'Warm Tea / Coffee', hint: '-30% Hunger · +Warmth' },
  { id: 'snack_cake', emoji: '🍰', label: 'Strawberry Cake / Pastry', hint: '-45% Hunger · +3 🌸' },
  { id: 'snack_ramen', emoji: '🍜', label: 'Hot Ramen / Meal', hint: '-75% Hunger · +Energy' },
  { id: 'snack_midnight', emoji: '🍙', label: 'Midnight Snack', hint: '-40% Hunger · Cozy' },
];

const HANGOUT_OPTIONS: { id: CareActivityId; emoji: string; label: string; hint: string }[] = [
  { id: 'entertain_hum', emoji: '🎶', label: 'Hum a Song Together', hint: '0% Boredom · Warm' },
  { id: 'entertain_rps', emoji: '✌️', label: 'Play Rock-Paper-Scissors', hint: '0% Boredom · Playful' },
  { id: 'entertain_story', emoji: '📖', label: 'Tell a Story / Memory', hint: '0% Boredom · Nostalgic' },
  { id: 'entertain_music', emoji: '🎵', label: 'Change Stage Music', hint: 'Opens Idol Stage Audio' },
];

export const CareActivityBar: React.FC<CareActivityBarProps> = ({
  isSleeping,
  isGenerating,
  onTriggerCare,
}) => {
  const [openMenu, setOpenMenu] = useState<CareMenu>('none');

  const pick = (id: CareActivityId) => {
    setOpenMenu('none');
    onTriggerCare(id);
  };

  return (
    <div className="absolute bottom-16 right-5 z-20 flex flex-col items-end gap-2">
      {/* Sub-Menu Popover (Snacks or Hang Out) */}
      {openMenu !== 'none' && (
        <div className="w-64 rounded-2xl border border-white/[0.14] bg-[#0b0b15]/95 p-2.5 shadow-glass backdrop-blur-2xl space-y-1.5">
          <div className="flex items-center justify-between px-1 pb-1 border-b border-white/[0.08]">
            <span className="text-[11px] font-bold text-white">
              {openMenu === 'snacks' ? '🍱 Give Snack / Drink' : '🎮 Entertain & Hang Out'}
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              className="rounded-lg p-0.5 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {(openMenu === 'snacks' ? SNACK_OPTIONS : HANGOUT_OPTIONS).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={isGenerating}
              onClick={() => pick(opt.id)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-violet-400/45 hover:bg-violet-500/15 disabled:opacity-45"
            >
              <span className="text-base">{opt.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-zinc-100">
                  {opt.label}
                </div>
                <div className="truncate text-[9.5px] text-zinc-400">{opt.hint}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Compact Floating Care & Activities Pill Bar (☕) */}
      <div className="flex items-center gap-1 rounded-2xl border border-white/15 bg-[#0b0b15]/90 p-1.5 shadow-glass backdrop-blur-2xl">
        <span className="flex items-center gap-1 pl-1.5 pr-1 text-[10.5px] font-semibold text-amber-200/90">
          <Coffee className="h-3.5 w-3.5 text-amber-300" />
          <span className="hidden xl:inline">Care</span>
        </span>

        <button
          type="button"
          disabled={isGenerating}
          onClick={() => setOpenMenu((m) => (m === 'snacks' ? 'none' : 'snacks'))}
          className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-medium transition ${
            openMenu === 'snacks'
              ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/45'
              : 'text-zinc-200 hover:bg-white/10'
          }`}
          title="Give Snack or Warm Drink (🍱)"
        >
          <Utensils className="h-3 w-3 text-amber-300" />
          <span>🍱 Snack</span>
        </button>

        <button
          type="button"
          disabled={isGenerating}
          onClick={() => pick(isSleeping ? 'wake_up' : 'rest_nap')}
          className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-medium transition ${
            isSleeping
              ? 'bg-indigo-500/30 text-indigo-100 ring-1 ring-indigo-400/50'
              : 'text-zinc-200 hover:bg-white/10'
          }`}
          title={
            isSleeping
              ? 'Wake her gently from her nap'
              : 'Let her rest / doze peacefully on stage (💤)'
          }
        >
          {isSleeping ? (
            <>
              <Sun className="h-3 w-3 text-amber-300" />
              <span>Wake</span>
            </>
          ) : (
            <>
              <Moon className="h-3 w-3 text-indigo-300" />
              <span>💤 Rest</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isGenerating}
          onClick={() => setOpenMenu((m) => (m === 'hangout' ? 'none' : 'hangout'))}
          className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-medium transition ${
            openMenu === 'hangout'
              ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/45'
              : 'text-zinc-200 hover:bg-white/10'
          }`}
          title="Entertain / Hang Out (🎮)"
        >
          <Gamepad2 className="h-3 w-3 text-violet-300" />
          <span>🎮 Hang Out</span>
        </button>

        <button
          type="button"
          disabled={isGenerating}
          onClick={() => pick('comfort_blanket')}
          className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:bg-rose-500/20 hover:text-rose-100 disabled:opacity-45"
          title="Drape Warm Blanket & Cozy Light (🧣)"
        >
          <Sparkles className="h-3 w-3 text-rose-300" />
          <span>🧣 Cozy</span>
        </button>
      </div>
    </div>
  );
};
