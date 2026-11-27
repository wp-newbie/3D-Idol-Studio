import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { HobbyKindId, MoodType, RoamBehavior, RoamCommand } from '../types/studio';
import type { EmotionBodyLanguage } from './emotionEngine';
import {
  applyColdRubArms,
  applyCrossedArms,
  applyHobbyActivityArms,
  applyNaturalArms,
  applyShoulderStretchArms,
  DEFAULT_NATURAL_ARMS,
  expSmooth,
  getHobbyActivityFrame,
} from './naturalArmPose';

export interface RoamFrameStatus {
  normX: number;
  normY: number;
  normZ: number;
  behavior: RoamBehavior;
  behaviorLabel: string;
  isMoving: boolean;
  isDragging: boolean;
}

export const ROAM_BEHAVIOR_LABELS: Record<RoamBehavior, string> = {
  idle: 'Standing Idle',
  walk: 'Taskbar Stroll',
  peek: 'Peeking from Edge',
  crossed_arms_wait: 'Crossed-Arms Wait',
  stretch_look: 'Stretching & Looking Around',
  sit_taskbar: 'Sitting in AI Chair',
  approach_user: 'Approaching Cursor',
};

type TrackedBone =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'leftUpperArm'
  | 'rightUpperArm'
  | 'leftLowerArm'
  | 'rightLowerArm'
  | 'leftHand'
  | 'rightHand'
  | 'leftUpperLeg'
  | 'rightUpperLeg'
  | 'leftLowerLeg'
  | 'rightLowerLeg';

const TRACKED_BONES: TrackedBone[] = [
  'hips',
  'spine',
  'chest',
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
];

const NATURAL_ARM_BONES = new Set<TrackedBone>([
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
]);

/**
 * Self-Directed Full-Screen Desktop Widget & Stage Roaming Controller.
 * - Computes exact visible camera frustum bounds so the VRM character walks freely across the
 *   entire width of the user's monitor above the taskbar (Taskbar Stroll, Edge Peek, Corner Perch).
 * - Supports click-and-drag relocation anywhere on screen with a cute flustered dangle pose.
 * - Smoothly interpolates every tracked VRM humanoid bone (`THREE.MathUtils.lerp`).
 */
export class AutonomousRoamController {
  private currentX = 0; // [-1..1] across visible viewport width
  private currentY = 0; // [0..1] in Widget Mode (0 = standing on taskbar, 1 = top of screen)
  private currentZ = 0; // [-0.35..0.45]
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private behavior: RoamBehavior = 'idle';
  private nextDecisionIn = 7.0;
  private walkPhase = 0;
  private facingYaw = 0;
  private lastCommandId = -1;
  private isDragging = false;
  private dragVelocityX = 0;
  private approachUserCooldown = 0; // 2-minute cooldown between cursor visits
  private approachUserDuration = 0; // 5-8 seconds duration when visiting cursor
  private isApproachingUser = false;
  private crossDisplayCooldown = 0;
  private smoothBones: Record<TrackedBone, { x: number; y: number; z: number }>;

  constructor() {
    this.smoothBones = {} as Record<TrackedBone, { x: number; y: number; z: number }>;
    for (const b of TRACKED_BONES) {
      this.smoothBones[b] = { x: 0, y: 0, z: 0 };
    }
  }

