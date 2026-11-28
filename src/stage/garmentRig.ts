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

export function clearExistingGarments(root: THREE.Object3D): void {
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
    side: options?.doubleSide !== false ? THREE.DoubleSide : THREE.FrontSide,
    transparent: options?.transparent ?? false,
    opacity: options?.opacity ?? 1.0,
    depthWrite: options?.transparent ? false : true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
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
export function makeAnimeSkinMaterial(skinHex: string): MToonMaterial {
  const lit = new THREE.Color(skinHex);
  const shade = lit.clone().multiplyScalar(0.86);
  return new MToonMaterial({
    color: lit,
    shadeColorFactor: shade,
    shadingToonyFactor: 0.62,
    shadingShiftFactor: -0.05,
    side: THREE.DoubleSide,
  });
}

function attachGroup(parent: THREE.Object3D | null, name: string): THREE.Group | null {
  if (!parent) return null;
  const g = new THREE.Group();
  g.name = name;
  g.userData[GARMENT_TAG] = true;
  g.frustumCulled = false;
  parent.add(g);
  return g;
}

/**
 * Samples the loaded VRM avatar's actual bright MToon skin tone (preferring Face_00_SKIN first
 * since Face textures have clean cheek skin with zero clothing cutout holes!).
 */
export function sampleAvatarSkinColorHex(avatarRoot: THREE.Object3D): string {
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
 * Measures the REAL bone vertical spacing AND actual rest-pose body cross-sectional widths/depths
 * at `hips`, `spine`, `chest`, and `upperChest` (plus real arm bone-to-bone lengths) from the loaded
 * VRM without locking or overriding VRM body/head proportions!
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
  /** Measured actual body half-width & half-depth (in meters, VRM local bind units) at each torso level */
  hipsHalfW: number;
  hipsHalfD: number;
  hipsFrontZ: number;
  spineHalfW: number;
  spineHalfD: number;
  spineFrontZ: number;
  chestHalfW: number;
  chestHalfD: number;
  chestFrontZ: number;
  upperChestHalfW: number;
  upperChestHalfD: number;
  upperChestFrontZ: number;
  /** Measured bone-to-bone arm lengths */
  upperArmLen: number;
  lowerArmLen: number;
  /** Standard uniform garment skin clearance (+0.015m, within +0.014m..+0.018m) */
  garmentClearance: number;
}

function percentile92(vals: number[], fallback: number, minV: number, maxV: number): number {
  if (vals.length < 6) return fallback;
  vals.sort((a, b) => a - b);
  const idx = Math.min(vals.length - 1, Math.floor(vals.length * 0.92));
  return THREE.MathUtils.clamp(vals[idx], minV, maxV);
}

function measureTorsoMetrics(vrm: VRM, avatarRoot: THREE.Object3D, fwdSign: number): TorsoMetrics {
  const h = vrm.humanoid;
  const hips = h?.getRawBoneNode('hips') ?? null;
  const spine = h?.getRawBoneNode('spine') ?? null;
  const chest = h?.getRawBoneNode('chest') ?? spine;
  const upperChest = h?.getRawBoneNode('upperChest') ?? null;
  const neck = h?.getRawBoneNode('neck') ?? null;
  const lArm = h?.getRawBoneNode('leftUpperArm') ?? null;
  const lLowArm = h?.getRawBoneNode('leftLowerArm') ?? null;
  const lHand = h?.getRawBoneNode('leftHand') ?? null;
  const rArm = h?.getRawBoneNode('rightUpperArm') ?? null;
  const rLowArm = h?.getRawBoneNode('rightLowerArm') ?? null;
  const rHand = h?.getRawBoneNode('rightHand') ?? null;

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

  const yNeckFromChest = THREE.MathUtils.clamp(yUpperFromChest + yNeckLocal, 0.15, 0.30);
  const yShoulderFromChest = yNeckFromChest * 0.72;

  let halfShoulderW = 0.125;
  if (lArm && rArm) {
    const lPos = new THREE.Vector3();
    const rPos = new THREE.Vector3();
    lArm.getWorldPosition(lPos);
    rArm.getWorldPosition(rPos);
    const rootScale = Math.max(0.25, avatarRoot.scale.x || 1);
    const span = lPos.distanceTo(rPos) / rootScale;
    if (span > 0.14 && span < 0.45) {
      halfShoulderW = THREE.MathUtils.clamp(span * 0.5, 0.10, 0.17);
    }
  }

  // Dynamically measure actual bone-to-bone arm lengths (`upperArm -> lowerArm -> hand`)
  const measureSeg = (child: THREE.Object3D | null, fallback: number, minL: number, maxL: number) =>
    child && child.position.lengthSq() > 1e-4
      ? THREE.MathUtils.clamp(child.position.length(), minL, maxL)
      : fallback;
  const upperArmLen =
    (measureSeg(lLowArm, 0.23, 0.14, 0.36) + measureSeg(rLowArm, 0.23, 0.14, 0.36)) * 0.5;
  const lowerArmLen =
    (measureSeg(lHand, 0.21, 0.13, 0.34) + measureSeg(rHand, 0.21, 0.13, 0.34)) * 0.5;

  // Measure real rest-pose VRM body cross-sections (halfW, halfD, frontZ) at hips, spine, chest, upperChest
  const bands = {
    hips: { x: [] as number[], zAbs: [] as number[], zFwd: [] as number[] },
    spine: { x: [] as number[], zAbs: [] as number[], zFwd: [] as number[] },
    chest: { x: [] as number[], zAbs: [] as number[], zFwd: [] as number[] },
    upper: { x: [] as number[], zAbs: [] as number[], zFwd: [] as number[] },
  };

  avatarRoot.traverse((obj) => {
    if (!(obj instanceof THREE.SkinnedMesh) || obj.userData?.[GARMENT_TAG]) return;
    const geo = obj.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const lm = getBindPoseLandmarks(vrm, obj);
    if (!lm) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const groups =
      geo.groups && geo.groups.length > 0
        ? geo.groups
        : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }];
    const idxAttr = geo.index;

    const yHips = lm.hips.y;
    const ySpine = lm.hips.y + ySpineFromHips;
    const yChest = lm.chest.y;
    const yUpper = lm.chest.y + (lm.neck.y - lm.chest.y) * 0.55;
    const bandTol = 0.032;

    for (const grp of groups) {
      const m = mats[grp.materialIndex ?? 0];
      const matName = `${m?.name || ''} ${obj.name || ''}`;
      if (!isBodySkinMaterial(matName) || /face/i.test(matName)) continue;

      const end = grp.start + grp.count;
      for (let i = grp.start; i < end; i += 3) {
        const vi = idxAttr ? idxAttr.getX(i) : i;
        const vx = pos.getX(vi) - lm.hips.x;
        const vy = pos.getY(vi);
        const vz = pos.getZ(vi) - lm.hips.z;
        const ax = Math.abs(vx);
        const az = Math.abs(vz);
        if (ax > halfShoulderW * 1.15 || az > 0.22) continue;

        const zForward = vz * fwdSign;
        if (Math.abs(vy - yHips) <= bandTol) {
          bands.hips.x.push(ax);
          bands.hips.zAbs.push(az);
          if (zForward > 0) bands.hips.zFwd.push(zForward);
        } else if (Math.abs(vy - ySpine) <= bandTol) {
          bands.spine.x.push(ax);
          bands.spine.zAbs.push(az);
          if (zForward > 0) bands.spine.zFwd.push(zForward);
        } else if (Math.abs(vy - yChest) <= bandTol) {
          bands.chest.x.push(ax);
          bands.chest.zAbs.push(az);
          if (zForward > 0) bands.chest.zFwd.push(zForward);
        } else if (Math.abs(vy - yUpper) <= bandTol) {
          bands.upper.x.push(ax);
          bands.upper.zAbs.push(az);
          if (zForward > 0) bands.upper.zFwd.push(zForward);
        }
      }
    }
  });

  const hipsHalfW = percentile92(bands.hips.x, 0.112, 0.080, 0.165);
  const hipsHalfD = percentile92(bands.hips.zAbs, 0.092, 0.064, 0.135);
  const hipsFrontZ = percentile92(bands.hips.zFwd, hipsHalfD * 0.96, 0.055, 0.130);

  const spineHalfW = percentile92(bands.spine.x, 0.088, 0.062, 0.145);
  const spineHalfD = percentile92(bands.spine.zAbs, 0.072, 0.050, 0.118);
  const spineFrontZ = percentile92(bands.spine.zFwd, spineHalfD * 0.95, 0.048, 0.115);

  const chestHalfW = percentile92(bands.chest.x, 0.102, 0.072, 0.155);
  const chestHalfD = percentile92(bands.chest.zAbs, 0.088, 0.058, 0.140);
  const chestFrontZ = percentile92(bands.chest.zFwd, chestHalfD * 1.04, 0.058, 0.145);

  const upperChestHalfW = percentile92(bands.upper.x, 0.095, 0.068, 0.150);
  const upperChestHalfD = percentile92(bands.upper.zAbs, 0.074, 0.050, 0.120);
  const upperChestFrontZ = percentile92(bands.upper.zFwd, upperChestHalfD * 0.98, 0.050, 0.125);

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
    hipsHalfW,
    hipsHalfD,
    hipsFrontZ,
    spineHalfW,
    spineHalfD,
    spineFrontZ,
    chestHalfW,
    chestHalfD,
    chestFrontZ,
    upperChestHalfW,
    upperChestHalfD,
    upperChestFrontZ,
    upperArmLen,
    lowerArmLen,
    garmentClearance: 0.015,
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
  isCoatTail?: boolean;
}

function registerDynamicSkirtMesh(
  mesh: THREE.Mesh,
  height: number,
  fwdSign: number,
  isCoatTail = false
): void {
  const pos = mesh.geometry.attributes.position;
  if (!pos) return;
  mesh.userData.garmentSkirtSway = true;
  mesh.userData.dynamicSkirtDrape = {
    restPos: new Float32Array(pos.array as Float32Array),
    height,
    fwdSign,
    seatedBlend: 0,
    isCoatTail,
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
const REGION_NECK = 12;

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
// Pure skirt/bottom meshes are excluded from legs & torso, while Onepiece/Dress/Coat upper bodies ARE valid torso & sleeve sources!
const PURE_SKIRT_ONLY_REGEX = /skirt|pleat/i;
const SKIRT_OR_LOOSE_BOTTOM_REGEX = /skirt|pleat|dress|gown|onepiece|one_piece|coat|trench|cloak|cape/i;
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
const TOPS_MAT_REGEX =
  /top|shirt|blouse|sweater|hoodie|tee|blazer|jacket|inner|cloth|outfit|bodice|uniform|sailor|onepiece|one_piece|dress|gown|coat|trench|cardigan|bolero|vest|outer|costume|garment/i;
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
  reg('neck', REGION_NECK);
  reg('head', REGION_NECK);
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
      if (!isBodySkinMaterial(matName) || /face/i.test(matName)) continue;

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

export interface VrmBodyCullingReport {
  isPreCulled: boolean;
  hasCulledTorso: boolean;
  hasCulledThighs: boolean;
  hasCulledArms: boolean;
}

/**
 * Runtime Pre-Culled Model Detector:
 * Inspects the VRM's native `Body_SKIN` SkinnedMesh for VRoid "Delete transparent meshes" cutouts
 * around the thighs/pelvis or lower/upper torso. When missing/culled body polygons are detected,
 * the runtime preserves native clothing and falls back to clean material/texture recoloring instead
 * of stripping clothes and exposing a hollow body cavity!
 */
export function inspectVrmBodySkinCulling(
  vrm: VRM | null,
  avatarRoot: THREE.Object3D | null
): VrmBodyCullingReport {
  if (!vrm?.humanoid || !avatarRoot) {
    return {
      isPreCulled: true,
      hasCulledTorso: true,
      hasCulledThighs: true,
      hasCulledArms: true,
    };
  }

  let hasAnyBodySkinMesh = false;
  let torsoUpperMask = 0;
  let torsoLowerMask = 0;
  let torsoMinF = 1;
  let torsoMaxF = 0;
  let torsoTris = 0;
  let pelvisTris = 0;
  let thighTris = 0;
  let thighMinF = 1;
  let thighMaxF = 0;
  let armTris = 0;
  let armMinF = 1;
  let armMaxF = 0;

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

    const getDom = (vi: number) => {
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

    const yTorsoSpan = Math.max(0.14, lm.neck.y - lm.hips.y);

    for (const grp of groups) {
      const mat = mats[grp.materialIndex ?? 0];
      const matName = `${obj.name || ''} ${mat?.name || ''}`;
      if (!isBodySkinMaterial(matName) || /face/i.test(matName)) continue;
      hasAnyBodySkinMesh = true;

      const end = grp.start + grp.count;
      for (let tri = grp.start; tri + 2 < end; tri += 3) {
        const i0 = idxAttr ? idxAttr.getX(tri) : tri;
        const r = getDom(i0);
        const x = pos.getX(i0);
        const y = pos.getY(i0);
        const z = pos.getZ(i0);

        if (r === REGION_TORSO || r === REGION_PELVIS) {
          const tf = (y - lm.hips.y) / yTorsoSpan;
          if (tf >= -0.10 && tf <= 0.96) {
            torsoTris++;
            if (r === REGION_PELVIS) pelvisTris++;
            if (tf < torsoMinF) torsoMinF = tf;
            if (tf > torsoMaxF) torsoMaxF = tf;
            const sec =
              Math.floor(((Math.atan2(x - lm.hips.x, z - lm.hips.z) + Math.PI) / (Math.PI * 2)) * 8) & 7;
            if (tf >= 0.42) torsoUpperMask |= 1 << sec;
            else torsoLowerMask |= 1 << sec;
          }
        } else if (r === REGION_LEG_L_UP || r === REGION_LEG_R_UP) {
          const f =
            r === REGION_LEG_L_UP
              ? projectFracAlongSegment(x, y, z, lm.lUpLeg, lm.lLowLeg)
              : projectFracAlongSegment(x, y, z, lm.rUpLeg, lm.rLowLeg);
          thighTris++;
          if (f < thighMinF) thighMinF = f;
          if (f > thighMaxF) thighMaxF = f;
        } else if (r === REGION_ARM_L_UP || r === REGION_ARM_R_UP) {
          const f =
            r === REGION_ARM_L_UP
              ? projectFracAlongSegment(x, y, z, lm.lUpArm, lm.lLowArm)
              : projectFracAlongSegment(x, y, z, lm.rUpArm, lm.rLowArm);
          armTris++;
          if (f < armMinF) armMinF = f;
          if (f > armMaxF) armMaxF = f;
        }
      }
    }
  });

  if (!hasAnyBodySkinMesh) {
    // Missing body skin mesh -> strictly treat as pre-culled so native clothing is preserved!
    return {
      isPreCulled: true,
      hasCulledTorso: true,
      hasCulledThighs: true,
      hasCulledArms: true,
    };
  }

  const pop8 = (m: number) => {
    let n = 0;
    for (let b = 0; b < 8; b++) if (m & (1 << b)) n++;
    return n;
  };
  const hasCulledTorso =
    torsoTris < 150 ||
    pop8(torsoUpperMask) < 6 ||
    pop8(torsoLowerMask) < 6 ||
    torsoMaxF - torsoMinF < 0.62;
  const hasCulledThighs =
    pelvisTris < 40 || thighTris < 60 || thighMaxF - thighMinF < 0.50 || thighMinF > 0.30;
  const hasCulledArms = armTris < 60 || armMaxF - armMinF < 0.50 || armMinF > 0.32;

  const isPreCulled = hasCulledTorso || hasCulledThighs || hasCulledArms;

  return {
    isPreCulled,
    hasCulledTorso,
    hasCulledThighs,
    hasCulledArms,
  };
}

const _wtA = new THREE.Vector3();
const _wtB = new THREE.Vector3();
const _wtC = new THREE.Vector3();
const _wtNA = new THREE.Vector3();
const _wtNB = new THREE.Vector3();
const _wtNC = new THREE.Vector3();
const _wtNorm = new THREE.Vector3();
const _wtClosest = new THREE.Vector3();
const _wtBary = new THREE.Vector3();
const _wtQuery = new THREE.Vector3();

const _wtAB = new THREE.Vector3();
const _wtAC = new THREE.Vector3();
const _wtAP = new THREE.Vector3();
const _wtBP = new THREE.Vector3();
const _wtCP = new THREE.Vector3();
const _wtBC = new THREE.Vector3();

export function closestPointOnTriangleBarycentric(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  outClosest: THREE.Vector3,
  outBary: THREE.Vector3
): number {
  const ab = _wtAB.subVectors(b, a);
  const ac = _wtAC.subVectors(c, a);
  const ap = _wtAP.subVectors(p, a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) {
    outClosest.copy(a);
    outBary.set(1, 0, 0);
    return outClosest.distanceToSquared(p);
  }

  const bp = _wtBP.subVectors(p, b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) {
    outClosest.copy(b);
    outBary.set(0, 1, 0);
    return outClosest.distanceToSquared(p);
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 - d3 > 1e-8 ? d1 / (d1 - d3) : 0;
    outClosest.copy(a).addScaledVector(ab, v);
    outBary.set(1 - v, v, 0);
    return outClosest.distanceToSquared(p);
  }

  const cp = _wtCP.subVectors(p, c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) {
    outClosest.copy(c);
    outBary.set(0, 0, 1);
    return outClosest.distanceToSquared(p);
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 - d6 > 1e-8 ? d2 / (d2 - d6) : 0;
    outClosest.copy(a).addScaledVector(ac, w);
    outBary.set(1 - w, 0, w);
    return outClosest.distanceToSquared(p);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const denomBC = d4 - d3 + (d5 - d6);
    const w = denomBC > 1e-8 ? (d4 - d3) / denomBC : 0;
    const bc = _wtBC.subVectors(c, b);
    outClosest.copy(b).addScaledVector(bc, w);
    outBary.set(0, 1 - w, w);
    return outClosest.distanceToSquared(p);
  }

  const denom = 1 / Math.max(1e-8, va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const u = Math.max(0, 1 - v - w);
  outClosest.copy(a).addScaledVector(ab, v).addScaledVector(ac, w);
  outBary.set(u, v, w);
  return outClosest.distanceToSquared(p);
}

export interface BodySpatialGrid {
  cellSize: number;
  cells: Map<string, number[]>;
  triangles: Array<[number, number, number]>;
}

export function getOrBuildBodySpatialGrid(bodyGeo: THREE.BufferGeometry): BodySpatialGrid | null {
  const existing = (bodyGeo.userData as Record<string, unknown>)?.__zeta_body_spatial_grid__;
  if (existing) {
    return existing as BodySpatialGrid;
  }
  const pos = bodyGeo.attributes.position;
  if (!pos || pos.count < 3) return null;
  const idx = bodyGeo.index;
  const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
  if (triCount === 0) return null;

  const cellSize = 0.055;
  const cells = new Map<string, number[]>();
  const triangles: Array<[number, number, number]> = new Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3;
    const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    triangles[t] = [i0, i1, i2];

    const x0 = pos.getX(i0); const y0 = pos.getY(i0); const z0 = pos.getZ(i0);
    const x1 = pos.getX(i1); const y1 = pos.getY(i1); const z1 = pos.getZ(i1);
    const x2 = pos.getX(i2); const y2 = pos.getY(i2); const z2 = pos.getZ(i2);

    const minX = Math.floor(Math.min(x0, x1, x2) / cellSize);
    const maxX = Math.floor(Math.max(x0, x1, x2) / cellSize);
    const minY = Math.floor(Math.min(y0, y1, y2) / cellSize);
    const maxY = Math.floor(Math.max(y0, y1, y2) / cellSize);
    const minZ = Math.floor(Math.min(z0, z1, z2) / cellSize);
    const maxZ = Math.floor(Math.max(z0, z1, z2) / cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cz = minZ; cz <= maxZ; cz++) {
          const k = `${cx}_${cy}_${cz}`;
          let list = cells.get(k);
          if (!list) {
            list = [];
            cells.set(k, list);
          }
          list.push(t);
        }
      }
    }
  }

  const grid: BodySpatialGrid = { cellSize, cells, triangles };
  if (!bodyGeo.userData) bodyGeo.userData = {};
  bodyGeo.userData.__zeta_body_spatial_grid__ = grid;
  return grid;
}

