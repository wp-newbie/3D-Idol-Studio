import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type {
  AiMakeupConfig,
  BeautyMarkKind,
  MakeupArchetype,
  MoodType,
  Persona,
} from '../types/studio';

export type { BeautyMarkKind, MakeupArchetype };

export const CANONICAL_MAKEUP_PRESETS: Record<MakeupArchetype, AiMakeupConfig> = {
  gothic_diva: {
    styleId: 'gothic_diva',
    label: 'Crimson Nocturne Gothic (Miku)',
    eyelinerColorHex: '#08080f',
    eyelinerStyle: 'dramatic_gothic',
    eyeshadowColorHex: '#881337',
    eyeshadowIntensity: 0.58,
    blushColorHex: '#be123c',
    blushIntensity: 0.45,
    blushStyle: 'under_eye_tsundere',
    lipColorHex: '#9f1239',
    lipFinish: 'gradient_tint',
    lipIntensity: 0.72,
    beautyMark: 'heart_under_eye',
    beautyMarkColorHex: '#9f1239',
    reason: 'Theatrical gothic idol with dramatic winged liner, crimson smoky shadow, heart beauty mark & berry lips.',
  },
  natural_idol: {
    styleId: 'natural_idol',
    label: 'Soft Tsundere Idol (Yoshiko)',
    eyelinerColorHex: '#291f24',
    eyelinerStyle: 'subtle',
    eyeshadowColorHex: '#fecdd3',
    eyeshadowIntensity: 0.28,
    blushColorHex: '#fb7185',
    blushIntensity: 0.52,
    blushStyle: 'under_eye_tsundere',
    lipColorHex: '#f43f5e',
    lipFinish: 'natural',
    lipIntensity: 0.45,
    beautyMark: 'none',
    beautyMarkColorHex: '#18181b',
    reason: 'Delicate natural idol look with soft brown tightline, peach tsundere cheek flush & coral tint.',
  },
  jrock_stoic: {
    styleId: 'jrock_stoic',
    label: 'J-Rock Stoic Tightline (Ren)',
    eyelinerColorHex: '#111827',
    eyelinerStyle: 'subtle',
    eyeshadowColorHex: '#1f2937',
    eyeshadowIntensity: 0.22,
    blushColorHex: '#f43f5e',
    blushIntensity: 0.08,
    blushStyle: 'subtle_glow',
    lipColorHex: '#78350f',
    lipFinish: 'matte',
    lipIntensity: 0.25,
    beautyMark: 'none',
    beautyMarkColorHex: '#111827',
    reason: 'Sharp clean J-rock lash tightline definition and clean masculine matte finish.',
  },
  cyber_neon: {
    styleId: 'cyber_neon',
    label: 'Cyber Idol Neon Cat-Eye',
    eyelinerColorHex: '#0c0a1a',
    eyelinerStyle: 'cyber_sharp',
    eyeshadowColorHex: '#06b6d4',
    eyeshadowIntensity: 0.65,
    blushColorHex: '#f43f5e',
    blushIntensity: 0.40,
    blushStyle: 'apple_cheeks',
    lipColorHex: '#d946ef',
    lipFinish: 'gloss',
    lipIntensity: 0.65,
    beautyMark: 'cross_cheek',
    beautyMarkColorHex: '#06b6d4',
    reason: 'High-voltage cyber idol makeup with electric cyan winged shadow and cheek decal.',
  },
  pastel_fairy: {
    styleId: 'pastel_fairy',
    label: 'Pastel Fairy Sparkle',
    eyelinerColorHex: '#4a044e',
    eyelinerStyle: 'subtle',
    eyeshadowColorHex: '#f472b6',
    eyeshadowIntensity: 0.55,
    blushColorHex: '#fda4af',
    blushStyle: 'apple_cheeks',
    blushIntensity: 0.60,
    lipColorHex: '#fb7185',
    lipFinish: 'gloss',
    lipIntensity: 0.60,
    beautyMark: 'star_cheek',
    beautyMarkColorHex: '#f472b6',
    reason: 'Fluttery fairy anime eyes, soft sakura eyeshadow and sparkling cheek star.',
  },
  gyaru_glam: {
    styleId: 'gyaru_glam',
    label: 'Gyaru Glam Winged Eye',
    eyelinerColorHex: '#000000',
    eyelinerStyle: 'winged_cat',
    eyeshadowColorHex: '#a16207',
    eyeshadowIntensity: 0.50,
    blushColorHex: '#fb7185',
    blushStyle: 'high_flush',
    blushIntensity: 0.65,
    lipColorHex: '#f43f5e',
    lipFinish: 'gradient_tint',
    lipIntensity: 0.75,
    beautyMark: 'heart_under_eye',
    beautyMarkColorHex: '#e11d48',
    reason: 'Exaggerated black cat-eye liner, golden crease shadow, radiant blush and heart mark.',
  },
  vampire_nocturne: {
    styleId: 'vampire_nocturne',
    label: 'Midnight Vampire Empress',
    eyelinerColorHex: '#050508',
    eyelinerStyle: 'dramatic_gothic',
    eyeshadowColorHex: '#4c0519',
    eyeshadowIntensity: 0.70,
    blushColorHex: '#9f1239',
    blushStyle: 'under_eye_tsundere',
    blushIntensity: 0.40,
    lipColorHex: '#881337',
    lipFinish: 'gradient_tint',
    lipIntensity: 0.85,
    beautyMark: 'teardrop',
    beautyMarkColorHex: '#be123c',
    reason: 'Deep blood-wine eyeshadow, sharp elongated cat-eye and teardrop jewel.',
  },
  bare_natural: {
    styleId: 'bare_natural',
    label: 'Bare Natural / Sleepwear',
    eyelinerColorHex: '#27272a',
    eyelinerStyle: 'none',
    eyeshadowColorHex: '#ffffff',
    eyeshadowIntensity: 0.0,
    blushColorHex: '#fda4af',
    blushStyle: 'subtle_glow',
    blushIntensity: 0.20,
    lipColorHex: '#fda4af',
    lipFinish: 'natural',
    lipIntensity: 0.20,
    beautyMark: 'none',
    beautyMarkColorHex: '#18181b',
    reason: 'Clean fresh-faced bare look for lazy days and bedtime sleepwear.',
  },
};

