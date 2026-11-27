import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { AvatarPosture, HobbyKindId, SleepingPosition } from '../types/studio';
import type { EmotionBodyLanguage } from './emotionEngine';
import {
  applyColdRubArms,
  applyCrossedArms,
  applyDiningArms,
  applyHobbyActivityArms,
  applySeatedLapArms,
  expSmooth,
  getDiningAnimationFrame,
  getHobbyActivityFrame,
} from './naturalArmPose';
import { getVrmBoneSigns } from './vrmCoords';

type PoseBoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'rightUpperArm'
  | 'leftLowerArm'
  | 'rightLowerArm'
  | 'leftHand'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'rightUpperLeg'
  | 'leftLowerLeg'
  | 'rightLowerLeg'
  | 'leftFoot'
  | 'rightFoot';

const POSE_BONES: PoseBoneName[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'leftShoulder',
  'rightShoulder',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
  'leftUpperLeg',
  'rightUpperLeg',
  'leftLowerLeg',
  'rightLowerLeg',
  'leftFoot',
  'rightFoot',
];

const FINGER_CURL_BONES: { name: VRMHumanBoneName; side: 'left' | 'right'; weight: number }[] = [
  { name: 'leftIndexProximal', side: 'left', weight: 0.36 },
  { name: 'leftIndexIntermediate', side: 'left', weight: 0.46 },
  { name: 'leftIndexDistal', side: 'left', weight: 0.28 },
  { name: 'leftMiddleProximal', side: 'left', weight: 0.42 },
  { name: 'leftMiddleIntermediate', side: 'left', weight: 0.52 },
  { name: 'leftMiddleDistal', side: 'left', weight: 0.32 },
  { name: 'leftRingProximal', side: 'left', weight: 0.46 },
  { name: 'leftRingIntermediate', side: 'left', weight: 0.56 },
  { name: 'leftRingDistal', side: 'left', weight: 0.34 },
  { name: 'leftLittleProximal', side: 'left', weight: 0.5 },
  { name: 'leftLittleIntermediate', side: 'left', weight: 0.58 },
  { name: 'leftLittleDistal', side: 'left', weight: 0.36 },
  { name: 'leftThumbProximal', side: 'left', weight: 0.22 },
  { name: 'leftThumbDistal', side: 'left', weight: 0.24 },
  { name: 'rightIndexProximal', side: 'right', weight: 0.36 },
  { name: 'rightIndexIntermediate', side: 'right', weight: 0.46 },
  { name: 'rightIndexDistal', side: 'right', weight: 0.28 },
  { name: 'rightMiddleProximal', side: 'right', weight: 0.42 },
  { name: 'rightMiddleIntermediate', side: 'right', weight: 0.52 },
  { name: 'rightMiddleDistal', side: 'right', weight: 0.32 },
  { name: 'rightRingProximal', side: 'right', weight: 0.46 },
  { name: 'rightRingIntermediate', side: 'right', weight: 0.56 },
  { name: 'rightRingDistal', side: 'right', weight: 0.34 },
  { name: 'rightLittleProximal', side: 'right', weight: 0.5 },
  { name: 'rightLittleIntermediate', side: 'right', weight: 0.58 },
  { name: 'rightLittleDistal', side: 'right', weight: 0.36 },
  { name: 'rightThumbProximal', side: 'right', weight: 0.22 },
  { name: 'rightThumbDistal', side: 'right', weight: 0.24 },
];

export const STUDIO_SEAT_HEIGHT = 0.45;

/**
 * Humanoid Pose Controller for `@pixiv/three-vrm` normalized bones.
 * Smoothly blends between a grounded seated pose (hips lowered onto a y=0.45 studio stool,
 * 90° forward knee bend, feet near y=0, hands resting on lap with relaxed finger curl)
 * and a relaxed natural standing pose, while layering breathing and emotion body language.
 */
export class AvatarPoseController {
  private restHipsY = 0.9;
  private restHipsZ = 0;
  private seatedHipDrop = 0.44;
  private seatedHipsZOffset = -0.05;
  private currentHipsY = 0.9;
  private currentHipsZ = 0;
  private currentFingerCurl = 0;
  private diningRightGrip = 0;
  private diningLeftGrip = 0;
  private hasBoundVrm = false;
  private smoothRot: Record<PoseBoneName, { x: number; y: number; z: number }>;

  constructor() {
    this.smoothRot = {} as Record<PoseBoneName, { x: number; y: number; z: number }>;
    for (const b of POSE_BONES) {
      this.smoothRot[b] = { x: 0, y: 0, z: 0 };
    }
  }

