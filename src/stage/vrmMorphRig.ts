import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { VrmAppearanceVariant } from '../types/studio';

interface EyeSkinOrigSnap {
  colorHex: string | null;
  shadeColorHex: string | null;
}

const origEyeSkinMap = new WeakMap<THREE.Material, EyeSkinOrigSnap>();

function snapshotEyeOrSkin(mat: THREE.Material): EyeSkinOrigSnap {
  const existing = origEyeSkinMap.get(mat);
  if (existing) return existing;
  const anyM = mat as unknown as { color?: THREE.Color; shadeColorFactor?: THREE.Color };
  const snap: EyeSkinOrigSnap = {
    colorHex: anyM.color ? `#${anyM.color.getHexString()}` : null,
    shadeColorHex: anyM.shadeColorFactor ? `#${anyM.shadeColorFactor.getHexString()}` : null,
  };
  origEyeSkinMap.set(mat, snap);
  return snap;
}

function isEyeIrisMaterial(matName: string): boolean {
  if (!matName) return false;
  const n = matName.toLowerCase();
  if (/white|sclera|highlight|line|brow|lash/.test(n)) return false;
  return /eyeiris|iris|_eye\b/.test(n);
}

function isSkinMaterialForTone(matName: string): boolean {
  if (!matName) return false;
  const n = matName.toLowerCase();
  if (/cloth|hair|eye|mouth|brow|lash|teeth|tongue|blush/.test(n)) return false;
  return /face.*skin|body.*skin|_skin\b/.test(n);
}

const SKIN_TONE_MULTIPLIERS: Record<
  NonNullable<VrmAppearanceVariant['skinToneShift']>,
  string | null
> = {
  default: null,
  fair_porcelain: '#fff8fb',
  warm_peach: '#ffe9dc',
  sun_kissed: '#f4cfb8',
};

/**
 * Applies AI-generated VRM appearance morphing directly onto ANY loaded `.vrm` model
 * (body height/proportion scale, head scale, live Eye Iris anime color recoloring, and subtle skin tone)
 * so the AI character can generate & transform into distinct VRM types even when only 1 `.vrm` file is in Vault!
 */
export function applyVrmAppearanceVariant(params: {
  vrm: VRM | null;
  avatarRoot: THREE.Object3D;
  variant?: VrmAppearanceVariant | null;
}): void {
  const { vrm, avatarRoot, variant } = params;

  // 1. Body scale & head proportion morphing (cleanly resets to 1.0 when variant is null)
  const bodyScale = variant ? THREE.MathUtils.clamp(variant.bodyScale ?? 1.0, 0.86, 1.10) : 1.0;
  avatarRoot.scale.setScalar(bodyScale);

  const headBone = vrm?.humanoid?.getRawBoneNode('head');
  if (headBone) {
    const headScale = variant ? THREE.MathUtils.clamp(variant.headScale ?? 1.0, 0.94, 1.12) : 1.0;
    headBone.scale.setScalar(headScale);
  }

  // 2. Live Eye Iris recoloring & subtle Skin Tone warmth (non-destructive via WeakMap snapshots)
  const targetEyeHex = variant?.eyeColorHex || null;
  const skinTintHex = variant?.skinToneShift
    ? SKIN_TONE_MULTIPLIERS[variant.skinToneShift] ?? null
    : null;

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
      const isEye = isEyeIrisMaterial(mat.name);
      const isSkin = !isEye && isSkinMaterialForTone(mat.name);
      if (!isEye && !isSkin) continue;

      const snap = snapshotEyeOrSkin(mat);
      const anyMat = mat as unknown as {
        color?: THREE.Color;
        shadeColorFactor?: THREE.Color;
        uniforms?: {
          litFactor?: { value?: THREE.Color };
          shadeColorFactor?: { value?: THREE.Color };
        };
        needsUpdate: boolean;
      };

      const applyColor = (hex: string | null) => {
        if (hex) {
          const c = new THREE.Color(hex);
          if (anyMat.color) anyMat.color.copy(c);
          if (anyMat.uniforms?.litFactor?.value) anyMat.uniforms.litFactor.value.copy(c);
          const shade = c.clone().multiplyScalar(0.74);
          if (anyMat.shadeColorFactor) anyMat.shadeColorFactor.copy(shade);
          if (anyMat.uniforms?.shadeColorFactor?.value) {
            anyMat.uniforms.shadeColorFactor.value.copy(shade);
          }
          anyMat.needsUpdate = true;
        } else {
          if (anyMat.color && snap.colorHex) anyMat.color.set(snap.colorHex);
          if (anyMat.uniforms?.litFactor?.value && snap.colorHex) {
            anyMat.uniforms.litFactor.value.set(snap.colorHex);
          }
          if (anyMat.shadeColorFactor && snap.shadeColorHex) {
            anyMat.shadeColorFactor.set(snap.shadeColorHex);
          }
          if (anyMat.uniforms?.shadeColorFactor?.value && snap.shadeColorHex) {
            anyMat.uniforms.shadeColorFactor.value.set(snap.shadeColorHex);
          }
          anyMat.needsUpdate = true;
        }
      };

      if (isEye) {
        applyColor(targetEyeHex);
      } else if (isSkin) {
        applyColor(skinTintHex);
      }
    }
  });
}
