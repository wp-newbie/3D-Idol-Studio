import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { ClothingCategory, MaterialMod, MeshDescriptor } from '../types/studio';
import { getTextureFromVault } from '../storage/modelVault';
import {
  canSafelyHideNativeWardrobe,
  computeVisibleBoneCoverage,
  isBoneCoverageSatisfied,
} from './outfitIntegrityChecker';
import { ensureWatertightBodySkinUnderlay } from './garmentRig';

export const CLOTHING_CATEGORY_ORDER: ClothingCategory[] = [
  'Tops',
  'Bottoms',
  'Footwear',
  'Accessories',
  'Hair',
];

export const CLOTHING_CATEGORY_META: Record<
  ClothingCategory,
  { title: string; shortTitle: string; emoji: string; badgeClass: string }
> = {
  Tops: {
    title: 'Tops / Outerwear',
    shortTitle: 'Tops',
    emoji: '👚',
    badgeClass: 'border-violet-400/30 bg-violet-500/20 text-violet-200',
  },
  Bottoms: {
    title: 'Bottoms',
    shortTitle: 'Bottoms',
    emoji: '👖',
    badgeClass: 'border-indigo-400/30 bg-indigo-500/20 text-indigo-200',
  },
  Footwear: {
    title: 'Footwear & Socks',
    shortTitle: 'Footwear',
    emoji: '👟',
    badgeClass: 'border-sky-400/30 bg-sky-500/20 text-sky-200',
  },
  Accessories: {
    title: 'Accessories & Neckwear',
    shortTitle: 'Accessories',
    emoji: '🎀',
    badgeClass: 'border-rose-400/30 bg-rose-500/20 text-rose-200',
  },
  Hair: {
    title: 'Hair & Twin-Tails',
    shortTitle: 'Hair',
    emoji: '💇‍♀️',
    badgeClass: 'border-amber-400/30 bg-amber-500/20 text-amber-200',
  },
};

// Explicitly filter out core face, skin, eye, brow, lash, mouth, and stage meshes
const CORE_SKIN_OR_FACE_REGEX =
  /(_(skin|face|eye|brow|lash|mouth|teeth|tooth|tongue)\b|faceskin|bodyskin|eyeiris|eyewhite|eyehighlight|eyeline|eyebrow|eyelash|facemouth|faceeyeline|facebrow|faceblush|sclera|cornea|iris|stage_pedestal|stage_ring|headrig)/i;

const GENERIC_BODY_OR_FACE_NODE_REGEX =
  /(^|[_\-\s.])(body|face|skin|head|eye|iris|sclera|cornea|eyeline|eyebrow|eyelash|brow|lash|mouth|teeth|tooth|tongue|blush|cheek|stage_pedestal|stage_ring|headrig)([_\-\s.\d()]|$)/i;

// Ordered carefully: Hair -> Accessories -> Footwear -> Bottoms -> Tops
const CATEGORY_MATCHERS: { category: ClothingCategory; patterns: RegExp[] }[] = [
  {
    category: 'Hair',
    patterns: [
      /_hair\b/i,
      /\bhair\d*\b/i,
      /hair[_\-\s]?\d+/i,
      /twintail/i,
      /ponytail/i,
      /ahoge/i,
      /bangs/i,
      /backhair/i,
      /sidehair/i,
      /fronthair/i,
    ],
  },
  {
    category: 'Accessories',
    patterns: [
      /accessory/i,
      /necktie/i,
      /(^|[_\-\s])tie([_\-\s\d]|$)/i,
      /ribbon/i,
      /(^|[_\-\s])bow([_\-\s\d]|$)/i,
      /neckwear/i,
      /(^|[_\-\s])neck([_\-\s\d]|$)/i,
      /choker/i,
      /scarf/i,
      /(^|[_\-\s])hat([_\-\s\d]|$)/i,
      /beret/i,
      /headset/i,
      /headphone/i,
      /earpiece/i,
      /visor/i,
      /glasses/i,
      /eyewear/i,
      /catears/i,
      /cat[_\-\s]?ear/i,
      /hairpin/i,
      /earring/i,
      /glove/i,
      /bracelet/i,
      /wings/i,
      /halo/i,
      /belt/i,
      /bag/i,
      /badge/i,
      /tag/i,
      /brooch/i,
      /pin/i,
      /cuff/i,
      /armband/i,
      /strap/i,
      /hanging/i,
      /buckle/i,
      /chain/i,
      /ornament/i,
      /decor/i,
    ],
  },
  {
    category: 'Footwear',
    patterns: [
      /shoes?/i,
      /boots?/i,
      /socks?/i,
      /stockings?/i,
      /tights/i,
      /heels?/i,
      /sneakers?/i,
      /loafers?/i,
      /sandals?/i,
      /footwear/i,
    ],
  },
  {
    category: 'Bottoms',
    patterns: [
      /bottoms?/i,
      /skirts?/i,
      /pants?/i,
      /shorts?/i,
      /trousers?/i,
      /leggings?/i,
      /jeans/i,
      /culottes?/i,
      /pleat/i,
      /underwear/i,
      /panties/i,
      /lingerie/i,
    ],
  },
  {
    category: 'Tops',
    patterns: [
      /tops?/i,
      /coats?/i,
      /jackets?/i,
      /shirts?/i,
      /inner/i,
      /onepiece/i,
      /one[_\-\s]?piece/i,
      /dress/i,
      /blouse/i,
      /hoodie/i,
      /sweater/i,
      /cardigan/i,
      /blazer/i,
      /bolero/i,
      /vest/i,
      /bodice/i,
      /outer/i,
      /cloak/i,
      /cape/i,
      /trench/i,
      /mantle/i,
      /tee/i,
      /sleeve/i,
      /sailor/i,
      /uniform/i,
      /\bcloth(es|ing)?\b/i,
      /_cloth\b/i,
      /outfit/i,
      /costume/i,
      /garment/i,
    ],
  },
];