/**
 * Returns the best default makeup style that matches the persona's character archetype,
 * title, traits, gender, and active outfit/time context.
 */
export function getDefaultMakeupForCharacter(
  persona: Persona,
  context?: { slotName?: string; occasion?: string; timePhase?: string }
): AiMakeupConfig {
  const hay = `${persona.id} ${persona.name} ${persona.title} ${persona.traits} ${persona.systemPrompt} ${context?.slotName || ''} ${context?.occasion || ''}`.toLowerCase();

  // 1. Bedtime / Pajamas / Sleepwear -> Bare Natural
  if (/sleep|pajama|bedtime|nightgown|wake_up|bath|shower/.test(hay)) {
    return { ...CANONICAL_MAKEUP_PRESETS.bare_natural };
  }

  // 2. Male Frontman / Stoic Vocalist (Kurogane Ren)
  if (persona.gender === 'male' || /male|frontman|stoic|rock_band|kurogane|ren\b/.test(hay)) {
    return { ...CANONICAL_MAKEUP_PRESETS.jrock_stoic };
  }

  // 3. Gothic / Vampire / Crimson Nocturne Virtual Diva (Hatsune Miku)
  if (/gothic|vampire|crimson|nocturne|nocturnal|dark_diva|miku\b/.test(hay)) {
    return { ...CANONICAL_MAKEUP_PRESETS.gothic_diva };
  }

  // 4. Cyber / Sci-fi / Techno Idol
  if (/cyber|neon|futuristic|tech|android|electric|rave/.test(hay)) {
    return { ...CANONICAL_MAKEUP_PRESETS.cyber_neon };
  }

  // 5. Pastel Fairy / Magical Girl
  if (/fairy|pastel|magical|sakura|sweet|angel|princess/.test(hay)) {
    return { ...CANONICAL_MAKEUP_PRESETS.pastel_fairy };
  }

  // 6. Gyaru / Street Fashion
  if (/gyaru|gal|trendy|stylish|glam|fashionista/.test(hay)) {
    return { ...CANONICAL_MAKEUP_PRESETS.gyaru_glam };
  }

  // 7. Default female anime idol (Yoshiko / Classic Tsundere)
  return { ...CANONICAL_MAKEUP_PRESETS.natural_idol };
}

interface FaceSkinSnapshot {
  originalMap: THREE.Texture | null;
  canvasTexture?: THREE.CanvasTexture | null;
  baseImage?: HTMLImageElement | ImageBitmap | HTMLCanvasElement;
}

