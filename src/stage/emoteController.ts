import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM } from '@pixiv/three-vrm';
import {
  createVRMAnimationClip,
  VRMAnimation,
  VRMAnimationLoaderPlugin,
} from '@pixiv/three-vrm-animation';
import type { ProceduralEmoteId } from '../types/studio';

export interface ProceduralEmoteMeta {
  id: ProceduralEmoteId;
  label: string;
  shortLabel: string;
  emoji: string;
  duration: number;
}

export const PROCEDURAL_EMOTES: ProceduralEmoteMeta[] = [
  {
    id: 'crossed_arms',
    label: 'Tsundere Crossed Arms ("Hmph!")',
    shortLabel: 'Hmph! Arms',
    emoji: '😤',
    duration: 3.4,
  },
  {
    id: 'friendly_wave',
    label: 'Friendly Wave',
    shortLabel: 'Wave',
    emoji: '👋',
    duration: 3.2,
  },
  {
    id: 'shy_fidget',
    label: 'Shy Fidget / Blushing Look-Away',
    shortLabel: 'Shy Fidget',
    emoji: '😳',
    duration: 3.6,
  },
  {
    id: 'idol_peace',
    label: 'Idol Peace Sign / Stage Pose',
    shortLabel: 'Idol Pose',
    emoji: '✌️',
    duration: 3.4,
  },
  {
    id: 'gentle_bow',
    label: 'Gentle Bow',
    shortLabel: 'Gentle Bow',
    emoji: '🙇‍♀️',
    duration: 3.0,
  },
  {
    id: 'thinking_chin',
    label: 'Thinking / Chin Rest',
    shortLabel: 'Thinking',
    emoji: '🤔',
    duration: 3.5,
  },
  {
    id: 'cat_paws',
    label: 'Cute Cat Paws',
    shortLabel: 'Cat Paws',
    emoji: '🐾',
    duration: 3.4,
  },
  {
    id: 'arms_behind_back',
    label: 'Arms Behind Back / Playful',
    shortLabel: 'Behind Back',
    emoji: '✨',
    duration: 3.5,
  },
  {
    id: 'lean_forward',
    label: 'Curious Lean Forward',
    shortLabel: 'Lean In',
    emoji: '👀',
    duration: 3.2,
  },
  {
    id: 'pout_turn',
    label: 'Pout & Look Away',
    shortLabel: 'Pout Turn',
    emoji: '😤',
    duration: 3.2,
  },
  {
    id: 'hands_on_hips',
    label: 'Proud Hands on Hips',
    shortLabel: 'On Hips',
    emoji: '💁‍♀️',
    duration: 3.4,
  },
];

export interface ActiveProceduralEmote {
  id: ProceduralEmoteId;
  startTime: number;
  duration: number;
}

/**
 * Applies smooth, expressive VRM upper-body procedural emote pose + facial expression blend.
 */