  /**
   * Calibrates rest hip height and leg length from the loaded VRM so the seated hip drop
   * lands cleanly on `STUDIO_SEAT_HEIGHT` (~0.45m) without floating or sinking into the floor.
   */
  public bindVrm(vrm: VRM, modelScale = 1, initialPosture: AvatarPosture = 'seated'): void {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    const hips = humanoid.getNormalizedBoneNode('hips');
    const upperLeg =
      humanoid.getNormalizedBoneNode('leftUpperLeg') ||
      humanoid.getNormalizedBoneNode('rightUpperLeg');
    const lowerLeg =
      humanoid.getNormalizedBoneNode('leftLowerLeg') ||
      humanoid.getNormalizedBoneNode('rightLowerLeg');
    const foot =
      humanoid.getNormalizedBoneNode('leftFoot') ||
      humanoid.getNormalizedBoneNode('rightFoot');

    this.restHipsY = hips ? hips.position.y : 0.9;
    this.restHipsZ = hips ? hips.position.z : 0;

    // Measure leg length in local VRM units (upperLeg -> lowerLeg -> foot)
    const vHip = new THREE.Vector3();
    const vKnee = new THREE.Vector3();
    const vAnkle = new THREE.Vector3();
    if (upperLeg && lowerLeg && foot) {
      upperLeg.updateWorldMatrix(true, false);
      lowerLeg.updateWorldMatrix(true, false);
      foot.updateWorldMatrix(true, false);
      upperLeg.getWorldPosition(vHip);
      lowerLeg.getWorldPosition(vKnee);
      foot.getWorldPosition(vAnkle);
      const scaleSafe = Math.max(0.1, modelScale);
      const thighLenLocal = vHip.distanceTo(vKnee) / scaleSafe;
      const shinLenLocal = vKnee.distanceTo(vAnkle) / scaleSafe;
      const totalLegLocal = thighLenLocal + shinLenLocal;

      // Target seated hip height so thighs rest on STUDIO_SEAT_HEIGHT + slight thigh thickness (~0.04m)
      // while shin hangs vertically to put soles right at y = 0.
      const seatTopLocal = (STUDIO_SEAT_HEIGHT + 0.035) / scaleSafe;
      const targetSeatedHipsY = Math.max(shinLenLocal + 0.04, seatTopLocal);
      const computedDrop = this.restHipsY - targetSeatedHipsY;

      // Clamp to realistic proportion of leg length (approx 0.42..0.50m in normalized 1.62m space)
      const minDrop = Math.min(0.38, totalLegLocal * 0.44);
      const maxDrop = Math.max(0.5, totalLegLocal * 0.56);
      this.seatedHipDrop = THREE.MathUtils.clamp(computedDrop, minDrop, maxDrop);
    } else {
      this.seatedHipDrop = 0.44 / Math.max(0.25, modelScale);
    }

    const isVrm0 = vrm.meta?.metaVersion === '0';
    // Shift hips slightly back over the stool center (character's -forward direction)
    this.seatedHipsZOffset = (isVrm0 ? 0.055 : -0.055) / Math.max(0.25, modelScale);

    this.currentHipsY =
      initialPosture === 'seated' ? this.restHipsY - this.seatedHipDrop : this.restHipsY;
    this.currentHipsZ =
      initialPosture === 'seated' ? this.restHipsZ + this.seatedHipsZOffset : this.restHipsZ;
    this.currentFingerCurl =
      initialPosture === 'seated' ? 1 : initialPosture === 'sleeping' ? 0.72 : 0.45;
    this.hasBoundVrm = true;

    // Snap immediately on first bind so the avatar never flashes a stiff A-pose frame on load
    if (hips) {
      hips.position.y = this.currentHipsY;
      hips.position.z = this.currentHipsZ;
    }
  }

  public getSeatedHipDropWorld(modelScale = 1): number {
    return this.seatedHipDrop * modelScale;
  }

  /**
   * Returns the current forward torso lean pitch (in positive radians) from `spine` + `chest`
   * so lower skirts and open coat tails on `hips` can pitch smoothly forward over the legs during
   * seated and forward-leaning poses instead of cutting backward into the body.
   */
  public getTorsoForwardLeanRad(vrm: VRM | null): number {
    if (!vrm?.humanoid) return 0;
    const { torsoForwardSign } = getVrmBoneSigns(vrm);
    const spine = vrm.humanoid.getNormalizedBoneNode('spine');
    const chest = vrm.humanoid.getNormalizedBoneNode('chest');
    const spineFwd = spine ? spine.rotation.x * torsoForwardSign : 0;
    const chestFwd = chest ? chest.rotation.x * torsoForwardSign : 0;
    return THREE.MathUtils.clamp(spineFwd + chestFwd * 0.5, 0, 0.55);
  }

  public restoreStandingHips(vrm: VRM, dt: number): void {
    if (!this.hasBoundVrm) return;
    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;
    const alpha = expSmooth(7.5, dt);
    this.currentHipsY = THREE.MathUtils.lerp(this.currentHipsY, this.restHipsY, alpha);
    this.currentHipsZ = THREE.MathUtils.lerp(this.currentHipsZ, this.restHipsZ, alpha);
    hips.position.y = this.currentHipsY;
    hips.position.z = this.currentHipsZ;
  }

