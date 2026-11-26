import React from 'react';
import {
  ChevronDown,
  Minus,
  RefreshCw,
  Settings,
  Shirt,
  Sparkles,
  Square,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  IdleCheckInMinutes,
  Persona,
  VocalArchetype,
  VoiceGender,
  VoiceLanguage,
} from '../types/studio';
import { VOCAL_ARCHETYPES } from '../data/presets';

interface TopToolbarProps {
  personas: Persona[];
  activePersona: Persona;
  isWardrobeOpen: boolean;
  desktopRoamMode: boolean;
  idleCheckInMinutes: IdleCheckInMinutes;
  doNotDisturb: boolean;
  isSpeaking: boolean;
  connectionMode: 'live' | 'demo' | 'error';
  onSelectPersona: (id: string) => void;
  onOpenRoster: () => void;
  onToggleWardrobe: () => void;
  onToggleDesktopRoam: () => void;
  onCycleIdleCheckIn: () => void;
  onChangeLanguage: (lang: VoiceLanguage) => void;
  onChangeGender: (gender: VoiceGender) => void;
  onChangeArchetype?: (archetype: VocalArchetype) => void;
  onToggleAutoSpeak: () => void;
  onStopSpeaking: () => void;
  onOpenSettings: () => void;
  onSyncWorkspace?: () => void;
  isSyncingWorkspace?: boolean;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  personas,
  activePersona,
  isWardrobeOpen,
  desktopRoamMode,
  idleCheckInMinutes,
  doNotDisturb,
  isSpeaking,
  connectionMode,
  onSelectPersona,
  onOpenRoster,
  onToggleWardrobe,
  onToggleDesktopRoam,
  onCycleIdleCheckIn,
  onChangeLanguage: _onChangeLanguage,
  onChangeGender,
  onChangeArchetype: _onChangeArchetype,
  onToggleAutoSpeak,
  onStopSpeaking,
  onOpenSettings,
  onSyncWorkspace,
  isSyncingWorkspace,
}) => {
  const activeArchetype =
    VOCAL_ARCHETYPES[activePersona.voice.archetype] || VOCAL_ARCHETYPES.sharp_tsundere;
  return (
    <header className="electron-drag z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] bg-[#090912]/90 px-4 backdrop-blur-xl overflow-x-auto no-scrollbar">
      {/* Left: Studio Brand + Persona Switcher */}
      <div className="electron-no-drag flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2 pr-2 border-r border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/80 via-fuchsia-500/70 to-rose-500/70 shadow-glow">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="hidden xl:block leading-tight">
            <div className="font-display text-xs font-bold tracking-wider text-white">
              ZETA STUDIO
            </div>
            <div className="font-mono text-[10px] text-zinc-400">3D IDOL STAGE</div>
          </div>
        </div>

        {/* Persona Switcher */}
        <div className="relative flex items-center gap-1.5">
          <div className="relative">
            <select
              aria-label="Active Persona"
              value={activePersona.id}
              onChange={(e) => onSelectPersona(e.target.value)}
              className="appearance-none rounded-xl border border-white/10 bg-[#121220] py-1.5 pl-3 pr-8 text-xs font-semibold text-zinc-100 outline-none transition hover:border-violet-400/40 focus:border-violet-400"
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#11111d] text-zinc-100">
                  {p.name} ({p.japaneseName})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          </div>

          <button
            type="button"
            onClick={onOpenRoster}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-violet-400/40 hover:bg-violet-500/15"
            title="Open Persona Roster & Builder"
          >
            <Users className="h-3.5 w-3.5 text-violet-300" />
            <span className="hidden lg:inline">Roster</span>
          </button>
        </div>

        {/* 3D Wardrobe Toggle */}
        <button
          type="button"
          onClick={onToggleWardrobe}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
            isWardrobeOpen
              ? 'border-rose-400/50 bg-rose-500/20 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.25)]'
              : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:border-rose-400/40 hover:bg-rose-500/10'
          }`}
          title="Open 3D Wardrobe & Outfit Switcher"
        >
          <span role="img" aria-label="wardrobe">
            👗
          </span>
          <Shirt className="hidden sm:inline h-3.5 w-3.5 text-rose-300" />
          <span>Wardrobe</span>
        </button>

        {/* Desktop Mascot / Roam Mode Toggle (🪟) */}
        <button
          type="button"
          onClick={onToggleDesktopRoam}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
            desktopRoamMode
              ? 'border-cyan-400/60 bg-cyan-500/25 text-cyan-100 shadow-glow'
              : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:border-cyan-400/45 hover:bg-cyan-500/15'
          }`}
          title="Transform into Transparent Always-on-Top Desktop Companion / Roam Overlay"
        >
          <span role="img" aria-label="desktop-roam">
            🪟
          </span>
          <span className="hidden xl:inline">Desktop Roam</span>
        </button>

        {/* Idle Check-In Quick Toggle Pill (⏰) */}
        <button
          type="button"
          onClick={onCycleIdleCheckIn}
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
            doNotDisturb
              ? 'border-zinc-600/60 bg-zinc-900/80 text-zinc-400'
              : idleCheckInMinutes > 0
              ? 'border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
              : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
          }`}
          title="Proactive Idle Check-In Interval (click to cycle Off / 15m / 30m / 60m)"
        >
          <span role="img" aria-label="idle-check-in">
            {doNotDisturb ? '🔕' : '⏰'}
          </span>
          <span className="hidden 2xl:inline">
            {doNotDisturb
              ? 'DND'
              : idleCheckInMinutes > 0
              ? `${idleCheckInMinutes}m`
              : 'Off'}
          </span>
        </button>
      </div>

      {/* Right: Voice Language, Gender, Archetype, Auto-Speak, Settings */}
      <div className="electron-no-drag flex items-center gap-2">
        {/* Voice Mode Indicator */}
        <div
          className="flex items-center gap-1.5 rounded-xl border border-violet-500/25 bg-[#11111e] px-2.5 py-1 text-[11px] shadow-sm"
          title="Voice spoken audio is Japanese anime voice with English subtitles"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-violet-100">JP Voice</span>
          <span className="text-zinc-500">·</span>
          <span className="font-medium text-zinc-300">EN Subs</span>
        </div>

        {/* Voice Gender */}
        <div
          className="flex items-center rounded-xl border border-white/10 bg-[#11111e] p-0.5 text-[11px]"
          title="Voice Gender (Female: Aoede/Leda, Male: Fenrir/Charon)"
        >
          <button
            type="button"
            onClick={() => onChangeGender('female')}
            className={`rounded-lg px-2 py-1 font-medium transition ${
              activePersona.voice.gender === 'female'
                ? 'bg-rose-500/25 text-rose-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Female
          </button>
          <button
            type="button"
            onClick={() => onChangeGender('male')}
            className={`rounded-lg px-2 py-1 font-medium transition ${
              activePersona.voice.gender === 'male'
                ? 'bg-sky-500/25 text-sky-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Male
          </button>
        </div>

        {/* AI Character-Driven Vocal Archetype */}
        <div
          className="flex items-center gap-1.5 rounded-xl border border-violet-400/25 bg-violet-950/30 px-2.5 py-1.5 text-[11px] font-medium text-violet-200 shadow-sm backdrop-blur-md"
          title={`AI Character-Driven Vocal Tone: ${activeArchetype.label}\n${activeArchetype.description}\nAuto-modulated by ${activePersona.name}'s mood (${activePersona.mood}), feelings, and personality.`}
        >
          <Sparkles className="h-3 w-3 text-violet-400 animate-pulse" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">AI Tone</span>
          <span className="font-semibold text-zinc-200">{activeArchetype.shortLabel}</span>
        </div>

        {/* Auto-Speak Toggle */}
        <button
          type="button"
          onClick={onToggleAutoSpeak}
          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition ${
            activePersona.voice.autoSpeak
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
              : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
          }`}
          title="Auto-Speak AI dialogue with Gemini TTS & VRM Lip-Sync"
        >
          {activePersona.voice.autoSpeak ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
          <span className="hidden xl:inline">Auto-Speak</span>
        </button>

        {isSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="flex items-center gap-1 rounded-xl border border-rose-400/40 bg-rose-500/20 px-2 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/30"
            title="Stop voice playback"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
        )}

        {/* Instant Workspace Sync Button (Web <-> Desktop) */}
        {onSyncWorkspace && (
          <button
            type="button"
            onClick={onSyncWorkspace}
            disabled={isSyncingWorkspace}
            className={`flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/15 ${
              isSyncingWorkspace ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title="Instant Workspace Sync (sync Web and Desktop state immediately)"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-cyan-300 ${isSyncingWorkspace ? 'animate-spin' : ''}`}
            />
            <span className="hidden lg:inline text-[11px]">Sync</span>
          </button>
        )}

        {/* Settings + Live Gemini / Demo Status Pill */}
        <button
          type="button"
          onClick={onOpenSettings}
          className={`relative flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
            connectionMode === 'live'
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
              : connectionMode === 'error'
              ? 'border-rose-400/45 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
              : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:border-violet-400/40 hover:bg-violet-500/15'
          }`}
          title="Studio & Gemini API Settings"
        >
          <Settings className="h-3.5 w-3.5" />
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connectionMode === 'live'
                ? 'bg-emerald-400'
                : connectionMode === 'error'
                ? 'bg-rose-400 animate-pulse'
                : 'bg-amber-400'
            }`}
          />
          <span className="hidden lg:inline text-[11px]">
            {connectionMode === 'live'
              ? 'Live Gemini'
              : connectionMode === 'error'
              ? 'Fix Key'
              : 'Demo'}
          </span>
        </button>

        {/* Native Frameless Electron Window Controls */}
        {window.studioAPI?.windowControl && (
          <div className="ml-1 flex items-center gap-0.5 border-l border-white/10 pl-2">
            <button
              type="button"
              onClick={() => window.studioAPI?.windowControl?.('minimize')}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              title="Minimize"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => window.studioAPI?.windowControl?.('maximize')}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              title="Maximize"
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => window.studioAPI?.windowControl?.('close')}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/30 hover:text-rose-200"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
