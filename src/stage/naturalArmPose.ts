import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { HobbyKindId, StretchRoutineId } from '../types/studio';

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

/**
 * Frame-rate-independent exponential smoothing factor (0..1) so animations stay silky smooth
 * across 30fps, 60fps, 120fps, and 144fps with zero jitter or abrupt pops.
 */
export function expSmooth(speed: number, dt: number): number {
  const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
  return 1 - Math.exp(-speed * safeDt);
}

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

export interface DirectedArmSpec {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  hand: THREE.Object3D;
  /** Desired upper-arm direction in character frame (+X left, +Y up, +Z forward) */
  upperDir: [number, number, number];
  /** Desired forearm direction in character frame (+X left, +Y up, +Z forward) */
  lowerDir: [number, number, number];
  /** Optional local wrist Euler offset (radians) applied smoothly instead of identity */
  handEuler?: [number, number, number];
}

const _handTargetQ = new THREE.Quaternion();
const _handEulerTmp = new THREE.Euler(0, 0, 0, 'XYZ');
const _palmBasisM = new THREE.Matrix4();
const _palmX = new THREE.Vector3();
const _palmY = new THREE.Vector3();
const _palmZ = new THREE.Vector3();
const _palmWorldQ = new THREE.Quaternion();
const _palmParentQ = new THREE.Quaternion();

/**
 * Orients a normalized VRM hand bone so its fingers point along `fingerDirInFrame`
 * and its PALM faces along `palmDirInFrame` (both in character frame: +X left, +Y up, +Z forward).
 * Works identically on VRM 0.x (after rotateVRM0) and VRM 1.0 — guarantees waving/peace palms
 * ALWAYS face forward toward the viewer with zero backwards-hand flipping!
 */
export function orientHandInFrame(params: {
  hand: THREE.Object3D;
  side: 1 | -1; // +1 = left hand, -1 = right hand
  isVrm0: boolean;
  fingerDir: [number, number, number];
  palmDir: [number, number, number];
  frameQ: THREE.Quaternion;
  t: number;
}): void {
  const { hand, side, isVrm0, fingerDir, palmDir, frameQ, t } = params;
  const parent = hand.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_palmParentQ);

  // In normalized T-pose:
  //   VRM 1.0: leftHand fingers = +X, rightHand fingers = -X, palm = -Y
  //   VRM 0.x (before 180° Y on vrm.scene): leftHand fingers = -X, rightHand fingers = +X, palm = -Y
  const localFingerSign = (side === 1) !== isVrm0 ? 1 : -1;

  _palmX.set(fingerDir[0], fingerDir[1], fingerDir[2]).normalize();
  // Local +Y is back-of-hand = -palmDir (orthogonalized against fingerDir)
  _palmY.set(-palmDir[0], -palmDir[1], -palmDir[2]);
  _palmY.addScaledVector(_palmX, -_palmY.dot(_palmX));
  if (_palmY.lengthSq() < 1e-6) {
    _palmY.set(0, 1, 0);
    _palmY.addScaledVector(_palmX, -_palmY.dot(_palmX));
  }
  _palmY.normalize();

  // Map local +X to localFingerSign * fingerDir so right-handed det = +1
  _palmX.multiplyScalar(localFingerSign);
  _palmZ.crossVectors(_palmX, _palmY).normalize();
  _palmY.crossVectors(_palmZ, _palmX).normalize();

  _palmBasisM.makeBasis(_palmX, _palmY, _palmZ);
  _palmWorldQ.setFromRotationMatrix(_palmBasisM);
  _palmWorldQ.premultiply(frameQ);
  _handTargetQ.copy(_palmParentQ).invert().multiply(_palmWorldQ);

  hand.quaternion.slerp(_handTargetQ, t);
  hand.updateWorldMatrix(false, false);
}

const _clampUp = new THREE.Vector3();
const _clampLow = new THREE.Vector3();
const _clampPerp = new THREE.Vector3();

/**
 * Solves arbitrary arm poses from explicit character-frame directions (+X left, +Y up, +Z forward),
 * guaranteeing identical front-facing posture on both VRM 0.x (after rotateVRM0) and VRM 1.0,
 * with elbow flexion clamping so forearms never hyperextend or fold awkwardly into biceps.
 */
export function applyDirectedArms(
  specs: DirectedArmSpec[],
  frame: THREE.Object3D | null,
  t: number
): void {
  if (frame) {
    frame.updateWorldMatrix(true, false);
    frame.getWorldQuaternion(_frameQ);
  } else {
    _frameQ.identity();
  }
  const frameQ = _frameQ.clone();

  for (const spec of specs) {
    _clampUp.set(spec.upperDir[0], spec.upperDir[1], spec.upperDir[2]).normalize();
    swingToward(spec.upper, spec.lower, _clampUp, frameQ, t);

    _clampLow.set(spec.lowerDir[0], spec.lowerDir[1], spec.lowerDir[2]).normalize();
    // Guard against near-180° foldback (dot < -0.78 -> >141° elbow fold) which causes shortest-arc twist snaps!
    const elbowDot = _clampUp.dot(_clampLow);
    if (elbowDot < -0.78) {
      _clampPerp.copy(_clampLow).addScaledVector(_clampUp, -elbowDot);
      if (_clampPerp.lengthSq() < 1e-5) {
        _clampPerp.set(0, 0, 1); // Stable forward pole fallback
      }
      _clampPerp.normalize();
      _clampLow.copy(_clampUp).multiplyScalar(-0.78).addScaledVector(_clampPerp, Math.sqrt(1 - 0.78 * 0.78)).normalize();
    }
    swingToward(spec.lower, spec.hand, _clampLow, frameQ, t);

    if (spec.handEuler) {
      _handEulerTmp.set(spec.handEuler[0], spec.handEuler[1], spec.handEuler[2], 'XYZ');
      _handTargetQ.setFromEuler(_handEulerTmp);
      spec.hand.quaternion.slerp(_handTargetQ, t);
    } else {
      spec.hand.quaternion.slerp(_identity, t);
    }
    spec.hand.updateWorldMatrix(false, false);
  }
}

function getArmBones(vrm: VRM) {
  const h = vrm.humanoid;
  if (!h) return null;
  const bone = (name: VRMHumanBoneName) => h.getNormalizedBoneNode(name);
  const lu = bone('leftUpperArm');
  const ll = bone('leftLowerArm');
  const lh = bone('leftHand');
  const ru = bone('rightUpperArm');
  const rl = bone('rightLowerArm');
  const rh = bone('rightHand');
  if (!lu || !ll || !lh || !ru || !rl || !rh) return null;
  return { lu, ll, lh, ru, rl, rh };
}

/**
 * Convention-free crossed-arms pose ("Crossed-Arms Wait" / Tsundere "Hmph!").
 * Left forearm folds cleanly in front across the chest toward the right bicep;
 * right forearm tucks just beneath it toward the left upper arm — zero chest clipping
 * and never bends backward on VRM 0.x or VRM 1.0.
 */
export function applyCrossedArms(
  vrm: VRM,
  t: number,
  options?: { breath?: number }
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;
  const breath = options?.breath ?? 0;

  applyDirectedArms(
    [
      {
        // Left arm (outer/front fold): elbow drops down & forward in front of ribs,
        // forearm sweeps across chest toward right bicep.
        upper: b.lu,
        lower: b.ll,
        hand: b.lh,
        upperDir: [0.06, -0.76 + breath * 0.02, 0.65],
        lowerDir: [-0.95, 0.22 + breath * 0.015, 0.16],
      },
      {
        // Right arm (inner/lower fold): elbow slightly lower & closer,
        // forearm tucks cleanly underneath the left forearm toward the left bicep.
        upper: b.ru,
        lower: b.rl,
        hand: b.rh,
        upperDir: [-0.07, -0.82 + breath * 0.02, 0.56],
        lowerDir: [0.97, 0.16 + breath * 0.015, 0.04],
      },
    ],
    vrm.scene.parent,
    t
  );
  return true;
}

/**
 * Convention-free relaxed seated lap arm pose (identical on VRM 0.x and VRM 1.0!).
 * Uses a natural ~18° outward carrying angle on the upper arms so deltoids never pinch
 * and elbows never collapse into the ribcage, with forearms & palms resting gently forward on thighs.
 */
export function applySeatedLapArms(
  vrm: VRM,
  t: number,
  options?: { breath?: number; droop?: number; fidget?: number }
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;
  const breath = options?.breath ?? 0;
  const droop = options?.droop ?? 0;
  const fidget = options?.fidget ?? 0;
  const isVrm0 = vrm.meta?.metaVersion === '0';

  applyDirectedArms(
    [
      {
        upper: b.lu,
        lower: b.ll,
        hand: b.lh,
        upperDir: [0.30 - droop * 0.04, -0.90, 0.31 + breath * 0.015 + fidget * 0.05],
        lowerDir: [-0.26, -0.34, 0.90],
      },
      {
        upper: b.ru,
        lower: b.rl,
        hand: b.rh,
        upperDir: [-0.30 + droop * 0.04, -0.90, 0.31 - breath * 0.015 - fidget * 0.05],
        lowerDir: [0.26, -0.34, 0.90],
      },
    ],
    vrm.scene.parent,
    t
  );

  const frameObj = vrm.scene.parent || vrm.scene;
  frameObj.updateWorldMatrix(true, false);
  const frameQ = new THREE.Quaternion();
  frameObj.getWorldQuaternion(frameQ);
  orientHandInFrame({
    hand: b.lh,
    side: 1,
    isVrm0,
    fingerDir: [-0.22, -0.26, 0.94],
    palmDir: [-0.14, -0.94, 0.30],
    frameQ,
    t,
  });
  orientHandInFrame({
    hand: b.rh,
    side: -1,
    isVrm0,
    fingerDir: [0.22, -0.26, 0.94],
    palmDir: [0.14, -0.94, 0.30],
    frameQ,
    t,
  });
  return true;
}