// Comprehensive base-VRM outfit/underwear/footwear/accessory matcher hidden whenever a non-native
// 3D garment silhouette is active (and cleanly restored when switching back to native).
const NATIVE_OUTFIT_HIDE_REGEX =
  /cloth|top|shirt|blouse|sweater|hoodie|skirt|dress|onepiece|one[_\-\s]?piece|gown|pants|trouser|shorts|legging|jeans|jacket|coat|blazer|cardigan|vest|underwear|inner|panties|lingerie|(^|[_\-\s])bra([_\-\s\d]|$)|shoe|boot|heel|loafer|sneaker|sandal|footwear|sock|stocking|tights|ribbon|necktie|(^|[_\-\s])tie([_\-\s\d]|$)|choker|collar|strap|lanyard|pendant|necklace|scarf|belt|wristband|bracelet|watch|glove|badge|tag|brooch|pin|cuff|armband|hanging|buckle|chain|ornament|decor|prop|acc(essory|essories)?([_\-\s\d]|$)/i;

// Core body, face, and hair materials that MUST always stay visible when hiding native outfits.
const PROTECTED_BODY_FACE_HAIR_REGEX =
  /(^|[_\-\s.])(body|skin|face|head|eye|iris|sclera|cornea|brow|eyebrow|lash|eyelash|mouth|teeth|tooth|tongue|blush|hair|twintail|ponytail|ahoge|bangs)([_\-\s.\d()]|$)|_(skin|face|eye|brow|lash|mouth|teeth|hair)\b/i;

interface OriginalMaterialSnapshot {
  colorHex: string | null;
  shadeColorHex: string | null;
  map: THREE.Texture | null;
}

const originalMaterialMap = new WeakMap<THREE.Material, OriginalMaterialSnapshot>();
const originalVisibleMap = new WeakMap<THREE.Object3D, boolean>();

function snapshotMaterial(mat: THREE.Material): OriginalMaterialSnapshot {
  const existing = originalMaterialMap.get(mat);
  if (existing) return existing;

  const anyMat = mat as unknown as {
    color?: THREE.Color;
    shadeColorFactor?: THREE.Color;
    map?: THREE.Texture | null;
  };

  const snap: OriginalMaterialSnapshot = {
    colorHex: anyMat.color ? `#${anyMat.color.getHexString()}` : null,
    shadeColorHex: anyMat.shadeColorFactor ? `#${anyMat.shadeColorFactor.getHexString()}` : null,
    map: anyMat.map ?? null,
  };
  originalMaterialMap.set(mat, snap);
  return snap;
}

function snapshotOriginalVisible(obj: THREE.Object3D): boolean {
  const existing = originalVisibleMap.get(obj);
  if (existing !== undefined) return existing;
  originalVisibleMap.set(obj, obj.visible);
  return obj.visible;
}

function isCoreSkinOrFaceMaterial(matName: string): boolean {
  if (!matName) return false;
  if (/_CLOTH\b/i.test(matName) || /_HAIR\b/i.test(matName)) return false;
  return CORE_SKIN_OR_FACE_REGEX.test(matName);
}

function classifyName(raw: string): ClothingCategory | null {
  if (!raw) return null;
  for (const matcher of CATEGORY_MATCHERS) {
    if (matcher.patterns.some((p) => p.test(raw))) {
      return matcher.category;
    }
  }
  return null;
}

