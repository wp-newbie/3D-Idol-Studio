import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  ImagePlus,
  Palette,
  Plus,
  RotateCcw,
  RotateCw,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  ClothingCategory,
  MeshDescriptor,
  OutfitSlot,
  Persona,
  VaultModelMeta,
} from '../types/studio';
import { WARDROBE_SWATCHES } from '../data/presets';
import { formatBytes } from '../storage/modelVault';
import {
  CLOTHING_CATEGORY_META,
  CLOTHING_CATEGORY_ORDER,
} from '../stage/clothingModder';

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
}

type WardrobeTab = 'full_outfits' | 'clothes_gear' | 'colors_textures';

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
}) => {
  const [tab, setTab] = useState<WardrobeTab>('full_outfits');
  const [selectedMeshName, setSelectedMeshName] = useState<string>('');
  const [newSlotName, setNewSlotName] = useState('');
  const [renamingSlotId, setRenamingSlotId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<
    Partial<Record<ClothingCategory, boolean>>
  >({});

  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const textureInputRef = useRef<HTMLInputElement | null>(null);

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

      {/* Three Clear Wardrobe Tabs */}
      <div className="grid grid-cols-3 gap-1 border-b border-white/[0.08] bg-[#080810]/85 p-1.5 text-[10.5px] font-semibold">
        <button
          type="button"
          onClick={() => setTab('full_outfits')}
          className={`flex flex-col items-center justify-center rounded-xl px-1.5 py-2 leading-tight transition ${
            tab === 'full_outfits'
              ? 'bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/45'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
          title="Full VRM model variants & IndexedDB .vrm/.glb vault"
        >
          <span className="flex items-center gap-1">
            <Shirt className="h-3.5 w-3.5" />
            <span>Full Outfits</span>
          </span>
          <span className="mt-0.5 text-[9px] font-normal opacity-70">
            VRM Variants ({persona.outfitSlots.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('clothes_gear')}
          className={`flex flex-col items-center justify-center rounded-xl px-1.5 py-2 leading-tight transition ${
            tab === 'clothes_gear'
              ? 'bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/45'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
          title="Toggle individual clothing pieces & accessories on the active model"
        >
          <span className="flex items-center gap-1">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Clothes &amp; Gear</span>
          </span>
          <span className="mt-0.5 text-[9px] font-normal opacity-70">
            Toggle Pieces ({detectedMeshes.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('colors_textures')}
          className={`flex flex-col items-center justify-center rounded-xl px-1.5 py-2 leading-tight transition ${
            tab === 'colors_textures'
              ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/45'
              : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
          }`}
          title="Material color tint swatches & custom .png diffuse textures"
        >
          <span className="flex items-center gap-1">
            <Palette className="h-3.5 w-3.5" />
            <span>Colors &amp; Textures</span>
          </span>
          <span className="mt-0.5 text-[9px] font-normal opacity-70">
            Swatches &amp; .PNG
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                      {deg > 0 ? `+${deg}°` : `${deg}°`}
                    </button>
                  );
                })}
              </div>

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
                Link New .VRM / .GLB Full Outfit Variant
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Saved persistently in IndexedDB with auto-captured stage thumbnails.
              </p>

              <input
                type="text"
                value={newSlotName}
                onChange={(e) => setNewSlotName(e.target.value)}
                placeholder="Slot name (e.g. Crimson Nocturne Stage Dress)"
                className="mt-2.5 w-full rounded-xl border border-white/10 bg-[#10101c] px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-400"
              />

              <input
                ref={modelInputRef}
                type="file"
                accept=".vrm,.glb"
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
                Upload .VRM or .GLB to Vault &amp; Link Slot
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
          </>
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
                    accept="image/png,image/jpeg,image/webp"
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
