import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
  X,
} from 'lucide-react';
import type {
  AvatarPosture,
  Persona,
  StudioSettings,
  UserHonorific,
  VaultModelMeta,
} from '../types/studio';
import {
  getBuiltInDefaultApiKey,
  hasBuiltInDefaultApiKey,
  sanitizeApiKey,
} from '../services/apiKeyResolver';
import { validateGeminiApiKey } from '../services/geminiClient';

export interface StartupSetupResult {
  userName: string;
  userHonorific: UserHonorific;
  useBuiltInKey: boolean;
  customApiKey: string;
  activePersonaId: string;
  posture: AvatarPosture;
  selectedVaultModelId: string | null;
  uploadedModelFile: File | null;
  triggerGreeting: boolean;
  validatedModel?: string;
}

interface StartupSetupModalProps {
  isOpen: boolean;
  canDismiss: boolean;
  settings: StudioSettings;
  personas: Persona[];
  activePersonaId: string;
  vaultModels: VaultModelMeta[];
  onClose: () => void;
  onComplete: (result: StartupSetupResult) => Promise<void> | void;
}

const HONORIFIC_OPTIONS: { value: UserHonorific; label: string }[] = [
  { value: '', label: 'Casual (none)' },
  { value: '-san', label: '-san' },
  { value: '-kun', label: '-kun' },
  { value: '-chan', label: '-chan' },
  { value: 'Senpai', label: 'Senpai' },
];