  public applyCommand(cmd: RoamCommand | null): void {
    if (!cmd || cmd.id === this.lastCommandId) return;
    this.lastCommandId = cmd.id;

    if (cmd.behavior === 'approach_user') {
      if (this.approachUserCooldown > 0) {
        // Respect 2-minute cooldown, wander independently instead
        this.behavior = 'walk';
        this.targetX = (Math.random() - 0.5) * 1.5;
        this.targetY = 0;
        this.targetZ = 0;
        this.nextDecisionIn = 12.0;
        return;
      }
      this.behavior = 'approach_user';
      this.isApproachingUser = true;
      this.approachUserDuration = 5.0 + Math.random() * 3.0; // 5-8 seconds duration
      this.targetX = THREE.MathUtils.clamp(cmd.targetX, -0.94, 0.94);
      this.targetY = THREE.MathUtils.clamp(cmd.targetY, -0.45, 0.72);
      this.targetZ = 0.08;
      this.nextDecisionIn = this.approachUserDuration;
      return;
    }

    this.isApproachingUser = false;
    if (typeof cmd.startFromX === 'number') {
      this.currentX = THREE.MathUtils.clamp(cmd.startFromX, -0.96, 0.96);
    }
    this.targetX = THREE.MathUtils.clamp(cmd.targetX, -0.94, 0.94);
    this.targetY =
      cmd.behavior === 'sit_taskbar'
        ? THREE.MathUtils.clamp(cmd.targetY, 0, 0.72)
        : THREE.MathUtils.clamp(cmd.targetY, -0.45, 0.72);
    this.targetZ = THREE.MathUtils.clamp(cmd.targetZ ?? 0, -0.35, 0.45);
    this.behavior = cmd.behavior;
    this.nextDecisionIn = 10.0 + Math.random() * 15.0;
  }

  public resetToCenter(): void {
    this.isDragging = false;
    this.isApproachingUser = false;
    this.dragVelocityX = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.targetZ = 0;
    this.currentX = 0;
    this.currentY = 0;
    this.currentZ = 0;
    this.facingYaw = 0;
    this.behavior = 'idle';
  }

  public setWidgetDragState(dragging: boolean, normX?: number, normY?: number): void {
    this.isDragging = dragging;
    if (dragging && typeof normX === 'number' && typeof normY === 'number') {
      const clampedX = THREE.MathUtils.clamp(normX, -0.92, 0.92);
      const clampedY = THREE.MathUtils.clamp(normY, 0, 0.78);
      this.dragVelocityX = THREE.MathUtils.clamp((clampedX - this.currentX) * 18, -1.2, 1.2);
      this.currentX = clampedX;
      this.targetX = clampedX;
      this.currentY = clampedY;
      this.targetY = clampedY;
      this.behavior = 'idle';
    } else if (!dragging) {
      this.dragVelocityX = 0;
      // Gently land on the taskbar if dropped near the bottom, or perch comfortably where dropped!
      if (this.currentY < 0.14) {
        this.targetY = 0;
        this.behavior = 'idle';
      } else {
        this.behavior = 'sit_taskbar';
      }
      this.nextDecisionIn = 12.0;
    }
  }