function titleCaseWords(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

/**
 * Formats VRoid Studio material IDs (e.g., `N00_002_04_Tops_01_CLOTH`,
 * `N00_007_01_Accessory_Tie_01_CLOTH`, `N00_000_Hair_00_HAIR_01`) into clean,
 * accurate display titles (e.g., `"Tops 01"`, `"Tie / Neckwear"`, `"Hair 01"`).
 */
function buildPrettyDisplayTitle(
  materialName: string,
  meshName: string,
  category: ClothingCategory
): string {
  const cleanMat = materialName
    .replace(/\s*\(Instance\)\s*/gi, '')
    .trim();

  // Decide whether materialName carries meaningful VRoid/semantic info vs generic fallback
  const matIsGeneric =
    !cleanMat ||
    /^material(\.\d+)?$/i.test(cleanMat) ||
    cleanMat.endsWith('_Material') ||
    /^body[_\s(]*merged/i.test(cleanMat);

  const source = !matIsGeneric ? cleanMat : meshName;

  // Strip VRoid Studio leading slot prefix: e.g. N00_002_04_, F00_000_00_, N00_000_
  let core = source
    .replace(/^[A-Za-z]\d{2}(?:_\d{2,3}){1,2}_/, '')
    .replace(/^(cloth|acc)_/i, '')
    .replace(/_(CLOTH|HAIR|SKIN|EYE|MAT|MATERIAL)(?:_\d+)?$/i, '')
    .replace(/_(00)$/i, '')
    .trim();

  // Extract optional trailing variant number (e.g., _01, 001 -> "01")
  let numSuffix = '';
  const numMatch = /(?:[_\-\s]|(?<=[A-Za-z]))(\d{1,3})$/.exec(core);
  if (numMatch) {
    const parsedNum = Number.parseInt(numMatch[1], 10);
    core = core.slice(0, numMatch.index).replace(/[_\-\s]+$/, '');
    if (!Number.isNaN(parsedNum) && parsedNum > 0) {
      numSuffix = String(parsedNum).padStart(2, '0');
    }
  }

  // Strip leading "Accessory_" so "Accessory_Tie" becomes "Tie", and split CamelCase ("HairBack" -> "Hair Back")
  core = core
    .replace(/^accessory[_\-\s]*/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  // Map common VRoid item tokens cleanly (never turning "Bottoms" into "Shorts"!)
  const lower = core.toLowerCase().replace(/[_\-\s]+/g, ' ').trim();
  if (!lower || /^body\s*\(?merged\)?/.test(lower)) {
    return numSuffix ? `${CLOTHING_CATEGORY_META[category].shortTitle} ${numSuffix}` : CLOTHING_CATEGORY_META[category].shortTitle;
  }

  let baseTitle = '';
  if (/^(tie|necktie|neck\s*tie)$/.test(lower)) {
    baseTitle = 'Tie / Neckwear';
  } else if (/^neck(wear)?$/.test(lower)) {
    baseTitle = 'Neckwear';
  } else if (/^one\s*piece$/.test(lower)) {
    baseTitle = 'One-Piece Dress';
  } else if (/^cat\s*ears?$/.test(lower)) {
    baseTitle = 'Cat Ears';
  } else if (/^twin\s*tails?$/.test(lower)) {
    baseTitle = 'Twin-Tails';
  } else if (/^hair(\s*back|\s*front|\s*side)?$/.test(lower)) {
    baseTitle = titleCaseWords(lower);
  } else {
    baseTitle = titleCaseWords(lower);
  }

  // Keep Tie / Neckwear concise when it's just slot 01, include number for clothing pieces like "Tops 01", "Bottoms 01", "Shoes 01"
  if (baseTitle === 'Tie / Neckwear' && (!numSuffix || numSuffix === '01')) {
    return baseTitle;
  }
  return numSuffix ? `${baseTitle} ${numSuffix}` : baseTitle;
}

function extractPrimaryMaterialInfo(mesh: THREE.Mesh): {
  colorHex: string;
  materialName: string;
  allMaterialNames: string[];
} {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const allMaterialNames = mats
    .map((m) => (m?.name || '').replace(/\s*\(Instance\)\s*/gi, '').trim())
    .filter(Boolean);

  for (const mat of mats) {
    if (!mat) continue;
    const anyMat = mat as unknown as { color?: THREE.Color; name?: string };
    const materialName =
      anyMat.name?.replace(/\s*\(Instance\)\s*/gi, '').trim() || `${mesh.name}_Material`;
    const colorHex = anyMat.color ? `#${anyMat.color.getHexString()}` : '#6d28d9';
    return { colorHex, materialName, allMaterialNames };
  }
  return { colorHex: '#6d28d9', materialName: `${mesh.name}_Material`, allMaterialNames };
}

/**
 * Traverses scene.traverse() to auto-detect VRoid Studio & generic VRM/GLB clothing,
 * footwear, accessories, and hair meshes—reading VRoid material names (`N00_...`)
 * first so merged body sub-meshes classify accurately while core face/skin stay hidden.
 */
export function detectClothingMeshes(
  root: THREE.Object3D,
  materialMods: Record<string, MaterialMod>
): MeshDescriptor[] {
  const found: MeshDescriptor[] = [];
  const seenNames = new Set<string>();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (isProceduralOverlayObject(obj)) return;
    const name = obj.name?.trim();
    if (!name || seenNames.has(name)) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const { colorHex, materialName, allMaterialNames } = extractPrimaryMaterialInfo(obj);
    const joinedMatNames = allMaterialNames.join(' ');
    const isSkinned = obj instanceof THREE.SkinnedMesh;

    // 1. Exclude explicit core skin, face, eye, brow, lash, mouth materials immediately
    if (allMaterialNames.length > 0 && allMaterialNames.every((m) => isCoreSkinOrFaceMaterial(m))) {
      return;
    }

    // 2. Classify primarily by MATERIAL name (VRoid `N00_...` convention), then mesh name, then parent
    const category =
      classifyName(joinedMatNames) ||
      classifyName(name) ||
      (obj.parent?.name ? classifyName(obj.parent.name) : null);

    if (!category) {
      // Filter out uncategorized body/face/eye meshes
      if (
        GENERIC_BODY_OR_FACE_NODE_REGEX.test(name) ||
        CORE_SKIN_OR_FACE_REGEX.test(joinedMatNames)
      ) {
        return;
      }
      // Keep additional non-body SkinnedMeshes as Accessories
      if (!isSkinned) return;
    }

    seenNames.add(name);
    snapshotOriginalVisible(obj);
    mats.forEach((m) => m && snapshotMaterial(m));

    const resolvedCategory: ClothingCategory = category ?? 'Accessories';
    const mod = materialMods[name];
    const label = buildPrettyDisplayTitle(materialName, name, resolvedCategory);

    found.push({
      name,
      label,
      category: resolvedCategory,
      visible: obj.visible,
      materialName,
      isSkinned,
      currentColorHex: mod?.colorHex || colorHex,
      hasCustomTexture: Boolean(mod?.textureDataUrl || mod?.textureVaultId),
    });
  });

  // Deduplicate identical labels cleanly (e.g. two "Hair" meshes -> "Hair 01", "Hair 02")
  const labelCounts = new Map<string, number>();
  for (const item of found) {
    labelCounts.set(item.label, (labelCounts.get(item.label) || 0) + 1);
  }
  const labelSeen = new Map<string, number>();
  for (const item of found) {
    if ((labelCounts.get(item.label) || 0) > 1) {
      const idx = (labelSeen.get(item.label) || 0) + 1;
      labelSeen.set(item.label, idx);
      item.label = `${item.label} #${idx}`;
    }
  }

  // Sort consistently by category order, then label
  found.sort((a, b) => {
    const catDiff =
      CLOTHING_CATEGORY_ORDER.indexOf(a.category) -
      CLOTHING_CATEGORY_ORDER.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    return a.label.localeCompare(b.label);
  });

  return found;
}

export function isBodySkinMaterial(matName: string): boolean {
  if (!matName) return false;
  if (
    /_FACE\b|_HAIR\b|_CLOTH\b|_EYE\b|face|mouth|eye|brow|lash|hair|twintail|ponytail|bangs|cloth|top|shirt|bottom|pant|skirt|shoe|boot|sock|tie|ribbon|accessory/i.test(
      matName
    )
  ) {
    return false;
  }
  return /(?:^|[_\-\s.])(?:skin|body)(?:[_\-\s.\d()]|$)|_(?:skin|body)\b/i.test(matName);
}

const cyclingShortsTextureCache = new Map<string, THREE.CanvasTexture>();

export function getCyclingShortsTexture(
  baseTexture: THREE.Texture,
  colorHex = '#141418'
): THREE.CanvasTexture | null {
  const image = baseTexture.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement | undefined;
  if (!image) return null;

  const key = `${baseTexture.uuid || baseTexture.name || 'skin'}::${colorHex}`;
  const existing = cyclingShortsTextureCache.get(key);
  if (existing) return existing;

  const w = (image as HTMLImageElement).naturalWidth || image.width || 1024;
  const h = (image as HTMLImageElement).naturalHeight || image.height || 1024;
  if (!w || !h) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, w, h);

  // Canonical VRoid body UV bounds for pelvic / thigh region:
  // Left hip/thigh: U in [0.760, 0.998], V in [0.520, 0.608]
  // Right hip/thigh: U in [0.002, 0.240], V in [0.520, 0.608]
  const vTop = Math.floor(h * 0.520);
  const vBottom = Math.floor(h * 0.608);
  const vHeight = vBottom - vTop;

  // Draw sleek cycling / modesty shorts
  ctx.fillStyle = colorHex;
  const leftX = Math.floor(w * 0.760);
  const leftW = Math.ceil(w * 0.238);
  ctx.fillRect(leftX, vTop, leftW, vHeight);

  const rightX = Math.floor(w * 0.002);
  const rightW = Math.ceil(w * 0.238);
  ctx.fillRect(rightX, vTop, rightW, vHeight);

  // Athletic waistband accent at the top
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  const waistH = Math.max(3, Math.floor(vHeight * 0.08));
  ctx.fillRect(leftX, vTop, leftW, waistH);
  ctx.fillRect(rightX, vTop, rightW, waistH);

  // Clean hemline trim at the bottom
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  const hemH = Math.max(2, Math.floor(vHeight * 0.05));
  ctx.fillRect(leftX, vBottom - hemH, leftW, hemH);
  ctx.fillRect(rightX, vBottom - hemH, rightW, hemH);

  const canvasTex = new THREE.CanvasTexture(canvas);
  canvasTex.colorSpace = THREE.SRGBColorSpace;
  canvasTex.flipY = baseTexture.flipY;
  canvasTex.wrapS = THREE.RepeatWrapping;
  canvasTex.wrapT = THREE.RepeatWrapping;
  canvasTex.needsUpdate = true;

  cyclingShortsTextureCache.set(key, canvasTex);
  return canvasTex;
}

