import { VRMUtils, type VRM } from '@pixiv/three-vrm';

/**
 * Canonical normalized-bone axis signs for `@pixiv/three-vrm` v3 across VRM 0.x and VRM 1.0.
 *
 * After `normalizeVrmOrientation(vrm)`:
 *  - `vrm.scene` faces `+Z` (out of chair, toward camera & front furniture) for BOTH VRM 0.x and VRM 1.0.
 *  - In `vrm.humanoid.getNormalizedBoneNode(...)` local space:
 *      * VRM 1.0: +X = character left, +Y = up, +Z = character forward
 *      * VRM 0.x: +X = character right, +Y = up, -Z = character forward
 *        (because `VRMUtils.rotateVRM0` applies a 180° Y rotation on `vrm.scene` above the skeleton!)
 *
 * By the right-hand rule around local X/Y/Z:
 *  - Upward-pointing bones (`spine`, `chest`, `upperChest`, `neck`, `head`):
 *      Forward pitch (lean forward / chin down) is `-X` on VRM 0.x and `+X` on VRM 1.0 (`torsoForwardSign`).
 *  - Downward-pointing leg bones (`leftUpperLeg`, `rightUpperLeg`, `leftLowerLeg`, `rightLowerLeg`):
 *      Swinging a thigh forward (`-Y -> front`) is `+X` on VRM 0.x and `-X` on VRM 1.0 (`legForwardSign`).
 *      Flexing a knee backward (`-Y -> back`) is `-X` on VRM 0.x and `+X` on VRM 1.0 (`kneeFlexSign`).
 *  - Lateral roll (`hips.z`, `spine.z`, `chest.z`, `neck.z`, `head.z`):
 *      Flips sign between VRM 0.x (`-Z` forward) and VRM 1.0 (`+Z` forward) (`rollSign`).
 *  - Arm protraction / forward swing around `+Y` (shoulder, upperArm, lowerArm):
 *      Left arm forward is `-Y`, right arm forward is `+Y` on BOTH VRM 0.x and VRM 1.0!
 */
export interface VrmBoneSigns {
  isVrm0: boolean;
  /** X-rotation sign that pitches upward bones (`spine`, `chest`, `upperChest`, `neck`, `head`) FORWARD / chin-down */
  torsoForwardSign: 1 | -1;
  /** X-rotation sign that swings downward thigh bones (`leftUpperLeg`, `rightUpperLeg`) FORWARD */
  legForwardSign: 1 | -1;
  /** X-rotation sign that flexes knee bones (`leftLowerLeg`, `rightLowerLeg`) BACKWARD (anatomical flexion) */
  kneeFlexSign: 1 | -1;
  /** Z-rotation sign that lowers `leftUpperArm` downward toward sides and adducts `leftUpperLeg` inward (negate for right) */
  armDownSign: 1 | -1;
  /** Z-rotation sign for lateral roll / side-bend on torso, hips, neck & head */
  rollSign: 1 | -1;
  /** Y-rotation sign that swings left shoulder / arm forward (`-1` on both VRM 0.x and 1.0) */
  leftArmForwardY: -1;
  /** Y-rotation sign that swings right shoulder / arm forward (`+1` on both VRM 0.x and 1.0) */
  rightArmForwardY: 1;
}

export function getVrmBoneSigns(vrm: VRM): VrmBoneSigns {
  const isVrm0 = vrm.meta?.metaVersion === '0';
  return {
    isVrm0,
    torsoForwardSign: isVrm0 ? -1 : 1,
    legForwardSign: isVrm0 ? 1 : -1,
    kneeFlexSign: isVrm0 ? -1 : 1,
    armDownSign: isVrm0 ? 1 : -1,
    rollSign: isVrm0 ? -1 : 1,
    leftArmForwardY: -1,
    rightArmForwardY: 1,
  };
}

/**
 * Normalizes any loaded VRM 0.x or VRM 1.0 scene so its canonical forward facing axis
 * points cleanly along `+Z` (toward camera, out of chairs/stools, facing desks & dining tables).
 */
export function normalizeVrmOrientation(vrm: VRM): void {
  if (vrm.meta?.metaVersion === '0') {
    VRMUtils.rotateVRM0(vrm);
  } else {
    vrm.scene.rotation.set(0, 0, 0);
  }
  vrm.scene.updateMatrixWorld(true);
}