interface EyelineSnapshot {
  colorHex: string | null;
  shadeColorHex: string | null;
}

const origFaceSkinMap = new WeakMap<THREE.Material, FaceSkinSnapshot>();
const origEyelineMap = new WeakMap<THREE.Material, EyelineSnapshot>();

function isFaceSkinMaterial(matName: string): boolean {
  if (!matName) return false;
  const n = matName.toLowerCase();
  if (/hair|eyeiris|eyewhite|eyehighlight|eyeline|brow|lash|mouth|teeth|tongue|cloth|top|bottom/.test(n)) {
    return false;
  }
  return /face.*skin|skin.*face|^face_00_skin|_face_skin|_skin_face/i.test(n);
}

function isEyelineOrLashMaterial(matName: string): boolean {
  if (!matName) return false;
  const n = matName.toLowerCase();
  return /eyeline|faceeyeline|eyelash|faceeyelash/i.test(n);
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fillColor: string,
  strokeColor?: string
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  const topCleft = -size * 0.35;
  const bottomTip = size * 0.75;
  ctx.moveTo(0, topCleft);
  // Left lobe
  ctx.bezierCurveTo(-size * 0.55, -size * 0.9, -size * 1.05, -size * 0.15, 0, bottomTip);
  // Right lobe
  ctx.bezierCurveTo(size * 1.05, -size * 0.15, size * 0.55, -size * 0.9, 0, topCleft);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(1, size * 0.14);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  fillColor: string,
  strokeColor?: string
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  const points = 4;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(1, rOuter * 0.14);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTeardrop(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fillColor: string,
  strokeColor?: string
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.85);
  ctx.bezierCurveTo(-size * 0.5, -size * 0.2, -size * 0.65, size * 0.45, 0, size * 0.85);
  ctx.bezierCurveTo(size * 0.65, size * 0.45, size * 0.5, -size * 0.2, 0, -size * 0.85);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCross(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fillColor: string
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = fillColor;
  const barW = size * 0.24;
  // Vertical bar
  ctx.fillRect(-barW / 2, -size * 0.8, barW, size * 1.6);
  // Horizontal bar
  ctx.fillRect(-size * 0.65, -size * 0.35, size * 1.3, barW);
  ctx.restore();
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Procedurally composites character-dependent AI makeup onto the VRM face skin canvas texture.
 */
function createProceduralMakeupTexture(
  baseImage: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  flipY: boolean,
  makeup: AiMakeupConfig,
  mood?: MoodType,
  affinity?: number
): THREE.CanvasTexture {
  const w = baseImage.width || 1024;
  const h = baseImage.height || 1024;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.flipY = flipY;
    return fallback;
  }

  // 1. Draw base face skin image
  ctx.drawImage(baseImage, 0, 0, w, h);

  // 2. Dynamic Cheek Blush (scales with persona mood and affinity!)
  const baseBlush = makeup.blushIntensity ?? 0.5;
  const moodBonus =
    mood === 'Flustered' ? 0.35 : mood === 'Pouty' || mood === 'Shy' ? 0.20 : mood === 'Amused' ? 0.10 : 0.0;
  const affinityBonus = Math.min(0.20, (affinity ?? 0) * 0.002);
  const totalBlushAlpha = THREE.MathUtils.clamp(baseBlush + moodBonus + affinityBonus, 0, 0.95);

  if (totalBlushAlpha > 0.04) {
    const blushHex = makeup.blushColorHex || '#fb7185';
    const isTsundere = makeup.blushStyle === 'under_eye_tsundere';
    const cheekY = isTsundere ? 0.495 * h : 0.515 * h;
    const blushRx = (isTsundere ? 0.068 : 0.055) * w;
    const blushRy = (isTsundere ? 0.038 : 0.052) * h;

    // Left cheek (u ≈ 0.64) & Right cheek (u ≈ 0.36)
    const cheekPositions = [
      { x: 0.638 * w, y: cheekY },
      { x: 0.362 * w, y: cheekY },
    ];

    for (const cp of cheekPositions) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cp.x, cp.y, blushRx, blushRy, 0, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, Math.max(blushRx, blushRy));
      grad.addColorStop(0, hexToRgba(blushHex, totalBlushAlpha * 0.65));
      grad.addColorStop(0.55, hexToRgba(blushHex, totalBlushAlpha * 0.32));
      grad.addColorStop(1, hexToRgba(blushHex, 0));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }
  }

  // 3. Anime Eyeshadow on Upper Eyelids
  const shadowIntensity = makeup.eyeshadowIntensity ?? 0.0;
  if (shadowIntensity > 0.05 && makeup.eyeshadowColorHex) {
    const shadowHex = makeup.eyeshadowColorHex;
    const shadowY = 0.442 * h;
    const shadowRx = 0.046 * w;
    const shadowRy = 0.024 * h;

    const lidPositions = [
      { x: 0.632 * w, y: shadowY },
      { x: 0.368 * w, y: shadowY },
    ];

    for (const lp of lidPositions) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(lp.x, lp.y, shadowRx, shadowRy, 0, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, Math.max(shadowRx, shadowRy));
      grad.addColorStop(0, hexToRgba(shadowHex, shadowIntensity * 0.58));
      grad.addColorStop(0.65, hexToRgba(shadowHex, shadowIntensity * 0.22));
      grad.addColorStop(1, hexToRgba(shadowHex, 0));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }
  }

  // 4. Lip Tint & Gradient Lips
  const lipIntensity = makeup.lipIntensity ?? 0.0;
  if (lipIntensity > 0.05 && makeup.lipColorHex) {
    const lipHex = makeup.lipColorHex;
    const lipX = 0.500 * w;
    const lipY = 0.680 * h;
    const lipRx = 0.038 * w;
    const lipRy = 0.017 * h;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(lipX, lipY, lipRx, lipRy, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(lipX, lipY, 0, lipX, lipY, Math.max(lipRx, lipRy));
    grad.addColorStop(0, hexToRgba(lipHex, lipIntensity * 0.70));
    grad.addColorStop(0.70, hexToRgba(lipHex, lipIntensity * 0.35));
    grad.addColorStop(1, hexToRgba(lipHex, 0));
    ctx.fillStyle = grad;
    ctx.fill();

    // Gloss highlight gleam in lower lip center
    if (makeup.lipFinish === 'gloss') {
      ctx.beginPath();
      ctx.ellipse(lipX, lipY + 0.005 * h, 0.010 * w, 0.003 * h, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fill();
    }
    ctx.restore();
  }

  // 5. Iconic Facial Decals & Beauty Marks (e.g. the cute heart under eye in Hatsune Miku screenshot!)
  const mark = makeup.beautyMark || 'none';
  if (mark !== 'none') {
    const markColor = makeup.beautyMarkColorHex || '#9f1239';
    const markX = 0.648 * w;
    const markY = 0.506 * h;
    const markSize = 0.013 * w;

    if (mark === 'heart_under_eye') {
      drawHeart(ctx, markX, markY, markSize, markColor, '#0a0a0f');
    } else if (mark === 'star_cheek') {
      drawStar(ctx, 0.655 * w, 0.520 * h, markSize * 1.1, markSize * 0.45, markColor, '#0a0a0f');
    } else if (mark === 'teardrop') {
      drawTeardrop(ctx, markX, markY, markSize, markColor, '#0a0a0f');
    } else if (mark === 'cross_cheek') {
      drawCross(ctx, 0.655 * w, 0.524 * h, markSize * 1.15, markColor);
    } else if (mark === 'classic_mole') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0.642 * w, 0.514 * h, Math.max(1.5, markSize * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = markColor || '#1c1917';
      ctx.fill();
      ctx.restore();
    }
  }

  const canvasTex = new THREE.CanvasTexture(canvas);
  canvasTex.colorSpace = THREE.SRGBColorSpace;
  canvasTex.flipY = flipY;
  canvasTex.wrapS = THREE.ClampToEdgeWrapping;
  canvasTex.wrapT = THREE.ClampToEdgeWrapping;
  canvasTex.needsUpdate = true;
  return canvasTex;
}

/**
 * Applies character-dependent AI makeup directly onto the VRM avatar's Face skin and eyeline materials.
 */
export function applyMakeupToVrm(params: {
  vrm: VRM | null;
  avatarRoot: THREE.Object3D;
  persona: Persona;
  makeup?: AiMakeupConfig | null;
  mood?: MoodType;
  affinity?: number;
}): void {
  const { vrm, avatarRoot, persona, makeup, mood, affinity } = params;
  if (!vrm) return;

  // Resolve active makeup: use slot's makeup if specified, or auto-generate character's signature makeup!
  const effectiveMakeup = makeup || getDefaultMakeupForCharacter(persona);

  avatarRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (
      obj.userData?.__zeta_procedural_garment__ ||
      obj.userData?.__zeta_procedural_hair__ ||
      obj.userData?.__zeta_procedural_accessory__
    ) {
      return;
    }

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;

      // 1. Face Skin Material: Composite blush, lips, eyeshadow, and under-eye beauty mark
      if (isFaceSkinMaterial(mat.name)) {
        let snap = origFaceSkinMap.get(mat);
        const standardMat = mat as unknown as { map?: THREE.Texture | null; needsUpdate: boolean };

        if (!snap) {
          const originalMap = standardMat.map ?? null;
          const img = originalMap?.image as
            | HTMLImageElement
            | ImageBitmap
            | HTMLCanvasElement
            | undefined;
          snap = { originalMap, baseImage: img };
          origFaceSkinMap.set(mat, snap);
        }

        if (snap.baseImage) {
          const flipY = snap.originalMap ? snap.originalMap.flipY : false;
          // Dispose previous procedural canvas texture
          if (snap.canvasTexture) {
            snap.canvasTexture.dispose();
          }
          const newTex = createProceduralMakeupTexture(
            snap.baseImage,
            flipY,
            effectiveMakeup,
            mood ?? persona.mood,
            affinity ?? persona.affinity
          );
          snap.canvasTexture = newTex;
          standardMat.map = newTex;
          standardMat.needsUpdate = true;
        }
      }

      // 2. Eyeline & Eyelash Materials: Enrich with dramatic jet-black or stylized gothic eyeliner
      if (isEyelineOrLashMaterial(mat.name)) {
        let snap = origEyelineMap.get(mat);
        const anyM = mat as unknown as {
          color?: THREE.Color;
          shadeColorFactor?: THREE.Color;
          uniforms?: {
            litFactor?: { value?: THREE.Color };
            shadeColorFactor?: { value?: THREE.Color };
          };
          needsUpdate: boolean;
        };

        if (!snap) {
          snap = {
            colorHex: anyM.color ? `#${anyM.color.getHexString()}` : null,
            shadeColorHex: anyM.shadeColorFactor ? `#${anyM.shadeColorFactor.getHexString()}` : null,
          };
          origEyelineMap.set(mat, snap);
        }

        const linerColor = effectiveMakeup.eyelinerColorHex || '#08080f';
        const c = new THREE.Color(linerColor);
        if (anyM.color) anyM.color.copy(c);
        if (anyM.uniforms?.litFactor?.value) anyM.uniforms.litFactor.value.copy(c);
        const shade = c.clone().multiplyScalar(0.70);
        if (anyM.shadeColorFactor) anyM.shadeColorFactor.copy(shade);
        if (anyM.uniforms?.shadeColorFactor?.value) anyM.uniforms.shadeColorFactor.value.copy(shade);
        anyM.needsUpdate = true;
      }
    }
  });
}