export interface VrmBodyCullingReport {
  isPreCulled: boolean;
  hasCulledTorso: boolean;
  hasCulledThighs: boolean;
  hasCulledArms: boolean;
}

export interface GarmentCoverageFlags {
  coversTorso: boolean;
  coversUpperArms: boolean;
  coversForearms: boolean;
  coversThighs: boolean;
  coversCalves: boolean;
}

export function getGarmentCoverageFlags(garmentStyle?: string | null): GarmentCoverageFlags {
  if (
    !garmentStyle ||
    garmentStyle === 'default' ||
    garmentStyle === 'bath_wrap' ||
    garmentStyle === 'beach_swimsuit'
  ) {
    return {
      coversTorso: false,
      coversUpperArms: false,
      coversForearms: false,
      coversThighs: false,
      coversCalves: false,
    };
  }
  switch (garmentStyle) {
    case 'cozy_pajamas':
    case 'cozy_hoodie_pants':
    case 'trench_coat_pants':
    case 'kimono_yukata':
      return {
        coversTorso: true,
        coversUpperArms: true,
        coversForearms: true,
        coversThighs: true,
        coversCalves: true,
      };
    case 'sporty_tee_leggings':
      return {
        coversTorso: true,
        coversUpperArms: true,
        coversForearms: false,
        coversThighs: true,
        coversCalves: true,
      };
    case 'streetwear_jacket_shorts':
      return {
        coversTorso: true,
        coversUpperArms: true,
        coversForearms: true,
        coversThighs: true,
        coversCalves: false,
      };
    case 'school_blazer':
      return {
        coversTorso: true,
        coversUpperArms: true,
        coversForearms: true,
        coversThighs: false,
        coversCalves: false,
      };
    case 'summer_sundress':
      return {
        coversTorso: true,
        coversUpperArms: false,
        coversForearms: false,
        coversThighs: false,
        coversCalves: false,
      };
    case 'evening_gown':
      return {
        coversTorso: true,
        coversUpperArms: false,
        coversForearms: false,
        coversThighs: true,
        coversCalves: true,
      };
    default:
      return {
        coversTorso: false,
        coversUpperArms: false,
        coversForearms: false,
        coversThighs: false,
        coversCalves: false,
      };
  }
}