export interface SkinWeightTransferOptions {
  isOuterwear?: boolean;
  baseClearance?: number;
  minClearance?: number;
  maxClearance?: number;
}

export function transferSkinWeightsFromBody(
  garmentGeometry: THREE.BufferGeometry,
  bodyMesh: THREE.SkinnedMesh,
  options?: SkinWeightTransferOptions
): THREE.BufferGeometry {
  const bodyGeo = bodyMesh.geometry;
  const bodyPos = bodyGeo.attributes.position;
  const bodyNorm = bodyGeo.attributes.normal;
  const bodySkinIdx = bodyGeo.attributes.skinIndex;
  const bodySkinW = bodyGeo.attributes.skinWeight;

  if (!bodyPos || !bodySkinIdx || !bodySkinW || !bodyMesh.skeleton) {
    return garmentGeometry;
  }

  const grid = getOrBuildBodySpatialGrid(bodyGeo);
  if (!grid) return garmentGeometry;

  const gPos = garmentGeometry.attributes.position;
  if (!gPos) return garmentGeometry;
  const vCount = gPos.count;

  if (!garmentGeometry.attributes.normal || garmentGeometry.attributes.normal.count !== vCount) {
    garmentGeometry.computeVertexNormals();
  }
  const gNorm = garmentGeometry.attributes.normal;

  if (!garmentGeometry.attributes.skinIndex || garmentGeometry.attributes.skinIndex.count !== vCount) {
    garmentGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(vCount * 4), 4));
  }
  if (!garmentGeometry.attributes.skinWeight || garmentGeometry.attributes.skinWeight.count !== vCount) {
    garmentGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(vCount * 4), 4));
  }
  const gSkinIdx = garmentGeometry.attributes.skinIndex;
  const gSkinW = garmentGeometry.attributes.skinWeight;

  const isOuterwear = options?.isOuterwear ?? false;
  const baseClearance = isOuterwear ? (options?.maxClearance ?? 0.020) : (options?.baseClearance ?? 0.014);
  const minClearance = options?.minClearance ?? 0.008;

  // Pre-classify bones for edge / boundary taper (neck, hands, feet) and region-specific clearance
  const bones = bodyMesh.skeleton.bones;
  const isBoundaryBone = new Uint8Array(bones.length);
  const isPelvisBone = new Uint8Array(bones.length);
  const isElbowBone = new Uint8Array(bones.length);
  let lShoulderIdx = -1;
  let rShoulderIdx = -1;
  let upperChestIdx = -1;
  let chestIdx = -1;
  let lUpArmIdx = -1;
  let rUpArmIdx = -1;

  for (let b = 0; b < bones.length; b++) {
    const n = (bones[b]?.name || '').toLowerCase();
    if (/neck|head/i.test(n)) isBoundaryBone[b] = 1;
    else if (/hand|wrist|finger|thumb/i.test(n)) isBoundaryBone[b] = 2;
    else if (/foot|toe|ankle/i.test(n)) isBoundaryBone[b] = 3;

    if (/hips|pelvis|butt|glute/i.test(n)) isPelvisBone[b] = 1;
    if (/lowerarm|forearm|elbow/i.test(n)) isElbowBone[b] = 1;

    if (/leftshoulder|shoulder.*l\b/i.test(n)) lShoulderIdx = b;
    else if (/rightshoulder|shoulder.*r\b/i.test(n)) rShoulderIdx = b;
    else if (/upperchest/i.test(n)) upperChestIdx = b;
    else if (/chest/i.test(n)) chestIdx = b;
    else if (/leftupperarm|upperarm.*l\b/i.test(n)) lUpArmIdx = b;
    else if (/rightupperarm|upperarm.*r\b/i.test(n)) rUpArmIdx = b;
  }

  const cellSize = grid.cellSize;
  const cells = grid.cells;
  const triangles = grid.triangles;
  const testedTris = new Set<number>();
  const accumWeights = new Map<number, number>();

  for (let i = 0; i < vCount; i++) {
    const qx = gPos.getX(i);
    const qy = gPos.getY(i);
    const qz = gPos.getZ(i);
    _wtQuery.set(qx, qy, qz);

    const cx = Math.floor(qx / cellSize);
    const cy = Math.floor(qy / cellSize);
    const cz = Math.floor(qz / cellSize);

    let bestDistSq = Infinity;
    let bestTri = -1;
    let bestClosestX = qx;
    let bestClosestY = qy;
    let bestClosestZ = qz;
    let bestBaryX = 1;
    let bestBaryY = 0;
    let bestBaryZ = 0;

    // Search query cell and expanding neighbor radius
    for (let r = 1; r <= 3 && bestTri === -1; r++) {
      testedTris.clear();
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            const list = cells.get(`${cx + dx}_${cy + dy}_${cz + dz}`);
            if (!list) continue;
            for (let k = 0; k < list.length; k++) {
              const tIdx = list[k];
              if (testedTris.has(tIdx)) continue;
              testedTris.add(tIdx);

              const tri = triangles[tIdx];
              _wtA.fromBufferAttribute(bodyPos, tri[0]);
              _wtB.fromBufferAttribute(bodyPos, tri[1]);
              _wtC.fromBufferAttribute(bodyPos, tri[2]);

              const dSq = closestPointOnTriangleBarycentric(_wtQuery, _wtA, _wtB, _wtC, _wtClosest, _wtBary);
              if (dSq < bestDistSq) {
                bestDistSq = dSq;
                bestTri = tIdx;
                bestClosestX = _wtClosest.x;
                bestClosestY = _wtClosest.y;
                bestClosestZ = _wtClosest.z;
                bestBaryX = _wtBary.x;
                bestBaryY = _wtBary.y;
                bestBaryZ = _wtBary.z;
              }
            }
          }
        }
      }
    }

    // Fallback if geometry vertex is outside grid neighborhood
    if (bestTri === -1 && triangles.length > 0) {
      const step = Math.max(1, Math.floor(triangles.length / 80));
      for (let t = 0; t < triangles.length; t += step) {
        const tri = triangles[t];
        _wtA.fromBufferAttribute(bodyPos, tri[0]);
        _wtB.fromBufferAttribute(bodyPos, tri[1]);
        _wtC.fromBufferAttribute(bodyPos, tri[2]);
        const dSq = closestPointOnTriangleBarycentric(_wtQuery, _wtA, _wtB, _wtC, _wtClosest, _wtBary);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestTri = t;
          bestClosestX = _wtClosest.x;
          bestClosestY = _wtClosest.y;
          bestClosestZ = _wtClosest.z;
          bestBaryX = _wtBary.x;
          bestBaryY = _wtBary.y;
          bestBaryZ = _wtBary.z;
        }
      }
    }

    if (bestTri !== -1) {
      const tri = triangles[bestTri];
      const u = bestBaryX;
      const v = bestBaryY;
      const w = bestBaryZ;

      // Barycentrically interpolate normal
      if (bodyNorm) {
        _wtNA.fromBufferAttribute(bodyNorm, tri[0]);
        _wtNB.fromBufferAttribute(bodyNorm, tri[1]);
        _wtNC.fromBufferAttribute(bodyNorm, tri[2]);
        _wtNorm.set(
          _wtNA.x * u + _wtNB.x * v + _wtNC.x * w,
          _wtNA.y * u + _wtNB.y * v + _wtNC.y * w,
          _wtNA.z * u + _wtNB.z * v + _wtNC.z * w
        );
        if (_wtNorm.lengthSq() > 1e-6) {
          _wtNorm.normalize();
        } else {
          _wtNorm.set(0, 1, 0);
        }
      } else {
        _wtNorm.set(0, 1, 0);
      }

      // Barycentrically interpolate exact skinIndex and skinWeight
      accumWeights.clear();
      const vertIdxs = [tri[0], tri[1], tri[2]];
      const barys = [u, v, w];

      for (let vi = 0; vi < 3; vi++) {
        const bWeight = barys[vi];
        if (bWeight <= 1e-5) continue;
        const vIdx = vertIdxs[vi];
        for (let c = 0; c < 4; c++) {
          const sw = bodySkinW.getComponent(vIdx, c);
          if (sw > 1e-4) {
            const si = Math.round(bodySkinIdx.getComponent(vIdx, c));
            accumWeights.set(si, (accumWeights.get(si) || 0) + sw * bWeight);
          }
        }
      }

      // Sort and take top 4 weights
      const sorted = Array.from(accumWeights.entries()).sort((a, b) => b[1] - a[1]);
      let totalW = 0;
      const topCount = Math.min(4, sorted.length);
      for (let k = 0; k < topCount; k++) totalW += sorted[k][1];
      const normW = totalW > 1e-5 ? 1 / totalW : 1;

      const idx0 = sorted[0] ? sorted[0][0] : 0;
      const w0 = sorted[0] ? sorted[0][1] * normW : 1;
      const idx1 = sorted[1] ? sorted[1][0] : 0;
      const w1 = sorted[1] ? sorted[1][1] * normW : 0;
      const idx2 = sorted[2] ? sorted[2][0] : 0;
      const w2 = sorted[2] ? sorted[2][1] * normW : 0;
      const idx3 = sorted[3] ? sorted[3][0] : 0;
      const w3 = sorted[3] ? sorted[3][1] * normW : 0;

      // Clearance curve: smooth taper from +0.014m / +0.020m down to +0.008m at neck/cuffs/ankles
      let boundaryScore = 0;
      let pelvisScore = 0;
      let elbowScore = 0;
      let chestW = 0;
      let lArmW = 0;
      let rArmW = 0;

      for (let k = 0; k < topCount; k++) {
        const bIdx = sorted[k][0];
        const bWeight = sorted[k][1] * normW;
        if (isBoundaryBone[bIdx]) boundaryScore += bWeight;
        if (isPelvisBone[bIdx]) pelvisScore += bWeight;
        if (isElbowBone[bIdx]) elbowScore += bWeight;

        if (bIdx === upperChestIdx || bIdx === chestIdx) chestW += bWeight;
        if (bIdx === lUpArmIdx) lArmW += bWeight;
        if (bIdx === rUpArmIdx) rArmW += bWeight;
      }

      // Deltoid transition smoothing (upperChest <-> shoulder <-> upperArm)
      // When both torso chest and upper arm exert strong pull, ensure shoulder bone participates smoothly
      if (lShoulderIdx >= 0 && chestW > 0.15 && lArmW > 0.15 && !accumWeights.has(lShoulderIdx)) {
        const share = Math.min(chestW, lArmW) * 0.35;
        accumWeights.set(lShoulderIdx, share);
        accumWeights.set(upperChestIdx >= 0 ? upperChestIdx : chestIdx, Math.max(0, chestW - share * 0.5));
        accumWeights.set(lUpArmIdx, Math.max(0, lArmW - share * 0.5));
      } else if (rShoulderIdx >= 0 && chestW > 0.15 && rArmW > 0.15 && !accumWeights.has(rShoulderIdx)) {
        const share = Math.min(chestW, rArmW) * 0.35;
        accumWeights.set(rShoulderIdx, share);
        accumWeights.set(upperChestIdx >= 0 ? upperChestIdx : chestIdx, Math.max(0, chestW - share * 0.5));
        accumWeights.set(rUpArmIdx, Math.max(0, rArmW - share * 0.5));
      }

      const edgeFactor = THREE.MathUtils.clamp(boundaryScore, 0, 1);
      let clearance = THREE.MathUtils.lerp(baseClearance, minClearance, edgeFactor);

      // Pelvis / glute outward clearance boost (+0.005m -> ~0.019m total clearance)
      if (pelvisScore > 0.20) {
        clearance += 0.005 * pelvisScore;
      }

      // Inner elbow joint clearance boost (+0.004m) to eliminate inner elbow pinch during bent arm poses
      if (elbowScore > 0.25) {
        clearance += 0.004 * elbowScore;
      }

      // Displace outward along interpolated body normal
      const dispX = bestClosestX + _wtNorm.x * clearance;
      const dispY = bestClosestY + _wtNorm.y * clearance;
      const dispZ = bestClosestZ + _wtNorm.z * clearance;

      gPos.setXYZ(i, dispX, dispY, dispZ);
      gNorm.setXYZ(i, _wtNorm.x, _wtNorm.y, _wtNorm.z);
      gSkinIdx.setXYZW(i, idx0, idx1, idx2, idx3);
      gSkinW.setXYZW(i, w0, w1, w2, w3);
    }
  }

  // Recompute vertex normals after displacement so all displaced contours shade silky smooth (zero faceting)
  garmentGeometry.computeVertexNormals();

  gPos.needsUpdate = true;
  gNorm.needsUpdate = true;
  gSkinIdx.needsUpdate = true;
  gSkinW.needsUpdate = true;

  return garmentGeometry;
}

