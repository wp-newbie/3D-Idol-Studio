import * as THREE from 'three';
import {
  MToonMaterial,
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeCapsule,
  type VRM,
  type VRMHumanBoneName,
  type VRMSpringBoneColliderGroup,
} from '@pixiv/three-vrm';
import type { GarmentStyleId } from '../types/studio';
import { expSmooth } from './naturalArmPose';

export const GARMENT_STYLE_ORDER: GarmentStyleId[] = [
  'default',
  'cozy_hoodie_pants',
  'summer_sundress',
  'streetwear_jacket_shorts',
  'sporty_tee_leggings',
  'kimono_yukata',
  'evening_gown',
  'cozy_pajamas',
  'school_blazer',
  'trench_coat_pants',
  'bath_wrap',
  'beach_swimsuit',
];

export const GARMENT_STYLE_META: Record<
  GarmentStyleId,
  {
    label: string;
    emoji: string;
    summary: string;
    hidesNativeClothes: boolean;
  }
> = {
  default: {
    label: 'Native VRM Outfit',
    emoji: '✨',
    summary: 'Uses the avatar model’s built-in clothing mesh with custom colors & fabric patterns.',
    hidesNativeClothes: false,
  },
  cozy_hoodie_pants: {
    label: 'Oversized Hoodie & Joggers',
    emoji: '🧥',
    summary: 'Plush pullover hoodie with hood & drawstrings paired with tapered jogger pants.',
    hidesNativeClothes: true,
  },
  summer_sundress: {
    label: 'Summer Sundress',
    emoji: '👗',
    summary: 'Breezy sleeveless strappy sundress with waist ribbon and flared pleated midi skirt.',
    hidesNativeClothes: true,
  },
  streetwear_jacket_shorts: {
    label: 'Streetwear Jacket & Shorts',
    emoji: '🩳',
    summary: 'Open-front cropped bomber jacket over inner tee with belted casual shorts.',
    hidesNativeClothes: true,
  },
  sporty_tee_leggings: {
    label: 'Short-Sleeve Tee & Leggings',
    emoji: '🏃‍♀️',
    summary: 'Athletic short-sleeve t-shirt paired with sleek full-length sport leggings.',
    hidesNativeClothes: true,
  },
  kimono_yukata: {
    label: 'Kimono / Yukata',
    emoji: '👘',
    summary: 'Traditional wrap kimono with wide obi sash, back bow, and draping furisode sleeves.',
    hidesNativeClothes: true,
  },
  evening_gown: {
    label: 'Evening Gown',
    emoji: '💃',
    summary: 'Off-shoulder sweetheart bodice with flowing pleated floor-length idol gown.',
    hidesNativeClothes: true,
  },
  cozy_pajamas: {
    label: 'Cozy Pajama Set',
    emoji: '🌙',
    summary: 'Soft collared button-front pajama shirt and comfy full-length lounge pants.',
    hidesNativeClothes: true,
  },
  school_blazer: {
    label: 'School Blazer & Pleated Skirt',
    emoji: '🎓',
    summary: 'Tailored academy blazer with crisp collar, ribbon tie, pleated skirt & knee socks.',
    hidesNativeClothes: true,
  },
  trench_coat_pants: {
    label: 'Trench Coat & Trousers',
    emoji: '🧥',
    summary: 'Double-breasted belted trench coat layered over slim tailored long trousers.',
    hidesNativeClothes: true,
  },
  bath_wrap: {
    label: 'Fluffy Bath Towel Wrap',
    emoji: '🧖‍♀️',
    summary: 'Wholesome full-coverage fluffy spa bath towel wrap with chest knot for bath & shower care.',
    hidesNativeClothes: true,
  },
  beach_swimsuit: {
    label: 'Beach Resort Swimsuit',
    emoji: '🩱',
    summary: 'Stylish anime one-piece resort swimsuit with halter straps & sheer pleated beach pareo.',
    hidesNativeClothes: true,
  },
};

const GARMENT_TAG = '__zeta_procedural_garment__';
const textureLoader = new THREE.TextureLoader();
const garmentTexCache = new Map<string, THREE.Texture>();

function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        m?.dispose();
      }
    }
  });
}

function clearExistingGarments(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj.userData?.[GARMENT_TAG]) {
      toRemove.push(obj);
    }
  });
  for (const node of toRemove) {
    node.parent?.remove(node);
    disposeTree(node);
  }
}

/**
 * True `@pixiv/three-vrm` MToonMaterial anime cel-shading!
 * Clamps multi-light studio illumination IDENTICALLY to VRoid Studio's native MToon face/body/clothes —
 * ZERO white overexposure blow-out and ZERO muddy PBR grey cylinders!
 */
function makeAnimeFabricMaterial(
  colorHex: string,
  options?: {
    textureDataUrl?: string | null;
    doubleSide?: boolean;
    repeatX?: number;
    repeatY?: number;
    transparent?: boolean;
    opacity?: number;
    emissiveBoost?: number;
  }
): MToonMaterial {
  const lit = new THREE.Color(options?.textureDataUrl ? '#ffffff' : colorHex);
  const shade = new THREE.Color(options?.textureDataUrl ? '#dfd8e4' : colorHex).multiplyScalar(0.80);
  const mat = new MToonMaterial({
    color: lit,
    shadeColorFactor: shade,
    shadingToonyFactor: 0.72,
    shadingShiftFactor: -0.06,
    side: options?.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    transparent: options?.transparent ?? false,
    opacity: options?.opacity ?? 1.0,
    depthWrite: options?.transparent ? false : true,
  });

  const url = options?.textureDataUrl;
  if (url) {
    const key = `${url.slice(0, 80)}_${options?.repeatX ?? 2}_${options?.repeatY ?? 2}`;
    const cached = garmentTexCache.get(key);
    if (cached) {
      mat.map = cached;
      mat.needsUpdate = true;
    } else {
      textureLoader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(options?.repeatX ?? 2, options?.repeatY ?? 2);
        tex.needsUpdate = true;
        garmentTexCache.set(key, tex);
        mat.map = tex;
        mat.needsUpdate = true;
      });
    }
  }

  return mat;
}

/**
 * True `@pixiv/three-vrm` MToonMaterial skin shader matching VRoid Studio's native Face/Body skin
 * under any number of studio lights — NEVER blows out to pure white!
 */
function makeAnimeSkinMaterial(skinHex: string): MToonMaterial {
  const lit = new THREE.Color(skinHex);
  const shade = lit.clone().multiplyScalar(0.86);
  return new MToonMaterial({
    color: lit,
    shadeColorFactor: shade,
    shadingToonyFactor: 0.62,
    shadingShiftFactor: -0.05,
    side: THREE.FrontSide,
  });
}

function attachGroup(parent: THREE.Object3D | null, name: string): THREE.Group | null {
  if (!parent) return null;
  const g = new THREE.Group();
  g.name = name;
  g.userData[GARMENT_TAG] = true;
  parent.add(g);
  return g;
}

/**
 * Samples the loaded VRM avatar's actual bright MToon skin tone (preferring Face_00_SKIN first
 * since Face textures have clean cheek skin with zero clothing cutout holes!).
 */
function sampleAvatarSkinColorHex(avatarRoot: THREE.Object3D): string {
  const fallbackHex = '#fad5d2';
  let faceSkinMat: { color?: THREE.Color; map?: THREE.Texture | null } | null = null;
  let bodySkinMat: { color?: THREE.Color; map?: THREE.Texture | null } | null = null;

  avatarRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj.userData?.[GARMENT_TAG]) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m?.name) continue;
      const n = m.name.toLowerCase();
      if (/cloth|hair|eye|mouth|brow|lash|teeth|tongue|blush/.test(n)) continue;
      const anyM = m as unknown as { color?: THREE.Color; map?: THREE.Texture | null };
      if (!faceSkinMat && /face.*skin|skin.*face/.test(n)) {
        faceSkinMat = anyM;
      } else if (!bodySkinMat && /(body.*skin|skin.*body|_skin\b)/.test(n)) {
        bodySkinMat = anyM;
      }
    }
  });

  const chosen = (faceSkinMat || bodySkinMat) as {
    color?: THREE.Color;
    map?: THREE.Texture | null;
  } | null;
  if (chosen?.map && typeof document !== 'undefined') {
    const img = chosen.map.image as
      | HTMLImageElement
      | HTMLCanvasElement
      | ImageBitmap
      | undefined;
    const w = img ? (img as HTMLImageElement).naturalWidth || img.width || 0 : 0;
    const h = img ? (img as HTMLImageElement).naturalHeight || img.height || 0 : 0;
    if (img && w > 8 && h > 8) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 40, 40);
          const data = ctx.getImageData(0, 0, 40, 40).data;
          // Collect warm anime skin pixels (strictly excluding pure white UV margins / specular highlights!)
          // and take the MEDIAN pixel so skin tone matches her real MToon cheeks instead of white!
          const candidates: Array<{ r: number; g: number; b: number; lum: number }> = [];
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const isNearWhite = r > 246 && g > 242 && b > 240;
            const hasWarmChroma = r - Math.min(g, b) >= 8;
            if (!isNearWhite && hasWarmChroma && a > 225 && r > 175 && g > 125 && b > 115 && r >= g && r >= b) {
              const lum = r * 0.3 + g * 0.59 + b * 0.11;
              candidates.push({ r, g, b, lum });
            }
          }
          if (candidates.length >= 6) {
            candidates.sort((a, b) => a.lum - b.lum);
            const midStart = Math.floor(candidates.length * 0.35);
            const midEnd = Math.max(midStart + 3, Math.floor(candidates.length * 0.65));
            const slice = candidates.slice(midStart, midEnd);
            let rSum = 0;
            let gSum = 0;
            let bSum = 0;
            for (const c of slice) {
              rSum += c.r;
              gSum += c.g;
              bSum += c.b;
            }
            const sampled = new THREE.Color(
              rSum / slice.length / 255,
              gSum / slice.length / 255,
              bSum / slice.length / 255
            );
            if (chosen.color && chosen.color.r > 0.7 && chosen.color.g > 0.65 && chosen.color.b > 0.65) {
              sampled.multiply(chosen.color);
            }
            return `#${sampled.getHexString()}`;
          }
        }
      } catch {
        // Fallback below
      }
    }
  }

  if (chosen?.color) {
    const c = chosen.color;
    if (c.r > 0.72 && !(c.r > 0.97 && c.g > 0.97 && c.b > 0.97)) {
      return `#${c.getHexString()}`;
    }
  }
  return fallbackHex;
}

/**
 * Measures the REAL bone vertical spacing of the loaded VRM's torso chain
 * (`hips -> spine -> chest -> upperChest -> neck` + shoulder height & width)
 * so our sculpted bodice spans continuously with ZERO hollow gap between spine & chest!
 */
interface TorsoMetrics {
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  chest: THREE.Object3D | null;
  upperChest: THREE.Object3D | null;
  neck: THREE.Object3D | null;
  ySpineFromHips: number;
  yChestFromSpine: number;
  yUpperFromChest: number;
  yNeckFromChest: number;
  yShoulderFromChest: number;
  halfShoulderW: number;
}

function measureTorsoMetrics(vrm: VRM): TorsoMetrics {
  const h = vrm.humanoid;
  const hips = h?.getRawBoneNode('hips') ?? null;
  const spine = h?.getRawBoneNode('spine') ?? null;
  const chest = h?.getRawBoneNode('chest') ?? spine;
  const upperChest = h?.getRawBoneNode('upperChest') ?? null;
  const neck = h?.getRawBoneNode('neck') ?? null;
  const lArm = h?.getRawBoneNode('leftUpperArm') ?? null;
  const rArm = h?.getRawBoneNode('rightUpperArm') ?? null;

  const ySpineFromHips =
    spine && spine.position.y > 0.02 ? THREE.MathUtils.clamp(spine.position.y, 0.05, 0.16) : 0.09;
  const yChestFromSpine =
    chest && chest !== spine && chest.position.y > 0.02
      ? THREE.MathUtils.clamp(chest.position.y, 0.05, 0.16)
      : 0.10;
  const yUpperFromChest =
    upperChest && upperChest !== chest && upperChest.position.y > 0.02
      ? THREE.MathUtils.clamp(upperChest.position.y, 0.04, 0.16)
      : 0;
  const yNeckLocal =
    neck && neck.position.y > 0.02 ? THREE.MathUtils.clamp(neck.position.y, 0.05, 0.22) : 0.11;

  // Total distance from `chest` bone up to `neck` base
  const yNeckFromChest = THREE.MathUtils.clamp(yUpperFromChest + yNeckLocal, 0.15, 0.30);
  // Shoulder line sits ~72% of the way from `chest` to `neck`
  const yShoulderFromChest = yNeckFromChest * 0.72;

  let halfShoulderW = 0.125;
  if (lArm && rArm) {
    const lPos = new THREE.Vector3();
    const rPos = new THREE.Vector3();
    lArm.getWorldPosition(lPos);
    rArm.getWorldPosition(rPos);
    const span = lPos.distanceTo(rPos);
    if (span > 0.14 && span < 0.45) {
      halfShoulderW = THREE.MathUtils.clamp(span * 0.5, 0.10, 0.17);
    }
  }

  return {
    hips,
    spine,
    chest,
    upperChest,
    neck,
    ySpineFromHips,
    yChestFromSpine,
    yUpperFromChest,
    yNeckFromChest,
    yShoulderFromChest,
    halfShoulderW,
  };
}

/**
 * Builds a smooth, curved, organically pleated anime skirt geometry via radial vertex sculpting
 * (replaces stiff flat CylinderGeometry cones!).
 */
