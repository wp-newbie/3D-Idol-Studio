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

function registerDynamicCollarRing(
  mesh: THREE.Mesh,
  fwdSign: number,
  armClearance = 0.044
): void {
  const pos = mesh.geometry.attributes.position;
  if (!pos) return;
  mesh.userData.dynamicCollarRing = {
    restPos: new Float32Array(pos.array as Float32Array),
    fwdSign,
    armClearance,
  } satisfies DynamicCollarRingData;
}

/**
 * Adds seamless, bright anime MToon-matched skin underlays for bare shoulders, collarbone/neck,
 * arms, and upper thighs so VRoid Studio models exported with "Delete transparent meshes"
 * never show hollow chests, invisible arms, or muddy grey tubes!
 */
function addExposedSkinUnderlay(params: {
  vrm: VRM;
  metrics: TorsoMetrics;
  skinHex: string;
  armMode?: 'full' | 'forearms_only' | 'upper_only' | 'below_cap' | 'none';
  collarboneBridge?: boolean;
  upperThighs?: boolean;
  fwdSign: number;
}): void {
  const {
    vrm,
    metrics,
    skinHex,
    armMode = 'none',
    collarboneBridge = false,
    upperThighs = false,
    fwdSign,
  } = params;
  const h = vrm.humanoid;
  if (!h) return;
  const isVrm0 = vrm.meta?.metaVersion === '0';
  const skinMat = makeAnimeSkinMaterial(skinHex);

  // 1. Seamless Collarbone + Upper Chest + Neck Skin Bridge (fills VRoid's deleted upper-chest triangles cleanly!)
  if (collarboneBridge && metrics.chest) {
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

      // Smooth slim shoulder clavicles tucked neatly inside intact VRM skin while filling VRoid cutouts
      for (const sx of [-1, 1]) {
        const clav = new THREE.Mesh(new THREE.SphereGeometry(0.029, 14, 12), skinMat);
        clav.scale.set(1.2, 0.82, 0.80);
        clav.position.set(sx * (metrics.halfShoulderW * 0.76), metrics.yShoulderFromChest + 0.004, 0);
        bridgeG.add(clav);
      }
    }
  }

  // 2. Smooth Slim Tapered Anime Arms (seamless from deltoid -> elbow -> wrist!)
  if (armMode !== 'none') {
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

      if (up && armMode !== 'forearms_only') {
        const upG = attachGroup(up, `GarmentSkinArmUp_${s.upper}`);
        if (upG) {
          const startFrac = armMode === 'below_cap' ? 0.14 : -0.05;
          const tube = createBoneSegmentTube({
            bone: up,
            childBone: low,
            fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
            fallbackLen: 0.24,
            startFrac,
            endFrac: 1.02,
            radiusStart: 0.029,
            radiusEnd: 0.024,
            mat: skinMat,
            radialSegments: 16,
          });
          upG.add(tube);

          if (armMode !== 'below_cap') {
            const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.030, 14, 12), skinMat);
            upG.add(shoulderBall);
          }
        }
      }

      if (low && armMode !== 'upper_only') {
        const lowG = attachGroup(low, `GarmentSkinArmLow_${s.lower}`);
        if (lowG) {
          const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), skinMat);
          const tube = createBoneSegmentTube({
            bone: low,
            childBone: hand,
            fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
            fallbackLen: 0.22,
            startFrac: 0.0,
            endFrac: 0.99,
            radiusStart: 0.024,
            radiusEnd: 0.018,
            mat: skinMat,
            radialSegments: 16,
          });
          lowG.add(elbowBall, tube);
        }
      }
    }
  }

  // 3. Slim Upper-Thigh Skin Underlay (fills any hip-to-mid-thigh cutout VRoid made under a skirt!)
  if (upperThighs) {
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
  mat: THREE.Material;
  cuffMat?: THREE.Material;
  stripeMat?: THREE.Material;
  endFracLower?: number;
  shortsOnly?: boolean;
  looseFactor?: number;
  fwdSign: number;
}): void {
  const {
    vrm,
    mat,
    cuffMat,
    stripeMat,
    endFracLower = 0.95,
    shortsOnly = false,
    looseFactor = 1.0,
  } = params;
  const h = vrm.humanoid;
  if (!h) return;

  const sides: Array<{
    upper: VRMHumanBoneName;
    lower: VRMHumanBoneName;
    foot: VRMHumanBoneName;
    sign: number;
  }> = [
    { upper: 'leftUpperLeg', lower: 'leftLowerLeg', foot: 'leftFoot', sign: 1 },
    { upper: 'rightUpperLeg', lower: 'rightLowerLeg', foot: 'rightFoot', sign: -1 },
  ];

  for (const s of sides) {
    const up = h.getRawBoneNode(s.upper);
    const low = h.getRawBoneNode(s.lower);
    const ft = h.getRawBoneNode(s.foot);

    const upGroup = attachGroup(up, `GarmentLegUp_${s.upper}`);
    if (upGroup && up) {
      // Smooth rounded hip cap tucked cleanly INSIDE pelvis shell (eliminates boxy flat top cylinder rims at hips!)
      const hipBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.072 * looseFactor, 14, 12),
        mat
      );
      hipBall.position.set(0, -0.015, 0);
      upGroup.add(hipBall);

      const tube = createBoneSegmentTube({
        bone: up,
        childBone: low,
        fallbackDir: new THREE.Vector3(0, -1, 0),
        fallbackLen: 0.38,
        startFrac: 0.02,
        endFrac: shortsOnly ? 0.42 : 1.04,
        radiusStart: 0.074 * looseFactor,
        radiusEnd: (shortsOnly ? 0.070 : 0.064) * looseFactor,
        mat,
      });
      upGroup.add(tube);

      if (shortsOnly && cuffMat) {
        const hem = createBoneSegmentTube({
          bone: up,
          childBone: low,
          fallbackDir: new THREE.Vector3(0, -1, 0),
          fallbackLen: 0.38,
          startFrac: 0.36,
          endFrac: 0.43,
          radiusStart: 0.073 * looseFactor,
          radiusEnd: 0.073 * looseFactor,
          mat: cuffMat,
        });
        upGroup.add(hem);
      }

      if (stripeMat && !shortsOnly) {
        const stripe = createBoneSegmentTube({
          bone: up,
          childBone: low,
          fallbackDir: new THREE.Vector3(0, -1, 0),
          fallbackLen: 0.38,
          startFrac: 0.05,
          endFrac: 0.98,
          radiusStart: 0.011,
          radiusEnd: 0.009,
          mat: stripeMat,
          radialSegments: 8,
        });
        stripe.position.x += s.sign * 0.068 * looseFactor;
        upGroup.add(stripe);
      }
    }

    if (!shortsOnly && low) {
      const lowGroup = attachGroup(low, `GarmentLegLow_${s.lower}`);
      if (lowGroup) {
        const kneeJoint = new THREE.Mesh(
          new THREE.SphereGeometry(0.064 * looseFactor, 14, 12),
          mat
        );
        // Anatomical calf-contoured lower pant leg (posterior calf bulge clearance so calves NEVER poke out the back!)
        const segVec =
          ft && ft.position.lengthSq() > 1e-5
            ? ft.position.clone()
            : new THREE.Vector3(0, -0.38, 0);
        const totalLen = segVec.length();
        const dir = segVec.clone().normalize();
        const startF = -0.03;
        const endF = endFracLower;
        const segLen = Math.max(0.05, totalLen * (endF - startF));
        const midDist = totalLen * ((startF + endF) * 0.5);

        const shinGeo = new THREE.CylinderGeometry(
          0.050 * looseFactor,
          0.066 * looseFactor,
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
          // t = 0 at knee (+segLen/2 after quaternion align? Note: +Y maps along `dir` = downward -> y=-segLen/2 is knee, y=+segLen/2 is ankle!)
          const t = THREE.MathUtils.clamp((vy + segLen * 0.5) / segLen, 0, 1);
          // Smooth calf fullness peaking around t = 0.36 down the shin!
          const calfWave = Math.exp(-Math.pow((t - 0.36) / 0.28, 2));
          const radScale = 1.0 + calfWave * 0.16;
          // Shift calf vertices gently posteriorly (-fwdSign in Z) to completely clear the calf muscle
          const backShift = -params.fwdSign * calfWave * 0.018 * looseFactor;
          shinPos.setXYZ(vi, vx * radScale, vy, vz * radScale + backShift);
        }
        shinGeo.computeVertexNormals();

        const shin = new THREE.Mesh(shinGeo, mat);
        shin.position.copy(dir).multiplyScalar(midDist);
        shin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        lowGroup.add(kneeJoint, shin);

        if (cuffMat) {
          const cuff = createBoneSegmentTube({
            bone: low,
            childBone: ft,
            fallbackDir: new THREE.Vector3(0, -1, 0),
            fallbackLen: 0.38,
            startFrac: Math.max(0.76, endFracLower - 0.1),
            endFrac: endFracLower + 0.02,
            radiusStart: 0.053 * looseFactor,
            radiusEnd: 0.050 * looseFactor,
            mat: cuffMat,
          });
          lowGroup.add(cuff);
        }
      }
    }
  }
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
  metrics: TorsoMetrics;
  topMat: THREE.Material;
  hipsMat?: THREE.Material;
  scaleX?: number;
  scaleZ?: number;
  /** Fraction of chest->neck height where the top neckline ends (0.62 = strapless/swimsuit/towel, 0.86 = full collar shirt/hoodie) */
  necklineHeightFrac?: number;
  bustBoost?: number;
  fwdSign: number;
}): {
  chestGroup: THREE.Group | null;
  spineGroup: THREE.Group | null;
  hipsGroup: THREE.Group | null;
  topNeckY: number;
  waistYInChest: number;
} {
  const {
    metrics,
    topMat,
    hipsMat,
    scaleX = 1.0,
    scaleZ = 1.0,
    necklineHeightFrac = 0.84,
    bustBoost = 0.024,
    fwdSign,
  } = params;

  const hipsGroup = attachGroup(metrics.hips, 'GarmentHips');
  const spineGroup = attachGroup(metrics.spine, 'GarmentSpine');
  const chestGroup = attachGroup(metrics.chest, 'GarmentChest');

  const yTop = metrics.yNeckFromChest * necklineHeightFrac;
  const yBottomInChest = -(metrics.yChestFromSpine + metrics.ySpineFromHips * 0.65);
  const yWaistInChest = -metrics.yChestFromSpine * 0.45;
  const yBustInChest = yTop * 0.48;

  // 1. Continuous sculpted upper-torso & waist bodice attached to `chest` (spans ALL the way down to hips + up to neckline — ZERO torso gap or belly/back bleed-through!)
  if (chestGroup) {
    const bodiceGeo = createContouredTorsoLathe({
      profile: [
        [0.120 * scaleX, yBottomInChest],
        [0.112 * scaleX, yWaistInChest],
        [0.114 * scaleX, 0.0],
        [0.121 * scaleX, yBustInChest],
        [0.112 * scaleX, yTop * 0.82],
        [necklineHeightFrac > 0.78 ? 0.094 * scaleX : 0.104 * scaleX, yTop],
        [necklineHeightFrac > 0.78 ? 0.064 * scaleX : 0.088 * scaleX, yTop + 0.008],
      ],
      scaleX: 1.09,
      scaleZ: 0.94 * scaleZ,
      bustCenterY: yBustInChest,
      bustBoost,
      frontBellyBoost: 0.010,
      rearGluteY: yBottomInChest,
      rearGluteBoost: 0.012,
      fwdSign,
      segments: 30,
    });
    chestGroup.add(new THREE.Mesh(bodiceGeo, topMat));
  }

  // 2. Sculpted pelvis / hip brief shell attached to `hips` (full rear-glute & side-hip wrap so skin & underwear NEVER clip through front, sides, or back!)
  if (hipsGroup) {
    const hipTopY = metrics.ySpineFromHips + metrics.yChestFromSpine * 0.52;
    const pelvisGeo = createContouredTorsoLathe({
      profile: [
        [0.068 * scaleX, -0.102],
        [0.114 * scaleX, -0.072],
        [0.132 * scaleX, -0.025],
        [0.128 * scaleX, 0.025],
        [0.116 * scaleX, metrics.ySpineFromHips * 0.95],
        [0.112 * scaleX, hipTopY],
      ],
      scaleX: 1.13,
      scaleZ: 1.04 * scaleZ,
      bustBoost: 0,
      frontBellyBoost: 0.008,
      rearGluteY: -0.02,
      rearGluteBoost: 0.022,
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
    const { chestGroup, hipsGroup, topNeckY } = addSculptedTorso({
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.15,
      scaleZ: 1.16,
      necklineHeightFrac: 0.88,
      bustBoost: 0.018,
      fwdSign,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.18 });
    addLegPants({ vrm, mat: bottomMat, cuffMat: bottomAccentMat, looseFactor: 1.08, fwdSign });

    if (chestGroup) {
      // Plush 3D Hood resting behind her neck & shoulders (never clipping chin!)
      const hood = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.036, 12, 24), topMat);
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
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.095, 0.035), topAccentMat);
      pocket.position.set(0, -metrics.yChestFromSpine * 0.62, 0.098 * fwdSign);
      chestGroup.add(pocket);
    }
    if (hipsGroup) {
      const hoodieHem = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.136,
          bottomRadius: 0.156,
          height: 0.16,
          pleatCount: 0,
          scaleX: 1.15,
          scaleZ: 1.08,
        }),
        topMat
      );
      hoodieHem.position.set(0, 0.015, 0);
      const ribBand = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.015, 10, 28), topAccentMat);
      ribBand.rotation.x = Math.PI / 2;
      ribBand.scale.set(1.15, 1.08, 1);
      ribBand.position.set(0, -0.065, 0);
      hipsGroup.add(hoodieHem, ribBand);
    }
  } else if (garmentStyle === 'summer_sundress') {
    addExposedSkinUnderlay({
      vrm,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'below_cap',
      collarboneBridge: true,
      upperThighs: true,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest } = addSculptedTorso({
      metrics,
      topMat,
      hipsMat: topMat,
      scaleX: 1.02,
      scaleZ: 1.0,
      necklineHeightFrac: 0.64,
      bustBoost: 0.026,
      fwdSign,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'cap', looseFactor: 0.96 });

    if (chestGroup) {
      // Delicate sundress shoulder straps bridging smoothly over collarbone
      for (const sx of [-0.072, 0.072]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.085, 0.082), topAccentMat);
        strap.position.set(sx, topNeckY + 0.032, 0);
        chestGroup.add(strap);
      }
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.008, 10, 28), topAccentMat);
      trim.rotation.x = Math.PI / 2;
      trim.scale.set(1.07, 0.85, 1);
      trim.position.set(0, topNeckY, 0.004 * fwdSign);
      chestGroup.add(trim);

      // Waist ribbon sash + cute front bow
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.109, 0.014, 10, 28), accMat);
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1.07, 0.86, 1);
      belt.position.set(0, waistYInChest, 0);
      const bow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), accMat);
      bow.scale.set(1.75, 0.85, 0.65);
      bow.position.set(0, waistYInChest, 0.098 * fwdSign);
      chestGroup.add(belt, bow);
    }
    if (hipsGroup) {
      // Graceful flared pleated anime midi sundress skirt!
      const skirt = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.114,
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
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'none',
      upperThighs: true,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest } = addSculptedTorso({
      metrics,
      topMat: whiteMat,
      hipsMat: bottomMat,
      scaleX: 1.02,
      scaleZ: 1.02,
      necklineHeightFrac: 0.84,
      bustBoost: 0.022,
      fwdSign,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.12 });
    addLegPants({
      vrm,
      mat: bottomMat,
      cuffMat: bottomAccentMat,
      shortsOnly: true,
      looseFactor: 1.04,
      fwdSign,
    });

    if (chestGroup) {
      // Open-front cropped bomber jacket sculpted outer shell wrapping back & sides cleanly
      const jacketBack = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.116,
          bottomRadius: 0.112,
          height: topNeckY - waistYInChest + 0.02,
          pleatCount: 0,
          scaleX: 1.12,
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

      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.016, 10, 24), topAccentMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, topNeckY, -0.004 * fwdSign);
      chestGroup.add(collar);
    }
    if (hipsGroup) {
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.116, 0.013, 10, 28), accMat);
      belt.rotation.x = Math.PI / 2;
      belt.scale.set(1.07, 0.86, 1);
      belt.position.set(0, 0.032, 0);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.016), goldMat);
      buckle.position.set(0, 0.032, 0.108 * fwdSign);
      hipsGroup.add(belt, buckle);
    }
  } else if (garmentStyle === 'sporty_tee_leggings') {
    addExposedSkinUnderlay({
      vrm,
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'forearms_only',
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY } = addSculptedTorso({
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.02,
      scaleZ: 1.0,
      necklineHeightFrac: 0.84,
      bustBoost: 0.024,
      fwdSign,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'short', looseFactor: 1.02 });
    addLegPants({
      vrm,
      mat: bottomMat,
      stripeMat: bottomAccentMat,
      looseFactor: 0.95,
      fwdSign,
    });

    if (chestGroup) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.01, 10, 24), topAccentMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, topNeckY + 0.004, 0);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.026, 0.014), topAccentMat);
      stripe.position.set(0, topNeckY * 0.46, 0.095 * fwdSign);
      chestGroup.add(collar, stripe);
    }
    if (hipsGroup) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.116, 0.015, 10, 28), bottomAccentMat);
      band.rotation.x = Math.PI / 2;
      band.scale.set(1.06, 0.85, 1);
      band.position.set(0, 0.028, 0);
      hipsGroup.add(band);
    }
  } else if (garmentStyle === 'kimono_yukata') {
    const { chestGroup, hipsGroup, topNeckY, waistYInChest } = addSculptedTorso({
      metrics,
      topMat,
      hipsMat: topMat,
      scaleX: 1.06,
      scaleZ: 1.05,
      necklineHeightFrac: 0.86,
      bustBoost: 0.016,
      fwdSign,
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
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'upper_only',
      collarboneBridge: true,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest } = addSculptedTorso({
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.02,
      scaleZ: 1.0,
      necklineHeightFrac: 0.62,
      bustBoost: 0.028,
      fwdSign,
    });
    addArmSleeves({ vrm, mat: accMat, cuffMat: goldMat, mode: 'gloves', looseFactor: 0.98 });

    if (chestGroup) {
      // Dynamic off-shoulder satin shawl: sleek profile + real-time upper-arm conformity so it NEVER slices through biceps!
      const shawl = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.013, 14, 40), topAccentMat);
      shawl.rotation.x = Math.PI / 2;
      shawl.scale.set(1.12, 0.74, 1);
      shawl.position.set(0, topNeckY - 0.006, 0.004 * fwdSign);
      registerDynamicCollarRing(shawl, fwdSign, 0.046);

      const corsage = new THREE.Mesh(new THREE.TorusGeometry(0.109, 0.013, 10, 28), goldMat);
      corsage.rotation.x = Math.PI / 2;
      corsage.scale.set(1.07, 0.86, 1);
      corsage.position.set(0, waistYInChest, 0);
      chestGroup.add(shawl, corsage);
    }
    if (hipsGroup) {
      const outerGown = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.115,
          bottomRadius: 0.42,
          height: 0.80,
          pleatCount: 20,
          pleatDepth: 0.018,
          flarePower: 0.78,
        }),
        bottomMat
      );
      outerGown.position.set(0, -0.38, 0);
      registerDynamicSkirtMesh(outerGown, 0.80, fwdSign);

      const peplum = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.120,
          bottomRadius: 0.24,
          height: 0.22,
          pleatCount: 14,
          pleatDepth: 0.014,
        }),
        topAccentMat
      );
      peplum.position.set(0, -0.09, 0);
      registerDynamicSkirtMesh(peplum, 0.22, fwdSign);
      hipsGroup.add(outerGown, peplum);
    }
  } else if (garmentStyle === 'cozy_pajamas') {
    const { chestGroup, hipsGroup, topNeckY } = addSculptedTorso({
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.08,
      scaleZ: 1.08,
      necklineHeightFrac: 0.85,
      bustBoost: 0.018,
      fwdSign,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: whiteMat, mode: 'full', looseFactor: 1.1 });
    addLegPants({ vrm, mat: bottomMat, cuffMat: whiteMat, looseFactor: 1.12, fwdSign });

    if (chestGroup) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.013, 10, 24), whiteMat);
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
    if (hipsGroup) {
      const shirtHem = new THREE.Mesh(
        createSculptedSkirtGeometry({
          topRadius: 0.134,
          bottomRadius: 0.156,
          height: 0.16,
          pleatCount: 0,
          scaleX: 1.15,
          scaleZ: 1.08,
        }),
        topMat
      );
      shirtHem.position.set(0, 0.01, 0);
      hipsGroup.add(shirtHem);
    }
  } else if (garmentStyle === 'school_blazer') {
    const { chestGroup, hipsGroup, topNeckY } = addSculptedTorso({
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.06,
      scaleZ: 1.06,
      necklineHeightFrac: 0.85,
      bustBoost: 0.020,
      fwdSign,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.05 });

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
    const { chestGroup, hipsGroup, topNeckY, waistYInChest } = addSculptedTorso({
      metrics,
      topMat,
      hipsMat: bottomMat,
      scaleX: 1.11,
      scaleZ: 1.11,
      necklineHeightFrac: 0.87,
      bustBoost: 0.018,
      fwdSign,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.12 });
    addLegPants({ vrm, mat: bottomMat, looseFactor: 1.0, fwdSign });

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
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'full',
      collarboneBridge: true,
      upperThighs: true,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY } = addSculptedTorso({
      metrics,
      topMat: towelMat,
      hipsMat: towelMat,
      scaleX: 1.08,
      scaleZ: 1.07,
      necklineHeightFrac: 0.62,
      bustBoost: 0.024,
      fwdSign,
    });

    if (chestGroup) {
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
      metrics,
      skinHex: avatarSkinHex,
      armMode: 'full',
      collarboneBridge: true,
      upperThighs: true,
      fwdSign,
    });
    const { chestGroup, hipsGroup, topNeckY, waistYInChest } = addSculptedTorso({
      metrics,
      topMat: swimMat,
      hipsMat: swimMat,
      scaleX: 0.99,
      scaleZ: 0.98,
      necklineHeightFrac: 0.60,
      bustBoost: 0.028,
      fwdSign,
    });

    if (chestGroup) {
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
