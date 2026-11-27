import * as THREE from 'three';
import { MToonMaterial, type VRM } from '@pixiv/three-vrm';
import type { HairStyleId } from '../types/studio';

export interface HairStyleMeta {
  id: HairStyleId;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
  /** Whether to hide native extra-long back/twintail sub-meshes if separated on the VRM */
  replacesBackExtensions: boolean;
}

export const HAIR_STYLE_ORDER: HairStyleId[] = [
  'default',
  'high_ponytail',
  'twin_tails',
  'twin_buns',
  'side_braid',
  'long_wavy',
  'drill_twintails',
  'bob_cut',
  'ahoge_clips',
];

export const HAIR_STYLE_META: Record<HairStyleId, HairStyleMeta> = {
  default: {
    id: 'default',
    label: 'Original VRM Hair',
    shortLabel: 'Original',
    emoji: '✨',
    description: 'Native hairstyle built into the loaded 3D model',
    replacesBackExtensions: false,
  },
  high_ponytail: {
    id: 'high_ponytail',
    label: 'High Ponytail',
    shortLabel: 'Ponytail',
    emoji: '🎀',
    description: 'Sleek high-tied ponytail with ribbon & flowing layers',
    replacesBackExtensions: true,
  },
  twin_tails: {
    id: 'twin_tails',
    label: 'Idol Twin-Tails',
    shortLabel: 'Twin-Tails',
    emoji: '🌟',
    description: 'Long energetic dual pigtails with matching ties',
    replacesBackExtensions: true,
  },
  twin_buns: {
    id: 'twin_buns',
    label: 'Cute Twin Buns',
    shortLabel: 'Twin Buns',
    emoji: '🍡',
    description: 'Playful double side buns (odango) with fluttering ribbons',
    replacesBackExtensions: true,
  },
  side_braid: {
    id: 'side_braid',
    label: 'Side-Swept Braid',
    shortLabel: 'Side Braid',
    emoji: '🌿',
    description: 'Soft woven side braid draped over one shoulder',
    replacesBackExtensions: true,
  },
  long_wavy: {
    id: 'long_wavy',
    label: 'Long Wavy Cascade',
    shortLabel: 'Long Waves',
    emoji: '🌊',
    description: 'Lush flowing waves down the back with side locks',
    replacesBackExtensions: false,
  },
  drill_twintails: {
    id: 'drill_twintails',
    label: 'Anime Twin Drills',
    shortLabel: 'Twin Drills',
    emoji: '🌀',
    description: 'Iconic princess spiral twin-drill curls',
    replacesBackExtensions: true,
  },
  bob_cut: {
    id: 'bob_cut',
    label: 'Chic Short Bob',
    shortLabel: 'Short Bob',
    emoji: '✂️',
    description: 'Neat chin-length bob silhouette with soft curved side locks',
    replacesBackExtensions: true,
  },
  ahoge_clips: {
    id: 'ahoge_clips',
    label: 'Bouncy Ahoge + Clips',
    shortLabel: 'Ahoge',
    emoji: '💫',
    description: 'Playful bouncing top ahoge strand with pastel hairpins',
    replacesBackExtensions: false,
  },
};

export const HAIR_COLOR_SWATCHES: {
  id: string;
  label: string;
  hex: string | null;
  highlightHex: string | null;
}[] = [
  { id: 'natural', label: 'Original', hex: null, highlightHex: null },
  { id: 'sakura', label: 'Sakura Pink', hex: '#f4a5c4', highlightHex: '#ffe4ef' },
  { id: 'lavender', label: 'Silver Lavender', hex: '#c8b6ff', highlightHex: '#eef2ff' },
  { id: 'midnight', label: 'Midnight Blue', hex: '#23326b', highlightHex: '#60a5fa' },
  { id: 'mint', label: 'Idol Teal', hex: '#38bdf8', highlightHex: '#99f6e4' },
  { id: 'blonde', label: 'Honey Blonde', hex: '#f3d08a', highlightHex: '#fffbeb' },
  { id: 'crimson', label: 'Crimson Wine', hex: '#881337', highlightHex: '#fb7185' },
  { id: 'obsidian', label: 'Jet Black', hex: '#181826', highlightHex: '#6366f1' },
];

