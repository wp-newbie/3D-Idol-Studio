import type {
  ClothingCategory,
  MeshDescriptor,
  OutfitSlot,
  Persona,
  VaultModelMeta,
} from '../types/studio';
import { vaultDB } from '../storage/modelVault';

export interface WardrobeOutfitSlotInfo {
  id: string;
  name: string;
  isEquipped: boolean;
  modelVaultId: string | null;
  cyclingShorts: boolean;
}

export interface WardrobeClothingLayerInfo {
  name: string;
  label: string;
  category: ClothingCategory;
  materialName: string;
  visible: boolean;
}

export interface WardrobeInventory {
  personaId: string;
  personaName: string;
  equippedSlot: OutfitSlot | null;
  outfitSlots: WardrobeOutfitSlotInfo[];
  vaultModels: VaultModelMeta[];
  clothingLayers: WardrobeClothingLayerInfo[];
}

/**
 * Retrieves the full wardrobe inventory for the active persona, including:
 * 1. Persona Outfit Slots (marking currently equipped).
 * 2. Saved .VRM / .GLB models & modular garments in IndexedDB vaultDB.
 * 3. Detected clothing / accessory mesh layers on the currently loaded 3D model with ON/OFF status.
 */
export async function retrieveWardrobeInventory(params: {
  persona: Persona;
  detectedMeshes?: MeshDescriptor[];
  overrideVaultModels?: VaultModelMeta[];
}): Promise<WardrobeInventory> {
  const { persona, detectedMeshes = [], overrideVaultModels } = params;

  let vaultModels: VaultModelMeta[] = [];
  try {
    vaultModels = overrideVaultModels ?? (await vaultDB.models.toArray());
  } catch (err) {
    console.warn('[MemoryEngine] Failed to retrieve vault models from vaultDB:', err);
    vaultModels = overrideVaultModels ?? [];
  }

  const equippedSlot =
    persona.outfitSlots.find((s) => s.id === persona.activeOutfitSlotId) ||
    persona.outfitSlots[0] ||
    null;

  const outfitSlots: WardrobeOutfitSlotInfo[] = (persona.outfitSlots || []).map((s) => ({
    id: s.id,
    name: s.name,
    isEquipped: s.id === (equippedSlot?.id ?? persona.activeOutfitSlotId),
    modelVaultId: s.modelVaultId,
    cyclingShorts: s.cyclingShorts ?? true,
  }));

  const clothingLayers: WardrobeClothingLayerInfo[] = detectedMeshes.map((m) => {
    const isVisible =
      equippedSlot && m.name in equippedSlot.meshVisibility
        ? equippedSlot.meshVisibility[m.name]
        : m.visible;
    return {
      name: m.name,
      label: m.label,
      category: m.category,
      materialName: m.materialName,
      visible: isVisible,
    };
  });

  // Always include cycling shorts under-skirt innerwear layer
  clothingLayers.push({
    name: 'cyclingShorts',
    label: 'Cycling Shorts (Safety Spats)',
    category: 'Bottoms',
    materialName: 'Body_00_SKIN (Innerwear)',
    visible: equippedSlot?.cyclingShorts ?? true,
  });

  return {
    personaId: persona.id,
    personaName: persona.name,
    equippedSlot,
    outfitSlots,
    vaultModels,
    clothingLayers,
  };
}

/**
 * Formats the wardrobe inventory into a compact system prompt block:
 * `[AVAILABLE WARDROBE INVENTORY]`
 */