/**
 * Convention-free cold self-hug / rubbing upper arms in front of the chest.
 */
export function applyColdRubArms(
  vrm: VRM,
  t: number,
  elapsed: number,
  intensity = 1
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;
  const rub = Math.sin(elapsed * 5.2) * 0.07 * intensity;

  applyDirectedArms(
    [
      {
        upper: b.lu,
        lower: b.ll,
        hand: b.lh,
        upperDir: [0.04, -0.74, 0.67],
        lowerDir: [-0.92, 0.34 + rub, 0.18],
      },
      {
        upper: b.ru,
        lower: b.rl,
        hand: b.rh,
        upperDir: [-0.05, -0.80, 0.59],
        lowerDir: [0.94, 0.28 - rub, 0.05],
      },
    ],
    vrm.scene.parent,
    t
  );
  return true;
}

/**
 * Convention-free shy fidget pose (hands gently clasped/fidgeting together in front of tummy).
 */
export function applyShyFidgetArms(
  vrm: VRM,
  t: number,
  fidget = 0
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;

  applyDirectedArms(
    [
      {
        upper: b.lu,
        lower: b.ll,
        hand: b.lh,
        upperDir: [0.18, -0.90, 0.38],
        lowerDir: [-0.72, -0.35 + fidget, 0.58],
      },
      {
        upper: b.ru,
        lower: b.rl,
        hand: b.rh,
        upperDir: [-0.18, -0.90, 0.38],
        lowerDir: [0.72, -0.35 - fidget, 0.54],
      },
    ],
    vrm.scene.parent,
    t
  );
  return true;
}

/**
 * Convention-free friendly wave pose (palm GUARANTEED facing forward toward the viewer on VRM 0.x & 1.0!).
 * Right arm raises naturally beside her head and waves smoothly side-to-side; left arm rests relaxed at her side.
 */
export function applyFriendlyWaveArms(
  vrm: VRM,
  age: number,
  t: number
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;
  const isVrm0 = vrm.meta?.metaVersion === '0';
  const wave = Math.sin(age * 8.5) * 0.28;

  const rForearmDir: [number, number, number] = [-0.16 + wave, 0.92, 0.34];
  applyDirectedArms(
    [
      {
        upper: b.ru,
        lower: b.rl,
        hand: b.rh,
        upperDir: [-0.62, 0.38, 0.68],
        lowerDir: rForearmDir,
      },
      {
        upper: b.lu,
        lower: b.ll,
        hand: b.lh,
        upperDir: [0.22, -0.93, 0.28],
        lowerDir: [0.06, -0.88, 0.46],
      },
    ],
    vrm.scene.parent,
    t
  );

  // Orient right palm strictly forward (+Z) so she NEVER waves backwards!
  if (vrm.scene.parent) {
    vrm.scene.parent.updateWorldMatrix(true, false);
    vrm.scene.parent.getWorldQuaternion(_frameQ);
  } else {
    _frameQ.identity();
  }
  const frameQ = _frameQ.clone();
  orientHandInFrame({
    hand: b.rh,
    side: -1,
    isVrm0,
    fingerDir: [-0.12 + wave * 1.25, 0.95, 0.22],
    palmDir: [0.08, -0.05, 1.0],
    frameQ,
    t,
  });

  // Open fingers naturally while waving
  const h = vrm.humanoid;
  if (h) {
    const armDownSign = isVrm0 ? 1 : -1;
    const rightFingers: VRMHumanBoneName[] = [
      'rightIndexProximal',
      'rightIndexIntermediate',
      'rightMiddleProximal',
      'rightMiddleIntermediate',
      'rightRingProximal',
      'rightRingIntermediate',
      'rightLittleProximal',
      'rightLittleIntermediate',
    ];
    for (const fn of rightFingers) {
      const node = h.getNormalizedBoneNode(fn);
      if (node) {
        node.rotation.z = THREE.MathUtils.lerp(node.rotation.z, -armDownSign * 0.08, t);
      }
    }
  }
  return true;
}

/**
 * Convention-free Idol Peace Sign pose:
 * Right hand raised cheerfully by her cheek with PALM FORWARD (+Z) and V-fingers;
 * Left hand rests gracefully on her hip (no stiff airplane T-pose!).
 */
export function applyIdolPeaceArms(
  vrm: VRM,
  age: number,
  t: number
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;
  const isVrm0 = vrm.meta?.metaVersion === '0';
  const bounce = Math.sin(age * 4.2) * 0.04;

  applyDirectedArms(
    [
      {
        upper: b.ru,
        lower: b.rl,
        hand: b.rh,
        upperDir: [-0.54, 0.12 + bounce, 0.83],
        lowerDir: [0.34, 0.88, 0.33],
      },
      {
        // Left arm placed gracefully on hip
        upper: b.lu,
        lower: b.ll,
        hand: b.lh,
        upperDir: [0.58, -0.74, 0.34],
        lowerDir: [-0.66, -0.64, 0.38],
      },
    ],
    vrm.scene.parent,
    t
  );

  if (vrm.scene.parent) {
    vrm.scene.parent.updateWorldMatrix(true, false);
    vrm.scene.parent.getWorldQuaternion(_frameQ);
  } else {
    _frameQ.identity();
  }
  const frameQ = _frameQ.clone();
  orientHandInFrame({
    hand: b.rh,
    side: -1,
    isVrm0,
    fingerDir: [0.22, 0.96, 0.14],
    palmDir: [0.05, 0.0, 1.0],
    frameQ,
    t,
  });

  // Cute V peace-sign finger pose on right hand: index & middle straight, ring/little/thumb tucked!
  const h = vrm.humanoid;
  if (h) {
    const sideSign = isVrm0 ? -1 : 1;
    const setFinger = (name: VRMHumanBoneName, curl: number, spread = 0) => {
      const node = h.getNormalizedBoneNode(name);
      if (!node) return;
      if (name.includes('Thumb')) {
        node.rotation.y = THREE.MathUtils.lerp(node.rotation.y, sideSign * curl, t);
      } else {
        node.rotation.z = THREE.MathUtils.lerp(node.rotation.z, sideSign * curl, t);
        if (spread !== 0) {
          node.rotation.y = THREE.MathUtils.lerp(node.rotation.y, spread, t);
        }
      }
    };
    setFinger('rightIndexProximal', 0.05, isVrm0 ? -0.16 : 0.16);
    setFinger('rightIndexIntermediate', 0.05);
    setFinger('rightMiddleProximal', 0.05, isVrm0 ? 0.14 : -0.14);
    setFinger('rightMiddleIntermediate', 0.05);
    setFinger('rightRingProximal', 1.18);
    setFinger('rightRingIntermediate', 1.25);
    setFinger('rightLittleProximal', 1.22);
    setFinger('rightLittleIntermediate', 1.28);
    setFinger('rightThumbProximal', 0.85);
    setFinger('rightThumbDistal', 0.65);
  }
  return true;
}

/**
 * Convention-free smooth shoulder & overhead arm stretch (`stretch_look` in Roam):
 * Smoothly cycles from rolling hands gently up to her shoulders -> reaching gracefully overhead -> relaxing!
 * Never bends arms backward or flares them stiffly like a T-pose on VRM 0.x or VRM 1.0.
 */
export function applyShoulderStretchArms(
  vrm: VRM,
  elapsed: number,
  t: number
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;
  const isVrm0 = vrm.meta?.metaVersion === '0';

  // Smooth 6.4s breathing stretch cycle:
  //   0..0.45 : Raise both hands neatly to shoulders with gentle circular shoulder roll
  //   0.45..1 : Extend smoothly overhead in a refreshing stretch, then glide back to shoulders
  const phase = 0.5 - 0.5 * Math.cos(elapsed * 0.98);
  const roll = Math.sin(elapsed * 2.2) * 0.08;
  const lerp = THREE.MathUtils.lerp;

  // Shoulders-touch pose -> graceful overhead reach
  const lUp: [number, number, number] = [
    lerp(0.68, 0.36, phase),
    lerp(-0.18 + roll, 0.84, phase),
    lerp(0.70, 0.42, phase),
  ];
  const lLow: [number, number, number] = [
    lerp(-0.68, -0.16, phase),
    lerp(0.68 + roll * 0.5, 0.94, phase),
    lerp(0.28, 0.30, phase),
  ];
  const rUp: [number, number, number] = [
    lerp(-0.68, -0.36, phase),
    lerp(-0.18 - roll, 0.84, phase),
    lerp(0.70, 0.42, phase),
  ];
  const rLow: [number, number, number] = [
    lerp(0.68, 0.16, phase),
    lerp(0.68 - roll * 0.5, 0.94, phase),
    lerp(0.28, 0.30, phase),
  ];

  applyDirectedArms(
    [
      { upper: b.lu, lower: b.ll, hand: b.lh, upperDir: lUp, lowerDir: lLow },
      { upper: b.ru, lower: b.rl, hand: b.rh, upperDir: rUp, lowerDir: rLow },
    ],
    vrm.scene.parent,
    t
  );

  if (vrm.scene.parent) {
    vrm.scene.parent.updateWorldMatrix(true, false);
    vrm.scene.parent.getWorldQuaternion(_frameQ);
  } else {
    _frameQ.identity();
  }
  const frameQ = _frameQ.clone();
  orientHandInFrame({
    hand: b.lh,
    side: 1,
    isVrm0,
    fingerDir: [lerp(-0.75, -0.18, phase), lerp(0.55, 0.94, phase), 0.28],
    palmDir: [lerp(-0.4, -0.6, phase), lerp(-0.5, 0.1, phase), lerp(0.7, 0.78, phase)],
    frameQ,
    t,
  });
  orientHandInFrame({
    hand: b.rh,
    side: -1,
    isVrm0,
    fingerDir: [lerp(0.75, 0.18, phase), lerp(0.55, 0.94, phase), 0.28],
    palmDir: [lerp(0.4, 0.6, phase), lerp(-0.5, 0.1, phase), lerp(0.7, 0.78, phase)],
    frameQ,
    t,
  });
  return true;
}