  public applySeatedHips(vrm: VRM, dt: number): void {
    if (!this.hasBoundVrm) return;
    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;
    const alpha = expSmooth(7.5, dt);
    const targetHipsY = this.restHipsY - this.seatedHipDrop;
    const targetHipsZ = this.restHipsZ + this.seatedHipsZOffset;
    this.currentHipsY = THREE.MathUtils.lerp(this.currentHipsY, targetHipsY, alpha);
    this.currentHipsZ = THREE.MathUtils.lerp(this.currentHipsZ, targetHipsZ, alpha);
    hips.position.y = this.currentHipsY;
    hips.position.z = this.currentHipsZ;
  }

  /**
   * Drives normalized humanoid bones for the seated pose (or instant snap when `snap = true`).
   * Must be called BEFORE `vrm.update(dt)`.
   */
  public applySeatedPose(params: {
    vrm: VRM;
    dt: number;
    elapsed: number;
    bodyLang: EmotionBodyLanguage;
    musicBass: number;
    musicBeat: number;
    isMusicPlaying: boolean;
    isSleeping: boolean;
    isDining?: boolean;
    activeHobbyKind?: HobbyKindId | null;
    snap?: boolean;
  }): void {
    const {
      vrm,
      dt,
      elapsed,
      bodyLang,
      musicBass,
      musicBeat,
      isMusicPlaying,
      isSleeping,
      isDining = false,
      activeHobbyKind = null,
      snap = false,
    } = params;

    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    const {
      legForwardSign: forwardSign,
      kneeFlexSign,
      torsoForwardSign,
      armDownSign,
      rollSign,
      leftArmForwardY,
      rightArmForwardY,
    } = getVrmBoneSigns(vrm);

    const breath = Math.sin(elapsed * Math.max(1.4, bodyLang.breathingRate || 2.0));
    const gentleSway = Math.sin(elapsed * (isMusicPlaying ? 2.4 : 0.75));
    const alpha = snap ? 1 : expSmooth(7.0, dt);

    const activeDiningFrame = !isSleeping && isDining ? getDiningAnimationFrame(elapsed) : null;
    const activeHobbyFrame =
      !isSleeping && !activeDiningFrame && activeHobbyKind
        ? getHobbyActivityFrame(activeHobbyKind, elapsed)
        : null;
    const activityLeanX = activeDiningFrame
      ? activeDiningFrame.spineLeanX
      : activeHobbyFrame
      ? activeHobbyFrame.spineLeanX
      : 0;
    const activityTwistY = activeHobbyFrame ? activeHobbyFrame.spineTwistY : 0;

    // 1. Lower hips bone cleanly onto studio stool height
    const hipsNode = humanoid.getNormalizedBoneNode('hips');
    if (hipsNode && this.hasBoundVrm) {
      const targetHipsY = this.restHipsY - this.seatedHipDrop;
      const targetHipsZ = this.restHipsZ + this.seatedHipsZOffset;
      this.currentHipsY = THREE.MathUtils.lerp(this.currentHipsY, targetHipsY, alpha);
      this.currentHipsZ = THREE.MathUtils.lerp(this.currentHipsZ, targetHipsZ, alpha);
      hipsNode.position.y = this.currentHipsY;
      hipsNode.position.z = this.currentHipsZ;
    }

    // 2. Seated bone target rotations (relative normalized offsets only — never overrides avatarRoot.rotation.y)
    const thighBendX = forwardSign * (Math.PI * 0.48); // ~86° forward toward knees
    const kneeBendX = kneeFlexSign * (Math.PI * 0.48); // ~86° downward so calves hang vertically
    const footLevelX = forwardSign * 0.05; // keep soles parallel to floor

    const isStudyingSeated =
      !isSleeping &&
      !activeDiningFrame &&
      (activeHobbyKind === 'studying' || activeHobbyKind === 'journaling');
    const seatedTableFlex = activeDiningFrame
      ? 0.085 + activeDiningFrame.dipToPlate * 0.045 + activeDiningFrame.eatLift * 0.025
      : isStudyingSeated
      ? 0.115
      : 0;
    const clavicleFwd = Math.min(
      0.08,
      activeDiningFrame
        ? 0.055 + activeDiningFrame.dipToPlate * 0.025
        : isStudyingSeated
        ? 0.068
        : 0.022
    );
    const clavicleReliefZ = activeDiningFrame || isStudyingSeated ? 0.028 : 0.012;

    const targets: Record<PoseBoneName, { x: number; y: number; z: number }> = {
      hips: {
        x: 0,
        y: Math.sin(elapsed * 0.65) * 0.014,
        z: rollSign * bodyLang.hipWeightShift * 0.45,
      },
      spine: {
        // Comfortable waist/lumbar forward flex during seated dining & studying so neck never cranes alone!
        x:
          torsoForwardSign * (0.05 + activityLeanX + seatedTableFlex * 0.62) +
          torsoForwardSign * (bodyLang.spineLeanX * 0.55) +
          (isMusicPlaying ? torsoForwardSign * musicBeat * 0.04 : 0),
        y: gentleSway * (isMusicPlaying ? 0.06 : 0.018) + activityTwistY * 0.6,
        z: isMusicPlaying ? rollSign * Math.sin(elapsed * 2.2) * (0.04 + musicBass * 0.05) : 0,
      },
      chest: {
        // Gentle upper-thoracic follow-through + breathing sine wave
        x:
          torsoForwardSign * (-0.02 + activityLeanX * 0.42 + seatedTableFlex * 0.38) +
          breath * 0.012 +
          torsoForwardSign * (bodyLang.spineLeanX * 0.25),
        y: activityTwistY * 0.4,
        z: 0,
      },
      upperChest: {
        x: torsoForwardSign * (seatedTableFlex * 0.24) + breath * 0.008,
        y: 0,
        z: 0,
      },
      // Clavicle / scapula forward protraction (clamped <= 0.08 rad) — leftArmForwardY=-1, rightArmForwardY=+1 on BOTH VRM 0.x & 1.0!
      leftShoulder: {
        x: 0,
        y: leftArmForwardY * clavicleFwd,
        z: -armDownSign * clavicleReliefZ,
      },
      rightShoulder: {
        x: 0,
        y: rightArmForwardY * clavicleFwd,
        z: armDownSign * clavicleReliefZ,
      },
      // Legs: 90° forward seated bend with knees together (modest anime posture)
      leftUpperLeg: {
        x: thighBendX,
        y: forwardSign * 0.035,
        z: armDownSign * 0.09,
      },
      rightUpperLeg: {
        x: thighBendX,
        y: -forwardSign * 0.035,
        z: -armDownSign * 0.09,
      },
      leftLowerLeg: {
        x: kneeBendX,
        y: 0,
        z: -armDownSign * 0.02,
      },
      rightLowerLeg: {
        x: kneeBendX,
        y: 0,
        z: armDownSign * 0.02,
      },
      leftFoot: {
        x: footLevelX,
        y: 0,
        z: 0,
      },
      rightFoot: {
        x: footLevelX,
        y: 0,
        z: 0,
      },
      // Arms & hands resting naturally down on thighs/lap with ~18° outward elbow carrying angle (zero ribcage collapse!)
      leftUpperArm: {
        x: forwardSign * (0.14 + bodyLang.shoulderDroop * 0.16) + bodyLang.shoulderFidget * 0.32,
        y: armDownSign * 0.12,
        z: armDownSign * (1.16 + bodyLang.shoulderDroop * 0.1 + breath * 0.01),
      },
      rightUpperArm: {
        x: forwardSign * (0.14 + bodyLang.shoulderDroop * 0.16) - bodyLang.shoulderFidget * 0.32,
        y: -armDownSign * 0.12,
        z: -armDownSign * (1.16 + bodyLang.shoulderDroop * 0.1 - breath * 0.01),
      },
      leftLowerArm: {
        x: -forwardSign * 0.42,
        y: armDownSign * 0.52,
        z: armDownSign * 0.16,
      },
      rightLowerArm: {
        x: -forwardSign * 0.42,
        y: -armDownSign * 0.52,
        z: -armDownSign * 0.16,
      },
      leftHand: {
        x: -forwardSign * 0.14,
        y: -armDownSign * 0.08,
        z: armDownSign * 0.10,
      },
      rightHand: {
        x: -forwardSign * 0.14,
        y: armDownSign * 0.08,
        z: -armDownSign * 0.10,
      },
    };

    const useSeatedDining = !isSleeping && isDining;
    const useSeatedHobby = !isSleeping && !useSeatedDining && Boolean(activeHobbyKind);
    const useSeatedColdRub =
      !isSleeping && !useSeatedDining && !useSeatedHobby && bodyLang.coldRubArms > 0.35;
    const useSeatedCrossedArms =
      !isSleeping &&
      !useSeatedDining &&
      !useSeatedHobby &&
      !useSeatedColdRub &&
      bodyLang.armsCrossTension > 0.48;
    const vectorArmBones = new Set<PoseBoneName>([
      'leftUpperArm',
      'rightUpperArm',
      'leftLowerArm',
      'rightLowerArm',
      'leftHand',
      'rightHand',
    ]);

    const useVectorArms = true;
    for (const boneName of POSE_BONES) {
      if (useVectorArms && vectorArmBones.has(boneName)) {
        continue;
      }
      const s = this.smoothRot[boneName];
      const tgt = targets[boneName];
      s.x = THREE.MathUtils.lerp(s.x, tgt.x, alpha);
      s.y = THREE.MathUtils.lerp(s.y, tgt.y, alpha);
      s.z = THREE.MathUtils.lerp(s.z, tgt.z, alpha);

      const node = humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
      if (node) {
        node.rotation.set(s.x, s.y, s.z);
      }
    }

    if (useVectorArms) {
      const armSmooth = snap ? 1 : expSmooth(8.0, dt);
      if (useSeatedDining) {
        applyDiningArms(vrm, elapsed, armSmooth);
      } else if (useSeatedHobby && activeHobbyKind) {
        applyHobbyActivityArms(vrm, activeHobbyKind, elapsed, armSmooth);
      } else if (useSeatedColdRub) {
        applyColdRubArms(vrm, alpha, elapsed, bodyLang.coldRubArms);
      } else if (useSeatedCrossedArms) {
        applyCrossedArms(vrm, alpha, { breath });
      } else {
        // Convention-free seated lap arms (identical on VRM 0.x & 1.0, ~18° outward carrying angle!)
        applySeatedLapArms(vrm, armSmooth, {
          breath,
          droop: bodyLang.shoulderDroop,
          fidget: bodyLang.shoulderFidget,
        });
      }
      for (const boneName of vectorArmBones) {
        const node = humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
        if (!node) continue;
        const s = this.smoothRot[boneName];
        s.x = node.rotation.x;
        s.y = node.rotation.y;
        s.z = node.rotation.z;
      }
    }

    // 3. Natural finger articulation:
    //    - During dining: exact chopstick pinch grip (right hand) & teacup wrap grip (left hand)!
    //    - Otherwise: relaxed natural finger curl (0.25..0.42 rad) resting softly on lap
    this.currentFingerCurl = THREE.MathUtils.lerp(this.currentFingerCurl, 1, alpha);
    const gripLerp = snap ? 1 : expSmooth(10.0, dt);
    this.diningRightGrip = THREE.MathUtils.lerp(
      this.diningRightGrip,
      activeDiningFrame?.chopsticksInHand ? 1 : 0,
      gripLerp
    );
    this.diningLeftGrip = THREE.MathUtils.lerp(
      this.diningLeftGrip,
      activeDiningFrame?.mugInHand ? 1 : 0,
      gripLerp
    );

    const getDiningFingerTarget = (
      name: VRMHumanBoneName,
      side: 'left' | 'right',
      baseWeight: number
    ): number => {
      if (!activeDiningFrame) return baseWeight * this.currentFingerCurl;
      if (side === 'left') {
        // Left hand wraps snugly around teacup body/handle (pinky slightly lifted & dainty!)
        let cupCurl = baseWeight;
        if (name.includes('Index')) {
          cupCurl = name.includes('Intermediate') ? 1.05 : name.includes('Proximal') ? 0.85 : 0.62;
        } else if (name.includes('Middle')) {
          cupCurl = name.includes('Intermediate') ? 1.12 : name.includes('Proximal') ? 0.94 : 0.68;
        } else if (name.includes('Ring')) {
          cupCurl = name.includes('Intermediate') ? 1.08 : name.includes('Proximal') ? 0.90 : 0.65;
        } else if (name.includes('Little')) {
          cupCurl = name.includes('Intermediate') ? 0.62 : name.includes('Proximal') ? 0.52 : 0.36;
        } else if (name.includes('Thumb')) {
          cupCurl = name.includes('Proximal') ? 0.66 : 0.44;
        }
        return THREE.MathUtils.lerp(baseWeight * 0.68, cupCurl, this.diningLeftGrip);
      }
      // Right hand forms textbook Japanese chopstick grip:
      // Index & middle gently extended along the upper chopstick; ring & little tucked underneath to brace the lower chopstick!
      const pinchBoost = activeDiningFrame.biteOnChopsticks ? 0.1 : 0;
      let chopCurl = baseWeight;
      if (name.includes('Index')) {
        chopCurl =
          (name.includes('Intermediate') ? 0.56 : name.includes('Proximal') ? 0.42 : 0.28) +
          pinchBoost;
      } else if (name.includes('Middle')) {
        chopCurl =
          (name.includes('Intermediate') ? 0.64 : name.includes('Proximal') ? 0.48 : 0.32) +
          pinchBoost;
      } else if (name.includes('Ring')) {
        chopCurl = name.includes('Intermediate') ? 0.96 : name.includes('Proximal') ? 0.84 : 0.58;
      } else if (name.includes('Little')) {
        chopCurl = name.includes('Intermediate') ? 1.02 : name.includes('Proximal') ? 0.90 : 0.64;
      } else if (name.includes('Thumb')) {
        chopCurl = (name.includes('Proximal') ? 0.56 : 0.36) + pinchBoost * 0.7;
      }
      return THREE.MathUtils.lerp(baseWeight * 0.68, chopCurl, this.diningRightGrip);
    };

    if (activeHobbyKind === 'brushing_teeth' && !activeDiningFrame) {
      this.applyToothbrushFingerGrip(vrm, dt);
      return;
    }

    if ((activeHobbyKind === 'studying' || activeHobbyKind === 'journaling') && !activeDiningFrame) {
      // Natural tripod pen grip on right hand; gentle open-flat page-steadying fingers on left hand!
      for (const f of FINGER_CURL_BONES) {
        const node = humanoid.getNormalizedBoneNode(f.name);
        if (!node) continue;
        const sideSign = f.side === 'left' ? armDownSign : -armDownSign;
        if (f.side === 'left') {
          const flatCurl = f.weight * 0.22;
          if (f.name.includes('Thumb')) {
            node.rotation.y = sideSign * flatCurl;
            node.rotation.z = sideSign * flatCurl * 0.2;
          } else {
            node.rotation.z = sideSign * flatCurl;
          }
          continue;
        }
        let penCurl = 0.72;
        if (f.name.includes('Index')) {
          penCurl = f.name.includes('Intermediate') ? 0.72 : f.name.includes('Proximal') ? 0.54 : 0.36;
        } else if (f.name.includes('Middle')) {
          penCurl = f.name.includes('Intermediate') ? 0.82 : f.name.includes('Proximal') ? 0.64 : 0.42;
        } else if (f.name.includes('Ring') || f.name.includes('Little')) {
          penCurl = f.name.includes('Intermediate') ? 1.08 : f.name.includes('Proximal') ? 0.92 : 0.64;
        } else if (f.name.includes('Thumb')) {
          penCurl = f.name.includes('Proximal') ? 0.62 : 0.40;
          node.rotation.y = sideSign * penCurl;
          node.rotation.z = sideSign * penCurl * 0.35;
          continue;
        }
        node.rotation.z = sideSign * penCurl;
      }
      return;
    }

    for (const f of FINGER_CURL_BONES) {
      const node = humanoid.getNormalizedBoneNode(f.name);
      if (!node) continue;
      const sideSign = f.side === 'left' ? armDownSign : -armDownSign;
      const curl = getDiningFingerTarget(f.name, f.side, f.weight);
      if (f.name.includes('Thumb')) {
        node.rotation.y = sideSign * curl;
        node.rotation.z = sideSign * curl * 0.32;
      } else {
        node.rotation.z = sideSign * curl;
      }
    }
  }