export function findPrimaryBodyMesh(avatarRoot: THREE.Object3D): THREE.SkinnedMesh | null {
  let primarySkin: THREE.SkinnedMesh | null = null;
  let primaryFallback: THREE.SkinnedMesh | null = null;
  let maxSkinVerts = 0;
  let maxFallbackVerts = 0;

  avatarRoot.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh && !obj.userData?.[GARMENT_TAG]) {
      const geo = obj.geometry;
      if (geo.attributes.position && geo.attributes.skinIndex && geo.attributes.skinWeight && obj.skeleton) {
        const name = (obj.name || '').toLowerCase();
        const mats = (Array.isArray(obj.material) ? obj.material : [obj.material])
          .map((m) => (m?.name || '').toLowerCase())
          .join(' ');
        const count = geo.attributes.position.count;
        const isSkin = /skin|body/i.test(name) || /skin|body/i.test(mats);
        if (isSkin && count > maxSkinVerts) {
          primarySkin = obj;
          maxSkinVerts = count;
        } else if (count > maxFallbackVerts) {
          primaryFallback = obj;
          maxFallbackVerts = count;
        }
      }
    }
  });

  return primarySkin || primaryFallback;
}

export function createSkinnedGarmentFromBodyWeights(params: {
  geometry: THREE.BufferGeometry;
  bodyMesh: THREE.SkinnedMesh;
  material: THREE.Material;
  name: string;
  isOuterwear?: boolean;
  baseClearance?: number;
  renderOrder?: number;
}): THREE.SkinnedMesh {
  const { geometry, bodyMesh, material, name, isOuterwear, baseClearance, renderOrder = 2 } = params;
  transferSkinWeightsFromBody(geometry, bodyMesh, { isOuterwear, baseClearance });
  const skinned = new THREE.SkinnedMesh(geometry, material);
  skinned.name = name;
  skinned.userData[GARMENT_TAG] = true;
  skinned.frustumCulled = false;
  skinned.renderOrder = renderOrder;
  skinned.bind(bodyMesh.skeleton, bodyMesh.bindMatrix);
  bodyMesh.parent?.add(skinned);
  return skinned;
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
  /** Restrict cloning to smooth Body_SKIN topology only (never copying baggy open-front jackets!) */
  skinOnly?: boolean;
  outCoverage?: { isSolid: boolean; hasPelvisCoverage?: boolean };
}): number {
  const {
    vrm,
    avatarRoot,
    mat,
    zone,
    inflate,
    topNeckFrac = 0.86,
    uvScale = 1.65,
    skinOnly = false,
    outCoverage,
  } = params;

  const fwdSign = vrm.meta?.metaVersion === '0' ? -1 : 1;
  let totalClonedTris = 0;
  let pelvisTris = 0;
  let pelvisMaxYFrac = 0;
  const addedMeshes: THREE.SkinnedMesh[] = [];
  // Track actual bone-span & 360-degree angular coverage so partial VRoid cutout stubs
  // (like a 2cm bare wrist or Swiss-cheese ribcage hole!) NEVER pass as solid full coverage!
  let armMinFrac = 1;
  let armMaxFrac = 0;
  let collarMinFrac = 1;
  let collarMaxFrac = 0;
  let collarSectorMask = 0;
  let torsoUpperSectorMask = 0;
  let torsoWaistSectorMask = 0;
  let torsoMinFrac = 1;
  let torsoMaxFrac = 0;

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
    const yWaistTop = lm.hips.y + Math.max(0.088 * unitScale, (lm.chest.y - lm.hips.y) * 0.62);
    const yShortHem = yKnee + (yHipJoint - yKnee) * 0.46;
    const yNeckLimit = lm.chest.y + (lm.neck.y - lm.chest.y) * topNeckFrac;
    // On the posterior / nape side, ensure tops rise higher to meet the skull base so the upper back is completely covered
    const yNapeLimit = lm.chest.y + (lm.neck.y - lm.chest.y) * Math.max(0.96, topNeckFrac);
    // Extend torso bodice cleanly down into the hip/pelvis band so dresses & tops NEVER leave a bare waist gap!
    const yTorsoBottom = yHipJoint - 0.055 * unitScale;
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

      const isSkin = isBodySkinMaterial(matName);
      const isTops = TOPS_MAT_REGEX.test(matName);
      const isPureSkirt = PURE_SKIRT_ONLY_REGEX.test(matName);
      const isSkirtOrLoose = SKIRT_OR_LOOSE_BOTTOM_REGEX.test(matName);

      if (skinOnly) {
        if (!isSkin) continue;
      } else if (zone === 'gloves' || isSkinZone) {
        // Clone real sculpted arms/collarbone from Body_SKIN, Tops, OR Onepiece/Dress/Coat upper bodies
        // (essential for VRoid models wearing Onepiece/Dress whose bare skin under the dress was deleted!)
        if (isPureSkirt) continue;
        if (!isSkin && !isTops) continue;
      } else if (isLowerZone) {
        if (isSkirtOrLoose || (isTops && !isSkin)) continue;
      } else if (isTorsoZone) {
        if (isPureSkirt) continue;
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

        const maxArmRadSq = (0.095 * unitScale) ** 2;
        if (zone === 'pants' || zone === 'shorts') {
          const isLegOrPelvis =
            domR === REGION_PELVIS ||
            domR === REGION_TORSO ||
            domR === REGION_LEG_L_UP ||
            domR === REGION_LEG_L_LOW ||
            domR === REGION_LEG_R_UP ||
            domR === REGION_LEG_R_LOW;
          if (isLegOrPelvis && cy <= yWaistTop + 0.015 * unitScale) {
            const minY = zone === 'shorts' ? yShortHem - 0.015 * unitScale : yAnkle + 0.024 * unitScale;
            if (cy >= minY) {
              const d2 =
                domR === REGION_PELVIS || domR === REGION_TORSO
                  ? (cx - lm.hips.x) ** 2 + (cz - lm.hips.z) ** 2
                  : domR === REGION_LEG_L_UP
                  ? distSqToSegment(cx, cy, cz, lm.lUpLeg, lm.lLowLeg)
                  : domR === REGION_LEG_L_LOW
                  ? distSqToSegment(cx, cy, cz, lm.lLowLeg, lm.lFoot)
                  : domR === REGION_LEG_R_UP
                  ? distSqToSegment(cx, cy, cz, lm.rUpLeg, lm.rLowLeg)
                  : distSqToSegment(cx, cy, cz, lm.rLowLeg, lm.rFoot);
              const maxR = (domR === REGION_PELVIS || domR === REGION_TORSO ? 0.21 : 0.145) * unitScale;
              if (d2 <= maxR * maxR) {
                keep = true;
                if (domR === REGION_PELVIS || domR === REGION_TORSO) {
                  pelvisTris++;
                  const pf = (cy - yHipJoint) / Math.max(0.06, yWaistTop - yHipJoint);
                  if (pf > pelvisMaxYFrac) pelvisMaxYFrac = pf;
                }
              }
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
          if (domR === REGION_ARM_L_LOW && distSqToSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= maxArmRadSq) {
            const f = projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand);
            if (f >= 0.08 && f <= 0.98) {
              keep = true;
              if (f < armMinFrac) armMinFrac = f;
              if (f > armMaxFrac) armMaxFrac = f;
            }
          } else if (domR === REGION_ARM_R_LOW && distSqToSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= maxArmRadSq) {
            const f = projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand);
            if (f >= 0.08 && f <= 0.98) {
              keep = true;
              if (f < armMinFrac) armMinFrac = f;
              if (f > armMaxFrac) armMaxFrac = f;
            }
          }
        } else if (zone === 'skin_collarbone') {
          // Real sculpted human upper-chest, clavicle, and shoulder bridge cloned from Tops/Onepiece/Body!
          if (domR === REGION_TORSO && cy >= lm.chest.y - 0.02 * unitScale && cy <= lm.neck.y + 0.025 * unitScale) {
            const rad = Math.hypot(cx - lm.hips.x, cz - lm.hips.z);
            if (rad <= 0.23 * unitScale) {
              keep = true;
              const cf = (cy - lm.chest.y) / Math.max(0.05, lm.neck.y - lm.chest.y);
              if (cf < collarMinFrac) collarMinFrac = cf;
              if (cf > collarMaxFrac) collarMaxFrac = cf;
              const sec = Math.floor(((Math.atan2(cx - lm.hips.x, cz - lm.hips.z) + Math.PI) / (Math.PI * 2)) * 8) & 7;
              collarSectorMask |= 1 << sec;
            }
          }
        } else if (zone === 'skin_arms_full') {
          if (domR === REGION_ARM_L_UP && distSqToSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm) <= maxArmRadSq) {
            keep = true;
            const f = projectFracAlongSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm) * 0.5;
            if (f < armMinFrac) armMinFrac = f;
            if (f > armMaxFrac) armMaxFrac = f;
          } else if (domR === REGION_ARM_R_UP && distSqToSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm) <= maxArmRadSq) {
            keep = true;
            const f = projectFracAlongSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm) * 0.5;
            if (f < armMinFrac) armMinFrac = f;
            if (f > armMaxFrac) armMaxFrac = f;
          } else if (domR === REGION_ARM_L_LOW && distSqToSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= maxArmRadSq) {
            const lf = projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand);
            if (lf <= 0.98) {
              keep = true;
              const f = 0.5 + lf * 0.5;
              if (f < armMinFrac) armMinFrac = f;
              if (f > armMaxFrac) armMaxFrac = f;
            }
          } else if (domR === REGION_ARM_R_LOW && distSqToSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= maxArmRadSq) {
            const lf = projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand);
            if (lf <= 0.98) {
              keep = true;
              const f = 0.5 + lf * 0.5;
              if (f < armMinFrac) armMinFrac = f;
              if (f > armMaxFrac) armMaxFrac = f;
            }
          }
        } else if (zone === 'skin_arms_upper') {
          if (domR === REGION_ARM_L_UP && distSqToSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm) <= maxArmRadSq) {
            keep = true;
            const f = projectFracAlongSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm);
            if (f < armMinFrac) armMinFrac = f;
            if (f > armMaxFrac) armMaxFrac = f;
          } else if (domR === REGION_ARM_R_UP && distSqToSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm) <= maxArmRadSq) {
            keep = true;
            const f = projectFracAlongSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm);
            if (f < armMinFrac) armMinFrac = f;
            if (f > armMaxFrac) armMaxFrac = f;
          } else if (
            (domR === REGION_ARM_L_LOW &&
              distSqToSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= maxArmRadSq &&
              projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= 0.22) ||
            (domR === REGION_ARM_R_LOW &&
              distSqToSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= maxArmRadSq &&
              projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= 0.22)
          ) {
            keep = true;
          }
        } else if (zone === 'skin_arms_below_short') {
          if (domR === REGION_ARM_L_UP && distSqToSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm) <= maxArmRadSq) {
            const uf = projectFracAlongSegment(cx, cy, cz, lm.lUpArm, lm.lLowArm);
            if (uf >= 0.30) {
              keep = true;
              const f = (uf - 0.30) * 0.4;
              if (f < armMinFrac) armMinFrac = f;
              if (f > armMaxFrac) armMaxFrac = f;
            }
          } else if (domR === REGION_ARM_R_UP && distSqToSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm) <= maxArmRadSq) {
            const uf = projectFracAlongSegment(cx, cy, cz, lm.rUpArm, lm.rLowArm);
            if (uf >= 0.30) {
              keep = true;
              const f = (uf - 0.30) * 0.4;
              if (f < armMinFrac) armMinFrac = f;
              if (f > armMaxFrac) armMaxFrac = f;
            }
          } else if (domR === REGION_ARM_L_LOW && distSqToSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= maxArmRadSq) {
            const lf = projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand);
            if (lf <= 0.98) {
              keep = true;
              const f = 0.28 + lf * 0.72;
              if (f < armMinFrac) armMinFrac = f;
              if (f > armMaxFrac) armMaxFrac = f;
            }
          } else if (domR === REGION_ARM_R_LOW && distSqToSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= maxArmRadSq) {
            const lf = projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand);
            if (lf <= 0.98) {
              keep = true;
              const f = 0.28 + lf * 0.72;
              if (f < armMinFrac) armMinFrac = f;
              if (f > armMaxFrac) armMaxFrac = f;
            }
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
          // Smooth angular / depth collar-to-nape interpolation (eliminates height spikes on collar sides)
          const napeFactor = THREE.MathUtils.clamp(
            (lm.chest.z * fwdSign - cz * fwdSign) / Math.max(0.04, 0.08 * unitScale) + 0.5,
            0,
            1
          );
          const effectiveNeckY = THREE.MathUtils.lerp(yNeckLimit, yNapeLimit, napeFactor);
          if (
            (domR === REGION_TORSO || domR === REGION_PELVIS || domR === REGION_NECK) &&
            cy >= yTorsoBottom - 0.014 * unitScale &&
            cy <= effectiveNeckY + 0.014 * unitScale
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
              if (projectFracAlongSegment(cx, cy, cz, lm.lLowArm, lm.lHand) <= 0.98) keep = true;
            } else if (domR === REGION_ARM_R_LOW) {
              if (projectFracAlongSegment(cx, cy, cz, lm.rLowArm, lm.rHand) <= 0.98) keep = true;
            }
          }
        }

        if (keep) {
          keptIndices.push(i0, i1, i2);
          if (isTorsoZone && (domR === REGION_TORSO || domR === REGION_PELVIS)) {
            const tf = (cy - yTorsoBottom) / Math.max(0.10, yNeckLimit - yTorsoBottom);
            if (tf < torsoMinFrac) torsoMinFrac = tf;
            if (tf > torsoMaxFrac) torsoMaxFrac = tf;
            const sec = Math.floor(((Math.atan2(cx - lm.hips.x, cz - lm.hips.z) + Math.PI) / (Math.PI * 2)) * 8) & 7;
            if (tf >= 0.45) torsoUpperSectorMask |= 1 << sec;
            else torsoWaistSectorMask |= 1 << sec;
          }
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

    // Resolve skeleton joint indices for smooth linear-falloff knee & elbow weighting
    const boneIdxOf = (name: VRMHumanBoneName): number => {
      const node = vrm.humanoid?.getRawBoneNode(name);
      return node ? src.skeleton.bones.indexOf(node as THREE.Bone) : -1;
    };
    const idxLUpLeg = boneIdxOf('leftUpperLeg');
    const idxLLowLeg = boneIdxOf('leftLowerLeg');
    const idxRUpLeg = boneIdxOf('rightUpperLeg');
    const idxRLowLeg = boneIdxOf('rightLowerLeg');
    const idxLUpArm = boneIdxOf('leftUpperArm');
    const idxLLowArm = boneIdxOf('leftLowerArm');
    const idxRUpArm = boneIdxOf('rightUpperArm');
    const idxRLowArm = boneIdxOf('rightLowerArm');
    const kneeBandHalf = 0.032 * unitScale;
    const elbowBandHalf = 0.026 * unitScale;

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
        if (
          domR === REGION_TORSO ||
          domR === REGION_PELVIS ||
          domR === REGION_NECK ||
          domR === REGION_LEG_L_UP ||
          domR === REGION_LEG_R_UP ||
          domR === REGION_IGNORE
        ) {
          // Clamp ALL torso, pelvis, hip-border leg, and nape-border neck vertices onto straight tailored hems!
          // Smooth angular neckline interpolation eliminates step spikes across collar sides & nape
          const napeFactor = THREE.MathUtils.clamp(
            (lm.chest.z * fwdSign - vz * fwdSign) / Math.max(0.04, 0.08 * unitScale) + 0.5,
            0,
            1
          );
          const effectiveNeckY = THREE.MathUtils.lerp(yNeckLimit, yNapeLimit, napeFactor);
          vy = THREE.MathUtils.clamp(vy, yTorsoBottom, effectiveNeckY);
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

      // Extrude smoothly along welded anatomical vertex normal so skin NEVER pokes mottled patches through!
      // Add smooth outward clearance over chest/bust/shoulder bend zone (+3.2mm), waist/hips overlap (+3.8mm),
      // and pelvic/glute region (+5.0mm) so seated postures, forward lean & arm reaches never clip glutes or skin!
      const isPelvicGlute =
        domR === REGION_PELVIS ||
        (domR === REGION_TORSO && vy < yWaistTop + 0.02 * unitScale) ||
        ((domR === REGION_LEG_L_UP || domR === REGION_LEG_R_UP) && vy > yHipJoint - 0.04 * unitScale);
      const hipGluteEase = isPelvicGlute ? 0.0050 * unitScale : 0;
      const waistEase =
        isTorsoZone && vy < yWaistTop + 0.035 * unitScale ? 0.0038 * unitScale : 0;
      const chestBendEase =
        isTorsoZone && vy >= lm.chest.y - 0.035 * unitScale ? 0.0032 * unitScale : 0;
      const vertInflate = scaledInflate + Math.max(waistEase, chestBendEase) + hipGluteEase;
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

      // Linear-falloff joint weight blending across knee & elbow interfaces:
      // W_lower = clamp((y_joint - y + h/2) / h, 0, 1), W_upper = 1 - W_lower
      const applyJointBlend = (upperIdx: number, lowerIdx: number, wLowerTarget: number) => {
        if (upperIdx < 0 || lowerIdx < 0) return;
        const wLower = THREE.MathUtils.clamp(wLowerTarget, 0, 1);
        const wUpper = 1 - wLower;
        // Blend smoothly (55% original anatomical weights + 45% linear joint falloff) to eliminate hard seams
        const origUpper =
          (newSkinIdx[ni * 4] === upperIdx ? newSkinW[ni * 4] : 0) +
          (newSkinIdx[ni * 4 + 1] === upperIdx ? newSkinW[ni * 4 + 1] : 0) +
          (newSkinIdx[ni * 4 + 2] === upperIdx ? newSkinW[ni * 4 + 2] : 0) +
          (newSkinIdx[ni * 4 + 3] === upperIdx ? newSkinW[ni * 4 + 3] : 0);
        const origLower =
          (newSkinIdx[ni * 4] === lowerIdx ? newSkinW[ni * 4] : 0) +
          (newSkinIdx[ni * 4 + 1] === lowerIdx ? newSkinW[ni * 4 + 1] : 0) +
          (newSkinIdx[ni * 4 + 2] === lowerIdx ? newSkinW[ni * 4 + 2] : 0) +
          (newSkinIdx[ni * 4 + 3] === lowerIdx ? newSkinW[ni * 4 + 3] : 0);
        if (origUpper + origLower > 0.75) {
          const sumOrig = origUpper + origLower;
          const blendedUpper = THREE.MathUtils.lerp(origUpper / sumOrig, wUpper, 0.45);
          const blendedLower = THREE.MathUtils.lerp(origLower / sumOrig, wLower, 0.45);
          const normSum = Math.max(1e-5, blendedUpper + blendedLower);
          newSkinIdx[ni * 4] = upperIdx;
          newSkinW[ni * 4] = blendedUpper / normSum;
          newSkinIdx[ni * 4 + 1] = lowerIdx;
          newSkinW[ni * 4 + 1] = blendedLower / normSum;
          newSkinIdx[ni * 4 + 2] = 0;
          newSkinW[ni * 4 + 2] = 0;
          newSkinIdx[ni * 4 + 3] = 0;
          newSkinW[ni * 4 + 3] = 0;
        }
      };

      if ((domR === REGION_LEG_L_UP || domR === REGION_LEG_L_LOW) && Math.abs(vy - lm.lLowLeg.y) <= kneeBandHalf) {
        const wLower = THREE.MathUtils.clamp((lm.lLowLeg.y + kneeBandHalf - vy) / (kneeBandHalf * 2), 0, 1);
        applyJointBlend(idxLUpLeg, idxLLowLeg, wLower);
      } else if ((domR === REGION_LEG_R_UP || domR === REGION_LEG_R_LOW) && Math.abs(vy - lm.rLowLeg.y) <= kneeBandHalf) {
        const wLower = THREE.MathUtils.clamp((lm.rLowLeg.y + kneeBandHalf - vy) / (kneeBandHalf * 2), 0, 1);
        applyJointBlend(idxRUpLeg, idxRLowLeg, wLower);
      } else if (domR === REGION_ARM_L_UP || domR === REGION_ARM_L_LOW) {
        const dElbow = Math.hypot(vx - lm.lLowArm.x, vy - lm.lLowArm.y, vz - lm.lLowArm.z);
        if (dElbow <= elbowBandHalf * 1.4) {
          const fUp = projectFracAlongSegment(vx, vy, vz, lm.lUpArm, lm.lLowArm);
          const fLow = projectFracAlongSegment(vx, vy, vz, lm.lLowArm, lm.lHand);
          const distSigned = fLow > 0 ? fLow * lm.lLowArm.distanceTo(lm.lHand) : (fUp - 1) * lm.lUpArm.distanceTo(lm.lLowArm);
          const wLower = THREE.MathUtils.clamp((distSigned + elbowBandHalf) / (elbowBandHalf * 2), 0, 1);
          applyJointBlend(idxLUpArm, idxLLowArm, wLower);
        }
      } else if (domR === REGION_ARM_R_UP || domR === REGION_ARM_R_LOW) {
        const dElbow = Math.hypot(vx - lm.rLowArm.x, vy - lm.rLowArm.y, vz - lm.rLowArm.z);
        if (dElbow <= elbowBandHalf * 1.4) {
          const fUp = projectFracAlongSegment(vx, vy, vz, lm.rUpArm, lm.rLowArm);
          const fLow = projectFracAlongSegment(vx, vy, vz, lm.rLowArm, lm.rHand);
          const distSigned = fLow > 0 ? fLow * lm.rLowArm.distanceTo(lm.rHand) : (fUp - 1) * lm.rUpArm.distanceTo(lm.rLowArm);
          const wLower = THREE.MathUtils.clamp((distSigned + elbowBandHalf) / (elbowBandHalf * 2), 0, 1);
          applyJointBlend(idxRUpArm, idxRLowArm, wLower);
        }
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
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
    }

    const skinned = new THREE.SkinnedMesh(subGeo, mat);
    skinned.name = `GarmentSkinned_${zone}`;
    skinned.userData[GARMENT_TAG] = true;
    skinned.frustumCulled = false;
    skinned.renderOrder = isSkinZone ? 1 : isTorsoZone ? 3 : 2;
    skinned.bind(src.skeleton, src.bindMatrix);
    src.parent.add(skinned);
    addedMeshes.push(skinned);

    totalClonedTris += keptIndices.length / 3;
  }

  const popCount8 = (mask: number) => {
    let n = 0;
    for (let b = 0; b < 8; b++) if (mask & (1 << b)) n++;
    return n;
  };
  const discardAddedStubs = () => {
    for (const m of addedMeshes) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    return 0;
  };

  // Validate real bone-length & 360-degree coverage so incomplete VRoid cutout stubs
  // NEVER block the clean solid sculpted fallbacks!
  if (zone === 'gloves') {
    if (armMaxFrac - armMinFrac < 0.50 || armMinFrac > 0.36 || armMaxFrac < 0.72) {
      return discardAddedStubs();
    }
  } else if (zone === 'skin_arms_full' || zone === 'skin_arms_upper' || zone === 'skin_arms_below_short') {
    if (armMaxFrac - armMinFrac < 0.52 || armMinFrac > 0.32 || armMaxFrac < 0.68) {
      return discardAddedStubs();
    }
  } else if (zone === 'skin_collarbone') {
    if (collarMaxFrac - collarMinFrac < 0.44 || popCount8(collarSectorMask) < 6) {
      return discardAddedStubs();
    }
  }

  if (outCoverage) {
    const upperSectors = popCount8(torsoUpperSectorMask);
    const waistSectors = popCount8(torsoWaistSectorMask);
    const vertSpan = torsoMaxFrac - torsoMinFrac;
    outCoverage.isSolid =
      totalClonedTris >= 80 &&
      upperSectors >= 7 &&
      waistSectors >= 7 &&
      vertSpan >= 0.66 &&
      torsoMinFrac <= 0.28 &&
      torsoMaxFrac >= 0.80;
    outCoverage.hasPelvisCoverage = pelvisTris >= 70 && pelvisMaxYFrac >= 0.72;
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

  // 4. Watertight Torso & Midriff Bridge (prevents severed waist on culled-skin models)
  const culling = inspectVrmBodySkinCulling(vrm, avatarRoot);
  if (culling.hasCulledTorso && metrics.chest) {
    const torsoBridge = attachGroup(metrics.chest, 'GarmentSkinTorsoBridge');
    if (torsoBridge) {
      const yBot = -(metrics.yChestFromSpine + metrics.ySpineFromHips * 0.92);
      const rChest = metrics.chestHalfW * 0.98;
      const rWaist = metrics.spineHalfW * 0.95;
      const rHips = metrics.hipsHalfW * 0.98;
      const torsoGeo = createContouredTorsoLathe({
        profile: [
          [rHips, yBot],
          [rWaist, -metrics.yChestFromSpine * 0.55],
          [rChest, 0.0],
          [metrics.upperChestHalfW * 0.96, metrics.yNeckFromChest * 0.85],
        ],
        scaleX: 1.0,
        scaleZ: THREE.MathUtils.clamp((metrics.chestHalfD / Math.max(0.06, rChest)) * 0.85, 0.70, 0.88),
        bustCenterY: 0,
        bustBoost: 0.004,
        fwdSign,
        segments: 24,
      });
      torsoBridge.add(new THREE.Mesh(torsoGeo, skinMat));
    }
  }

  // 5. Watertight Pelvis & Upper Hip Bridge
  if (culling.hasCulledThighs && metrics.hips) {
    const pelvisBridge = attachGroup(metrics.hips, 'GarmentSkinPelvisBridge');
    if (pelvisBridge) {
      const rHips = metrics.hipsHalfW * 0.98;
      const rWaist = metrics.spineHalfW * 0.95;
      const waistTopY = Math.max(0.065, metrics.ySpineFromHips * 0.88);
      const pelvisGeo = createContouredTorsoLathe({
        profile: [
          [rHips * 0.86, -0.045],
          [rHips * 0.96, -0.015],
          [THREE.MathUtils.lerp(rHips, rWaist, 0.5), waistTopY * 0.5],
          [rWaist, waistTopY],
        ],
        scaleX: 1.0,
        scaleZ: THREE.MathUtils.clamp((metrics.hipsHalfD / Math.max(0.06, rHips)) * 0.85, 0.70, 0.88),
        bustBoost: 0,
        frontBellyBoost: 0,
        fwdSign,
        segments: 24,
      });
      pelvisBridge.add(new THREE.Mesh(pelvisGeo, skinMat));
    }
  }
}

export const SHOWER_CENSOR_TAG = '__zeta_shower_censor__';
export const SHOWER_UNDERLAY_TAG = '__zeta_shower_underlay__';

export function clearShowerCensors(avatarRoot: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  avatarRoot.traverse((obj) => {
    if (obj.userData?.[SHOWER_CENSOR_TAG]) toRemove.push(obj);
  });
  for (const o of toRemove) {
    o.parent?.remove(o);
    if (o instanceof THREE.Mesh) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m?.dispose());
    }
  }
}