/**
 * Resets any applied makeup and restores original face textures and eyeline material tints.
 */
export function clearMakeupFromVrm(avatarRoot: THREE.Object3D): void {
  avatarRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat) continue;

      if (isFaceSkinMaterial(mat.name)) {
        const snap = origFaceSkinMap.get(mat);
        if (snap) {
          if (snap.canvasTexture) {
            snap.canvasTexture.dispose();
            snap.canvasTexture = null;
          }
          const standardMat = mat as unknown as { map?: THREE.Texture | null; needsUpdate: boolean };
          standardMat.map = snap.originalMap;
          standardMat.needsUpdate = true;
        }
      }

      if (isEyelineOrLashMaterial(mat.name)) {
        const snap = origEyelineMap.get(mat);
        if (snap) {
          const anyM = mat as unknown as {
            color?: THREE.Color;
            shadeColorFactor?: THREE.Color;
            uniforms?: {
              litFactor?: { value?: THREE.Color };
              shadeColorFactor?: { value?: THREE.Color };
            };
            needsUpdate: boolean;
          };
          if (anyM.color && snap.colorHex) anyM.color.set(snap.colorHex);
          if (anyM.shadeColorFactor && snap.shadeColorHex) anyM.shadeColorFactor.set(snap.shadeColorHex);
          anyM.needsUpdate = true;
        }
      }
    }
  });
}