const HAIR_RIG_TAG = '__zeta_procedural_hair__';
const SWAY_NODE_TAG = '__zeta_hair_sway__';
const NATIVE_HAIR_HIDDEN_TAG = '__zeta_hair_hidden_by_rig__';

// Matches ONLY optional secondary hair extensions (never bangs/front/base scalp so avatar never looks bald)
const REPLACEABLE_HAIR_SUBMESH_REGEX =
  /(twintail|twin_tail|ponytail|pony_tail|backhair|back_hair|longhair|long_hair|hair_back|hair_tail|pigtail|braid|odango|bun)/i;
const PROTECTED_HAIR_SUBMESH_REGEX =
  /(bang|front|base|scalp|top|crown|side)/i;

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) std.map.dispose();
        m.dispose();
      }
    }
  });
}

function clearExistingHairRig(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj.userData?.[HAIR_RIG_TAG]) {
      toRemove.push(obj);
    }
  });
  for (const node of toRemove) {
    node.parent?.remove(node);
    disposeObjectTree(node);
  }
}

/**
 * Restores any native sub-meshes hidden by a previous hairstyle, then optionally hides
 * replaceable back/tail sub-meshes when switching to a contrasting silhouette.
 */
function updateNativeHairSubmeshVisibility(
  root: THREE.Object3D,
  replacesBackExtensions: boolean
): void {
  const hairMeshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData?.[HAIR_RIG_TAG]) return;
    const matName = Array.isArray(obj.material)
      ? obj.material.map((m) => m?.name || '').join(' ')
      : obj.material?.name || '';
    const fullName = `${obj.name} ${matName}`;
    if (/hair|twintail|ponytail|bangs|ahoge/i.test(fullName)) {
      hairMeshes.push(obj);
    }
  });

  // Always restore previously hidden native meshes first
  for (const mesh of hairMeshes) {
    if (mesh.userData?.[NATIVE_HAIR_HIDDEN_TAG]) {
      mesh.visible = true;
      delete mesh.userData[NATIVE_HAIR_HIDDEN_TAG];
    }
  }

  // Only hide secondary tail/back sub-meshes if the model actually has MULTIPLE hair meshes
  // (so single-mesh VRoid hair is never accidentally hidden).
  if (!replacesBackExtensions || hairMeshes.length <= 1) return;

  let hiddenCount = 0;
  for (const mesh of hairMeshes) {
    if (hiddenCount >= hairMeshes.length - 1) break;
    const matName = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m?.name || '').join(' ')
      : mesh.material?.name || '';
    const fullName = `${mesh.name} ${matName}`;
    if (
      REPLACEABLE_HAIR_SUBMESH_REGEX.test(fullName) &&
      !PROTECTED_HAIR_SUBMESH_REGEX.test(fullName)
    ) {
      mesh.visible = false;
      mesh.userData[NATIVE_HAIR_HIDDEN_TAG] = true;
      hiddenCount += 1;
    }
  }
}

/**
 * Samples the loaded VRM's existing hair color so procedural hair extensions blend seamlessly.
 */