  /**
   * Applies an anatomical closed-fist grip for handheld props (toothbrush, tennis racket on right hand,
   * or BOTH hands gripping dumbbells during gym strength training!).
   */
  public applyPropFingerGrip(
    vrm: VRM,
    dt: number,
    hands: 'right' | 'both' = 'right'
  ): void {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;
    const isVrm0 = vrm.meta?.metaVersion === '0';
    const armDownSign = isVrm0 ? 1 : -1;
    const alpha = expSmooth(10.0, dt);
    this.currentFingerCurl = THREE.MathUtils.lerp(this.currentFingerCurl, 1.0, alpha);

    for (const f of FINGER_CURL_BONES) {
      const node = humanoid.getNormalizedBoneNode(f.name);
      if (!node) continue;
      const sideSign = f.side === 'left' ? armDownSign : -armDownSign;
      const shouldGrip = hands === 'both' || f.side === 'right';
      if (!shouldGrip) {
        const relax = f.weight * 0.42;
        if (f.name.includes('Thumb')) {
          node.rotation.y = sideSign * relax;
          node.rotation.z = sideSign * relax * 0.25;
        } else {
          node.rotation.z = sideSign * relax;
        }
        continue;
      }
      let curl = 0.85;
      if (f.name.includes('Thumb')) {
        curl = f.name.includes('Proximal') ? 0.68 : 0.46;
        node.rotation.y = sideSign * curl;
        node.rotation.z = sideSign * curl * 0.38;
      } else {
        curl = f.name.includes('Intermediate')
          ? 1.18
          : f.name.includes('Proximal')
          ? 0.94
          : 0.72;
        node.rotation.z = sideSign * curl;
      }
    }
  }