function createSculptedSkirtGeometry(params: {
  topRadius: number;
  bottomRadius: number;
  height: number;
  pleatCount?: number;
  pleatDepth?: number;
  scaleX?: number;
  scaleZ?: number;
  radialSegments?: number;
  heightSegments?: number;
  flarePower?: number;
  openSlitFront?: boolean;
  fwdSign?: number;
}): THREE.BufferGeometry {
  const {
    topRadius,
    bottomRadius,
    height,
    pleatCount = 14,
    pleatDepth = 0.012,
    scaleX = 1.06,
    scaleZ = 0.88,
    radialSegments = 48,
    heightSegments = 10,
    flarePower = 0.85,
    openSlitFront = false,
    fwdSign = 1,
  } = params;

  const thetaStart = openSlitFront ? (fwdSign > 0 ? Math.PI * 0.16 : -Math.PI * 0.84) : 0;
  const thetaLength = openSlitFront ? Math.PI * 1.68 : Math.PI * 2;

  const geo = new THREE.CylinderGeometry(
    topRadius,
    bottomRadius,
    height,
    radialSegments,
    heightSegments,
    true,
    thetaStart,
    thetaLength
  );

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // t = 0 at top waistband, t = 1 at bottom hem
    const t = THREE.MathUtils.clamp(0.5 - y / height, 0, 1);
    const theta = Math.atan2(x, z);
    const curvedR = THREE.MathUtils.lerp(topRadius, bottomRadius, Math.pow(t, flarePower));
    const pleat =
      pleatCount > 0 ? Math.sin(theta * pleatCount) * pleatDepth * Math.pow(t, 1.15) : 0;
    const r = Math.max(0.02, curvedR + pleat);
    pos.setXYZ(i, Math.sin(theta) * r * scaleX, y, Math.cos(theta) * r * scaleZ);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a smooth, anatomically contoured anime LatheGeometry along Y (no flat barrel edges!)
 * with elliptical cross-section `(scaleX, scaleZ)` and subtle forward bust shaping when requested.
 */
function createContouredTorsoLathe(params: {
  profile: Array<[number, number]>; // [radius, y] from bottom to top
  scaleX?: number;
  scaleZ?: number;
  bustCenterY?: number;
  bustBoost?: number;
  rearGluteY?: number;
  rearGluteBoost?: number;
  frontBellyBoost?: number;
  fwdSign?: number;
  segments?: number;
}): THREE.BufferGeometry {
  const {
    profile,
    scaleX = 1.05,
    scaleZ = 0.78,
    bustCenterY = 0.08,
    bustBoost = 0.022,
    rearGluteY = -0.02,
    rearGluteBoost = 0,
    frontBellyBoost = 0,
    fwdSign = 1,
    segments = 28,
  } = params;

  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.004, r), y));
  const geo = new THREE.LatheGeometry(pts, segments);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    let nx = x * scaleX;
    let nz = z * scaleZ;
    const isFront = fwdSign > 0 ? z > 0 : z < 0;
    const dirFrac = Math.min(1, Math.abs(z) / Math.max(0.02, Math.hypot(x, z)));

    // Gentle anime bust contour on the front side only (smooth Gaussian falloff)
    if (bustBoost > 0 && isFront) {
      const dy = (y - bustCenterY) / 0.055;
      nz += fwdSign * bustBoost * Math.exp(-dy * dy) * dirFrac;
    }
    // Gentle front waist/belly ease so native VRM torso skin never clips out the front
    if (frontBellyBoost > 0 && isFront) {
      nz += fwdSign * frontBellyBoost * dirFrac;
    }
    // Smooth posterior glute/lower-back contour so buttocks & back waist never clip out the rear!
    if (rearGluteBoost > 0 && !isFront) {
      const dy = (y - rearGluteY) / 0.075;
      nz -= fwdSign * rearGluteBoost * Math.exp(-dy * dy) * dirFrac;
    }
    pos.setXYZ(i, nx, y, nz);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a tapered tube aligned cleanly along a bone segment from `startFrac` to `endFrac`
 * of the vector from `bone` to `childBone` (works identically on VRM 0.x & VRM 1.0!).
 */
function createBoneSegmentTube(params: {
  bone: THREE.Object3D;
  childBone: THREE.Object3D | null;
  fallbackDir: THREE.Vector3;
  fallbackLen: number;
  startFrac: number;
  endFrac: number;
  radiusStart: number;
  radiusEnd: number;
  mat: THREE.Material;
  radialSegments?: number;
  openEnded?: boolean;
}): THREE.Mesh {
  const {
    childBone,
    fallbackDir,
    fallbackLen,
    startFrac,
    endFrac,
    radiusStart,
    radiusEnd,
    mat,
    radialSegments = 16,
    openEnded = false,
  } = params;

  const segVec =
    childBone && childBone.position.lengthSq() > 1e-5
      ? childBone.position.clone()
      : fallbackDir.clone().normalize().multiplyScalar(fallbackLen);

  const totalLen = segVec.length();
  const dir = segVec.clone().normalize();
  const segLen = Math.max(0.02, totalLen * Math.max(0.05, endFrac - startFrac));
  const midDist = totalLen * ((startFrac + endFrac) * 0.5);

  const geo = new THREE.CylinderGeometry(
    radiusEnd,
    radiusStart,
    segLen,
    radialSegments,
    1,
    openEnded
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(dir).multiplyScalar(midDist);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return mesh;
}

/**
 * Creates a smooth tapered elliptical sleeve/glove/cuff aligned along the forearm longitudinal axis,
 * matching the elbow-to-wrist anatomical cross-sectional gradient with +2-4mm radial clearance
 * (eliminating boxy cylindrical cuff steps and wrist gaps!).
 */
function createTaperedEllipticalForearmTube(params: {
  bone: THREE.Object3D;
  childBone: THREE.Object3D | null;
  fallbackDir: THREE.Vector3;
  fallbackLen: number;
  startFrac: number;
  endFrac: number;
  radiusStart: number;
  radiusEnd: number;
  ellipseScaleZ?: number;
  mat: THREE.Material;
  radialSegments?: number;
  heightSegments?: number;
  openEnded?: boolean;
}): THREE.Mesh {
  const {
    childBone,
    fallbackDir,
    fallbackLen,
    startFrac,
    endFrac,
    radiusStart,
    radiusEnd,
    ellipseScaleZ = 0.88,
    mat,
    radialSegments = 20,
    heightSegments = 8,
    openEnded = false,
  } = params;

  const segVec =
    childBone && childBone.position.lengthSq() > 1e-5
      ? childBone.position.clone()
      : fallbackDir.clone().normalize().multiplyScalar(fallbackLen);

  const totalLen = segVec.length();
  const dir = segVec.clone().normalize();
  const segLen = Math.max(0.02, totalLen * Math.max(0.05, endFrac - startFrac));
  const midDist = totalLen * ((startFrac + endFrac) * 0.5);

  const geo = new THREE.CylinderGeometry(
    1,
    1,
    segLen,
    radialSegments,
    heightSegments,
    openEnded
  );
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // u = 0 at proximal (elbow) end (y = -segLen/2), u = 1 at distal (wrist) end (y = +segLen/2)
    const u = THREE.MathUtils.clamp((y + segLen * 0.5) / segLen, 0, 1);
    // Natural forearm anatomical taper: subtle proximal fullness tapering smoothly into slim elliptical wrist
    const smoothU = u * u * (3 - 2 * u);
    const muscleEase = Math.sin(u * Math.PI) * 0.0016;
    const r = THREE.MathUtils.lerp(radiusStart, radiusEnd, smoothU) + muscleEase;
    // Slight soft bevel at the very edges so cuffs never look razor-stepped
    const edgeBevel = u < 0.08 ? 0.96 + (u / 0.08) * 0.04 : u > 0.92 ? 0.97 + ((1 - u) / 0.08) * 0.03 : 1;
    pos.setXYZ(i, x * r * edgeBevel, y, z * r * ellipseScaleZ * edgeBevel);
  }
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(dir).multiplyScalar(midDist);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return mesh;
}

interface DynamicSkirtDrapeData {
  restPos: Float32Array;
  height: number;
  fwdSign: number;
  seatedBlend: number;
}

function registerDynamicSkirtMesh(
  mesh: THREE.Mesh,
  height: number,
  fwdSign: number
): void {
  const pos = mesh.geometry.attributes.position;
  if (!pos) return;
  mesh.userData.garmentSkirtSway = true;
  mesh.userData.dynamicSkirtDrape = {
    restPos: new Float32Array(pos.array as Float32Array),
    height,
    fwdSign,
    seatedBlend: 0,
  } satisfies DynamicSkirtDrapeData;
}

interface DynamicCollarRingData {
  restPos: Float32Array;
  fwdSign: number;
  armClearance: number;
}

const REGION_IGNORE = 0;
const REGION_PELVIS = 1;
const REGION_TORSO = 2;
const REGION_LEG_L_UP = 3;
const REGION_LEG_L_LOW = 4;
const REGION_LEG_R_UP = 5;
const REGION_LEG_R_LOW = 6;
const REGION_ARM_L_UP = 7;
const REGION_ARM_L_LOW = 8;
const REGION_ARM_R_UP = 9;
const REGION_ARM_R_LOW = 10;
const REGION_HAND = 11;

type SkinnedGarmentZone =
  | 'pants'
  | 'shorts'
  | 'swimsuit'
  | 'torso_sleeveless'
  | 'torso_short_sleeve'
  | 'torso_long_sleeve'
  | 'sleeves_full'
  | 'gloves'
  | 'skin_collarbone'
  | 'skin_arms_full'
  | 'skin_arms_upper'
  | 'skin_arms_below_short';

interface BodySkinCoverage {
  hasCollarboneSkin: boolean;
  hasUpperArmSkin: boolean;
  hasForearmSkin: boolean;
  hasUpperThighSkin: boolean;
}

const EXCLUDE_NON_BODY_MAT_REGEX =
  /hair|face|eye|iris|sclera|cornea|brow|lash|mouth|teeth|tooth|tongue|blush|shoe|boot|heel|sandal|loafer|sneaker|footwear|sock|stocking|tights|accessory|ribbon|bow|necktie|(^|[_\-\s])tie([_\-\s\d]|$)|choker|scarf|hat|beret|headset|earring|glasses|wing|halo|bag|belt/i;
const SKIRT_OR_LOOSE_BOTTOM_REGEX = /skirt|pleat|dress|gown|onepiece|one_piece|coat|trench|cloak|cape/i;
const SKIN_MAT_REGEX = /body.*skin|skin.*body|_skin\b|^body$/i;
const TOPS_MAT_REGEX = /top|shirt|blouse|sweater|hoodie|tee|blazer|jacket|inner|cloth|outfit|bodice|uniform|sailor/i;
const EXCLUDE_BONE_REGEX = /hair|skirt|ribbon|cape|tail|tie|ear|wing/i;

function classifySkeletonBoneRegions(
  vrm: VRM,
  skeleton: THREE.Skeleton
): Uint8Array {
  const h = vrm.humanoid;
  const boneMap = new Map<THREE.Object3D, number>();
  const reg = (name: VRMHumanBoneName, region: number) => {
    const n = h?.getRawBoneNode(name);
    if (n) boneMap.set(n, region);
  };

  reg('hips', REGION_PELVIS);
  reg('spine', REGION_TORSO);
  reg('chest', REGION_TORSO);
  reg('upperChest', REGION_TORSO);
  reg('leftShoulder', REGION_TORSO);
  reg('rightShoulder', REGION_TORSO);
  reg('neck', REGION_IGNORE);
  reg('head', REGION_IGNORE);
  reg('leftUpperLeg', REGION_LEG_L_UP);
  reg('leftLowerLeg', REGION_LEG_L_LOW);
  reg('leftFoot', REGION_LEG_L_LOW);
  reg('leftToes', REGION_IGNORE);
  reg('rightUpperLeg', REGION_LEG_R_UP);
  reg('rightLowerLeg', REGION_LEG_R_LOW);
  reg('rightFoot', REGION_LEG_R_LOW);
  reg('rightToes', REGION_IGNORE);
  reg('leftUpperArm', REGION_ARM_L_UP);
  reg('leftLowerArm', REGION_ARM_L_LOW);
  reg('rightUpperArm', REGION_ARM_R_UP);
  reg('rightLowerArm', REGION_ARM_R_LOW);
  reg('leftHand', REGION_HAND);
  reg('rightHand', REGION_HAND);

  const regions = new Uint8Array(skeleton.bones.length);
  for (let i = 0; i < skeleton.bones.length; i++) {
    const bone = skeleton.bones[i];
    if (EXCLUDE_BONE_REGEX.test(bone.name || '')) {
      regions[i] = REGION_IGNORE;
      continue;
    }
    let cur: THREE.Object3D | null = bone;
    let found = REGION_IGNORE;
    while (cur) {
      const r = boneMap.get(cur);
      if (r !== undefined) {
        found = r;
        break;
      }
      if (EXCLUDE_BONE_REGEX.test(cur.name || '')) {
        found = REGION_IGNORE;
        break;
      }
      cur = cur.parent;
    }
    regions[i] = found;
  }
  return regions;
}

interface BindPoseLandmarks {
  hips: THREE.Vector3;
  chest: THREE.Vector3;
  neck: THREE.Vector3;
  lUpLeg: THREE.Vector3;
  lLowLeg: THREE.Vector3;
  lFoot: THREE.Vector3;
  rUpLeg: THREE.Vector3;
  rLowLeg: THREE.Vector3;
  rFoot: THREE.Vector3;
  lUpArm: THREE.Vector3;
  lLowArm: THREE.Vector3;
  lHand: THREE.Vector3;
  rUpArm: THREE.Vector3;
  rLowArm: THREE.Vector3;
  rHand: THREE.Vector3;
}

