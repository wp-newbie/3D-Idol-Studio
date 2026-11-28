import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type {
  GeminiVoiceName,
  IdleCheckInMinutes,
  Persona,
  StudioSettings,
  VaultModelMeta,
  VocalArchetype,
  VoiceGender,
  VoiceLanguage,
} from '../types/studio';
import { MOOD_META, VOCAL_ARCHETYPES, VOICES_BY_GENDER } from '../data/presets';
import {
  getBuiltInDefaultApiKey,
  hasBuiltInDefaultApiKey,
  sanitizeApiKey,
} from '../services/apiKeyResolver';
import { listAvailableGeminiModels } from '../services/geminiClient';
import { formatBytes } from '../storage/modelVault';

interface SettingsModalProps {
  isOpen: boolean;
  settings: StudioSettings;
  activePersona: Persona;
  storageBackend: string;
  vaultModels: VaultModelMeta[];
  personaCount: number;
  connectionMode: 'live' | 'demo' | 'error';
  lastApiError: string | null;
  isValidatingKey?: boolean;
  validationMessage?: string | null;
  hasAiStudioBridge?: boolean;
  onValidateApiKey?: (overrideKey?: string) => Promise<boolean> | void;
  onConnectAiStudioKey?: () => void;
  onOpenSetupWizard?: () => void;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onUpdateVoice: (patch: Partial<Persona['voice']>) => void;
  onChangeGender: (gender: VoiceGender) => void;
  onChangeArchetype: (archetype: VocalArchetype) => void;
  onTestVoice: () => void;
  onSimulatePcContext: (appName: string) => void;
  onTestIdleCheckInNow: () => void;
  onResetFactoryPresets: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  activePersona,
  storageBackend,
  vaultModels,
  personaCount,
  connectionMode,
  lastApiError,
  isValidatingKey = false,
  validationMessage = null,
  hasAiStudioBridge = false,
  onValidateApiKey,
  onConnectAiStudioKey,
  onOpenSetupWizard,
  onClose,
  onUpdateSettings,
  onUpdateVoice,
  onChangeGender,
  onChangeArchetype,
  onTestVoice,
  onSimulatePcContext,
  onTestIdleCheckInNow,
  onResetFactoryPresets,
}) => {
  const [draftKey, setDraftKey] = useState(
    settings.useBuiltInKey ? '' : sanitizeApiKey(settings.apiKey)
  );
  const [showKey, setShowKey] = useState(false);
  const [liveTextModels, setLiveTextModels] = useState<string[]>([]);
  const [liveTtsModels, setLiveTtsModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const builtInAvailable = hasBuiltInDefaultApiKey();

  useEffect(() => {
    if (isOpen) {
      setDraftKey(settings.useBuiltInKey ? '' : sanitizeApiKey(settings.apiKey));
    }
  }, [isOpen, settings.apiKey, settings.useBuiltInKey]);

  const handleRefreshLiveModels = async () => {
    if (settings.enableGeminiCloud === false) return;
    const key = settings.useBuiltInKey
      ? getBuiltInDefaultApiKey()
      : sanitizeApiKey(draftKey || settings.apiKey);
    if (!key) return;
    setIsLoadingModels(true);
    try {
      const { textModels, ttsModels } = await listAvailableGeminiModels(key, true);
      setLiveTextModels(textModels.slice(0, 6));
      setLiveTtsModels(ttsModels.slice(0, 4));
    } finally {
      setIsLoadingModels(false);
    }
  };

  if (!isOpen) return null;

  const voiceChoices = VOICES_BY_GENDER[activePersona.voice.gender];
  const activeArchetype = VOCAL_ARCHETYPES[activePersona.voice.archetype];
  const vaultBytes = vaultModels.reduce((acc, m) => acc + m.sizeBytes, 0);

  const handleSaveAndVerifyKey = () => {
    const cleaned = sanitizeApiKey(draftKey);
    setDraftKey(cleaned);
    onUpdateSettings({ apiKey: cleaned, useBuiltInKey: false });
    if (cleaned && onValidateApiKey) {
      void onValidateApiKey(cleaned);
    }
  };

  const handleClearKey = () => {
    setDraftKey('');
    onUpdateSettings({ apiKey: '', useBuiltInKey: false });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/[0.12] bg-[#0b0b15] shadow-glass">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div>
            <h3 className="font-display text-base font-bold text-white">
              Studio &amp; Voice Acting Settings
            </h3>
            <p className="text-xs text-zinc-400">
              Japanese Seiyuu Presets, Room Lighting &amp; Local Storage
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenSetupWizard && (
              <button
                type="button"
                onClick={onOpenSetupWizard}
                className="flex items-center gap-1.5 rounded-xl border border-violet-400/40 bg-violet-500/15 px-3 py-1.5 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-500/25"
                title="Re-open the First-Run Startup Setup Wizard"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>Setup Wizard</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Real API Error Alert */}
          {lastApiError && settings.enableGeminiCloud !== false && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/45 bg-rose-950/50 p-3.5 text-xs text-rose-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <div className="space-y-1">
                <div className="font-semibold text-rose-200">
                  Gemini API Request Failed — Please Fix Key or Model
                </div>
                <p className="font-mono text-[11px] leading-snug text-rose-200/90">
                  {lastApiError}
                </p>
              </div>
            </div>
          )}

          {/* 1. Gemini API Key & Models (Desktop + Web) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-300">
                <KeyRound className="h-3.5 w-3.5" />
                AI Brain &amp; Voice Engine
              </div>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                  settings.enableGeminiCloud === false
                    ? 'border-zinc-500/40 bg-zinc-600/20 text-zinc-300'
                    : settings.preferLocalAi
                    ? 'border-purple-400/40 bg-purple-500/15 text-purple-200'
                    : connectionMode === 'live'
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : connectionMode === 'error'
                    ? 'border-rose-400/45 bg-rose-500/15 text-rose-200'
                    : 'border-amber-400/35 bg-amber-500/15 text-amber-200'
                }`}
              >
                {settings.enableGeminiCloud === false
                  ? '● Gemini Cloud Disabled (Offline)'
                  : settings.preferLocalAi
                  ? '● Local Offline AI Active'
                  : connectionMode === 'live'
                  ? '● Live Gemini Connected'
                  : connectionMode === 'error'
                  ? '● Key / Model Error'
                  : '● Offline Demo Mode'}
              </span>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              {/* Toggle: Enable / Disable Gemini API Cloud */}
              <div className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
                settings.enableGeminiCloud !== false
                  ? 'border-sky-500/35 bg-sky-950/20'
                  : 'border-zinc-600/35 bg-zinc-900/30'
              }`}>
                <div className="flex items-center gap-2.5">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg font-bold text-sm ${
                    settings.enableGeminiCloud !== false
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-zinc-700/40 text-zinc-400'
                  }`}>
                    ☁️
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-sky-100 text-[12px]">
                      <span>Gemini API Cloud</span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-mono ${
                        settings.enableGeminiCloud !== false
                          ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                          : 'border-zinc-500/40 bg-zinc-600/20 text-zinc-400'
                      }`}>
                        {settings.enableGeminiCloud !== false ? 'Cloud Online' : 'Cloud Disabled'}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-zinc-300/80 leading-snug">
                      {settings.enableGeminiCloud !== false
                        ? 'Connects to Google Gemini API (gemini-flash / gemini-pro / Gemini TTS). Toggle off to block all cloud calls.'
                        : 'All Google Gemini Cloud API calls are blocked. Idol companion operates 100% locally with LM Studio and offline audio.'}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.enableGeminiCloud !== false}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      onUpdateSettings({ enableGeminiCloud: enabled });
                      if (!enabled && onValidateApiKey) {
                        void onValidateApiKey('local');
                      }
                    }}
                    className="peer sr-only"
                  />
                  <div className="peer h-5 w-9 rounded-full bg-zinc-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-sky-500 peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {/* Prioritize Local Offline AI Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-purple-500/35 bg-purple-950/25 p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300 font-bold text-sm">
                    ⚡
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-purple-100 text-[12px]">
                      <span>Prioritize Local Offline AI</span>
                      <span className="rounded-md border border-purple-400/40 bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-mono text-purple-300">
                        LM Studio &amp; VOICEVOX
                      </span>
                    </div>
                    <div className="text-[10.5px] text-purple-300/80">
                      Bypasses Gemini API key completely &amp; runs 100% offline with zero quota limits.
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.preferLocalAi)}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      onUpdateSettings({ preferLocalAi: enabled });
                      if (enabled && onValidateApiKey) {
                        void onValidateApiKey('local');
                      }
                    }}
                    className="peer sr-only"
                  />
                  <div className="peer h-5 w-9 rounded-full bg-zinc-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {settings.preferLocalAi && (
                <div className="rounded-xl border border-purple-400/30 bg-purple-950/30 p-3 space-y-2 text-xs text-purple-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span>🧠</span>
                      <span>Brain: <strong>LM Studio :1234 (Qwen 2.5 7B)</strong></span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span>🎙️</span>
                      <span>Voice: <strong>VOICEVOX :50021</strong></span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-purple-500/20">
                    <span className="text-[10px] text-purple-300/70">
                      Cloud Gemini API bypassed. No internet or billing required.
                    </span>
                    {onValidateApiKey && (
                      <button
                        type="button"
                        disabled={isValidatingKey}
                        onClick={() => void onValidateApiKey('local')}
                        className="rounded-lg border border-purple-400/40 bg-purple-500/25 px-2.5 py-1 text-[10.5px] font-semibold text-purple-100 hover:bg-purple-500/40 disabled:opacity-45"
                      >
                        {isValidatingKey ? 'Testing Local...' : 'Test Local Connection'}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* Autonomous Time & Occasion Self-Dressing Toggle (Local LLM) */}
              <div className="flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-950/20 p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-200 font-bold text-sm">
                    👗
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-amber-100 text-[12px]">
                      <span>Auto-Dress by Time &amp; Occasion</span>
                      <span className="rounded-md border border-amber-400/35 bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-mono text-amber-200">
                        LM Studio :1234
                      </span>
                    </div>
                    <div className="text-[10.5px] text-amber-200/75">
                      Lets your companion design &amp; change her own clothes for morning, afternoon, evening, and late-night using your LM Studio local server.
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.autoDressByTimeOccasion !== false}
                    onChange={(e) =>
                      onUpdateSettings({ autoDressByTimeOccasion: e.target.checked })
                    }
                    className="peer sr-only"
                  />
                  <div className="peer h-5 w-9 rounded-full bg-zinc-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full"></div>
                </label>
              </div>

              {settings.enableGeminiCloud === false ? (
                <div className="flex items-center justify-between rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-3.5 text-xs text-zinc-300">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">🛡️</span>
                    <div>
                      <div className="font-semibold text-zinc-200">Gemini Cloud API is Switched OFF</div>
                      <div className="text-[10.5px] text-zinc-400">
                        No cloud API key required. Requests stay local on your PC (LM Studio :1234 &amp; VOICEVOX :50021).
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ enableGeminiCloud: true })}
                    className="rounded-lg border border-sky-400/40 bg-sky-500/20 px-3 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/30 shrink-0"
                  >
                    Enable Cloud
                  </button>
                </div>
              ) : settings.useBuiltInKey && builtInAvailable ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/35 bg-emerald-950/30 px-3.5 py-2.5">
                  <div className="flex items-center gap-2 text-xs text-emerald-100">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                    <div>
                      <div className="font-semibold">Using Built-In Default Gemini Key</div>
                      <div className="text-[10.5px] text-emerald-200/75">
                        Raw key is hidden automatically. Switch to paste your own key anytime.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onValidateApiKey && (
                      <button
                        type="button"
                        disabled={isValidatingKey}
                        onClick={() => void onValidateApiKey(getBuiltInDefaultApiKey())}
                        className="rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-45"
                      >
                        {isValidatingKey ? 'Testing...' : 'Test Connection'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ useBuiltInKey: false })}
                      className="rounded-xl border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/10"
                    >
                      Use Own Key
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 flex items-center justify-between text-[10px] font-semibold text-zinc-400">
                    <span>API Key (Cloud Gemini Key, or "local" for LM Studio)</span>
                    <span className="flex items-center gap-2 font-mono text-[9.5px] text-zinc-500">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftKey('local');
                          onUpdateSettings({ useBuiltInKey: false, apiKey: 'local' });
                        }}
                        className="text-purple-300 hover:underline"
                      >
                        ⚡ Use Local AI (Offline)
                      </button>
                      {builtInAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftKey('');
                            onUpdateSettings({ useBuiltInKey: true, apiKey: '' });
                          }}
                          className="text-emerald-300 hover:underline"
                        >
                          Switch to Built-In Default Key
                        </button>
                      )}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={draftKey}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Paste your Gemini API key (AQ.... or AIza...)"
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (/•/.test(raw)) return;
                          setDraftKey(raw);
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pasted = sanitizeApiKey(e.clipboardData.getData('text'));
                          setDraftKey(pasted);
                          if (pasted) {
                            onUpdateSettings({ apiKey: pasted, useBuiltInKey: false });
                          }
                        }}
                        onBlur={() => {
                          const cleaned = sanitizeApiKey(draftKey);
                          if (cleaned !== draftKey) setDraftKey(cleaned);
                          if (cleaned !== sanitizeApiKey(settings.apiKey)) {
                            onUpdateSettings({ apiKey: cleaned, useBuiltInKey: false });
                          }
                        }}
                        className="w-full rounded-xl border border-white/10 bg-[#121220] py-1.5 pl-3 pr-9 font-mono text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                        title={showKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isValidatingKey || !sanitizeApiKey(draftKey)}
                      onClick={handleSaveAndVerifyKey}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-45"
                    >
                      {isValidatingKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span>{isValidatingKey ? 'Verifying...' : 'Verify & Save'}</span>
                    </button>

                    {draftKey && (
                      <button
                        type="button"
                        onClick={handleClearKey}
                        className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-rose-200"
                        title="Clear saved API key"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {validationMessage && (
                <div
                  className={`rounded-xl border px-3 py-1.5 font-mono text-[11px] ${
                    connectionMode === 'live'
                      ? 'border-emerald-400/30 bg-emerald-950/35 text-emerald-200'
                      : 'border-rose-400/35 bg-rose-950/35 text-rose-200'
                  }`}
                >
                  {validationMessage}
                </div>
              )}

              {hasAiStudioBridge && onConnectAiStudioKey && (
                <button
                  type="button"
                  onClick={onConnectAiStudioKey}
                  className="rounded-xl border border-violet-400/35 bg-violet-500/15 px-3 py-1 text-[11px] font-semibold text-violet-200 hover:bg-violet-500/25"
                >
                  Connect via Google AI Studio Bridge
                </button>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-zinc-400">
                      Dialogue Text Model
                    </label>
                    <button
                      type="button"
                      disabled={
                        isLoadingModels ||
                        !(settings.useBuiltInKey
                          ? builtInAvailable
                          : sanitizeApiKey(draftKey || settings.apiKey))
                      }
                      onClick={() => void handleRefreshLiveModels()}
                      className="flex items-center gap-1 text-[10px] font-medium text-violet-300 hover:text-violet-200 disabled:opacity-40"
                      title="Fetch live available models from Google Gemini API"
                    >
                      <RefreshCw className={`h-2.5 w-2.5 ${isLoadingModels ? 'animate-spin' : ''}`} />
                      <span>Refresh Models</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={settings.textModel}
                    onChange={(e) => onUpdateSettings({ textModel: e.target.value })}
                    placeholder="gemini-flash-latest"
                    className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-400"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Array.from(
                      new Set(['gemini-flash-latest', 'gemini-3.8-flash', ...liveTextModels])
                    )
                      .slice(0, 5)
                      .map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => onUpdateSettings({ textModel: m })}
                          className={`rounded-lg border px-1.5 py-0.5 font-mono text-[9.5px] transition ${
                            settings.textModel === m
                              ? 'border-violet-400/60 bg-violet-500/25 text-violet-100'
                              : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                    Gemini TTS Voice Model
                  </label>
                  <input
                    type="text"
                    value={settings.ttsModel}
                    onChange={(e) => onUpdateSettings({ ttsModel: e.target.value })}
                    placeholder="gemini-2.5-flash-preview-tts"
                    className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-400"
                  />
                  {liveTtsModels.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {liveTtsModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => onUpdateSettings({ ttsModel: m })}
                          className={`rounded-lg border px-1.5 py-0.5 font-mono text-[9.5px] transition ${
                            settings.ttsModel === m
                              ? 'border-rose-400/60 bg-rose-500/25 text-rose-100'
                              : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Roleplay Name & Outfit Reaction Toggle */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                  Your Roleplay Name (&#123;&#123;user&#125;&#125;)
                </label>
                <input
                  type="text"
                  value={settings.userName}
                  onChange={(e) => onUpdateSettings({ userName: e.target.value })}
                  placeholder="e.g. tobski"
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-400"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#121220] px-3 py-2">
                <span className="text-[11px] font-medium text-zinc-200">
                  Live Wardrobe AI Reaction
                </span>
                <input
                  type="checkbox"
                  checked={settings.autoReactOnOutfitChange}
                  onChange={(e) =>
                    onUpdateSettings({ autoReactOnOutfitChange: e.target.checked })
                  }
                  className="h-4 w-4 accent-violet-500"
                />
              </label>
            </div>
          </div>

          {/* 2. Japanese Seiyuu Voice Acting, Archetypes & Sliders */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
                <Sliders className="h-3.5 w-3.5" />
                Japanese Seiyuu Voice &amp; VRM Lip-Sync ({activePersona.name})
              </div>
              <button
                type="button"
                onClick={onTestVoice}
                className="flex items-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/25"
              >
                <Volume2 className="h-3.5 w-3.5" />
                Test Voice &amp; Lip-Sync
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                    Voice Language
                  </label>
                  <select
                    value={activePersona.voice.language}
                    onChange={(e) =>
                      onUpdateVoice({ language: e.target.value as VoiceLanguage })
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#121220] px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="ja">Japanese (EN Subtitles)</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                    Voice Gender
                  </label>
                  <select
                    value={activePersona.voice.gender}
                    onChange={(e) => onChangeGender(e.target.value as VoiceGender)}
                    className="w-full rounded-xl border border-white/10 bg-[#121220] px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="female">Female (Aoede / Leda)</option>
                    <option value="male">Male (Fenrir / Charon)</option>
                  </select>
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#121220] px-3 py-1.5 self-end h-[34px]">
                  <span className="text-[11px] font-medium text-zinc-200">
                    🔊 Auto-Speak
                  </span>
                  <input
                    type="checkbox"
                    checked={activePersona.voice.autoSpeak}
                    onChange={(e) => onUpdateVoice({ autoSpeak: e.target.checked })}
                    className="h-4 w-4 accent-emerald-500"
                  />
                </label>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                  Anime Vocal Archetype Preset
                </label>
                <select
                  value={activePersona.voice.archetype}
                  onChange={(e) => onChangeArchetype(e.target.value as VocalArchetype)}
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs text-white"
                >
                  {(Object.keys(VOCAL_ARCHETYPES) as VocalArchetype[]).map((key) => (
                    <option key={key} value={key}>
                      {VOCAL_ARCHETYPES[key].label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] italic text-zinc-400">
                  “{activeArchetype.stylePrompt}”
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {voiceChoices.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onUpdateVoice({ voiceName: v.id as GeminiVoiceName })}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      activePersona.voice.voiceName === v.id
                        ? 'border-violet-400/60 bg-violet-500/20'
                        : 'border-white/10 bg-[#121220] hover:border-white/20'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">{v.id}</div>
                    <div className="text-[10px] text-zinc-400">{v.note}</div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-zinc-300">Pitch (0.85x – 1.45x)</span>
                    <span className="font-mono text-violet-300">
                      {activePersona.voice.pitch.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.85}
                    max={1.45}
                    step={0.01}
                    value={activePersona.voice.pitch}
                    onChange={(e) => onUpdateVoice({ pitch: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-zinc-300">Speed (0.9x – 1.25x)</span>
                    <span className="font-mono text-violet-300">
                      {activePersona.voice.speed.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.9}
                    max={1.25}
                    step={0.01}
                    value={activePersona.voice.speed}
                    onChange={(e) => onUpdateVoice({ speed: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-rose-400/20 bg-rose-950/20 p-3 text-[11px] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-rose-200">
                    Active Mood Direction ([MOOD: {activePersona.mood}])
                  </span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-zinc-200">
                    <input
                      type="checkbox"
                      checked={Boolean(settings.offlineVoiceOnly)}
                      onChange={(e) =>
                        onUpdateSettings({ offlineVoiceOnly: e.target.checked })
                      }
                      className="h-3.5 w-3.5 accent-rose-400"
                    />
                    Force Native ja-JP Browser Speech
                  </label>
                </div>
                <p className="italic text-zinc-300">
                  “{MOOD_META[activePersona.mood].tsundereVocalDirection}”
                </p>
                <div className="font-mono text-[10px] text-zinc-400">
                  ja-JP Fallback: Female → Google 日本語 / Microsoft Nanami (1.35 / 1.12) · Male → Microsoft Keita (0.92 / 1.05)
                </div>
              </div>
            </div>
          </section>

          {/* 3. Autonomous Idle Check-Ins & Break Reminders (⏰) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <span>⏰</span>
                <span>Autonomous Idle Check-Ins &amp; Break Reminders</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onTestIdleCheckInNow();
                  onClose();
                }}
                className="flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/30"
              >
                <span>⏰</span>
                <span>Test Check-In Now</span>
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-zinc-100">
                    Idle Check-In Interval
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Tracks mouse, keyboard &amp; chat inactivity (15-min cooldown between nudges).
                  </p>
                </div>
                <div className="flex items-center rounded-xl border border-white/10 bg-[#121220] p-0.5 text-[11px]">
                  {(
                    [
                      [0, 'Off'],
                      [15, '15m'],
                      [30, '30m'],
                      [60, '60m'],
                    ] as [IdleCheckInMinutes, string][]
                  ).map(([mins, label]) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => onUpdateSettings({ idleCheckInMinutes: mins })}
                      className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                        settings.idleCheckInMinutes === mins
                          ? 'bg-amber-500/30 text-amber-100'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#121220] px-3 py-2">
                  <span className="text-[11px] font-medium text-zinc-200">
                    🔕 Do-Not-Disturb (Silence Nudges)
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.doNotDisturb)}
                    onChange={(e) =>
                      onUpdateSettings({ doNotDisturb: e.target.checked })
                    }
                    className="h-4 w-4 accent-rose-400"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#121220] px-3 py-2">
                  <span className="text-[11px] font-medium text-zinc-200">
                    🎮 Pause During Fullscreen Games
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.idleRespectDndFullscreen)}
                    onChange={(e) =>
                      onUpdateSettings({ idleRespectDndFullscreen: e.target.checked })
                    }
                    className="h-4 w-4 accent-amber-400"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 4. Optional Active-Window Awareness (👁️ PC Context) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                <span>👁️</span>
                <span>PC Context — Active-Window Awareness (Opt-In)</span>
              </div>
              <span className="font-mono text-[10px] text-zinc-500">
                Strictly local · Off by default
              </span>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-zinc-100">
                    Notice Active Window (👁️)
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Reads only the active app name locally (e.g. &ldquo;Playing Aion 2&rdquo;, &ldquo;VS Code&rdquo;, &ldquo;YouTube&rdquo;) so she can occasionally react spontaneously in Japanese Tsundere voice.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.noticeActiveWindow)}
                  onChange={(e) =>
                    onUpdateSettings({ noticeActiveWindow: e.target.checked })
                  }
                  className="h-4 w-4 shrink-0 accent-amber-400"
                />
              </label>

              {settings.noticeActiveWindow && (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-2.5 text-[11px]">
                  <span className="text-zinc-400">Test spontaneous reaction:</span>
                  {['Playing Aion 2', 'VS Code', 'YouTube'].map((sampleApp) => (
                    <button
                      key={sampleApp}
                      type="button"
                      onClick={() => {
                        onSimulatePcContext(sampleApp);
                        onClose();
                      }}
                      className="rounded-lg border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-medium text-amber-100 hover:bg-amber-500/25"
                    >
                      👁️ {sampleApp}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 5. Persistent Local Storage */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <Database className="h-3.5 w-3.5" />
              Persistent Local Storage
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-semibold text-zinc-200">
                  Backend: <span className="font-mono text-cyan-300">{storageBackend}</span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  {personaCount} Personas · {vaultModels.length} Models in IndexedDB Vault (
                  {formatBytes(vaultBytes)})
                </div>
              </div>
              <button
                type="button"
                onClick={onResetFactoryPresets}
                className="flex items-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-950/35 px-3 py-1.5 text-[11px] font-medium text-rose-200 hover:bg-rose-900/45"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Presets
              </button>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-white/[0.08] px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-500"
          >
            Save &amp; Done
          </button>
        </div>
      </div>
    </div>
  );
};