/**
 * Convention-free helper for the remaining expressive upper-body emotes
 * (`thinking_chin`, `cat_paws`, `arms_behind_back`, `hands_on_hips`, `gentle_bow`, `lean_forward`, `pout_turn`).
 */
export function applyEmoteArms(
  vrm: VRM,
  kind:
    | 'thinking_chin'
    | 'cat_paws'
    | 'arms_behind_back'
    | 'hands_on_hips'
    | 'gentle_bow'
    | 'lean_forward'
    | 'pout_turn',
  age: number,
  t: number
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;
  const isVrm0 = vrm.meta?.metaVersion === '0';

  let lUp: [number, number, number] = [0.22, -0.94, 0.25];
  let lLow: [number, number, number] = [0.08, -0.90, 0.42];
  let rUp: [number, number, number] = [-0.22, -0.94, 0.25];
  let rLow: [number, number, number] = [-0.08, -0.90, 0.42];
  let palmsForward = false;

  if (kind === 'thinking_chin') {
    rUp = [-0.14, -0.58, 0.80];
    rLow = [0.44, 0.86, 0.24];
    lUp = [0.22, -0.82, 0.52];
    lLow = [-0.74, -0.18, 0.64];
  } else if (kind === 'cat_paws') {
    const bounce = Math.sin(age * 6.5) * 0.10;
    lUp = [0.26, -0.54 + bounce, 0.80];
    lLow = [-0.24, 0.74 + bounce, 0.62];
    rUp = [-0.26, -0.54 - bounce, 0.80];
    rLow = [0.24, 0.74 - bounce, 0.62];
    palmsForward = true;
  } else if (kind === 'arms_behind_back') {
    lUp = [0.28, -0.88, -0.38];
    lLow = [-0.62, -0.68, -0.38];
    rUp = [-0.28, -0.88, -0.38];
    rLow = [0.62, -0.68, -0.38];
  } else if (kind === 'hands_on_hips') {
    lUp = [0.58, -0.74, 0.34];
    lLow = [-0.68, -0.64, 0.36];
    rUp = [-0.58, -0.74, 0.34];
    rLow = [0.68, -0.64, 0.36];
  } else if (kind === 'gentle_bow') {
    lUp = [0.16, -0.94, 0.28];
    lLow = [-0.36, -0.78, 0.50];
    rUp = [-0.16, -0.94, 0.28];
    rLow = [0.36, -0.78, 0.50];
  } else if (kind === 'lean_forward') {
    lUp = [0.26, -0.90, 0.34];
    lLow = [-0.22, -0.84, 0.48];
    rUp = [-0.26, -0.90, 0.34];
    rLow = [0.22, -0.84, 0.48];
  } else if (kind === 'pout_turn') {
    lUp = [0.46, -0.82, 0.32];
    lLow = [-0.58, -0.72, 0.38];
    rUp = [-0.46, -0.82, 0.32];
    rLow = [0.58, -0.72, 0.38];
  }

  applyDirectedArms(
    [
      { upper: b.lu, lower: b.ll, hand: b.lh, upperDir: lUp, lowerDir: lLow },
      { upper: b.ru, lower: b.rl, hand: b.rh, upperDir: rUp, lowerDir: rLow },
    ],
    vrm.scene.parent,
    t
  );

  if (palmsForward) {
    if (vrm.scene.parent) {
      vrm.scene.parent.updateWorldMatrix(true, false);
      vrm.scene.parent.getWorldQuaternion(_frameQ);
    } else {
      _frameQ.identity();
    }
    const frameQ = _frameQ.clone();
    orientHandInFrame({
      hand: b.lh,
      side: 1,
      isVrm0,
      fingerDir: [-0.1, -0.25, 0.96],
      palmDir: [0, -0.85, 0.52],
      frameQ,
      t,
    });
    orientHandInFrame({
      hand: b.rh,
      side: -1,
      isVrm0,
      fingerDir: [0.1, -0.25, 0.96],
      palmDir: [0, -0.85, 0.52],
      frameQ,
      t,
    });
  }
  return true;
}

export interface DiningAnimFrame {
  /** 0..1 right hand reaching down to plate/utensil */
  dipToPlate: number;
  /** 0..1 how high right hand lifts a bite toward mouth */
  eatLift: number;
  /** True while right hand holds chopsticks (frame-exact handoff with table chopsticks!) */
  chopsticksInHand: boolean;
  /** True while tasty food bite is on the chopsticks before entering her mouth */
  biteOnChopsticks: boolean;
  /** 0..1 rhythmic chewing intensity */
  chewIntensity: number;
  /** 0..1 left hand reaching toward teacup on table */
  reachToMug: number;
  /** 0..1 how high left hand lifts the teacup mug toward lips */
  drinkLift: number;
  /** True while left hand holds teacup (frame-exact handoff with table teacup!) */
  mugInHand: boolean;
  /** 0..1 gentle wrist/cup tilt toward lips while taking a sip */
  mugTilt: number;
  /** Gentle head pitch offset in radians (+down toward plate, -up while sipping) */
  headPitch: number;
  /** Gentle head yaw toward plate or teacup */
  headYaw: number;
  /** Subtle head roll while enjoying food */
  headRoll: number;
  /** Gentle upper-body lean while eating / sipping */
  spineLeanX: number;
  /** Mouth shapes for bite / chew / sip */
  mouthAa: number;
  mouthIh: number;
  mouthOu: number;
  /** Happy savoring smile boost */
  happySmile: number;
}

function smoothPulse(t: number, start: number, peakStart: number, peakEnd: number, end: number): number {
  if (t <= start || t >= end) return 0;
  if (t < peakStart) {
    const u = (t - start) / Math.max(0.001, peakStart - start);
    return u * u * (3 - 2 * u);
  }
  if (t <= peakEnd) return 1;
  const u = (end - t) / Math.max(0.001, end - peakEnd);
  return u * u * (3 - 2 * u);
}

/**
 * Shared 11.0-second human dining cycle synchronized frame-for-frame between:
 *  - Avatar right/left arms, torso lean, head pitch/yaw/roll, and mouth/smile expressions
 *  - Handheld 3D chopsticks + food bite + teacup attached to her real VRM hand bones
 *  - Resting 3D chopsticks + teacup on the dining table (zero double-prop overlap!)
 *
 * Timeline (c in 0..11.0s):
 *  0.00..1.15s : Right hand reaches down to plate -> contacts chopsticks at 1.05s
 *  1.15..2.20s : Right hand smoothly lifts bite to mouth; mouth opens cleanly as bite arrives
 *  2.20..2.58s : Takes bite! Food bite disappears from chopsticks at 2.55s as mouth closes
 *  2.60..3.95s : Right hand smoothly lowers empty chopsticks back onto plate (sets down at 3.95s)
 *  2.65..5.10s : Chews happily with rhythmic jaw motion, gentle nod & warm smile
 *  5.10..6.15s : Left hand reaches out to teacup on table -> contacts mug at 6.00s
 *  6.15..7.25s : Left hand raises teacup smoothly to lips, tilts mug gently (`mugTilt`), purses lips (`ou`)
 *  8.20..9.35s : Left hand lowers teacup smoothly back onto table (sets down at 9.35s)
 *  9.35..11.0s : Relaxed savoring smile & gentle sway before next bite
 */
export function getDiningAnimationFrame(elapsed: number): DiningAnimFrame {
  const c = ((elapsed % 11.0) + 11.0) % 11.0;

  // Contact-cushioned pickup AND set-down curves so her hand touches the table right at handoff!
  const dipPickup = smoothPulse(c, 0.15, 0.90, 1.25, 1.85);
  const dipSetdown = smoothPulse(c, 3.35, 3.80, 4.10, 4.65);
  const dipToPlate = Math.min(1, dipPickup + dipSetdown);

  const eatLift = smoothPulse(c, 1.15, 2.15, 2.60, 3.85);
  const chopsticksInHand = c >= 1.05 && c <= 3.95;
  const biteOnChopsticks = c >= 1.05 && c <= 2.55;

  const chewWindow = smoothPulse(c, 2.65, 3.05, 4.65, 5.15);

  const mugPickup = smoothPulse(c, 5.10, 5.85, 6.20, 6.75);
  const mugSetdown = smoothPulse(c, 8.75, 9.20, 9.50, 10.05);
  const reachToMug = Math.min(1, mugPickup + mugSetdown);

  const drinkLift = smoothPulse(c, 6.15, 7.20, 8.15, 9.30);
  const mugInHand = c >= 6.0 && c <= 9.35;
  const mugTilt = smoothPulse(c, 6.95, 7.35, 8.0, 8.45);

  const biteOpen = smoothPulse(c, 1.85, 2.18, 2.48, 2.78) * 0.56;
  const chewWave = chewWindow * (0.11 + Math.abs(Math.sin(elapsed * 6.4)) * 0.17);
  const sipPurse = smoothPulse(c, 6.95, 7.25, 8.0, 8.45) * 0.44;

  const headPitch =
    dipPickup * 0.15 + // glance down at dish while picking up bite
    eatLift * 0.06 - // lean slightly into bite
    drinkLift * 0.09 - // slight chin tilt up while sipping drink
    mugTilt * 0.04 +
    Math.sin(elapsed * 3.4) * 0.025 * chewWindow;

  const headYaw = -dipPickup * 0.06 + reachToMug * 0.08 - drinkLift * 0.03;
  const headRoll =
    Math.sin(elapsed * 2.1) * 0.055 * (chewWindow + smoothPulse(c, 9.3, 9.8, 10.5, 10.95));
  const spineLeanX = dipToPlate * 0.05 + eatLift * 0.04 - mugTilt * 0.03;
  const happySmile = Math.max(
    chewWindow * 0.42,
    smoothPulse(c, 9.2, 9.65, 10.45, 10.95) * 0.50
  );

  return {
    dipToPlate,
    eatLift,
    chopsticksInHand,
    biteOnChopsticks,
    chewIntensity: chewWindow,
    reachToMug,
    drinkLift,
    mugInHand,
    mugTilt,
    headPitch,
    headYaw,
    headRoll,
    spineLeanX,
    mouthAa: Math.min(0.62, biteOpen + chewWave * 0.85),
    mouthIh: chewWave * 0.52,
    mouthOu: sipPurse,
    happySmile,
  };
}