function getBindPoseLandmarks(
  vrm: VRM,
  mesh: THREE.SkinnedMesh
): BindPoseLandmarks | null {
  const h = vrm.humanoid;
  const skel = mesh.skeleton;
  if (!h || !skel || !skel.boneInverses?.length) return null;

  const invBind = mesh.bindMatrixInverse;
  const tmpM = new THREE.Matrix4();
  const restPosOf = (name: VRMHumanBoneName): THREE.Vector3 | null => {
    const node = h.getRawBoneNode(name);
    if (!node) return null;
    const idx = skel.bones.indexOf(node as THREE.Bone);
    if (idx < 0 || !skel.boneInverses[idx]) return null;
    // boneInverse transforms mesh-bind-space -> bone-local-space, so invBind * boneInverse^-1 maps (0,0,0) -> bind vertex space!
    tmpM.copy(skel.boneInverses[idx]).invert().premultiply(invBind);
    return new THREE.Vector3().setFromMatrixPosition(tmpM);
  };

  const hips = restPosOf('hips');
  const chest = restPosOf('chest') || restPosOf('spine');
  const neck = restPosOf('neck');
  const lUpLeg = restPosOf('leftUpperLeg');
  const lLowLeg = restPosOf('leftLowerLeg');
  const lFoot = restPosOf('leftFoot');
  const rUpLeg = restPosOf('rightUpperLeg');
  const rLowLeg = restPosOf('rightLowerLeg');
  const rFoot = restPosOf('rightFoot');
  const lUpArm = restPosOf('leftUpperArm');
  const lLowArm = restPosOf('leftLowerArm');
  const lHand = restPosOf('leftHand');
  const rUpArm = restPosOf('rightUpperArm');
  const rLowArm = restPosOf('rightLowerArm');
  const rHand = restPosOf('rightHand');

  if (!hips || !chest || !lUpLeg || !rUpLeg) return null;

  return {
    hips,
    chest,
    neck: neck || hips.clone().add(new THREE.Vector3(0, 0.44, 0)),
    lUpLeg,
    lLowLeg: lLowLeg || lUpLeg.clone().add(new THREE.Vector3(0, -0.38, 0)),
    lFoot: lFoot || lUpLeg.clone().add(new THREE.Vector3(0, -0.76, 0)),
    rUpLeg,
    rLowLeg: rLowLeg || rUpLeg.clone().add(new THREE.Vector3(0, -0.38, 0)),
    rFoot: rFoot || rUpLeg.clone().add(new THREE.Vector3(0, -0.76, 0)),
    lUpArm: lUpArm || chest.clone().add(new THREE.Vector3(0.13, 0.14, 0)),
    lLowArm: lLowArm || chest.clone().add(new THREE.Vector3(0.36, 0.14, 0)),
    lHand: lHand || chest.clone().add(new THREE.Vector3(0.58, 0.14, 0)),
    rUpArm: rUpArm || chest.clone().add(new THREE.Vector3(-0.13, 0.14, 0)),
    rLowArm: rLowArm || chest.clone().add(new THREE.Vector3(-0.36, 0.14, 0)),
    rHand: rHand || chest.clone().add(new THREE.Vector3(-0.58, 0.14, 0)),
  };
}

function projectFracAlongSegment(
  px: number,
  py: number,
  pz: number,
  a: THREE.Vector3,
  b: THREE.Vector3
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < 1e-6) return 0;
  return ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / lenSq;
}

function distSqToSegment(
  px: number,
  py: number,
  pz: number,
  a: THREE.Vector3,
  b: THREE.Vector3
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  const t = lenSq < 1e-6 ? 0 : THREE.MathUtils.clamp(((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / lenSq, 0, 1);
  const cx = a.x + dx * t;
  const cy = a.y + dy * t;
  const cz = a.z + dz * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) + (pz - cz) * (pz - cz);
}

/**
 * Inspects the loaded VRM's intact Body_SKIN SkinnedMesh coverage using ACTUAL BONE-LENGTH SPAN
 * (not just raw triangle count!) so a 2cm bare wrist on VRoid models NEVER tricks us into skipping
 * full bare arms or collarbone skin when VRoid deleted skin under the original sweater!
 */
function inspectVrmBodySkinCoverage(
  vrm: VRM,
  avatarRoot: THREE.Object3D
): BodySkinCoverage {
  let collarCount = 0;
  let collarMin = 1;
  let collarMax = 0;

  let upArmCount = 0;
  let upArmMin = 1;
  let upArmMax = 0;

  let lowArmCount = 0;
  let lowArmMin = 1;
  let lowArmMax = 0;

  let thighCount = 0;
  let thighMin = 1;
  let thighMax = 0;

  avatarRoot.traverse((obj) => {
    if (!(obj instanceof THREE.SkinnedMesh) || obj.userData?.[GARMENT_TAG]) return;
    const geo = obj.geometry;
    const pos = geo.attributes.position;
    const skinIdx = geo.attributes.skinIndex;
    const skinW = geo.attributes.skinWeight;
    if (!pos || !skinIdx || !skinW) return;

    const lm = getBindPoseLandmarks(vrm, obj);
    if (!lm) return;
    const regions = classifySkeletonBoneRegions(vrm, obj.skeleton);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const groups =
      geo.groups && geo.groups.length > 0
        ? geo.groups
        : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }];
    const idxAttr = geo.index;

    const getDominantRegion = (vi: number) => {
      let bestW = -1;
      let bestR = REGION_IGNORE;
      for (let k = 0; k < 4; k++) {
        const w = skinW.getComponent(vi, k);
        if (w > bestW) {
          bestW = w;
          bestR = regions[Math.round(skinIdx.getComponent(vi, k))] ?? REGION_IGNORE;
        }
      }
      return bestR;
    };

    const chestToNeck = Math.max(0.05, lm.neck.y - lm.chest.y);

    for (const grp of groups) {
      const mat = mats[grp.materialIndex ?? 0];
      const matName = `${obj.name || ''} ${mat?.name || ''}`;
      if (!SKIN_MAT_REGEX.test(matName) || /face/i.test(matName)) continue;

      const end = grp.start + grp.count;
      for (let tri = grp.start; tri + 2 < end; tri += 3) {
        const i0 = idxAttr ? idxAttr.getX(tri) : tri;
        const r = getDominantRegion(i0);
        const x = pos.getX(i0);
        const y = pos.getY(i0);
        const z = pos.getZ(i0);

        if (r === REGION_TORSO) {
          const cf = (y - lm.chest.y) / chestToNeck;
          if (cf >= 0.35 && cf <= 1.05) {
            collarCount++;
            if (cf < collarMin) collarMin = cf;
            if (cf > collarMax) collarMax = cf;
          }
        } else if (r === REGION_ARM_L_UP || r === REGION_ARM_R_UP) {
          const f =
            r === REGION_ARM_L_UP
              ? projectFracAlongSegment(x, y, z, lm.lUpArm, lm.lLowArm)
              : projectFracAlongSegment(x, y, z, lm.rUpArm, lm.rLowArm);
          upArmCount++;
          if (f < upArmMin) upArmMin = f;
          if (f > upArmMax) upArmMax = f;
        } else if (r === REGION_ARM_L_LOW || r === REGION_ARM_R_LOW) {
          const f =
            r === REGION_ARM_L_LOW
              ? projectFracAlongSegment(x, y, z, lm.lLowArm, lm.lHand)
              : projectFracAlongSegment(x, y, z, lm.rLowArm, lm.rHand);
          lowArmCount++;
          if (f < lowArmMin) lowArmMin = f;
          if (f > lowArmMax) lowArmMax = f;
        } else if (r === REGION_LEG_L_UP || r === REGION_LEG_R_UP) {
          const f =
            r === REGION_LEG_L_UP
              ? projectFracAlongSegment(x, y, z, lm.lUpLeg, lm.lLowLeg)
              : projectFracAlongSegment(x, y, z, lm.rUpLeg, lm.rLowLeg);
          thighCount++;
          if (f < thighMin) thighMin = f;
          if (f > thighMax) thighMax = f;
        }
      }
    }
  });

  return {
    hasCollarboneSkin: collarCount >= 40 && collarMax - collarMin >= 0.48,
    hasUpperArmSkin: upArmCount >= 50 && upArmMax - upArmMin >= 0.55 && upArmMin <= 0.30,
    hasForearmSkin: lowArmCount >= 50 && lowArmMax - lowArmMin >= 0.55 && lowArmMin <= 0.30,
    hasUpperThighSkin: thighCount >= 40 && thighMax - thighMin >= 0.50 && thighMin <= 0.30,
  };
}

/**
 * Clones REAL sculpted triangles directly from the VRM's own `SkinnedMesh` body/torso topology,
 * extrudes them smoothly outward along position-welded vertex normals (`inflate` meters),
 * generates clean seamless fabric UVs, and binds them to the EXACT SAME skeleton & bone weights!
 *
 * Result:
 *  - ZERO cylindrical limb tubes or knee balls or diaper pelvis!
 *  - Mathematically ZERO skin clipping on thighs, calves, hips, waist, or shoulders in ANY pose!
 */