export function sampleNativeHairColorHex(root: THREE.Object3D, fallbackHex = '#4f6d82'): string {
  let sampledColor: THREE.Color | null = null;
  let hairTexMap: THREE.Texture | null = null;

  root.traverse((obj) => {
    if (hairTexMap || !(obj instanceof THREE.Mesh) || obj.userData?.[HAIR_RIG_TAG]) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      const hay = `${obj.name} ${m.name || ''}`;
      if (!/hair|bang|twintail|ponytail/i.test(hay)) continue;
      const anyMat = m as unknown as { color?: THREE.Color; map?: THREE.Texture | null };
      if (!hairTexMap && anyMat.map) {
        hairTexMap = anyMat.map;
      }
      if (!sampledColor && anyMat.color instanceof THREE.Color) {
        const hsl = { h: 0, s: 0, l: 0 };
        anyMat.color.getHSL(hsl);
        if (hsl.l < 0.94 || hsl.s > 0.06) {
          sampledColor = anyMat.color.clone();
        }
      }
    }
  });

  // Sample median hair pixel directly from the VRM's hair texture so teal/pastel/blonde VRoid hair matches accurately!
  if (hairTexMap && typeof document !== 'undefined') {
    const img = (hairTexMap as THREE.Texture).image as
      | HTMLImageElement
      | HTMLCanvasElement
      | ImageBitmap
      | undefined;
    const w = img ? (img as HTMLImageElement).naturalWidth || img.width || 0 : 0;
    const h = img ? (img as HTMLImageElement).naturalHeight || img.height || 0 : 0;
    if (img && w > 8 && h > 8) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, 32, 32);
          const data = ctx.getImageData(0, 0, 32, 32).data;
          const pixels: Array<{ r: number; g: number; b: number; lum: number }> = [];
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const lum = r * 0.3 + g * 0.59 + b * 0.11;
            if (a > 220 && lum > 24 && lum < 238) {
              pixels.push({ r, g, b, lum });
            }
          }
          if (pixels.length >= 6) {
            pixels.sort((a, b) => a.lum - b.lum);
            const mid = pixels.slice(
              Math.floor(pixels.length * 0.35),
              Math.max(Math.floor(pixels.length * 0.65), Math.floor(pixels.length * 0.35) + 3)
            );
            let rs = 0;
            let gs = 0;
            let bs = 0;
            for (const p of mid) {
              rs += p.r;
              gs += p.g;
              bs += p.b;
            }
            const col = new THREE.Color(rs / mid.length / 255, gs / mid.length / 255, bs / mid.length / 255);
            if (sampledColor) col.multiply(sampledColor);
            return `#${col.getHexString()}`;
          }
        }
      } catch {
        // Fallback below
      }
    }
  }

  return sampledColor ? `#${(sampledColor as THREE.Color).getHexString()}` : fallbackHex;
}

/**
 * Generates a vertical silky anime hair gradient + strand sheen CanvasTexture.
 */
