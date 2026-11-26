import * as THREE from 'three';

/**
 * Convention-free "arms relaxed at the sides" pose.
 *
 * The old idle pose wrote hand-tuned Euler angles into the normalized VRM bones. Those angles flip
 * meaning between VRM 0.x (character faces -Z in bone space) and VRM 1.0 (faces +Z), and the
 * forward/back (x), roll (x on forearms/hands) terms were never mirrored, so VRoid (0.x) avatars
 * ended up with arms flared out and tipped backwards.
 *
 * Here we describe the pose as *directions in the character's own frame* (character faces +Z,
 * its left side is +X) and let the bone hierarchy work out the local rotation. Swing-only
 * rotations also mean no stray roll, so hands never end up twisted palm-backwards.
 */

export interface ArmChain {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  /** +1 = character's left arm, -1 = right arm */
  side: 1 | -1;
  /** Per-arm tweaks (sway / fidget) added on top of the shared params */
  outwardOffset?: number;
  forwardOffset?: number;
}

export interface NaturalArmParams {
  /** Upper-arm angle away from straight-down, radians (0 = hanging flat against the body) */
  outward: number;
  /** Upper-arm forward component (z in the character frame), ~0.1 = hands slightly in front */
  forward: number;
  /** Forearm angle away from straight-down, radians */
  forearmOutward: number;
  /** Forearm forward component: bigger = more relaxed elbow bend */
  forearmForward: number;
}

export const DEFAULT_NATURAL_ARMS: NaturalArmParams = {
  outward: 0.26, // ~15° so hands clear a flared skirt without looking held out
  forward: 0.1,
  forearmOutward: 0.1,
  forearmForward: 0.3,
};

const _frameQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _target = new THREE.Quaternion();
const _identity = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _desired = new THREE.Vector3();

function swingToward(
  node: THREE.Object3D,
  child: THREE.Object3D,
  desiredInFrame: THREE.Vector3,
  frameQ: THREE.Quaternion,
  t: number
): void {
  const parent = node.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_parentQ);

  // character-frame direction -> world -> this bone's parent space
  _dir.copy(desiredInFrame).applyQuaternion(frameQ).applyQuaternion(_parentQ.invert()).normalize();

  // Rest direction of the bone = where its child sits in its own local space (normalized rig: rest = identity)
  _rest.copy(child.position);
  if (_rest.lengthSq() < 1e-10) return;
  _rest.normalize();

  _target.setFromUnitVectors(_rest, _dir);
  node.quaternion.slerp(_target, t);
  node.updateWorldMatrix(false, false);
}

/**
 * @param frame Object whose local space has the character facing +Z (the parent of `vrm.scene`,
 *              i.e. after VRMUtils.rotateVRM0). Pass null for identity.
 * @param t     Smoothing factor 0..1 (1 = snap).
 */
export function applyNaturalArms(
  chains: ArmChain[],
  frame: THREE.Object3D | null,
  params: NaturalArmParams,
  t: number
): void {
  if (frame) {
    frame.updateWorldMatrix(true, false);
    frame.getWorldQuaternion(_frameQ);
  } else {
    _frameQ.identity();
  }
  const frameQ = _frameQ.clone();

  for (const chain of chains) {
    const outward = Math.max(0.1, params.outward + (chain.outwardOffset ?? 0));
    const forward = THREE.MathUtils.clamp(params.forward + (chain.forwardOffset ?? 0), 0.02, 0.38);
    _desired.set(chain.side * Math.sin(outward), -Math.cos(outward), forward).normalize();
    swingToward(chain.upper, chain.lower, _desired, frameQ, t);

    _desired
      .set(
        chain.side * Math.sin(params.forearmOutward),
        -Math.cos(params.forearmOutward),
        params.forearmForward
      )
      .normalize();
    swingToward(chain.lower, chain.hand, _desired, frameQ, t);

    // Wrist continues the forearm line (no stray roll)
    chain.hand.quaternion.slerp(_identity, t);
    chain.hand.updateWorldMatrix(false, false);
  }
}
