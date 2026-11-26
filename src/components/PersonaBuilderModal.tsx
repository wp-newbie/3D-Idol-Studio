import React, { useRef, useState } from 'react';
import {
  Copy,
  Download,
  Plus,
  Save,
  Shirt,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  GeminiVoiceName,
  OutfitSlot,
  Persona,
  VaultModelMeta,
  VocalArchetype,
  VoiceGender,
  VoiceLanguage,
} from '../types/studio';
import { VOCAL_ARCHETYPES, VOICES_BY_GENDER } from '../data/presets';
import { parseDialogueResponse } from '../services/dialogueParser';

interface PersonaBuilderModalProps {
  isOpen: boolean;
  personas: Persona[];
  activePersonaId: string;
  vaultModels: VaultModelMeta[];
  onClose: () => void;
  onSelectPersona: (id: string) => void;
  onSavePersona: (persona: Persona) => void;
  onDuplicatePersona: (persona: Persona) => void;
  onDeletePersona: (id: string) => void;
  onImportPersonaJson: (persona: Persona) => void;
}

const ACCENT_PRESETS = ['#8b5cf6', '#f43f5e', '#38bdf8', '#10b981', '#f59e0b', '#ec4899'];

function createBlankPersona(): Persona {
  const now = Date.now();
  const id = `persona-custom-${now}`;
  const greetingJa =
    '*She crosses her arms under the studio rim light and glances away sharply.* "ふんっ！ べ、別にアンタのためじゃないんだからねっ！" (Hmph! I-It\'s not like it\'s for you or anything!) [MOOD: Deadpan]';
  const greetingEn =
    '*She crosses her arms under the studio rim light and glances away sharply.* "Hmph! Don\'t get the wrong idea—it\'s not like I\'m here for you!" [MOOD: Deadpan]';
  const parsed = parseDialogueResponse(greetingJa, 'Deadpan');

  return {
    id,
    name: 'New Studio Idol',
    japaneseName: '新キャラ',
    title: 'Custom Tsundere Persona',
    tagline: 'Custom roleplay persona with isolated chat & 3D wardrobe.',
    traits: 'Classic Japanese Tsundere, Proud, Sharp-tongued, Secretly Sweet',
    startingScenario:
      'Late evening inside the dark-glass 3D virtual idol studio with {{user}} after rehearsal.',
    accentColor: '#8b5cf6',
    gender: 'female',
    systemPrompt:
      'You are a sharp-witted Japanese Tsundere studio companion—proud and defensive on the surface, yet secretly caring underneath.',
    appearanceNotes: 'Dark studio attire with glowing violet accents.',
    greetingJa,
    greetingEn,
    mood: 'Deadpan',
    emotionIntensity: 0.72,
    affinity: 20,
    memoryJournal: [],
    lastMemorySummaryMsgCount: 0,
    brain: {
      energy: 82,
      hunger: 26,
      sleepiness: 18,
      boredom: 22,
      comfort: 80,
      curiosity: 54,
      isSleeping: false,
      nuancedFeeling: 'Calm & Guarded',
      carryover: null,
      currentThought: 'Hmph, a brand-new studio setup... let us see what Producer does.',
      thoughtStream: [
        {
          id: `th-init-${now}`,
          text: 'Hmph, a brand-new studio setup... let us see what Producer does.',
          trigger: 'idle',
          timestamp: now,
        },
      ],
      lastAutonomousActionAt: 0,
    },
    stageEnvironment: 'sunlit_boutique',
    customEnvironment: null,
    voice: {
      language: 'ja',
      gender: 'female',
      archetype: 'sharp_tsundere',
      voiceName: 'Aoede',
      pitch: 1.24,
      speed: 1.1,
      autoSpeak: true,
    },
    activeOutfitSlotId: `slot-default-${now}`,
    outfitSlots: [
      {
        id: `slot-default-${now}`,
        name: 'Slot 1: Lazy-Day White Tee & Shorts',
        modelVaultId: null,
        meshVisibility: {},
        materialMods: {},
        createdAt: now,
      },
    ],
    messages: [
      {
        id: `msg-init-${now}`,
        role: 'assistant',
        rawText: greetingJa,
        segments: parsed.segments,
        spokenText: parsed.spokenText,
        mood: parsed.mood,
        timestamp: now,
      },
    ],
    pendingSystemEvents: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const PersonaBuilderModal: React.FC<PersonaBuilderModalProps> = ({
  isOpen,
  personas,
  activePersonaId,
  vaultModels,
  onClose,
  onSelectPersona,
  onSavePersona,
  onDuplicatePersona,
  onDeletePersona,
  onImportPersonaJson,
}) => {
  const [editing, setEditing] = useState<Persona>(
    () => personas.find((p) => p.id === activePersonaId) || personas[0]
  );
  const [importError, setImportError] = useState('');
  const [newLinkedSlotName, setNewLinkedSlotName] = useState('');
  const [selectedVaultModelId, setSelectedVaultModelId] = useState<string>('');
  const importRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleSelectForEdit = (persona: Persona) => {
    setEditing({
      ...persona,
      voice: { ...persona.voice },
      outfitSlots: persona.outfitSlots.map((s) => ({ ...s })),
    });
    setImportError('');
  };

  const handleCreateNew = () => {
    const fresh = createBlankPersona();
    onSavePersona(fresh);
    setEditing(fresh);
    onSelectPersona(fresh.id);
  };

  const handleAddLinkedSlot = () => {
    const chosenVault = vaultModels.find((m) => m.id === selectedVaultModelId) || null;
    const slotNumber = editing.outfitSlots.length + 1;
    const slotName =
      newLinkedSlotName.trim() ||
      (chosenVault
        ? `Slot ${slotNumber}: ${chosenVault.fileName.replace(/\.(vrm|glb)$/i, '')}`
        : `Slot ${slotNumber}: Studio Outfit`);

    const newSlot: OutfitSlot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: slotName,
      modelVaultId: chosenVault ? chosenVault.id : null,
      meshVisibility: {},
      materialMods: {},
      createdAt: Date.now(),
    };

    setEditing({
      ...editing,
      outfitSlots: [...editing.outfitSlots, newSlot],
    });
    setNewLinkedSlotName('');
  };

  const handleRemoveLinkedSlot = (slotId: string) => {
    if (editing.outfitSlots.length <= 1) return;
    const nextSlots = editing.outfitSlots.filter((s) => s.id !== slotId);
    setEditing({
      ...editing,
      outfitSlots: nextSlots,
      activeOutfitSlotId:
        editing.activeOutfitSlotId === slotId ? nextSlots[0].id : editing.activeOutfitSlotId,
    });
  };

  const handleExport = async (persona: Persona) => {
    const json = JSON.stringify(persona, null, 2);
    const filename = `${persona.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.persona.json`;
    if (window.studioAPI?.exportJson) {
      await window.studioAPI.exportJson(filename, json);
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<Persona>;
      if (!parsed.name || !parsed.systemPrompt) {
        throw new Error('JSON must contain at least "name" and "systemPrompt".');
      }
      const base = createBlankPersona();
      const imported: Persona = {
        ...base,
        ...parsed,
        id: `persona-import-${Date.now()}`,
        voice: { ...base.voice, ...(parsed.voice || {}) },
        outfitSlots:
          Array.isArray(parsed.outfitSlots) && parsed.outfitSlots.length > 0
            ? parsed.outfitSlots
            : base.outfitSlots,
        messages:
          Array.isArray(parsed.messages) && parsed.messages.length > 0
            ? parsed.messages
            : base.messages,
        updatedAt: Date.now(),
      };
      imported.activeOutfitSlotId = imported.outfitSlots[0].id;
      onImportPersonaJson(imported);
      setEditing(imported);
      setImportError('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Invalid Persona JSON');
    }
  };

  const genderVoices = VOICES_BY_GENDER[editing.voice.gender];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div className="flex h-[88vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/[0.12] bg-[#0b0b15] shadow-glass">
        {/* Left: Persona Roster List */}
        <div className="flex w-72 shrink-0 flex-col border-r border-white/[0.08] bg-[#080810]">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-violet-400" />
              <h3 className="font-display text-sm font-bold text-white">Persona Roster</h3>
            </div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
              {personas.length}
            </span>
          </div>

          <div className="flex gap-1.5 border-b border-white/[0.08] p-3">
            <button
              type="button"
              onClick={handleCreateNew}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              <Plus className="h-3.5 w-3.5" />
              + New Persona
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
              title="Import Persona JSON"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
          </div>

          {importError && (
            <div className="mx-3 mt-2 rounded-xl border border-rose-500/30 bg-rose-950/40 p-2 text-[10px] text-rose-200">
              {importError}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {personas.map((p) => {
              const isSelected = editing.id === p.id;
              const isActive = activePersonaId === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectForEdit(p)}
                  className={`group cursor-pointer rounded-2xl border p-2.5 transition ${
                    isSelected
                      ? 'border-violet-400/55 bg-violet-500/15'
                      : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.accentColor }}
                      />
                      <span className="truncate text-xs font-semibold text-zinc-100">
                        {p.name}
                      </span>
                    </div>
                    {isActive && (
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-zinc-400">
                    {p.japaneseName} · {p.outfitSlots.length} outfits · {p.messages.length} msgs
                  </div>
                  <div className="mt-2 flex items-center gap-1 opacity-85">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPersona(p.id);
                      }}
                      className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-100 hover:bg-violet-500/40"
                    >
                      Stage
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicatePersona(p);
                      }}
                      className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                      title="Duplicate persona"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleExport(p);
                      }}
                      className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                      title="Export JSON"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    {personas.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePersona(p.id);
                          const remaining = personas.find((x) => x.id !== p.id);
                          if (remaining) handleSelectForEdit(remaining);
                        }}
                        className="ml-auto rounded-lg p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                        title="Delete persona"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Complete Persona Builder Form */}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
            <div>
              <h3 className="font-display text-base font-bold text-white">
                Persona Builder — {editing.name}
              </h3>
              <p className="text-xs text-zinc-400">
                Isolated chat history, [MOOD], voice profile, starting scenario &amp; linked 3D outfit slots.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  Name
                </label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs text-white outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  Japanese Name (日本語名)
                </label>
                <input
                  type="text"
                  value={editing.japaneseName}
                  onChange={(e) => setEditing({ ...editing, japaneseName: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs text-white outline-none focus:border-violet-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  Role / Subtitle
                </label>
                <input
                  type="text"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs text-white outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  Stage Accent Color
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {ACCENT_PRESETS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setEditing({ ...editing, accentColor: hex })}
                      className={`h-6 w-6 rounded-full border-2 transition ${
                        editing.accentColor === hex
                          ? 'scale-110 border-white'
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <input
                    type="color"
                    value={editing.accentColor}
                    onChange={(e) => setEditing({ ...editing, accentColor: e.target.value })}
                    className="h-6 w-8 cursor-pointer rounded bg-transparent"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  Persona Traits
                </label>
                <input
                  type="text"
                  value={editing.traits}
                  onChange={(e) => setEditing({ ...editing, traits: e.target.value })}
                  placeholder="e.g. Classic Tsundere, Sharp-tongued, Secretly Sweet"
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs text-white outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  Appearance Notes
                </label>
                <input
                  type="text"
                  value={editing.appearanceNotes}
                  onChange={(e) => setEditing({ ...editing, appearanceNotes: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs text-white outline-none focus:border-violet-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                Starting Scenario
              </label>
              <textarea
                rows={2}
                value={editing.startingScenario}
                onChange={(e) => setEditing({ ...editing, startingScenario: e.target.value })}
                placeholder="Describe where the roleplay begins..."
                className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs leading-relaxed text-zinc-100 outline-none focus:border-violet-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                Character System Prompt
              </label>
              <textarea
                rows={3}
                value={editing.systemPrompt}
                onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs leading-relaxed text-zinc-100 outline-none focus:border-violet-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  First Message (Japanese Anime 日本語)
                </label>
                <textarea
                  rows={2}
                  value={editing.greetingJa}
                  onChange={(e) => setEditing({ ...editing, greetingJa: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs leading-relaxed text-zinc-100 outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-400">
                  First Message (English Tsundere)
                </label>
                <textarea
                  rows={2}
                  value={editing.greetingEn}
                  onChange={(e) => setEditing({ ...editing, greetingEn: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs leading-relaxed text-zinc-100 outline-none focus:border-violet-400"
                />
              </div>
            </div>

            {/* Default Voice Language, Gender, Gemini Voice, Pitch & Archetype (Mood is strictly AI-driven) */}
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
              <div>
                <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                  Default Voice Language
                </label>
                <select
                  value={editing.voice.language}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      voice: { ...editing.voice, language: e.target.value as VoiceLanguage },
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#121220] px-2 py-1.5 text-xs text-white"
                >
                  <option value="ja">Japanese Anime (EN Subtitles)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                  Gender
                </label>
                <select
                  value={editing.voice.gender}
                  onChange={(e) => {
                    const g = e.target.value as VoiceGender;
                    const defaultVoice = VOICES_BY_GENDER[g][0].id;
                    setEditing({
                      ...editing,
                      gender: g,
                      voice: { ...editing.voice, gender: g, voiceName: defaultVoice },
                    });
                  }}
                  className="w-full rounded-lg border border-white/10 bg-[#121220] px-2 py-1.5 text-xs text-white"
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                  Gemini Voice
                </label>
                <select
                  value={editing.voice.voiceName}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      voice: {
                        ...editing.voice,
                        voiceName: e.target.value as GeminiVoiceName,
                      },
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#121220] px-2 py-1.5 text-xs text-white"
                >
                  {genderVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-1">
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-zinc-400">Default Pitch</span>
                  <span className="font-mono text-violet-300">
                    {editing.voice.pitch.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.85}
                  max={1.45}
                  step={0.01}
                  value={editing.voice.pitch}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      voice: { ...editing.voice, pitch: Number(e.target.value) },
                    })
                  }
                  className="w-full"
                />
              </div>

              <div className="col-span-2">
                <label className="mb-1 block text-[10px] font-semibold text-zinc-400">
                  Vocal Archetype
                </label>
                <select
                  value={editing.voice.archetype}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      voice: {
                        ...editing.voice,
                        archetype: e.target.value as VocalArchetype,
                      },
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#121220] px-2.5 py-1.5 text-xs text-white"
                >
                  {(Object.keys(VOCAL_ARCHETYPES) as VocalArchetype[]).map((k) => (
                    <option key={k} value={k}>
                      {VOCAL_ARCHETYPES[k].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Linked Outfit Slots Manager inside Persona Builder */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
                  <Shirt className="h-3.5 w-3.5 text-rose-300" />
                  Linked Outfit Slots ({editing.outfitSlots.length})
                </div>
                <span className="text-[10px] text-zinc-500">
                  Persisted per Persona ID in IndexedDB
                </span>
              </div>

              <div className="space-y-1.5">
                {editing.outfitSlots.map((slot) => {
                  const vaultMeta = slot.modelVaultId
                    ? vaultModels.find((m) => m.id === slot.modelVaultId)
                    : null;
                  return (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-[#121220] px-3 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-100">{slot.name}</div>
                        <div className="truncate text-[10px] text-zinc-500">
                          {vaultMeta ? vaultMeta.fileName : 'Default Anime .VRM Avatar'}
                        </div>
                      </div>
                      {editing.outfitSlots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLinkedSlot(slot.id)}
                          className="rounded-lg p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
                          title="Remove slot"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newLinkedSlotName}
                  onChange={(e) => setNewLinkedSlotName(e.target.value)}
                  placeholder="New slot name (e.g. Slot 4: Pajamas)"
                  className="flex-1 rounded-xl border border-white/10 bg-[#121220] px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-400"
                />
                <select
                  value={selectedVaultModelId}
                  onChange={(e) => setSelectedVaultModelId(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#121220] px-2.5 py-1.5 text-xs text-zinc-200"
                >
                  <option value="">Default Anime .VRM</option>
                  {vaultModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      Vault: {m.fileName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddLinkedSlot}
                  className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500/40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Slot
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.08] px-6 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onSavePersona({ ...editing, updatedAt: Date.now() });
                onSelectPersona(editing.id);
                onClose();
              }}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2 text-xs font-semibold text-white shadow-glow hover:brightness-110"
            >
              <Save className="h-3.5 w-3.5" />
              Save &amp; Activate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