function buildBodyClonedSkinnedGarment(params: {
  vrm: VRM;
  avatarRoot: THREE.Object3D;
  mat: THREE.Material;
  zone: SkinnedGarmentZone;
  inflate: number;
  topNeckFrac?: number;
  uvScale?: number;
}): number {
  const {
    vrm,
    avatarRoot,
    mat,
    zone,
    inflate,
    topNeckFrac = 0.86,
    uvScale = 1.65,
  } = params;

  let totalClonedTris = 0;

  // Snapshot candidate source SkinnedMeshes first so adding cloned siblings doesn't re-traverse them
  const sourceMeshes: THREE.SkinnedMesh[] = [];
  avatarRoot.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh && !obj.userData?.[GARMENT_TAG]) {
      sourceMeshes.push(obj);
    }
  });

  for (const src of sourceMeshes) {
    if (!src.parent || !src.skeleton) continue;
    const geo = src.geometry;
    const posAttr = geo.attributes.position;
    const normAttr = geo.attributes.normal;
    const skinIdxAttr = geo.attributes.skinIndex;
    const skinWAttr = geo.attributes.skinWeight;
    if (!posAttr || !normAttr || !skinIdxAttr || !skinWAttr) continue;

    const lm = getBindPoseLandmarks(vrm, src);
    if (!lm) continue;

    const regions = classifySkeletonBoneRegions(vrm, src.skeleton);
    const mats = Array.isArray(src.material) ? src.material : [src.material];
    const groups =
      geo.groups && geo.groups.length > 0
        ? geo.groups
        : [{ start: 0, count: geo.index ? geo.index.count : posAttr.count, materialIndex: 0 }];
    const idxAttr = geo.index;

    const yAnkle = Math.max(lm.lFoot.y, lm.rFoot.y);
    const yKnee = (lm.lLowLeg.y + lm.rLowLeg.y) * 0.5;
    const yHipJoint = (lm.lUpLeg.y + lm.rUpLeg.y) * 0.5;
    // Scale-invariant bind factor (~1.0 for standard 1.55–1.65m VRMs; adapts automatically to cm or chibi rigs!)
    const unitScale = THREE.MathUtils.clamp((lm.neck.y - yAnkle) / 1.32, 0.45, 2.5);
    const scaledInflate = inflate * unitScale;
    const yWaistTop = lm.hips.y + Math.max(0.06 * unitScale, (lm.chest.y - lm.hips.y) * 0.45);
    const yShortHem = yKnee + (yHipJoint - yKnee) * 0.46;
    const yNeckLimit = lm.chest.y + (lm.neck.y - lm.chest.y) * topNeckFrac;
    // Extend torso bodice cleanly down into the hip/pelvis band so dresses & tops NEVER leave a bare waist gap!
    const yTorsoBottom = yHipJoint - 0.045 * unitScale;
    const ySwimBottom = yHipJoint - 0.055 * unitScale;

    const getDominantRegion = (vi: number) => {
      let bestW = -1;
      let bestR = REGION_IGNORE;
      for (let k = 0; k < 4; k++) {
        const w = skinWAttr.getComponent(vi, k);
        if (w > bestW) {
          bestW = w;
          bestR = regions[Math.round(skinIdxAttr.getComponent(vi, k))] ?? REGION_IGNORE;
        }
      }
      return bestR;
    };

    // Determine which material groups are valid sources for this garment zone
    const isLowerZone = zone === 'pants' || zone === 'shorts';
    const isSkinZone =
      zone === 'skin_collarbone' ||
      zone === 'skin_arms_full' ||
      zone === 'skin_arms_upper' ||
      zone === 'skin_arms_below_short';
    const isTorsoZone =
      zone === 'torso_sleeveless' ||
      zone === 'torso_short_sleeve' ||
      zone === 'torso_long_sleeve' ||
      zone === 'sleeves_full' ||
      zone === 'swimsuit';

    const keptIndices: number[] = [];

    for (const grp of groups) {
      const m = mats[grp.materialIndex ?? 0];
      const matName = `${m?.name || ''} ${src.name || ''}`;
      if (EXCLUDE_NON_BODY_MAT_REGEX.test(matName)) continue;

      const isSkin = SKIN_MAT_REGEX.test(matName);
      const isTops = TOPS_MAT_REGEX.test(matName);
      const isSkirtOrLoose = SKIRT_OR_LOOSE_BOTTOM_REGEX.test(matName);

      if (zone === 'gloves' || isSkinZone) {
        // Clone real sculpted arms/collarbone from EITHER Body_SKIN OR Tops_CLOTH
        // (essential for VRoid models that deleted bare arm/chest skin under their default long-sleeve sweater!)
        if (isSkirtOrLoose) continue;
        if (!isSkin && !isTops) continue;
      } else if (isLowerZone) {
        if (isSkirtOrLoose || (isTops && !isSkin)) continue;
      } else if (isTorsoZone) {
        if (isSkirtOrLoose) continue;
        if (!isSkin && !isTops) continue;
      }

      const end = grp.start + grp.count;
      for (let tri = grp.start; tri + 2 < end; tri += 3) {
        const i0 = idxAttr ? idxAttr.getX(tri) : tri;
        const i1 = idxAttr ? idxAttr.getX(tri + 1) : tri + 1;
        const i2 = idxAttr ? idxAttr.getX(tri + 2) : tri + 2;

        const r0 = getDominantRegion(i0);
        const r1 = getDominantRegion(i1);
        const r2 = getDominantRegion(i2);
        const domR = r0 === r1 || r0 === r2 ? r0 : r1;
        if (domR === REGION_IGNORE || domR === REGION_HAND) {
          continue;
        }
        // Still exclude hand/finger vertices from creeping into cuffs/gloves
        if (r0 === REGION_HAND && r1 === REGION_HAND && r2 === REGION_HAND) {
          continue;
        }

        const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
        const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
        const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;

        let keep = false;

        if (zone === 'pants' || zone === 'shorts') {
          const isLegOrPelvis =
            domR === REGION_PELVIS ||
            domR === REGION_LEG_L_UP ||
            domR === REGION_LEG_L_LOW ||
            domR === REGION_LEG_R_UP ||
            domR === REGION_LEG_R_LOW;
          if (isLegOrPelvis && cy <= yWaistTop + 0.015 * unitScale) {
            const minY = zone === 'shorts' ? yShortHem - 0.015 * unitScale : yAnkle + 0.024 * unitScale;
            if (cy >= minY) {
              const d2 =
                domR === REGION_PELVIS
                  ? (cx - lm.hips.x) ** 2 + (cz - lm.hips.z) ** 2
                  : domR === REGION_LEG_L_UP
                  ? distSqToSegment(cx, cy, cz, lm.lUpLeg, lm.lLowLeg)
                  : domR === REGION_LEG_L_LOW
                  ? distSqToSegment(cx, cy, cz, lm.lLowLeg, lm.lFoot)
                  : domR === REGION_LEG_R_UP
                  ? distSqToSegment(cx, cy, cz, lm.rUpLeg, lm.rLowLeg)
                  : distSqToSegment(cx, cy, cz, lm.rLowLeg, lm.rFoot);
              const maxR = (domR === REGION_PELVIS ? 0.20 : 0.145) * unitScale;
              if (d2 <= maxR * maxR) keep = true;
            }
          }
        } else if (zone === 'swimsuit') {
          const isTorsoOrPelvis =
            domR === REGION_TORSO ||
            domR === REGION_PELVIS ||
            domR === REGION_LEG_L_UP ||
            domR === REGION_LEG_R_UP;
          if (isTorsoOrPelvis && cy >= ySwimBottom && cy <= yNeckLimit + 0.012 * unitScale) {
            const rad = Math.hypot(cx - lm.hips.x, cz - lm.hips.z);
            if (rad <= 0.21 * unitScale) keep = true;
          } else if (
            cy <= yNeckLimit + 0.012 * unitScale &&
            ((domR === REGION_ARM_L_UP && projectFracAlongSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm) <= 0.14) ||
              (domR === REGION_ARM_R_UP && projectFracAlongSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm) <= 0.14))
          ) {
            keep = true;
          }
        } else if (zone === 'gloves') {
          if (domR === REGION_ARM_L_LOW) {
            const f = projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand);
            if (f >= 0.12 && f <= 0.98) keep = true;
          } else if (domR === REGION_ARM_R_LOW) {
            const f = projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand);
            if (f >= 0.12 && f <= 0.98) keep = true;
          }
        } else if (zone === 'skin_collarbone') {
          // Real sculpted human upper-chest, clavicle, and shoulder bridge cloned from Tops/Body!
          if (domR === REGION_TORSO && cy >= lm.chest.y - 0.02 * unitScale && cy <= lm.neck.y + 0.025 * unitScale) {
            const rad = Math.hypot(cx - lm.hips.x, cz - lm.hips.z);
            if (rad <= 0.23 * unitScale) keep = true;
          }
        } else if (zone === 'skin_arms_full') {
          if (
            domR === REGION_ARM_L_UP ||
            domR === REGION_ARM_R_UP ||
            (domR === REGION_ARM_L_LOW && projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= 0.98) ||
            (domR === REGION_ARM_R_LOW && projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= 0.98)
          ) {
            keep = true;
          }
        } else if (zone === 'skin_arms_upper') {
          if (
            domR === REGION_ARM_L_UP ||
            domR === REGION_ARM_R_UP ||
            (domR === REGION_ARM_L_LOW && projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= 0.22) ||
            (domR === REGION_ARM_R_LOW && projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= 0.22)
          ) {
            keep = true;
          }
        } else if (zone === 'skin_arms_below_short') {
          if (
            (domR === REGION_ARM_L_UP && projectFracAlongSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm) >= 0.30) ||
            (domR === REGION_ARM_R_UP && projectFracAlongSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm) >= 0.30) ||
            (domR === REGION_ARM_L_LOW && projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= 0.98) ||
            (domR === REGION_ARM_R_LOW && projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= 0.98)
          ) {
            keep = true;
          }
        } else if (zone === 'sleeves_full') {
          if (domR === REGION_ARM_L_UP || domR === REGION_ARM_R_UP) {
            keep = true;
          } else if (domR === REGION_ARM_L_LOW) {
            if (projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= 0.95) keep = true;
          } else if (domR === REGION_ARM_R_LOW) {
            if (projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= 0.95) keep = true;
          }
        } else {
          // torso_sleeveless / torso_short_sleeve / torso_long_sleeve
          if (
            (domR === REGION_TORSO || domR === REGION_PELVIS) &&
            cy >= yTorsoBottom - 0.014 * unitScale &&
            cy <= yNeckLimit + 0.014 * unitScale
          ) {
            const rad = Math.hypot(cx - lm.hips.x, cz - lm.hips.z);
            if (rad <= 0.24 * unitScale) keep = true;
          } else if (zone === 'torso_sleeveless') {
            // Keep side-rib & underarm triangles weighted slightly to upperArm so sleeveless dresses NEVER have a ribcage hole!
            if (
              cy <= yNeckLimit + 0.012 * unitScale &&
              ((domR === REGION_ARM_L_UP && projectFracAlongSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm) <= 0.14) ||
                (domR === REGION_ARM_R_UP && projectFracAlongSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm) <= 0.14))
            ) {
              keep = true;
            }
          } else if (zone === 'torso_short_sleeve') {
            if (domR === REGION_ARM_L_UP) {
              if (projectFracAlongSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm) <= 0.46) keep = true;
            } else if (domR === REGION_ARM_R_UP) {
              if (projectFracAlongSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm) <= 0.46) keep = true;
            }
          } else if (zone === 'torso_long_sleeve') {
            if (domR === REGION_ARM_L_UP || domR === REGION_ARM_R_UP) {
              keep = true;
            } else if (domR === REGION_ARM_L_LOW) {
              if (projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= 0.95) keep = true;
            } else if (domR === REGION_ARM_R_LOW) {
              if (projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= 0.95) keep = true;
            }
          }
        }

        if (keep) {
          keptIndices.push(i0, i1, i2);
        }
      }
    }

    if (keptIndices.length < 30) continue;

    // Weld normals across colocated vertex positions so UV seam splits extrude watertight with ZERO cracks!
    const uniqueVerts: number[] = [];
    const oldToNew = new Map<number, number>();
    const weldedNormals = new Map<string, [number, number, number]>();

    const quantKey = (x: number, y: number, z: number) =>
      `${Math.round(x * 2000)}_${Math.round(y * 2000)}_${Math.round(z * 2000)}`;

    const newIndices = new Uint32Array(keptIndices.length);
    for (let k = 0; k < keptIndices.length; k++) {
      const oldI = keptIndices[k];
      let newI = oldToNew.get(oldI);
      if (newI === undefined) {
        newI = uniqueVerts.length;
        oldToNew.set(oldI, newI);
        uniqueVerts.push(oldI);

        const vx = posAttr.getX(oldI);
        const vy = posAttr.getY(oldI);
        const vz = posAttr.getZ(oldI);
        const key = quantKey(vx, vy, vz);
        let acc = weldedNormals.get(key);
        if (!acc) {
          acc = [0, 0, 0];
          weldedNormals.set(key, acc);
        }
        acc[0] += normAttr.getX(oldI);
        acc[1] += normAttr.getY(oldI);
        acc[2] += normAttr.getZ(oldI);
      }
      newIndices[k] = newI;
    }

    const vCount = uniqueVerts.length;
    const newPos = new Float32Array(vCount * 3);
    const newNorm = new Float32Array(vCount * 3);
    const newUv = new Float32Array(vCount * 2);
    const newSkinIdx = new Uint16Array(vCount * 4);
    const newSkinW = new Float32Array(vCount * 4);

    // Helper: snaps any vertex sticking past a cut fraction along an arm segment cleanly onto the straight cuff plane!
    const snapAlongSegment = (
      x: number,
      y: number,
      z: number,
      a: THREE.Vector3,
      b: THREE.Vector3,
      minFrac: number,
      maxFrac: number
    ): [number, number, number] => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dy * dy + dz * dz;
      if (lenSq < 1e-6) return [x, y, z];
      const f = ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / lenSq;
      const cf = THREE.MathUtils.clamp(f, minFrac, maxFrac);
      const df = cf - f;
      if (Math.abs(df) < 1e-5) return [x, y, z];
      return [x + dx * df, y + dy * df, z + dz * df];
    };

    for (let ni = 0; ni < vCount; ni++) {
      const oi = uniqueVerts[ni];
      let vx = posAttr.getX(oi);
      let vy = posAttr.getY(oi);
      let vz = posAttr.getZ(oi);

      const acc = weldedNormals.get(quantKey(vx, vy, vz));
      let nx = acc ? acc[0] : normAttr.getX(oi);
      let ny = acc ? acc[1] : normAttr.getY(oi);
      let nz = acc ? acc[2] : normAttr.getZ(oi);
      const nLen = Math.hypot(nx, ny, nz) || 1;
      nx /= nLen;
      ny /= nLen;
      nz /= nLen;

      const domR = getDominantRegion(oi);

      // Snap cut-boundary vertices cleanly onto tailored straight hems / necklines / cuffs (ZERO sawtooth teeth!)
      if (zone === 'pants') {
        vy = THREE.MathUtils.clamp(vy, yAnkle + 0.026 * unitScale, yWaistTop);
      } else if (zone === 'shorts') {
        vy = THREE.MathUtils.clamp(vy, yShortHem, yWaistTop);
      } else if (zone === 'swimsuit') {
        vy = THREE.MathUtils.clamp(vy, ySwimBottom, yNeckLimit);
      } else if (
        zone === 'torso_sleeveless' ||
        zone === 'torso_short_sleeve' ||
        zone === 'torso_long_sleeve'
      ) {
        if (domR === REGION_TORSO || domR === REGION_PELVIS) {
          vy = THREE.MathUtils.clamp(vy, yTorsoBottom, yNeckLimit);
        } else if (zone === 'torso_short_sleeve') {
          if (domR === REGION_ARM_L_UP) {
            [vx, vy, vz] = snapAlongSegment(vx, vy, vz, lm.lUpArm, lm.lLowArm, -0.25, 0.45);
          } else if (domR === REGION_ARM_R_UP) {
            [vx, vy, vz] = snapAlongSegment(vx, vy, vz, lm.rUpArm, lm.rLowArm, -0.25, 0.45);
          }
        }
      } else if (zone === 'gloves') {
        if (domR === REGION_ARM_L_LOW) {
          [vx, vy, vz] = snapAlongSegment(vx, vy, vz, lm.lLowArm, lm.lHand, 0.14, 0.96);
        } else if (domR === REGION_ARM_R_LOW) {
          [vx, vy, vz] = snapAlongSegment(vx, vy, vz, lm.rLowArm, lm.rHand, 0.14, 0.96);
        }
      }

      // Extrude smoothly along welded anatomical vertex normal so skin NEVER pokes through!
      // Tops get +2.5mm extra ease over the waist overlap band so shirts cleanly layer over pant waistbands.
      const waistEase =
        isTorsoZone && vy < yWaistTop + 0.02 * unitScale ? 0.0025 * unitScale : 0;
      const vertInflate = scaledInflate + waistEase;
      const ox = vx + nx * vertInflate;
      const oy = vy + ny * vertInflate;
      const oz = vz + nz * vertInflate;

      newPos[ni * 3] = ox;
      newPos[ni * 3 + 1] = oy;
      newPos[ni * 3 + 2] = oz;
      newNorm[ni * 3] = nx;
      newNorm[ni * 3 + 1] = ny;
      newNorm[ni * 3 + 2] = nz;

      // Clean seamless cylindrical UVs (per-leg centerline on legs so plaid/stripes run straight!)
      let u = 0;
      let v = vy * uvScale;
      if (domR === REGION_LEG_L_UP || domR === REGION_LEG_L_LOW) {
        u = (Math.atan2(ox - lm.lUpLeg.x, oz - lm.lUpLeg.z) / (Math.PI * 2) + 0.5) * 1.15;
      } else if (domR === REGION_LEG_R_UP || domR === REGION_LEG_R_LOW) {
        u = (Math.atan2(ox - lm.rUpLeg.x, oz - lm.rUpLeg.z) / (Math.PI * 2) + 0.5) * 1.15;
      } else if (
        domR === REGION_ARM_L_UP ||
        domR === REGION_ARM_L_LOW ||
        domR === REGION_ARM_R_UP ||
        domR === REGION_ARM_R_LOW
      ) {
        u = ox * uvScale * 1.1;
        v = (Math.atan2(oy - lm.lUpArm.y, oz - lm.lUpArm.z) / (Math.PI * 2) + 0.5) * 0.9;
      } else {
        u = (Math.atan2(ox - lm.hips.x, oz - lm.hips.z) / (Math.PI * 2) + 0.5) * 1.6;
      }
      newUv[ni * 2] = u;
      newUv[ni * 2 + 1] = v;

      for (let c = 0; c < 4; c++) {
        newSkinIdx[ni * 4 + c] = Math.round(skinIdxAttr.getComponent(oi, c));
        newSkinW[ni * 4 + c] = skinWAttr.getComponent(oi, c);
      }
    }

    const subGeo = new THREE.BufferGeometry();
    subGeo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    subGeo.setAttribute('normal', new THREE.BufferAttribute(newNorm, 3));
    subGeo.setAttribute('uv', new THREE.BufferAttribute(newUv, 2));
    subGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(newSkinIdx, 4));
    subGeo.setAttribute('skinWeight', new THREE.BufferAttribute(newSkinW, 4));
    subGeo.setIndex(new THREE.BufferAttribute(newIndices, 1));
    subGeo.computeVertexNormals();

    // Depth polygonOffset prevents z-fighting against underlying base VRM body skin at any camera distance
    if (!isSkinZone) {
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = isTorsoZone ? -2 : -1;
      mat.polygonOffsetUnits = isTorsoZone ? -2 : -1;
    }

    const skinned = new THREE.SkinnedMesh(subGeo, mat);
    skinned.name = `GarmentSkinned_${zone}`;
    skinned.userData[GARMENT_TAG] = true;
    skinned.frustumCulled = false;
    skinned.renderOrder = isSkinZone ? 1 : isTorsoZone ? 3 : 2;
    skinned.bind(src.skeleton, src.bindMatrix);
    src.parent.add(skinned);

    totalClonedTris += keptIndices.length / 3;
  }

  return totalClonedTris;
}

/**
 * Adds seamless, bright anime MToon-matched skin underlays ONLY where the VRM model has missing
 * VRoid transparent-mesh cutouts (never adding redundant forearm tubes or wrist seams when real skin exists!).
 */
