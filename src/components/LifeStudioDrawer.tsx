import React from 'react';
import {
  Compass,
  Droplets,
  Dumbbell,
  GraduationCap,
  Loader2,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import type {
  ActiveLifeScene,
  DestinationKindId,
  FoodVisualId,
  HobbyKindId,
  Persona,
} from '../types/studio';
import {
  AI_CHAIR_STYLE_META,
  DESTINATION_KIND_META,
  FOOD_VISUAL_META,
  HOBBY_KIND_META,
} from '../stage/lifePropsRig';
import {
  type HygieneRoutineId,
  type SchoolLevel,
} from '../services/aiLifePlanner';
import { getCircadianContext } from '../services/aiBrainService';

interface LifeStudioDrawerProps {
  isOpen: boolean;
  persona: Persona;
  lifeScene: ActiveLifeScene;
  isBusy: boolean;
  autoLifeByMood?: boolean;
  onToggleAutoLifeByMood?: (next: boolean) => void;
  onClose: () => void;
  onFollowWhim: () => void;
  onPlanFood?: (prompt?: string, withKitchen?: boolean) => void;
  onQuickFood?: (foodVisual: FoodVisualId, withKitchen: boolean) => void;
  onClearDining: () => void;
  onPlanHobby?: (prompt?: string) => void;
  onQuickHobby?: (hobbyKind: HobbyKindId) => void;
  onClearHobby: () => void;
  onStartSchoolStudy?: (level?: SchoolLevel, subjectPrompt?: string, autoUniform?: boolean) => void;
  onLeaveSchool: () => void;
  onStartHygiene?: (routine?: HygieneRoutineId, hint?: string, autoRefreshClothes?: boolean) => void;
  onLeaveBathroom: () => void;
  onPlanDestination?: (prompt?: string, alsoDress?: boolean) => void;
  onQuickDestination?: (destKind: Exclude<DestinationKindId, 'none'>, alsoDress: boolean) => void;
  onClearDestination: () => void;
}

export const LifeStudioDrawer: React.FC<LifeStudioDrawerProps> = ({
  isOpen,
  persona,
  lifeScene,
  isBusy,
  autoLifeByMood = true,
  onToggleAutoLifeByMood,
  onClose,
  onFollowWhim,
  onClearDining,
  onClearHobby,
  onLeaveSchool,
  onLeaveBathroom,
  onClearDestination,
}) => {
  if (!isOpen) return null;

  const circadian = getCircadianContext();
  const isDining = Boolean(lifeScene.dining);
  const isStudying = lifeScene.hobby?.hobbyKind === 'studying';
  const isBathing =
    lifeScene.hobby?.hobbyKind === 'showering' ||
    lifeScene.hobby?.hobbyKind === 'towel_dry' ||
    lifeScene.hobby?.hobbyKind === 'brushing_teeth';
  const isGymSport =
    lifeScene.hobby?.hobbyKind === 'gym_weights' ||
    lifeScene.hobby?.hobbyKind === 'gym_treadmill' ||
    lifeScene.hobby?.hobbyKind === 'sports_basketball' ||
    lifeScene.hobby?.hobbyKind === 'sports_tennis' ||
    lifeScene.hobby?.hobbyKind === 'stretching' ||
    lifeScene.destination?.destinationKind === 'gym_studio' ||
    lifeScene.destination?.destinationKind === 'sports_court';
  const isRegularHobby = Boolean(lifeScene.hobby) && !isStudying && !isBathing && !isGymSport;
  const isTraveling =
    Boolean(lifeScene.destination) &&
    lifeScene.destination?.destinationKind !== 'none' &&
    lifeScene.destination?.destinationKind !== 'highschool_classroom' &&
    lifeScene.destination?.destinationKind !== 'college_campus' &&
    lifeScene.destination?.destinationKind !== 'bathroom_spa' &&
    lifeScene.destination?.destinationKind !== 'gym_studio' &&
    lifeScene.destination?.destinationKind !== 'sports_court';

  const hasAnyScene =
    isDining ||
    Boolean(lifeScene.hobby) ||
    (Boolean(lifeScene.destination) && lifeScene.destination?.destinationKind !== 'none');

  const handleResetAll = () => {
    onClearDining();
    onClearHobby();
    onLeaveSchool();
    onLeaveBathroom();
    onClearDestination();
  };

  return (
    <aside className="absolute right-3 top-3 bottom-3 z-30 flex w-[375px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#0c0c19]/95 shadow-2xl backdrop-blur-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-emerald-950/45 via-violet-950/40 to-amber-950/35 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <span>🌍</span>
            <span>{persona.name}&apos;s Autonomous Life</span>
          </div>
          <p className="text-[10.5px] text-zinc-400">
            AI-only free will — {persona.name} chooses her own life via LM Studio
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-zinc-300 transition hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Free-Will Controls & Read-Only AI Activity Indicators */}
      <div className="border-b border-white/[0.08] px-4 py-3 space-y-2.5">
        <button
          type="button"
          disabled={isBusy}
          onClick={onFollowWhim}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-fuchsia-600 to-violet-600 px-3 py-2.5 text-xs font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-45"
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>
            {isBusy
              ? `${persona.name} is deciding for herself...`
              : `🎲 Let ${persona.name} Decide What She Wants to Do!`}
          </span>
        </button>

        {/* Read-Only Status Indicators (Non-Clickable — Only the AI character decides!) */}
        <div
          className="grid grid-cols-6 gap-1 pt-0.5 text-[9.5px] font-semibold select-none pointer-events-none"
          aria-label="AI autonomous activity status indicators"
        >
          <div
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2 transition ${
              isDining
                ? 'border-amber-400/65 bg-amber-500/25 text-amber-100 shadow-sm'
                : 'border-white/[0.07] bg-white/[0.02] text-zinc-500'
            }`}
          >
            <UtensilsCrossed className={`h-3.5 w-3.5 ${isDining ? 'text-amber-300' : 'text-zinc-500'}`} />
            <span>Food</span>
          </div>

          <div
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2 transition ${
              isRegularHobby
                ? 'border-fuchsia-400/65 bg-fuchsia-500/25 text-fuchsia-100 shadow-sm'
                : 'border-white/[0.07] bg-white/[0.02] text-zinc-500'
            }`}
          >
            <Palette className={`h-3.5 w-3.5 ${isRegularHobby ? 'text-fuchsia-300' : 'text-zinc-500'}`} />
            <span>Hobby</span>
          </div>

          <div
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2 transition ${
              isStudying
                ? 'border-blue-400/65 bg-blue-500/25 text-blue-100 shadow-sm'
                : 'border-white/[0.07] bg-white/[0.02] text-zinc-500'
            }`}
          >
            <GraduationCap className={`h-3.5 w-3.5 ${isStudying ? 'text-blue-300' : 'text-zinc-500'}`} />
            <span>School</span>
          </div>

          <div
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2 transition ${
              isBathing
                ? 'border-sky-400/65 bg-sky-500/25 text-sky-100 shadow-sm'
                : 'border-white/[0.07] bg-white/[0.02] text-zinc-500'
            }`}
          >
            <Droplets className={`h-3.5 w-3.5 ${isBathing ? 'text-sky-300' : 'text-zinc-500'}`} />
            <span>Bath</span>
          </div>

          <div
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2 transition ${
              isGymSport
                ? 'border-emerald-400/65 bg-emerald-500/25 text-emerald-100 shadow-sm'
                : 'border-white/[0.07] bg-white/[0.02] text-zinc-500'
            }`}
          >
            <Dumbbell className={`h-3.5 w-3.5 ${isGymSport ? 'text-emerald-300' : 'text-zinc-500'}`} />
            <span>Gym</span>
          </div>

          <div
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2 transition ${
              isTraveling
                ? 'border-cyan-400/65 bg-cyan-500/25 text-cyan-100 shadow-sm'
                : 'border-white/[0.07] bg-white/[0.02] text-zinc-500'
            }`}
          >
            <Compass className={`h-3.5 w-3.5 ${isTraveling ? 'text-cyan-300' : 'text-zinc-500'}`} />
            <span>Places</span>
          </div>
        </div>

        {/* Automatic Mood-Driven Living Toggle */}
        {onToggleAutoLifeByMood && (
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-950/20 px-2.5 py-1.5 text-[10.5px] text-emerald-100">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  autoLifeByMood ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                }`}
              />
              <span>Auto-do activities based on her mood &amp; needs</span>
            </span>
            <input
              type="checkbox"
              checked={autoLifeByMood}
              onChange={(e) => onToggleAutoLifeByMood(e.target.checked)}
              className="h-3.5 w-3.5 accent-emerald-400"
            />
          </label>
        )}
      </div>

      {/* Live Autonomous State & Choices Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Companion Context Driving Her Choices */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-zinc-200">🧠 What Guides Her Choices</span>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 font-mono text-[9.5px] text-amber-200">
              {circadian.phaseEmoji} {circadian.clockText} · {circadian.phaseLabel}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
            <div className="rounded-lg bg-[#111120] px-2.5 py-1.5 flex items-center justify-between">
              <span className="text-zinc-400">Mood</span>
              <span className="font-semibold text-fuchsia-200">{persona.mood}</span>
            </div>
            <div className="rounded-lg bg-[#111120] px-2.5 py-1.5 flex items-center justify-between">
              <span className="text-zinc-400">Hunger</span>
              <span className="font-semibold text-amber-200">
                {Math.round(persona.brain?.hunger ?? 45)}%
              </span>
            </div>
            <div className="rounded-lg bg-[#111120] px-2.5 py-1.5 flex items-center justify-between">
              <span className="text-zinc-400">Boredom</span>
              <span className="font-semibold text-cyan-200">
                {Math.round(persona.brain?.boredom ?? 35)}%
              </span>
            </div>
            <div className="rounded-lg bg-[#111120] px-2.5 py-1.5 flex items-center justify-between">
              <span className="text-zinc-400">Comfort</span>
              <span className="font-semibold text-emerald-200">
                {Math.round(persona.brain?.comfort ?? 75)}%
              </span>
            </div>
          </div>
        </div>

        {/* Active Choices Made by the AI Character */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              What {persona.name} Chose Right Now
            </span>
            {hasAnyScene && (
              <button
                type="button"
                onClick={handleResetAll}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-zinc-300 transition hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-rose-200"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Return to Studio</span>
              </button>
            )}
          </div>

          {!hasAnyScene && (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-center space-y-1.5">
              <div className="text-lg">✨</div>
              <div className="text-xs font-semibold text-zinc-200">
                {persona.name} is deciding on her own
              </div>
              <p className="text-[10.5px] text-zinc-400">
                The 5 tiles above are live status indicators only. {persona.name} automatically picks her own meals, hobbies, school study, censored bath care, or trips based on her mood—or press the button above to let her decide right now!
              </p>
            </div>
          )}

          {lifeScene.dining && (
            <div className="rounded-2xl border border-amber-400/35 bg-amber-950/25 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-amber-100">
                  {FOOD_VISUAL_META[lifeScene.dining.foodVisual].emoji} {lifeScene.dining.dishName}
                </div>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-200">
                  Dining Table &amp; Kitchen
                </span>
              </div>
              <div className="text-[10.5px] text-amber-200/85">
                Drink: {lifeScene.dining.drinkName}
              </div>
              <p className="text-[10.5px] italic text-zinc-300">
                “{lifeScene.dining.moodReason}”
              </p>
            </div>
          )}

          {lifeScene.hobby && (
            <div
              className={`rounded-2xl border p-3 space-y-1.5 ${
                isBathing
                  ? 'border-sky-400/35 bg-sky-950/25'
                  : isStudying
                  ? 'border-blue-400/35 bg-blue-950/25'
                  : 'border-fuchsia-400/35 bg-fuchsia-950/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-white">
                  {HOBBY_KIND_META[lifeScene.hobby.hobbyKind].emoji} {lifeScene.hobby.hobbyName}
                </div>
                {isBathing && (
                  <span className="flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 font-mono text-[9px] text-emerald-200">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    SFW Censored
                  </span>
                )}
              </div>
              <p className="text-[10.5px] italic text-zinc-300">
                “{lifeScene.hobby.description}”
              </p>
            </div>
          )}

          {lifeScene.destination && lifeScene.destination.destinationKind !== 'none' && (
            <div className="rounded-2xl border border-cyan-400/35 bg-cyan-950/25 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-cyan-100">
                  {DESTINATION_KIND_META[lifeScene.destination.destinationKind].emoji}{' '}
                  {lifeScene.destination.placeName}
                </div>
                <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[9px] font-semibold text-cyan-200">
                  3D Scenery
                </span>
              </div>
              <p className="text-[10.5px] text-zinc-300">
                {lifeScene.destination.description}
              </p>
            </div>
          )}

          {lifeScene.chair && (
            <div className="rounded-2xl border border-violet-400/30 bg-violet-950/25 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-violet-100">
                  {AI_CHAIR_STYLE_META[lifeScene.chair.chairStyle].emoji} {lifeScene.chair.chairName}
                </div>
                <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-semibold text-violet-200">
                  AI Chair
                </span>
              </div>
              <p className="text-[10.5px] italic text-zinc-300">“{lifeScene.chair.reason}”</p>
            </div>
          )}
        </div>

        {/* Autonomous Overview */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-[10px] text-zinc-400 space-y-1">
          <div className="font-semibold text-zinc-300">✨ 100% Autonomous (LM Studio)</div>
          <div>• <strong>Food</strong>: Decides her own mood craving, sets the table &amp; kitchen, and eats.</div>
          <div>• <strong>Hobby</strong>: Picks her own activity (painting, music, gaming, baking, etc.).</div>
          <div>• <strong>School</strong>: Chooses high school or college, wears her uniform, &amp; studies with pen &amp; paper.</div>
          <div>• <strong>Bath</strong>: Chooses censored shower (shampoo/soap), towel dry, or toothbrush.</div>
          <div>• <strong>Places</strong>: Picks a mall, beach, cafe, onsen, or park &amp; dresses for it.</div>
        </div>
      </div>
    </aside>
  );
};