export function clearShowerSkinUnderlay(avatarRoot: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  avatarRoot.traverse((obj) => {
    if (obj.userData?.[SHOWER_UNDERLAY_TAG]) toRemove.push(obj);
  });
  for (const o of toRemove) {
    o.parent?.remove(o);
    if (o instanceof THREE.Mesh) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m?.dispose());
    }
  }
}

/**
 * Spawns a watertight, bone-tracked MToon skin-toned body underlay on models with culled skin
 * (VRoid models exported with "Delete Transparent Meshes") so bare shoulders, arms, back, and thighs
 * render with zero see-through holes when clothes are stripped in the shower.
 */
export function ensureWatertightBodySkinUnderlay(params: {
  vrm: VRM;
  avatarRoot: THREE.Object3D;
  skinHex?: string;
}): void {
  const { vrm, avatarRoot } = params;
  clearShowerSkinUnderlay(avatarRoot);

  const coverage = inspectVrmBodySkinCoverage(vrm, avatarRoot);
  const culling = inspectVrmBodySkinCulling(vrm, avatarRoot);
  const isCulled =
    culling.isPreCulled ||
    culling.hasCulledTorso ||
    culling.hasCulledArms ||
    culling.hasCulledThighs ||
    !coverage.hasUpperArmSkin;

  if (!isCulled) return;

  const skinHex = params.skinHex || sampleAvatarSkinColorHex(avatarRoot);
  const fwdSign = vrm.meta?.metaVersion === '0' ? -1 : 1;
  const metrics = measureTorsoMetrics(vrm, avatarRoot, fwdSign);

  const skinMat = makeAnimeSkinMaterial(skinHex);
  skinMat.polygonOffset = true;
  skinMat.polygonOffsetFactor = -1.5;
  skinMat.polygonOffsetUnits = -1.5;

  // 1. Torso & Upper Back Cloned SkinnedMesh
  buildBodyClonedSkinnedGarment({
    vrm,
    avatarRoot,
    mat: skinMat,
    zone: 'torso_sleeveless',
    inflate: -0.002,
  });

  // 2. Arms (Full shoulders, upper arms, elbows, forearms)
  buildBodyClonedSkinnedGarment({
    vrm,
    avatarRoot,
    mat: skinMat,
    zone: 'skin_arms_full',
    inflate: -0.002,
  });

  // 3. Collarbone bridge
  buildBodyClonedSkinnedGarment({
    vrm,
    avatarRoot,
    mat: skinMat,
    zone: 'skin_collarbone',
    inflate: -0.002,
  });

  // 4. Pelvis & upper thighs
  buildBodyClonedSkinnedGarment({
    vrm,
    avatarRoot,
    mat: skinMat,
    zone: 'shorts',
    inflate: -0.002,
  });

  // Bone-anchored underlay fallback for any bone with sparse source topology
  addExposedSkinUnderlay({
    vrm,
    avatarRoot,
    metrics,
    skinHex,
    armMode: 'full',
    collarboneBridge: true,
    upperThighs: true,
    fwdSign,
    coverage,
  });

  // Mark all created underlay meshes so they can be tracked and cleared
  avatarRoot.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.userData?.[GARMENT_TAG] && !obj.userData?.[SHOWER_CENSOR_TAG]) {
      obj.userData[SHOWER_UNDERLAY_TAG] = true;
      obj.frustumCulled = false;
    }
  });
}