function addExposedSkinUnderlay(params: {
  vrm: VRM;
  avatarRoot: THREE.Object3D;
  metrics: TorsoMetrics;
  skinHex: string;
  armMode?: 'full' | 'forearms_only' | 'upper_only' | 'below_cap' | 'below_short_sleeve' | 'none';
  collarboneBridge?: boolean;
  upperThighs?: boolean;
  fwdSign: number;
  coverage?: BodySkinCoverage;
}): void {
  const {
    vrm,
    avatarRoot,
    metrics,
    skinHex,
    armMode = 'none',
    collarboneBridge = false,
    upperThighs = false,
    fwdSign,
  } = params;
  const h = vrm.humanoid;
  if (!h) return;
  const cov = params.coverage ?? inspectVrmBodySkinCoverage(vrm, avatarRoot);
  const isVrm0 = vrm.meta?.metaVersion === '0';
  const skinMat = makeAnimeSkinMaterial(skinHex);

  // 1. REAL Sculpted SkinnedMesh Collarbone + Upper Chest Skin (ZERO hollow chest/neck gap!)
  if (collarboneBridge && !cov.hasCollarboneSkin) {
    const clonedCollarTris = buildBodyClonedSkinnedGarment({
      vrm,
      avatarRoot,
      mat: skinMat,
      zone: 'skin_collarbone',
      inflate: -0.0022,
    });
    if (clonedCollarTris < 40 && metrics.chest) {
      const bridgeG = attachGroup(metrics.chest, 'GarmentSkinCollarbone');
      if (bridgeG) {
        const yLow = metrics.yShoulderFromChest - 0.065;
        const yMid = metrics.yShoulderFromChest - 0.005;
        const yCollar = metrics.yNeckFromChest - 0.015;
        const yNeckTop = metrics.yNeckFromChest + 0.045;
        const bridgeGeo = createContouredTorsoLathe({
          profile: [
            [0.080, yLow],
            [0.088, yMid],
            [0.070, yCollar],
            [0.038, metrics.yNeckFromChest + 0.005],
            [0.036, yNeckTop],
          ],
          scaleX: 0.98,
          scaleZ: 0.66,
          bustBoost: 0,
          fwdSign,
          segments: 24,
        });
        bridgeG.add(new THREE.Mesh(bridgeGeo, skinMat));
      }
    }
  }

  // 2. REAL Sculpted SkinnedMesh Human Arms (cloned from VRM arm topology when VRoid deleted Body_SKIN under sweater!)
  //    Falls back to smooth tapered elliptical bone-tracked arms ONLY if the model has no clonable arm mesh.
  if (armMode !== 'none') {
    const needsUpper =
      (armMode === 'full' ||
        armMode === 'upper_only' ||
        armMode === 'below_cap' ||
        armMode === 'below_short_sleeve') &&
      !cov.hasUpperArmSkin;
    const needsForearm =
      (armMode === 'full' ||
        armMode === 'forearms_only' ||
        armMode === 'below_cap' ||
        armMode === 'below_short_sleeve') &&
      !cov.hasForearmSkin;

    let clonedArmTris = 0;
    if (needsUpper || needsForearm) {
      const skinArmZone: SkinnedGarmentZone =
        armMode === 'upper_only'
          ? 'skin_arms_upper'
          : armMode === 'below_short_sleeve' || armMode === 'forearms_only'
          ? 'skin_arms_below_short'
          : 'skin_arms_full';
      clonedArmTris = buildBodyClonedSkinnedGarment({
        vrm,
        avatarRoot,
        mat: skinMat,
        zone: skinArmZone,
        inflate: -0.0028,
      });
    }

    if (clonedArmTris < 50 && (needsUpper || needsForearm)) {
      const sides: Array<{
        upper: VRMHumanBoneName;
        lower: VRMHumanBoneName;
        hand: VRMHumanBoneName;
        side: 1 | -1;
      }> = [
        { upper: 'leftUpperArm', lower: 'leftLowerArm', hand: 'leftHand', side: 1 },
        { upper: 'rightUpperArm', lower: 'rightLowerArm', hand: 'rightHand', side: -1 },
      ];

      for (const s of sides) {
        const up = h.getRawBoneNode(s.upper);
        const low = h.getRawBoneNode(s.lower);
        const hand = h.getRawBoneNode(s.hand);
        const fallbackX = (s.side === 1) !== isVrm0 ? 1 : -1;

        if (up && needsUpper) {
          const upG = attachGroup(up, `GarmentSkinArmUp_${s.upper}`);
          if (upG) {
            const startFrac =
              armMode === 'below_short_sleeve' ? 0.34 : armMode === 'below_cap' ? 0.14 : -0.05;
            const tube = createTaperedEllipticalForearmTube({
              bone: up,
              childBone: low,
              fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
              fallbackLen: 0.24,
              startFrac,
              endFrac: 1.03,
              radiusStart: 0.029,
              radiusEnd: 0.0235,
              ellipseScaleZ: 0.90,
              mat: skinMat,
            });
            upG.add(tube);

            if (armMode !== 'below_cap' && armMode !== 'below_short_sleeve') {
              const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.029, 14, 12), skinMat);
              upG.add(shoulderBall);
            }
          }
        }

        if (low && needsForearm) {
          const lowG = attachGroup(low, `GarmentSkinArmLow_${s.lower}`);
          if (lowG) {
            const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.0235, 12, 10), skinMat);
            const tube = createTaperedEllipticalForearmTube({
              bone: low,
              childBone: hand,
              fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
              fallbackLen: 0.22,
              startFrac: 0.0,
              endFrac: 1.01,
              radiusStart: 0.0235,
              radiusEnd: 0.0175,
              ellipseScaleZ: 0.88,
              mat: skinMat,
            });
            lowG.add(elbowBall, tube);
          }
        }
      }
    }
  }

  // 3. Slim Upper-Thigh Skin Underlay ONLY if VRoid deleted upper-thigh skin under the original skirt
  if (upperThighs && !cov.hasUpperThighSkin) {
    const legSides: Array<{ upper: VRMHumanBoneName; lower: VRMHumanBoneName }> = [
      { upper: 'leftUpperLeg', lower: 'leftLowerLeg' },
      { upper: 'rightUpperLeg', lower: 'rightLowerLeg' },
    ];
    for (const ls of legSides) {
      const up = h.getRawBoneNode(ls.upper);
      const low = h.getRawBoneNode(ls.lower);
      const upG = attachGroup(up, `GarmentSkinLegUp_${ls.upper}`);
      if (upG && up) {
        const thigh = createBoneSegmentTube({
          bone: up,
          childBone: low,
          fallbackDir: new THREE.Vector3(0, -1, 0),
          fallbackLen: 0.38,
          startFrac: -0.02,
          endFrac: 0.46,
          radiusStart: 0.062,
          radiusEnd: 0.052,
          mat: skinMat,
          radialSegments: 16,
        });
        upG.add(thigh);
      }
    }
  }
}

function addLegPants(params: {
  vrm: VRM;
  avatarRoot: THREE.Object3D;
  mat: THREE.Material;
  cuffMat?: THREE.Material;
  endFracLower?: number;
  shortsOnly?: boolean;
  looseFactor?: number;
  fwdSign: number;
}): boolean {
  const {
    vrm,
    avatarRoot,
    mat,
    cuffMat,
    endFracLower = 0.95,
    shortsOnly = false,
    looseFactor = 1.0,
    fwdSign,
  } = params;

  // Primary path: True body-fitted SkinnedMesh pants/leggings/shorts cloned directly from the VRM's real
  // sculpted hips, thighs, knees, and calves (ZERO cylinders, ZERO knee balls, ZERO skin clipping!)
  const inflate = shortsOnly
    ? 0.0085
    : looseFactor <= 0.98
    ? 0.006
    : THREE.MathUtils.clamp(0.007 + (looseFactor - 1.0) * 0.035, 0.0065, 0.013);
  const clonedTris = buildBodyClonedSkinnedGarment({
    vrm,
    avatarRoot,
    mat,
    zone: shortsOnly ? 'shorts' : 'pants',
    inflate,
    uvScale: 1.75,
  });
  if (clonedTris >= 80) {
    return true;
  }

  // Fallback for non-skinned primitive avatars ONLY (using twist-free leg basis so calves NEVER flip forward!)
  const h = vrm.humanoid;
  if (!h) return false;

  const sides: Array<{
    upper: VRMHumanBoneName;
    lower: VRMHumanBoneName;
    foot: VRMHumanBoneName;
  }> = [
    { upper: 'leftUpperLeg', lower: 'leftLowerLeg', foot: 'leftFoot' },
    { upper: 'rightUpperLeg', lower: 'rightLowerLeg', foot: 'rightFoot' },
  ];

  const legBasisMat = new THREE.Matrix4();
  const bX = new THREE.Vector3();
  const bY = new THREE.Vector3();
  const bZ = new THREE.Vector3();

  for (const s of sides) {
    const up = h.getRawBoneNode(s.upper);
    const low = h.getRawBoneNode(s.lower);
    const ft = h.getRawBoneNode(s.foot);

    const upGroup = attachGroup(up, `GarmentLegUp_${s.upper}`);
    if (upGroup && up) {
      const tube = createBoneSegmentTube({
        bone: up,
        childBone: low,
        fallbackDir: new THREE.Vector3(0, -1, 0),
        fallbackLen: 0.38,
        startFrac: -0.02,
        endFrac: shortsOnly ? 0.44 : 1.03,
        radiusStart: 0.082 * looseFactor,
        radiusEnd: (shortsOnly ? 0.072 : 0.064) * looseFactor,
        mat,
      });
      upGroup.add(tube);
    }

    if (!shortsOnly && low) {
      const lowGroup = attachGroup(low, `GarmentLegLow_${s.lower}`);
      if (lowGroup) {
        const segVec =
          ft && ft.position.lengthSq() > 1e-5
            ? ft.position.clone()
            : new THREE.Vector3(0, -0.38, 0);
        const totalLen = segVec.length();
        bY.copy(segVec).normalize();
        // Twist-free basis: local +Z ALWAYS aligns with character forward (+fwdSign * Z), NEVER flipped 180°!
        bZ.set(0, 0, fwdSign);
        bZ.addScaledVector(bY, -bZ.dot(bY)).normalize();
        bX.crossVectors(bY, bZ).normalize();
        bZ.crossVectors(bX, bY).normalize();
        legBasisMat.makeBasis(bX, bY, bZ);

        const startF = -0.02;
        const endF = endFracLower;
        const segLen = Math.max(0.05, totalLen * (endF - startF));
        const midDist = totalLen * ((startF + endF) * 0.5);

        const shinGeo = new THREE.CylinderGeometry(
          0.048 * looseFactor,
          0.064 * looseFactor,
          segLen,
          20,
          10,
          false
        );
        const shinPos = shinGeo.attributes.position;
        for (let vi = 0; vi < shinPos.count; vi++) {
          const vx = shinPos.getX(vi);
          const vy = shinPos.getY(vi);
          const vz = shinPos.getZ(vi);
          const t = THREE.MathUtils.clamp((vy + segLen * 0.5) / segLen, 0, 1);
          const calfWave = Math.exp(-Math.pow((t - 0.34) / 0.26, 2));
          const radScale = 1.0 + calfWave * 0.14;
          // Local -Z is strictly posterior (back of calf) thanks to our twist-free basis!
          const backShift = -calfWave * 0.016 * looseFactor;
          shinPos.setXYZ(vi, vx * radScale, vy, vz * radScale + backShift);
        }
        shinGeo.computeVertexNormals();

        const shin = new THREE.Mesh(shinGeo, mat);
        shin.position.copy(bY).multiplyScalar(midDist);
        shin.quaternion.setFromRotationMatrix(legBasisMat);
        lowGroup.add(shin);

        if (cuffMat) {
          const cuff = createBoneSegmentTube({
            bone: low,
            childBone: ft,
            fallbackDir: new THREE.Vector3(0, -1, 0),
            fallbackLen: 0.38,
            startFrac: Math.max(0.76, endFracLower - 0.1),
            endFrac: endFracLower + 0.02,
            radiusStart: 0.052 * looseFactor,
            radiusEnd: 0.049 * looseFactor,
            mat: cuffMat,
          });
          lowGroup.add(cuff);
        }
      }
    }
  }
  return false;
}

function addArmSleeves(params: {
  vrm: VRM;
  mat: THREE.Material;
  cuffMat?: THREE.Material;
  mode: 'short' | 'full' | 'cap' | 'kimono' | 'gloves';
  looseFactor?: number;
}): void {
  const { vrm, mat, cuffMat, mode, looseFactor = 1.0 } = params;
  const h = vrm.humanoid;
  if (!h) return;
  const isVrm0 = vrm.meta?.metaVersion === '0';

  const sides: Array<{
    upper: VRMHumanBoneName;
    lower: VRMHumanBoneName;
    hand: VRMHumanBoneName;
    side: 1 | -1;
  }> = [
    { upper: 'leftUpperArm', lower: 'leftLowerArm', hand: 'leftHand', side: 1 },
    { upper: 'rightUpperArm', lower: 'rightLowerArm', hand: 'rightHand', side: -1 },
  ];

  for (const s of sides) {
    const up = h.getRawBoneNode(s.upper);
    const low = h.getRawBoneNode(s.lower);
    const hand = h.getRawBoneNode(s.hand);
    const fallbackX = (s.side === 1) !== isVrm0 ? 1 : -1;

    if (mode !== 'gloves' && up) {
      const upG = attachGroup(up, `GarmentArmUp_${s.upper}`);
      if (upG) {
        const endFrac = mode === 'cap' ? 0.24 : mode === 'short' ? 0.50 : 1.05;
        const tube = createBoneSegmentTube({
          bone: up,
          childBone: low,
          fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
          fallbackLen: 0.24,
          startFrac: -0.06,
          endFrac,
          radiusStart: 0.049 * looseFactor,
          radiusEnd: (mode === 'kimono' ? 0.068 : 0.042) * looseFactor,
          mat,
        });
        upG.add(tube);

        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.043 * looseFactor, 14, 12),
          mat
        );
        cap.scale.set(1.0, 0.85, 0.92);
        cap.position.set(0, -0.006, 0);
        upG.add(cap);

        if ((mode === 'short' || mode === 'cap') && cuffMat) {
          const trim = createBoneSegmentTube({
            bone: up,
            childBone: low,
            fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
            fallbackLen: 0.24,
            startFrac: Math.max(0.14, endFrac - 0.09),
            endFrac: endFrac + 0.02,
            radiusStart: 0.045 * looseFactor,
            radiusEnd: 0.045 * looseFactor,
            mat: cuffMat,
          });
          upG.add(trim);
        }
      }
    }

    if ((mode === 'full' || mode === 'kimono' || mode === 'gloves') && low) {
      const lowG = attachGroup(low, `GarmentArmLow_${s.lower}`);
      if (lowG) {
        if (mode !== 'gloves') {
          const elbowCap = new THREE.Mesh(
            new THREE.SphereGeometry(0.039 * looseFactor, 12, 10),
            mat
          );
          lowG.add(elbowCap);
        }
        const tube =
          mode === 'kimono'
            ? createBoneSegmentTube({
                bone: low,
                childBone: hand,
                fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
                fallbackLen: 0.22,
                startFrac: -0.04,
                endFrac: 0.88,
                radiusStart: 0.042 * looseFactor,
                radiusEnd: 0.088 * looseFactor,
                mat,
                openEnded: true,
              })
            : createTaperedEllipticalForearmTube({
                bone: low,
                childBone: hand,
                fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
                fallbackLen: 0.22,
                // Gloves hug the forearm smoothly with +3mm anatomical radial padding (zero chunky cylinder!)
                startFrac: mode === 'gloves' ? 0.14 : -0.03,
                endFrac: mode === 'gloves' ? 0.98 : 0.96,
                radiusStart: (mode === 'gloves' ? 0.0275 : 0.039) * looseFactor,
                radiusEnd: (mode === 'gloves' ? 0.0215 : 0.029) * looseFactor,
                ellipseScaleZ: 0.88,
                mat,
              });
        lowG.add(tube);

        if (mode === 'kimono') {
          const drape = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.23, 0.045), mat);
          drape.position.set(fallbackX * 0.10, -0.105, 0);
          lowG.add(drape);
        }

        if (cuffMat && mode !== 'kimono') {
          // Tapered elliptical cuff with +2.5mm subtle radial trim over the sleeve/glove (zero stepped shelf!)
          const cuff = createTaperedEllipticalForearmTube({
            bone: low,
            childBone: hand,
            fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
            fallbackLen: 0.22,
            startFrac: mode === 'gloves' ? 0.12 : 0.85,
            endFrac: mode === 'gloves' ? 0.24 : 0.99,
            radiusStart: (mode === 'gloves' ? 0.0295 : 0.0315) * looseFactor,
            radiusEnd: (mode === 'gloves' ? 0.0285 : 0.0285) * looseFactor,
            ellipseScaleZ: 0.88,
            mat: cuffMat,
          });
          lowG.add(cuff);
        }
      }
    }
  }
}