export function hasValidBodyUVs(mesh: THREE.Mesh): boolean {
  const uv = mesh.geometry?.getAttribute('uv');
  if (!uv || uv.count < 3) return false;
  const step = Math.max(1, Math.floor(uv.count / 16));
  let validCount = 0;
  for (let i = 0; i < uv.count; i += step) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (!Number.isNaN(u) && !Number.isNaN(v) && u >= -0.05 && u <= 1.05 && v >= -0.05 && v <= 1.05) {
      validCount++;
    }
  }
  return validCount >= 4;
}

const bodyAlphaMaskCache = new Map<string, THREE.CanvasTexture>();

export function getBodyAlphaMaskTexture(flags: GarmentCoverageFlags): THREE.CanvasTexture {
  const key = `${flags.coversTorso}_${flags.coversUpperArms}_${flags.coversForearms}_${flags.coversThighs}_${flags.coversCalves}`;
  const existing = bodyAlphaMaskCache.get(key);
  if (existing) return existing;

  const w = 128;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallbackTex = new THREE.CanvasTexture(canvas);
    bodyAlphaMaskCache.set(key, fallbackTex);
    return fallbackTex;
  }

  // 1. Default: 100% white (alpha = 1.0, fully opaque skin)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // 2. Black (alpha = 0.0, culled by alphaTest = 0.5) for regions covered by garments,
  // leaving ~1.5cm safety margin inside garment openings (collar, cuffs, waist, ankles)
  ctx.fillStyle = '#000000';

  if (flags.coversTorso) {
    // Torso: center region U in [0.28, 0.72], V in [0.33, 0.57]
    const tx = Math.floor(w * 0.28);
    const tw = Math.ceil(w * 0.44);
    const ty = Math.floor(h * 0.33);
    const th = Math.ceil(h * 0.24);
    ctx.fillRect(tx, ty, tw, th);
  }

  if (flags.coversUpperArms) {
    const ly = Math.floor(h * 0.11);
    const lh = Math.ceil(h * 0.13);
    ctx.fillRect(Math.floor(w * 0.77), ly, Math.ceil(w * 0.22), lh);
    ctx.fillRect(Math.floor(w * 0.01), ly, Math.ceil(w * 0.22), lh);
  }

  if (flags.coversForearms) {
    const fy = Math.floor(h * 0.24);
    const fh = Math.ceil(h * 0.16);
    ctx.fillRect(Math.floor(w * 0.77), fy, Math.ceil(w * 0.22), fh);
    ctx.fillRect(Math.floor(w * 0.01), fy, Math.ceil(w * 0.22), fh);
  }

  if (flags.coversThighs) {
    const py = Math.floor(h * 0.53);
    const ph = Math.ceil(h * 0.15);
    ctx.fillRect(Math.floor(w * 0.77), py, Math.ceil(w * 0.22), ph);
    ctx.fillRect(Math.floor(w * 0.01), py, Math.ceil(w * 0.22), ph);
  }

  if (flags.coversCalves) {
    const cy = Math.floor(h * 0.68);
    const ch = Math.ceil(h * 0.16);
    ctx.fillRect(Math.floor(w * 0.77), cy, Math.ceil(w * 0.22), ch);
    ctx.fillRect(Math.floor(w * 0.01), cy, Math.ceil(w * 0.22), ch);
  }

  const canvasTex = new THREE.CanvasTexture(canvas);
  canvasTex.colorSpace = THREE.SRGBColorSpace;
  canvasTex.wrapS = THREE.RepeatWrapping;
  canvasTex.wrapT = THREE.RepeatWrapping;
  canvasTex.needsUpdate = true;

  bodyAlphaMaskCache.set(key, canvasTex);
  return canvasTex;
}