export const StartupSetupModal: React.FC<StartupSetupModalProps> = ({
  isOpen,
  canDismiss,
  settings,
  personas,
  activePersonaId,
  vaultModels,
  onClose,
  onComplete,
}) => {
  const builtInAvailable = hasBuiltInDefaultApiKey();

  const [userName, setUserName] = useState(settings.userName || 'Producer');
  const [userHonorific, setUserHonorific] = useState<UserHonorific>(
    settings.userHonorific ?? ''
  );
  const [keyOption, setKeyOption] = useState<'own' | 'builtin'>(
    settings.useBuiltInKey || (!sanitizeApiKey(settings.apiKey) && builtInAvailable)
      ? 'builtin'
      : 'own'
  );
  const [customApiKey, setCustomApiKey] = useState(
    settings.useBuiltInKey ? '' : sanitizeApiKey(settings.apiKey)
  );
  const [showKey, setShowKey] = useState(false);

  const [selectedPersonaId, setSelectedPersonaId] = useState(activePersonaId);
  const [posture, setPosture] = useState<AvatarPosture>(
    settings.defaultPosture ?? 'seated'
  );
  const [selectedVaultModelId, setSelectedVaultModelId] = useState<string | null>(null);
  const [uploadedModelFile, setUploadedModelFile] = useState<File | null>(null);
  const [triggerGreeting, setTriggerGreeting] = useState(true);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    model?: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setUserName(settings.userName || 'Producer');
    setUserHonorific(settings.userHonorific ?? '');
    const hasOwn = !settings.useBuiltInKey && sanitizeApiKey(settings.apiKey).length > 8;
    setKeyOption(
      settings.useBuiltInKey
        ? 'builtin'
        : hasOwn
        ? 'own'
        : builtInAvailable
        ? 'builtin'
        : 'own'
    );
    setCustomApiKey(settings.useBuiltInKey ? '' : sanitizeApiKey(settings.apiKey));
    setSelectedPersonaId(activePersonaId);
    setPosture(settings.defaultPosture ?? 'seated');
    setSelectedVaultModelId(null);
    setUploadedModelFile(null);
    setTestResult(null);
  }, [isOpen, settings, activePersonaId, builtInAvailable]);

  if (!isOpen) return null;

  const previewName = (() => {
    const base = userName.trim() || 'Producer';
    if (!userHonorific) return base;
    return userHonorific.startsWith('-') ? `${base}${userHonorific}` : `${base} ${userHonorific}`;
  })();

  const handleTestConnection = async () => {
    const keyToTest =
      keyOption === 'builtin'
        ? getBuiltInDefaultApiKey()
        : sanitizeApiKey(customApiKey);

    if (!keyToTest) {
      setTestResult({
        ok: false,
        message:
          keyOption === 'builtin'
            ? 'No built-in default key is bundled in this build. Please paste your own Gemini API key.'
            : 'Please paste a Gemini API key (AIza... or AQ...) first.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await validateGeminiApiKey({
        apiKey: keyToTest,
        keyMode: settings.keyMode,
        model: settings.textModel || 'gemini-flash-latest',
      });
      if (res.ok) {
        setTestResult({
          ok: true,
          message: `Connected cleanly to Live Gemini (${res.model})!`,
          model: res.model,
        });
      } else {
        setTestResult({
          ok: false,
          message: res.error || 'Connection test failed.',
        });
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndLaunch = async () => {
    setIsSaving(true);
    try {
      const useBuiltInKey = keyOption === 'builtin' && builtInAvailable;
      await onComplete({
        userName: userName.trim() || 'Producer',
        userHonorific,
        useBuiltInKey,
        customApiKey: useBuiltInKey ? '' : sanitizeApiKey(customApiKey),
        activePersonaId: selectedPersonaId,
        posture,
        selectedVaultModelId,
        uploadedModelFile,
        triggerGreeting,
        validatedModel: testResult?.ok ? testResult.model : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const userVaultModels = vaultModels.filter((m) => !m.isDefaultSample);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-violet-400/25 bg-[#0b0b15]/98 shadow-glass">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-gradient-to-r from-violet-950/50 via-[#0d0d1a] to-fuchsia-950/35 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500 shadow-glow">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Welcome to Zeta 3D Idol Studio
              </h2>
              <p className="text-xs text-zinc-400">
                Quick first-run setup — you can change any of these later in Settings (⚙️)
              </p>
            </div>
          </div>
          {canDismiss && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
              title="Close Setup Wizard"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* 1. User Name & Optional Honorific */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <User className="h-3.5 w-3.5" />
                1. Your Name / Nickname (&#123;&#123;user&#125;&#125;)
              </div>
              <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-medium text-cyan-200">
                Addressed as: {previewName}
              </span>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name or nickname (e.g. Producer, Alex)"
                className="w-full rounded-xl border border-white/10 bg-[#121220] px-3.5 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-400"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10.5px] font-medium text-zinc-400">Honorific:</span>
                {HONORIFIC_OPTIONS.map((opt) => (
                  <button
                    key={opt.value || 'casual'}
                    type="button"
                    onClick={() => setUserHonorific(opt.value)}
                    className={`rounded-xl border px-2.5 py-1 text-[11px] font-medium transition ${
                      userHonorific === opt.value
                        ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                        : 'border-white/10 bg-[#121220] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* 2. API Key Choice */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-300">
              <KeyRound className="h-3.5 w-3.5" />
              2. Gemini AI &amp; Voice API Key
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setKeyOption('builtin');
                  setTestResult(null);
                }}
                disabled={!builtInAvailable}
                className={`rounded-2xl border p-3.5 text-left transition ${
                  keyOption === 'builtin'
                    ? 'border-emerald-400/60 bg-emerald-500/15 shadow-glow'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    Use Built-In Default Key
                  </span>
                  {keyOption === 'builtin' && (
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  )}
                </div>
                <p className="mt-1 text-[10.5px] leading-snug text-zinc-400">
                  {builtInAvailable
                    ? 'Ready immediately — bundled securely without exposing the raw key.'
                    : 'No built-in default key bundled in this build.'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setKeyOption('own');
                  setTestResult(null);
                }}
                className={`rounded-2xl border p-3.5 text-left transition ${
                  keyOption === 'own'
                    ? 'border-violet-400/60 bg-violet-500/15 shadow-glow'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <KeyRound className="h-4 w-4 text-violet-300" />
                    I have my own Gemini API Key
                  </span>
                  {keyOption === 'own' && (
                    <span className="h-2 w-2 rounded-full bg-violet-400" />
                  )}
                </div>
                <p className="mt-1 text-[10.5px] leading-snug text-zinc-400">
                  Paste your own <code className="text-violet-200">AIza...</code> or{' '}
                  <code className="text-violet-200">AQ...</code> key (saved locally).
                </p>
              </button>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2.5">
              {keyOption === 'own' ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={customApiKey}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Paste your Gemini API key (AIza... or AQ...)"
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (/•/.test(raw)) return;
                        setCustomApiKey(raw);
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        setCustomApiKey(sanitizeApiKey(e.clipboardData.getData('text')));
                      }}
                      className="w-full rounded-xl border border-white/10 bg-[#121220] py-2 pl-3 pr-9 font-mono text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                      title={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={isTesting || !sanitizeApiKey(customApiKey)}
                    onClick={() => void handleTestConnection()}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-400/45 bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/30 disabled:opacity-45"
                  >
                    {isTesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    <span>Test Connection</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-200">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>Built-in default Gemini key selected (key stays hidden)</span>
                  </div>
                  <button
                    type="button"
                    disabled={isTesting || !builtInAvailable}
                    onClick={() => void handleTestConnection()}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-45"
                  >
                    {isTesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    <span>Test Connection</span>
                  </button>
                </div>
              )}

              {testResult && (
                <div
                  className={`rounded-xl border px-3 py-1.5 font-mono text-[11px] ${
                    testResult.ok
                      ? 'border-emerald-400/35 bg-emerald-950/40 text-emerald-200'
                      : 'border-rose-400/40 bg-rose-950/40 text-rose-200'
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </div>
          </section>

          {/* 3. Starter Companion, Posture & Optional Model */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
              <Sparkles className="h-3.5 w-3.5" />
              3. Starter Companion, Posture &amp; 3D Model
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3.5">
              {/* Persona Cards */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {personas.map((p) => {
                  const selected = p.id === selectedPersonaId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPersonaId(p.id)}
                      className={`rounded-2xl border p-3 text-left transition ${
                        selected
                          ? 'border-rose-400/60 bg-rose-500/15 shadow-glow'
                          : 'border-white/10 bg-[#121220] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: p.accentColor }}
                        />
                        <span className="truncate text-xs font-bold text-white">{p.name}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-zinc-400">
                        {p.japaneseName} · {p.title}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Posture & Optional Model Row */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Starting Posture
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPosture('seated')}
                      className={`rounded-xl border py-2 text-xs font-semibold transition ${
                        posture === 'seated'
                          ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                          : 'border-white/10 bg-[#121220] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      🪑 Sitting
                    </button>
                    <button
                      type="button"
                      onClick={() => setPosture('standing')}
                      className={`rounded-xl border py-2 text-xs font-semibold transition ${
                        posture === 'standing'
                          ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                          : 'border-white/10 bg-[#121220] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      🧍 Standing
                    </button>
                    <button
                      type="button"
                      onClick={() => setPosture('sleeping')}
                      className={`rounded-xl border py-2 text-xs font-semibold transition ${
                        posture === 'sleeping'
                          ? 'border-indigo-400/60 bg-indigo-500/20 text-indigo-100'
                          : 'border-white/10 bg-[#121220] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      🛏️ Bed
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    3D Model (.VRM / .GLB · Optional)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {userVaultModels.length > 0 && !uploadedModelFile && (
                      <select
                        value={selectedVaultModelId ?? ''}
                        onChange={(e) => setSelectedVaultModelId(e.target.value || null)}
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#121220] px-2.5 py-2 text-[11px] text-zinc-200 outline-none focus:border-violet-400"
                      >
                        <option value="">Keep current / default VRM</option>
                        {userVaultModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fileName}
                          </option>
                        ))}
                      </select>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".vrm,.glb"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f) {
                          setUploadedModelFile(f);
                          setSelectedVaultModelId(null);
                        }
                        e.target.value = '';
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-400/45 bg-violet-950/25 px-3 py-2 text-[11px] font-semibold text-violet-200 hover:bg-violet-950/40 ${
                        userVaultModels.length === 0 || uploadedModelFile ? 'w-full' : 'shrink-0'
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span className="truncate max-w-[170px]">
                        {uploadedModelFile ? uploadedModelFile.name : 'Upload .VRM / .GLB'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] bg-[#080812]/90 px-6 py-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={triggerGreeting}
              onChange={(e) => setTriggerGreeting(e.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
            <span>Play initial companion greeting on launch</span>
          </label>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => void handleSaveAndLaunch()}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            <span>Save &amp; Launch Studio</span>
          </button>
        </div>
      </div>
    </div>
  );
};