/**
 * Builds a SEAMLESS, GAP-FREE, anatomically sculpted anime torso spanning continuously from
 * `hips` -> `spine` -> `chest` -> `upperChest` with generous internal overlap so bending or
 * peeking NEVER creates a gap in her waist or ribs!
 */
function addSculptedTorso(params: {
  vrm: VRM;
  avatarRoot: THREE.Object3D;
  metrics: TorsoMetrics;
  topMat: THREE.Material;
  hipsMat?: THREE.Material;
  scaleX?: number;
  scaleZ?: number;
  /** Fraction of chest->neck height where the top neckline ends (0.62 = strapless/swimsuit/towel, 0.86 = full collar shirt/hoodie) */
  necklineHeightFrac?: number;
  bustBoost?: number;
  fwdSign: number;
  /** Which skinned torso zone to clone directly from the VRM's own real sculpted body/tops mesh */
  skinnedZone?: 'torso_sleeveless' | 'torso_short_sleeve' | 'torso_long_sleeve' | 'swimsuit';
  skinnedInflate?: number;
  /** Set true when real skinned pants/shorts already cover the pelvis (prevents bloated diaper shell!) */
  pelvisCoveredByPants?: boolean;
}): {
  chestGroup: THREE.Group | null;
  spineGroup: THREE.Group | null;
  hipsGroup: THREE.Group | null;
  topNeckY: number;
  waistYInChest: number;
  usedSkinnedTorso: boolean;
} {
  const {
    vrm,
    avatarRoot,
    metrics,
    topMat,
    hipsMat,
    scaleX = 1.0,
    scaleZ = 1.0,
    necklineHeightFrac = 0.84,
    bustBoost = 0.024,
    fwdSign,
    skinnedZone = 'torso_sleeveless',
    skinnedInflate = 0.0065,
    pelvisCoveredByPants = false,
  } = params;

  const hipsGroup = attachGroup(metrics.hips, 'GarmentHips');
  const spineGroup = attachGroup(metrics.spine, 'GarmentSpine');
  const chestGroup = attachGroup(metrics.chest, 'GarmentChest');

  const yTop = metrics.yNeckFromChest * necklineHeightFrac;
  const yBottomInChest = -(metrics.yChestFromSpine + metrics.ySpineFromHips * 0.65);
  const yWaistInChest = -metrics.yChestFromSpine * 0.45;
  const yBustInChest = yTop * 0.48;

  // Primary path: True body-fitted SkinnedMesh torso (+ optional short/long sleeves) cloned directly
  // from the VRM's real sculpted anime bust, waist, shoulders & sleeves — ZERO boxy barrels or diaper shells!
  const clonedTorsoTris = buildBodyClonedSkinnedGarment({
    vrm,
    avatarRoot,
    mat: topMat,
    zone: skinnedZone,
    inflate: skinnedInflate,
    topNeckFrac: necklineHeightFrac,
    uvScale: 1.7,
  });
  const usedSkinnedTorso = clonedTorsoTris >= 80;

  // Fallback sculpted lathe bodice ONLY if the loaded model had no clonable torso/top mesh
  if (!usedSkinnedTorso && chestGroup) {
    const bodiceGeo = createContouredTorsoLathe({
      profile: [
        [0.102 * scaleX, yBottomInChest],
        [0.092 * scaleX, yWaistInChest],
        [0.098 * scaleX, 0.0],
        [0.108 * scaleX, yBustInChest],
        [0.100 * scaleX, yTop * 0.82],
        [necklineHeightFrac > 0.78 ? 0.086 * scaleX : 0.096 * scaleX, yTop],
        [necklineHeightFrac > 0.78 ? 0.060 * scaleX : 0.082 * scaleX, yTop + 0.008],
      ],
      scaleX: 1.06,
      scaleZ: 0.88 * scaleZ,
      bustCenterY: yBustInChest,
      bustBoost,
      frontBellyBoost: 0.006,
      rearGluteY: yBottomInChest,
      rearGluteBoost: 0.008,
      fwdSign,
      segments: 30,
    });
    chestGroup.add(new THREE.Mesh(bodiceGeo, topMat));
  }

  // Fallback slim pelvis liner ONLY when NOT covered by real skinned pants/swimsuit AND torso wasn't skinned
  if (!usedSkinnedTorso && !pelvisCoveredByPants && hipsGroup) {
    const hipTopY = metrics.ySpineFromHips + metrics.yChestFromSpine * 0.48;
    const pelvisGeo = createContouredTorsoLathe({
      profile: [
        [0.064 * scaleX, -0.092],
        [0.098 * scaleX, -0.062],
        [0.112 * scaleX, -0.020],
        [0.108 * scaleX, 0.025],
        [0.098 * scaleX, metrics.ySpineFromHips * 0.92],
        [0.094 * scaleX, hipTopY],
      ],
      scaleX: 1.08,
      scaleZ: 0.94 * scaleZ,
      bustBoost: 0,
      frontBellyBoost: 0.005,
      rearGluteY: -0.02,
      rearGluteBoost: 0.012,
      fwdSign,
      segments: 30,
    });
    hipsGroup.add(new THREE.Mesh(pelvisGeo, hipsMat || topMat));
  }

  return {
    chestGroup,
    spineGroup,
    hipsGroup,
    topNeckY: yTop,
    waistYInChest: yWaistInChest,
    usedSkinnedTorso,
  };
}

export interface SyncGarmentParams {
  vrm: VRM | null;
  avatarRoot: THREE.Object3D;
  garmentStyle?: GarmentStyleId;
  topHex?: string;
  topAccentHex?: string;
  bottomHex?: string;
  bottomAccentHex?: string;
  accessoryHex?: string;
  topTextureDataUrl?: string | null;
  bottomTextureDataUrl?: string | null;
}

/**
 * Mounts seamless, anime cel-shaded, bone-tracked 3D garment silhouettes onto ANY VRM 0.x or 1.0 humanoid rig!
 */