function isProceduralOverlayObject(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (
      cur.userData?.__zeta_procedural_garment__ ||
      cur.userData?.__zeta_procedural_hair__ ||
      cur.userData?.__zeta_procedural_accessory__ ||
      cur.userData?.__zeta_activity_hand_prop__
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

export function applyOutfitModsToScene(params: {
  root: THREE.Object3D;
  vrm?: VRM | null;
  meshVisibility: Record<string, boolean>;
  materialMods: Record<string, MaterialMod>;
  isImportedModel: boolean;
  textureCache: Map<string, THREE.Texture>;
  cyclingShorts?: boolean;
  hideNativeGarment?: boolean;
  /** When true (pre-culled legacy VRM with missing under-cloth skin), preserve native clothes & recolor them cleanly! */
  preserveNativeClothingForPreCulled?: boolean;
  fallbackRecolorPalette?: {
    topHex?: string;
    bottomHex?: string;
    accessoryHex?: string;
    topTextureDataUrl?: string | null;
    bottomTextureDataUrl?: string | null;
  } | null;
  garmentStyle?: string | null;
  cullingReport?: VrmBodyCullingReport | null;
  onTextureLoaded?: () => void;
  isBathOrShower?: boolean;
}): void {
  const {
    root,
    vrm = null,
    meshVisibility,
    materialMods,
    isImportedModel,
    textureCache,
    cyclingShorts = true,
    hideNativeGarment = false,
    preserveNativeClothingForPreCulled = false,
    fallbackRecolorPalette = null,
    cullingReport = null,
    onTextureLoaded,
    isBathOrShower = false,
  } = params;
  const loader = new THREE.TextureLoader();

  // In shower or bath: immediately mount watertight skin underlay on culled models before stripping street clothes!
  if (isBathOrShower && vrm) {
    ensureWatertightBodySkinUnderlay({ vrm, avatarRoot: root });
  }

  const isCulledOrUnreplaced = Boolean(
    cullingReport?.isPreCulled ||
    cullingReport?.hasCulledTorso ||
    cullingReport?.hasCulledArms ||
    cullingReport?.hasCulledThighs ||
    preserveNativeClothingForPreCulled ||
    !cullingReport ||
    !canSafelyHideNativeWardrobe(root, cullingReport, vrm)
  );

  const applyTextureUrl = (
    cacheKey: string,
    dataUrl: string,
    mat: {
      color?: THREE.Color;
      map?: THREE.Texture | null;
      needsUpdate: boolean;
    },
    hasColorTint: boolean
  ) => {
    const cached = textureCache.get(cacheKey);
    if (cached) {
      mat.map = cached;
      if (!hasColorTint && mat.color) mat.color.set('#ffffff');
      mat.needsUpdate = true;
      return;
    }
    loader.load(dataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = !isImportedModel;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      textureCache.set(cacheKey, tex);
      mat.map = tex;
      if (!hasColorTint && mat.color) mat.color.set('#ffffff');
      mat.needsUpdate = true;
      onTextureLoaded?.();
    });
  };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (isProceduralOverlayObject(obj)) return;
    const name = obj.name?.trim();
    if (!name) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const hasSkinMat = mats.some(
      (m) => m && (isCoreSkinOrFaceMaterial(m.name) || isBodySkinMaterial(m.name))
    );
    const hasHairMat = mats.some(
      (m) => m && (classifyName(m.name) === 'Hair' || /hair|twintail|ponytail|bangs/i.test(m.name))
    );
    const isProtectedBodyOrHairMesh =
      hasSkinMat ||
      hasHairMat ||
      PROTECTED_BODY_FACE_HAIR_REGEX.test(name);

    // 1. Visibility toggle:
    // When a procedural 3D garment is active and not pre-culled, strictly hide ALL native clothing,
    // tops, bottoms, footwear, underwear, and accessories so zero native meshes peek through.
    // (NEVER hide a merged Body mesh containing skin, nor hide native clothing on pre-culled VRMs!)
    const origVisible = snapshotOriginalVisible(obj);
    if ((preserveNativeClothingForPreCulled || isCulledOrUnreplaced) && !isBathOrShower) {
      obj.visible = origVisible;
    } else if ((hideNativeGarment || isBathOrShower) && !isProtectedBodyOrHairMesh) {
      // Bone-Zone Vertex Occupancy Audit: verify that hiding this mesh does not cause
      // any critical bone (neck, torso, shoulders, arms, legs) to drop below safe vertex counts!
      obj.visible = false;
      if (vrm && !isBathOrShower) {
        const testCov = computeVisibleBoneCoverage(vrm, root);
        const check = isBoneCoverageSatisfied(testCov);
        if (!check.satisfied) {
          obj.visible = origVisible;
          console.warn(
            `[OutfitIntegrity] VETOED hiding native clothing mesh "${name}": would cause critical bone vertex deficit`,
            check.deficitBones
          );
        }
      }
    } else if (name in meshVisibility) {
      obj.visible = hasSkinMat && meshVisibility[name] === false ? origVisible : meshVisibility[name];
    } else if (obj.visible !== origVisible) {
      obj.visible = origVisible;
    }

    // 2. Material color / MToon shadeColorFactor / custom PNG texture overlay / per-material garment hiding
    const mod = materialMods[name];

    for (const mat of mats) {
      if (!mat) continue;
      const snap = snapshotMaterial(mat);
      const isSkinOrFace =
        isCoreSkinOrFaceMaterial(mat.name) || isBodySkinMaterial(mat.name);
      const matCategory =
        classifyName(mat.name) || (mats.length === 1 && !hasSkinMat ? classifyName(name) : null);
      const isHair =
        matCategory === 'Hair' ||
        /hair|twintail|ponytail|bangs/i.test(mat.name);

      // Per-material hiding works on BOTH separate clothing meshes AND merged VRoid multi-material Body meshes!
      // Keep skin/face/head/eye/brow/lash/mouth/teeth/hair ALWAYS visible; hide all conflicting native clothing,
      // underwear, footwear, and outfit-bound accessories when a procedural 3D silhouette is active (unless pre-culled).
      const isProtectedCoreOrHair =
        isSkinOrFace ||
        isHair ||
        (PROTECTED_BODY_FACE_HAIR_REGEX.test(mat.name || '') &&
          !NATIVE_OUTFIT_HIDE_REGEX.test(mat.name || ''));
      const isNativeOutfitSlot = !isProtectedCoreOrHair;

      const anyMat = mat as unknown as {
        color?: THREE.Color;
        shadeColorFactor?: THREE.Color;
        uniforms?: {
          litFactor?: { value?: THREE.Color };
          shadeColorFactor?: { value?: THREE.Color };
        };
        map?: THREE.Texture | null;
        alphaMap?: THREE.Texture | null;
        alphaTest?: number;
        transparent?: boolean;
        opacity?: number;
        depthWrite?: boolean;
        colorWrite?: boolean;
        needsUpdate: boolean;
      };

      // Check explicit meshVisibility toggles (works on both separate meshes and multi-material merged mesh slots)
      const isSlotExplicitlyHidden =
        (mat.name && meshVisibility[mat.name] === false) ||
        (matCategory && meshVisibility[matCategory] === false) ||
        (mats.length === 1 && meshVisibility[name] === false);

      const shouldHideNativeGarmentSlot =
        isSlotExplicitlyHidden ||
        ((hideNativeGarment || isBathOrShower) &&
          (!isCulledOrUnreplaced || isBathOrShower) &&
          !preserveNativeClothingForPreCulled);

      if (shouldHideNativeGarmentSlot && isNativeOutfitSlot) {
        mat.visible = false;
        anyMat.transparent = true;
        anyMat.opacity = 0;
        anyMat.depthWrite = false;
        anyMat.colorWrite = false;
        anyMat.needsUpdate = true;
        continue;
      } else {
        mat.visible = true;
        anyMat.transparent = false;
        anyMat.opacity = 1;
        anyMat.depthWrite = true;
        anyMat.colorWrite = true;
      }

      // On pre-culled legacy VRMs or unreplaced wardrobe, fall back to clean material/texture recoloring over native clothing!
      let effectiveMod: MaterialMod | undefined = mod;
      if ((preserveNativeClothingForPreCulled || isCulledOrUnreplaced) && !isProtectedCoreOrHair && fallbackRecolorPalette) {
        if (matCategory === 'Tops' && (fallbackRecolorPalette.topTextureDataUrl || fallbackRecolorPalette.topHex)) {
          effectiveMod = fallbackRecolorPalette.topTextureDataUrl
            ? { textureDataUrl: fallbackRecolorPalette.topTextureDataUrl }
            : { colorHex: fallbackRecolorPalette.topHex };
        } else if (matCategory === 'Bottoms' && (fallbackRecolorPalette.bottomTextureDataUrl || fallbackRecolorPalette.bottomHex)) {
          effectiveMod = fallbackRecolorPalette.bottomTextureDataUrl
            ? { textureDataUrl: fallbackRecolorPalette.bottomTextureDataUrl }
            : { colorHex: fallbackRecolorPalette.bottomHex };
        } else if (matCategory === 'Accessories' && fallbackRecolorPalette.accessoryHex) {
          effectiveMod = { colorHex: fallbackRecolorPalette.accessoryHex };
        }
      }

      // NEVER apply outfit recoloring or clothing textures to core skin, face, eyes, brows, lashes,
      // mouth, teeth, or hair slots (keeps outfit/pajama tints strictly off skin, face & hair!)
      const isAnySkinFaceEyeOrHair =
        isProtectedCoreOrHair ||
        /skin|body|face|head|eye|iris|sclera|brow|lash|mouth|teeth|tooth|tongue|blush|hair/i.test(
          mat.name || ''
        );
      if (isAnySkinFaceEyeOrHair && !isNativeOutfitSlot) {
        const isSkinMat = isBodySkinMaterial(mat.name || obj.name);
        if (isSkinMat) {
          // Hard rule: NEVER apply alphaMap or alphaTest to core body skin!
          // 2D rectangular alpha masks cause midriff/waist cutouts, upper-back black holes,
          // and floating limbs when seated or in motion across different VRM clothing styles.
          // Procedural garments already rely on barycentric skin-weight transfer, outward
          // normal displacement, and polygon-offset to prevent fabric poke-through cleanly.
          if (anyMat.alphaMap) {
            anyMat.alphaMap = null;
            anyMat.alphaTest = 0;
            anyMat.needsUpdate = true;
          }
          anyMat.transparent = false;
          anyMat.opacity = 1;
          anyMat.depthWrite = true;

          if (cyclingShorts && !isBathOrShower && snap.map) {
            const shortsTex = getCyclingShortsTexture(snap.map);
            if (shortsTex) {
              anyMat.map = shortsTex;
              anyMat.needsUpdate = true;
            } else if (snap.map.image instanceof HTMLImageElement && !snap.map.image.complete) {
              snap.map.image.addEventListener(
                'load',
                () => {
                  const loadedTex = getCyclingShortsTexture(snap.map!);
                  if (loadedTex) {
                    anyMat.map = loadedTex;
                    anyMat.needsUpdate = true;
                    onTextureLoaded?.();
                  }
                },
                { once: true }
              );
            }
          } else if (anyMat.map !== snap.map) {
            anyMat.map = snap.map;
            anyMat.needsUpdate = true;
          }
        } else if (isSkinOrFace && anyMat.map !== snap.map) {
          anyMat.map = snap.map;
          anyMat.needsUpdate = true;
        }
        continue;
      }

      if (effectiveMod?.colorHex) {
        const tint = new THREE.Color(effectiveMod.colorHex);
        if (anyMat.color) anyMat.color.copy(tint);
        if (anyMat.uniforms?.litFactor?.value) {
          anyMat.uniforms.litFactor.value.copy(tint);
        }
        const shade = tint.clone().multiplyScalar(0.68);
        if (anyMat.shadeColorFactor) {
          anyMat.shadeColorFactor.copy(shade);
        }
        if (anyMat.uniforms?.shadeColorFactor?.value) {
          anyMat.uniforms.shadeColorFactor.value.copy(shade);
        }
      } else {
        if (anyMat.color && snap.colorHex) anyMat.color.set(snap.colorHex);
        if (anyMat.shadeColorFactor && snap.shadeColorHex) {
          anyMat.shadeColorFactor.set(snap.shadeColorHex);
        }
      }

      // Custom .PNG Texture Overlay (from IndexedDB textureVaultId or inline dataUrl)
      if (effectiveMod?.textureDataUrl) {
        applyTextureUrl(
          effectiveMod.textureVaultId || effectiveMod.textureDataUrl,
          effectiveMod.textureDataUrl,
          anyMat,
          Boolean(effectiveMod.colorHex)
        );
      } else if (effectiveMod?.textureVaultId) {
        const vaultId = effectiveMod.textureVaultId;
        const cached = textureCache.get(vaultId);
        if (cached) {
          anyMat.map = cached;
          if (!effectiveMod.colorHex && anyMat.color) anyMat.color.set('#ffffff');
          anyMat.needsUpdate = true;
        } else {
          void getTextureFromVault(vaultId).then((rec) => {
            if (rec?.dataUrl) {
              applyTextureUrl(vaultId, rec.dataUrl, anyMat, Boolean(effectiveMod?.colorHex));
            }
          });
        }
      } else {
        // Modesty Cycling Shorts layer (under-skirt protection on body skin)
        const isSkinMat = isBodySkinMaterial(mat.name || obj.name);
        if (cyclingShorts && isSkinMat && snap.map) {
          const shortsTex = getCyclingShortsTexture(snap.map);
          if (shortsTex) {
            anyMat.map = shortsTex;
            anyMat.needsUpdate = true;
          } else if (snap.map.image instanceof HTMLImageElement && !snap.map.image.complete) {
            snap.map.image.addEventListener(
              'load',
              () => {
                const loadedTex = getCyclingShortsTexture(snap.map!);
                if (loadedTex) {
                  anyMat.map = loadedTex;
                  anyMat.needsUpdate = true;
                  onTextureLoaded?.();
                }
              },
              { once: true }
            );
          }
        } else if (anyMat.map !== snap.map) {
          anyMat.map = snap.map;
          anyMat.needsUpdate = true;
        }
      }
    }
  });
}