/**
 * Convention-free realistic eating & drinking arm animation (identical on VRM 0.x and VRM 1.0).
 * Right arm reaches down to the plate, picks up a bite, lifts it smoothly to her mouth, and lowers chopsticks back;
 * Left arm reaches to her teacup mug, raises it smoothly to her lips with a gentle sip tilt, and sets it cleanly back down!
 */
export function applyDiningArms(
  vrm: VRM,
  elapsed: number,
  t: number
): DiningAnimFrame | null {
  const b = getArmBones(vrm);
  if (!b) return null;

  const f = getDiningAnimationFrame(elapsed);
  const lerp = THREE.MathUtils.lerp;
  const isVrm0 = vrm.meta?.metaVersion === '0';
  const wristSign = isVrm0 ? 1 : -1;

  // Outward carrying angle (~18°–24° elbow flare) keeps elbows down & comfortably away from the ribcage,
  // eliminating deltoid pinching while framing the tabletop/plate cleanly without clipping into cake/dishware!
  // Right arm (eating side, -X in character frame):
  const rUpX = lerp(lerp(-0.36, -0.32, f.dipToPlate), -0.40, f.eatLift);
  const rUpY = lerp(lerp(-0.66, -0.60, f.dipToPlate), -0.64, f.eatLift);
  const rUpZ = lerp(lerp(0.64, 0.70, f.dipToPlate), 0.65, f.eatLift);

  // Frame the right edge of the plate cleanly above tabletop (y ≈ 0.76) -> dip to chopsticks -> lift to chin side
  const rLowX = lerp(lerp(0.12, 0.26, f.dipToPlate), 0.20, f.eatLift);
  const rLowY = lerp(lerp(0.32, 0.22, f.dipToPlate), 0.94, f.eatLift);
  const rLowZ = lerp(lerp(0.92, 0.94, f.dipToPlate), 0.28, f.eatLift);

  // Distributed wrist pronation/supination so palm angles naturally inward/down (never flat-clipping cake!)
  const rHandEuler: [number, number, number] = [
    wristSign * (0.14 + 0.16 * f.dipToPlate + 0.22 * f.eatLift),
    -wristSign * (0.12 + 0.14 * f.eatLift),
    -wristSign * (0.08 + 0.08 * f.dipToPlate - 0.06 * f.eatLift),
  ];

  // Left arm (drinking mug side, +X in character frame):
  // Outward elbow flare -> frame left placemat/teacup -> raise smoothly in front of lips
  const lUpX = lerp(lerp(0.36, 0.34, f.reachToMug), 0.24, f.drinkLift);
  const lUpY = lerp(lerp(-0.66, -0.58, f.reachToMug), -0.32 - f.mugTilt * 0.03, f.drinkLift);
  const lUpZ = lerp(lerp(0.64, 0.70, f.reachToMug), 0.91, f.drinkLift);

  const lLowX = lerp(lerp(-0.10, 0.04, f.reachToMug), -0.46, f.drinkLift);
  const lLowY = lerp(lerp(0.30, 0.20, f.reachToMug), 0.82 + f.mugTilt * 0.04, f.drinkLift);
  const lLowZ = lerp(lerp(0.92, 0.96, f.reachToMug), 0.30, f.drinkLift);

  // Natural left-wrist orientation: palm angled softly inward around teacup (no horizontal tabletop slicing)
  const lHandEuler: [number, number, number] = [
    wristSign * (0.16 + 0.24 * f.reachToMug + 0.52 * f.drinkLift),
    wristSign * (0.12 + 0.16 * f.drinkLift + 0.16 * f.mugTilt),
    wristSign * (0.08 + 0.12 * f.drinkLift),
  ];

  applyDirectedArms(
    [
      {
        upper: b.ru,
        lower: b.rl,
        hand: b.rh,
        upperDir: [rUpX, rUpY, rUpZ],
        lowerDir: [rLowX, rLowY, rLowZ],
        handEuler: rHandEuler,
      },
      {
        upper: b.lu,
        lower: b.ll,
        hand: b.lh,
        upperDir: [lUpX, lUpY, lUpZ],
        lowerDir: [lLowX, lLowY, lLowZ],
        handEuler: lHandEuler,
      },
    ],
    vrm.scene.parent,
    t
  );

  // Smooth palm-angle refinement when hands frame the table/plate (prevents planar clipping into dishware)
  const restTableWeight = Math.max(0, 1 - Math.max(f.eatLift, f.drinkLift) * 1.4);
  if (restTableWeight > 0.08) {
    const frameObj = vrm.scene.parent || vrm.scene;
    frameObj.updateWorldMatrix(true, false);
    const frameQ = new THREE.Quaternion();
    frameObj.getWorldQuaternion(frameQ);
    const handT = t * restTableWeight;
    orientHandInFrame({
      hand: b.rh,
      side: -1,
      isVrm0,
      fingerDir: [0.22, -0.18, 0.95],
      palmDir: [0.62, -0.76, 0.18],
      frameQ,
      t: handT,
    });
    orientHandInFrame({
      hand: b.lh,
      side: 1,
      isVrm0,
      fingerDir: [-0.22, -0.18, 0.95],
      palmDir: [-0.62, -0.76, 0.18],
      frameQ,
      t: handT,
    });
  }

  return f;
}

export interface AnatomicalStretchFrame {
  hipsY: number;
  hipsZ: number;
  spineLeanX: number;
  spineBendZ: number;
  spineTwistY: number;
  chestArchX: number;
  chestBendZ: number;
  leftUpperLegX: number;
  leftUpperLegZ: number;
  rightUpperLegX: number;
  rightUpperLegZ: number;
  leftLowerLegX: number;
  rightLowerLegX: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  relaxedEyes: number;
  happySmile: number;
}