export function formatWardrobeInventoryPrompt(
  inventory: WardrobeInventory,
  userName = 'User'
): string {
  const slotsLines = inventory.outfitSlots
    .map(
      (s, idx) =>
        `  * [${idx}] "${s.name}"${s.isEquipped ? ' (CURRENTLY EQUIPPED · ACTIVE)' : ''}`
    )
    .join('\n');

  const activeVaultId = inventory.equippedSlot?.modelVaultId ?? null;
  const vrmOptions: string[] = [
    `  * "Default Anime VRM" (Built-in default-anime.vrm${activeVaultId === null ? ' · CURRENTLY ACTIVE VRM' : ''})`,
  ];
  for (const m of inventory.vaultModels) {
    if (m.format === 'vrm' || m.format === 'glb') {
      vrmOptions.push(
        `  * "${m.fileName}" (${m.format.toUpperCase()}${
          m.id === activeVaultId ? ' · CURRENTLY ACTIVE VRM' : ''
        }${m.isDefaultSample ? ' · Default Idol Base' : ''})`
      );
    }
  }
  const modelsLines = vrmOptions.join('\n');

  const layersLines =
    inventory.clothingLayers.length > 0
      ? inventory.clothingLayers
          .map((l) => `  * ${l.label} [${l.visible ? 'ON' : 'OFF'}] (${l.category})`)
          .join('\n')
      : '  * (No modular sub-layers detected on current model)';

  return `[AVAILABLE WARDROBE INVENTORY]
- Currently Equipped Outfit: "${inventory.equippedSlot?.name || 'Default'}"
- Persona Saved Outfits (Wearable Slots):
${slotsLines || '  * None'}
- Saved 3D Models & Modular Garments in Vault:
${modelsLines}
- Active 3D Model Clothing & Accessory Layers:
${layersLines}

WARDROBE INVENTORY INTERACTION RULES:
1. Whenever ${userName} ({{user}}) asks what clothes/outfits you have, asks to see your wardrobe, or asks what you can wear, accurately list your actual saved outfits, garments, and clothing layers above in character.
2. If ${userName} asks you to change into one of your saved outfits, you can optionally include an action tag:
   [EQUIP_OUTFIT: <slotName or slotNumber>] (e.g. [EQUIP_OUTFIT: Casual Streetwear] or [EQUIP_OUTFIT: Slot 1])
3. You are ALLOWED to freely switch between different 3D VRM avatar models/types in your Vault (or back to "Default Anime VRM") whenever it fits your mood, occasion, or ${userName}'s request using:
   [SWITCH_VRM: <vrm filename, model name, or "default">] (e.g. [SWITCH_VRM: Miku_Swimsuit.vrm] or [SWITCH_VRM: Default Anime VRM])
4. If ${userName} asks you to toggle, put on, or take off a clothing layer, you can optionally include:
   [TOGGLE_LAYER: <layerName>=on|off] (e.g. [TOGGLE_LAYER: Cat Ears=on], [TOGGLE_LAYER: Jacket=off], [TOGGLE_LAYER: Cycling Shorts=on])
5. The studio parser will automatically execute your wardrobe/VRM tag in real-time on the 3D stage!`;
}

/**
 * Formats a readable Markdown summary of the wardrobe inventory for copying to clipboard.
 */
export function formatWardrobeSummaryText(inventory: WardrobeInventory): string {
  const lines: string[] = [];
  lines.push(`=== ${inventory.personaName.toUpperCase()}'S WARDROBE INVENTORY ===`);
  lines.push('');
  lines.push(`Currently Equipped Outfit: ${inventory.equippedSlot?.name || 'None'}`);
  lines.push('');
  lines.push(`--- PERSONA OUTFIT SLOTS (${inventory.outfitSlots.length}) ---`);
  inventory.outfitSlots.forEach((s, i) => {
    lines.push(
      `[${i + 1}] ${s.name} ${s.isEquipped ? '★ [EQUIPPED]' : ''} (ID: ${s.id})`
    );
  });
  lines.push('');
  lines.push(`--- SAVED 3D MODELS IN VAULT (${inventory.vaultModels.length}) ---`);
  if (inventory.vaultModels.length === 0) {
    lines.push('(None saved in vault)');
  } else {
    inventory.vaultModels.forEach((m) => {
      lines.push(
        `- ${m.fileName} [${m.format.toUpperCase()}]${m.isDefaultSample ? ' (Sample)' : ''}`
      );
    });
  }
  lines.push('');
  lines.push(`--- ACTIVE 3D MODEL CLOTHING LAYERS (${inventory.clothingLayers.length}) ---`);
  inventory.clothingLayers.forEach((l) => {
    lines.push(`• [${l.visible ? 'ON ' : 'OFF'}] ${l.label} (${l.category})`);
  });
  return lines.join('\n');
}