/**
 * Dedicated SFW Bone-Tracked Private-Area Censorship:
 * Mounts dense, multi-layered anime soap-foam & steam cloud censor puffs directly onto the
 * character's `chest`/`upperChest` bone and `hips` bone.
 * Moves in 100% lockstep with her body during washing, turning, and breathing animations.
 * Provides 360-degree coverage across front, side, and 3/4 angles.
 */
export function syncShowerCensorsToVrm(params: {
  vrm: VRM | null;
  avatarRoot: THREE.Object3D;
  isShowering: boolean;
  accentHex?: string;
}): void {
  const { vrm, avatarRoot, isShowering, accentHex = '#f472b6' } = params;
  clearShowerCensors(avatarRoot);
  if (!isShowering || !vrm?.humanoid) return;

  const fwdSign = vrm.meta?.metaVersion === '0' ? -1 : 1;
  const metrics = measureTorsoMetrics(vrm, avatarRoot, fwdSign);

  const chestNode =
    vrm.humanoid.getRawBoneNode('upperChest') ||
    vrm.humanoid.getRawBoneNode('chest') ||
    vrm.humanoid.getNormalizedBoneNode('upperChest') ||
    vrm.humanoid.getNormalizedBoneNode('chest');
  const hipsNode =
    vrm.humanoid.getRawBoneNode('hips') ||
    vrm.humanoid.getNormalizedBoneNode('hips');

  if (!chestNode || !hipsNode) return;

  // 1. Soft creamy anime foam lather (hugged flush to anatomy with zero opaque bowling ball look)
  const coreFoamMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fce7f3',
    emissiveIntensity: 0.18,
    roughness: 0.92,
    metalness: 0.02,
    transparent: true,
    opacity: 0.88,
    depthWrite: true,
  });

  // 2. Soft translucent iridescent suds micro-bubble layer
  const bubbleMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    emissive: new THREE.Color(accentHex).multiplyScalar(0.24),
    emissiveIntensity: 0.28,
    roughness: 0.22,
    metalness: 0.18,
    transparent: true,
    opacity: 0.65,
    depthWrite: true,
  });

  const wChest = Math.max(0.11, metrics.chestHalfW * 1.18);
  const dChest = Math.max(0.08, metrics.chestHalfD * 1.15);
  const zChestFront = dChest * 0.40 * fwdSign;

  // --- 1. CHEST / UPPER CHEST BUST FOAM CLUSTER ---
  const chestGroup = new THREE.Group();
  chestGroup.name = 'Zeta_ShowerCensor_Chest';
  chestGroup.userData[SHOWER_CENSOR_TAG] = true;
  chestGroup.userData.__zeta_procedural_garment__ = true;
  chestGroup.frustumCulled = false;

  // Center bust lather pad (anatomically contoured, hugs the cleavage smoothly)
  const centerPuff = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), coreFoamMat);
  centerPuff.position.set(0, 0, zChestFront);
  centerPuff.scale.set(1.25, 0.94, 0.58);
  chestGroup.add(centerPuff);

  // Left & right bust lather puffs with lateral rib wrap
  for (const side of [-1, 1]) {
    const bustPuff = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 12), coreFoamMat);
    bustPuff.position.set(side * wChest * 0.38, 0, zChestFront * 0.94);
    bustPuff.scale.set(1.12, 0.92, 0.56);

    // Lateral wrap around the ribs/underarm so side profile is 100% covered!
    const sideWrap = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), coreFoamMat);
    sideWrap.position.set(side * wChest * 0.64, -0.012, zChestFront * 0.48);
    sideWrap.scale.set(0.96, 0.88, 0.52);

    // Sparkling suds bubbles
    const dab1 = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), bubbleMat);
    dab1.position.set(side * wChest * 0.34, 0.038, zChestFront * 1.02);

    const dab2 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), bubbleMat);
    dab2.position.set(side * wChest * 0.56, -0.030, zChestFront * 0.82);

    chestGroup.add(bustPuff, sideWrap, dab1, dab2);
  }

  // Upper collarbone suds rim & lower sternum suds rim
  const upperCollarPuff = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), coreFoamMat);
  upperCollarPuff.position.set(0, 0.042, zChestFront * 0.82);
  upperCollarPuff.scale.set(1.15, 0.82, 0.52);

  const lowerSternumPuff = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), coreFoamMat);
  lowerSternumPuff.position.set(0, -0.042, zChestFront * 0.82);
  lowerSternumPuff.scale.set(1.15, 0.82, 0.52);

  // Surface bubble clusters
  for (let i = 0; i < 5; i++) {
    const bub = new THREE.Mesh(new THREE.SphereGeometry(0.011 + (i % 3) * 0.004, 8, 8), bubbleMat);
    bub.position.set(-0.045 + i * 0.022, 0.008 + (i % 2) * 0.024, zChestFront * 1.05);
    chestGroup.add(bub);
  }

  chestGroup.add(upperCollarPuff, lowerSternumPuff);
  chestNode.add(chestGroup);

  // --- 2. HIPS / PELVIS & GLUTE FOAM CLUSTER ---
  const hipsGroup = new THREE.Group();
  hipsGroup.name = 'Zeta_ShowerCensor_Hips';
  hipsGroup.userData[SHOWER_CENSOR_TAG] = true;
  hipsGroup.userData.__zeta_procedural_garment__ = true;
  hipsGroup.frustumCulled = false;

  const wHips = Math.max(0.12, metrics.hipsHalfW * 1.18);
  const dHips = Math.max(0.10, metrics.hipsHalfD * 1.22);
  const zHipsFront = dHips * 0.40 * fwdSign;
  const zHipsBack = -dHips * 0.40 * fwdSign;

  // Front central pelvic lather pad
  const frontPelvis = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 12), coreFoamMat);
  frontPelvis.position.set(0, -0.010, zHipsFront);
  frontPelvis.scale.set(1.24, 0.96, 0.58);
  hipsGroup.add(frontPelvis);

  // Left & right groin, outer hip, and glute wraps
  for (const side of [-1, 1]) {
    const groinPuff = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), coreFoamMat);
    groinPuff.position.set(side * wHips * 0.42, -0.016, zHipsFront * 0.88);
    groinPuff.scale.set(1.12, 0.92, 0.56);

    const outerHipWrap = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), coreFoamMat);
    outerHipWrap.position.set(side * wHips * 0.68, -0.008, 0);
    outerHipWrap.scale.set(0.96, 0.92, 0.55);

    const glutePuff = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), coreFoamMat);
    glutePuff.position.set(side * wHips * 0.38, -0.015, zHipsBack * 0.92);
    glutePuff.scale.set(1.15, 0.95, 0.58);

    const hipDab1 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), bubbleMat);
    hipDab1.position.set(side * wHips * 0.42, 0.035, zHipsFront * 0.96);

    const hipDab2 = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), bubbleMat);
    hipDab2.position.set(side * wHips * 0.62, -0.038, zHipsFront * 0.65);

    hipsGroup.add(groinPuff, outerHipWrap, glutePuff, hipDab1, hipDab2);
  }

  // Under-pelvic perineal / thigh gap seal
  const bottomSealPuff = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), coreFoamMat);
  bottomSealPuff.position.set(0, -0.068, 0);
  bottomSealPuff.scale.set(1.0, 0.78, 1.15);

  // Waistband top foam ring
  const waistTopPuff = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), coreFoamMat);
  waistTopPuff.position.set(0, 0.045, zHipsFront * 0.75);
  waistTopPuff.scale.set(1.15, 0.82, 0.55);

  // Surface bubbles
  for (let i = 0; i < 6; i++) {
    const bub = new THREE.Mesh(new THREE.SphereGeometry(0.011 + (i % 3) * 0.004, 8, 8), bubbleMat);
    bub.position.set(-0.06 + i * 0.024, 0.008 + (i % 2) * 0.026, zHipsFront * 1.02);
    hipsGroup.add(bub);
  }

  hipsGroup.add(bottomSealPuff, waistTopPuff);
  hipsNode.add(hipsGroup);
}