function quinticSmooth(x: number): number {
  const c = THREE.MathUtils.clamp(x, 0, 1);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

/**
 * Silky inhale -> relaxed peak hold (with subtle breath) -> slow exhale curve in [0, 1].
 */
function stretchHoldWave(phase01: number): number {
  const p = ((phase01 % 1) + 1) % 1;
  if (p < 0.34) return quinticSmooth(p / 0.34);
  if (p < 0.66) {
    const holdP = (p - 0.34) / 0.32;
    return 1 - 0.045 * Math.sin(holdP * Math.PI);
  }
  return 1 - quinticSmooth((p - 0.66) / 0.34);
}

/**
 * Computes full-body smooth anatomical stretching targets for hips, spine, chest,
 * legs/knees, and neck/head across all 5 AI-chosen stretching routines.
 * Positive upperLegX swings thigh forward; negative lowerLegX flexes knee backward.
 */
export function getAnatomicalStretchFrame(
  routine: StretchRoutineId,
  elapsed: number
): AnatomicalStretchFrame {
  const base: AnatomicalStretchFrame = {
    hipsY: 0,
    hipsZ: 0,
    spineLeanX: 0,
    spineBendZ: 0,
    spineTwistY: 0,
    chestArchX: 0,
    chestBendZ: 0,
    leftUpperLegX: 0,
    leftUpperLegZ: -0.045,
    rightUpperLegX: 0,
    rightUpperLegZ: -0.045,
    leftLowerLegX: -0.04,
    rightLowerLegX: -0.04,
    headPitch: 0,
    headYaw: 0,
    headRoll: 0,
    relaxedEyes: 0.2,
    happySmile: 0.25,
  };

  switch (routine) {
    case 'overhead_sky_reach': {
      // 8.4s cycle: tall graceful vertical reach -> gentle alternating ribcage elongation -> silky exhale (never bending backwards!)
      const w = stretchHoldWave(elapsed / 8.4);
      const ribSway = Math.sin(elapsed * 1.15) * w;
      return {
        ...base,
        hipsY: 0.022 * w,
        hipsZ: -ribSway * 0.04,
        spineLeanX: -0.04 * w,
        spineBendZ: ribSway * 0.07,
        spineTwistY: ribSway * 0.05,
        chestArchX: -0.07 * w,
        chestBendZ: ribSway * 0.08,
        leftUpperLegZ: -0.055,
        rightUpperLegZ: -0.055,
        leftLowerLegX: -0.02 * (1 - w),
        rightLowerLegX: -0.02 * (1 - w),
        headPitch: -0.14 * w,
        headYaw: ribSway * 0.06,
        headRoll: ribSway * 0.09,
        relaxedEyes: 0.65 * w,
        happySmile: 0.34,
      };
    }

    case 'lateral_side_bend': {
      // 11.2s full left-and-right alternating crescent side stretch
      const halfDur = 5.6;
      const sideSign = Math.floor(elapsed / halfDur) % 2 === 0 ? 1 : -1;
      const w = stretchHoldWave((elapsed % halfDur) / halfDur);
      const bend = sideSign * w;
      return {
        ...base,
        hipsY: -0.015 * w,
        hipsZ: -bend * 0.085, // Natural pelvic counter-shift for balance
        spineLeanX: 0.02 * w,
        spineBendZ: bend * 0.24,
        spineTwistY: -bend * 0.06,
        chestArchX: -0.05 * w,
        chestBendZ: bend * 0.22,
        leftUpperLegZ: -0.11,
        rightUpperLegZ: -0.11,
        leftLowerLegX: -0.06 * w,
        rightLowerLegX: -0.06 * w,
        headPitch: -0.04 * w,
        headYaw: -bend * 0.08,
        headRoll: bend * 0.22,
        relaxedEyes: 0.48 * w,
        happySmile: 0.3,
      };
    }

    case 'neck_shoulder_rolls': {
      // Fluid, relaxing cervical circles paired with slow scapula & upper-chest opening
      const angle = elapsed * 0.95;
      const openWave = 0.5 - 0.5 * Math.cos(elapsed * 1.1);
      return {
        ...base,
        hipsY: Math.sin(elapsed * 1.1) * 0.012,
        hipsZ: Math.sin(elapsed * 0.65) * 0.025,
        spineLeanX: -0.03 * openWave,
        spineBendZ: Math.sin(angle) * 0.05,
        spineTwistY: Math.cos(angle) * 0.07,
        chestArchX: -0.11 * openWave,
        chestBendZ: Math.sin(angle) * 0.06,
        leftUpperLegZ: -0.055,
        rightUpperLegZ: -0.055,
        leftLowerLegX: -0.05,
        rightLowerLegX: -0.05,
        headPitch: 0.08 + Math.cos(angle) * 0.19,
        headYaw: Math.sin(angle) * 0.24,
        headRoll: Math.sin(angle + 0.6) * 0.22,
        relaxedEyes: 0.58 * openWave + 0.15,
        happySmile: 0.32,
      };
    }

    case 'forward_hamstring_fold': {
      // 9.4s graceful forward hip-hinge fold with soft anatomical micro-bent knees, then rolling tall
      const w = stretchHoldWave(elapsed / 9.4);
      const sway = Math.sin(elapsed * 1.35) * 0.04 * w;
      return {
        ...base,
        hipsY: -0.045 * w,
        hipsZ: sway * 0.5,
        spineLeanX: 0.36 * w,
        spineBendZ: sway,
        spineTwistY: sway * 0.7,
        chestArchX: 0.22 * w - 0.04 * (1 - w),
        chestBendZ: sway * 0.6,
        leftUpperLegX: -0.06 * w,
        rightUpperLegX: -0.06 * w,
        leftUpperLegZ: -0.075,
        rightUpperLegZ: -0.075,
        leftLowerLegX: -0.16 * w - 0.03,
        rightLowerLegX: -0.16 * w - 0.03,
        headPitch: 0.22 * w - 0.04 * (1 - w),
        headYaw: sway * 0.8,
        headRoll: sway * 0.6,
        relaxedEyes: 0.45 * w,
        happySmile: 0.22,
      };
    }

    case 'quad_runner_lunge': {
      // 11.6s smooth alternating crescent lunge (front knee flexes forward, rear hip flexor opens)
      const halfDur = 5.8;
      const leftForward = Math.floor(elapsed / halfDur) % 2 === 0;
      const w = stretchHoldWave((elapsed % halfDur) / halfDur);
      const frontUpper = 0.52 * w;
      const frontKnee = -0.62 * w;
      const backUpper = -0.34 * w;
      const backKnee = -0.28 * w;
      return {
        ...base,
        hipsY: -0.12 * w,
        hipsZ: (leftForward ? 0.03 : -0.03) * w,
        spineLeanX: 0.06 * w,
        spineBendZ: 0,
        spineTwistY: (leftForward ? -0.08 : 0.08) * w,
        chestArchX: -0.11 * w,
        chestBendZ: 0,
        leftUpperLegX: leftForward ? frontUpper : backUpper,
        rightUpperLegX: leftForward ? backUpper : frontUpper,
        leftUpperLegZ: -0.085,
        rightUpperLegZ: -0.085,
        leftLowerLegX: leftForward ? frontKnee : backKnee,
        rightLowerLegX: leftForward ? backKnee : frontKnee,
        headPitch: -0.10 * w,
        headYaw: (leftForward ? 0.06 : -0.06) * w,
        headRoll: 0,
        relaxedEyes: 0.36 * w,
        happySmile: 0.34,
      };
    }
  }
}

/**
 * Convention-free smooth flexible anatomical arm & wrist choreography for all 5 AI stretching routines.
 * Solved in character frame (+X left, +Y up, +Z forward) so VRM 0.x & VRM 1.0 match seamlessly.
 */
export function applyAnatomicalStretchArms(
  vrm: VRM,
  routine: StretchRoutineId,
  elapsed: number,
  t: number
): boolean {
  const b = getArmBones(vrm);
  if (!b) return false;
  const wristSign = vrm.meta?.metaVersion === '0' ? 1 : -1;

  let lUp: [number, number, number] = [0.22, -0.92, 0.16];
  let lLow: [number, number, number] = [0.12, -0.94, 0.24];
  let rUp: [number, number, number] = [-0.22, -0.92, 0.16];
  let rLow: [number, number, number] = [-0.12, -0.94, 0.24];
  let lHandEuler: [number, number, number] = [0, 0, 0];
  let rHandEuler: [number, number, number] = [0, 0, 0];

  if (routine === 'overhead_sky_reach') {
    const w = stretchHoldWave(elapsed / 8.4);
    const sway = Math.sin(elapsed * 1.15) * 0.16 * w;
    // Sweep smoothly from relaxed sides -> wide sunlit arc -> tall interlaced sky reach
    const outFlare = Math.sin(w * Math.PI) * 0.48;
    lUp = [
      THREE.MathUtils.lerp(0.22, 0.24, w) + outFlare + sway,
      THREE.MathUtils.lerp(-0.92, 0.96, w),
      THREE.MathUtils.lerp(0.14, 0.16, w),
    ];
    lLow = [
      THREE.MathUtils.lerp(0.12, -0.26, w) + outFlare * 0.35 + sway,
      THREE.MathUtils.lerp(-0.94, 0.94, w),
      THREE.MathUtils.lerp(0.22, 0.18, w),
    ];
    rUp = [
      THREE.MathUtils.lerp(-0.22, -0.24, w) - outFlare + sway,
      THREE.MathUtils.lerp(-0.92, 0.96, w),
      THREE.MathUtils.lerp(0.14, 0.16, w),
    ];
    rLow = [
      THREE.MathUtils.lerp(-0.12, 0.26, w) - outFlare * 0.35 + sway,
      THREE.MathUtils.lerp(-0.94, 0.94, w),
      THREE.MathUtils.lerp(0.22, 0.18, w),
    ];
    lHandEuler = [wristSign * 0.22 * w, 0, wristSign * -0.18 * w];
    rHandEuler = [wristSign * 0.22 * w, 0, wristSign * 0.18 * w];
  } else if (routine === 'lateral_side_bend') {
    const halfDur = 5.6;
    const bendLeft = Math.floor(elapsed / halfDur) % 2 === 0;
    const w = stretchHoldWave((elapsed % halfDur) / halfDur);
    // Top arm sweeps in a graceful crescent arc overhead; bottom hand rests naturally on hip!
    if (bendLeft) {
      // Bending left (+X): right arm sweeps overhead toward +X, left hand rests on left hip
      rUp = [
        THREE.MathUtils.lerp(-0.22, -0.28, w),
        THREE.MathUtils.lerp(-0.92, 0.92, w),
        THREE.MathUtils.lerp(0.14, 0.22, w),
      ];
      rLow = [
        THREE.MathUtils.lerp(-0.12, 0.72, w),
        THREE.MathUtils.lerp(-0.94, 0.68, w),
        THREE.MathUtils.lerp(0.22, 0.18, w),
      ];
      lUp = [
        THREE.MathUtils.lerp(0.22, 0.56, w),
        THREE.MathUtils.lerp(-0.92, -0.78, w),
        THREE.MathUtils.lerp(0.14, 0.16, w),
      ];
      lLow = [
        THREE.MathUtils.lerp(0.12, -0.58, w),
        THREE.MathUtils.lerp(-0.94, -0.54, w),
        THREE.MathUtils.lerp(0.22, 0.56, w),
      ];
      rHandEuler = [wristSign * 0.12 * w, 0, wristSign * 0.24 * w];
    } else {
      // Bending right (-X): left arm sweeps overhead toward -X, right hand rests on right hip
      lUp = [
        THREE.MathUtils.lerp(0.22, 0.28, w),
        THREE.MathUtils.lerp(-0.92, 0.92, w),
        THREE.MathUtils.lerp(0.14, 0.22, w),
      ];
      lLow = [
        THREE.MathUtils.lerp(0.12, -0.72, w),
        THREE.MathUtils.lerp(-0.94, 0.68, w),
        THREE.MathUtils.lerp(0.22, 0.18, w),
      ];
      rUp = [
        THREE.MathUtils.lerp(-0.22, -0.56, w),
        THREE.MathUtils.lerp(-0.92, -0.78, w),
        THREE.MathUtils.lerp(0.14, 0.16, w),
      ];
      rLow = [
        THREE.MathUtils.lerp(-0.12, 0.58, w),
        THREE.MathUtils.lerp(-0.94, -0.54, w),
        THREE.MathUtils.lerp(0.22, 0.56, w),
      ];
      lHandEuler = [wristSign * 0.12 * w, 0, wristSign * -0.24 * w];
    }
  } else if (routine === 'neck_shoulder_rolls') {
    // Fluid circular shoulder & scapula rolls: elbows float smoothly up, wide, open back, and down
    const roll = elapsed * 1.1;
    const lift = 0.5 - 0.5 * Math.cos(roll);
    const sweep = Math.sin(roll);
    lUp = [0.34 + lift * 0.36, -0.78 + lift * 0.56, 0.16 + sweep * 0.34];
    lLow = [-0.26 - lift * 0.14, -0.55 + lift * 0.72, 0.62 + sweep * 0.22];
    rUp = [-0.34 - lift * 0.36, -0.78 + lift * 0.56, 0.16 + sweep * 0.34];
    rLow = [0.26 + lift * 0.14, -0.55 + lift * 0.72, 0.62 + sweep * 0.22];
    lHandEuler = [wristSign * 0.14 * lift, 0, wristSign * -0.1 * sweep];
    rHandEuler = [wristSign * 0.14 * lift, 0, wristSign * 0.1 * sweep];
  } else if (routine === 'forward_hamstring_fold') {
    // Graceful inhale arm sweep -> cascading forward fold toward toes/shins -> gentle ragdoll sway
    const w = stretchHoldWave(elapsed / 9.4);
    const sway = Math.sin(elapsed * 1.35) * 0.08 * w;
    lUp = [
      THREE.MathUtils.lerp(0.24, 0.14, w) + sway,
      THREE.MathUtils.lerp(-0.88, -0.42, w),
      THREE.MathUtils.lerp(0.18, 0.88, w),
    ];
    lLow = [
      THREE.MathUtils.lerp(0.12, -0.06, w) + sway,
      THREE.MathUtils.lerp(-0.92, -0.78, w),
      THREE.MathUtils.lerp(0.24, 0.62, w),
    ];
    rUp = [
      THREE.MathUtils.lerp(-0.24, -0.14, w) + sway,
      THREE.MathUtils.lerp(-0.88, -0.42, w),
      THREE.MathUtils.lerp(0.18, 0.88, w),
    ];
    rLow = [
      THREE.MathUtils.lerp(-0.12, 0.06, w) + sway,
      THREE.MathUtils.lerp(-0.92, -0.78, w),
      THREE.MathUtils.lerp(0.24, 0.62, w),
    ];
    lHandEuler = [wristSign * -0.18 * w, 0, 0];
    rHandEuler = [wristSign * -0.18 * w, 0, 0];
  } else if (routine === 'quad_runner_lunge') {
    // Crescent warrior lunge reach: sweep arms smoothly forward and skyward as hips sink into lunge
    const halfDur = 5.8;
    const w = stretchHoldWave((elapsed % halfDur) / halfDur);
    lUp = [
      THREE.MathUtils.lerp(0.24, 0.34, w),
      THREE.MathUtils.lerp(-0.88, 0.84, w),
      THREE.MathUtils.lerp(0.18, 0.42, w),
    ];
    lLow = [
      THREE.MathUtils.lerp(0.12, 0.08, w),
      THREE.MathUtils.lerp(-0.92, 0.94, w),
      THREE.MathUtils.lerp(0.24, 0.32, w),
    ];
    rUp = [
      THREE.MathUtils.lerp(-0.24, -0.34, w),
      THREE.MathUtils.lerp(-0.88, 0.84, w),
      THREE.MathUtils.lerp(0.18, 0.42, w),
    ];
    rLow = [
      THREE.MathUtils.lerp(-0.12, -0.08, w),
      THREE.MathUtils.lerp(-0.92, 0.94, w),
      THREE.MathUtils.lerp(0.24, 0.32, w),
    ];
    lHandEuler = [wristSign * 0.16 * w, 0, wristSign * -0.1 * w];
    rHandEuler = [wristSign * 0.16 * w, 0, wristSign * 0.1 * w];
  }

  applyDirectedArms(
    [
      { upper: b.lu, lower: b.ll, hand: b.lh, upperDir: lUp, lowerDir: lLow, handEuler: lHandEuler },
      { upper: b.ru, lower: b.rl, hand: b.rh, upperDir: rUp, lowerDir: rLow, handEuler: rHandEuler },
    ],
    vrm.scene.parent,
    t
  );
  return true;
}

export interface ActivityAnimFrame {
  headPitch: number;
  headYaw: number;
  headRoll: number;
  spineTwistY: number;
  spineLeanX: number;
  mouthIh: number;
  happySmile: number;
  relaxedEyes: number;
}

/**
 * Head, torso, and expression motion for every autonomous hobby, school, bath, and stretching activity.
 */
export function getHobbyActivityFrame(
  hobbyKind: HobbyKindId,
  elapsed: number,
  stretchRoutine: StretchRoutineId = 'overhead_sky_reach'
): ActivityAnimFrame {
  switch (hobbyKind) {
    case 'stretching': {
      const sf = getAnatomicalStretchFrame(stretchRoutine, elapsed);
      return {
        headPitch: sf.headPitch,
        headYaw: sf.headYaw,
        headRoll: sf.headRoll,
        spineTwistY: sf.spineTwistY,
        spineLeanX: sf.spineLeanX,
        mouthIh: 0,
        happySmile: sf.happySmile,
        relaxedEyes: sf.relaxedEyes,
      };
    }
    case 'studying': {
      // Attentively looking down at lined notebook, glancing up thoughtfully every 6.5s
      const thinkUp = smoothPulse(elapsed % 6.5, 4.4, 4.9, 5.5, 6.0);
      return {
        headPitch: THREE.MathUtils.lerp(0.24, -0.05, thinkUp),
        headYaw: Math.sin(elapsed * 1.4) * 0.06,
        headRoll: thinkUp * 0.09,
        spineTwistY: -0.04,
        spineLeanX: THREE.MathUtils.lerp(0.07, 0.01, thinkUp),
        mouthIh: 0,
        happySmile: 0.14,
        relaxedEyes: 0,
      };
    }
    case 'brushing_teeth':
      return {
        headPitch: 0.03 + Math.cos(elapsed * 4.2) * 0.02,
        headYaw: Math.sin(elapsed * 2.0) * 0.05,
        headRoll: 0.06 + Math.sin(elapsed * 8.4) * 0.022,
        spineTwistY: Math.sin(elapsed * 2.0) * 0.025,
        spineLeanX: 0.04,
        mouthIh: 0.28 + Math.abs(Math.sin(elapsed * 8.4)) * 0.11,
        happySmile: 0.25,
        relaxedEyes: 0,
      };
    case 'gym_weights':
      return {
        headPitch: 0.02 + Math.sin(elapsed * 2.8) * 0.03,
        headYaw: Math.sin(elapsed * 1.4) * 0.08,
        headRoll: Math.sin(elapsed * 2.8) * 0.04,
        spineTwistY: Math.sin(elapsed * 2.8) * 0.05,
        spineLeanX: 0.02,
        mouthIh: 0.06,
        happySmile: 0.45,
        relaxedEyes: 0,
      };
    case 'gym_treadmill':
      return {
        headPitch: 0.04 + Math.abs(Math.sin(elapsed * 6.8)) * 0.025,
        headYaw: Math.sin(elapsed * 1.6) * 0.05,
        headRoll: Math.sin(elapsed * 3.4) * 0.03,
        spineTwistY: Math.sin(elapsed * 6.8) * 0.06,
        spineLeanX: 0.07,
        mouthIh: 0.12,
        happySmile: 0.40,
        relaxedEyes: 0,
      };
    case 'sports_basketball':
      return {
        headPitch: -0.06 + Math.sin(elapsed * 2.4) * 0.08,
        headYaw: -0.14 + Math.sin(elapsed * 1.8) * 0.10,
        headRoll: Math.sin(elapsed * 2.4) * 0.04,
        spineTwistY: -0.08 + Math.sin(elapsed * 2.4) * 0.09,
        spineLeanX: 0.06,
        mouthIh: 0.08,
        happySmile: 0.52,
        relaxedEyes: 0,
      };
    case 'sports_tennis':
      return {
        headPitch: 0.02 + Math.sin(elapsed * 3.2) * 0.04,
        headYaw: Math.sin(elapsed * 2.2) * 0.16,
        headRoll: Math.sin(elapsed * 2.2) * 0.05,
        spineTwistY: Math.sin(elapsed * 2.2) * 0.16,
        spineLeanX: 0.08,
        mouthIh: 0.08,
        happySmile: 0.50,
        relaxedEyes: 0,
      };
    case 'showering':
      return {
        headPitch: -0.10 + Math.sin(elapsed * 1.6) * 0.05,
        headYaw: Math.sin(elapsed * 1.2) * 0.10,
        headRoll: Math.sin(elapsed * 2.2) * 0.08,
        spineTwistY: Math.sin(elapsed * 1.4) * 0.05,
        spineLeanX: -0.04 + Math.sin(elapsed * 1.5) * 0.02,
        mouthIh: 0,
        happySmile: 0.30,
        relaxedEyes: 0.55,
      };
    case 'towel_dry':
      return {
        headPitch: 0.04 + Math.sin(elapsed * 4.0) * 0.032,
        headYaw: Math.sin(elapsed * 2.5) * 0.10,
        headRoll: Math.sin(elapsed * 4.8) * 0.085,
        spineTwistY: Math.sin(elapsed * 2.5) * 0.06,
        spineLeanX: 0.03 + Math.sin(elapsed * 4.0) * 0.015,
        mouthIh: 0,
        happySmile: 0.42,
        relaxedEyes: 0.25,
      };
    case 'painting':
      return {
        headPitch: 0.04 + Math.sin(elapsed * 1.9) * 0.04,
        headYaw: 0.22 + Math.sin(elapsed * 1.1) * 0.06,
        headRoll: -0.05 + Math.sin(elapsed * 1.5) * 0.04,
        spineTwistY: 0.13 + Math.sin(elapsed * 1.2) * 0.03,
        spineLeanX: 0.04 + Math.sin(elapsed * 1.9) * 0.02,
        mouthIh: 0,
        happySmile: 0.32,
        relaxedEyes: 0,
      };
    case 'music_keyboard':
      return {
        headPitch: 0.09 + Math.sin(elapsed * 4.0) * 0.055,
        headYaw: Math.sin(elapsed * 1.5) * 0.13,
        headRoll: Math.sin(elapsed * 2.1) * 0.095,
        spineTwistY: Math.sin(elapsed * 1.5) * 0.08,
        spineLeanX: 0.04 + Math.sin(elapsed * 2.0) * 0.025,
        mouthIh: 0,
        happySmile: 0.48,
        relaxedEyes: 0.15,
      };
    case 'gaming':
      return {
        headPitch: 0.04 + Math.sin(elapsed * 2.9) * 0.028,
        headYaw: Math.sin(elapsed * 2.2) * 0.085,
        headRoll: Math.sin(elapsed * 2.6) * 0.065,
        spineTwistY: Math.sin(elapsed * 2.1) * 0.065,
        spineLeanX: 0.06 + Math.sin(elapsed * 2.6) * 0.02,
        mouthIh: 0,
        happySmile: 0.34,
        relaxedEyes: 0,
      };
    case 'reading':
      return {
        headPitch: 0.23,
        headYaw: Math.sin(elapsed * 0.85) * 0.06,
        headRoll: Math.sin(elapsed * 0.7) * 0.04,
        spineTwistY: 0,
        spineLeanX: 0.05,
        mouthIh: 0,
        happySmile: 0.26,
        relaxedEyes: 0.12,
      };
    case 'journaling':
      return {
        headPitch: 0.22,
        headYaw: Math.sin(elapsed * 1.1) * 0.05,
        headRoll: -0.06,
        spineTwistY: -0.03,
        spineLeanX: 0.07,
        mouthIh: 0,
        happySmile: 0.30,
        relaxedEyes: 0,
      };
    case 'baking':
      return {
        headPitch: 0.15 + Math.sin(elapsed * 4.4) * 0.028,
        headYaw: Math.sin(elapsed * 1.7) * 0.08,
        headRoll: Math.sin(elapsed * 2.2) * 0.055,
        spineTwistY: Math.sin(elapsed * 4.8) * 0.05,
        spineLeanX: 0.05 + Math.sin(elapsed * 2.4) * 0.02,
        mouthIh: 0,
        happySmile: 0.45,
        relaxedEyes: 0,
      };
    case 'photography': {
      const snap = smoothPulse(elapsed % 5.0, 2.0, 2.4, 3.2, 3.7);
      return {
        headPitch: -0.02,
        headYaw: -0.10 * snap,
        headRoll: 0.11 * snap,
        spineTwistY: -0.08 * snap,
        spineLeanX: 0.04 * snap,
        mouthIh: 0,
        happySmile: 0.38,
        relaxedEyes: 0,
      };
    }
    case 'yoga':
    default: {
      const cycle = 0.5 - 0.5 * Math.cos(elapsed * 0.85);
      return {
        headPitch: -0.12 * cycle,
        headYaw: 0,
        headRoll: Math.sin(elapsed * 0.65) * 0.04,
        spineTwistY: 0,
        spineLeanX: -0.05 * cycle,
        mouthIh: 0,
        happySmile: 0.22,
        relaxedEyes: 0.55 * cycle,
      };
    }
  }
}

/**
 * Convention-free physical 3D arm animations for ALL 12 autonomous hobbies, school studying,
 * and bathroom care routines (works identically on VRM 0.x and VRM 1.0!).
 */
export function applyHobbyActivityArms(
  vrm: VRM,
  hobbyKind: HobbyKindId,
  elapsed: number,
  t: number,
  stretchRoutine: StretchRoutineId = 'overhead_sky_reach'
): boolean {
  if (hobbyKind === 'stretching') {
    return applyAnatomicalStretchArms(vrm, stretchRoutine, elapsed, t);
  }
  const b = getArmBones(vrm);
  if (!b) return false;

  let lUp: [number, number, number] = [0.16, -0.82, 0.55];
  let lLow: [number, number, number] = [-0.25, -0.15, 0.95];
  let rUp: [number, number, number] = [-0.16, -0.82, 0.55];
  let rLow: [number, number, number] = [0.25, -0.15, 0.95];

  if (hobbyKind === 'studying' || hobbyKind === 'journaling') {
    // BOTH elbows comfortably flared outward (~20°) and forearms elevated cleanly ABOVE the desk top (y = 0.74)
    // so her right hand writes pen strokes directly onto the open notebook while her left hand steadies the page!
    const writeX = Math.sin(elapsed * 3.8) * 0.14;
    const writeZ = Math.cos(elapsed * 1.3) * 0.06;
    const writeBob = Math.abs(Math.sin(elapsed * 7.6)) * 0.03;
    rUp = [-0.36 + writeX * 0.14, -0.50, 0.78 + writeZ * 0.12];
    rLow = [0.30 + writeX, 0.10 + writeBob, 0.94 + writeZ];
    lUp = [0.36, -0.54, 0.76];
    lLow = [-0.28, 0.08, 0.95];
  } else if (hobbyKind === 'brushing_teeth') {
    // Natural right-hand toothbrushing: elbow tucked comfortably forward-out, hand poised right beside
    // her mouth with gentle horizontal side-to-side brushing oscillation (synced with live mouth-aimed toothbrush!)
    const brush = Math.sin(elapsed * 8.8) * 0.065;
    rUp = [-0.26, -0.46, 0.85];
    rLow = [0.40 + brush, 0.88 + Math.cos(elapsed * 4.4) * 0.035, -0.14];
    // Left hand rests lightly & naturally near the vanity sink counter
    lUp = [0.16, -0.84, 0.52];
    lLow = [-0.18, -0.22, 0.95];
  } else if (hobbyKind === 'showering') {
    // Both arms raised up to hair/head, massaging shampoo into hair in alternating circular motions!
    const scrubL = Math.sin(elapsed * 5.2);
    const scrubR = Math.cos(elapsed * 5.2);
    lUp = [0.46 + scrubL * 0.06, 0.34 + scrubR * 0.06, 0.82];
    lLow = [-0.72 + scrubR * 0.09, 0.62 + scrubL * 0.08, -0.26];
    rUp = [-0.46 - scrubR * 0.06, 0.34 + scrubL * 0.06, 0.82];
    rLow = [0.72 - scrubL * 0.09, 0.62 + scrubR * 0.08, -0.26];
  } else if (hobbyKind === 'towel_dry') {
    // Both hands raised beside head actively fluffing & drying hair with a bath towel!
    const rub = Math.sin(elapsed * 5.2);
    lUp = [0.42 + rub * 0.08, 0.16, 0.88];
    lLow = [-0.66 - rub * 0.12, 0.68 + Math.abs(rub) * 0.08, -0.22];
    rUp = [-0.42 + rub * 0.08, 0.16, 0.88];
    rLow = [0.66 - rub * 0.12, 0.68 + Math.abs(rub) * 0.08, -0.22];
  } else if (hobbyKind === 'painting') {
    // Left arm holds artist palette; right arm paints graceful expressive strokes on easel!
    const strokeY = Math.sin(elapsed * 2.8) * 0.28;
    const strokeX = Math.cos(elapsed * 1.9) * 0.18;
    const dipPalette = smoothPulse(elapsed % 6.0, 4.5, 5.0, 5.3, 5.8);
    lUp = [0.22, -0.60, 0.77];
    lLow = [-0.30, 0.18, 0.93];
    rUp = [
      THREE.MathUtils.lerp(0.18 + strokeX * 0.3, 0.05, dipPalette),
      THREE.MathUtils.lerp(-0.22 + strokeY * 0.25, -0.52, dipPalette),
      0.95,
    ];
    rLow = [
      THREE.MathUtils.lerp(0.28 + strokeX, 0.62, dipPalette),
      THREE.MathUtils.lerp(0.26 + strokeY, -0.10, dipPalette),
      0.88,
    ];
  } else if (hobbyKind === 'music_keyboard') {
    // Both hands dancing rhythmically across piano / synth keyboard keys!
    const tapL = Math.sin(elapsed * 6.8) * 0.09;
    const tapR = Math.cos(elapsed * 7.4) * 0.09;
    const glideL = Math.sin(elapsed * 1.7) * 0.16;
    const glideR = Math.cos(elapsed * 2.1) * 0.18;
    lUp = [0.22 + glideL * 0.2, -0.68, 0.70];
    lLow = [-0.14 + glideL, -0.18 + tapL, 0.96];
    rUp = [-0.22 + glideR * 0.2, -0.68, 0.70];
    rLow = [0.14 + glideR, -0.18 + tapR, 0.96];
  } else if (hobbyKind === 'gaming') {
    // Lively WASD + mouse / controller gaming micro-motions!
    const click = Math.sin(elapsed * 11.0) * 0.04;
    const flick = Math.sin(elapsed * 3.4) * 0.12;
    lUp = [0.20, -0.72, 0.66];
    lLow = [-0.28, -0.16 + Math.abs(click), 0.94];
    rUp = [-0.20, -0.72, 0.66];
    rLow = [0.26 + flick, -0.18 - Math.abs(click), 0.94];
  } else if (hobbyKind === 'reading') {
    // Holding open manga/book with both hands, right hand turns a page every 4.5s!
    const turnPage = smoothPulse(elapsed % 4.5, 2.8, 3.3, 3.55, 4.1);
    lUp = [0.18, -0.66, 0.73];
    lLow = [-0.36, 0.14, 0.92];
    rUp = [-0.18, THREE.MathUtils.lerp(-0.66, -0.54, turnPage), 0.74];
    rLow = [
      THREE.MathUtils.lerp(0.36, 0.72, turnPage),
      THREE.MathUtils.lerp(0.14, 0.34, turnPage),
      THREE.MathUtils.lerp(0.92, 0.62, turnPage),
    ];
  } else if (hobbyKind === 'baking') {
    // Left arm steadies mixing bowl; right arm whisks & stirs batter in lively circles!
    const stirX = Math.cos(elapsed * 5.8) * 0.18;
    const stirZ = Math.sin(elapsed * 5.8) * 0.14;
    lUp = [0.24, -0.66, 0.71];
    lLow = [-0.46, -0.22, 0.86];
    rUp = [-0.20 + stirX * 0.3, -0.62, 0.75 + stirZ * 0.2];
    rLow = [0.36 + stirX, -0.24 + Math.abs(stirZ) * 0.3, 0.88 + stirZ];
  } else if (hobbyKind === 'photography') {
    // Raising viewfinder camera up to eye level, framing & snapping, then lowering to review!
    const aim = smoothPulse(elapsed % 5.0, 1.4, 2.1, 3.3, 4.1);
    lUp = [0.26, THREE.MathUtils.lerp(-0.68, -0.18, aim), THREE.MathUtils.lerp(0.68, 0.94, aim)];
    lLow = [-0.52, THREE.MathUtils.lerp(0.10, 0.74, aim), THREE.MathUtils.lerp(0.84, 0.42, aim)];
    rUp = [-0.26, THREE.MathUtils.lerp(-0.68, -0.18, aim), THREE.MathUtils.lerp(0.68, 0.94, aim)];
    rLow = [0.52, THREE.MathUtils.lerp(0.10, 0.74, aim), THREE.MathUtils.lerp(0.84, 0.42, aim)];
  } else if (hobbyKind === 'gym_weights') {
    // Stable athletic alternating dumbbell bicep curls with ~18° outward elbow carrying angle
    // (elbows stay anchored at sides, zero deltoid pinching or wrist over-folding!)
    const curlL = 0.5 - 0.5 * Math.cos(elapsed * 2.6);
    const curlR = 0.5 - 0.5 * Math.cos(elapsed * 2.6 + Math.PI);
    lUp = [0.30, -0.92, 0.24];
    lLow = [-0.04, THREE.MathUtils.lerp(-0.34, 0.78, curlL), THREE.MathUtils.lerp(0.93, 0.62, curlL)];
    rUp = [-0.30, -0.92, 0.24];
    rLow = [0.04, THREE.MathUtils.lerp(-0.34, 0.78, curlR), THREE.MathUtils.lerp(0.93, 0.62, curlR)];
  } else if (hobbyKind === 'gym_treadmill') {
    // Energetic cardio runner pumping arms in rhythm with treadmill stride!
    const pump = Math.sin(elapsed * 6.8);
    lUp = [0.22, -0.78 + pump * 0.16, 0.22 + pump * 0.55];
    lLow = [-0.14, 0.16 + pump * 0.28, 0.92];
    rUp = [-0.22, -0.78 - pump * 0.16, 0.22 - pump * 0.55];
    rLow = [0.14, 0.16 - pump * 0.28, 0.92];
  } else if (hobbyKind === 'sports_basketball') {
    // Lively dribble cycles followed by an athletic high jump-shot follow-through!
    const phase = elapsed % 4.2;
    const shoot = smoothPulse(phase, 2.5, 3.0, 3.4, 4.0);
    const dribble = Math.sin(elapsed * 7.8) * 0.18;
    rUp = [-0.24, THREE.MathUtils.lerp(-0.68, 0.62, shoot), THREE.MathUtils.lerp(0.68, 0.72, shoot)];
    rLow = [0.12, THREE.MathUtils.lerp(-0.28 + dribble, 0.88, shoot), THREE.MathUtils.lerp(0.92, 0.42, shoot)];
    lUp = [0.26, THREE.MathUtils.lerp(-0.74, 0.38, shoot), THREE.MathUtils.lerp(0.58, 0.82, shoot)];
    lLow = [-0.22, THREE.MathUtils.lerp(-0.14, 0.66, shoot), THREE.MathUtils.lerp(0.92, 0.66, shoot)];
  } else if (hobbyKind === 'sports_tennis') {
    // Crisp athletic forehand & follow-through tennis racket rallies!
    const swing = Math.sin(elapsed * 2.4);
    rUp = [-0.36 + swing * 0.34, -0.42 + Math.max(0, swing) * 0.38, 0.72 + swing * 0.22];
    rLow = [0.24 + swing * 0.58, -0.05 + Math.max(0, swing) * 0.52, 0.82];
    lUp = [0.30, -0.68, 0.64];
    lLow = [-0.28, 0.08, 0.92];
  } else if (hobbyKind === 'yoga') {
    // Calm flowing Sun-Salutation: sweep arms wide & high overhead -> glide down to heart prayer!
    const raise = 0.5 - 0.5 * Math.cos(elapsed * 0.85);
    lUp = [
      THREE.MathUtils.lerp(0.28, 0.38, raise),
      THREE.MathUtils.lerp(-0.74, 0.88, raise),
      THREE.MathUtils.lerp(0.60, 0.24, raise),
    ];
    lLow = [
      THREE.MathUtils.lerp(-0.82, -0.32, raise),
      THREE.MathUtils.lerp(0.32, 0.94, raise),
      THREE.MathUtils.lerp(0.48, 0.16, raise),
    ];
    rUp = [
      THREE.MathUtils.lerp(-0.28, -0.38, raise),
      THREE.MathUtils.lerp(-0.74, 0.88, raise),
      THREE.MathUtils.lerp(0.60, 0.24, raise),
    ];
    rLow = [
      THREE.MathUtils.lerp(0.82, 0.32, raise),
      THREE.MathUtils.lerp(0.32, 0.94, raise),
      THREE.MathUtils.lerp(0.48, 0.16, raise),
    ];
  }

  applyDirectedArms(
    [
      { upper: b.lu, lower: b.ll, hand: b.lh, upperDir: lUp, lowerDir: lLow },
      { upper: b.ru, lower: b.rl, hand: b.rh, upperDir: rUp, lowerDir: rLow },
    ],
    vrm.scene.parent,
    t
  );

  if ((hobbyKind === 'studying' || hobbyKind === 'journaling') && b.rh && b.lh) {
    // Natural writing hand posture: right hand angled inward/down holding pen over notebook,
    // left palm resting gently flat on the left notebook page!
    const frameObj = vrm.scene.parent || vrm.scene;
    frameObj.updateWorldMatrix(true, false);
    const frameQ = new THREE.Quaternion();
    frameObj.getWorldQuaternion(frameQ);
    const isVrm0 = vrm.meta?.metaVersion === '0';
    orientHandInFrame({
      hand: b.rh,
      side: -1,
      isVrm0,
      fingerDir: [0.38, -0.30, 0.88],
      palmDir: [0.68, -0.70, 0.20],
      frameQ,
      t,
    });
    orientHandInFrame({
      hand: b.lh,
      side: 1,
      isVrm0,
      fingerDir: [-0.28, -0.14, 0.95],
      palmDir: [-0.12, -0.96, 0.24],
      frameQ,
      t,
    });
  } else if (hobbyKind === 'gym_weights' && b.lh && b.rh) {
    // Natural supinated bicep-curl wrist orientation (smoothly rotates from neutral hammer grip at bottom to palm-up at peak curl!)
    const frameObj = vrm.scene.parent || vrm.scene;
    frameObj.updateWorldMatrix(true, false);
    const frameQ = new THREE.Quaternion();
    frameObj.getWorldQuaternion(frameQ);
    const isVrm0 = vrm.meta?.metaVersion === '0';
    const curlL = 0.5 - 0.5 * Math.cos(elapsed * 2.6);
    const curlR = 0.5 - 0.5 * Math.cos(elapsed * 2.6 + Math.PI);
    orientHandInFrame({
      hand: b.lh,
      side: 1,
      isVrm0,
      fingerDir: [-0.04, THREE.MathUtils.lerp(-0.34, 0.78, curlL), THREE.MathUtils.lerp(0.93, 0.62, curlL)],
      palmDir: [THREE.MathUtils.lerp(-0.78, -0.18, curlL), THREE.MathUtils.lerp(0.56, 0.72, curlL), THREE.MathUtils.lerp(0.24, -0.66, curlL)],
      frameQ,
      t,
    });
    orientHandInFrame({
      hand: b.rh,
      side: -1,
      isVrm0,
      fingerDir: [0.04, THREE.MathUtils.lerp(-0.34, 0.78, curlR), THREE.MathUtils.lerp(0.93, 0.62, curlR)],
      palmDir: [THREE.MathUtils.lerp(0.78, 0.18, curlR), THREE.MathUtils.lerp(0.56, 0.72, curlR), THREE.MathUtils.lerp(0.24, -0.66, curlR)],
      frameQ,
      t,
    });
  } else if (hobbyKind === 'brushing_teeth' && b.rh) {
    // Turn right palm naturally INWARD toward her mouth/face so fingers grip the toothbrush comfortably!
    const frameObj = vrm.scene.parent || vrm.scene;
    frameObj.updateWorldMatrix(true, false);
    const frameQ = new THREE.Quaternion();
    frameObj.getWorldQuaternion(frameQ);
    orientHandInFrame({
      hand: b.rh,
      side: -1,
      isVrm0: vrm.meta?.metaVersion === '0',
      fingerDir: [0.70, 0.52, -0.48],
      palmDir: [0.42, -0.22, -0.88],
      frameQ,
      t,
    });
  }
  return true;
}