export function syncProceduralGarmentToVrm(params: SyncGarmentParams): void {
  const {
    vrm,
    avatarRoot,
    garmentStyle = 'default',
    topHex = '#f8fafc',
    topAccentHex = '#8b5cf6',
    bottomHex = '#1e1b4b',
    bottomAccentHex = '#a78bfa',
    accessoryHex = '#f472b6',
    topTextureDataUrl = null,
    bottomTextureDataUrl = null,
  } = params;

  clearExistingGarments(avatarRoot);
  if (!vrm?.humanoid || garmentStyle === 'default') return;

  const isVrm0 = vrm.meta?.metaVersion === '0';
  const fwdSign = isVrm0 ? -1 : 1;
  const avatarSkinHex = sampleAvatarSkinColorHex(avatarRoot);
  const metrics = measureTorsoMetrics(vrm);
  const skinCoverage = inspectVrmBodySkinCoverage(vrm, avatarRoot);

  const topMat = makeAnimeFabricMaterial(topHex, {
    textureDataUrl: topTextureDataUrl,
    doubleSide: true,
  });
  const topAccentMat = makeAnimeFabricMaterial(topAccentHex, { doubleSide: true });
  const bottomMat = makeAnimeFabricMaterial(bottomHex, {
    textureDataUrl: bottomTextureDataUrl,
    doubleSide: true,
  });
  const bottomAccentMat = makeAnimeFabricMaterial(bottomAccentHex, { doubleSide: true });
  const accMat = makeAnimeFabricMaterial(accessoryHex, { doubleSide: true, emissiveBoost: 0.28 });
  const whiteMat = makeAnimeFabricMaterial('#ffffff', { doubleSide: true, emissiveBoost: 0.28 });
  const goldMat = makeAnimeFabricMaterial('#facc15', { doubleSide: true, emissiveBoost: 0.34 });

  if (garmentStyle === 'cozy_hoodie_pants') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'none',
      collarboneBridge: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const usedSkinnedPants = addLegPants({
      vrm,
      avatarRoot,
      mat: bottomMat,
      cuffMat: bottomAccentMat,
      looseFactor: 1.08,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.12,
      scaleZ: 1.12,
      necklineHeightFrac: 0.88,
      bustBoost: 0.018,
      fwdSign,
      skinnedZone: 'torso_long_sleeve',
      skinnedInflate: 0.011,
      pelvisCoveredByPants: usedSkinnedPants,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.14 });
    }

    if (chestGroup) {
      // Plush 3D Hood resting behind her neck & shoulders (never clipping chin!)
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.032, 12, 24), topMat);
      hood.rotation.x = Math.PI * 0.46;
      hood.position.set(0, topNeckY - 0.005, -0.055 * fwdSign);
      chestGroup.add(hood);

      // Cute dangling drawstrings
      for (const sx of [-0.032, 0.032]) {
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.125, 8), whiteMat);
        str.position.set(sx, topNeckY - 0.065, 0.112 * fwdSign);
        const aglet = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.016, 8), accMat);
        aglet.position.set(sx, topNeckY - 0.13, 0.112 * fwdSign);
        chestGroup.add(str, aglet);
      }

      // Front kangaroo pouch pocket
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.088, 0.028), topAccentMat);
      pocket.position.set(0, -metrics.yChestFromSpine * 0.62, 0.098 * fwdSign);
      chestGroup.add(pocket);
    }
    if (hipsGroup && !usedSkinnedTorso) {
      const ribBand = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.012, 10, 28), topAccentMat);
      ribBand.rotation.x = Math.PI / 2;
      ribBand.scale.set(1.08, 0.92, 1);
      ribBand.position.set(0, -0.02, 0);
      hipsGroup.add(ribBand);
    }
  } else if (garmentStyle === 'summer_sundress') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'below_cap',
      collarboneBridge: true,
      upperThighs: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: topMat,
      scaleX: 1.02,
      scaleZ: 1.0,
      necklineHeightFrac: 0.64,
      bustBoost: 0.026,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.0055,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'cap', looseFactor: 0.96 });
    }

    if (chestGroup && !usedSkinnedTorso) {
      // Delicate sundress shoulder straps & trims for fallback non-skinned models only
      // (avoids floating rigid hula-hoop rings around real SkinnedMesh torsos!)
      for (const sx of [-0.072, 0.072]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.085, 0.082), topAccentMat);
        strap.position.set(sx, topNeckY + 0.032, 0);
        chestGroup.add(strap);
      }
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.008, 10, 28), topAccentMat);
      trim.rotation.x = Math.PI / 2;
      trim.scale.set(1.05, 0.84, 1);
      trim.position.set(0, topNeckY, 0.004 * fwdSign);
      chestGroup.add(trim);

      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.013, 10, 28), accMat);
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1.05, 0.84, 1);
      belt.position.set(0, waistYInChest, 0);
      const bow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), accMat);
      bow.scale.set(1.75, 0.85, 0.65);
      bow.position.set(0, waistYInChest, 0.096 * fwdSign);
      chestGroup.add(belt, bow);
    }
    if (hipsGroup) {
      // Graceful flared pleated anime midi sundress skirt!
      const skirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.112,
          bottomRadius: 0.30,
          height: 0.50,
          pleatCount: 16,
          pleatDepth: 0.014,
          flarePower: 0.82,
        }),
        topMat
      );
      skirt.position.set(0, -0.22, 0);
      registerDynamicSkirtMesh(skirt, 0.50, fwdSign);

      const hem = new THREE.Mesh(new THREE.TorusGeometry(0.298, 0.009, 10, 36), topAccentMat);
      hem.rotation.x = Math.PI / 2;
      hem.scale.set(1.06, 0.88, 1);
      hem.position.set(0, -0.47, 0);
      hem.userData.dynamicSkirtHem = { baseY: -0.47, fwdSign, height: 0.50 };
      hipsGroup.add(skirt, hem);
    }
  } else if (garmentStyle === 'streetwear_jacket_shorts') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'none',
      upperThighs: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const usedSkinnedShorts = addLegPants({
      vrm,
      avatarRoot,
      mat: bottomMat,
      cuffMat: bottomAccentMat,
      shortsOnly: true,
      looseFactor: 1.04,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat: whiteMat,
      hipsMat: bottomMat,
      scaleX: 1.02,
      scaleZ: 1.02,
      necklineHeightFrac: 0.84,
      bustBoost: 0.022,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.0055,
      pelvisCoveredByPants: usedSkinnedShorts,
    });
    const clonedSleeves = buildBodyClonedSkinnedGarment({
      vrm,
      avatarRoot,
      mat: topMat,
      zone: 'sleeves_full',
      inflate: 0.010,
      uvScale: 1.7,
    });
    if (clonedSleeves < 50) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.12 });
    }

    if (chestGroup) {
      // Open-front cropped bomber jacket sculpted outer shell wrapping back & sides cleanly
      const jacketBack = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.114,
          bottomRadius: 0.110,
          height: topNeckY - waistYInChest + 0.02,
          pleatCount: 0,
          scaleX: 1.10,
          scaleZ: 0.88,
          openSlitFront: true,
          fwdSign,
        }),
        topMat
      );
      jacketBack.position.set(0, (topNeckY + waistYInChest) * 0.5, 0);
      chestGroup.add(jacketBack);

      // Gold front jacket zipper trims
      for (const sx of [-0.042, 0.042]) {
        const zip = new THREE.Mesh(
          new THREE.BoxGeometry(0.011, topNeckY - waistYInChest, 0.014),
          goldMat
        );
        zip.position.set(sx, (topNeckY + waistYInChest) * 0.5, 0.095 * fwdSign);
        chestGroup.add(zip);
      }

      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.080, 0.014, 10, 24), topAccentMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, topNeckY, -0.004 * fwdSign);
      chestGroup.add(collar);
    }
    if (hipsGroup) {
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.110, 0.012, 10, 28), accMat);
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1.06, 0.86, 1);
      belt.position.set(0, 0.032, 0);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.016), goldMat);
      buckle.position.set(0, 0.032, 0.104 * fwdSign);
      hipsGroup.add(belt, buckle);
    }
  } else if (garmentStyle === 'sporty_tee_leggings') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'below_short_sleeve',
      collarboneBridge: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const usedSkinnedLeggings = addLegPants({
      vrm,
      avatarRoot,
      mat: bottomMat,
      looseFactor: 0.98,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.0,
      scaleZ: 0.98,
      necklineHeightFrac: 0.85,
      bustBoost: 0.022,
      fwdSign,
      skinnedZone: 'torso_short_sleeve',
      skinnedInflate: 0.0065,
      pelvisCoveredByPants: usedSkinnedLeggings,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'short', looseFactor: 1.02 });
    }

    if (chestGroup && !usedSkinnedTorso) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.009, 10, 24), topAccentMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, topNeckY + 0.004, 0);
      chestGroup.add(collar);
    }
    if (hipsGroup && !usedSkinnedLeggings) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.013, 10, 28), bottomAccentMat);
      band.rotation.x = Math.PI / 2;
      band.scale.set(1.06, 0.85, 1);
      band.position.set(0, 0.028, 0);
      hipsGroup.add(band);
    }
  } else if (garmentStyle === 'kimono_yukata') {
    const { chestGroup, hipsGroup, topNeckY, waistYInChest } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: topMat,
      scaleX: 1.05,
      scaleZ: 1.04,
      necklineHeightFrac: 0.86,
      bustBoost: 0.016,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.0085,
    });
    addArmSleeves({ vrm, mat: topMat, mode: 'kimono', looseFactor: 1.15 });

    if (chestGroup) {
      // Crisp white crossed V-neck juban kimono collar
      for (const side of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.16, 0.016), whiteMat);
        lapel.position.set(side * 0.028, topNeckY - 0.055, 0.092 * fwdSign);
        lapel.rotation.z = side * 0.42;
        chestGroup.add(lapel);
      }
      // Wide decorative Obi sash + woven obijime cord + traditional back obi bow
      const obi = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.106,
          bottomRadius: 0.114,
          height: 0.125,
          pleatCount: 0,
          scaleX: 1.08,
          scaleZ: 0.88,
        }),
        accMat
      );
      obi.position.set(0, waistYInChest + 0.01, 0);
      const cord = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.008, 10, 28), goldMat);
      cord.rotation.x = Math.PI / 2;
      cord.scale.set(1.08, 0.88, 1);
      cord.position.set(0, waistYInChest + 0.01, 0);
      const backBow = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.13, 0.075), accMat);
      backBow.position.set(0, waistYInChest + 0.02, -0.13 * fwdSign);
      chestGroup.add(obi, cord, backBow);
    }
    if (hipsGroup) {
      const robeSkirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.118,
          bottomRadius: 0.20,
          height: 0.72,
          pleatCount: 6,
          pleatDepth: 0.006,
          flarePower: 1.0,
        }),
        bottomMat
      );
      robeSkirt.position.set(0, -0.34, 0);
      registerDynamicSkirtMesh(robeSkirt, 0.72, fwdSign);
      hipsGroup.add(robeSkirt);
    }
  } else if (garmentStyle === 'evening_gown') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'upper_only',
      collarboneBridge: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.02,
      scaleZ: 1.0,
      necklineHeightFrac: 0.62,
      bustBoost: 0.028,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.0055,
    });
    const clonedGloves = buildBodyClonedSkinnedGarment({
      vrm,
      avatarRoot,
      mat: accMat,
      zone: 'gloves',
      inflate: 0.0032,
      uvScale: 1.8,
    });
    if (clonedGloves < 40) {
      addArmSleeves({ vrm, mat: accMat, cuffMat: goldMat, mode: 'gloves', looseFactor: 0.98 });
    }

    if (chestGroup && !usedSkinnedTorso) {
      // Fitted bustline & waist trim ONLY on fallback non-skinned models (zero floating hula-hoops!)
      const bustTrim = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.009, 10, 32), topAccentMat);
      bustTrim.rotation.x = Math.PI / 2;
      bustTrim.scale.set(1.06, 0.84, 1);
      bustTrim.position.set(0, topNeckY, 0.005 * fwdSign);

      const corsage = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.012, 10, 28), goldMat);
      corsage.rotation.x = Math.PI / 2;
      corsage.scale.set(1.06, 0.85, 1);
      corsage.position.set(0, waistYInChest, 0);
      chestGroup.add(bustTrim, corsage);
    }
    if (hipsGroup) {
      const outerGown = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.114,
          bottomRadius: 0.42,
          height: 0.80,
          pleatCount: 20,
          pleatDepth: 0.015,
          flarePower: 0.78,
        }),
        bottomMat
      );
      outerGown.position.set(0, -0.38, 0);
      registerDynamicSkirtMesh(outerGown, 0.80, fwdSign);

      // Matched 20-pleat peplum flared cleanly OUTSIDE outerGown (zero dark zebra-stripe clipping!)
      const peplum = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.130,
          bottomRadius: 0.295,
          height: 0.22,
          pleatCount: 20,
          pleatDepth: 0.013,
        }),
        topAccentMat
      );
      peplum.position.set(0, -0.09, 0);
      registerDynamicSkirtMesh(peplum, 0.22, fwdSign);
      hipsGroup.add(outerGown, peplum);
    }
  } else if (garmentStyle === 'cozy_pajamas') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'none',
      collarboneBridge: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const usedSkinnedPants = addLegPants({
      vrm,
      avatarRoot,
      mat: bottomMat,
      cuffMat: whiteMat,
      looseFactor: 1.10,
      fwdSign,
    });
    const { chestGroup, topNeckY, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.06,
      scaleZ: 1.06,
      necklineHeightFrac: 0.85,
      bustBoost: 0.018,
      fwdSign,
      skinnedZone: 'torso_long_sleeve',
      skinnedInflate: 0.010,
      pelvisCoveredByPants: usedSkinnedPants,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: whiteMat, mode: 'full', looseFactor: 1.1 });
    }

    if (chestGroup && !usedSkinnedTorso) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.012, 10, 24), whiteMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, topNeckY + 0.002, 0);
      chestGroup.add(collar);
      for (let i = 0; i < 3; i++) {
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 10), whiteMat);
        btn.position.set(0, topNeckY - 0.045 - i * 0.052, 0.102 * fwdSign);
        chestGroup.add(btn);
      }
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.052, 0.012), topAccentMat);
      pocket.position.set(0.052, topNeckY * 0.42, 0.098 * fwdSign);
      chestGroup.add(pocket);
    }
  } else if (garmentStyle === 'school_blazer') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'none',
      collarboneBridge: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const { chestGroup, hipsGroup, topNeckY, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.05,
      scaleZ: 1.05,
      necklineHeightFrac: 0.85,
      bustBoost: 0.020,
      fwdSign,
      skinnedZone: 'torso_long_sleeve',
      skinnedInflate: 0.0085,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.05 });
    }

    if (chestGroup) {
      const shirtV = new THREE.Mesh(new THREE.ConeGeometry(0.054, 0.13, 4), whiteMat);
      shirtV.rotation.x = Math.PI;
      shirtV.scale.set(1, 1, 0.32);
      shirtV.position.set(0, topNeckY - 0.045, 0.096 * fwdSign);
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.036, 0.018), accMat);
      ribbon.position.set(0, topNeckY - 0.035, 0.108 * fwdSign);
      const tieTail = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.072, 0.012), accMat);
      tieTail.position.set(0, topNeckY - 0.082, 0.106 * fwdSign);
      chestGroup.add(shirtV, ribbon, tieTail);

      for (const sx of [-0.034, 0.034]) {
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 10, 10), goldMat);
        btn.position.set(sx, -0.01, 0.100 * fwdSign);
        chestGroup.add(btn);
      }
    }
    if (hipsGroup) {
      const skirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.115,
          bottomRadius: 0.245,
          height: 0.34,
          pleatCount: 18,
          pleatDepth: 0.015,
          flarePower: 0.9,
        }),
        bottomMat
      );
      skirt.position.set(0, -0.145, 0);
      registerDynamicSkirtMesh(skirt, 0.34, fwdSign);
      hipsGroup.add(skirt);
    }
  } else if (garmentStyle === 'trench_coat_pants') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'none',
      collarboneBridge: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const usedSkinnedPants = addLegPants({
      vrm,
      avatarRoot,
      mat: bottomMat,
      looseFactor: 1.0,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.09,
      scaleZ: 1.09,
      necklineHeightFrac: 0.87,
      bustBoost: 0.018,
      fwdSign,
      skinnedZone: 'torso_long_sleeve',
      skinnedInflate: 0.010,
      pelvisCoveredByPants: usedSkinnedPants,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.12 });
    }

    if (chestGroup) {
      for (const side of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.155, 0.022), topAccentMat);
        lapel.position.set(side * 0.044, topNeckY - 0.055, 0.104 * fwdSign);
        lapel.rotation.z = side * 0.26;
        chestGroup.add(lapel);
        for (let b = 0; b < 3; b++) {
          const btn = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 10, 10), goldMat);
          btn.position.set(side * 0.034, topNeckY - 0.075 - b * 0.05, 0.110 * fwdSign);
          chestGroup.add(btn);
        }
      }
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.015, 10, 28), accMat);
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1.08, 0.88, 1);
      belt.position.set(0, waistYInChest, 0);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.032, 0.016), goldMat);
      buckle.position.set(0, waistYInChest, 0.105 * fwdSign);
      chestGroup.add(belt, buckle);
    }
    if (hipsGroup) {
      const coatTail = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.125,
          bottomRadius: 0.26,
          height: 0.50,
          pleatCount: 8,
          pleatDepth: 0.010,
          openSlitFront: true,
          fwdSign,
        }),
        topMat
      );
      coatTail.position.set(0, -0.22, 0);
      registerDynamicSkirtMesh(coatTail, 0.50, fwdSign);
      hipsGroup.add(coatTail);
    }
  } else if (garmentStyle === 'bath_wrap') {
    const towelMat = makeAnimeFabricMaterial(topHex || '#fce7f3', {
      doubleSide: true,
      emissiveBoost: 0.28,
    });
    const trimMat = makeAnimeFabricMaterial(topAccentHex || '#f9a8d4', {
      doubleSide: true,
      emissiveBoost: 0.26,
    });
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'full',
      collarboneBridge: true,
      upperThighs: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const { chestGroup, hipsGroup, topNeckY, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat: towelMat,
      hipsMat: towelMat,
      scaleX: 1.06,
      scaleZ: 1.05,
      necklineHeightFrac: 0.62,
      bustBoost: 0.024,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.009,
    });

    if (chestGroup && !usedSkinnedTorso) {
      const topBand = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.014, 10, 28), trimMat);
      topBand.rotation.x = Math.PI / 2;
      topBand.scale.set(1.08, 0.82, 1);
      topBand.position.set(0, topNeckY, 0.004 * fwdSign);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), trimMat);
      knot.scale.set(1.35, 0.9, 0.75);
      knot.position.set(0.032, topNeckY - 0.005, 0.098 * fwdSign);
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.20, 0.016), trimMat);
      fold.position.set(0.032, topNeckY - 0.11, 0.095 * fwdSign);
      chestGroup.add(topBand, knot, fold);
    }
    if (hipsGroup) {
      const towelSkirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.122,
          bottomRadius: 0.168,
          height: 0.34,
          pleatCount: 6,
          pleatDepth: 0.006,
        }),
        towelMat
      );
      towelSkirt.position.set(0, -0.15, 0);
      registerDynamicSkirtMesh(towelSkirt, 0.34, fwdSign);

      const bottomStripe = new THREE.Mesh(new THREE.TorusGeometry(0.166, 0.009, 10, 32), trimMat);
      bottomStripe.rotation.x = Math.PI / 2;
      bottomStripe.scale.set(1.06, 0.88, 1);
      bottomStripe.position.set(0, -0.315, 0);
      bottomStripe.userData.dynamicSkirtHem = { baseY: -0.315, fwdSign, height: 0.34 };
      hipsGroup.add(towelSkirt, bottomStripe);
    }
  } else if (garmentStyle === 'beach_swimsuit') {
    // Sleek, sculpted anime one-piece resort swimsuit + bright sheer pleated beach pareo!
    const swimMat = makeAnimeFabricMaterial(topHex || '#06b6d4', {
      textureDataUrl: topTextureDataUrl,
      doubleSide: true,
      emissiveBoost: 0.26,
    });
    const pareoMat = makeAnimeFabricMaterial(bottomHex || '#67e8f9', {
      doubleSide: true,
      transparent: true,
      opacity: 0.68,
      emissiveBoost: 0.32,
    });
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'full',
      collarboneBridge: true,
      upperThighs: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat: swimMat,
      hipsMat: swimMat,
      scaleX: 0.99,
      scaleZ: 0.98,
      necklineHeightFrac: 0.60,
      bustBoost: 0.028,
      fwdSign,
      skinnedZone: 'swimsuit',
      skinnedInflate: 0.0048,
      pelvisCoveredByPants: true,
    });

    if (chestGroup && !usedSkinnedTorso) {
      // Sleek halter / resort shoulder straps cleanly bridging over her bare anime collarbone
      for (const sx of [-0.060, 0.060]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.088, 0.072), topAccentMat);
        strap.position.set(sx, topNeckY + 0.036, 0);
        chestGroup.add(strap);
      }
      // Subtle sculpted bustline ruffle trim (sits neatly across chest, NEVER near chin!)
      const ruffle = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.010, 10, 28), topAccentMat);
      ruffle.rotation.x = Math.PI / 2;
      ruffle.scale.set(1.07, 0.85, 1);
      ruffle.position.set(0, topNeckY, 0.006 * fwdSign);

      // Cute side-tied beach ribbon belt at waist
      const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.010, 10, 28), accMat);
      ribbon.rotation.x = Math.PI / 2;
      ribbon.scale.set(1.07, 0.86, 1);
      ribbon.position.set(0, waistYInChest - 0.01, 0);
      const sideKnot = new THREE.Mesh(new THREE.SphereGeometry(0.020, 12, 10), accMat);
      sideKnot.scale.set(1.35, 0.85, 0.75);
      sideKnot.position.set(0.106, waistYInChest - 0.01, 0.052 * fwdSign);
      chestGroup.add(ruffle, ribbon, sideKnot);
    }
    if (hipsGroup) {
      // Flowy pleated sheer beach pareo wrap (gently flared & pleated, never a stiff brown cone!)
      const pareo = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.116,
          bottomRadius: 0.215,
          height: 0.25,
          pleatCount: 16,
          pleatDepth: 0.011,
          flarePower: 0.85,
        }),
        pareoMat
      );
      pareo.position.set(0, -0.105, 0);
      registerDynamicSkirtMesh(pareo, 0.25, fwdSign);
      hipsGroup.add(pareo);
    }
  }
}