function addLegPants(params: {
  vrm: VRM;
  avatarRoot: THREE.Object3D;
  metrics: TorsoMetrics;
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
    metrics,
    mat,
    cuffMat,
    endFracLower = 0.95,
    shortsOnly = false,
    looseFactor = 1.0,
    fwdSign,
  } = params;

  // Primary path: True body-fitted SkinnedMesh pants/leggings/shorts cloned directly from the VRM's real
  // sculpted hips, thighs, knees, and calves with generous +4.2mm..+6.0mm normal extrusion (+5.0mm glute boost)!
  const inflate = shortsOnly
    ? 0.0050
    : looseFactor <= 1.0
    ? 0.0042
    : THREE.MathUtils.clamp(0.0042 + (looseFactor - 1.0) * 0.008, 0.0042, 0.0060);
  const pantsCov = { isSolid: false, hasPelvisCoverage: false };
  const clonedTris = buildBodyClonedSkinnedGarment({
    vrm,
    avatarRoot,
    mat,
    zone: shortsOnly ? 'shorts' : 'pants',
    inflate,
    uvScale: 1.75,
    outCoverage: pantsCov,
  });
  if (clonedTris >= 80) {
    // Raise trouser/short waistband smoothly up over the hips bone top edge whenever a VRoid model
    // deleted pelvis/waist skin under its original underwear (prevents black underwear peek-out!)
    if (!pantsCov.hasPelvisCoverage && metrics.hips) {
      const hipsG = attachGroup(metrics.hips, 'GarmentPantsWaist');
      if (hipsG) {
        const clr = Math.min(0.0035, metrics.garmentClearance);
        const hipR = metrics.hipsHalfW + clr;
        const waistR = metrics.spineHalfW + clr * 0.90;
        const zRatio = THREE.MathUtils.clamp(
          (metrics.hipsHalfD + clr) / Math.max(0.06, hipR),
          0.72,
          0.88
        );
        const waistTopY = Math.max(0.065, metrics.ySpineFromHips * 0.92);
        const pelvisGeo = createContouredTorsoLathe({
          profile: [
            [hipR * 0.88, -0.040],
            [hipR * 0.98, -0.010],
            [THREE.MathUtils.lerp(hipR, waistR, 0.52), waistTopY * 0.5],
            [waistR, waistTopY],
          ],
          scaleX: 1.0,
          scaleZ: zRatio,
          bustBoost: 0,
          frontBellyBoost: 0,
          rearGluteY: -0.01,
          rearGluteBoost: 0.001,
          fwdSign,
          segments: 24,
        });
        hipsG.add(new THREE.Mesh(pelvisGeo, mat));
      }
    }
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
    const kneeRadius = 0.060 * looseFactor;
    if (upGroup && up) {
      // Bridge knee joint seamlessly: extend upper leg slightly past knee (`endFrac = 1.08`)
      const tube = createBoneSegmentTube({
        bone: up,
        childBone: low,
        fallbackDir: new THREE.Vector3(0, -1, 0),
        fallbackLen: 0.38,
        startFrac: -0.02,
        endFrac: shortsOnly ? 0.46 : 1.08,
        radiusStart: 0.080 * looseFactor,
        radiusEnd: shortsOnly ? 0.070 * looseFactor : kneeRadius,
        mat,
      });
      upGroup.add(tube);
    }

    if (!shortsOnly && low) {
      const lowGroup = attachGroup(low, `GarmentLegLow_${s.lower}`);
      if (lowGroup) {
        const kneeBridgeCap = new THREE.Mesh(
          new THREE.SphereGeometry(kneeRadius * 0.98, 14, 12),
          mat
        );
        lowGroup.add(kneeBridgeCap);

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

        // Bridge knee joint seamlessly: extend lower leg upward into knee (`startF = -0.06`) with matching radius!
        const startF = -0.06;
        const endF = endFracLower;
        const segLen = Math.max(0.05, totalLen * (endF - startF));
        const midDist = totalLen * ((startF + endF) * 0.5);

        const shinGeo = new THREE.CylinderGeometry(
          0.046 * looseFactor,
          kneeRadius,
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

    // Dynamically derive slim, bone-aligned sleeve radii from actual bone-to-bone arm lengths!
    const upLen =
      low && low.position.lengthSq() > 1e-4 ? THREE.MathUtils.clamp(low.position.length(), 0.14, 0.36) : 0.23;
    const lowLen =
      hand && hand.position.lengthSq() > 1e-4 ? THREE.MathUtils.clamp(hand.position.length(), 0.13, 0.34) : 0.21;
    const rShoulder = THREE.MathUtils.clamp(upLen * 0.165, 0.032, 0.045) * looseFactor;
    const rElbow = THREE.MathUtils.clamp(upLen * 0.132, 0.026, 0.036) * looseFactor;
    const rWrist = THREE.MathUtils.clamp(lowLen * 0.106, 0.021, 0.029) * looseFactor;

    if (mode !== 'gloves' && up) {
      const upG = attachGroup(up, `GarmentArmUp_${s.upper}`);
      if (upG) {
        // Bridge elbow seamlessly: extend upper sleeve slightly past elbow (`endFrac = 1.08`)
        const endFrac = mode === 'cap' ? 0.24 : mode === 'short' ? 0.48 : 1.08;
        const tube =
          mode === 'kimono'
            ? createBoneSegmentTube({
                bone: up,
                childBone: low,
                fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
                fallbackLen: upLen,
                startFrac: -0.05,
                endFrac,
                radiusStart: rShoulder * 1.08,
                radiusEnd: rElbow * 1.65,
                mat,
              })
            : createTaperedEllipticalForearmTube({
                bone: up,
                childBone: low,
                fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
                fallbackLen: upLen,
                startFrac: -0.05,
                endFrac,
                radiusStart: rShoulder,
                radiusEnd: mode === 'cap' ? rShoulder * 0.94 : mode === 'short' ? THREE.MathUtils.lerp(rShoulder, rElbow, 0.5) : rElbow,
                ellipseScaleZ: 0.90,
                mat,
              });
        upG.add(tube);

        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(rShoulder * 0.96, 14, 12),
          mat
        );
        cap.scale.set(1.0, 0.88, 0.90);
        cap.position.set(0, -0.004, 0);
        upG.add(cap);

        if ((mode === 'short' || mode === 'cap') && cuffMat) {
          const trim = createTaperedEllipticalForearmTube({
            bone: up,
            childBone: low,
            fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
            fallbackLen: upLen,
            startFrac: Math.max(0.14, endFrac - 0.08),
            endFrac: endFrac + 0.02,
            radiusStart: THREE.MathUtils.lerp(rShoulder, rElbow, endFrac) + 0.0025,
            radiusEnd: THREE.MathUtils.lerp(rShoulder, rElbow, endFrac) + 0.002,
            ellipseScaleZ: 0.90,
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
            new THREE.SphereGeometry(rElbow * 0.96, 12, 10),
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
                fallbackLen: lowLen,
                startFrac: -0.04,
                endFrac: 0.88,
                radiusStart: rElbow * 1.15,
                radiusEnd: rElbow * 2.15,
                mat,
                openEnded: true,
              })
            : createTaperedEllipticalForearmTube({
                bone: low,
                childBone: hand,
                fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
                fallbackLen: lowLen,
                // Bridge elbow seamlessly (`startFrac = -0.06`) with smoothly matched elbow radius!
                startFrac: mode === 'gloves' ? 0.06 : -0.06,
                endFrac: mode === 'gloves' ? 0.98 : 0.96,
                radiusStart: mode === 'gloves' ? Math.min(0.0275, rElbow * 0.86) : rElbow,
                radiusEnd: mode === 'gloves' ? Math.min(0.0215, rWrist * 0.86) : rWrist,
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
          const cuffRStart = mode === 'gloves' ? Math.min(0.0295, rElbow * 0.90) : rWrist + 0.0028;
          const cuffREnd = mode === 'gloves' ? Math.min(0.0285, rElbow * 0.88) : rWrist + 0.0022;
          const cuff = createTaperedEllipticalForearmTube({
            bone: low,
            childBone: hand,
            fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
            fallbackLen: lowLen,
            startFrac: mode === 'gloves' ? 0.04 : 0.85,
            endFrac: mode === 'gloves' ? 0.16 : 0.99,
            radiusStart: cuffRStart,
            radiusEnd: cuffREnd,
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
  /** Set true for closed structured outerwear (coats, blazers) to guarantee continuous spine->hips coverage */
  closedOuterwear?: boolean;
  /** Set true on relaxed full-body outfits (pajamas, tee, hoodie) to prefer slim +2.5mm..+4.0mm SkinnedMesh cloning over rigid lathe shells */
  preferSkinnedBody?: boolean;
}): {
  chestGroup: THREE.Group | null;
  spineGroup: THREE.Group | null;
  hipsGroup: THREE.Group | null;
  topNeckY: number;
  waistYInChest: number;
  chestSurfaceFrontZ: number;
  waistSurfaceHalfW: number;
  waistSurfaceHalfD: number;
  waistSurfaceFrontZ: number;
  usedSkinnedTorso: boolean;
} {
  const {
    vrm,
    avatarRoot,
    metrics,
    topMat,
    hipsMat,
    scaleX = 1.0,
    scaleZ = 0.88,
    necklineHeightFrac = 0.84,
    bustBoost = 0.012,
    fwdSign,
    skinnedZone = 'torso_sleeveless',
    skinnedInflate = 0.0036,
    pelvisCoveredByPants = false,
    closedOuterwear = false,
    preferSkinnedBody = false,
  } = params;

  const hipsGroup = attachGroup(metrics.hips, 'GarmentHips');
  const spineGroup = attachGroup(metrics.spine, 'GarmentSpine');
  const chestGroup = attachGroup(metrics.chest, 'GarmentChest');

  const yTop = metrics.yNeckFromChest * necklineHeightFrac;
  // Span continuously from upperChest down through spine to overlap the top of hips (ZERO midriff gap!)
  const yBottomInChest = -(metrics.yChestFromSpine + metrics.ySpineFromHips * 0.96);
  const yWaistInChest = -metrics.yChestFromSpine * 0.58;
  const yBustInChest = yTop * 0.48;

  // Slim uniform normal extrusion for SkinnedMesh cloning (+4.5mm..+6.0mm base + bend ease = zero coplanar patchwork!)
  const cloneInflate = preferSkinnedBody
    ? THREE.MathUtils.clamp(skinnedInflate, 0.0045, 0.0065)
    : THREE.MathUtils.clamp(skinnedInflate, 0.0050, 0.016);
  const latheClr = preferSkinnedBody ? 0.0075 : THREE.MathUtils.clamp(skinnedInflate, 0.013, 0.017);

  // Non-bloated anime torso contour:
  // - Waist explicitly tapered at ySpine: waistRadius <= chestRadius * 0.78
  // - Depth scaleZ capped to 0.85..0.90 (never bulging like a cylinder or pregnant belly!)
  // - Bust boost capped <= 0.012 on relaxed clothing
  const rChest = (metrics.chestHalfW + latheClr) * scaleX;
  const rSpine = Math.min((metrics.spineHalfW + latheClr * 0.85) * scaleX, rChest * 0.78);
  const rHips = (metrics.hipsHalfW + latheClr) * scaleX;
  const rUpper = (metrics.upperChestHalfW + latheClr * 0.88) * scaleX;
  const effectiveScaleZ = THREE.MathUtils.clamp(scaleZ, 0.85, 0.90);
  const zRatioTorso = THREE.MathUtils.clamp(
    ((metrics.chestHalfD + latheClr) / Math.max(0.06, rChest)) * effectiveScaleZ,
    0.66,
    0.84
  );
  const safeBustBoost = preferSkinnedBody ? Math.min(bustBoost, 0.012) : Math.min(bustBoost, 0.022);

  // Primary path: Prefer cloning native Body_SKIN SkinnedMesh vertices with slim +2.5mm..+4.0mm normal extrusion!
  const torsoCoverage = { isSolid: false };
  const clonedZone = closedOuterwear && !preferSkinnedBody ? 'torso_sleeveless' : skinnedZone;
  let clonedTorsoTris = buildBodyClonedSkinnedGarment({
    vrm,
    avatarRoot,
    mat: topMat,
    zone: clonedZone,
    inflate: cloneInflate,
    topNeckFrac: necklineHeightFrac,
    uvScale: 1.7,
    skinOnly: true,
    outCoverage: torsoCoverage,
  });
  if (!closedOuterwear && clonedTorsoTris < 80) {
    clonedTorsoTris = buildBodyClonedSkinnedGarment({
      vrm,
      avatarRoot,
      mat: topMat,
      zone: clonedZone,
      inflate: cloneInflate,
      topNeckFrac: necklineHeightFrac,
      uvScale: 1.7,
      skinOnly: false,
      outCoverage: torsoCoverage,
    });
  }
  const usedSkinnedTorso = clonedTorsoTris >= 80;
  const needsRigidLathe = !usedSkinnedTorso || (closedOuterwear && !preferSkinnedBody);

  // Only add contoured lathe shell when SkinnedMesh torso is incomplete OR for structured tailored coats/blazers
  if (needsRigidLathe && chestGroup) {
    const linerScale = usedSkinnedTorso ? 0.96 : 1.0;
    const bodiceGeo = createContouredTorsoLathe({
      profile: [
        [rHips * 0.96 * linerScale, yBottomInChest],
        [rSpine * linerScale, yWaistInChest],
        [THREE.MathUtils.lerp(rSpine, rChest, 0.62) * linerScale, 0.0],
        [rChest * linerScale, yBustInChest],
        [rUpper * linerScale, yTop * 0.82],
        [(necklineHeightFrac > 0.78 ? rUpper * 0.88 : rUpper * 0.95) * linerScale, yTop],
        [(necklineHeightFrac > 0.78 ? rUpper * 0.66 : rUpper * 0.84) * linerScale, yTop + 0.006],
      ],
      scaleX: 1.0,
      scaleZ: zRatioTorso,
      bustCenterY: yBustInChest,
      bustBoost: usedSkinnedTorso ? safeBustBoost * 0.4 : safeBustBoost,
      frontBellyBoost: preferSkinnedBody ? 0 : 0.002,
      rearGluteY: yBottomInChest,
      rearGluteBoost: preferSkinnedBody ? 0.002 : 0.005,
      fwdSign,
      segments: 30,
    });
    chestGroup.add(new THREE.Mesh(bodiceGeo, topMat));
  }

  // Interlocking `spine` bone bridge sleeve: articulates seamlessly between `hips` and `chest` when seated
  // or leaning forward so NO dark side/waist V-notch can ever open between pelvis and torso!
  if (needsRigidLathe && spineGroup) {
    const linerScale = usedSkinnedTorso ? 0.95 : 0.985;
    const ySpineBot = -metrics.ySpineFromHips * 0.72;
    const ySpineTop = metrics.yChestFromSpine * 0.94;
    const spineBridgeGeo = createContouredTorsoLathe({
      profile: [
        [THREE.MathUtils.lerp(rHips, rSpine, 0.35) * linerScale, ySpineBot],
        [rSpine * linerScale, 0.0],
        [THREE.MathUtils.lerp(rSpine, rChest, 0.45) * linerScale, ySpineTop * 0.55],
        [THREE.MathUtils.lerp(rSpine, rChest, 0.80) * linerScale, ySpineTop],
      ],
      scaleX: 1.0,
      scaleZ: zRatioTorso,
      bustBoost: 0,
      frontBellyBoost: 0,
      rearGluteY: ySpineBot,
      rearGluteBoost: 0.003,
      fwdSign,
      segments: 28,
    });
    spineGroup.add(new THREE.Mesh(spineBridgeGeo, topMat));
  }

  // Continuous waist/hips overlap bridge ONLY when pelvis isn't already covered by skinned pants/body
  // (capped cleanly at ySpineFromHips * 0.85 so its top rim NEVER juts forward out of the stomach when leaning!)
  if (needsRigidLathe && !pelvisCoveredByPants && hipsGroup) {
    const linerScale = usedSkinnedTorso ? 0.95 : 1.0;
    const hipTopY = metrics.ySpineFromHips * 0.85;
    const zRatioHips = THREE.MathUtils.clamp(
      ((metrics.hipsHalfD + latheClr) / Math.max(0.06, rHips)) * effectiveScaleZ,
      0.70,
      0.88
    );
    const pelvisGeo = createContouredTorsoLathe({
      profile: [
        [rHips * 0.62 * linerScale, -0.088],
        [rHips * 0.94 * linerScale, -0.055],
        [rHips * 1.0 * linerScale, -0.012],
        [THREE.MathUtils.lerp(rHips, rSpine, 0.55) * linerScale, hipTopY * 0.55],
        [rSpine * linerScale, hipTopY],
      ],
      scaleX: 1.0,
      scaleZ: zRatioHips,
      bustBoost: 0,
      frontBellyBoost: 0,
      rearGluteY: -0.02,
      rearGluteBoost: 0.005,
      fwdSign,
      segments: 30,
    });
    hipsGroup.add(new THREE.Mesh(pelvisGeo, hipsMat || topMat));
  }

  const surfClr = usedSkinnedTorso && !needsRigidLathe ? cloneInflate : latheClr;
  const chestSurfaceFrontZ = Math.max(metrics.chestFrontZ + surfClr, rChest * zRatioTorso);
  const waistSurfaceHalfW = usedSkinnedTorso && !needsRigidLathe ? metrics.spineHalfW + cloneInflate : rSpine;
  const waistSurfaceHalfD = Math.max(metrics.spineHalfD + surfClr, waistSurfaceHalfW * zRatioTorso);
  const waistSurfaceFrontZ = Math.max(metrics.spineFrontZ + surfClr, waistSurfaceHalfD);

  return {
    chestGroup,
    spineGroup,
    hipsGroup,
    topNeckY: yTop,
    waistYInChest: yWaistInChest,
    chestSurfaceFrontZ,
    waistSurfaceHalfW,
    waistSurfaceHalfD,
    waistSurfaceFrontZ,
    usedSkinnedTorso: closedOuterwear && !preferSkinnedBody ? false : usedSkinnedTorso,
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

  // Automatic runtime fallback for pre-culled legacy VRM models (exported with VRoid "Delete transparent meshes"):
  // Preserve native clothing & rely on clean material/texture recoloring in clothingModder.ts instead of exposing a hollow cavity!
  const culling = inspectVrmBodySkinCulling(vrm, avatarRoot);
  if (culling.isPreCulled) {
    console.info(
      '[GarmentRig] Pre-culled body skin detected (torso/thighs missing) — preserving native clothing mesh with material/texture recoloring fallback.',
      culling
    );
    return;
  }

  const isVrm0 = vrm.meta?.metaVersion === '0';
  const fwdSign = isVrm0 ? -1 : 1;
  const avatarSkinHex = sampleAvatarSkinColorHex(avatarRoot);
  const metrics = measureTorsoMetrics(vrm, avatarRoot, fwdSign);
  const skinCoverage = inspectVrmBodySkinCoverage(vrm, avatarRoot);
  // Raised waistband origin slightly above hips bone top edge so skirts & coat tails NEVER expose pelvis/underwear!
  const skirtWaistTopY = Math.max(0.055, metrics.ySpineFromHips * 0.78);
  const skirtTopRadiusBase = Math.max(metrics.hipsHalfW, metrics.spineHalfW) + metrics.garmentClearance;

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
    const usedSkinnedPants = addLegPants({
      vrm,
      avatarRoot,
      metrics,
      mat: bottomMat,
      cuffMat: bottomAccentMat,
      looseFactor: 1.06,
      fwdSign,
    });
    const {
      chestGroup,
      hipsGroup,
      topNeckY,
      chestSurfaceFrontZ,
      waistSurfaceHalfW,
      waistSurfaceHalfD,
      usedSkinnedTorso,
    } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.02,
      scaleZ: 0.88,
      necklineHeightFrac: 0.88,
      bustBoost: 0.010,
      fwdSign,
      skinnedZone: 'torso_long_sleeve',
      skinnedInflate: 0.0056,
      pelvisCoveredByPants: usedSkinnedPants,
      preferSkinnedBody: true,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.06 });
    }

    if (chestGroup) {
      const trimZ = chestSurfaceFrontZ + 0.004;
      // Plush 3D Hood resting behind her neck & shoulders (never clipping chin!)
      const hood = new THREE.Mesh(new THREE.TorusGeometry(metrics.upperChestHalfW * 0.92, 0.026, 12, 24), topMat);
      hood.rotation.x = Math.PI * 0.46;
      hood.position.set(0, topNeckY - 0.005, -(metrics.upperChestHalfD * 0.62) * fwdSign);
      chestGroup.add(hood);

      // Flush drawstrings sitting +4mm above garment surface
      for (const sx of [-0.028, 0.028]) {
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.11, 8), whiteMat);
        str.position.set(sx, topNeckY - 0.060, trimZ * fwdSign);
        const aglet = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.014, 8), accMat);
        aglet.position.set(sx, topNeckY - 0.118, trimZ * fwdSign);
        chestGroup.add(str, aglet);
      }

      if (!usedSkinnedTorso) {
        const pocket = new THREE.Mesh(new THREE.BoxGeometry(waistSurfaceHalfW * 1.18, 0.078, 0.010), topAccentMat);
        pocket.position.set(0, -metrics.yChestFromSpine * 0.56, (waistSurfaceHalfD + 0.004) * fwdSign);
        chestGroup.add(pocket);
      }
    }
    if (hipsGroup && !usedSkinnedTorso) {
      const ribBand = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.009, 10, 28), topAccentMat);
      ribBand.rotation.x = Math.PI / 2;
      ribBand.scale.set(waistSurfaceHalfW + 0.004, waistSurfaceHalfD + 0.004, 1);
      ribBand.position.set(0, skirtWaistTopY * 0.4, 0);
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
    const {
      chestGroup,
      spineGroup,
      hipsGroup,
      topNeckY,
      waistYInChest,
      waistSurfaceHalfW,
      waistSurfaceHalfD,
      waistSurfaceFrontZ,
      usedSkinnedTorso,
    } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: topMat,
      scaleX: 1.0,
      scaleZ: 1.0,
      necklineHeightFrac: 0.66,
      bustBoost: 0.022,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.014,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'cap', looseFactor: 0.96 });
    }

    const targetWaist = spineGroup || chestGroup;
    if (targetWaist) {
      // Flush contoured waist ribbon hugging measured spine radius (+0.002m)
      const belt = new THREE.Mesh(
        new THREE.CylinderGeometry(
          waistSurfaceHalfW + 0.002,
          waistSurfaceHalfW + 0.002,
          0.016,
          24,
          1,
          true
        ),
        accMat
      );
      belt.scale.set(1, 1, Math.min(0.92, (waistSurfaceHalfD + 0.002) / Math.max(0.06, waistSurfaceHalfW + 0.002)));
      belt.position.set(0, spineGroup ? 0 : waistYInChest, 0);
      const bow = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), accMat);
      bow.scale.set(1.4, 0.7, 0.4);
      bow.position.set(0, spineGroup ? 0 : waistYInChest, (waistSurfaceFrontZ + 0.002) * fwdSign);
      targetWaist.add(belt, bow);
    }

    if (chestGroup && !usedSkinnedTorso) {
      for (const sx of [-metrics.upperChestHalfW * 0.65, metrics.upperChestHalfW * 0.65]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.082, metrics.upperChestHalfD * 1.45), topAccentMat);
        strap.position.set(sx, topNeckY + 0.030, 0);
        chestGroup.add(strap);
      }
    }
    if (hipsGroup) {
      // Graceful flared pleated anime midi sundress skirt raised cleanly to hips top edge!
      const skirtH = 0.52;
      const skirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: skirtTopRadiusBase,
          bottomRadius: 0.30,
          height: skirtH,
          pleatCount: 16,
          pleatDepth: 0.014,
          flarePower: 0.82,
        }),
        topMat
      );
      skirt.position.set(0, skirtWaistTopY - skirtH * 0.5, 0);
      registerDynamicSkirtMesh(skirt, skirtH, fwdSign, false);

      const hemY = skirtWaistTopY - skirtH + 0.005;
      const hem = new THREE.Mesh(new THREE.TorusGeometry(0.298, 0.008, 10, 36), topAccentMat);
      hem.rotation.x = Math.PI / 2;
      hem.scale.set(1.06, 0.88, 1);
      hem.position.set(0, hemY, 0);
      hem.userData.dynamicSkirtHem = { baseY: hemY, fwdSign, height: skirtH };
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
      metrics,
      mat: bottomMat,
      cuffMat: bottomAccentMat,
      shortsOnly: true,
      looseFactor: 1.04,
      fwdSign,
    });
    const {
      chestGroup,
      spineGroup,
      hipsGroup,
      topNeckY,
      waistYInChest,
      chestSurfaceFrontZ,
      waistSurfaceHalfW,
      waistSurfaceHalfD,
      waistSurfaceFrontZ,
      usedSkinnedTorso,
    } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat: whiteMat,
      hipsMat: bottomMat,
      scaleX: 1.0,
      scaleZ: 1.0,
      necklineHeightFrac: 0.84,
      bustBoost: 0.018,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.015,
      pelvisCoveredByPants: usedSkinnedShorts,
      closedOuterwear: true,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.06 });

    if (chestGroup) {
      // Open-front cropped bomber jacket sculpted outer shell tightly sized to measured chest cross-section
      const jacketH = topNeckY - waistYInChest + 0.025;
      const jacketBack = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: metrics.chestHalfW + metrics.garmentClearance + 0.005,
          bottomRadius: metrics.spineHalfW + metrics.garmentClearance + 0.005,
          height: jacketH,
          pleatCount: 0,
          scaleX: 1.02,
          scaleZ: THREE.MathUtils.clamp((metrics.chestHalfD + 0.019) / Math.max(0.06, metrics.chestHalfW + 0.019), 0.74, 0.94),
          openSlitFront: true,
          fwdSign,
        }),
        topMat
      );
      jacketBack.position.set(0, (topNeckY + waistYInChest) * 0.5, 0);
      chestGroup.add(jacketBack);

      // Flush front jacket zipper trims (+4mm above garment surface, thin 6mm depth)
      const trimZ = chestSurfaceFrontZ + 0.004;
      for (const sx of [-0.038, 0.038]) {
        const zip = new THREE.Mesh(
          new THREE.BoxGeometry(0.009, jacketH * 0.94, 0.006),
          goldMat
        );
        zip.position.set(sx, (topNeckY + waistYInChest) * 0.5, trimZ * fwdSign);
        chestGroup.add(zip);
      }

      if (!usedSkinnedTorso) {
        const collar = new THREE.Mesh(
          new THREE.CylinderGeometry(metrics.upperChestHalfW * 0.70, metrics.upperChestHalfW * 0.70, 0.012, 24, 1, true),
          topAccentMat
        );
        collar.position.set(0, topNeckY, -0.002 * fwdSign);
        chestGroup.add(collar);
      }
    }
    const targetWaist = spineGroup || hipsGroup;
    if (targetWaist) {
      const beltGeo = new THREE.CylinderGeometry(
        waistSurfaceHalfW + 0.002,
        waistSurfaceHalfW + 0.002,
        0.018,
        24,
        1,
        true
      );
      beltGeo.scale(1, 1, Math.min(0.92, (waistSurfaceHalfD + 0.002) / Math.max(0.06, waistSurfaceHalfW + 0.002)));
      const belt = new THREE.Mesh(beltGeo, accMat);
      belt.position.set(0, spineGroup ? 0 : skirtWaistTopY * 0.75, 0);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.020, 0.004), goldMat);
      buckle.position.set(0, spineGroup ? 0 : skirtWaistTopY * 0.75, (waistSurfaceFrontZ + 0.002) * fwdSign);
      targetWaist.add(belt, buckle);
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
      metrics,
      mat: bottomMat,
      looseFactor: 0.98,
      fwdSign,
    });
    const { chestGroup, topNeckY, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.0,
      scaleZ: 0.86,
      necklineHeightFrac: 0.85,
      bustBoost: 0.010,
      fwdSign,
      skinnedZone: 'torso_short_sleeve',
      skinnedInflate: 0.0032,
      pelvisCoveredByPants: usedSkinnedLeggings,
      preferSkinnedBody: true,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'short', looseFactor: 1.0 });
    }

    if (chestGroup && !usedSkinnedTorso) {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(metrics.upperChestHalfW * 0.68, metrics.upperChestHalfW * 0.68, 0.010, 24, 1, true),
        topAccentMat
      );
      collar.position.set(0, topNeckY + 0.002, 0);
      chestGroup.add(collar);
    }
  } else if (garmentStyle === 'kimono_yukata') {
    const {
      chestGroup,
      hipsGroup,
      topNeckY,
      waistYInChest,
      chestSurfaceFrontZ,
      waistSurfaceHalfW,
      waistSurfaceHalfD,
    } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: topMat,
      scaleX: 1.02,
      scaleZ: 1.02,
      necklineHeightFrac: 0.86,
      bustBoost: 0.014,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.016,
      closedOuterwear: true,
    });
    addArmSleeves({ vrm, mat: topMat, mode: 'kimono', looseFactor: 1.12 });

    if (chestGroup) {
      const trimZ = chestSurfaceFrontZ + 0.004;
      // Flush crossed V-neck juban kimono collar (+4mm above garment surface)
      for (const side of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.145, 0.007), whiteMat);
        lapel.position.set(side * 0.024, topNeckY - 0.052, trimZ * fwdSign);
        lapel.rotation.z = side * 0.40;
        chestGroup.add(lapel);
      }
      // Fitted Obi sash + woven obijime cord + traditional back obi bow sized to measured spine
      const obi = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: waistSurfaceHalfW + 0.005,
          bottomRadius: waistSurfaceHalfW + 0.009,
          height: 0.115,
          pleatCount: 0,
          scaleX: 1.0,
          scaleZ: THREE.MathUtils.clamp((waistSurfaceHalfD + 0.006) / Math.max(0.06, waistSurfaceHalfW + 0.006), 0.74, 0.96),
        }),
        accMat
      );
      obi.position.set(0, waistYInChest + 0.005, 0);
      const cord = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.006, 10, 28), goldMat);
      cord.rotation.x = Math.PI / 2;
      cord.scale.set(waistSurfaceHalfW + 0.008, waistSurfaceHalfD + 0.008, 1);
      cord.position.set(0, waistYInChest + 0.005, 0);
      const backBow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.115, 0.060), accMat);
      backBow.position.set(0, waistYInChest + 0.015, -(waistSurfaceHalfD + 0.032) * fwdSign);
      chestGroup.add(obi, cord, backBow);
    }
    if (hipsGroup) {
      const robeH = 0.74;
      const robeSkirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: skirtTopRadiusBase + 0.004,
          bottomRadius: 0.20,
          height: robeH,
          pleatCount: 6,
          pleatDepth: 0.006,
          flarePower: 1.0,
        }),
        bottomMat
      );
      robeSkirt.position.set(0, skirtWaistTopY - robeH * 0.5, 0);
      registerDynamicSkirtMesh(robeSkirt, robeH, fwdSign, false);
      hipsGroup.add(robeSkirt);
    }
  } else if (garmentStyle === 'evening_gown') {
    addExposedSkinUnderlay({
      vrm,
      avatarRoot,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'full',
      collarboneBridge: true,
      fwdSign,
      coverage: skinCoverage,
    });
    const { hipsGroup } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.0,
      scaleZ: 1.0,
      necklineHeightFrac: 0.62,
      bustBoost: 0.024,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.014,
    });
    const clonedGloves = buildBodyClonedSkinnedGarment({
      vrm,
      avatarRoot,
      mat: accMat,
      zone: 'gloves',
      inflate: 0.0035,
      uvScale: 1.8,
    });
    if (clonedGloves < 40) {
      addArmSleeves({ vrm, mat: accMat, cuffMat: goldMat, mode: 'gloves', looseFactor: 0.96 });
    }

    if (hipsGroup) {
      const gownH = 0.82;
      const outerGown = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: skirtTopRadiusBase,
          bottomRadius: 0.42,
          height: gownH,
          pleatCount: 20,
          pleatDepth: 0.015,
          flarePower: 0.78,
        }),
        bottomMat
      );
      outerGown.position.set(0, skirtWaistTopY - gownH * 0.5, 0);
      registerDynamicSkirtMesh(outerGown, gownH, fwdSign, false);

      // Matched 20-pleat peplum flared cleanly OUTSIDE outerGown (zero dark zebra-stripe clipping!)
      const peplumH = 0.24;
      const peplum = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: skirtTopRadiusBase + 0.015,
          bottomRadius: 0.295,
          height: peplumH,
          pleatCount: 20,
          pleatDepth: 0.013,
        }),
        topAccentMat
      );
      peplum.position.set(0, skirtWaistTopY - peplumH * 0.5, 0);
      registerDynamicSkirtMesh(peplum, peplumH, fwdSign, false);
      hipsGroup.add(outerGown, peplum);
    }
  } else if (garmentStyle === 'cozy_pajamas') {
    const usedSkinnedPants = addLegPants({
      vrm,
      avatarRoot,
      metrics,
      mat: bottomMat,
      cuffMat: whiteMat,
      looseFactor: 1.06,
      fwdSign,
    });
    const { chestGroup, topNeckY, chestSurfaceFrontZ, usedSkinnedTorso } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.01,
      scaleZ: 0.87,
      necklineHeightFrac: 0.90,
      bustBoost: 0.010,
      fwdSign,
      skinnedZone: 'torso_long_sleeve',
      skinnedInflate: 0.0054,
      pelvisCoveredByPants: usedSkinnedPants,
      preferSkinnedBody: true,
    });
    if (!usedSkinnedTorso) {
      addArmSleeves({ vrm, mat: topMat, cuffMat: whiteMat, mode: 'full', looseFactor: 1.04 });
    }

    // Never attach rigid 3D box flaps or floating tabs that detach during seated/forward postures
    if (chestGroup && !usedSkinnedTorso) {
      const trimZ = chestSurfaceFrontZ + 0.004;
      for (let i = 0; i < 3; i++) {
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 10), whiteMat);
        btn.position.set(0, topNeckY - 0.045 - i * 0.052, trimZ * fwdSign);
        chestGroup.add(btn);
      }
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
    const { chestGroup, hipsGroup, topNeckY, chestSurfaceFrontZ } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.02,
      scaleZ: 1.02,
      necklineHeightFrac: 0.85,
      bustBoost: 0.016,
      fwdSign,
      skinnedZone: 'torso_long_sleeve',
      skinnedInflate: 0.016,
      closedOuterwear: true,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.02 });

    if (chestGroup) {
      // Flush V-neck shirt insert, ribbon & buttons constrained strictly to +4mm above measured chest surface!
      const trimZ = chestSurfaceFrontZ + 0.004;
      const shirtV = new THREE.Mesh(new THREE.ConeGeometry(0.044, 0.115, 4), whiteMat);
      shirtV.rotation.x = Math.PI;
      shirtV.scale.set(1, 1, 0.18);
      shirtV.position.set(0, topNeckY - 0.046, trimZ * fwdSign);
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.028, 0.008), accMat);
      ribbon.position.set(0, topNeckY - 0.036, (trimZ + 0.003) * fwdSign);
      const tieTail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.062, 0.006), accMat);
      tieTail.position.set(0, topNeckY - 0.078, (trimZ + 0.002) * fwdSign);
      chestGroup.add(shirtV, ribbon, tieTail);

      for (const sx of [-0.028, 0.028]) {
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 10), goldMat);
        btn.position.set(sx, -0.012, trimZ * fwdSign);
        chestGroup.add(btn);
      }
    }
    if (hipsGroup) {
      const skirtH = 0.36;
      const skirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: skirtTopRadiusBase,
          bottomRadius: 0.245,
          height: skirtH,
          pleatCount: 18,
          pleatDepth: 0.015,
          flarePower: 0.9,
        }),
        bottomMat
      );
      skirt.position.set(0, skirtWaistTopY - skirtH * 0.5, 0);
      registerDynamicSkirtMesh(skirt, skirtH, fwdSign, false);
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
      metrics,
      mat: bottomMat,
      looseFactor: 1.0,
      fwdSign,
    });
    const {
      chestGroup,
      spineGroup,
      hipsGroup,
      topNeckY,
      waistYInChest,
      chestSurfaceFrontZ,
      waistSurfaceHalfW,
      waistSurfaceHalfD,
      waistSurfaceFrontZ,
    } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat,
      hipsMat: topMat,
      scaleX: 1.02,
      scaleZ: 0.90,
      necklineHeightFrac: 0.88,
      bustBoost: 0.012,
      fwdSign,
      skinnedZone: 'torso_long_sleeve',
      skinnedInflate: 0.0055,
      pelvisCoveredByPants: usedSkinnedPants,
      closedOuterwear: true,
      preferSkinnedBody: true,
    });
    // Bone-aligned slim tapered trench coat sleeves (zero jagged baggy saw-tooth shoulder/forearm clipping!)
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.04 });

    if (chestGroup) {
      // Flush contoured lapels & double-breasted buttons constrained tightly to +1.5mm above garment surface
      const trimZ = chestSurfaceFrontZ + 0.0015;
      for (const side of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.115, 0.003), topAccentMat);
        lapel.position.set(side * 0.030, topNeckY - 0.052, trimZ * fwdSign);
        lapel.rotation.z = side * 0.20;
        lapel.rotation.y = side * -0.10 * fwdSign;
        chestGroup.add(lapel);
        for (let b = 0; b < 3; b++) {
          const btn = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 10, 10), goldMat);
          btn.position.set(side * 0.026, topNeckY - 0.068 - b * 0.040, (trimZ + 0.0015) * fwdSign);
          chestGroup.add(btn);
        }
      }
    }
    const targetWaist = spineGroup || chestGroup;
    if (targetWaist) {
      // Flush contoured trench coat belt constrained tightly to waist surface (ZERO floating gap!)
      const beltGeo = new THREE.CylinderGeometry(
        waistSurfaceHalfW + 0.002,
        waistSurfaceHalfW + 0.002,
        0.024,
        24,
        1,
        true
      );
      beltGeo.scale(1, 1, Math.min(0.92, (waistSurfaceHalfD + 0.002) / Math.max(0.06, waistSurfaceHalfW + 0.002)));
      const beltMesh = new THREE.Mesh(beltGeo, accMat);
      beltMesh.position.set(0, spineGroup ? 0 : waistYInChest, 0);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.022, 0.004), goldMat);
      buckle.position.set(0, spineGroup ? 0 : waistYInChest, (waistSurfaceFrontZ + 0.0025) * fwdSign);
      targetWaist.add(beltMesh, buckle);
    }
    if (hipsGroup) {
      // Raised trench coat tail overlapping waist smoothly + forward pitch drape during seated/leaning poses!
      const coatH = 0.54;
      const coatTail = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: skirtTopRadiusBase + 0.006,
          bottomRadius: 0.26,
          height: coatH,
          pleatCount: 8,
          pleatDepth: 0.010,
          openSlitFront: true,
          fwdSign,
        }),
        topMat
      );
      coatTail.position.set(0, skirtWaistTopY - coatH * 0.5, 0);
      registerDynamicSkirtMesh(coatTail, coatH, fwdSign, true);
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
    const { hipsGroup } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat: towelMat,
      hipsMat: towelMat,
      scaleX: 1.03,
      scaleZ: 1.03,
      necklineHeightFrac: 0.62,
      bustBoost: 0.020,
      fwdSign,
      skinnedZone: 'torso_sleeveless',
      skinnedInflate: 0.015,
    });
    if (hipsGroup) {
      const towelH = 0.36;
      const towelSkirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: skirtTopRadiusBase + 0.004,
          bottomRadius: 0.168,
          height: towelH,
          pleatCount: 6,
          pleatDepth: 0.006,
        }),
        towelMat
      );
      towelSkirt.position.set(0, skirtWaistTopY - towelH * 0.5, 0);
      registerDynamicSkirtMesh(towelSkirt, towelH, fwdSign, false);

      const stripeY = skirtWaistTopY - towelH + 0.01;
      const bottomStripe = new THREE.Mesh(new THREE.TorusGeometry(0.166, 0.008, 10, 32), trimMat);
      bottomStripe.rotation.x = Math.PI / 2;
      bottomStripe.scale.set(1.06, 0.88, 1);
      bottomStripe.position.set(0, stripeY, 0);
      bottomStripe.userData.dynamicSkirtHem = { baseY: stripeY, fwdSign, height: towelH };
      hipsGroup.add(towelSkirt, bottomStripe);
    }
  } else if (garmentStyle === 'beach_swimsuit') {
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
    const { hipsGroup } = addSculptedTorso({
      vrm,
      avatarRoot,
      metrics,
      topMat: swimMat,
      hipsMat: swimMat,
      scaleX: 0.99,
      scaleZ: 0.98,
      necklineHeightFrac: 0.60,
      bustBoost: 0.022,
      fwdSign,
      skinnedZone: 'swimsuit',
      skinnedInflate: 0.014,
      pelvisCoveredByPants: true,
    });
    if (hipsGroup) {
      const pareoH = 0.27;
      const pareo = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: skirtTopRadiusBase,
          bottomRadius: 0.215,
          height: pareoH,
          pleatCount: 16,
          pleatDepth: 0.011,
          flarePower: 0.85,
        }),
        pareoMat
      );
      pareo.position.set(0, skirtWaistTopY - pareoH * 0.5, 0);
      registerDynamicSkirtMesh(pareo, pareoH, fwdSign, false);
      hipsGroup.add(pareo);
    }
  }

  // Ensure every procedural garment mesh, skinned mesh, and bone group is NEVER frustum-culled
  avatarRoot.traverse((obj) => {
    if (obj.userData?.[GARMENT_TAG] || obj.userData?.__zeta_procedural_garment__) {
      obj.frustumCulled = false;
      if (obj instanceof THREE.Mesh) {
        obj.frustumCulled = false;
      }
    }
  });
}

