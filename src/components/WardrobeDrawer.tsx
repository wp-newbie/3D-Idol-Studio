import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  Eye,
  ImagePlus,
  Layers,
  Palette,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AccessoryAttachTarget,
  ClothingCategory,
  EquippedAccessory,
  MeshDescriptor,
  OutfitSlot,
  Persona,
  VaultAccessoryMeta,
  VaultModelMeta,
} from '../types/studio';
import { WARDROBE_SWATCHES } from '../data/presets';
import { formatBytes } from '../storage/modelVault';
import {
  CLOTHING_CATEGORY_META,
  CLOTHING_CATEGORY_ORDER,
} from '../stage/clothingModder';
import {
  formatWardrobeSummaryText,
  retrieveWardrobeInventory,
} from '../services/MemoryEngine';

interface WardrobeDrawerProps {
  isOpen: boolean;
  persona: Persona;
  activeSlot: OutfitSlot;
  detectedMeshes: MeshDescriptor[];
  vaultModels: VaultModelMeta[];
  autoReactOnOutfitChange: boolean;
  onToggleAutoReact: (next: boolean) => void;
  onClose: () => void;
  onSelectSlot: (slotId: string) => void;
  onRenameSlot: (slotId: string, nextName: string) => void;
  onUpdateYawOffset: (yawOffsetRadians: number) => void;
  onImportModelFile: (file: File, slotName?: string) => void;
  onLinkVaultModelAsSlot: (model: VaultModelMeta, slotName?: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onDeleteVaultModel: (modelId: string) => void;
  onToggleMeshVisibility: (
    meshName: string,
    nextVisible: boolean,
    displayLabel?: string
  ) => void;
  onSetAllMeshesVisible: (meshNames: string[]) => void;
  onResetMeshVisibility: () => void;
  onUpdateMaterialColor: (
    meshName: string,
    colorHex: string,
    swatchLabel?: string,
    displayLabel?: string
  ) => void;
  onUploadMaterialTexture: (
    meshName: string,
    file: File,
    displayLabel?: string
  ) => void;
  onResetMaterialMod: (meshName: string, displayLabel?: string) => void;
  onToggleCyclingShorts?: (next: boolean) => void;
  vaultAccessories: VaultAccessoryMeta[];
  onImportAccessoryFile: (
    file: File,
    customName?: string,
    attachTarget?: AccessoryAttachTarget
  ) => void;
  onEquipVaultAccessory: (
    accessory: VaultAccessoryMeta,
    attachTarget?: AccessoryAttachTarget
  ) => void;
  onUpdateEquippedAccessory: (
    accessoryId: string,
    patch: Partial<EquippedAccessory>
  ) => void;
  onRemoveEquippedAccessory: (accessoryId: string) => void;
  onDeleteVaultAccessory: (vaultAccessoryId: string) => void;
  onTriggerAiStylist?: () => void;
}

type WardrobeTab =
  | 'inventory_overview'
  | 'full_outfits'
  | 'accessories'
  | 'clothes_gear'
  | 'colors_textures';

export const WardrobeDrawer: React.FC<WardrobeDrawerProps> = ({
  isOpen,
  persona,
  activeSlot,
  detectedMeshes,
  vaultModels,
  autoReactOnOutfitChange,
  onToggleAutoReact,
  onClose,
  onSelectSlot,
  onRenameSlot,
  onUpdateYawOffset,
  onImportModelFile,
  onLinkVaultModelAsSlot,
  onDeleteSlot,
  onDeleteVaultModel,
  onToggleMeshVisibility,
  onSetAllMeshesVisible,
  onResetMeshVisibility,
  onUpdateMaterialColor,
  onUploadMaterialTexture,
  onResetMaterialMod,
  onToggleCyclingShorts,
  vaultAccessories,
  onImportAccessoryFile,
  onEquipVaultAccessory,
  onUpdateEquippedAccessory,
  onRemoveEquippedAccessory,
  onDeleteVaultAccessory,
  onTriggerAiStylist,
}) => {
  const [tab, setTab] = useState<WardrobeTab>('full_outfits');
  const [overviewSearch, setOverviewSearch] = useState('');
  const [isCopyingSummary, setIsCopyingSummary] = useState(false);
  const [selectedMeshName, setSelectedMeshName] = useState<string>('');
  const [newSlotName, setNewSlotName] = useState('');
  const [accessoryNameDraft, setAccessoryNameDraft] = useState('');
  const [attachTargetDraft, setAttachTargetDraft] =
    useState<AccessoryAttachTarget>('auto_fit');
  const [renamingSlotId, setRenamingSlotId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<
    Partial<Record<ClothingCategory, boolean>>
  >({});

  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const textureInputRef = useRef<HTMLInputElement | null>(null);
  const accessoryInputRef = useRef<HTMLInputElement | null>(null);

  const handleCopyWardrobeList = async () => {
    try {
      setIsCopyingSummary(true);
      const inventory = await retrieveWardrobeInventory({
        persona,
        detectedMeshes,
        overrideVaultModels: vaultModels,
      });
      const summaryText = formatWardrobeSummaryText(inventory);
      await navigator.clipboard.writeText(summaryText);
      setTimeout(() => setIsCopyingSummary(false), 2000);
    } catch (err) {
      console.warn('Failed to copy wardrobe list:', err);
      setIsCopyingSummary(false);
    }
  };

  const groupedMeshes = useMemo(() => {
    const groups = new Map<ClothingCategory, MeshDescriptor[]>();
    for (const cat of CLOTHING_CATEGORY_ORDER) {
      groups.set(cat, []);
    }
    for (const mesh of detectedMeshes) {
      const bucket = groups.get(mesh.category) || [];
      bucket.push(mesh);
      groups.set(mesh.category, bucket);
    }
    return CLOTHING_CATEGORY_ORDER.map((category) => ({
      category,
      meta: CLOTHING_CATEGORY_META[category],
      items: groups.get(category) || [],
    })).filter((g) => g.items.length > 0);
  }, [detectedMeshes]);

  if (!isOpen) return null;

  const activeMesh =
    detectedMeshes.find((m) => m.name === selectedMeshName) || detectedMeshes[0] || null;
  const activeMeshMod = activeMesh ? activeSlot.materialMods[activeMesh.name] : undefined;
  const activeYawRad =
    typeof activeSlot.yawOffset === 'number' && Number.isFinite(activeSlot.yawOffset)
      ? activeSlot.yawOffset
      : 0;
  const activeYawDeg = Math.round((activeYawRad * 180) / Math.PI);
  const setYawDegrees = (deg: number) => {
    const normalized = Math.max(-180, Math.min(180, Math.round(deg)));
    onUpdateYawOffset((normalized * Math.PI) / 180);
  };

  const toggleCategoryCollapse = (cat: ClothingCategory) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="absolute bottom-4 left-4 top-4 z-30 flex w-[400px] max-w-[92%] flex-col overflow-hidden rounded-3xl border border-white/[0.12] bg-[#0b0b15]/95 shadow-glass backdrop-blur-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-base" role="img" aria-label="wardrobe">
            👗
          </span>
          <div>
            <h3 className="font-display text-sm font-bold text-white">
              Wardrobe / Outfits Studio
            </h3>
            <p className="text-[11px] text-zinc-400">
              Saved per Persona in IndexedDB · Camera &amp; Chat preserved
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Live Tsundere Reaction Mode Switch */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-violet-950/20 px-4 py-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-violet-200">
          <Sparkles className="h-3.5 w-3.5 text-rose-400" />
          <span className="font-medium">Immediate Tsundere Reaction</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoReactOnOutfitChange}
          onClick={() => onToggleAutoReact(!autoReactOnOutfitChange)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            autoReactOnOutfitChange ? 'bg-rose-500' : 'bg-zinc-700'
          }`}
          title={
            autoReactOnOutfitChange
              ? 'Triggers an immediate Japanese Tsundere AI reaction on every outfit change'
              : 'Queues a hidden [SYSTEM EVENT] context note for the next chat turn'
          }
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              autoReactOnOutfitChange ? 'translate-x-4' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Five Clear Wardrobe Tabs */}
      <div className="grid grid-cols-5 gap-1 border-b border-white/[0.08] bg-[#080810]/85 p-1.5 text-[9.5px] font-semibold">
        <button
          type="button"
          onClick={() => setTab('inventory_overview')}
          className={`flex flex-col items-center justify-center rounded-xl px-1 py-1.5 leading-tight transition ${
            tab === 'inventory_overview'
              ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/45'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
          title="Overview of all saved wardrobe slots, vault models, and layers"
        >
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            <span>Overview</span>
          </span>
          <span className="mt-0.5 text-[8px] font-normal opacity-70">
            All
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('full_outfits')}
          className={`flex flex-col items-center justify-center rounded-xl px-1 py-1.5 leading-tight transition ${
            tab === 'full_outfits'
              ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/45'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
          title="Full VRM / XAvatar model variants & IndexedDB vault"
        >
          <span className="flex items-center gap-1">
            <Shirt className="h-3 w-3" />
            <span>Outfits</span>
          </span>
          <span className="mt-0.5 text-[8px] font-normal opacity-70">
            Slots ({persona.outfitSlots.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('accessories')}
          className={`flex flex-col items-center justify-center rounded-xl px-1 py-1.5 leading-tight transition ${
            tab === 'accessories'
              ? 'bg-fuchsia-500/25 text-fuchsia-100 ring-1 ring-fuchsia-400/45'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
          title="Upload & equip .xwear / .xavatar / .glb 3D accessories & dress-up items"
        >
          <span className="flex items-center gap-0.5">
            <span>🎀</span>
            <span>Add-Ons</span>
          </span>
          <span className="mt-0.5 text-[8px] font-normal opacity-70">
            ({(activeSlot.accessories || []).length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('clothes_gear')}
          className={`flex flex-col items-center justify-center rounded-xl px-1 py-1.5 leading-tight transition ${
            tab === 'clothes_gear'
              ? 'bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/45'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
          title="Toggle individual clothing pieces & accessories on the active model"
        >
          <span className="flex items-center gap-1">
            <SlidersHorizontal className="h-3 w-3" />
            <span>Pieces</span>
          </span>
          <span className="mt-0.5 text-[8px] font-normal opacity-70">
            ({detectedMeshes.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('colors_textures')}
          className={`flex flex-col items-center justify-center rounded-xl px-1 py-1.5 leading-tight transition ${
            tab === 'colors_textures'
              ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/45'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
          title="Material color tint swatches & custom .png diffuse textures"
        >
          <span className="flex items-center gap-1">
            <Palette className="h-3 w-3" />
            <span>Colors</span>
          </span>
          <span className="mt-0.5 text-[8px] font-normal opacity-70">
            Tint
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 0: Inventory Overview (All Saved & Layers) */}
        {tab === 'inventory_overview' && (
          <div className="space-y-4">
            {/* AI Auto-Stylist Action Banner */}
            <div className="rounded-2xl border border-violet-400/35 bg-gradient-to-r from-violet-950/50 via-fuchsia-950/40 to-violet-950/50 p-3 shadow-glass">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-base shadow-md">
                    ✨
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">AI Auto-Stylist</span>
                      <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/20 px-1.5 py-0.2 font-mono text-[9px] text-fuchsia-200">
                        Smart Fashion
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-300 truncate">
                      Let {persona.name} coordinate an outfit based on time &amp; mood
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onTriggerAiStylist?.()}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:from-violet-500 hover:to-fuchsia-500 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                  title="Ask your idol to style and equip an outfit matching the time of day and mood"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Style Me
                </button>
              </div>
            </div>

            {/* Search & Copy Actions Header */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={overviewSearch}
                  onChange={(e) => setOverviewSearch(e.target.value)}
                  placeholder="Search outfits, vault models, layers..."
                  className="w-full rounded-xl border border-white/10 bg-[#10101c] py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-400/60"
                />
                {overviewSearch && (
                  <button
                    type="button"
                    onClick={() => setOverviewSearch('')}
                    className="absolute right-2.5 top-2.5 rounded-lg p-0.5 text-zinc-400 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleCopyWardrobeList}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  isCopyingSummary
                    ? 'border-emerald-400/60 bg-emerald-500/25 text-emerald-200'
                    : 'border-amber-400/30 bg-amber-500/15 text-amber-200 hover:border-amber-400/60 hover:bg-amber-500/25'
                }`}
                title="Copy complete wardrobe inventory (slots, vault models, mesh layers) to clipboard"
              >
                {isCopyingSummary ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Wardrobe Inventory Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Full Wardrobe List (AI Prompt Ready)</span>
                  </>
                )}
              </button>
            </div>

            {/* Section 1: Persona Outfit Slots */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                  <Shirt className="h-3.5 w-3.5 text-violet-400" />
                  <span>Persona Outfit Slots</span>
                </div>
                <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-violet-200">
                  {persona.outfitSlots.length} Saved
                </span>
              </div>

              <div className="space-y-1.5">
                {persona.outfitSlots
                  .filter((s) => s.name.toLowerCase().includes(overviewSearch.toLowerCase()))
                  .map((slot, idx) => {
                    const isActive = slot.id === activeSlot.id;
                    const vaultMeta = slot.modelVaultId
                      ? vaultModels.find((m) => m.id === slot.modelVaultId)
                      : null;

                    return (
                      <div
                        key={slot.id}
                        onClick={() => onSelectSlot(slot.id)}
                        className={`group flex cursor-pointer items-center justify-between gap-2.5 rounded-2xl border p-2 transition ${
                          isActive
                            ? 'border-violet-400/55 bg-violet-500/20 shadow-glow'
                            : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {vaultMeta?.thumbnailDataUrl ? (
                            <img
                              src={vaultMeta.thumbnailDataUrl}
                              alt={slot.name}
                              className="h-8 w-8 rounded-lg object-cover border border-white/10 shrink-0"
                            />
                          ) : (
                            <div
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[10px] font-bold text-white"
                              style={{
                                background: `linear-gradient(135deg, ${persona.accentColor}88, #141422)`,
                              }}
                            >
                              #{idx + 1}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-semibold text-zinc-100">
                                {slot.name}
                              </span>
                              {isActive && (
                                <span className="rounded-md border border-emerald-400/35 bg-emerald-500/20 px-1 py-0.2 text-[9px] font-semibold text-emerald-300">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="truncate text-[10px] text-zinc-400">
                              {vaultMeta
                                ? `${vaultMeta.format.toUpperCase()} · ${vaultMeta.fileName}`
                                : 'Default VRM Base'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isActive ? (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-zinc-400 opacity-0 transition group-hover:opacity-100">
                              Equip
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Section 2: Saved Vault Models & Garments */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                  <Layers className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Vault 3D Models &amp; Garments</span>
                </div>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-200">
                  {vaultModels.length} in Vault
                </span>
              </div>

              {vaultModels.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-center text-[11px] text-zinc-500">
                  No 3D models saved in vault yet. Upload .vrm or .glb files in the Outfits tab.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {vaultModels
                    .filter((m) => m.fileName.toLowerCase().includes(overviewSearch.toLowerCase()))
                    .map((model) => {
                      const linkedSlot = persona.outfitSlots.find((s) => s.modelVaultId === model.id);
                      return (
                        <div
                          key={model.id}
                          className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {model.thumbnailDataUrl ? (
                              <img
                                src={model.thumbnailDataUrl}
                                alt={model.fileName}
                                className="h-8 w-8 rounded-lg object-cover border border-white/10 shrink-0"
                              />
                            ) : (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 font-mono text-[9px] font-bold text-cyan-300">
                                {model.format.toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium text-zinc-200">
                                {model.fileName}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                                <span className="font-mono">{model.format.toUpperCase()}</span>
                                <span>·</span>
                                <span>{formatBytes(model.sizeBytes)}</span>
                                {linkedSlot ? (
                                  <span className="text-violet-300">· Linked to &quot;{linkedSlot.name}&quot;</span>
                                ) : (
                                  <span className="text-amber-400 font-semibold">· Unassigned Garment</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {!linkedSlot && (
                              <button
                                type="button"
                                onClick={() => onLinkVaultModelAsSlot(model)}
                                className="flex items-center gap-1 rounded-lg bg-violet-600/30 px-2 py-1 text-[10px] font-semibold text-violet-200 transition hover:bg-violet-600/50"
                                title="Link as new Outfit Slot"
                              >
                                <Plus className="h-3 w-3" />
                                Link
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Section 3: Active Model Clothing & Accessory Layers */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-rose-400" />
                  <span>Active Model Layers ({detectedMeshes.length + 1})</span>
                </div>
                <span className="text-[10px] text-zinc-400">Live ON/OFF</span>
              </div>

              {/* Cycling Shorts Modesty Item */}
              <div className="mb-1.5 flex items-center justify-between gap-2.5 rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🚴‍♀️</span>
                    <span className="truncate text-xs font-semibold text-zinc-100">
                      Cycling Shorts (Safety Spats)
                    </span>
                    <span className="rounded-full border border-indigo-400/30 bg-indigo-500/20 px-1.5 py-0.2 font-mono text-[9px] text-indigo-200">
                      Innerwear
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    Modesty inner layer under skirt
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={activeSlot.cyclingShorts ?? true}
                  aria-label="Toggle Cycling Shorts"
                  onClick={() => onToggleCyclingShorts?.(!(activeSlot.cyclingShorts ?? true))}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                    (activeSlot.cyclingShorts ?? true)
                      ? 'border-emerald-400/50 bg-emerald-500/80'
                      : 'border-white/15 bg-zinc-800'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      (activeSlot.cyclingShorts ?? true) ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Detected Mesh Layers */}
              {detectedMeshes.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-center text-[11px] text-zinc-500">
                  No individual mesh sub-layers detected on the active model.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {detectedMeshes
                    .filter(
                      (m) =>
                        m.label.toLowerCase().includes(overviewSearch.toLowerCase()) ||
                        m.category.toLowerCase().includes(overviewSearch.toLowerCase()) ||
                        m.materialName.toLowerCase().includes(overviewSearch.toLowerCase())
                    )
                    .map((mesh) => {
                      const isVisible =
                        mesh.name in activeSlot.meshVisibility
                          ? activeSlot.meshVisibility[mesh.name]
                          : mesh.visible;

                      return (
                        <div
                          key={mesh.name}
                          className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2 px-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-medium text-zinc-100">
                                {mesh.label}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.2 font-mono text-[9px] text-zinc-400">
                                {mesh.category}
                              </span>
                            </div>
                            <div className="truncate font-mono text-[9px] text-zinc-500">
                              {mesh.materialName}
                            </div>
                          </div>

                          <button
                            type="button"
                            role="switch"
                            aria-checked={isVisible}
                            aria-label={`Toggle ${mesh.label}`}
                            onClick={() =>
                              onToggleMeshVisibility(mesh.name, !isVisible, mesh.label)
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                              isVisible
                                ? 'border-emerald-400/50 bg-emerald-500/80'
                                : 'border-white/15 bg-zinc-800'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                isVisible ? 'translate-x-4' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 1: Full Outfits (VRM Variants) */}
        {tab === 'full_outfits' && (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  {persona.name}&apos;s Full Outfits
                </span>
                <span className="text-[10px] text-zinc-500">Hot-Swap VRM Variant</span>
              </div>

              <div className="space-y-2">
                {persona.outfitSlots.map((slot) => {
                  const isActive = slot.id === activeSlot.id;
                  const vaultMeta = slot.modelVaultId
                    ? vaultModels.find((m) => m.id === slot.modelVaultId)
                    : null;
                  const isRenaming = renamingSlotId === slot.id;

                  return (
                    <div
                      key={slot.id}
                      onClick={() => !isRenaming && onSelectSlot(slot.id)}
                      className={`group flex cursor-pointer items-center justify-between gap-2 rounded-2xl border p-2.5 transition ${
                        isActive
                          ? 'border-violet-400/55 bg-violet-500/15 shadow-glow'
                          : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {vaultMeta?.thumbnailDataUrl ? (
                          <img
                            src={vaultMeta.thumbnailDataUrl}
                            alt={slot.name}
                            className="h-10 w-10 rounded-xl object-cover border border-white/10"
                          />
                        ) : (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-xs font-bold text-white"
                            style={{
                              background: `linear-gradient(135deg, ${persona.accentColor}88, #141422)`,
                            }}
                          >
                            {slot.modelVaultId ? '3D' : 'VRM'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {isRenaming ? (
                            <input
                              type="text"
                              autoFocus
                              value={renameDraft}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (renameDraft.trim()) onRenameSlot(slot.id, renameDraft.trim());
                                  setRenamingSlotId(null);
                                } else if (e.key === 'Escape') {
                                  setRenamingSlotId(null);
                                }
                              }}
                              onBlur={() => {
                                if (renameDraft.trim()) onRenameSlot(slot.id, renameDraft.trim());
                                setRenamingSlotId(null);
                              }}
                              className="w-full rounded-lg border border-violet-400 bg-[#121220] px-2 py-0.5 text-xs text-white outline-none"
                            />
                          ) : (
                            <div className="truncate text-xs font-semibold text-zinc-100">
                              {slot.name}
                            </div>
                          )}
                          <div className="truncate text-[10px] text-zinc-400">
                            {vaultMeta
                              ? `${vaultMeta.fileName} (${vaultMeta.format.toUpperCase()})`
                              : 'Default Anime .VRM (or latest uploaded)'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingSlotId(slot.id);
                            setRenameDraft(slot.name);
                          }}
                          className="rounded-lg p-1 text-zinc-500 opacity-0 transition hover:bg-white/10 hover:text-zinc-200 group-hover:opacity-100"
                          title="Rename outfit slot"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        {isActive && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        {persona.outfitSlots.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSlot(slot.id);
                            }}
                            className="rounded-lg p-1 text-zinc-500 opacity-0 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100"
                            title="Remove outfit slot"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-Outfit Yaw Calibration (straighten sideways .VRM/.GLB exports) */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                  <RotateCw className="h-3.5 w-3.5 text-cyan-300" />
                  <span>Model Facing Calibration</span>
                </div>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-200">
                  {activeYawDeg > 0 ? `+${activeYawDeg}°` : `${activeYawDeg}°`}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {([-90, 0, 90, 180] as const).map((deg) => {
                  const isSelected = Math.abs(activeYawDeg - deg) <= 1;
                  const label = deg === 0 ? '0° Front' : deg > 0 ? `+${deg}°` : `${deg}°`;
                  return (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setYawDegrees(deg)}
                      className={`rounded-xl border py-1.5 font-mono text-[11px] font-semibold transition ${
                        isSelected
                          ? 'border-cyan-400/60 bg-cyan-500/25 text-cyan-100'
                          : 'border-white/10 bg-[#10101c] text-zinc-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {activeYawDeg !== 0 && (
                <button
                  type="button"
                  onClick={() => setYawDegrees(0)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/20 py-1.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/35"
                >
                  <RotateCcw className="h-3 w-3 text-cyan-300" />
                  <span>Reset Facing to Front (0°)</span>
                </button>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span>Fine-Tune Yaw (-180° to +180°)</span>
                  <span>Saved per outfit slot</span>
                </div>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={activeYawDeg}
                  aria-label="Outfit Yaw Calibration Degrees"
                  onChange={(e) => setYawDegrees(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>

            {/* Import New .VRM / .GLB to IndexedDB Vault */}
            <div className="rounded-2xl border border-dashed border-violet-400/35 bg-violet-950/15 p-3">
              <div className="text-xs font-semibold text-violet-200">
                Link New Outfit / 3D Model / VRoid Custom Item
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Supports .VRM, .GLB, .XWEAR, and VRoid Studio Custom Items (.vroidcustomitem).
              </p>

              <input
                type="text"
                value={newSlotName}
                onChange={(e) => setNewSlotName(e.target.value)}
                placeholder="Slot name (e.g. Galaxy Dress, Summer Idol Uniform)"
                className="mt-2.5 w-full rounded-xl border border-white/10 bg-[#10101c] px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400"
              />

              <input
                ref={modelInputRef}
                type="file"
                accept=".vrm,.glb,.xavatar,.xwear,.vroidcustomitem"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportModelFile(file, newSlotName.trim() || undefined);
                    setNewSlotName('');
                    e.target.value = '';
                  }
                }}
              />

              <button
                type="button"
                onClick={() => modelInputRef.current?.click()}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600/85 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload .VRM / .GLB / .XWEAR / .vroidcustomitem
              </button>
            </div>

            {/* Saved IndexedDB Model Vault */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  IndexedDB .VRM / .GLB Vault ({vaultModels.length})
                </span>
              </div>

              {vaultModels.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-center text-[11px] text-zinc-500">
                  No imported .vrm/.glb files in Vault yet. Drop a file onto the 3D stage or upload above.
                </div>
              ) : (
                <div className="space-y-2">
                  {vaultModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {model.thumbnailDataUrl ? (
                          <img
                            src={model.thumbnailDataUrl}
                            alt={model.fileName}
                            className="h-9 w-9 rounded-lg object-cover border border-white/10"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 font-mono text-[10px] font-bold text-violet-300">
                            {model.format.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-zinc-200">
                            {model.fileName}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {model.format.toUpperCase()} · {formatBytes(model.sizeBytes)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onLinkVaultModelAsSlot(model, newSlotName.trim() || undefined)
                          }
                          className="flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-100 transition hover:bg-violet-500/40"
                          title="Link to persona as a new Outfit Slot"
                        >
                          <Plus className="h-3 w-3" />
                          Link
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteVaultModel(model.id)}
                          className="rounded-lg p-1 text-zinc-500 transition hover:bg-rose-500/20 hover:text-rose-300"
                          title="Delete from IndexedDB Vault"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modesty / Cycling Shorts Under Skirt */}
            <div className="rounded-2xl border border-indigo-500/25 bg-indigo-950/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">🚴‍♀️</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                      <span>Cycling Shorts (Safety Spats)</span>
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono text-emerald-200">
                        Anti-Exposure
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      Modesty layer under skirt (prevents underwear exposure while sitting &amp; roaming)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={activeSlot.cyclingShorts ?? true}
                  aria-label="Toggle Cycling Shorts"
                  onClick={() => onToggleCyclingShorts?.(!(activeSlot.cyclingShorts ?? true))}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                    (activeSlot.cyclingShorts ?? true)
                      ? 'border-emerald-400/50 bg-emerald-500/80'
                      : 'border-white/15 bg-zinc-800'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      (activeSlot.cyclingShorts ?? true) ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </>
        )}

        {/* TAB 1B: 3D Accessories & .XWEAR Dress-Up */}
        {tab === 'accessories' && (
          <div className="space-y-4">
            {/* Upload .xwear / .xavatar / .glb / .vrm Accessory */}
            <div className="rounded-2xl border border-dashed border-fuchsia-400/35 bg-fuchsia-950/15 p-3">
              <div className="text-xs font-semibold text-fuchsia-200">
                Upload 3D Accessory / .XWEAR Dress-Up
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Supports <code className="text-fuchsia-200">.xwear</code>,{' '}
                <code className="text-fuchsia-200">.xavatar</code>,{' '}
                <code className="text-fuchsia-200">.glb</code>, and{' '}
                <code className="text-fuchsia-200">.vrm</code> props/outfits. Auto-fits to body or attaches to a bone.
              </p>

              <input
                type="text"
                value={accessoryNameDraft}
                onChange={(e) => setAccessoryNameDraft(e.target.value)}
                placeholder="Accessory name (optional, e.g. Cat Ears / Ribbon)"
                className="mt-2.5 w-full rounded-xl border border-white/10 bg-[#10101c] px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-fuchsia-400"
              />

              <select
                value={attachTargetDraft}
                onChange={(e) =>
                  setAttachTargetDraft(e.target.value as AccessoryAttachTarget)
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#10101c] px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-fuchsia-400"
              >
                <option value="auto_fit">Auto-Fit to Body (.xwear / .xavatar Dress-Up)</option>
                <option value="head">Head (Hats / Glasses / Ears / Hairpins)</option>
                <option value="neck">Neck (Choker / Tie / Ribbon / Scarf)</option>
                <option value="chest">Chest / Back (Wings / Cape / Bag)</option>
                <option value="hips">Hips / Waist (Belt / Tail)</option>
                <option value="rightHand">Right Hand (Mic / Wand / Prop)</option>
                <option value="leftHand">Left Hand (Prop)</option>
                <option value="root">Avatar Floor Root</option>
              </select>

              <input
                ref={accessoryInputRef}
                type="file"
                accept=".xwear,.xavatar,.glb,.vrm,.vroidcustomitem"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportAccessoryFile(
                      file,
                      accessoryNameDraft.trim() || undefined,
                      attachTargetDraft
                    );
                    setAccessoryNameDraft('');
                    e.target.value = '';
                  }
                }}
              />

              <button
                type="button"
                onClick={() => accessoryInputRef.current?.click()}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-600/85 px-3 py-2 text-xs font-semibold text-white transition hover:bg-fuchsia-500"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload .XWEAR / .GLB / .vroidcustomitem Accessory
              </button>
            </div>

            {/* Equipped on Active Outfit */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Equipped on {activeSlot.name} ({(activeSlot.accessories || []).length})
              </div>

              {(activeSlot.accessories || []).length === 0 ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-center text-[11px] text-zinc-500">
                  No 3D accessories equipped yet. Upload an item above or equip from your Accessory Vault below.
                </div>
              ) : (
                <div className="space-y-3">
                  {(activeSlot.accessories || []).map((acc) => (
                    <div
                      key={acc.id}
                      className="space-y-2.5 rounded-2xl border border-fuchsia-400/25 bg-white/[0.03] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-zinc-100">
                              {acc.name}
                            </span>
                            <span className="rounded bg-fuchsia-500/25 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-fuchsia-200">
                              {acc.format}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={acc.visible}
                            onClick={() =>
                              onUpdateEquippedAccessory(acc.id, { visible: !acc.visible })
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                              acc.visible ? 'bg-emerald-500/80' : 'bg-zinc-700'
                            }`}
                            title="Show / Hide accessory"
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                acc.visible ? 'translate-x-4' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveEquippedAccessory(acc.id)}
                            className="rounded-lg p-1 text-zinc-500 transition hover:bg-rose-500/20 hover:text-rose-300"
                            title="Unequip from this outfit"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <select
                          value={acc.attachTarget}
                          onChange={(e) =>
                            onUpdateEquippedAccessory(acc.id, {
                              attachTarget: e.target.value as AccessoryAttachTarget,
                            })
                          }
                          className="rounded-lg border border-white/10 bg-[#10101c] px-2 py-1 text-[11px] text-zinc-200 outline-none focus:border-fuchsia-400"
                        >
                          <option value="auto_fit">Auto-Fit Body (.xwear)</option>
                          <option value="head">Head</option>
                          <option value="neck">Neck</option>
                          <option value="chest">Chest / Back</option>
                          <option value="hips">Hips / Waist</option>
                          <option value="rightHand">Right Hand</option>
                          <option value="leftHand">Left Hand</option>
                          <option value="root">Avatar Root</option>
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            onUpdateEquippedAccessory(acc.id, {
                              position: [0, 0, 0],
                              rotationDeg: [0, 0, 0],
                              scale: 1,
                            })
                          }
                          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-300 hover:bg-white/10"
                          title="Reset position, rotation & scale"
                        >
                          Reset Fit
                        </button>
                      </div>

                      {/* Sizing & Scale Controls */}
                      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-zinc-200">
                            Accessory Size / Scale
                          </span>
                          <span className="font-mono text-[11px] font-bold text-fuchsia-300">
                            {(acc.scale || 1).toFixed(2)}x ({Math.round((acc.scale || 1) * 100)}%)
                          </span>
                        </div>

                        {/* Step Increase / Decrease Buttons */}
                        <div className="grid grid-cols-4 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.max(0.05, Math.round(((acc.scale || 1) - 0.1) * 100) / 100);
                              onUpdateEquippedAccessory(acc.id, { scale: next });
                            }}
                            className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 py-1 text-[10.5px] font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
                            title="Decrease size by 10%"
                          >
                            -10%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.max(0.05, Math.round(((acc.scale || 1) - 0.05) * 100) / 100);
                              onUpdateEquippedAccessory(acc.id, { scale: next });
                            }}
                            className="flex items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/15 py-1 text-[10.5px] font-semibold text-rose-200 transition hover:bg-rose-500/25"
                            title="Decrease size by 5%"
                          >
                            -5%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.min(5.0, Math.round(((acc.scale || 1) + 0.05) * 100) / 100);
                              onUpdateEquippedAccessory(acc.id, { scale: next });
                            }}
                            className="flex items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15 py-1 text-[10.5px] font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                            title="Increase size by 5%"
                          >
                            +5%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.min(5.0, Math.round(((acc.scale || 1) + 0.1) * 100) / 100);
                              onUpdateEquippedAccessory(acc.id, { scale: next });
                            }}
                            className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 py-1 text-[10.5px] font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
                            title="Increase size by 10%"
                          >
                            +10%
                          </button>
                        </div>

                        {/* Quick Sizing Presets */}
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                          {[0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 2.0].map((presetScale) => (
                            <button
                              key={presetScale}
                              type="button"
                              onClick={() => onUpdateEquippedAccessory(acc.id, { scale: presetScale })}
                              className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] transition ${
                                Math.abs((acc.scale || 1) - presetScale) < 0.02
                                  ? 'bg-fuchsia-500 text-white font-bold'
                                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                              }`}
                            >
                              {Math.round(presetScale * 100)}%
                            </button>
                          ))}
                        </div>

                        {/* Sizing Slider (0.05x to 4.00x) */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9.5px] text-zinc-400">Fine:</span>
                          <input
                            type="range"
                            min={0.05}
                            max={4.0}
                            step={0.01}
                            value={acc.scale || 1}
                            onChange={(e) =>
                              onUpdateEquippedAccessory(acc.id, {
                                scale: Number(e.target.value),
                              })
                            }
                            className="flex-1 accent-fuchsia-400"
                          />
                        </div>

                        {/* 3D Axis Stretch Sizing (Width, Height, Depth) */}
                        <details className="pt-1">
                          <summary className="cursor-pointer text-[9.5px] font-medium text-zinc-400 hover:text-zinc-200">
                            3D Axis Sizing (Width / Height / Depth)
                          </summary>
                          <div className="mt-1.5 space-y-1.5 pl-1 border-l border-white/10">
                            {[
                              { label: 'Width (X)', idx: 0 },
                              { label: 'Height (Y)', idx: 1 },
                              { label: 'Depth (Z)', idx: 2 },
                            ].map(({ label, idx }) => {
                              const axisScale = acc.scaleXYZ?.[idx] ?? 1;
                              return (
                                <div key={label} className="flex items-center justify-between gap-2">
                                  <span className="text-[9px] text-zinc-400">
                                    {label} ({axisScale.toFixed(2)}x)
                                  </span>
                                  <input
                                    type="range"
                                    min={0.2}
                                    max={3.0}
                                    step={0.02}
                                    value={axisScale}
                                    onChange={(e) => {
                                      const nextXYZ: [number, number, number] = [
                                        acc.scaleXYZ?.[0] ?? 1,
                                        acc.scaleXYZ?.[1] ?? 1,
                                        acc.scaleXYZ?.[2] ?? 1,
                                      ];
                                      nextXYZ[idx] = Number(e.target.value);
                                      onUpdateEquippedAccessory(acc.id, { scaleXYZ: nextXYZ });
                                    }}
                                    className="w-32 accent-violet-400"
                                  />
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateEquippedAccessory(acc.id, { scaleXYZ: [1, 1, 1] })
                              }
                              className="text-[9px] text-zinc-500 hover:text-zinc-300"
                            >
                              Reset Axis Scale to 1.0x
                            </button>
                          </div>
                        </details>
                      </div>

                      <div className="space-y-1.5 text-[10px] text-zinc-400">
                        {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                          <div key={axis} className="flex items-center justify-between gap-2">
                            <span>
                              Offset {axis} ({acc.position[idx].toFixed(2)}m)
                            </span>
                            <input
                              type="range"
                              min={-1.0}
                              max={1.0}
                              step={0.01}
                              value={acc.position[idx]}
                              onChange={(e) => {
                                const nextPos: [number, number, number] = [...acc.position];
                                nextPos[idx] = Number(e.target.value);
                                onUpdateEquippedAccessory(acc.id, { position: nextPos });
                              }}
                              className="w-40 accent-cyan-400"
                            />
                          </div>
                        ))}
                        {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                          <div key={`rot-${axis}`} className="flex items-center justify-between gap-2">
                            <span>
                              Rotate {axis} ({acc.rotationDeg[idx]}°)
                            </span>
                            <input
                              type="range"
                              min={-180}
                              max={180}
                              step={1}
                              value={acc.rotationDeg[idx]}
                              onChange={(e) => {
                                const nextRot: [number, number, number] = [...acc.rotationDeg];
                                nextRot[idx] = Number(e.target.value);
                                onUpdateEquippedAccessory(acc.id, { rotationDeg: nextRot });
                              }}
                              className="w-40 accent-violet-400"
                            />
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span>Color Tint</span>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={acc.colorHex || '#ffffff'}
                              onChange={(e) =>
                                onUpdateEquippedAccessory(acc.id, {
                                  colorHex: e.target.value,
                                })
                              }
                              className="h-5 w-8 cursor-pointer rounded border border-white/15 bg-transparent"
                            />
                            {acc.colorHex && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateEquippedAccessory(acc.id, { colorHex: undefined })
                                }
                                className="text-[10px] text-zinc-400 hover:text-rose-300"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Saved Accessory Vault */}
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                IndexedDB Accessory Vault ({vaultAccessories.length})
              </div>
              {vaultAccessories.length === 0 ? (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-center text-[11px] text-zinc-500">
                  No saved accessories yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {vaultAccessories.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {acc.thumbnailDataUrl ? (
                          <img
                            src={acc.thumbnailDataUrl}
                            alt={acc.name}
                            className="h-9 w-9 rounded-lg border border-white/10 object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 font-mono text-[9px] font-bold uppercase text-fuchsia-200">
                            {acc.format}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-zinc-200">
                            {acc.name}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {acc.format.toUpperCase()} · {formatBytes(acc.sizeBytes)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEquipVaultAccessory(acc)}
                          className="flex items-center gap-1 rounded-lg bg-fuchsia-500/25 px-2 py-1 text-[10px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/45"
                        >
                          <Plus className="h-3 w-3" />
                          Equip
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteVaultAccessory(acc.id)}
                          className="rounded-lg p-1 text-zinc-500 transition hover:bg-rose-500/20 hover:text-rose-300"
                          title="Delete from Accessory Vault"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Clothes & Gear (Toggle Pieces) */}
        {tab === 'clothes_gear' && (
          <div className="space-y-3">
            {/* Quick Controls Bar */}
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2">
              <button
                type="button"
                disabled={detectedMeshes.length === 0}
                onClick={() => onSetAllMeshesVisible(detectedMeshes.map((m) => m.name))}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-40"
              >
                <Eye className="h-3.5 w-3.5" />
                All Clothes On
              </button>
              <button
                type="button"
                disabled={detectedMeshes.length === 0}
                onClick={onResetMeshVisibility}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Default
              </button>
            </div>

            {/* Cycling Shorts in Clothes & Gear */}
            <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-indigo-500/25 bg-indigo-950/20 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🚴‍♀️</span>
                  <span className="truncate text-xs font-semibold text-zinc-100">
                    Cycling Shorts (Safety Spats)
                  </span>
                  <span className="rounded-full border border-indigo-400/30 bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[9px] text-indigo-200">
                    Bottoms · Innerwear
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-400 truncate">
                  Modesty inner shorts under skirt so panties never show while sitting
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={activeSlot.cyclingShorts ?? true}
                aria-label="Toggle Cycling Shorts"
                onClick={() => onToggleCyclingShorts?.(!(activeSlot.cyclingShorts ?? true))}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                  (activeSlot.cyclingShorts ?? true)
                    ? 'border-emerald-400/50 bg-emerald-500/80'
                    : 'border-white/15 bg-zinc-800'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    (activeSlot.cyclingShorts ?? true) ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-zinc-400">
              Categorized from VRoid Studio material IDs (core skin &amp; face meshes safely hidden). Toggle individual pieces live:
            </p>

            {groupedMeshes.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center text-xs text-zinc-500">
                No removable clothing or accessory meshes detected on this model.
              </div>
            ) : (
              <div className="space-y-2.5">
                {groupedMeshes.map(({ category, meta, items }) => {
                  const isCollapsed = Boolean(collapsedCategories[category]);
                  const visibleCount = items.filter((mesh) =>
                    mesh.name in activeSlot.meshVisibility
                      ? activeSlot.meshVisibility[mesh.name]
                      : mesh.visible
                  ).length;

                  return (
                    <div
                      key={category}
                      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]"
                    >
                      {/* Collapsible Category Header */}
                      <button
                        type="button"
                        onClick={() => toggleCategoryCollapse(category)}
                        className="flex w-full items-center justify-between bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]"
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                          )}
                          <span className="text-sm">{meta.emoji}</span>
                          <span className="text-xs font-bold text-zinc-100">
                            {meta.title}
                          </span>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${meta.badgeClass}`}
                        >
                          {visibleCount}/{items.length}
                        </span>
                      </button>

                      {/* Category Piece Toggles */}
                      {!isCollapsed && (
                        <div className="divide-y divide-white/[0.05]">
                          {items.map((mesh) => {
                            const isVisible =
                              mesh.name in activeSlot.meshVisibility
                                ? activeSlot.meshVisibility[mesh.name]
                                : mesh.visible;

                            return (
                              <div
                                key={mesh.name}
                                className="flex items-center justify-between gap-2.5 px-3.5 py-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-xs font-semibold text-zinc-100">
                                      {mesh.label}
                                    </span>
                                  </div>
                                  <div
                                    className="mt-0.5 truncate font-mono text-[10px] text-zinc-500"
                                    title={`Material: ${mesh.materialName} · Mesh Node: ${mesh.name}`}
                                  >
                                    {mesh.materialName}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={isVisible}
                                  aria-label={`Toggle ${mesh.label}`}
                                  onClick={() =>
                                    onToggleMeshVisibility(mesh.name, !isVisible, mesh.label)
                                  }
                                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                                    isVisible
                                      ? 'border-emerald-400/50 bg-emerald-500/80'
                                      : 'border-white/15 bg-zinc-800'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                      isVisible ? 'translate-x-5' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Colors & Textures */}
        {tab === 'colors_textures' && (
          <div className="space-y-4">
            <p className="text-[11px] text-zinc-400">
              Select any clothing or hair material to tint (<code className="text-cyan-300">material.color</code> / MToon <code className="text-cyan-300">shadeColorFactor</code>) or replace its diffuse map with a persisted <code className="text-cyan-300">.png</code> texture in IndexedDB.
            </p>

            {/* Target Clothing Material Selector (grouped visually with category icons) */}
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Clothing &amp; Hair Material
              </label>
              <div className="flex flex-wrap gap-1.5">
                {detectedMeshes.map((mesh) => {
                  const selected = activeMesh?.name === mesh.name;
                  const catMeta = CLOTHING_CATEGORY_META[mesh.category];
                  return (
                    <button
                      key={mesh.name}
                      type="button"
                      onClick={() => setSelectedMeshName(mesh.name)}
                      title={`${catMeta.title} · ${mesh.materialName}`}
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium transition ${
                        selected
                          ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-white/25"
                        style={{ backgroundColor: mesh.currentColorHex }}
                      />
                      <span>{mesh.label}</span>
                    </button>
                  );
                })}
              </div>
              {activeMesh && (
                <div className="mt-1.5 truncate font-mono text-[10px] text-zinc-500">
                  {CLOTHING_CATEGORY_META[activeMesh.category].emoji}{' '}
                  {CLOTHING_CATEGORY_META[activeMesh.category].title} ·{' '}
                  {activeMesh.materialName}
                </div>
              )}
            </div>

            {activeMesh && (
              <>
                {/* Quick Preset Swatches */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Quick Preset Swatches
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-zinc-500">Custom</span>
                      <input
                        type="color"
                        aria-label="Custom clothing tint color"
                        value={activeMeshMod?.colorHex || activeMesh.currentColorHex}
                        onChange={(e) =>
                          onUpdateMaterialColor(
                            activeMesh.name,
                            e.target.value,
                            undefined,
                            activeMesh.label
                          )
                        }
                        className="h-6 w-9 cursor-pointer rounded-md border border-white/15 bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {WARDROBE_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() =>
                          onUpdateMaterialColor(
                            activeMesh.name,
                            swatch.hex,
                            swatch.name,
                            activeMesh.label
                          )
                        }
                        title={swatch.name}
                        className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-white/30 hover:bg-white/[0.07]"
                      >
                        <span
                          className="h-5 w-5 shrink-0 rounded-md border border-white/25 shadow-sm transition group-hover:scale-110"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <span className="truncate text-[10px] font-medium text-zinc-200">
                          {swatch.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom PNG Texture Overlay */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-100">
                      Custom .PNG Texture Overlay
                    </span>
                    {(activeMeshMod?.colorHex ||
                      activeMeshMod?.textureDataUrl ||
                      activeMeshMod?.textureVaultId) && (
                      <button
                        type="button"
                        onClick={() => onResetMaterialMod(activeMesh.name, activeMesh.label)}
                        className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-rose-300"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </button>
                    )}
                  </div>

                  {(activeMeshMod?.textureDataUrl || activeMeshMod?.textureVaultId) && (
                    <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 p-2">
                      {activeMeshMod.textureDataUrl ? (
                        <img
                          src={activeMeshMod.textureDataUrl}
                          alt="Custom texture preview"
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20 font-mono text-[10px] text-cyan-200">
                          PNG
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium text-cyan-200">
                          {activeMeshMod.textureFileName || 'Persisted Texture'}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          Saved in IndexedDB · Live TextureLoader map
                        </div>
                      </div>
                    </div>
                  )}

                  <input
                    ref={textureInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.vroidcustomitem"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onUploadMaterialTexture(activeMesh.name, file, activeMesh.label);
                        e.target.value = '';
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => textureInputRef.current?.click()}
                    className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-500/15 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Upload .PNG Texture onto {activeMesh.label}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