  public applyToothbrushFingerGrip(vrm: VRM, dt: number): void {
    this.applyPropFingerGrip(vrm, dt, 'right');
  }

  /**
   * Applies subtle relaxed finger curl during standing posture so fingers never look stiff.
   */
  public applyStandingFingerRelax(vrm: VRM, dt: number): void {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;
    const isVrm0 = vrm.meta?.metaVersion === '0';
    const armDownSign = isVrm0 ? 1 : -1;
    this.currentFingerCurl = THREE.MathUtils.lerp(this.currentFingerCurl, 0.42, expSmooth(6.0, dt));
    for (const f of FINGER_CURL_BONES) {
      const node = humanoid.getNormalizedBoneNode(f.name);
      if (!node) continue;
      const sideSign = f.side === 'left' ? armDownSign : -armDownSign;
      if (f.name.includes('Thumb')) {
        node.rotation.y = sideSign * f.weight * this.currentFingerCurl;
      } else {
        node.rotation.z = sideSign * f.weight * this.currentFingerCurl;
      }
    }
  }

  /**
   * Drives normalized humanoid bones for a peaceful resting / sleeping pose on the bed.
   * Supports multiple positions: 'back_relaxed', 'side_curled_right', 'side_curled_left',
   * 'hugging_pillow', and 'sprawled'.
   * Fixes arms and hands to lie naturally against the mattress / pillow with no floating or tension.
   */
  public applySleepingPose(params: {
    vrm: VRM;
    dt: number;
    elapsed: number;
    bodyLang: EmotionBodyLanguage;
    position?: SleepingPosition;
    snap?: boolean;
  }): void {
    const {
      vrm,
      dt,
      elapsed,
      bodyLang,
      position = 'back_relaxed',
      snap = false,
    } = params;
    const humanoid = vrm.humanoid;
    if (!humanoid) return;

    const isVrm0 = vrm.meta?.metaVersion === '0';
    const forwardSign = isVrm0 ? 1 : -1;
    // Right-hand rule: upward-pointing spine/chest/upperChest bend FORWARD with opposite X sign of downward-pointing legs!
    const torsoForwardSign = isVrm0 ? -1 : 1;
    const armDownSign = isVrm0 ? 1 : -1;

    // Slow peaceful breathing: ~0.8 Hz
    const breath = Math.sin(elapsed * Math.max(0.7, bodyLang.breathingRate || 0.95));
    const alpha = snap ? 1 : expSmooth(6.0, dt);

    // Keep hips level with minimal motion
    const hipsNode = humanoid.getNormalizedBoneNode('hips');
    if (hipsNode && this.hasBoundVrm) {
      this.currentHipsY = THREE.MathUtils.lerp(this.currentHipsY, this.restHipsY, alpha);
      this.currentHipsZ = THREE.MathUtils.lerp(this.currentHipsZ, this.restHipsZ, alpha);
      hipsNode.position.y = this.currentHipsY;
      hipsNode.position.z = this.currentHipsZ;
    }

    const targets: Record<PoseBoneName, { x: number; y: number; z: number }> = {
      hips: { x: 0, y: 0, z: 0 },
      spine: {
        x: torsoForwardSign * (0.02 + breath * 0.015),
        y: 0,
        z: 0,
      },
      chest: {
        x: -torsoForwardSign * (0.03 + breath * 0.028),
        y: 0,
        z: 0,
      },
      upperChest: {
        x: breath * 0.018,
        y: 0,
        z: 0,
      },
      leftShoulder: { x: 0, y: 0, z: 0 },
      rightShoulder: { x: 0, y: 0, z: 0 },
      leftUpperLeg: {
        x: forwardSign * 0.04,
        y: 0,
        z: -armDownSign * 0.04,
      },
      rightUpperLeg: {
        x: forwardSign * 0.04,
        y: 0,
        z: armDownSign * 0.04,
      },
      leftLowerLeg: {
        x: -forwardSign * 0.06,
        y: 0,
        z: 0,
      },
      rightLowerLeg: {
        x: -forwardSign * 0.06,
        y: 0,
        z: 0,
      },
      leftFoot: {
        x: forwardSign * 0.12,
        y: 0,
        z: -armDownSign * 0.06,
      },
      rightFoot: {
        x: forwardSign * 0.12,
        y: 0,
        z: armDownSign * 0.06,
      },
      // Arms grounded flat on mattress at sides by default
      leftUpperArm: {
        x: -forwardSign * 0.05,
        y: armDownSign * 0.04,
        z: armDownSign * (1.36 + breath * 0.01),
      },
      rightUpperArm: {
        x: -forwardSign * 0.05,
        y: -armDownSign * 0.04,
        z: -armDownSign * (1.36 - breath * 0.01),
      },
      leftLowerArm: {
        x: 0,
        y: armDownSign * 0.14,
        z: 0,
      },
      rightLowerArm: {
        x: 0,
        y: -armDownSign * 0.14,
        z: 0,
      },
      leftHand: {
        x: 0,
        y: 0,
        z: 0,
      },
      rightHand: {
        x: 0,
        y: 0,
        z: 0,
      },
    };

    if (position === 'side_curled_right') {
      // Curled comfortably on right side in bed center facing camera/Producer
      targets.spine.x = forwardSign * 0.08;
      targets.spine.z = 0.04;
      // Knees tucked (upperLeg.rotation.x ≈ 1.1, lowerLeg.rotation.x ≈ -1.35)
      targets.leftUpperLeg.x = forwardSign * 1.10;
      targets.leftUpperLeg.z = -armDownSign * 0.08;
      targets.leftLowerLeg.x = -forwardSign * 1.35;
      targets.rightUpperLeg.x = forwardSign * 0.95;
      targets.rightUpperLeg.z = armDownSign * 0.04;
      targets.rightLowerLeg.x = -forwardSign * 1.25;
      targets.leftFoot.x = forwardSign * 0.22;
      targets.rightFoot.x = forwardSign * 0.22;
      // Hands tucked near chest / pillow
      targets.leftUpperArm.x = forwardSign * 0.42;
      targets.leftUpperArm.y = armDownSign * 0.18;
      targets.leftUpperArm.z = armDownSign * 0.95;
      targets.leftLowerArm.y = armDownSign * 1.45;
      targets.leftHand.y = armDownSign * 0.30;
      targets.rightUpperArm.x = forwardSign * 0.32;
      targets.rightUpperArm.y = -armDownSign * 0.15;
      targets.rightUpperArm.z = -armDownSign * 1.05;
      targets.rightLowerArm.y = -armDownSign * 1.42;
      targets.rightHand.y = -armDownSign * 0.25;
    } else if (position === 'side_curled_left') {
      // Curled on left side facing away / nightstand
      targets.spine.x = forwardSign * 0.08;
      targets.spine.z = -0.04;
      targets.rightUpperLeg.x = forwardSign * 1.10;
      targets.rightUpperLeg.z = armDownSign * 0.08;
      targets.rightLowerLeg.x = -forwardSign * 1.35;
      targets.leftUpperLeg.x = forwardSign * 0.95;
      targets.leftUpperLeg.z = -armDownSign * 0.04;
      targets.leftLowerLeg.x = -forwardSign * 1.25;
      targets.rightFoot.x = forwardSign * 0.22;
      targets.leftFoot.x = forwardSign * 0.22;
      targets.rightUpperArm.x = forwardSign * 0.42;
      targets.rightUpperArm.y = -armDownSign * 0.18;
      targets.rightUpperArm.z = -armDownSign * 0.95;
      targets.rightLowerArm.y = -armDownSign * 1.45;
      targets.rightHand.y = -armDownSign * 0.30;
      targets.leftUpperArm.x = forwardSign * 0.32;
      targets.leftUpperArm.y = armDownSign * 0.15;
      targets.leftUpperArm.z = armDownSign * 1.05;
      targets.leftLowerArm.y = armDownSign * 1.42;
      targets.leftHand.y = armDownSign * 0.25;
    } else if (position === 'hugging_pillow') {
      // Cozy semi-side hug around spawned hug pillow
      targets.spine.x = forwardSign * 0.05;
      // Top leg bent gently over the body pillow
      targets.leftUpperLeg.x = forwardSign * 0.58;
      targets.leftUpperLeg.y = -armDownSign * 0.08;
      targets.leftUpperLeg.z = -armDownSign * 0.12;
      targets.leftLowerLeg.x = -forwardSign * 0.72;
      targets.leftFoot.x = forwardSign * 0.16;
      // Bottom leg extended smoothly along mattress
      targets.rightUpperLeg.x = forwardSign * 0.16;
      targets.rightUpperLeg.z = armDownSign * 0.04;
      targets.rightLowerLeg.x = -forwardSign * 0.22;
      targets.rightFoot.x = forwardSign * 0.14;
      // Both arms wrapped snugly around the hug pillow
      targets.leftUpperArm.x = forwardSign * 0.48;
      targets.leftUpperArm.y = armDownSign * 0.28;
      targets.leftUpperArm.z = armDownSign * 0.95;
      targets.leftLowerArm.x = forwardSign * 0.10;
      targets.leftLowerArm.y = armDownSign * 1.42;
      targets.leftHand.y = armDownSign * 0.25;
      targets.leftHand.z = -armDownSign * 0.15;
      targets.rightUpperArm.x = forwardSign * 0.28;
      targets.rightUpperArm.y = -armDownSign * 0.18;
      targets.rightUpperArm.z = -armDownSign * 1.15;
      targets.rightLowerArm.y = -armDownSign * 1.25;
      targets.rightHand.y = -armDownSign * 0.18;
    } else if (position === 'sprawled') {
      // Relaxed deep sprawl with one arm above head and asymmetrical legs
      targets.leftUpperArm.x = -forwardSign * 0.04;
      targets.leftUpperArm.y = armDownSign * 0.35;
      targets.leftUpperArm.z = armDownSign * 0.45; // stretched up near pillow
      targets.leftLowerArm.y = armDownSign * 0.45;
      targets.rightUpperArm.x = -forwardSign * 0.05;
      targets.rightUpperArm.z = -armDownSign * 1.38;
      targets.rightLowerArm.y = -armDownSign * 0.18;
      targets.leftUpperLeg.z = -armDownSign * 0.24;
      targets.leftLowerLeg.x = -forwardSign * 0.38;
      targets.rightUpperLeg.z = armDownSign * 0.18;
      targets.leftFoot.x = forwardSign * 0.18;
      targets.rightFoot.x = forwardSign * 0.18;
    }

    for (const boneName of POSE_BONES) {
      const s = this.smoothRot[boneName];
      const tgt = targets[boneName];
      s.x = THREE.MathUtils.lerp(s.x, tgt.x, alpha);
      s.y = THREE.MathUtils.lerp(s.y, tgt.y, alpha);
      s.z = THREE.MathUtils.lerp(s.z, tgt.z, alpha);

      const node = humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
      if (node) {
        node.rotation.set(s.x, s.y, s.z);
      }
    }

    // Soft, relaxed sleeping finger curl (tucked naturally, thumb rested alongside index)
    this.currentFingerCurl = THREE.MathUtils.lerp(this.currentFingerCurl, 0.28, alpha);
    for (const f of FINGER_CURL_BONES) {
      const node = humanoid.getNormalizedBoneNode(f.name);
      if (!node) continue;
      const sideSign = f.side === 'left' ? armDownSign : -armDownSign;
      if (f.name.includes('Thumb')) {
        node.rotation.y = sideSign * 0.06 * this.currentFingerCurl;
        node.rotation.z = sideSign * 0.05 * this.currentFingerCurl;
      } else {
        node.rotation.z = sideSign * f.weight * 0.55 * this.currentFingerCurl;
      }
    }
  }
}