export interface GarmentFrameUpdateOptions {
  vrm?: VRM | null;
  dt?: number;
  isSeated?: boolean;
  /** World-space Y height of chair/stool seat cushion top (default 0.45m) */
  seatSurfaceWorldY?: number;
  /** Current positive forward torso lean pitch in radians (from AvatarPoseController) */
  torsoForwardLeanRad?: number;
  /** Current forward thigh pitch in radians (left/right/max from AvatarPoseController) */
  thighPitch?: { left: number; right: number; max: number };
}

const _lArmStart = new THREE.Vector3();
const _lArmEnd = new THREE.Vector3();
const _rArmStart = new THREE.Vector3();
const _rArmEnd = new THREE.Vector3();
const _lSegA = new THREE.Vector3();
const _lSegB = new THREE.Vector3();
const _rSegA = new THREE.Vector3();
const _rSegB = new THREE.Vector3();
const _lThighStart = new THREE.Vector3();
const _lThighEnd = new THREE.Vector3();
const _rThighStart = new THREE.Vector3();
const _rThighEnd = new THREE.Vector3();
const _lThighSegA = new THREE.Vector3();
const _lThighSegB = new THREE.Vector3();
const _rThighSegA = new THREE.Vector3();
const _rThighSegB = new THREE.Vector3();
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
  const torsoForwardLeanRad = THREE.MathUtils.clamp(options?.torsoForwardLeanRad ?? 0, 0, 0.55);
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

  // Pre-fetch thigh world segments for thigh-collider deflection (zero per-frame heap allocations!)
  let hasThighSegments = false;
  let thighRadius = 0.075;
  if (vrm?.humanoid) {
    const luLeg = vrm.humanoid.getRawBoneNode('leftUpperLeg');
    const llLeg = vrm.humanoid.getRawBoneNode('leftLowerLeg');
    const ruLeg = vrm.humanoid.getRawBoneNode('rightUpperLeg');
    const rlLeg = vrm.humanoid.getRawBoneNode('rightLowerLeg');
    if (luLeg && llLeg && ruLeg && rlLeg) {
      luLeg.getWorldPosition(_lThighStart);
      llLeg.getWorldPosition(_lThighEnd);
      ruLeg.getWorldPosition(_rThighStart);
      rlLeg.getWorldPosition(_rThighEnd);
      hasThighSegments = true;
      const legLen = _lThighStart.distanceTo(_lThighEnd);
      if (legLen > 0.15 && legLen < 0.8) {
        thighRadius = THREE.MathUtils.clamp(legLen * 0.22, 0.055, 0.095);
      }
    }
  }

  avatarRoot.traverse((obj) => {
    if (obj.userData?.garmentSkirtSway) {
      const swayAmp = isSeated ? 0.25 : 1.0;
      const sd = obj.userData?.dynamicSkirtDrape as DynamicSkirtDrapeData | undefined;
      // Forward pitch offset on hips-mounted lower skirts & open coat tails during seated/leaning poses
      // (`-fwdSign` swings downward -Y hems forward over the legs on both VRM 0.x and VRM 1.0!)
      const seatedPitchMag = sd
        ? sd.seatedBlend * (sd.isCoatTail ? 0.22 : 0.16) + torsoForwardLeanRad * (sd.isCoatTail ? 0.36 : 0.28)
        : 0;
      const forwardPitchX = sd ? -sd.fwdSign * seatedPitchMag : 0;
      obj.rotation.z = Math.sin(elapsed * 1.65) * 0.022 * swayAmp;
      obj.rotation.x = forwardPitchX + Math.cos(elapsed * 1.25) * 0.014 * swayAmp;
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

      if (hasThighSegments) {
        _lThighSegA.copy(_lThighStart).applyMatrix4(_tmpInvMat);
        _lThighSegB.copy(_lThighEnd).applyMatrix4(_tmpInvMat);
        _rThighSegA.copy(_rThighStart).applyMatrix4(_tmpInvMat);
        _rThighSegB.copy(_rThighEnd).applyMatrix4(_tmpInvMat);
      }

      const thighForwardPitch = options?.thighPitch?.max ?? 0;
      const effectiveThighPitch = Math.max(s, Math.min(1.0, thighForwardPitch * 0.85));

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

        // Front & lateral hem flares gracefully forward and slightly outward over seated/walking thighs!
        const lapForward = Math.min(0.24, h * 0.42) * t * frontWeight * effectiveThighPitch;
        const lapLift = Math.min(0.16, h * 0.28) * tCurve * frontWeight * effectiveThighPitch;
        const sideFlare = (0.045 * sideWeight + 0.025 * frontWeight) * t * effectiveThighPitch;
        nx += Math.sign(rx || 1) * sideFlare;
        ny += lapLift;
        nz += fwd * lapForward;

        // Thigh-collider deflection: push skirt / gown / coat tail vertices outward past left & right upperLeg capsules
        if (hasThighSegments && t > 0.06) {
          _tmpVert.set(nx, ny, nz);
          // Left thigh deflection
          closestPointOnSegment(_tmpVert, _lThighSegA, _lThighSegB, _tmpClosest);
          _tmpDiff.subVectors(_tmpVert, _tmpClosest);
          let distL = _tmpDiff.length();
          const clearThigh = thighRadius + 0.014;
          if (distL < clearThigh && distL > 1e-5) {
            _tmpVert.addScaledVector(_tmpDiff, ((clearThigh - distL) * 1.10) / distL);
          }
          // Right thigh deflection
          closestPointOnSegment(_tmpVert, _rThighSegA, _rThighSegB, _tmpClosest);
          _tmpDiff.subVectors(_tmpVert, _tmpClosest);
          let distR = _tmpDiff.length();
          if (distR < clearThigh && distR > 1e-5) {
            _tmpVert.addScaledVector(_tmpDiff, ((clearThigh - distR) * 1.10) / distR);
          }
          nx = _tmpVert.x;
          ny = _tmpVert.y;
          nz = _tmpVert.z;
        }

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