function createAnimeHairTexture(baseHex: string, highlightHex?: string | null): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const base = new THREE.Color(baseHex);
  const rootColor = base.clone().multiplyScalar(0.74);
  const tipColor = highlightHex
    ? new THREE.Color(highlightHex)
    : base.clone().lerp(new THREE.Color('#ffffff'), 0.22);

  // Vertical root -> mid -> tip ombre gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, `#${rootColor.getHexString()}`);
  grad.addColorStop(0.28, `#${base.getHexString()}`);
  grad.addColorStop(0.68, `#${base.getHexString()}`);
  grad.addColorStop(1.0, `#${tipColor.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);

  // Fine vertical hair strands
  for (let x = 0; x < 128; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(x, 0, 2, 256);
  }

  // Iconic anime halo sheen highlight band
  const sheen = ctx.createLinearGradient(0, 56, 0, 96);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 56, 128, 40);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Creates a smooth tapered anime hair strand mesh along a 3D CatmullRomCurve3.
 */
function createTaperedStrandMesh(
  points: THREE.Vector3[],
  baseRadius: number,
  material: THREE.Material,
  radialSegments = 8,
  tubularSegments = 18
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, baseRadius, radialSegments, false);
  const pos = geo.attributes.position;
  const center = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, center);
    // Smooth taper: slight fullness near upper third, crisp anime tip at t=1
    const scale = Math.max(0.06, Math.sin(Math.min(1, t * 0.85 + 0.15) * Math.PI) * (1 - t * 0.65) + (1 - t) * 0.35);
    for (let j = 0; j <= radialSegments; j++) {
      const idx = i * (radialSegments + 1) + j;
      vertex.fromBufferAttribute(pos, idx);
      vertex.sub(center).multiplyScalar(scale).add(center);
      pos.setXYZ(idx, vertex.x, vertex.y, vertex.z);
    }
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function createHairTie(colorHex: string, radius = 0.024): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: 0.15,
    roughness: 0.35,
    metalness: 0.2,
  });
  return new THREE.Mesh(new THREE.TorusGeometry(radius, 0.0085, 10, 20), mat);
}

function markSwayNode(
  node: THREE.Object3D,
  phase: number,
  ampZ: number,
  ampX: number
): void {
  node.userData[SWAY_NODE_TAG] = {
    baseRotX: node.rotation.x,
    baseRotZ: node.rotation.z,
    phase,
    ampZ,
    ampX,
  };
}

interface HeadClearanceBounds {
  halfW: number;
  frontZ: number;
  backZ: number;
  topY: number;
}

/**
 * Dynamically measures the VRM's actual head + hair bounding envelope in head-bone local space
 * so side locks, braids, buns, twin-tails, and hairpins always sit cleanly OUTSIDE ears & hair
 * without clipping (while keeping VRM head proportions completely unlocked!).
 */
function measureHeadClearanceBounds(
  vrm: VRM | null,
  avatarRoot: THREE.Object3D,
  headBone: THREE.Object3D | null,
  fwdSign: number
): HeadClearanceBounds {
  const fallback: HeadClearanceBounds = {
    halfW: 0.118,
    frontZ: 0.105,
    backZ: 0.115,
    topY: 0.215,
  };
  if (!headBone) return fallback;

  headBone.updateWorldMatrix(true, false);
  const invHead = new THREE.Matrix4().copy(headBone.matrixWorld).invert();
  const worldP = new THREE.Vector3();
  const localP = new THREE.Vector3();
  const xs: number[] = [];
  const zFronts: number[] = [];
  const zBacks: number[] = [];
  const ys: number[] = [];

  avatarRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj.userData?.[HAIR_RIG_TAG]) return;
    if (obj.userData?.__zeta_procedural_accessory__ || obj.userData?.__zeta_procedural_garment__) return;
    const matNames = (Array.isArray(obj.material) ? obj.material : [obj.material])
      .map((m) => m?.name || '')
      .join(' ');
    const hay = `${obj.name} ${matNames}`;
    if (!/face|head|hair|ear/i.test(hay)) return;

    const pos = obj.geometry?.attributes?.position;
    if (!pos) return;
    obj.updateWorldMatrix(true, false);
    const step = Math.max(1, Math.floor(pos.count / 320));
    for (let i = 0; i < pos.count; i += step) {
      worldP.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      localP.copy(worldP).applyMatrix4(invHead);
      // Sample around skull/ear/cheek region (exclude long hanging hair tails below chin)
      if (localP.y < -0.02 || localP.y > 0.32) continue;
      const ax = Math.abs(localP.x);
      const az = Math.abs(localP.z);
      if (ax > 0.22 || az > 0.22) continue;
      if (localP.y >= 0.02 && localP.y <= 0.18) {
        xs.push(ax);
        const zf = localP.z * fwdSign;
        if (zf > 0) zFronts.push(zf);
        else zBacks.push(-zf);
      }
      ys.push(localP.y);
    }
  });

  const pct = (arr: number[], q: number, fb: number, minV: number, maxV: number) => {
    if (arr.length < 8) return fb;
    arr.sort((a, b) => a - b);
    return THREE.MathUtils.clamp(arr[Math.min(arr.length - 1, Math.floor(arr.length * q))], minV, maxV);
  };

  // Extra margin when vrm has native hair/ears
  const extraW = vrm ? 0.008 : 0.006;
  return {
    halfW: pct(xs, 0.94, fallback.halfW, 0.095, 0.165) + extraW,
    frontZ: pct(zFronts, 0.94, fallback.frontZ, 0.085, 0.155),
    backZ: pct(zBacks, 0.94, fallback.backZ, 0.090, 0.165),
    topY: pct(ys, 0.96, fallback.topY, 0.185, 0.275),
  };
}

function buildHairStyleGroup(params: {
  style: HairStyleId;
  hairHex: string;
  highlightHex?: string | null;
  tieHex: string;
  fwdSign: number;
  headBounds: HeadClearanceBounds;
}): THREE.Group {
  const { style, hairHex, highlightHex, tieHex, fwdSign, headBounds } = params;
  const group = new THREE.Group();
  group.name = `ProceduralHair_${style}`;
  group.userData[HAIR_RIG_TAG] = true;

  const hairTex = createAnimeHairTexture(hairHex, highlightHex);
  const baseCol = new THREE.Color(hairHex);
  const hairMat = new MToonMaterial({
    color: hairTex ? new THREE.Color('#ffffff') : baseCol,
    shadeColorFactor: (hairTex ? new THREE.Color('#dce2ea') : baseCol.clone()).multiplyScalar(0.78),
    shadingToonyFactor: 0.72,
    shadingShiftFactor: -0.05,
    map: hairTex || undefined,
    side: THREE.DoubleSide,
  });
  const backZ = -fwdSign;
  const sideClearX = headBounds.halfW + 0.012;
  const backClearZ = headBounds.backZ + 0.010;
  const crownY = headBounds.topY;

  if (style === 'high_ponytail') {
    const anchor = new THREE.Group();
    anchor.position.set(0, crownY * 0.78, backClearZ * backZ);

    const tie = createHairTie(tieHex, 0.028);
    tie.rotation.x = Math.PI / 2 - 0.35 * fwdSign;
    anchor.add(tie);

    const swayRoot = new THREE.Group();
    const strandOffsets: Array<{ dx: number; spreadZ: number; len: number; r: number }> = [
      { dx: 0, spreadZ: 0.12, len: 0.46, r: 0.044 },
      { dx: -0.024, spreadZ: 0.10, len: 0.42, r: 0.032 },
      { dx: 0.024, spreadZ: 0.10, len: 0.42, r: 0.032 },
      { dx: -0.042, spreadZ: 0.075, len: 0.35, r: 0.024 },
      { dx: 0.042, spreadZ: 0.075, len: 0.35, r: 0.024 },
    ];
    for (const s of strandOffsets) {
      const pts = [
        new THREE.Vector3(s.dx * 0.25, 0.005, 0),
        new THREE.Vector3(s.dx * 0.9, 0.028, s.spreadZ * 0.72 * backZ),
        new THREE.Vector3(s.dx * 1.35, -s.len * 0.35, s.spreadZ * 1.15 * backZ),
        new THREE.Vector3(s.dx * 1.1, -s.len * 0.75, s.spreadZ * 0.92 * backZ),
        new THREE.Vector3(s.dx * 0.75, -s.len, s.spreadZ * 0.68 * backZ),
      ];
      swayRoot.add(createTaperedStrandMesh(pts, s.r, hairMat));
    }
    markSwayNode(swayRoot, 0.2, 0.055, 0.04);
    anchor.add(swayRoot);
    group.add(anchor);
  } else if (style === 'twin_tails') {
    for (const side of [-1, 1]) {
      const anchor = new THREE.Group();
      anchor.position.set(side * sideClearX, crownY * 0.74, (headBounds.backZ * 0.52) * backZ);

      const tie = createHairTie(tieHex, 0.024);
      tie.rotation.y = side * 0.55;
      anchor.add(tie);

      const swayRoot = new THREE.Group();
      const strands = [
        { ox: 0.075, oz: 0.03, len: 0.52, r: 0.038 },
        { ox: 0.105, oz: -0.015, len: 0.46, r: 0.028 },
        { ox: 0.045, oz: 0.065, len: 0.43, r: 0.026 },
      ];
      for (const s of strands) {
        const pts = [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(side * s.ox * 0.75, 0.018, s.oz * 0.6 * backZ),
          new THREE.Vector3(side * s.ox * 1.32, -s.len * 0.35, s.oz * 1.1 * backZ),
          new THREE.Vector3(side * s.ox * 1.18, -s.len * 0.74, s.oz * 0.9 * backZ),
          new THREE.Vector3(side * s.ox * 0.95, -s.len, s.oz * 0.55 * backZ),
        ];
        swayRoot.add(createTaperedStrandMesh(pts, s.r, hairMat));
      }
      markSwayNode(swayRoot, side > 0 ? 0 : 1.4, 0.06, 0.035);
      anchor.add(swayRoot);
      group.add(anchor);
    }
  } else if (style === 'twin_buns') {
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: tieHex,
      emissive: tieHex,
      emissiveIntensity: 0.18,
      roughness: 0.38,
    });
    for (const side of [-1, 1]) {
      const bunGroup = new THREE.Group();
      bunGroup.position.set(side * (sideClearX + 0.008), crownY * 0.88, (headBounds.backZ * 0.42) * backZ);

      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.056, 20, 16), hairMat);
      bun.scale.set(1.0, 0.94, 0.92);
      bunGroup.add(bun);

      // Braided wrap ring around base of bun
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.012, 10, 20), ribbonMat);
      wrap.rotation.y = side * Math.PI * 0.35;
      wrap.position.set(-side * 0.018, -0.012, 0);
      bunGroup.add(wrap);

      // Cute dangling ribbon tails
      const tailPivot = new THREE.Group();
      tailPivot.position.set(side * 0.015, -0.042, 0.01 * backZ);
      for (const offset of [-0.012, 0.012]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.095, 0.004), ribbonMat);
        tail.position.set(offset, -0.045, 0);
        tail.rotation.z = offset * 12;
        tailPivot.add(tail);
      }
      markSwayNode(tailPivot, side > 0 ? 0.5 : 2.1, 0.09, 0.04);
      bunGroup.add(tailPivot);
      group.add(bunGroup);
    }
  } else if (style === 'side_braid') {
    const anchor = new THREE.Group();
    anchor.position.set(sideClearX + 0.006, 0.068, (headBounds.backZ * 0.55) * backZ);

    const swayRoot = new THREE.Group();
    const beadCount = 9;
    for (let i = 0; i < beadCount; i++) {
      const t = i / (beadCount - 1);
      const r = 0.031 * (1 - t * 0.45);
      const y = -i * 0.039;
      const z = (0.045 - t * 0.135) * backZ; // sweeps forward over shoulder!
      const x = 0.018 + Math.sin(t * Math.PI) * 0.025 + (i % 2 === 0 ? -0.008 : 0.008);
      const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), hairMat);
      seg.scale.set(1.15, 0.92, 0.85);
      seg.position.set(x, y, z);
      swayRoot.add(seg);
    }

    const tipY = -(beadCount - 1) * 0.039 - 0.015;
    const tipZ = -0.09 * backZ;
    const tie = createHairTie(tieHex, 0.016);
    tie.rotation.x = Math.PI / 2;
    tie.position.set(0.02, tipY, tipZ);
    swayRoot.add(tie);

    const tuft = createTaperedStrandMesh(
      [
        new THREE.Vector3(0.02, tipY, tipZ),
        new THREE.Vector3(0.026, tipY - 0.045, tipZ - 0.012 * backZ),
        new THREE.Vector3(0.022, tipY - 0.09, tipZ - 0.005 * backZ),
      ],
      0.018,
      hairMat
    );
    swayRoot.add(tuft);
    markSwayNode(swayRoot, 0.7, 0.045, 0.035);
    anchor.add(swayRoot);
    group.add(anchor);
  } else if (style === 'long_wavy') {
    const swayRoot = new THREE.Group();
    swayRoot.position.set(0, 0.125, 0.092 * backZ);
    const columns = [-0.095, -0.06, -0.025, 0.025, 0.06, 0.095];
    columns.forEach((cx, idx) => {
      const wavePhase = idx % 2 === 0 ? 1 : -1;
      const len = 0.48 - Math.abs(cx) * 0.45;
      const pts = [
        new THREE.Vector3(cx * 0.85, 0.01, -Math.abs(cx) * 0.25 * backZ),
        new THREE.Vector3(cx * 1.1 + wavePhase * 0.012, -len * 0.28, 0.035 * backZ),
        new THREE.Vector3(cx * 1.15 - wavePhase * 0.015, -len * 0.62, 0.065 * backZ),
        new THREE.Vector3(cx * 1.05 + wavePhase * 0.012, -len, 0.04 * backZ),
      ];
      swayRoot.add(createTaperedStrandMesh(pts, 0.035, hairMat));
    });
    markSwayNode(swayRoot, 0.4, 0.035, 0.03);
    group.add(swayRoot);
  } else if (style === 'drill_twintails') {
    for (const side of [-1, 1]) {
      const anchor = new THREE.Group();
      anchor.position.set(side * (sideClearX + 0.006), crownY * 0.70, (headBounds.backZ * 0.50) * backZ);
      const tie = createHairTie(tieHex, 0.024);
      tie.rotation.y = side * 0.6;
      anchor.add(tie);

      const swayRoot = new THREE.Group();
      const helixPts: THREE.Vector3[] = [];
      const turns = 3.25;
      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = t * turns * Math.PI * 2 * side;
        const spiralR = (0.018 + Math.sin(t * Math.PI * 0.85) * 0.034) * (1 - t * 0.45);
        helixPts.push(
          new THREE.Vector3(
            side * (0.045 + t * 0.035) + Math.cos(angle) * spiralR,
            -t * 0.42,
            (0.025 + t * 0.03) * backZ + Math.sin(angle) * spiralR
          )
        );
      }
      swayRoot.add(createTaperedStrandMesh(helixPts, 0.028, hairMat, 8, 34));
      markSwayNode(swayRoot, side > 0 ? 0.3 : 1.9, 0.055, 0.035);
      anchor.add(swayRoot);
      group.add(anchor);
    }
  } else if (style === 'bob_cut') {
    // Sleek chin-length bob curved side locks positioned cleanly OUTSIDE ear & cheek bounding radius (zero ear clipping!)
    const sideOuterX = sideClearX + 0.012;
    for (const side of [-1, 1]) {
      const pts = [
        new THREE.Vector3(side * (sideOuterX - 0.010), crownY * 0.62, 0.012 * backZ),
        new THREE.Vector3(side * (sideOuterX + 0.010), 0.055, 0.018 * fwdSign),
        new THREE.Vector3(side * (sideOuterX - 0.002), -0.022, 0.036 * fwdSign),
        new THREE.Vector3(side * (sideOuterX - 0.030), -0.056, 0.044 * fwdSign),
      ];
      group.add(createTaperedStrandMesh(pts, 0.020, hairMat));
    }
    for (const cx of [-0.065, -0.022, 0.022, 0.065]) {
      const pts = [
        new THREE.Vector3(cx, crownY * 0.60, backClearZ * backZ),
        new THREE.Vector3(cx * 1.08, 0.035, (backClearZ + 0.020) * backZ),
        new THREE.Vector3(cx * 0.92, -0.045, (backClearZ - 0.010) * backZ),
      ];
      group.add(createTaperedStrandMesh(pts, 0.026, hairMat));
    }
  } else if (style === 'ahoge_clips') {
    // Bouncy top ahoge + cute twin hairpins anchored cleanly outside bangs/head surface
    const ahogePivot = new THREE.Group();
    ahogePivot.position.set(0.008, crownY + 0.004, 0.015 * fwdSign);
    const ahogePts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.018, 0.055, 0.012 * fwdSign),
      new THREE.Vector3(0.052, 0.078, 0.024 * fwdSign),
      new THREE.Vector3(0.072, 0.048, 0.018 * fwdSign),
    ];
    ahogePivot.add(createTaperedStrandMesh(ahogePts, 0.012, hairMat, 7, 14));
    markSwayNode(ahogePivot, 0.0, 0.12, 0.08);
    group.add(ahogePivot);

    const clipMat = new THREE.MeshStandardMaterial({
      color: tieHex,
      emissive: tieHex,
      emissiveIntensity: 0.3,
      roughness: 0.25,
      metalness: 0.5,
    });
    for (let i = 0; i < 2; i++) {
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.007, 0.006), clipMat);
      clip.position.set(
        headBounds.halfW * 0.68 + i * 0.005,
        crownY * 0.64 - i * 0.014,
        (headBounds.frontZ + 0.008) * fwdSign
      );
      clip.rotation.z = -0.32 + i * 0.12;
      clip.rotation.y = 0.55 * fwdSign;
      group.add(clip);
    }
  }

  return group;
}

/**
 * Syncs the selected / AI-chosen 3D procedural hairstyle onto the VRM head bone,
 * automatically matching the avatar's hair color (or applying custom dye/highlight)
 * and cleaning up replaceable back-hair sub-meshes when switching silhouettes.
 */
export function syncProceduralHairStyleToVrm(params: {
  vrm: VRM | null;
  avatarRoot: THREE.Object3D;
  hairStyle?: HairStyleId;
  hairColorHex?: string | null;
  hairHighlightHex?: string | null;
  tieAccentHex?: string;
}): void {
  const {
    vrm,
    avatarRoot,
    hairStyle = 'default',
    hairColorHex = null,
    hairHighlightHex = null,
    tieAccentHex = '#f472b6',
  } = params;

  clearExistingHairRig(avatarRoot);
  const meta = HAIR_STYLE_META[hairStyle] || HAIR_STYLE_META.default;
  updateNativeHairSubmeshVisibility(avatarRoot, meta.replacesBackExtensions);

  if (hairStyle === 'default') return;

  const isVrm0 = vrm?.meta?.metaVersion === '0';
  const fwdSign = isVrm0 ? -1 : 1;
  const resolvedHairHex = hairColorHex || sampleNativeHairColorHex(avatarRoot, '#3b4d63');

  const headBone =
    vrm?.humanoid?.getRawBoneNode('head') ||
    vrm?.humanoid?.getNormalizedBoneNode('head') ||
    null;

  const headBounds = measureHeadClearanceBounds(vrm, avatarRoot, headBone, fwdSign);

  const hairGroup = buildHairStyleGroup({
    style: hairStyle,
    hairHex: resolvedHairHex,
    highlightHex: hairHighlightHex,
    tieHex: tieAccentHex,
    fwdSign,
    headBounds,
  });

  if (headBone) {
    headBone.add(hairGroup);
  } else {
    hairGroup.position.set(0, 1.44, 0);
    avatarRoot.add(hairGroup);
  }
}

/**
 * Subtle real-time hair physics sway for procedural ponytails, twin-tails, braids, and ahoge.
 */
export function updateProceduralHairSway(avatarRoot: THREE.Object3D | null, elapsed: number): void {
  if (!avatarRoot) return;
  avatarRoot.traverse((obj) => {
    const sway = obj.userData?.[SWAY_NODE_TAG] as
      | { baseRotX: number; baseRotZ: number; phase: number; ampZ: number; ampX: number }
      | undefined;
    if (!sway) return;
    obj.rotation.z = sway.baseRotZ + Math.sin(elapsed * 2.1 + sway.phase) * sway.ampZ;
    obj.rotation.x = sway.baseRotX + Math.cos(elapsed * 1.65 + sway.phase * 0.7) * sway.ampX;
  });
}