export interface GarmentFrameUpdateOptions {
  vrm?: VRM | null;
  dt?: number;
  isSeated?: boolean;
  /** World-space Y height of chair/stool seat cushion top (default 0.45m) */
  seatSurfaceWorldY?: number;
}

const _lArmStart = new THREE.Vector3();
const _lArmEnd = new THREE.Vector3();
const _rArmStart = new THREE.Vector3();
const _rArmEnd = new THREE.Vector3();
const _lSegA = new THREE.Vector3();
const _lSegB = new THREE.Vector3();
const _rSegA = new THREE.Vector3();
const _rSegB = new THREE.Vector3();
const _tmpInvMat = new THREE.Matrix4();
const _tmpVert = new THREE.Vector3();
const _tmpClosest = new THREE.Vector3();
const _tmpDiff = new THREE.Vector3();
const _tmpSeg = new THREE.Vector3();
const _tmpWorldVert = new THREE.Vector3();

function closestPointOnSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  out: THREE.Vector3
): THREE.Vector3 {
  _tmpSeg.subVectors(b, a);
  const lenSq = _tmpSeg.lengthSq();
  if (lenSq < 1e-8) return out.copy(a);
  const t = THREE.MathUtils.clamp(_tmpDiff.subVectors(p, a).dot(_tmpSeg) / lenSq, 0, 1);
  return out.copy(a).addScaledVector(_tmpSeg, t);
}

/**
 * Updates organic fabric hem sway, real-time off-shoulder collar ring conformity around moving biceps,
 * and smooth seated skirt draping over thighs & chair seat contact plane (zero chair/seat clipping!).
 */
export function updateProceduralGarmentSway(
  avatarRoot: THREE.Object3D | null,
  elapsed: number,
  options?: GarmentFrameUpdateOptions
): void {
  if (!avatarRoot) return;
  const vrm = options?.vrm ?? null;
  const dt = options?.dt ?? 1 / 60;
  const isSeated = options?.isSeated ?? false;
  const seatSurfaceWorldY = options?.seatSurfaceWorldY ?? 0.45;
  const blendAlpha = expSmooth(8.5, dt);

  // Pre-fetch upper-arm world segments once per frame (zero per-frame heap allocations!)
  let hasArmSegments = false;
  if (vrm?.humanoid) {
    const lu = vrm.humanoid.getRawBoneNode('leftUpperArm');
    const ll = vrm.humanoid.getRawBoneNode('leftLowerArm');
    const ru = vrm.humanoid.getRawBoneNode('rightUpperArm');
    const rl = vrm.humanoid.getRawBoneNode('rightLowerArm');
    if (lu && ll && ru && rl) {
      lu.getWorldPosition(_lArmStart);
      ll.getWorldPosition(_lArmEnd);
      ru.getWorldPosition(_rArmStart);
      rl.getWorldPosition(_rArmEnd);
      hasArmSegments = true;
    }
  }

  avatarRoot.traverse((obj) => {
    if (obj.userData?.garmentSkirtSway) {
      const swayAmp = isSeated ? 0.25 : 1.0;
      obj.rotation.z = Math.sin(elapsed * 1.65) * 0.022 * swayAmp;
      obj.rotation.x = Math.cos(elapsed * 1.25) * 0.014 * swayAmp;
    }

    // 1. Dynamic Off-Shoulder Collar Ring Conformity around moving upper arms
    const collarData = obj.userData?.dynamicCollarRing as DynamicCollarRingData | undefined;
    if (collarData && obj instanceof THREE.Mesh && hasArmSegments) {
      const pos = obj.geometry.attributes.position as THREE.BufferAttribute;
      const rest = collarData.restPos;
      obj.updateWorldMatrix(true, false);
      _tmpInvMat.copy(obj.matrixWorld).invert();

      _lSegA.copy(_lArmStart).applyMatrix4(_tmpInvMat);
      _lSegB.copy(_lArmEnd).applyMatrix4(_tmpInvMat);
      _rSegA.copy(_rArmStart).applyMatrix4(_tmpInvMat);
      _rSegB.copy(_rArmEnd).applyMatrix4(_tmpInvMat);

      const clearR = collarData.armClearance;
      for (let i = 0; i < pos.count; i++) {
        const rx = rest[i * 3];
        const ry = rest[i * 3 + 1];
        const rz = rest[i * 3 + 2];
        _tmpVert.set(rx, ry, rz);

        // Push lateral/anterior collar vertices outward past left upper arm capsule
        closestPointOnSegment(_tmpVert, _lSegA, _lSegB, _tmpClosest);
        _tmpDiff.subVectors(_tmpVert, _tmpClosest);
        let dist = _tmpDiff.length();
        if (dist < clearR && dist > 1e-5) {
          _tmpVert.addScaledVector(_tmpDiff, ((clearR - dist) * 1.08) / dist);
        }

        // Push lateral/anterior collar vertices outward past right upper arm capsule
        closestPointOnSegment(_tmpVert, _rSegA, _rSegB, _tmpClosest);
        _tmpDiff.subVectors(_tmpVert, _tmpClosest);
        dist = _tmpDiff.length();
        if (dist < clearR && dist > 1e-5) {
          _tmpVert.addScaledVector(_tmpDiff, ((clearR - dist) * 1.08) / dist);
        }

        pos.setXYZ(i, _tmpVert.x, _tmpVert.y, _tmpVert.z);
      }
      pos.needsUpdate = true;
      obj.geometry.computeVertexNormals();
    }

    // 2. Dynamic Seated Skirt Draping & Chair-Seat / Backrest Collision Avoidance
    const skirtData = obj.userData?.dynamicSkirtDrape as DynamicSkirtDrapeData | undefined;
    if (skirtData && obj instanceof THREE.Mesh) {
      const targetSeated = isSeated ? 1 : 0;
      const prevBlend = skirtData.seatedBlend;
      skirtData.seatedBlend = THREE.MathUtils.lerp(prevBlend, targetSeated, blendAlpha);
      if (skirtData.seatedBlend < 0.002 && prevBlend < 0.002) return;

      const s = skirtData.seatedBlend;
      const pos = obj.geometry.attributes.position as THREE.BufferAttribute;
      const rest = skirtData.restPos;
      const h = Math.max(0.1, skirtData.height);
      const fwd = skirtData.fwdSign;

      obj.updateWorldMatrix(true, false);
      _tmpInvMat.copy(obj.matrixWorld).invert();
      const seatFloorY = seatSurfaceWorldY + 0.014;

      for (let i = 0; i < pos.count; i++) {
        const rx = rest[i * 3];
        const ry = rest[i * 3 + 1];
        const rz = rest[i * 3 + 2];
        // t = 0 at waistband top, t = 1 at bottom skirt hem
        const t = THREE.MathUtils.clamp(0.5 - ry / h, 0, 1);
        const tCurve = t * t;

        const fwdDot = (rz * fwd) / Math.max(0.03, Math.hypot(rx, rz)); // +1 = front, -1 = back
        const frontWeight = THREE.MathUtils.clamp((fwdDot + 0.35) / 1.35, 0, 1);
        const backWeight = THREE.MathUtils.clamp((-fwdDot + 0.25) / 1.25, 0, 1);
        const sideWeight = 1 - Math.abs(fwdDot);

        let nx = rx;
        let ny = ry;
        let nz = rz;

        // Front & lateral hem flares gracefully forward and slightly outward over seated thighs/lap!
        const lapForward = Math.min(0.24, h * 0.42) * t * frontWeight * s;
        const lapLift = Math.min(0.16, h * 0.28) * tCurve * frontWeight * s;
        const sideFlare = (0.045 * sideWeight + 0.025 * frontWeight) * t * s;
        nx += Math.sign(rx || 1) * sideFlare;
        ny += lapLift;
        nz += fwd * lapForward;

        // Posterior skirt pulls softly forward out of the chair backrest & cushions cleanly onto the seat!
        const backPullForward = Math.min(0.12, h * 0.22) * t * backWeight * s;
        nz += fwd * backPullForward;

        // Enforce world-space seat contact plane (y >= seatSurfaceY + 0.014) for posterior/lateral vertices
        if (s > 0.01 && t > 0.12) {
          _tmpWorldVert.set(nx, ny, nz).applyMatrix4(obj.matrixWorld);
          // Posterior & mid-skirt rest flat on seat cushion; very front edge drapes gently over thigh knees
          const minWorldY =
            seatFloorY - frontWeight * Math.min(0.06, h * 0.14) * tCurve;
          if (_tmpWorldVert.y < minWorldY) {
            const liftDelta = (minWorldY - _tmpWorldVert.y) * s;
            _tmpWorldVert.y += liftDelta;
            // Spread displaced cloth slightly forward/outward like real draped fabric pooling on seat
            _tmpWorldVert.z += 0.04 * liftDelta * (1 - backWeight * 0.5);
            _tmpWorldVert.applyMatrix4(_tmpInvMat);
            nx = _tmpWorldVert.x;
            ny = _tmpWorldVert.y;
            nz = _tmpWorldVert.z;
          }
        }

        pos.setXYZ(i, nx, ny, nz);
      }
      pos.needsUpdate = true;
      obj.geometry.computeVertexNormals();
    }

    // 3. Keep matching skirt hem trim rings smoothly aligned during seated draping
    const hemData = obj.userData?.dynamicSkirtHem as
      | { baseY: number; fwdSign: number; height: number }
      | undefined;
    if (hemData) {
      const targetY = isSeated ? hemData.baseY + Math.min(0.20, hemData.height * 0.42) : hemData.baseY;
      const targetZ = isSeated ? hemData.fwdSign * Math.min(0.15, hemData.height * 0.28) : 0;
      obj.position.y = THREE.MathUtils.lerp(obj.position.y, targetY, blendAlpha);
      obj.position.z = THREE.MathUtils.lerp(obj.position.z, targetZ, blendAlpha);
      obj.visible = !isSeated || hemData.height <= 0.36;
    }
  });
}

const SEAT_COLLIDER_GROUP_NAME = '__zeta_seat_springbone_colliders__';

/**
 * Attaches dynamic `@pixiv/three-vrm` SpringBone capsule colliders for the chair seat cushion
 * and backrest whenever the character is seated, so native VRM skirts and long hair rest cleanly
 * on the chair surface instead of swinging/clipping through the stool or backrest.
 */
export function syncSeatSpringBoneColliders(
  vrm: VRM | null,
  avatarContainer: THREE.Object3D | null,
  isSeated: boolean,
  seatSurfaceLocalY = 0.45
): void {
  if (!vrm?.springBoneManager || !avatarContainer) return;
  const manager = vrm.springBoneManager;

  let holder = avatarContainer.getObjectByName(SEAT_COLLIDER_GROUP_NAME) as
    | (THREE.Group & { userData: { colliderGroup?: VRMSpringBoneColliderGroup } })
    | undefined;

  if (!holder) {
    holder = new THREE.Group();
    holder.name = SEAT_COLLIDER_GROUP_NAME;

    // 1. Horizontal capsule forming the chair/stool seat surface (top surface sits at seatSurfaceLocalY + 0.01)
    const seatCapsule = new VRMSpringBoneCollider(
      new VRMSpringBoneColliderShapeCapsule({
        offset: new THREE.Vector3(-0.22, seatSurfaceLocalY - 0.135, -0.055),
        tail: new THREE.Vector3(0.22, seatSurfaceLocalY - 0.135, -0.055),
        radius: 0.145,
      })
    );
    seatCapsule.name = 'ZetaSeatTopCollider';

    // 2. Rear backrest capsule behind character (-Z) to keep long hair & rear skirt out of chair frame
    const backCapsule = new VRMSpringBoneCollider(
      new VRMSpringBoneColliderShapeCapsule({
        offset: new THREE.Vector3(-0.20, seatSurfaceLocalY + 0.26, -0.34),
        tail: new THREE.Vector3(0.20, seatSurfaceLocalY + 0.26, -0.34),
        radius: 0.10,
      })
    );
    backCapsule.name = 'ZetaSeatBackCollider';

    holder.add(seatCapsule, backCapsule);
    holder.userData.colliderGroup = {
      name: SEAT_COLLIDER_GROUP_NAME,
      colliders: [seatCapsule, backCapsule],
    };
    avatarContainer.add(holder);
  }

  const group = holder.userData.colliderGroup;
  if (!group) return;

  for (const joint of manager.joints) {
    const idx = joint.colliderGroups.indexOf(group);
    if (isSeated && idx === -1) {
      joint.colliderGroups.push(group);
    } else if (!isSeated && idx !== -1) {
      joint.colliderGroups.splice(idx, 1);
    }
  }
}