  public update(params: {
    dt: number;
    elapsed: number;
    vrm: VRM | null;
    avatarContainer: THREE.Group;
    camera?: THREE.PerspectiveCamera | null;
    desktopRoamMode: boolean;
    autoRoamEnabled: boolean;
    cursorNormX: number;
    mood: MoodType;
    bodyLang: EmotionBodyLanguage;
    musicBass: number;
    musicBeat: number;
    isMusicPlaying: boolean;
    hasActiveReactionOrEmote: boolean;
    isSleeping?: boolean;
    activeHobbyKind?: HobbyKindId | null;
    boredom?: number;
    sleepiness?: number;
    energy?: number;
    curiosity?: number;
    onCrossDisplayEdge?: (direction: 'left' | 'right') => void;
  }): RoamFrameStatus {
    const {
      dt,
      elapsed,
      vrm,
      avatarContainer,
      camera,
      desktopRoamMode,
      autoRoamEnabled,
      cursorNormX,
      mood,
      bodyLang,
      musicBass,
      musicBeat,
      isMusicPlaying,
      hasActiveReactionOrEmote,
      isSleeping = false,
      activeHobbyKind = null,
      boredom = 25,
      sleepiness = 20,
      energy = 80,
      curiosity = 50,
      onCrossDisplayEdge,
    } = params;

    if (this.crossDisplayCooldown > 0) {
      this.crossDisplayCooldown -= dt;
    }

    // Countdown 2-minute cooldown between cursor visits
    if (this.approachUserCooldown > 0) {
      this.approachUserCooldown -= dt;
    }

    // Limit rare approach_user visits to 5–8 seconds before returning to independent wandering
    if (this.isApproachingUser) {
      this.approachUserDuration -= dt;
      if (this.approachUserDuration <= 0) {
        this.isApproachingUser = false;
        this.approachUserCooldown = 120.0; // 2-minute cooldown
        this.behavior = 'stretch_look';
        this.targetY = 0;
        this.nextDecisionIn = 10.0 + Math.random() * 15.0;
      }
    }

    // 1. Independent Autonomous Waypoint Engine (paused while performing an active hobby/bath action!)
    if (
      autoRoamEnabled &&
      !this.isDragging &&
      !hasActiveReactionOrEmote &&
      !isMusicPlaying &&
      !isSleeping &&
      !activeHobbyKind &&
      !this.isApproachingUser
    ) {
      this.nextDecisionIn -= dt;
      if (this.nextDecisionIn <= 0) {
        this.nextDecisionIn = 10.0 + Math.random() * 15.0; // 10–25 seconds cycle
        const roll = Math.random();

        // Rare AI-Initiated Cursor Curiosity: only when boredom > 80 or curiosity > 80, respecting 2-min cooldown
        const aiWantsApproach =
          (boredom > 80 || curiosity > 80) &&
          this.approachUserCooldown <= 0 &&
          roll < 0.28;

        if (aiWantsApproach) {
          this.behavior = 'approach_user';
          this.isApproachingUser = true;
          this.approachUserDuration = 5.0 + Math.random() * 3.0; // 5–8 seconds duration
          const clampX = desktopRoamMode ? 0.84 : 0.45;
          // Set destination to cursor snapshot once upon AI decision (never continuous following)
          this.targetX = THREE.MathUtils.clamp(cursorNormX * clampX, -clampX, clampX);
          this.targetY = 0;
          this.targetZ = 0.08;
        } else if (desktopRoamMode) {
          // Independent Desktop Roam State Machine
          if (sleepiness > 62 || energy < 35) {
            this.behavior = 'sit_taskbar';
            this.targetX = Math.random() < 0.5 ? -0.78 : 0.78;
            this.targetY = 0;
            this.targetZ = 0;
          } else if (roll < 0.38) {
            // WANDER_WAYPOINT: Taskbar Stroll across full screen width
            this.behavior = 'walk';
            this.targetX = (Math.random() - 0.5) * 1.68;
            this.targetY = 0;
            this.targetZ = 0;
          } else if (roll < 0.62) {
            // PEEK_EDGE: Screen-Edge Peek (left or right edge of monitor)
            this.behavior = 'peek';
            this.targetX = Math.random() < 0.5 ? -0.92 : 0.92;
            this.targetY = 0;
            this.targetZ = 0.05;
          } else if (roll < 0.78) {
            // IDLE_REST: Corner Perch / Sit on Taskbar
            this.behavior = 'sit_taskbar';
            this.targetX = Math.random() < 0.5 ? -0.75 : 0.75;
            this.targetY = 0;
            this.targetZ = 0;
          } else if (roll < 0.90) {
            // IDLE_REST: Stretch & Look Around
            this.behavior = 'stretch_look';
            this.targetY = 0;
            this.targetZ = 0;
          } else {
            // IDLE_REST: Crossed-Arms Tsundere Wait
            this.behavior = 'crossed_arms_wait';
            this.targetY = 0;
            this.targetZ = 0;
          }
        } else {
          // Normal 3D Widescreen Stage waypoints (purely self-directed)
          if (roll < 0.35) {
            this.behavior = 'walk';
            this.targetX = (Math.random() - 0.5) * 0.82;
            this.targetY = 0;
            this.targetZ = (Math.random() - 0.5) * 0.35;
          } else if (roll < 0.60) {
            this.behavior = 'peek';
            this.targetX = Math.random() < 0.5 ? -0.45 : 0.45;
            this.targetY = 0;
            this.targetZ = 0.26;
          } else if (roll < 0.80) {
            this.behavior = 'stretch_look';
            this.targetX = 0;
            this.targetY = 0;
            this.targetZ = 0;
          } else {
            this.behavior = 'crossed_arms_wait';
            this.targetX = (Math.random() - 0.5) * 0.4;
            this.targetY = 0;
            this.targetZ = 0;
          }
        }
      }
    }

    // 2. Smooth waypoint movement (x, y, z)
    const dx = this.targetX - this.currentX;
    const dy = this.targetY - this.currentY;
    const dz = this.targetZ - this.currentZ;
    const dist = Math.hypot(dx, dy, dz);
    const isMoving = dist > 0.02 && !this.isDragging && !hasActiveReactionOrEmote && !isSleeping;

    const moveSpeed = desktopRoamMode
      ? this.behavior === 'approach_user'
        ? 0.28
        : 0.2
      : this.behavior === 'approach_user'
      ? 0.46
      : 0.34;

    if (isMoving) {
      const step = Math.min(dist, moveSpeed * dt);
      this.currentX += (dx / dist) * step;
      this.currentY += (dy / dist) * step;
      this.currentZ += (dz / dist) * step;
      this.walkPhase += dt * 7.4;
    }

    // Trigger monitor display transition when character strolls off left or right edge in desktop roam
    if (desktopRoamMode && onCrossDisplayEdge && !this.isDragging && this.crossDisplayCooldown <= 0) {
      if (this.currentX <= -0.92 && dx < -0.01 && this.behavior === 'walk') {
        this.crossDisplayCooldown = 9.0;
        onCrossDisplayEdge('left');
      } else if (this.currentX >= 0.92 && dx > 0.01 && this.behavior === 'walk') {
        this.crossDisplayCooldown = 9.0;
        onCrossDisplayEdge('right');
      }
    }

    // Compute exact screen-space world coordinates using camera frustum in Desktop Widget Mode
    let targetWorldX = this.currentX * 0.58;
    let targetWorldY = this.currentY * 0.16;
    let targetWorldZ = this.currentZ * 0.55;

    if (desktopRoamMode && camera) {
      const distZ = Math.max(2.0, Math.abs(camera.position.z));
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distZ;
      const halfW = halfH * camera.aspect;
      const maxSpanX = Math.max(0.8, halfW - 0.34);
      const taskbarFloorY = camera.position.y - halfH + 0.02;
      const verticalSpanY = Math.max(0.6, halfH * 2 - 1.65);

      targetWorldX = this.currentX * maxSpanX;
      targetWorldZ = this.currentZ * 0.25;
      const stepBob = isMoving ? Math.abs(Math.sin(this.walkPhase)) * 0.032 : 0;
      targetWorldY =
        taskbarFloorY + Math.max(0, this.currentY) * verticalSpanY + stepBob;
    } else {
      targetWorldY = isMoving
        ? Math.abs(Math.sin(this.walkPhase)) * 0.028
        : this.currentY * 0.16;
    }

    if (!hasActiveReactionOrEmote) {
      const posLerp = expSmooth(this.isDragging ? 20 : 6.0, dt);
      avatarContainer.position.x = THREE.MathUtils.lerp(
        avatarContainer.position.x,
        targetWorldX,
        posLerp
      );
      avatarContainer.position.y = THREE.MathUtils.lerp(
        avatarContainer.position.y,
        targetWorldY,
        posLerp
      );
      avatarContainer.position.z = THREE.MathUtils.lerp(
        avatarContainer.position.z,
        targetWorldZ,
        posLerp
      );
    }

    // Only actively seated in a chair once she has FINISHED walking to her spot (never walk while sitting!)
    const isSeatedInChair =
      this.behavior === 'sit_taskbar' && !isMoving && !this.isDragging;
    const reportedBehavior: RoamBehavior =
      this.behavior === 'sit_taskbar' && isMoving ? 'walk' : this.behavior;

    // Smooth facing direction (turns naturally along walking direction during Taskbar Stroll!)
    let desiredYaw = 0;
    if (this.isDragging) {
      desiredYaw = THREE.MathUtils.clamp(-this.dragVelocityX * 0.25, -0.35, 0.35);
    } else if (activeHobbyKind || isSeatedInChair) {
      desiredYaw = 0;
    } else if (isMoving && Math.abs(dx) > 0.02) {
      desiredYaw = dx > 0 ? (desktopRoamMode ? 0.65 : 0.45) : desktopRoamMode ? -0.65 : -0.45;
    } else if (this.behavior === 'peek') {
      desiredYaw = this.currentX < -0.15 ? 0.38 : this.currentX > 0.15 ? -0.38 : 0;
    } else if (this.behavior === 'crossed_arms_wait' || mood === 'Pouty' || mood === 'Annoyed') {
      desiredYaw = desktopRoamMode ? 0.14 : 0;
    }
    this.facingYaw = THREE.MathUtils.lerp(this.facingYaw, desiredYaw, expSmooth(5.8, dt));
    avatarContainer.rotation.y = this.facingYaw;

    // Subtle pendulum tilt while dragged by the user
    const targetDragTiltZ = this.isDragging
      ? THREE.MathUtils.clamp(this.dragVelocityX * 0.22, -0.24, 0.24)
      : 0;
    avatarContainer.rotation.z = THREE.MathUtils.lerp(
      avatarContainer.rotation.z,
      targetDragTiltZ,
      expSmooth(9.0, dt)
    );
    this.dragVelocityX *= 0.88;

    // 3. Smoothly interpolate EVERY tracked bone (zero snapping!)
    if (vrm?.humanoid && !hasActiveReactionOrEmote) {
      const isVrm0 = vrm.meta?.metaVersion === '0';
      const armSign = isVrm0 ? 1 : -1;

      const breath = Math.sin(elapsed * bodyLang.breathingRate);
      const swaySpeed = isMusicPlaying ? 3.2 : 1.3;
      const swayAmp = isMusicPlaying ? 0.05 + musicBass * 0.08 : 0.022;
      const armSway = Math.sin(elapsed * swaySpeed) * swayAmp;

      const targets: Record<TrackedBone, { x: number; y: number; z: number }> = {
        hips: {
          x: isMusicPlaying ? Math.sin(elapsed * 2.8) * (0.035 + musicBeat * 0.045) : 0,
          y: isMusicPlaying
            ? Math.abs(Math.sin(elapsed * 5.6)) * (0.025 + musicBeat * 0.04)
            : Math.sin(elapsed * 0.7) * 0.015,
          z: isMusicPlaying ? Math.sin(elapsed * 2.8) * 0.08 : bodyLang.hipWeightShift * 0.45,
        },
        spine: {
          x:
            breath * 0.012 +
            bodyLang.spineLeanX * 0.35 +
            (isMusicPlaying ? Math.sin(elapsed * 2.8) * (0.04 + musicBass * 0.06) : 0),
          y: Math.sin(elapsed * (isMusicPlaying ? 2.8 : 0.55)) * (isMusicPlaying ? 0.08 : 0.018),
          z: isMusicPlaying ? Math.sin(elapsed * 2.8) * (0.04 + musicBass * 0.06) : 0,
        },
        chest: {
          x: breath * 0.015 + bodyLang.spineLeanX * 0.22,
          y: 0,
          z: 0,
        },
        // Arms hang naturally alongside hips, or perform live idol dance choreography when music plays
        leftUpperArm: {
          x: isMusicPlaying
            ? -0.15 - musicBeat * 0.18
            : -0.03 -
              bodyLang.shoulderDroop * 0.15 +
              bodyLang.shoulderFidget * 0.25,
          y: 0.02,
          z: isMusicPlaying
            ? armSign * (0.95 - Math.sin(elapsed * 2.8) * 0.22)
            : armSign * (1.22 + bodyLang.shoulderDroop * 0.25 + armSway),
        },
        rightUpperArm: {
          x: isMusicPlaying
            ? -0.28 - musicBeat * 0.25
            : -0.03 -
              bodyLang.shoulderDroop * 0.15 -
              bodyLang.shoulderFidget * 0.25,
          y: -0.02,
          z: isMusicPlaying
            ? -armSign * (0.75 + Math.sin(elapsed * 2.8) * 0.35)
            : -armSign * (1.22 + bodyLang.shoulderDroop * 0.25 - armSway),
        },
        // Forearms: gentle natural elbow flexion, or rhythmic idol pumps during concert music
        leftLowerArm: {
          x: 0.10,
          y: isMusicPlaying ? 0.35 + Math.sin(elapsed * 1.4) * 0.20 : -0.16,
          z: armSign * 0.04,
        },
        rightLowerArm: {
          x: 0.10,
          y: isMusicPlaying ? -0.45 - Math.sin(elapsed * 2.8) * 0.32 : 0.16,
          z: -armSign * 0.04,
        },
        // Relaxed natural hands resting alongside thighs
        leftHand: { x: 0.04, y: -0.04, z: armSign * 0.02 },
        rightHand: { x: 0.04, y: 0.04, z: -armSign * 0.02 },
        leftUpperLeg: {
          x: isMusicPlaying ? Math.sin(elapsed * 2.8) * (0.08 + musicBeat * 0.10) : 0,
          y: 0,
          z: 0,
        },
        rightUpperLeg: {
          x: isMusicPlaying ? -Math.sin(elapsed * 2.8) * (0.08 + musicBeat * 0.10) : 0,
          y: 0,
          z: 0,
        },
        leftLowerLeg: {
          x: isMusicPlaying ? -Math.max(0, Math.sin(elapsed * 2.8)) * (0.16 + musicBeat * 0.14) : 0,
          y: 0,
          z: 0,
        },
        rightLowerLeg: {
          x: isMusicPlaying ? -Math.max(0, -Math.sin(elapsed * 2.8)) * (0.16 + musicBeat * 0.14) : 0,
          y: 0,
          z: 0,
        },
      };

      if (this.isDragging) {
        // Cute surprised/flustered Shimeji dangle pose while picked up!
        const kick = Math.sin(elapsed * 11.5) * 0.24;
        targets.leftUpperArm.z = armSign * 0.48;
        targets.rightUpperArm.z = -armSign * 0.48;
        targets.leftUpperArm.x = -0.32;
        targets.rightUpperArm.x = -0.32;
        targets.leftLowerArm.y = 0.65;
        targets.rightLowerArm.y = -0.65;
        targets.leftUpperLeg.x = 0.28 + kick;
        targets.rightUpperLeg.x = 0.28 - kick;
        targets.leftLowerLeg.x = -0.45 - Math.max(0, kick);
        targets.rightLowerLeg.x = -0.45 - Math.max(0, -kick);
      } else if (isMoving) {
        const swing = Math.sin(this.walkPhase) * 0.36;
        const kneeL = Math.max(0, -Math.cos(this.walkPhase)) * 0.44;
        const kneeR = Math.max(0, Math.cos(this.walkPhase)) * 0.44;
        targets.hips.z = Math.sin(this.walkPhase) * 0.048;
        targets.hips.y = Math.cos(this.walkPhase) * 0.06;
        targets.leftUpperLeg.x = swing;
        targets.rightUpperLeg.x = -swing;
        targets.leftLowerLeg.x = -kneeL;
        targets.rightLowerLeg.x = -kneeR;
        targets.leftUpperArm.x = -0.03 - swing * 0.55;
        targets.rightUpperArm.x = -0.03 + swing * 0.55;
        targets.leftLowerArm.x = 0.10 + Math.max(0, -swing) * 0.22;
        targets.rightLowerArm.x = 0.10 + Math.max(0, swing) * 0.22;
      } else if (this.behavior === 'sit_taskbar') {
        const forwardSign = isVrm0 ? 1 : -1;
        // Modest, grounded sitting posture on her 3D AI Chair (thighs flush at y=0.45m, knees at ~86°, feet at y=0)
        const gentleSway = Math.sin(elapsed * 1.6) * 0.03;
        targets.leftUpperLeg.x = forwardSign * (Math.PI * 0.47);
        targets.rightUpperLeg.x = forwardSign * (Math.PI * 0.47);
        targets.leftUpperLeg.z = armSign * 0.09; // Inward adduction: brings left knee to centerline
        targets.rightUpperLeg.z = -armSign * 0.09; // Inward adduction: brings right knee to centerline
        targets.leftUpperLeg.y = forwardSign * 0.035; // Slight internal rotation keeps thighs pressed together
        targets.rightUpperLeg.y = -forwardSign * 0.035;
        targets.leftLowerLeg.x = -forwardSign * (Math.PI * 0.47 + gentleSway);
        targets.rightLowerLeg.x = -forwardSign * (Math.PI * 0.47 - gentleSway);
        targets.leftLowerLeg.z = -armSign * 0.02; // Calves and ankles stay together
        targets.rightLowerLeg.z = armSign * 0.02;
        // Resting hands neatly down forward on lap / thighs (never bent backwards)
        targets.leftUpperArm.x = -0.12;
        targets.rightUpperArm.x = -0.12;
        targets.leftUpperArm.z = armSign * 1.25;
        targets.rightUpperArm.z = -armSign * 1.25;
        targets.leftLowerArm.x = 0.35;
        targets.rightLowerArm.x = 0.35;
        targets.leftLowerArm.y = -0.35;
        targets.rightLowerArm.y = 0.35;
        targets.leftLowerArm.z = armSign * 0.12;
        targets.rightLowerArm.z = -armSign * 0.12;
        targets.leftHand.x = 0.08;
        targets.rightHand.x = 0.08;
        targets.leftHand.z = armSign * 0.04;
        targets.rightHand.z = -armSign * 0.04;
      } else if (bodyLang.coldRubArms > 0.25 && !isSleeping) {
        // Solved convention-free in character frame below via applyColdRubArms
      } else if (
        !isSleeping &&
        (this.behavior === 'crossed_arms_wait' || bodyLang.armsCrossTension > 0.35)
      ) {
        // Solved convention-free in character frame below via applyCrossedArms
        targets.hips.z += Math.sin(elapsed * 1.6) * 0.035;
      } else if (this.behavior === 'stretch_look') {
        const stretch = 0.5 - 0.5 * Math.cos(elapsed * 0.98);
        const forwardSign = isVrm0 ? 1 : -1;
        targets.chest.x = -forwardSign * 0.08 * stretch;
        targets.spine.y = Math.sin(elapsed * 0.85) * 0.14;
      } else if (this.behavior === 'peek') {
        const leanDir = this.currentX < 0 ? -1 : 1;
        targets.spine.x = 0.09;
        targets.spine.z = leanDir * 0.16;
      }

      // Relaxed idle, active hobby/bath actions, crossed-arms, and cold-hug arms are all solved from character-frame directions
      // (+X left, +Y up, +Z forward) so VRM 0.x and VRM 1.0 produce identical front-facing poses with no backwards elbows.
      const useStandingHobby = !this.isDragging && !isSleeping && Boolean(activeHobbyKind);
      if (useStandingHobby && activeHobbyKind) {
        const hf = getHobbyActivityFrame(activeHobbyKind, elapsed);
        const forwardSign = isVrm0 ? 1 : -1;
        targets.spine.y = hf.spineTwistY * 0.65;
        targets.spine.x += forwardSign * hf.spineLeanX;
        targets.chest.y = hf.spineTwistY * 0.35;
        targets.chest.x += forwardSign * hf.spineLeanX * 0.45;
      }

      const useShoulderStretch =
        !useStandingHobby &&
        !this.isDragging &&
        !isMoving &&
        !isSleeping &&
        this.behavior === 'stretch_look';

      const useColdRubArms =
        !useStandingHobby &&
        !useShoulderStretch &&
        !this.isDragging &&
        !isMoving &&
        this.behavior !== 'sit_taskbar' &&
        !isSleeping &&
        bodyLang.coldRubArms > 0.25;
      const useCrossedArms =
        !useStandingHobby &&
        !useShoulderStretch &&
        !this.isDragging &&
        !isMoving &&
        this.behavior !== 'sit_taskbar' &&
        !isSleeping &&
        !useColdRubArms &&
        (this.behavior === 'crossed_arms_wait' || bodyLang.armsCrossTension > 0.35);

      const armsBusy =
        useStandingHobby ||
        useShoulderStretch ||
        isMusicPlaying ||
        this.isDragging ||
        isMoving ||
        this.behavior === 'sit_taskbar' ||
        useColdRubArms ||
        useCrossedArms;
      const naturalArms = !armsBusy;
      const vectorSolvedArms =
        useStandingHobby || useShoulderStretch || naturalArms || useCrossedArms || useColdRubArms;

      const boneLerp = expSmooth(this.isDragging ? 11.5 : useStandingHobby ? 7.8 : 6.5, dt);
      for (const boneName of TRACKED_BONES) {
        if (vectorSolvedArms && NATURAL_ARM_BONES.has(boneName)) continue;
        const s = this.smoothBones[boneName];
        const tgt = targets[boneName];
        s.x = THREE.MathUtils.lerp(s.x, tgt.x, boneLerp);
        s.y = THREE.MathUtils.lerp(s.y, tgt.y, boneLerp);
        s.z = THREE.MathUtils.lerp(s.z, tgt.z, boneLerp);

        const node = vrm.humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
        if (node) {
          node.rotation.set(s.x, s.y, s.z);
        }
      }

      if (vectorSolvedArms) {
        const bone = (name: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(name);
        const lu = bone('leftUpperArm');
        const ll = bone('leftLowerArm');
        const lh = bone('leftHand');
        const ru = bone('rightUpperArm');
        const rl = bone('rightLowerArm');
        const rh = bone('rightHand');
        if (lu && ll && lh && ru && rl && rh) {
          if (useStandingHobby && activeHobbyKind) {
            applyHobbyActivityArms(vrm, activeHobbyKind, elapsed, boneLerp);
          } else if (useShoulderStretch) {
            applyShoulderStretchArms(vrm, elapsed, boneLerp);
          } else if (useColdRubArms) {
            applyColdRubArms(vrm, boneLerp, elapsed, bodyLang.coldRubArms);
          } else if (useCrossedArms) {
            applyCrossedArms(vrm, boneLerp, { breath });
          } else {
            const droop = bodyLang.shoulderDroop;
            const fidget = bodyLang.shoulderFidget;
            applyNaturalArms(
              [
                {
                  upper: lu,
                  lower: ll,
                  hand: lh,
                  side: 1,
                  outwardOffset: -droop * 0.08 - armSway,
                  forwardOffset: droop * 0.15 - fidget * 0.25,
                },
                {
                  upper: ru,
                  lower: rl,
                  hand: rh,
                  side: -1,
                  outwardOffset: -droop * 0.08 + armSway,
                  forwardOffset: droop * 0.15 + fidget * 0.25,
                },
              ],
              vrm.scene.parent,
              DEFAULT_NATURAL_ARMS,
              boneLerp
            );
          }
          // Keep the Euler smoothing state in sync so switching back to a scripted pose never pops
          const sync: Array<[TrackedBone, THREE.Object3D]> = [
            ['leftUpperArm', lu],
            ['leftLowerArm', ll],
            ['leftHand', lh],
            ['rightUpperArm', ru],
            ['rightLowerArm', rl],
            ['rightHand', rh],
          ];
          for (const [name, node] of sync) {
            const s = this.smoothBones[name];
            s.x = node.rotation.x;
            s.y = node.rotation.y;
            s.z = node.rotation.z;
          }
        }
      }
    }

    return {
      normX: this.currentX,
      normY: this.currentY,
      normZ: this.currentZ,
      behavior: reportedBehavior,
      behaviorLabel: this.isDragging
        ? 'Picked Up (Dragging!)'
        : ROAM_BEHAVIOR_LABELS[reportedBehavior],
      isMoving,
      isDragging: this.isDragging,
    };
  }
}