export function applyProceduralEmote(
  vrm: VRM,
  emote: ActiveProceduralEmote,
  isSpeaking = false
): boolean {
  const age = (performance.now() - emote.startTime) / 1000;
  if (age >= emote.duration) return false;

  const t = age / emote.duration;
  const easeIn = Math.min(1, t / 0.16);
  const easeOut = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
  const w = easeIn * easeOut;

  const humanoid = vrm.humanoid;
  if (!humanoid) return false;

  const isVrm0 = vrm.meta?.metaVersion === '0';
  const armSign = isVrm0 ? 1 : -1;

  const lUpper = humanoid.getNormalizedBoneNode('leftUpperArm');
  const rUpper = humanoid.getNormalizedBoneNode('rightUpperArm');
  const lLower = humanoid.getNormalizedBoneNode('leftLowerArm');
  const rLower = humanoid.getNormalizedBoneNode('rightLowerArm');
  const rHand = humanoid.getNormalizedBoneNode('rightHand');
  const spine = humanoid.getNormalizedBoneNode('spine');
  const chest = humanoid.getNormalizedBoneNode('chest');
  const head = humanoid.getNormalizedBoneNode('head');
  const neck = humanoid.getNormalizedBoneNode('neck');

  const lerp = THREE.MathUtils.lerp;
  const expr = vrm.expressionManager;
  const setExpr = (names: string[], val: number) => {
    if (!expr) return;
    for (const n of names) {
      try {
        expr.setValue(n, val);
      } catch {
        // ignore missing blendshape
      }
    }
  };

  if (emote.id === 'crossed_arms') {
    if (lUpper) {
      lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 0.65, w);
      lUpper.rotation.x = lerp(lUpper.rotation.x, -0.58, w);
    }
    if (rUpper) {
      rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 0.65, w);
      rUpper.rotation.x = lerp(rUpper.rotation.x, -0.58, w);
    }
    if (lLower) {
      lLower.rotation.y = lerp(lLower.rotation.y, 1.35, w);
      lLower.rotation.z = lerp(lLower.rotation.z, armSign * 0.25, w);
    }
    if (rLower) {
      rLower.rotation.y = lerp(rLower.rotation.y, -1.35, w);
      rLower.rotation.z = lerp(rLower.rotation.z, -armSign * 0.25, w);
    }
    if (spine) spine.rotation.y = lerp(spine.rotation.y, 0.14, w);
    if (head) {
      head.rotation.y = lerp(head.rotation.y, -0.28, w);
      head.rotation.x = lerp(head.rotation.x, -0.06, w);
    }
    setExpr(['angry'], (isSpeaking ? 0.65 : 0.42) * w);
  } else if (emote.id === 'friendly_wave') {
    const wave = Math.sin(age * 9.5) * 0.28;
    if (rUpper) {
      rUpper.rotation.z = lerp(rUpper.rotation.z, armSign * 0.55, w);
      rUpper.rotation.x = lerp(rUpper.rotation.x, -0.35, w);
    }
    if (rLower) {
      rLower.rotation.z = lerp(rLower.rotation.z, armSign * (0.95 + wave), w);
      rLower.rotation.y = lerp(rLower.rotation.y, -0.2, w);
    }
    if (rHand) {
      rHand.rotation.z = lerp(rHand.rotation.z, wave * 0.6, w);
    }
    if (head) {
      head.rotation.z = lerp(head.rotation.z, 0.12, w);
      head.rotation.y = lerp(head.rotation.y, 0.06, w);
    }
    setExpr(['happy', 'joy'], (isSpeaking ? 0.6 : 0.34) * w);
  } else if (emote.id === 'shy_fidget') {
    const fidget = Math.sin(age * 5.5) * 0.06;
    if (lUpper) {
      lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 0.88, w);
      lUpper.rotation.x = lerp(lUpper.rotation.x, -0.32, w);
    }
    if (rUpper) {
      rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 0.88, w);
      rUpper.rotation.x = lerp(rUpper.rotation.x, -0.32, w);
    }
    if (lLower) lLower.rotation.y = lerp(lLower.rotation.y, 0.92 + fidget, w);
    if (rLower) rLower.rotation.y = lerp(rLower.rotation.y, -0.92 - fidget, w);
    if (spine) spine.rotation.y = lerp(spine.rotation.y, Math.sin(age * 2.8) * 0.08, w);
    if (head) {
      head.rotation.y = lerp(head.rotation.y, -0.24, w);
      head.rotation.x = lerp(head.rotation.x, 0.14, w);
      head.rotation.z = lerp(head.rotation.z, 0.08, w);
    }
    setExpr(['surprised'], (isSpeaking ? 0.3 : 0.22) * w);
    setExpr(['relaxed'], (isSpeaking ? 0.4 : 0.28) * w);
  } else if (emote.id === 'idol_peace') {
    const bounce = Math.sin(age * 4.2) * 0.04;
    if (rUpper) {
      rUpper.rotation.z = lerp(rUpper.rotation.z, armSign * 0.35, w);
      rUpper.rotation.x = lerp(rUpper.rotation.x, -0.45, w);
    }
    if (rLower) {
      rLower.rotation.z = lerp(rLower.rotation.z, armSign * 1.18, w);
      rLower.rotation.y = lerp(rLower.rotation.y, -0.45, w);
    }
    if (lUpper) {
      lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 0.82, w);
      lUpper.rotation.x = lerp(lUpper.rotation.x, 0.12, w);
    }
    if (lLower) {
      lLower.rotation.y = lerp(lLower.rotation.y, 0.85, w);
    }
    if (spine) {
      spine.rotation.z = lerp(spine.rotation.z, -0.09 + bounce, w);
      spine.rotation.y = lerp(spine.rotation.y, -0.1, w);
    }
    if (head) {
      head.rotation.z = lerp(head.rotation.z, 0.16, w);
      head.rotation.x = lerp(head.rotation.x, -0.04, w);
    }
    setExpr(['happy', 'joy'], (isSpeaking ? 0.65 : 0.35) * w);
    setExpr(['blinkLeft'], 0.9 * w);
  } else if (emote.id === 'gentle_bow') {
    if (spine) spine.rotation.x = lerp(spine.rotation.x, 0.32, w);
    if (chest) chest.rotation.x = lerp(chest.rotation.x, 0.18, w);
    if (neck) neck.rotation.x = lerp(neck.rotation.x, 0.14, w);
    if (head) head.rotation.x = lerp(head.rotation.x, 0.16, w);
    if (lUpper) lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 1.24, w);
    if (rUpper) rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 1.24, w);
    setExpr(['relaxed'], (isSpeaking ? 0.45 : 0.28) * w);
    setExpr(['blink'], 0.85 * w);
  } else if (emote.id === 'thinking_chin') {
    if (rUpper) {
      rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 0.42, w);
      rUpper.rotation.x = lerp(rUpper.rotation.x, -0.68, w);
    }
    if (rLower) {
      rLower.rotation.y = lerp(rLower.rotation.y, -1.25, w);
      rLower.rotation.z = lerp(rLower.rotation.z, armSign * 0.62, w);
    }
    if (lUpper) {
      lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 0.72, w);
      lUpper.rotation.x = lerp(lUpper.rotation.x, -0.15, w);
    }
    if (head) {
      head.rotation.z = lerp(head.rotation.z, -0.16, w);
      head.rotation.x = lerp(head.rotation.x, 0.08, w);
      head.rotation.y = lerp(head.rotation.y, 0.12, w);
    }
    setExpr(['relaxed', 'surprised'], (isSpeaking ? 0.4 : 0.22) * w);
  } else if (emote.id === 'cat_paws') {
    const pawBounce = Math.sin(age * 6.5) * 0.08;
    if (lUpper) {
      lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 0.35, w);
      lUpper.rotation.x = lerp(lUpper.rotation.x, -0.58 + pawBounce, w);
    }
    if (rUpper) {
      rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 0.35, w);
      rUpper.rotation.x = lerp(rUpper.rotation.x, -0.58 - pawBounce, w);
    }
    if (lLower) {
      lLower.rotation.y = lerp(lLower.rotation.y, 1.15, w);
      lLower.rotation.z = lerp(lLower.rotation.z, armSign * 0.42, w);
    }
    if (rLower) {
      rLower.rotation.y = lerp(rLower.rotation.y, -1.15, w);
      rLower.rotation.z = lerp(rLower.rotation.z, -armSign * 0.42, w);
    }
    if (head) {
      head.rotation.z = lerp(head.rotation.z, 0.14, w);
      head.rotation.y = lerp(head.rotation.y, 0.06, w);
    }
    setExpr(['happy', 'joy'], (isSpeaking ? 0.7 : 0.45) * w);
  } else if (emote.id === 'arms_behind_back') {
    if (lUpper) {
      lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 1.12, w);
      lUpper.rotation.x = lerp(lUpper.rotation.x, 0.32, w);
    }
    if (rUpper) {
      rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 1.12, w);
      rUpper.rotation.x = lerp(rUpper.rotation.x, 0.32, w);
    }
    if (lLower) lLower.rotation.y = lerp(lLower.rotation.y, 0.85, w);
    if (rLower) rLower.rotation.y = lerp(rLower.rotation.y, -0.85, w);
    if (spine) spine.rotation.x = lerp(spine.rotation.x, 0.12, w);
    if (head) {
      head.rotation.x = lerp(head.rotation.x, -0.08, w);
      head.rotation.z = lerp(head.rotation.z, 0.09, w);
    }
    setExpr(['happy'], (isSpeaking ? 0.5 : 0.3) * w);
  } else if (emote.id === 'lean_forward') {
    if (spine) spine.rotation.x = lerp(spine.rotation.x, 0.22, w);
    if (chest) chest.rotation.x = lerp(chest.rotation.x, 0.14, w);
    if (head) {
      head.rotation.x = lerp(head.rotation.x, -0.16, w);
      head.rotation.y = lerp(head.rotation.y, 0.04, w);
    }
    if (lUpper) lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 0.95, w);
    if (rUpper) rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 0.95, w);
    setExpr(['surprised'], (isSpeaking ? 0.35 : 0.25) * w);
  } else if (emote.id === 'pout_turn') {
    if (neck) neck.rotation.y = lerp(neck.rotation.y, 0.32, w);
    if (head) {
      head.rotation.y = lerp(head.rotation.y, 0.22, w);
      head.rotation.x = lerp(head.rotation.x, -0.06, w);
    }
    if (lUpper) lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 0.72, w);
    if (rUpper) rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 0.72, w);
    setExpr(['angry'], (isSpeaking ? 0.65 : 0.45) * w);
  } else if (emote.id === 'hands_on_hips') {
    if (lUpper) {
      lUpper.rotation.z = lerp(lUpper.rotation.z, armSign * 0.75, w);
      lUpper.rotation.x = lerp(lUpper.rotation.x, -0.22, w);
    }
    if (rUpper) {
      rUpper.rotation.z = lerp(rUpper.rotation.z, -armSign * 0.75, w);
      rUpper.rotation.x = lerp(rUpper.rotation.x, -0.22, w);
    }
    if (lLower) {
      lLower.rotation.y = lerp(lLower.rotation.y, 1.25, w);
      lLower.rotation.z = lerp(lLower.rotation.z, -armSign * 0.25, w);
    }
    if (rLower) {
      rLower.rotation.y = lerp(rLower.rotation.y, -1.25, w);
      rLower.rotation.z = lerp(rLower.rotation.z, armSign * 0.25, w);
    }
    if (head) {
      head.rotation.x = lerp(head.rotation.x, -0.06, w);
      head.rotation.y = lerp(head.rotation.y, -0.08, w);
    }
    setExpr(['happy'], (isSpeaking ? 0.55 : 0.35) * w);
  }

  return true;
}

/**
 * Loads a custom `.vrma` skeletal animation file using `@pixiv/three-vrm-animation`
 * and returns a playable `THREE.AnimationClip` bound to the active VRM avatar.
 */
export async function loadVrmaClipFromBuffer(
  buffer: ArrayBuffer,
  vrm: VRM
): Promise<THREE.AnimationClip | null> {
  const blob = new Blob([buffer]);
  const url = URL.createObjectURL(blob);
  try {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrmAnimations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
    if (!vrmAnimations || vrmAnimations.length === 0) return null;
    return createVRMAnimationClip(vrmAnimations[0], vrm);
  } finally {
    URL.revokeObjectURL(url);
  }
}
