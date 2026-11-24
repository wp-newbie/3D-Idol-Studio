import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  Brain,
  Camera,
  Eye,
  EyeOff,
  Footprints,
  Music,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import type {
  AutonomousNeedTrigger,
  AvatarPosture,
  CameraPreset,
  CareActivityId,
  InteractionZone,
  MeshDescriptor,
  MicroTellCommand,
  MicroTellKind,
  MoodType,
  OutfitSlot,
  Persona,
  ProceduralEmoteId,
  RoamBehavior,
  RoamCommand,
  SleepingPosition,
  StageEnvironmentId,
  VaultVrmaMeta,
} from '../types/studio';
import { MOOD_META } from '../data/presets';
import {
  getVrmaBuffer,
  resolveAvatarBufferForSlot,
  updateVaultModelThumbnail,
} from '../storage/modelVault';
import { voiceEngine } from '../services/ttsService';
import { computePersonaLiveVoiceTone } from '../services/voiceToneDirector';
import { musicSync, type MusicTrackState } from '../services/musicSyncService';
import { applyOutfitModsToScene, detectClothingMeshes } from '../stage/clothingModder';
import {
  applyProceduralEmote,
  loadVrmaClipFromBuffer,
  PROCEDURAL_EMOTES,
  type ActiveProceduralEmote,
} from '../stage/emoteController';
import {
  STAGE_ENVIRONMENTS,
  StageEnvironmentController,
} from '../stage/stageEnvironments';
import {
  AutonomousRoamController,
  ROAM_BEHAVIOR_LABELS,
} from '../stage/roamController';
import { AvatarPoseController } from '../stage/poseController';
import { VrmEmotionEngine, type HumanSensationContext } from '../stage/emotionEngine';
import { AiBrainPopover } from './AiBrainPopover';
import { CareActivityBar } from './CareActivityBar';

interface StageViewportProps {
  persona: Persona;
  activeSlot: OutfitSlot;
  isGenerating: boolean;
  isSpeaking: boolean;
  isUserTyping: boolean;
  vaultVrmas: VaultVrmaMeta[];
  desktopRoamMode: boolean;
  freeRoamEnabled: boolean;
  autoRoamEnabled: boolean;
  posture?: AvatarPosture;
  onChangePosture?: (next: AvatarPosture) => void;
  roamBehavior: RoamBehavior;
  roamCommand: RoamCommand | null;
  emoteCommand: { id: number; emoteId: ProceduralEmoteId } | null;
  microTellCommand: MicroTellCommand | null;
  onToggleAutoRoam: () => void;
  onTriggerBrainImpulse: (reason: AutonomousNeedTrigger) => void;
  onCareActivity: (activity: CareActivityId) => void;
  onWakeFromSleep: () => void;
  onSpeakLatest: () => void;
  onStopSpeaking: () => void;
  recentInteractionZone?: InteractionZone | null;
  onOpenMemoryJournal: () => void;
  onRoamStatusChange?: (status: {
    normX: number;
    headScreenX: number;
    headScreenY: number;
    behavior: RoamBehavior;
    isDragging: boolean;
  }) => void;
  onWidgetAvatarClick?: () => void;
  onWidgetAvatarDropped?: () => void;
  onCharacterHoverChange?: (isHoveringAvatar: boolean) => void;
  onMeshesDetected: (meshes: MeshDescriptor[]) => void;
  onImportModelFile: (file: File) => void;
  onImportVrmaFile: (file: File) => Promise<VaultVrmaMeta | null>;
  onDeleteVrma: (id: string) => void;
  onSelectEnvironment: (envId: StageEnvironmentId) => void;
  onUploadCustomEnvironment: (file: File) => void;
  onClearCustomEnvironment: () => void;
  onModelVaultSynced?: () => void;
  onOpenWardrobe: () => void;
  onAvatarInteraction: (zone: InteractionZone, nextMood: MoodType) => void;
}

interface ComputedCameraFrames {
  portrait: { pos: [number, number, number]; target: [number, number, number] };
  bust: { pos: [number, number, number]; target: [number, number, number] };
  full: { pos: [number, number, number]; target: [number, number, number] };
  reset: { pos: [number, number, number]; target: [number, number, number] };
}

interface FloatingParticle {
  id: number;
  x: number;
  y: number;
  symbol: string;
  driftX: number;
  color: string;
}

interface ActiveReactionAnim {
  zone: InteractionZone;
  startTime: number;
  duration: number;
}

type StagePanel = 'none' | 'emotes' | 'environments' | 'music' | 'brain';

const DEFAULT_FRAMES: ComputedCameraFrames = {
  portrait: { pos: [0, 1.04, 0.98], target: [0, 0.98, 0] },
  bust: { pos: [0, 0.98, 1.56], target: [0, 0.88, 0] },
  full: { pos: [0, 0.8, 2.62], target: [0, 0.62, 0] },
  reset: { pos: [0, 1.04, 2.25], target: [0, 0.85, 0] },
};

const HEADPAT_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><text x='2' y='24' font-size='22'>🤚</text></svg>") 16 16, pointer`;
const POKE_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><text x='2' y='24' font-size='22'>👉</text></svg>") 24 14, pointer`;
const HAIR_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><text x='2' y='24' font-size='20'>✨</text></svg>") 16 16, pointer`;
const OUTFIT_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><text x='2' y='24' font-size='20'>👗</text></svg>") 16 16, pointer`;

const ZONE_HOVER_META: Record<
  InteractionZone,
  { label: string; emoji: string; cursor: string }
> = {
  headpat: { label: 'Headpat', emoji: '🤚', cursor: HEADPAT_CURSOR },
  poke: { label: 'Poke Cheek', emoji: '👉', cursor: POKE_CURSOR },
  hair_tug: { label: 'Hair Bounce', emoji: '✨', cursor: HAIR_CURSOR },
  outfit_tap: { label: 'Tap Outfit', emoji: '👗', cursor: OUTFIT_CURSOR },
};

function computeCameraFramesFromBox(
  box: THREE.Box3,
  posture: AvatarPosture = 'seated'
): ComputedCameraFrames {
  const size = new THREE.Vector3();
  box.getSize(size);
  const height = Math.max(1.0, size.y);

  if (posture === 'sleeping') {
    // Elegant bedside framing looking across the bed from the side towards her pillow and face
    return {
      portrait: {
        pos: [0.65, 0.78, -0.62],
        target: [0, 0.44, -0.74], // Gentle close-up on pillow and sleeping face
      },
      bust: {
        pos: [1.05, 0.98, -0.45],
        target: [0, 0.44, -0.55], // Head, pillow, arms, and top fold of comforter
      },
      full: {
        pos: [1.85, 1.35, -0.15],
        target: [0, 0.42, -0.25], // Wide side view of entire bed and room
      },
      reset: {
        pos: [1.35, 1.12, -0.42],
        target: [0, 0.44, -0.52], // Default cozy elevated bedside perspective
      },
    };
  }

  if (posture === 'seated') {
    // Seated framing: hip drop lowers head/torso by ~0.44m, placing target.y ≈ 0.85
    const seatedDrop = height * 0.27;
    const headY = Math.max(0.72, box.min.y + height * 0.86 - seatedDrop);
    const upperY = Math.max(0.65, box.min.y + height * 0.72 - seatedDrop * 0.65);
    const fullMidY = Math.max(0.45, box.min.y + height * 0.38);

    return {
      portrait: { pos: [0, headY + 0.04, height * 0.6], target: [0, headY - 0.02, 0] },
      bust: { pos: [0, upperY + 0.08, height * 0.96], target: [0, upperY, 0] },
      full: { pos: [0, fullMidY + 0.18, height * 1.62], target: [0, fullMidY, 0] },
      reset: {
        pos: [0, 1.04, Math.max(2.2, height * 1.38)],
        target: [0, 0.85, 0],
      },
    };
  }

  const headY = box.min.y + height * 0.86;
  const bustY = box.min.y + height * 0.75;
  const resetTargetY = box.min.y + height * 0.71;
  const midY = box.min.y + height * 0.53;

  // All presets sit strictly on the positive +Z axis looking straight toward (0, targetY, 0)
  return {
    portrait: { pos: [0, headY + 0.03, height * 0.59], target: [0, headY - 0.02, 0] },
    bust: { pos: [0, bustY + 0.05, height * 1.0], target: [0, bustY, 0] },
    full: { pos: [0, midY + 0.16, height * 1.76], target: [0, midY, 0] },
    reset: {
      pos: [0, resetTargetY + 0.2, Math.max(2.4, height * 1.48)],
      target: [0, resetTargetY, 0],
    },
  };
}

function classifyRaycasterHit(
  hit: THREE.Intersection,
  vrm: VRM | null,
  modelBox: THREE.Box3
): InteractionZone {
  const meshName = (hit.object?.name || '').toLowerCase();
  const matName = (() => {
    const obj = hit.object as THREE.Mesh;
    if (!obj.material) return '';
    const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    return (m?.name || '').toLowerCase();
  })();
  const combined = `${meshName} ${matName}`;
  const pt = hit.point;
  const height = Math.max(1.0, modelBox.max.y - modelBox.min.y);

  const headPos = new THREE.Vector3(0, modelBox.min.y + height * 0.86, 0);
  const headBone = vrm?.humanoid?.getNormalizedBoneNode('head');
  if (headBone) headBone.getWorldPosition(headPos);

  const dyFromHead = pt.y - headPos.y;
  const dxFromCenter = Math.abs(pt.x - headPos.x);
  const isHairMesh = /hair|ribbon|bow|twintail|tail|bang/i.test(combined);
  const isFaceMesh = /face|cheek|eye|mouth|brow|head/i.test(combined);
  const isClothMesh =
    /cloth|top|shirt|jacket|coat|skirt|short|dress|shoe|body_2|body_3|body_4/i.test(combined);

  if (dyFromHead >= 0.1) return 'headpat';
  if (isHairMesh && (dxFromCenter > 0.085 || dyFromHead < 0.05)) return 'hair_tug';
  if (isFaceMesh || (dyFromHead >= -0.055 && dyFromHead < 0.1 && !isClothMesh)) {
    return 'poke';
  }
  return 'outfit_tap';
}

function applyPoseAndMicroReactions(params: {
  vrm: VRM;
  avatarContainer: THREE.Group;
  elapsed: number;
  reaction: ActiveReactionAnim | null;
  musicBass: number;
  musicBeat: number;
  isMusicPlaying: boolean;
}) {
  const { vrm, avatarContainer, elapsed, reaction, musicBass, musicBeat, isMusicPlaying } =
    params;
  const humanoid = vrm.humanoid;
  if (!humanoid) return;

  const isVrm0 = vrm.meta?.metaVersion === '0';
  const armSign = isVrm0 ? 1 : -1;
  const swaySpeed = isMusicPlaying ? 3.2 : 1.35;
  const swayAmp = isMusicPlaying ? 0.05 + musicBass * 0.08 : 0.022;
  const sway = Math.sin(elapsed * swaySpeed) * swayAmp;

  const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
  const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
  const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
  const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');
  const leftHand = humanoid.getNormalizedBoneNode('leftHand');
  const rightHand = humanoid.getNormalizedBoneNode('rightHand');
  const spine = humanoid.getNormalizedBoneNode('spine');
  const chest = humanoid.getNormalizedBoneNode('chest');

  let reactionWeight = 0;
  let reactionAge = 0;
  if (reaction) {
    reactionAge = (performance.now() - reaction.startTime) / 1000;
    const t = reactionAge / reaction.duration;
    if (t >= 0 && t < 1) {
      const easeIn = Math.min(1, t / 0.15);
      const easeOut = t > 0.65 ? Math.max(0, (1 - t) / 0.35) : 1;
      reactionWeight = easeIn * easeOut;
    }
  }

  let leftUpperZ = armSign * (1.15 + sway);
  let rightUpperZ = -armSign * (1.15 - sway);
  let leftUpperX = isMusicPlaying ? 0.08 - musicBeat * 0.14 : 0.08;
  let rightUpperX = isMusicPlaying ? 0.08 - musicBeat * 0.14 : 0.08;
  let leftLowerZ = armSign * 0.14;
  let rightLowerZ = -armSign * 0.14;
  let leftLowerY = 0.18;
  let rightLowerY = -0.18;

  const breath = Math.sin(elapsed * 1.9);
  const musicSwayZ = isMusicPlaying ? Math.sin(elapsed * 2.4) * (0.045 + musicBass * 0.06) : 0;
  let spineX = breath * 0.015 + (isMusicPlaying ? musicBeat * 0.055 : 0);
  let spineY = Math.sin(elapsed * (isMusicPlaying ? 1.8 : 0.55)) * (isMusicPlaying ? 0.075 : 0.025);
  let spineZ = musicSwayZ;
  let targetContainerZ = 0;
  let targetContainerX = 0;

  if (reaction && reactionWeight > 0) {
    if (reaction.zone === 'outfit_tap') {
      leftUpperZ = THREE.MathUtils.lerp(leftUpperZ, armSign * 0.72, reactionWeight);
      rightUpperZ = THREE.MathUtils.lerp(rightUpperZ, -armSign * 0.72, reactionWeight);
      leftUpperX = THREE.MathUtils.lerp(leftUpperX, -0.42, reactionWeight);
      rightUpperX = THREE.MathUtils.lerp(rightUpperX, -0.42, reactionWeight);
      leftLowerY = THREE.MathUtils.lerp(leftLowerY, 1.05, reactionWeight);
      rightLowerY = THREE.MathUtils.lerp(rightLowerY, -1.05, reactionWeight);
      spineX -= 0.06 * reactionWeight;
      targetContainerZ = -0.14 * reactionWeight;
    } else if (reaction.zone === 'headpat') {
      spineX += 0.07 * reactionWeight;
      targetContainerZ = 0.04 * reactionWeight;
    } else if (reaction.zone === 'poke') {
      const flinch = Math.sin(Math.min(1, reactionAge * 4.5) * Math.PI) * reactionWeight;
      spineZ = -0.09 * flinch;
      spineY = -0.1 * reactionWeight;
      targetContainerX = 0.03 * flinch;
    } else if (reaction.zone === 'hair_tug') {
      const bounce = Math.sin(reactionAge * 24) * Math.exp(-reactionAge * 2.8);
      spineZ = bounce * 0.07;
      targetContainerX = bounce * 0.025;
    }
  }

  if (leftUpperArm) {
    leftUpperArm.rotation.z = leftUpperZ;
    leftUpperArm.rotation.x = leftUpperX;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z = rightUpperZ;
    rightUpperArm.rotation.x = rightUpperX;
  }
  if (leftLowerArm) {
    leftLowerArm.rotation.z = leftLowerZ;
    leftLowerArm.rotation.y = leftLowerY;
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.z = rightLowerZ;
    rightLowerArm.rotation.y = rightLowerY;
  }
  if (leftHand) leftHand.rotation.z = armSign * 0.06;
  if (rightHand) rightHand.rotation.z = -armSign * 0.06;

  if (spine) {
    spine.rotation.x = spineX;
    spine.rotation.y = spineY;
    spine.rotation.z = spineZ;
  }
  if (chest) {
    chest.rotation.x = breath * 0.018;
  }

  avatarContainer.position.z = THREE.MathUtils.lerp(
    avatarContainer.position.z,
    targetContainerZ,
    0.16
  );
  avatarContainer.position.x = THREE.MathUtils.lerp(
    avatarContainer.position.x,
    targetContainerX,
    0.22
  );
}

export const StageViewport: React.FC<StageViewportProps> = ({
  persona,
  activeSlot,
  isGenerating,
  isSpeaking,
  isUserTyping,
  vaultVrmas,
  desktopRoamMode,
  freeRoamEnabled,
  autoRoamEnabled,
  posture: controlledPosture,
  onChangePosture,
  roamBehavior,
  roamCommand,
  emoteCommand,
  microTellCommand,
  onToggleAutoRoam,
  onTriggerBrainImpulse,
  onCareActivity,
  onWakeFromSleep,
  onSpeakLatest,
  onStopSpeaking,
  recentInteractionZone,
  onOpenMemoryJournal,
  onRoamStatusChange,
  onWidgetAvatarClick,
  onWidgetAvatarDropped,
  onCharacterHoverChange,
  onMeshesDetected,
  onImportModelFile,
  onImportVrmaFile,
  onDeleteVrma,
  onSelectEnvironment,
  onUploadCustomEnvironment,
  onClearCustomEnvironment,
  onModelVaultSynced,
  onOpenWardrobe,
  onAvatarInteraction,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const vrmaInputRef = useRef<HTMLInputElement | null>(null);
  const envInputRef = useRef<HTMLInputElement | null>(null);
  const musicInputRef = useRef<HTMLInputElement | null>(null);

  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [loadLabel, setLoadLabel] = useState('Initializing Anime 3D Stage...');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeModelFileName, setActiveModelFileName] = useState<string>('Anime VRM');
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPreset>('reset');
  const [internalPosture, setInternalPosture] = useState<AvatarPosture>(
    controlledPosture ?? 'seated'
  );
  const posture = controlledPosture ?? internalPosture;
  const setPosture = (next: AvatarPosture) => {
    setInternalPosture(next);
    onChangePosture?.(next);
  };
  const [sleepingPosition, setSleepingPosition] = useState<SleepingPosition>(
    persona.brain?.sleepingPosition || 'side_curled_right'
  );
  const sleepingPosRef = useRef<SleepingPosition>(sleepingPosition);
  sleepingPosRef.current = sleepingPosition;

  useEffect(() => {
    if (persona.brain?.sleepingPosition && persona.brain.sleepingPosition !== sleepingPosRef.current) {
      setSleepingPosition(persona.brain.sleepingPosition);
    }
  }, [persona.brain?.sleepingPosition]);

  const [showThoughtHud, setShowThoughtHud] = useState(true);
  const [openPanel, setOpenPanel] = useState<StagePanel>('none');

  // Cursor Eye-Tracking, Hit-Zones, Emotes & Music State
  const [eyeTrackingEnabled, setEyeTrackingEnabled] = useState(true);
  const [hoveredZone, setHoveredZone] = useState<InteractionZone | null>(null);
  const [particles, setParticles] = useState<FloatingParticle[]>([]);
  const [lastZoneToast, setLastZoneToast] = useState<string | null>(null);
  const [activeEmoteLabel, setActiveEmoteLabel] = useState<string | null>(null);
  const [musicState, setMusicState] = useState<MusicTrackState>({
    fileName: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.75,
  });
  const [musicBars, setMusicBars] = useState<number[]>(Array(12).fill(0.1));

  const eyeTrackingRef = useRef(eyeTrackingEnabled);
  eyeTrackingRef.current = eyeTrackingEnabled;
  const moodRef = useRef<MoodType>(persona.mood);
  const emotionIntensityRef = useRef<number>(persona.emotionIntensity ?? 0.7);
  emotionIntensityRef.current = persona.emotionIntensity ?? 0.7;
  const emotionEngineRef = useRef<VrmEmotionEngine>(new VrmEmotionEngine());
  const isSpeakingRef = useRef<boolean>(isSpeaking);
  isSpeakingRef.current = isSpeaking;
  const isUserTypingRef = useRef<boolean>(isUserTyping);
  isUserTypingRef.current = isUserTyping;
  const humanBrainRef = useRef(persona.brain);
  humanBrainRef.current = persona.brain;
  const activeTellRef = useRef<{
    kind: MicroTellKind;
    startTime: number;
    duration: number;
  } | null>(null);
  const lastTellCmdIdRef = useRef<number>(-1);
  const onWakeFromSleepRef = useRef(onWakeFromSleep);
  onWakeFromSleepRef.current = onWakeFromSleep;
  const desktopRoamRef = useRef<boolean>(desktopRoamMode);
  desktopRoamRef.current = desktopRoamMode;
  const freeRoamRef = useRef<boolean>(freeRoamEnabled);
  freeRoamRef.current = freeRoamEnabled;
  const autoRoamRef = useRef<boolean>(autoRoamEnabled);
  autoRoamRef.current = autoRoamEnabled;
  const lastEmoteCommandIdRef = useRef<number>(-1);
  const roamControllerRef = useRef<AutonomousRoamController>(new AutonomousRoamController());
  const poseControllerRef = useRef<AvatarPoseController>(new AvatarPoseController());
  const postureRef = useRef<AvatarPosture>(posture);
  postureRef.current = posture;
  const modelScaleRef = useRef<number>(1);
  const lastRoamUiReportRef = useRef<number>(0);
  const onRoamStatusChangeRef = useRef(onRoamStatusChange);
  onRoamStatusChangeRef.current = onRoamStatusChange;
  const onWidgetAvatarClickRef = useRef(onWidgetAvatarClick);
  onWidgetAvatarClickRef.current = onWidgetAvatarClick;
  const onWidgetAvatarDroppedRef = useRef(onWidgetAvatarDropped);
  onWidgetAvatarDroppedRef.current = onWidgetAvatarDropped;
  const onCharacterHoverChangeRef = useRef(onCharacterHoverChange);
  onCharacterHoverChangeRef.current = onCharacterHoverChange;
  const widgetDragRef = useRef<{
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number;
  } | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const envControllerRef = useRef<StageEnvironmentController | null>(null);
  const avatarContainerRef = useRef<THREE.Group | null>(null);
  const avatarRootRef = useRef<THREE.Group | null>(null);
  const activeYawOffsetRef = useRef<number>(activeSlot.yawOffset ?? 0);
  activeYawOffsetRef.current =
    typeof activeSlot.yawOffset === 'number' && Number.isFinite(activeSlot.yawOffset)
      ? activeSlot.yawOffset
      : 0;
  const currentVrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const activeVrmaActionRef = useRef<THREE.AnimationAction | null>(null);
  const activeEmoteRef = useRef<ActiveProceduralEmote | null>(null);

  const modelBoxRef = useRef<THREE.Box3>(
    new THREE.Box3(new THREE.Vector3(-0.35, 0, -0.25), new THREE.Vector3(0.35, 1.62, 0.25))
  );
  const lookAtTargetRef = useRef<THREE.Object3D | null>(null);
  const mouseNdcRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });
  const activeReactionRef = useRef<ActiveReactionAnim | null>(null);
  const hairBounceUntilRef = useRef<number>(0);
  const hoveredZoneRef = useRef<InteractionZone | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastHoverSparkleAtRef = useRef<number>(0);
  const particleIdRef = useRef<number>(1);
  const headpatFlipRef = useRef<boolean>(false);
  const lastBarsUiAtRef = useRef<number>(0);

  const textureCacheRef = useRef<Map<string, THREE.Texture>>(new Map());
  const cameraFramesRef = useRef<ComputedCameraFrames>(DEFAULT_FRAMES);
  const hasAutoFramedOnceRef = useRef(false);
  const cameraLerpRef = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    active: boolean;
  }>({
    pos: new THREE.Vector3(...DEFAULT_FRAMES.reset.pos),
    target: new THREE.Vector3(...DEFAULT_FRAMES.reset.target),
    active: false,
  });

  const onMeshesDetectedRef = useRef(onMeshesDetected);
  onMeshesDetectedRef.current = onMeshesDetected;
  const onModelVaultSyncedRef = useRef(onModelVaultSynced);
  onModelVaultSyncedRef.current = onModelVaultSynced;
  const onAvatarInteractionRef = useRef(onAvatarInteraction);
  onAvatarInteractionRef.current = onAvatarInteraction;

  const spawnParticles = (
    x: number,
    y: number,
    symbols: string[],
    count: number,
    colors: string[]
  ) => {
    const batch: FloatingParticle[] = [];
    for (let i = 0; i < count; i++) {
      const id = particleIdRef.current++;
      batch.push({
        id,
        x: x + (Math.random() - 0.5) * 48,
        y: y + (Math.random() - 0.5) * 28,
        symbol: symbols[i % symbols.length],
        driftX: (Math.random() - 0.5) * 34,
        color: colors[i % colors.length],
      });
    }
    setParticles((prev) => [...prev.slice(-18), ...batch]);
    window.setTimeout(() => {
      const ids = new Set(batch.map((b) => b.id));
      setParticles((prev) => prev.filter((p) => !ids.has(p.id)));
    }, 1050);
  };

  useEffect(() => {
    moodRef.current = persona.mood;
  }, [persona.mood]);

  // Subscribe to Idol Music Sync playback state
  useEffect(() => {
    return musicSync.subscribe((st) => setMusicState(st));
  }, []);

  // Sync Atmospheric Stage Environment & Custom Backdrop per Persona
  useEffect(() => {
    envControllerRef.current?.applyPreset(persona.stageEnvironment || 'sunlit_boutique');
  }, [persona.stageEnvironment]);

  // Sync studio stool & bed furniture visibility & smooth camera framing when switching posture
  useEffect(() => {
    const showSeat = posture === 'seated' && !desktopRoamMode;
    const showBed = posture === 'sleeping' && !desktopRoamMode;
    envControllerRef.current?.setBedVisible(showBed);
    envControllerRef.current?.setSeatVisible(showSeat);
    cameraFramesRef.current = computeCameraFramesFromBox(modelBoxRef.current, posture);

    if (posture === 'sleeping') {
      if (controlsRef.current) {
        controlsRef.current.maxPolarAngle = Math.PI * 0.48; // keep view above mattress
        controlsRef.current.minPolarAngle = 0.05; // allow top-down inspection
      }
    } else {
      if (controlsRef.current) {
        controlsRef.current.maxPolarAngle = Math.PI * 0.58;
        controlsRef.current.minPolarAngle = 0.2;
      }
    }

    if (hasAutoFramedOnceRef.current && !desktopRoamMode) {
      const targetPreset = activePreset;
      const frame = cameraFramesRef.current[targetPreset] || cameraFramesRef.current.reset;
      cameraLerpRef.current = {
        pos: new THREE.Vector3(...frame.pos),
        target: new THREE.Vector3(...frame.target),
        active: true,
      };
    }
    if (posture === 'seated' || posture === 'sleeping') {
      roamControllerRef.current.resetToCenter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posture, desktopRoamMode]);

  // Automatically transition to sleeping bed if character falls asleep from human needs / nap prompt
  useEffect(() => {
    if (persona.brain?.isSleeping && posture !== 'sleeping' && !desktopRoamMode) {
      setPosture('sleeping');
    }
  }, [persona.brain?.isSleeping, posture, desktopRoamMode]);

  // Autonomous AI sleep movement: slowly shift sleeping positions every 45-60s while asleep
  useEffect(() => {
    if (posture !== 'sleeping' || !persona.brain?.isSleeping) return;
    const interval = window.setInterval(() => {
      const positions: SleepingPosition[] = [
        'side_curled_right',
        'back_relaxed',
        'hugging_pillow',
        'side_curled_left',
        'sprawled',
      ];
      setSleepingPosition((prev) => {
        const nextCandidates = positions.filter((p) => p !== prev);
        const next = nextCandidates[Math.floor(Math.random() * nextCandidates.length)];
        const labels: Record<SleepingPosition, string> = {
          back_relaxed: 'lying comfortably on her back',
          side_curled_right: 'rolling onto her side to face you',
          side_curled_left: 'turning towards the nightstand',
          hugging_pillow: 'hugging her pillow closer',
          sprawled: 'stretching into a relaxed deep sleep',
        };
        setLastZoneToast(`💤 ${persona.name} shifted in her sleep: ${labels[next]}`);
        window.setTimeout(() => setLastZoneToast(null), 3200);
        return next;
      });
    }, 45000);
    return () => window.clearInterval(interval);
  }, [posture, persona.brain?.isSleeping, persona.name]);

  useEffect(() => {
    void envControllerRef.current?.applyCustomEnvironment(persona.customEnvironment);
  }, [persona.customEnvironment]);

  // Apply 100% transparent desktop widget overlay + full-screen Shimeji camera framing
  useEffect(() => {
    envControllerRef.current?.setOverlayTransparent(desktopRoamMode);
    if (rendererRef.current) {
      rendererRef.current.setClearColor(0x000000, 0);
    }
    if (controlsRef.current) {
      controlsRef.current.enabled = !desktopRoamMode;
    }
    if (desktopRoamMode) {
      setOpenPanel('none');
      // Full-monitor widget camera so she stands ~48% screen height right above taskbar & roams full width
      cameraLerpRef.current = {
        pos: new THREE.Vector3(0, 1.35, 5.8),
        target: new THREE.Vector3(0, 1.35, 0),
        active: true,
      };
    } else {
      widgetDragRef.current = null;
      roamControllerRef.current.resetToCenter();
      const frame = cameraFramesRef.current.reset;
      cameraLerpRef.current = {
        pos: new THREE.Vector3(...frame.pos),
        target: new THREE.Vector3(...frame.target),
        active: true,
      };
    }
  }, [desktopRoamMode]);

  // Execute Gemini `move_on_stage` / user Roam behavior commands
  useEffect(() => {
    roamControllerRef.current.applyCommand(roamCommand);
  }, [roamCommand]);

  // Execute Gemini `trigger_emote` autonomous emote commands
  useEffect(() => {
    if (!emoteCommand || emoteCommand.id === lastEmoteCommandIdRef.current) return;
    lastEmoteCommandIdRef.current = emoteCommand.id;
    activeVrmaActionRef.current?.stop();
    activeVrmaActionRef.current = null;
    const meta = PROCEDURAL_EMOTES.find((e) => e.id === emoteCommand.emoteId);
    if (!meta) return;
    activeEmoteRef.current = {
      id: emoteCommand.emoteId,
      startTime: performance.now(),
      duration: meta.duration,
    };
    setActiveEmoteLabel(`${meta.emoji} ${meta.shortLabel}`);
  }, [emoteCommand]);

  // Execute organic human micro-tells (sigh, yawn, startled, eat_sip, cold_shiver, cozy_warm)
  useEffect(() => {
    if (!microTellCommand || microTellCommand.id === lastTellCmdIdRef.current) return;
    lastTellCmdIdRef.current = microTellCommand.id;
    if (microTellCommand.kind === 'none') return;

    const durations: Record<MicroTellKind, number> = {
      none: 0,
      sigh: 2.2,
      yawn: 2.5,
      startled: 1.5,
      eat_sip: 2.6,
      cold_shiver: 2.2,
      cozy_warm: 2.4,
    };

    activeTellRef.current = {
      kind: microTellCommand.kind,
      startTime: performance.now(),
      duration: durations[microTellCommand.kind] || 2.2,
    };

    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width * 0.48 : 340;
    const cy = rect ? rect.height * 0.34 : 240;
    if (microTellCommand.kind === 'eat_sip') {
      spawnParticles(cx, cy, ['✨', '♡', '☕'], 5, ['#fde68a', '#f9a8d4', '#fbbf24']);
    } else if (microTellCommand.kind === 'cozy_warm') {
      spawnParticles(cx, cy, ['💖', '✨', '🧣'], 5, ['#fb7185', '#fde68a', '#f472b6']);
    } else if (microTellCommand.kind === 'yawn') {
      spawnParticles(cx + 30, cy - 20, ['💤', '✦'], 3, ['#a5b4fc', '#c4b5fd']);
    }
  }, [microTellCommand]);

  // 1. Initialize Three.js WebGL Stage ONCE
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 45);
    camera.position.set(...DEFAULT_FRAMES.reset.pos);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...DEFAULT_FRAMES.reset.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 0.45;
    controls.maxDistance = 5.2;
    controls.maxPolarAngle = Math.PI * 0.58;
    controls.addEventListener('start', () => {
      cameraLerpRef.current.active = false;
    });
    controls.update();
    controlsRef.current = controls;

    // Atmospheric Stage Environment Controller
    const envCtrl = new StageEnvironmentController(scene);
    envCtrl.applyPreset(persona.stageEnvironment || 'sunlit_boutique');
    envControllerRef.current = envCtrl;

    // LookAt target for vrm.lookAt.target
    const lookAtTarget = new THREE.Object3D();
    lookAtTarget.position.set(0, 1.4, 2.0);
    scene.add(lookAtTarget);
    lookAtTargetRef.current = lookAtTarget;

    const avatarContainer = new THREE.Group();
    scene.add(avatarContainer);
    avatarContainerRef.current = avatarContainer;

    // Dedicated avatarRoot isolates normalized base orientation + per-outfit yawOffset
    // from roam positioning and procedural humanoid bone animations.
    const avatarRoot = new THREE.Group();
    avatarRoot.name = 'AvatarOrientationRoot';
    avatarRoot.rotation.y = activeYawOffsetRef.current;
    avatarContainer.add(avatarRoot);
    avatarRootRef.current = avatarRoot;

    const clock = new THREE.Clock();
    let frameId = 0;
    let smoothYaw = 0;
    let smoothPitch = 0;
    let smoothRoll = 0;
    const smoothVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      const elapsed = clock.elapsedTime;
      const nowMs = performance.now();

      if (cameraLerpRef.current.active) {
        const alpha = Math.min(1, dt * 6);
        camera.position.lerp(cameraLerpRef.current.pos, alpha);
        controls.target.lerp(cameraLerpRef.current.target, alpha);
        if (
          camera.position.distanceTo(cameraLerpRef.current.pos) < 0.008 &&
          controls.target.distanceTo(cameraLerpRef.current.target) < 0.008
        ) {
          cameraLerpRef.current.active = false;
        }
      }
      controls.update();

      const lipSync = voiceEngine.getLipSyncFrame();
      const music = musicSync.getFrame();

      // Throttle visualizer UI updates cleanly (~18fps)
      if (music.isPlaying && nowMs - lastBarsUiAtRef.current > 55) {
        lastBarsUiAtRef.current = nowMs;
        setMusicBars(music.bars);
      }

      // Update environment particles, rain streaks, and beat-reactive spotlights
      envCtrl.update(dt, elapsed, music);

      const mood = moodRef.current;
      const intensity = emotionIntensityRef.current;
      let activeReaction = activeReactionRef.current;
      if (activeReaction && (nowMs - activeReaction.startTime) / 1000 >= activeReaction.duration) {
        activeReactionRef.current = null;
        activeReaction = null;
      }

      if (currentVrmRef.current) {
        const vrm = currentVrmRef.current;
        const isPlayingVrma = Boolean(activeVrmaActionRef.current?.isRunning());

        // Compute live organic micro-tell progress
        let activeTellState: { kind: MicroTellKind; progress: number } | null = null;
        if (activeTellRef.current) {
          const ageSec = (nowMs - activeTellRef.current.startTime) / 1000;
          if (ageSec >= activeTellRef.current.duration) {
            activeTellRef.current = null;
          } else {
            activeTellState = {
              kind: activeTellRef.current.kind,
              progress: ageSec / activeTellRef.current.duration,
            };
          }
        }

        const brainNow = humanBrainRef.current;
        const humanCtx: HumanSensationContext = {
          sleepiness: brainNow?.sleepiness ?? 20,
          comfort: brainNow?.comfort ?? 80,
          isSleeping: Boolean(brainNow?.isSleeping),
          isUserTyping: isUserTypingRef.current,
          empathySoftening: Boolean(brainNow?.carryover?.empathySoftening),
          activeTell: activeTellState,
        };

        const bodyLang = emotionEngineRef.current.getBodyLanguage(
          mood,
          intensity,
          elapsed,
          humanCtx
        );

        if (isPlayingVrma && mixerRef.current) {
          mixerRef.current.update(dt);
        } else {
          // 1. Click-zone physical micro-reactions take crisp precedence when tapped
          if (activeReaction) {
            applyPoseAndMicroReactions({
              vrm,
              avatarContainer,
              elapsed,
              reaction: activeReaction,
              musicBass: music.bass,
              musicBeat: music.beatPulse,
              isMusicPlaying: music.isPlaying,
            });
          }

          const isSeatedStage = postureRef.current === 'seated' && !desktopRoamRef.current;
          const isSleepingStage = postureRef.current === 'sleeping' && !desktopRoamRef.current;
          let roamStatus = {
            normX: 0,
            normY: 0,
            normZ: 0,
            behavior: 'idle' as RoamBehavior,
            behaviorLabel: isSleepingStage ? 'Sleeping in Bed' : isSeatedStage ? 'Seated' : 'Standing',
            isMoving: false,
            isDragging: false,
          };

          if (isSleepingStage) {
            // Keep character smoothly resting on the sleeping bed with dynamic sleep position roll
            const posLerp = Math.min(1, dt * 7.5);
            const targetRoll =
              sleepingPosRef.current === 'side_curled_right'
                ? 1.15
                : sleepingPosRef.current === 'side_curled_left'
                ? -1.15
                : sleepingPosRef.current === 'hugging_pillow'
                ? 0.45
                : sleepingPosRef.current === 'sprawled'
                ? 0.12
                : 0;

            const targetX =
              sleepingPosRef.current === 'side_curled_right'
                ? 0.04
                : sleepingPosRef.current === 'side_curled_left'
                ? -0.04
                : 0;

            if (!activeReaction) {
              avatarContainer.position.x = THREE.MathUtils.lerp(avatarContainer.position.x, targetX, posLerp);
              avatarContainer.position.z = THREE.MathUtils.lerp(avatarContainer.position.z, 0.68, posLerp);
            }
            avatarContainer.position.y = THREE.MathUtils.lerp(avatarContainer.position.y, 0.44, posLerp);
            avatarContainer.rotation.x = THREE.MathUtils.lerp(
              avatarContainer.rotation.x,
              -Math.PI * 0.49,
              posLerp
            );
            avatarContainer.rotation.y = THREE.MathUtils.lerp(avatarContainer.rotation.y, 0, posLerp);
            avatarContainer.rotation.z = THREE.MathUtils.lerp(
              avatarContainer.rotation.z,
              targetRoll,
              posLerp
            );

            if (!activeReaction && !activeEmoteRef.current) {
              poseControllerRef.current.applySleepingPose({
                vrm,
                dt,
                elapsed,
                bodyLang,
                position: sleepingPosRef.current,
                snap: false,
              });
            }
          } else if (isSeatedStage) {
            // Keep character smoothly centered on the studio stool facing +Z
            const posLerp = Math.min(1, dt * 8.0);
            if (!activeReaction) {
              avatarContainer.position.x = THREE.MathUtils.lerp(avatarContainer.position.x, 0, posLerp);
              avatarContainer.position.z = THREE.MathUtils.lerp(avatarContainer.position.z, 0, posLerp);
            }
            avatarContainer.position.y = THREE.MathUtils.lerp(avatarContainer.position.y, 0, posLerp);
            avatarContainer.rotation.x = THREE.MathUtils.lerp(avatarContainer.rotation.x, 0, posLerp);
            avatarContainer.rotation.y = THREE.MathUtils.lerp(avatarContainer.rotation.y, 0, posLerp);
            avatarContainer.rotation.z = THREE.MathUtils.lerp(avatarContainer.rotation.z, 0, posLerp);

            if (!activeReaction && !activeEmoteRef.current) {
              poseControllerRef.current.applySeatedPose({
                vrm,
                dt,
                elapsed,
                bodyLang,
                musicBass: music.bass,
                musicBeat: music.beatPulse,
                isMusicPlaying: music.isPlaying,
                isSleeping: humanCtx.isSleeping,
              });
            }
          } else {
            // Standing / Desktop Roam mode: smoothly restore upright orientation & lift hips
            const rotLerp = Math.min(1, dt * 7.0);
            avatarContainer.rotation.x = THREE.MathUtils.lerp(avatarContainer.rotation.x, 0, rotLerp);
            avatarContainer.rotation.z = THREE.MathUtils.lerp(avatarContainer.rotation.z, 0, rotLerp);

            poseControllerRef.current.restoreStandingHips(vrm, dt);
            roamStatus = roamControllerRef.current.update({
              dt,
              elapsed,
              vrm,
              avatarContainer,
              camera,
              desktopRoamMode: desktopRoamRef.current,
              autoRoamEnabled: desktopRoamRef.current
                ? freeRoamRef.current
                : autoRoamRef.current,
              cursorNormX: mouseNdcRef.current.x,
              mood,
              bodyLang,
              musicBass: music.bass,
              musicBeat: music.beatPulse,
              isMusicPlaying: music.isPlaying,
              hasActiveReactionOrEmote: Boolean(activeReaction || activeEmoteRef.current),
              isSleeping: humanCtx.isSleeping,
              boredom: brainNow?.boredom ?? 25,
              sleepiness: brainNow?.sleepiness ?? 20,
              energy: brainNow?.energy ?? 80,
              curiosity: brainNow?.curiosity ?? 50,
            });
            if (!activeReaction && !activeEmoteRef.current) {
              poseControllerRef.current.applyStandingFingerRelax(vrm, dt);
            }
          }
          if (nowMs - lastRoamUiReportRef.current > 85) {
            lastRoamUiReportRef.current = nowMs;
            // Project real VRM head bone position into viewport percentage so speech bubble anchors beside her head
            const headPos = new THREE.Vector3(
              avatarContainer.position.x,
              avatarContainer.position.y + 1.42,
              avatarContainer.position.z
            );
            const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
            if (headNode) headNode.getWorldPosition(headPos);
            headPos.project(camera);
            const headScreenX = THREE.MathUtils.clamp(((headPos.x + 1) / 2) * 100, 5, 95);
            const headScreenY = THREE.MathUtils.clamp(((1 - headPos.y) / 2) * 100, 5, 88);

            onRoamStatusChangeRef.current?.({
              normX: roamStatus.normX,
              headScreenX,
              headScreenY,
              behavior: roamStatus.behavior,
              isDragging: roamStatus.isDragging,
            });
          }

          // 2. Smooth Cursor Eye & Head Tracking + Active Listening Posture + Emotion Head-Turn Bias
          const activeEmote = activeEmoteRef.current;
          const isSpeechHeadTurn =
            isSpeakingRef.current &&
            !humanCtx.empathySoftening &&
            (mood === 'Flustered' || mood === 'Annoyed' || mood === 'Pouty');
          const allowCursorTracking =
            eyeTrackingRef.current &&
            !humanCtx.isSleeping &&
            !activeReaction &&
            !activeEmote &&
            !isSpeechHeadTurn &&
            !roamStatus.isMoving;

          const mx =
            humanCtx.isUserTyping
              ? 0.28 // Focus gently toward the chat input / camera while listening
              : allowCursorTracking && mouseNdcRef.current.active
                ? mouseNdcRef.current.x
                : 0;
          const my =
            humanCtx.isUserTyping
              ? -0.04
              : allowCursorTracking && mouseNdcRef.current.active
                ? mouseNdcRef.current.y
                : 0;

          if (lookAtTargetRef.current) {
            const baseEyeY = isSeatedStage ? 1.0 : 1.4;
            const targetX = allowCursorTracking
              ? mx * 1.15 + bodyLang.headYawBias * 0.85
              : bodyLang.headYawBias * 2.2;
            const targetY =
              baseEyeY + (allowCursorTracking ? my * 0.72 : -bodyLang.headPitchBias * 1.2);
            lookAtTargetRef.current.position.lerp(
              new THREE.Vector3(targetX, targetY, 2.1),
              Math.min(1, dt * 8)
            );
            if (vrm.lookAt && vrm.lookAt.target !== lookAtTargetRef.current) {
              vrm.lookAt.target = lookAtTargetRef.current;
            }
          }

          let targetYaw = 0;
          let targetPitch = 0;
          let targetRoll = 0;

          if (activeReaction) {
            const age = (nowMs - activeReaction.startTime) / 1000;
            if (activeReaction.zone === 'headpat') {
              targetYaw = mx * 0.12;
              targetPitch = 0.14 + Math.sin(age * 7.5) * 0.08;
              targetRoll = Math.sin(age * 3.5) * 0.06;
            } else if (activeReaction.zone === 'poke') {
              targetYaw = -0.22;
              targetPitch = -0.06;
              targetRoll = -0.14 * Math.exp(-age * 1.4);
            } else if (activeReaction.zone === 'hair_tug') {
              targetYaw = Math.sin(age * 20) * 0.14 * Math.exp(-age * 2.2);
              targetPitch = -0.04;
              targetRoll = Math.sin(age * 18) * 0.1 * Math.exp(-age * 2.2);
            } else if (activeReaction.zone === 'outfit_tap') {
              targetYaw = -0.22;
              targetPitch = 0.04;
              targetRoll = -0.05;
            }
          } else if (allowCursorTracking) {
            const gazeWeight =
              mood === 'Flustered' || mood === 'Annoyed' || mood === 'Pouty' ? 0.45 : 1.0;
            targetYaw = THREE.MathUtils.clamp(
              mx * 0.35 * gazeWeight + bodyLang.headYawBias,
              -0.35,
              0.35
            );
            targetPitch = THREE.MathUtils.clamp(
              -my * 0.22 * gazeWeight + bodyLang.headPitchBias,
              -0.22,
              0.22
            );
            targetRoll = THREE.MathUtils.clamp(bodyLang.headRollBias, -0.18, 0.18);
          } else {
            targetYaw = THREE.MathUtils.clamp(
              bodyLang.headYawBias + Math.sin(elapsed * 0.65) * 0.045,
              -0.35,
              0.35
            );
            targetPitch = THREE.MathUtils.clamp(
              bodyLang.headPitchBias + Math.sin(elapsed * 0.9) * 0.02,
              -0.22,
              0.22
            );
            targetRoll = bodyLang.headRollBias;
          }

          // Subtle beat-synced head nod & groove during Karaoke Music Sync
          if (music.isPlaying && !activeReaction) {
            targetPitch += music.beatPulse * 0.14;
            targetRoll += Math.sin(elapsed * 2.4) * 0.07;
          }

          if (nowMs < hairBounceUntilRef.current && !activeReaction) {
            const remain = (hairBounceUntilRef.current - nowMs) / 420;
            targetRoll += Math.sin(elapsed * 26) * 0.055 * remain;
          }

          const headLerp = Math.min(1, dt * 7.5);
          smoothYaw = THREE.MathUtils.lerp(smoothYaw, targetYaw, headLerp);
          smoothPitch = THREE.MathUtils.lerp(smoothPitch, targetPitch, headLerp);
          smoothRoll = THREE.MathUtils.lerp(smoothRoll, targetRoll, headLerp);

          const neckBone = vrm.humanoid?.getNormalizedBoneNode('neck');
          const headBone = vrm.humanoid?.getNormalizedBoneNode('head');

          if (activeReaction?.zone === 'outfit_tap' && headBone) {
            if (neckBone) {
              neckBone.rotation.y = THREE.MathUtils.lerp(neckBone.rotation.y, 0, headLerp);
              neckBone.rotation.x = THREE.MathUtils.lerp(neckBone.rotation.x, 0, headLerp);
            }
            headBone.rotation.y = smoothYaw;
            headBone.rotation.x = smoothPitch;
            headBone.rotation.z = smoothRoll;
          } else {
            if (neckBone) {
              neckBone.rotation.y = smoothYaw * 0.4;
              neckBone.rotation.x = smoothPitch * 0.4;
              neckBone.rotation.z = smoothRoll * 0.35;
            }
            if (headBone) {
              headBone.rotation.y = smoothYaw * 0.6;
              headBone.rotation.x = smoothPitch * 0.6;
              headBone.rotation.z = smoothRoll * 0.65;
            }
          }

          // 3. Procedural Upper-Body Emote overlay (when triggered from Emote Wheel ✨ or AI Brain)
          if (activeEmote) {
            const stillRunning = applyProceduralEmote(
              vrm,
              activeEmote,
              lipSync.isSpeaking || music.isPlaying
            );
            if (!stillRunning) {
              activeEmoteRef.current = null;
              setActiveEmoteLabel(null);
            }
          }
        }

        // 4. Smooth Multi-Layer Expressions + Noise-Gated TTS / Karaoke Lip-Sync (cleanly closed at rest)
        const expr = vrm.expressionManager;
        if (expr) {
          const setExpr = (names: string[], value: number) => {
            for (const n of names) {
              try {
                expr.setValue(n, value);
              } catch {
                // ignore absent expression
              }
            }
          };

          const isMouthActive = lipSync.isSpeaking || music.isPlaying;
          const targetAa = lipSync.isSpeaking
            ? Math.min(0.75, lipSync.aa)
            : music.isPlaying
              ? Math.min(0.75, music.aa)
              : 0;
          const targetIh = lipSync.isSpeaking
            ? lipSync.ih
            : music.isPlaying
              ? music.ih
              : 0;
          const targetOu = lipSync.isSpeaking
            ? lipSync.ou
            : music.isPlaying
              ? music.ou
              : 0;
          const targetEe = lipSync.isSpeaking ? lipSync.ee : 0;
          const targetOh = lipSync.isSpeaking ? lipSync.oh : bodyLang.yawnOhWeight;

          // Smoothly lerp all 5 visemes (0.25 per frame), snapping cleanly to 0.0 when silent
          const lerpViseme = (cur: number, tgt: number) => {
            const next = THREE.MathUtils.lerp(cur, tgt, 0.25);
            return tgt === 0 && next < 0.004 ? 0 : next;
          };

          smoothVisemes.aa = lerpViseme(smoothVisemes.aa, targetAa);
          smoothVisemes.ih = lerpViseme(smoothVisemes.ih, targetIh);
          smoothVisemes.ou = lerpViseme(smoothVisemes.ou, targetOu);
          smoothVisemes.ee = lerpViseme(smoothVisemes.ee, targetEe);
          smoothVisemes.oh = lerpViseme(smoothVisemes.oh, targetOh);

          setExpr(['aa', 'a'], smoothVisemes.aa);
          setExpr(['ih', 'i'], smoothVisemes.ih);
          setExpr(['ou', 'u'], smoothVisemes.ou);
          setExpr(['ee', 'e'], smoothVisemes.ee);
          setExpr(['oh', 'o'], smoothVisemes.oh);

          emotionEngineRef.current.updateExpressions({
            vrm,
            dt,
            mood,
            intensity,
            activeReactionZone: activeReaction?.zone ?? null,
            isEmoteControllingFace: Boolean(activeEmoteRef.current),
            isMusicPlaying: music.isPlaying,
            isSpeaking: isMouthActive,
            human: humanCtx,
          });
        }

        vrm.update(dt);
      }

      renderer.render(scene, camera);
    };

    animate();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(100, entry.contentRect.width);
        const h = Math.max(100, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      envCtrl.clearCustomEnvironment();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Load real .VRM / .GLB avatar
  const slotModelKey = `${activeSlot.id}::${activeSlot.modelVaultId ?? 'default-vrm'}`;

  useEffect(() => {
    const avatarContainer = avatarContainerRef.current;
    const avatarRoot = avatarRootRef.current;
    if (!avatarContainer || !avatarRoot) return;

    let cancelled = false;

    const clearCurrentAvatar = () => {
      activeVrmaActionRef.current?.stop();
      activeVrmaActionRef.current = null;
      mixerRef.current = null;
      while (avatarRoot.children.length > 0) {
        avatarRoot.remove(avatarRoot.children[0]);
      }
      if (currentVrmRef.current) {
        VRMUtils.deepDispose(currentVrmRef.current.scene);
        currentVrmRef.current = null;
      }
    };

    const loadAvatar = async () => {
      setIsLoadingModel(true);
      setLoadError(null);
      setLoadLabel('Loading cel-shaded Anime .VRM avatar...');

      try {
        const record = await resolveAvatarBufferForSlot(
          activeSlot.modelVaultId,
          (msg) => !cancelled && setLoadLabel(msg)
        );
        if (cancelled) return;

        setActiveModelFileName(record.meta.fileName);
        onModelVaultSyncedRef.current?.();

        const blob = new Blob([record.buffer]);
        const blobUrl = URL.createObjectURL(blob);

        try {
          const loader = new GLTFLoader();
          loader.register((parser) => new VRMLoaderPlugin(parser));
          const gltf = await loader.loadAsync(blobUrl);
          if (cancelled) return;

          clearCurrentAvatar();

          const vrm = gltf.userData.vrm as VRM | undefined;
          let modelRoot: THREE.Object3D;

          if (vrm) {
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.combineSkeletons(gltf.scene);
            // Explicitly normalize VRM forward axis to +Z by spec version
            if (vrm.meta?.metaVersion === '0') {
              VRMUtils.rotateVRM0(vrm);
            } else {
              vrm.scene.rotation.set(0, 0, 0);
            }
            if (vrm.lookAt && lookAtTargetRef.current) {
              vrm.lookAt.target = lookAtTargetRef.current;
            }
            applyPoseAndMicroReactions({
              vrm,
              avatarContainer,
              elapsed: 0,
              reaction: null,
              musicBass: 0,
              musicBeat: 0,
              isMusicPlaying: false,
            });
            vrm.update(0.016);
            currentVrmRef.current = vrm;
            mixerRef.current = new THREE.AnimationMixer(vrm.scene);
            modelRoot = vrm.scene;
          } else {
            gltf.scene.rotation.set(0, 0, 0);
            modelRoot = gltf.scene;
          }

          modelRoot.traverse((obj) => {
            if (obj instanceof THREE.Mesh) obj.frustumCulled = false;
          });

          const rawBox = new THREE.Box3().setFromObject(modelRoot);
          const rawSize = new THREE.Vector3();
          rawBox.getSize(rawSize);
          let appliedScale = 1;
          if (rawSize.y > 0.01) {
            appliedScale = 1.62 / rawSize.y;
            modelRoot.scale.multiplyScalar(appliedScale);
          }
          modelScaleRef.current = appliedScale;
          modelRoot.updateMatrixWorld(true);

          const scaledBox = new THREE.Box3().setFromObject(modelRoot);
          const center = new THREE.Vector3();
          scaledBox.getCenter(center);
          modelRoot.position.x -= center.x;
          modelRoot.position.z -= center.z;
          modelRoot.position.y -= scaledBox.min.y;
          modelRoot.updateMatrixWorld(true);

          const finalBox = new THREE.Box3().setFromObject(modelRoot);
          modelBoxRef.current = finalBox;
          cameraFramesRef.current = computeCameraFramesFromBox(finalBox, postureRef.current);

          // Apply per-outfit calibrated yawOffset on the isolated avatarRoot group
          avatarRoot.rotation.set(0, activeYawOffsetRef.current, 0);
          avatarRoot.add(modelRoot);

          // Calibrate seated/sleeping hip drop & snap immediately into pose before first render
          if (vrm) {
            poseControllerRef.current.bindVrm(vrm, appliedScale, postureRef.current);
            if (postureRef.current === 'sleeping' && !desktopRoamRef.current) {
              avatarContainer.position.set(0, 0.44, 0.68);
              avatarContainer.rotation.set(-Math.PI * 0.49, 0, 0);
              const initBodyLang = emotionEngineRef.current.getBodyLanguage(
                moodRef.current,
                emotionIntensityRef.current,
                0
              );
              poseControllerRef.current.applySleepingPose({
                vrm,
                dt: 0.016,
                elapsed: 0,
                bodyLang: initBodyLang,
                position: sleepingPosRef.current,
                snap: true,
              });
              vrm.update(0.016);
            } else if (postureRef.current === 'seated' && !desktopRoamRef.current) {
              const initBodyLang = emotionEngineRef.current.getBodyLanguage(
                moodRef.current,
                emotionIntensityRef.current,
                0
              );
              poseControllerRef.current.applySeatedPose({
                vrm,
                dt: 0.016,
                elapsed: 0,
                bodyLang: initBodyLang,
                musicBass: 0,
                musicBeat: 0,
                isMusicPlaying: false,
                isSleeping: Boolean(humanBrainRef.current?.isSleeping),
                snap: true,
              });
              vrm.update(0.016);
            }
          }

          if (!hasAutoFramedOnceRef.current && cameraRef.current && controlsRef.current) {
            hasAutoFramedOnceRef.current = true;
            const frame = cameraFramesRef.current.reset;
            cameraRef.current.position.set(...frame.pos);
            controlsRef.current.target.set(...frame.target);
            controlsRef.current.update();
          }

          applyOutfitModsToScene({
            root: modelRoot,
            meshVisibility: activeSlot.meshVisibility,
            materialMods: activeSlot.materialMods,
            isImportedModel: true,
            textureCache: textureCacheRef.current,
          });

          onMeshesDetectedRef.current(
            detectClothingMeshes(modelRoot, activeSlot.materialMods)
          );

          if (
            !record.meta.thumbnailDataUrl &&
            rendererRef.current &&
            sceneRef.current &&
            cameraRef.current
          ) {
            requestAnimationFrame(() => {
              if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
              rendererRef.current.render(sceneRef.current, cameraRef.current);
              try {
                const thumb = rendererRef.current.domElement.toDataURL('image/webp', 0.78);
                void updateVaultModelThumbnail(record.meta.id, thumb).then(() => {
                  onModelVaultSyncedRef.current?.();
                });
              } catch {
                // ignore
              }
            });
          }
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
      } catch (err) {
        console.error('[StageViewport] Failed to load VRM/GLB avatar:', err);
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load 3D VRM/GLB avatar'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingModel(false);
          setLoadLabel('');
        }
      }
    };

    void loadAvatar();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotModelKey]);

  // 2b. Apply live per-outfit yawOffset calibration directly on avatarRoot (no reload, camera & chat preserved)
  useEffect(() => {
    const avatarRoot = avatarRootRef.current;
    if (!avatarRoot) return;
    const yaw =
      typeof activeSlot.yawOffset === 'number' && Number.isFinite(activeSlot.yawOffset)
        ? activeSlot.yawOffset
        : 0;
    avatarRoot.rotation.y = yaw;
  }, [activeSlot.yawOffset, activeSlot.id]);

  // 3. Apply live clothing mods
  useEffect(() => {
    const avatarRoot = avatarRootRef.current;
    if (!avatarRoot || avatarRoot.children.length === 0) return;

    applyOutfitModsToScene({
      root: avatarRoot,
      meshVisibility: activeSlot.meshVisibility,
      materialMods: activeSlot.materialMods,
      isImportedModel: true,
      textureCache: textureCacheRef.current,
    });

    onMeshesDetectedRef.current(
      detectClothingMeshes(avatarRoot, activeSlot.materialMods)
    );
  }, [activeSlot.meshVisibility, activeSlot.materialMods]);

  // 4. Emote & .VRMA Playback Handlers
  const triggerProceduralEmote = (emoteId: ProceduralEmoteId) => {
    activeVrmaActionRef.current?.stop();
    activeVrmaActionRef.current = null;
    const meta = PROCEDURAL_EMOTES.find((e) => e.id === emoteId);
    if (!meta) return;
    activeEmoteRef.current = {
      id: emoteId,
      startTime: performance.now(),
      duration: meta.duration,
    };
    setActiveEmoteLabel(`${meta.emoji} ${meta.shortLabel}`);
  };

  const playSavedVrma = async (vrmaId: string) => {
    const vrm = currentVrmRef.current;
    const mixer = mixerRef.current;
    if (!vrm || !mixer) return;
    const record = await getVrmaBuffer(vrmaId);
    if (!record) return;
    const clip = await loadVrmaClipFromBuffer(record.buffer, vrm);
    if (!clip) return;

    activeEmoteRef.current = null;
    activeVrmaActionRef.current?.stop();
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    activeVrmaActionRef.current = action;
    setActiveEmoteLabel(`✨ ${record.meta.name} (.vrma)`);
  };

  const stopActiveEmote = () => {
    activeEmoteRef.current = null;
    activeVrmaActionRef.current?.stop();
    activeVrmaActionRef.current = null;
    setActiveEmoteLabel(null);
  };

  // 5. Raycaster Hit-Zone Detection
  const raycastAtClientPoint = (
    clientX: number,
    clientY: number
  ): { zone: InteractionZone | null; localX: number; localY: number } => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    const avatar = avatarContainerRef.current;
    if (!container || !camera || !avatar || avatar.children.length === 0) {
      return { zone: null, localX: 0, localY: 0 };
    }

    const rect = container.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const ndcX = (localX / rect.width) * 2 - 1;
    const ndcY = -(localY / rect.height) * 2 + 1;

    mouseNdcRef.current = { x: ndcX, y: ndcY, active: true };

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(avatar.children, true);
    const firstVisible = hits.find((h) => h.object.visible);
    if (!firstVisible) return { zone: null, localX, localY };

    return {
      zone: classifyRaycasterHit(firstVisible, currentVrmRef.current, modelBoxRef.current),
      localX,
      localY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Handle Shimeji Click-and-Drag Relocation in Desktop Widget Mode
    if (desktopRoamRef.current && widgetDragRef.current) {
      const drag = widgetDragRef.current;
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (!drag.active && dist > 6) {
        drag.active = true;
        try {
          e.currentTarget.setPointerCapture(drag.pointerId);
        } catch {
          // ignore
        }
      }
      if (drag.active && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = 1 - (e.clientY - rect.top) / rect.height - 0.18;
        roamControllerRef.current.setWidgetDragState(true, normX, normY);
        onCharacterHoverChangeRef.current?.(true);
        return;
      }
    }

    const { zone, localX, localY } = raycastAtClientPoint(e.clientX, e.clientY);

    if (zone !== hoveredZoneRef.current) {
      hoveredZoneRef.current = zone;
      setHoveredZone(zone);
      onCharacterHoverChangeRef.current?.(Boolean(zone));
      if (zone === 'hair_tug') hairBounceUntilRef.current = performance.now() + 420;
    }

    if (zone === 'headpat') {
      const now = performance.now();
      if (now - lastHoverSparkleAtRef.current > 240) {
        lastHoverSparkleAtRef.current = now;
        spawnParticles(localX, localY - 12, ['✨', '♡'], 1, ['#f9a8d4', '#ddd6fe']);
      }
    }
  };

  const handlePointerLeave = () => {
    if (widgetDragRef.current?.active) return;
    mouseNdcRef.current = { x: 0, y: 0, active: false };
    hoveredZoneRef.current = null;
    setHoveredZone(null);
    onCharacterHoverChangeRef.current?.(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    if (desktopRoamRef.current) {
      const { zone } = raycastAtClientPoint(e.clientX, e.clientY);
      if (zone) {
        widgetDragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          active: false,
          pointerId: e.pointerId,
        };
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    // Complete Shimeji Click-and-Drag Drop
    if (widgetDragRef.current) {
      const wasDragging = widgetDragRef.current.active;
      const pid = widgetDragRef.current.pointerId;
      widgetDragRef.current = null;
      if (wasDragging) {
        pointerDownPosRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(pid);
        } catch {
          // ignore
        }
        roamControllerRef.current.setWidgetDragState(false);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          spawnParticles(
            e.clientX - rect.left,
            e.clientY - rect.top - 16,
            ['💦', '✨', '♡'],
            5,
            ['#38bdf8', '#f472b6', '#fde68a']
          );
        }
        onWidgetAvatarDroppedRef.current?.();
        return;
      }
    }

    if (!pointerDownPosRef.current) return;
    const dx = e.clientX - pointerDownPosRef.current.x;
    const dy = e.clientY - pointerDownPosRef.current.y;
    pointerDownPosRef.current = null;
    if (Math.hypot(dx, dy) > 6) return;

    const { zone, localX, localY } = raycastAtClientPoint(e.clientX, e.clientY);
    if (!zone) return;

    if (desktopRoamRef.current) {
      onWidgetAvatarClickRef.current?.();
    }

    // A gentle headpat (or tap) wakes her peacefully if she's dozing in bed
    if (humanBrainRef.current?.isSleeping || postureRef.current === 'sleeping') {
      spawnParticles(localX, localY - 14, ['🌅', '✨', '♡', '💤'], 5, ['#fde68a', '#f9a8d4', '#c4b5fd']);
      setLastZoneToast('🌅 Gently woke her from her nap');
      window.setTimeout(() => setLastZoneToast(null), 2000);
      if (postureRef.current === 'sleeping') {
        setPosture('seated');
      }
      onWakeFromSleepRef.current();
      return;
    }

    activeReactionRef.current = {
      zone,
      startTime: performance.now(),
      duration: zone === 'headpat' ? 2.1 : zone === 'outfit_tap' ? 2.0 : 1.7,
    };

    let nextMood: MoodType = 'Flustered';
    if (zone === 'headpat') {
      headpatFlipRef.current = !headpatFlipRef.current;
      nextMood = headpatFlipRef.current ? 'Shy' : 'Warm';
      spawnParticles(localX, localY - 16, ['💖', '✨', '♡', '✨'], 6, [
        '#fb7185',
        '#f472b6',
        '#c4b5fd',
        '#fde68a',
      ]);
      setLastZoneToast('🤚 Headpat · Shy / Warm (+2 💖)');
    } else if (zone === 'poke') {
      nextMood = 'Flustered';
      spawnParticles(localX, localY, ['💢', '✦', '💦'], 4, ['#fb7185', '#fbbf24', '#38bdf8']);
      setLastZoneToast('👉 Cheek Poke · Flustered (-1 ❄️)');
    } else if (zone === 'hair_tug') {
      nextMood = 'Flustered';
      hairBounceUntilRef.current = performance.now() + 650;
      spawnParticles(localX, localY, ['✨', '⚡', '✦'], 5, ['#c4b5fd', '#f472b6', '#38bdf8']);
      setLastZoneToast('✨ Hair Bounce · Flustered');
    } else {
      nextMood = 'Annoyed';
      spawnParticles(localX, localY, ['💢', '❗'], 3, ['#f43f5e', '#fbbf24']);
      setLastZoneToast('👗 Outfit Tap · Annoyed (-2 ❄️)');
    }

    window.setTimeout(() => setLastZoneToast(null), 1900);
    onAvatarInteractionRef.current(zone, nextMood);
  };

  const applyCameraPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    if (preset === 'reset') {
      roamControllerRef.current.resetToCenter();
    }
    const cfg = cameraFramesRef.current[preset];
    cameraLerpRef.current = {
      pos: new THREE.Vector3(...cfg.pos),
      target: new THREE.Vector3(...cfg.target),
      active: true,
    };
  };

  // Unified drag-and-drop: .vrm/.glb models, .vrma animations, .mp3/.wav music, .hdr/.png backdrops
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.vrm') || lower.endsWith('.glb')) {
      onImportModelFile(file);
    } else if (lower.endsWith('.vrma')) {
      const meta = await onImportVrmaFile(file);
      if (meta) void playSavedVrma(meta.id);
    } else if (/\.(mp3|wav|ogg|m4a)$/i.test(lower)) {
      await musicSync.loadAndPlayFile(file);
      setOpenPanel('music');
    } else if (/\.(hdr|png|jpg|jpeg|webp)$/i.test(lower)) {
      onUploadCustomEnvironment(file);
    }
  };

  const moodMeta = MOOD_META[persona.mood];
  const envMeta = STAGE_ENVIRONMENTS[persona.stageEnvironment || 'sunlit_boutique'];
  const hoverMeta = hoveredZone ? ZONE_HOVER_META[hoveredZone] : null;
  const liveVoiceTone = computePersonaLiveVoiceTone(persona, recentInteractionZone);

  return (
    <div
      className="relative h-full w-full overflow-hidden transition-colors duration-700"
      style={{ background: desktopRoamMode ? 'transparent' : envMeta.bgGradient }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingFile(false);
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* Interactive 3D WebGL Canvas */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{ cursor: hoverMeta ? hoverMeta.cursor : undefined }}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* Floating Heart / Sparkle Particles */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            style={{
              left: `${p.x}px`,
              top: `${p.y}px`,
              color: p.color,
              transform: `translate(${p.driftX}px, -42px)`,
            }}
            className="absolute text-lg font-bold drop-shadow-[0_2px_10px_rgba(244,63,94,0.65)] transition-all duration-1000 ease-out animate-bounce"
          >
            {p.symbol}
          </span>
        ))}
      </div>

      {/* Top-Left: Read-Only AI-Driven Live Mood Indicator + Inner Thought HUD (hidden in transparent Roam Mode) */}
      {!desktopRoamMode && (
        <div className="absolute left-5 top-5 z-20 flex flex-col gap-2">
          <div
            role="status"
            aria-live="polite"
            className={`flex w-fit cursor-default select-none items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium tracking-wide backdrop-blur-xl ${moodMeta.badgeClass}`}
            style={{ boxShadow: `0 0 24px ${moodMeta.glowHex}30` }}
            title={`AI-driven live mood (${persona.brain?.nuancedFeeling || moodMeta.label}) — shifts autonomously through conversation, human needs, and reactions`}
          >
            <span className={`h-2 w-2 rounded-full ${moodMeta.dotClass} animate-pulse`} />
            <span className="font-mono text-[11px] uppercase tracking-wider opacity-75">
              MOOD:
            </span>
            <span className="font-semibold">{moodMeta.label}</span>
            <span className="text-[11px] opacity-65">({moodMeta.jp})</span>
            <span className="ml-0.5 rounded-full bg-black/25 px-1.5 py-0.5 font-mono text-[10px] opacity-90">
              {Math.round((persona.emotionIntensity ?? 0.7) * 100)}%
            </span>
          </div>

            {/* Compact Live Human Needs Gauges Strip (click to inspect 🧠 AI Brain) */}
            {persona.brain && (
              <button
                type="button"
                onClick={() => setOpenPanel((p) => (p === 'brain' ? 'none' : 'brain'))}
                className="flex w-fit items-center gap-2 rounded-full border border-white/10 bg-[#0b0b15]/82 px-3 py-1 text-[10.5px] font-mono text-zinc-200 shadow-glass backdrop-blur-xl transition hover:border-violet-400/45"
                title={`Nuanced Feeling: ${persona.brain.nuancedFeeling} — click to open AI Brain & Human Needs`}
              >
                <span
                  className={persona.brain.hunger > 70 ? 'font-bold text-amber-300' : 'text-zinc-300'}
                >
                  🍱 {Math.round(persona.brain.hunger)}%
                </span>
                <span className="text-white/15">·</span>
                <span
                  className={
                    persona.brain.isSleeping
                      ? 'font-bold text-indigo-300'
                      : persona.brain.sleepiness > 70
                        ? 'font-bold text-purple-300'
                        : 'text-zinc-300'
                  }
                >
                  😴 {Math.round(persona.brain.sleepiness)}%
                </span>
                <span className="text-white/15">·</span>
                <span
                  className={persona.brain.boredom > 65 ? 'font-bold text-rose-300' : 'text-zinc-300'}
                >
                  🥱 {Math.round(persona.brain.boredom)}%
                </span>
                <span className="text-white/15">·</span>
                <span
                  className={persona.brain.comfort < 35 ? 'font-bold text-cyan-300' : 'text-zinc-300'}
                >
                  🧣 {Math.round(persona.brain.comfort)}%
                </span>
              </button>
            )}

            {persona.brain?.isSleeping && (
              <div className="flex w-fit items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-950/80 px-3 py-1 text-[11px] font-medium text-indigo-100 backdrop-blur-md">
                <span>💤 Dozing peacefully — pat her head or message to wake</span>
              </div>
            )}

            {isUserTyping && !persona.brain?.isSleeping && (
              <div className="flex w-fit items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-950/70 px-3 py-1 text-[10.5px] font-medium text-cyan-100 backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                <span>Listening attentively...</span>
              </div>
            )}

            {(lastZoneToast || hoverMeta) && (
              <div className="flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-[#0e0e1b]/85 px-3 py-1 text-[11px] font-medium text-zinc-100 backdrop-blur-xl">
                <span>{lastZoneToast || `${hoverMeta!.emoji} Click to ${hoverMeta!.label}`}</span>
              </div>
            )}

            {activeEmoteLabel && (
              <div className="flex w-fit items-center gap-2 rounded-full border border-amber-400/35 bg-amber-950/75 px-3 py-1 text-[11px] font-medium text-amber-100 backdrop-blur-md">
                <span>Emote: {activeEmoteLabel}</span>
                <button
                  type="button"
                  onClick={stopActiveEmote}
                  className="rounded-full p-0.5 hover:bg-white/15"
                  title="Stop emote"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Live Voice Tone Indicator Pill + Quick Speak (🔊) Button */}
            <div className="flex w-fit items-center gap-1.5">
              <button
                type="button"
                onClick={isSpeaking ? onStopSpeaking : onSpeakLatest}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold shadow-glass backdrop-blur-xl transition hover:brightness-115 ${isSpeaking
                  ? 'border-violet-400/60 bg-violet-600/35 text-violet-100'
                  : 'border-white/15 bg-[#0b0b15]/85 text-zinc-200 hover:border-violet-400/45'
                  }`}
                title={
                  isSpeaking
                    ? 'Stop speaking'
                    : `Speak latest reply (${liveVoiceTone.toneLabel} · ${liveVoiceTone.summaryDetail})`
                }
              >
                {isSpeaking ? (
                  <Square className="h-3 w-3 fill-current text-rose-300" />
                ) : (
                  <Volume2 className="h-3 w-3 text-violet-300" />
                )}
                <span>{isSpeaking ? 'Speaking' : 'Speak'}</span>
              </button>

              <div
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium shadow-glass backdrop-blur-xl ${liveVoiceTone.badgeClass}`}
                title={`${liveVoiceTone.summaryDetail} — ${liveVoiceTone.stylePrompt}`}
              >
                <span>🎙️</span>
                <span className="font-mono text-[10px] opacity-75">Tone:</span>
                <span className="font-semibold">{liveVoiceTone.toneLabel}</span>
                <span className="hidden xl:inline font-mono text-[9.5px] opacity-75">
                  ({liveVoiceTone.summaryDetail})
                </span>
              </div>
            </div>

            {musicState.isPlaying && (
              <div className="flex w-fit items-center gap-2 rounded-full border border-pink-400/40 bg-pink-950/75 px-3 py-1 text-[11px] font-medium text-pink-100 backdrop-blur-md">
                <Music className="h-3.5 w-3.5 animate-bounce text-pink-300" />
                <span className="max-w-[160px] truncate">Karaoke Sync: {musicState.fileName}</span>
              </div>
            )}
          </div>
      )}

          {/* Top-Right: Stage Controls (hidden in transparent Roam Mode) */}
          {!desktopRoamMode && (
            <div className="absolute right-4 top-5 z-20 flex max-w-[66%] flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={onToggleAutoRoam}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold shadow-glass backdrop-blur-xl transition ${autoRoamEnabled
                  ? 'border-emerald-400/50 bg-emerald-950/70 text-emerald-100'
                  : 'border-white/15 bg-[#10101e]/85 text-zinc-400 hover:text-zinc-200'
                  }`}
                title={`Auto-Roam & Procedural Idle (${ROAM_BEHAVIOR_LABELS[roamBehavior] || roamBehavior})`}
              >
                <Footprints className={`h-3.5 w-3.5 ${autoRoamEnabled ? 'text-emerald-300' : ''}`} />
                <span>Auto-Roam</span>
              </button>

              <button
                type="button"
                onClick={() => setOpenPanel((p) => (p === 'brain' ? 'none' : 'brain'))}
                className={`relative flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold shadow-glass backdrop-blur-xl transition ${openPanel === 'brain'
                  ? 'border-violet-400/70 bg-violet-600/30 text-violet-100'
                  : 'border-white/15 bg-[#10101e]/85 text-zinc-200 hover:border-violet-400/50'
                  }`}
                title="AI Brain Inspector — Energy, Boredom, Curiosity & Inner Thoughts"
              >
                <Brain className="h-3.5 w-3.5 text-violet-300" />
                <span>AI Brain</span>
                {persona.brain && persona.brain.boredom > 70 && (
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setOpenPanel((p) => (p === 'emotes' ? 'none' : 'emotes'))}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold shadow-glass backdrop-blur-xl transition ${openPanel === 'emotes'
                  ? 'border-amber-400/60 bg-amber-500/25 text-amber-100'
                  : 'border-white/15 bg-[#10101e]/85 text-zinc-200 hover:border-amber-400/45'
                  }`}
                title="Skeletal Emotes & .VRMA Animation Player"
              >
                <span>✨</span>
                <span>Emotes</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setOpenPanel((p) => (p === 'environments' ? 'none' : 'environments'))
                }
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold shadow-glass backdrop-blur-xl transition ${openPanel === 'environments'
                  ? 'border-indigo-400/60 bg-indigo-500/25 text-indigo-100'
                  : 'border-white/15 bg-[#10101e]/85 text-zinc-200 hover:border-indigo-400/45'
                  }`}
                title="Atmospheric 3D Stage Environments & Lighting Presets"
              >
                <span>🌌</span>
                <span>Stage</span>
              </button>

              <button
                type="button"
                onClick={() => setOpenPanel((p) => (p === 'music' ? 'none' : 'music'))}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold shadow-glass backdrop-blur-xl transition ${openPanel === 'music' || musicState.isPlaying
                  ? 'border-pink-400/60 bg-pink-500/25 text-pink-100'
                  : 'border-white/15 bg-[#10101e]/85 text-zinc-200 hover:border-pink-400/45'
                  }`}
                title="Idol Stage Audio / Karaoke Music Sync Mode"
              >
                <span>🎵</span>
                <span>Audio</span>
              </button>

              <button
                type="button"
                onClick={() => setEyeTrackingEnabled((v) => !v)}
                className={`flex items-center gap-1 rounded-full border px-2 py-1.5 text-[11px] font-medium shadow-glass backdrop-blur-xl transition ${eyeTrackingEnabled
                  ? 'border-cyan-400/45 bg-cyan-950/65 text-cyan-100'
                  : 'border-white/15 bg-[#10101e]/80 text-zinc-400 hover:text-zinc-200'
                  }`}
                title="Toggle Cursor Eye-Tracking"
              >
                {eyeTrackingEnabled ? (
                  <Eye className="h-3.5 w-3.5 text-cyan-300" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                <span className="hidden 2xl:inline">Eye-Track</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".vrm,.glb"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportModelFile(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-full border border-violet-400/40 bg-[#10101e]/85 px-2.5 py-1.5 text-[11px] font-semibold text-violet-100 shadow-glass backdrop-blur-xl transition hover:border-violet-300 hover:bg-violet-600/30"
                title="Import Anime .VRM / .GLB"
              >
                <Upload className="h-3.5 w-3.5 text-violet-300" />
                <span>.VRM</span>
              </button>
            </div>
          )}

          {/* Stage Popover 0: AI Brain Inspector (🧠) */}
          {openPanel === 'brain' && (
            <AiBrainPopover
              persona={persona}
              roamBehavior={roamBehavior}
              autoRoamEnabled={autoRoamEnabled}
              showThoughtHud={showThoughtHud}
              isGenerating={isGenerating}
              onToggleAutoRoam={onToggleAutoRoam}
              onToggleThoughtHud={() => setShowThoughtHud((v) => !v)}
              onTriggerBrainImpulse={onTriggerBrainImpulse}
              onOpenMemoryJournal={onOpenMemoryJournal}
              onClose={() => setOpenPanel('none')}
            />
          )}

          {/* Stage Popover 1: Emotes & .VRMA Player (✨) */}
          {openPanel === 'emotes' && (
            <div className="absolute right-5 top-16 z-30 w-80 rounded-3xl border border-white/[0.12] bg-[#0b0b15]/95 p-4 shadow-glass backdrop-blur-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white">✨ Emotes &amp; .VRMA Player</div>
                <button
                  type="button"
                  onClick={() => setOpenPanel('none')}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {PROCEDURAL_EMOTES.map((em) => (
                  <button
                    key={em.id}
                    type="button"
                    onClick={() => triggerProceduralEmote(em.id)}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-zinc-100 transition hover:border-amber-400/50 hover:bg-amber-500/15"
                  >
                    <span className="flex items-center gap-2">
                      <span>{em.emoji}</span>
                      <span className="font-medium">{em.label}</span>
                    </span>
                    <Play className="h-3 w-3 text-amber-300" />
                  </button>
                ))}
              </div>

              <div className="border-t border-white/[0.08] pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Custom .VRMA Animations ({vaultVrmas.length})
                  </span>
                  {activeEmoteLabel && (
                    <button
                      type="button"
                      onClick={stopActiveEmote}
                      className="text-[10px] text-rose-300 hover:underline"
                    >
                      Stop
                    </button>
                  )}
                </div>

                {vaultVrmas.map((vrma) => (
                  <div
                    key={vrma.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-[#121220] px-2.5 py-1.5 text-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => void playSavedVrma(vrma.id)}
                      className="flex flex-1 items-center gap-1.5 truncate text-left text-zinc-200 hover:text-amber-200"
                    >
                      <Play className="h-3 w-3 shrink-0 text-amber-300" />
                      <span className="truncate">{vrma.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteVrma(vrma.id)}
                      className="p-1 text-zinc-500 hover:text-rose-300"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <input
                  ref={vrmaInputRef}
                  type="file"
                  accept=".vrma"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const meta = await onImportVrmaFile(file);
                      if (meta) void playSavedVrma(meta.id);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => vrmaInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-400/40 bg-amber-950/20 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-950/35"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import .VRMA Dance / Pose
                </button>
              </div>
            </div>
          )}

          {/* Stage Popover 2: Atmospheric 3D Stage Environments (🌌) */}
          {openPanel === 'environments' && (
            <div className="absolute right-5 top-16 z-30 w-80 rounded-3xl border border-white/[0.12] bg-[#0b0b15]/95 p-4 shadow-glass backdrop-blur-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white">🌌 Stage Environments &amp; Lighting</div>
                <button
                  type="button"
                  onClick={() => setOpenPanel('none')}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                {(Object.keys(STAGE_ENVIRONMENTS) as StageEnvironmentId[]).map((id) => {
                  const item = STAGE_ENVIRONMENTS[id];
                  const active = persona.stageEnvironment === id && !persona.customEnvironment;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        onClearCustomEnvironment();
                        onSelectEnvironment(id);
                      }}
                      className={`w-full rounded-2xl border p-2.5 text-left transition ${active
                        ? 'border-indigo-400/60 bg-indigo-500/20'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                        }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        <span>{item.emoji}</span>
                        <span>{item.name}</span>
                      </div>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-400">
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-white/[0.08] pt-3 space-y-2">
                {persona.customEnvironment && (
                  <div className="flex items-center justify-between rounded-xl border border-cyan-400/35 bg-cyan-950/30 px-2.5 py-1.5 text-[11px] text-cyan-100">
                    <span className="truncate">Custom: {persona.customEnvironment.fileName}</span>
                    <button
                      type="button"
                      onClick={onClearCustomEnvironment}
                      className="text-[10px] text-rose-300 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <input
                  ref={envInputRef}
                  type="file"
                  accept=".hdr,.png,.jpg,.jpeg,.webp,.glb"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUploadCustomEnvironment(file);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => envInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-400/40 bg-indigo-950/20 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-950/35"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload .HDR / .PNG Backdrop or .GLB Room
                </button>
              </div>
            </div>
          )}

          {/* Stage Popover 3: Idol Stage Audio / Karaoke Music Sync Mode (🎵) */}
          {openPanel === 'music' && (
            <div className="absolute right-5 top-16 z-30 w-80 rounded-3xl border border-white/[0.12] bg-[#0b0b15]/95 p-4 shadow-glass backdrop-blur-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white">🎵 Idol Stage Audio &amp; Karaoke Sync</div>
                <button
                  type="button"
                  onClick={() => setOpenPanel('none')}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400">
                Drop an <code className="text-pink-300">.mp3</code> / <code className="text-pink-300">.wav</code> track to drive rhythmic swaying, beat-synced head nods, vocal-band lip-sync &amp; bass spotlights.
              </p>

              {/* 12-Bar Audio Visualizer */}
              <div className="flex h-12 items-end justify-between gap-1 rounded-2xl border border-white/10 bg-[#080810] px-3 py-2">
                {musicBars.map((val, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-violet-500 via-pink-500 to-cyan-300 transition-all duration-75"
                    style={{ height: `${Math.max(10, Math.round(val * 100))}%` }}
                  />
                ))}
              </div>

              {musicState.fileName && (
                <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-pink-200">
                      {musicState.fileName}
                    </span>
                    <button
                      type="button"
                      onClick={() => musicSync.clearTrack()}
                      className="text-zinc-500 hover:text-rose-300"
                      title="Remove track"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void musicSync.togglePlay()}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-600 text-white hover:bg-pink-500"
                    >
                      {musicState.isPlaying ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => musicSync.stop()}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:text-white"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={musicState.volume}
                      onChange={(e) => musicSync.setVolume(Number(e.target.value))}
                      aria-label="Music Volume"
                      className="flex-1"
                    />
                  </div>
                </div>
              )}

              <input
                ref={musicInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,.m4a,audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void musicSync.loadAndPlayFile(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => musicInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 py-2 text-xs font-semibold text-white shadow-glow hover:brightness-110"
              >
                <Music className="h-3.5 w-3.5" />
                Load .MP3 / .WAV Music Track
              </button>
            </div>
          )}

          {/* Bottom-Left: Persona, Outfit & Active Stage Environment (hidden in transparent Roam Mode) */}
          {!desktopRoamMode && (
            <div className="absolute bottom-5 left-5 z-20 flex flex-col gap-2">
              <div className="rounded-2xl border border-white/10 bg-[#0b0b14]/82 px-4 py-3 shadow-glass backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: persona.accentColor }}
                  />
                  <span className="font-display text-sm font-semibold tracking-tight text-white">
                    {persona.name}
                  </span>
                  <span className="text-xs text-zinc-400">{persona.japaneseName}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                  <Sparkles className="h-3 w-3 text-violet-400" />
                  <span className="truncate max-w-[200px]">{activeSlot.name}</span>
                  <button
                    type="button"
                    onClick={onOpenWardrobe}
                    className="ml-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-violet-300 transition hover:bg-violet-500/20"
                  >
                    👗 Wardrobe
                  </button>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-zinc-500 max-w-[310px]">
                  {envMeta.emoji} {envMeta.shortName} · {activeModelFileName}
                </div>
              </div>
            </div>
          )}

          {/* Bottom-Right: Interactive Care & Activities Bar (☕) + Camera Presets Bar */}
          {!desktopRoamMode && (
            <CareActivityBar
              isSleeping={Boolean(persona.brain?.isSleeping)}
              isGenerating={isGenerating}
              onTriggerCare={(activity) => {
                if (activity === 'entertain_music') {
                  setOpenPanel('music');
                }
                onCareActivity(activity);
              }}
            />
          )}

          {/* Bottom-Right: Posture Toggle (Sit / Stand / Bed) + Sleep Pose Sub-Selector + Camera Presets Bar */}
          {!desktopRoamMode && (
            <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2">
              {posture === 'sleeping' && (
                <div
                  className="flex items-center gap-0.5 rounded-2xl border border-indigo-400/30 bg-[#0c0c1a]/90 p-1 shadow-glass backdrop-blur-xl animate-fade-in"
                  title="Switch sleeping position"
                >
                  <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                    Sleep:
                  </span>
                  {(
                    [
                      ['side_curled_right', '🌙 Curled'],
                      ['back_relaxed', '🛌 On Back'],
                      ['hugging_pillow', '🧸 Hug Pillow'],
                      ['sprawled', '✨ Sprawl'],
                      ['side_curled_left', '💤 Away'],
                    ] as [SleepingPosition, string][]
                  ).map(([posKey, label]) => (
                    <button
                      key={posKey}
                      type="button"
                      onClick={() => setSleepingPosition(posKey)}
                      className={`rounded-xl px-2 py-1 text-[10.5px] font-semibold transition ${
                        sleepingPosition === posKey
                          ? 'bg-indigo-500/30 text-indigo-100 ring-1 ring-indigo-400/50 shadow-sm'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div
                className="flex items-center gap-0.5 rounded-2xl border border-white/10 bg-[#0b0b14]/82 p-1.5 shadow-glass backdrop-blur-xl"
                title="Switch avatar posture between Seated (studio stool), Standing, and Sleeping Bed"
              >
                <button
                  type="button"
                  onClick={() => setPosture('seated')}
                  className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold transition ${
                    posture === 'seated'
                      ? 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/45'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                  }`}
                >
                  🪑 Sit
                </button>
                <button
                  type="button"
                  onClick={() => setPosture('standing')}
                  className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold transition ${
                    posture === 'standing'
                      ? 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/45'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                  }`}
                >
                  🧍 Stand
                </button>
                <button
                  type="button"
                  onClick={() => setPosture('sleeping')}
                  className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold transition ${
                    posture === 'sleeping'
                      ? 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-400/45'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                  }`}
                >
                  🛏️ Bed
                </button>
              </div>

              <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#0b0b14]/82 p-1.5 shadow-glass backdrop-blur-xl">
                <Camera className="mx-1.5 h-3.5 w-3.5 text-zinc-400" />
                {(
                  [
                    ['portrait', 'Close-Up'],
                    ['bust', 'Upper Body'],
                    ['full', 'Full Body'],
                  ] as [CameraPreset, string][]
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyCameraPreset(preset)}
                    className={`rounded-xl px-2.5 py-1 text-[11px] font-medium transition ${activePreset === preset
                      ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/40'
                      : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                      }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => applyCameraPreset('reset')}
                  title="Reset camera angle"
                  className="flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/5 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoadingModel && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#07070c]/65 backdrop-blur-sm">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
              <p className="mt-3 font-display text-xs font-semibold text-zinc-100">{loadLabel}</p>
            </div>
          )}

          {loadError && !isLoadingModel && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#07070c]/75 p-6 text-center backdrop-blur-sm">
              <Upload className="h-9 w-9 text-rose-300" />
              <p className="mt-3 font-display text-sm font-semibold text-white">
                Could not fetch default Anime .VRM
              </p>
              <p className="mt-1 max-w-md text-xs text-zinc-400">{loadError}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500"
              >
                Import Local .VRM / .GLB File
              </button>
            </div>
          )}

          {/* Prominent Multi-Format Drag & Drop Overlay */}
          {isDraggingFile && (
            <div className="pointer-events-none absolute inset-4 z-40 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-violet-400/90 bg-violet-950/65 shadow-glow backdrop-blur-md">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-300/40 bg-violet-500/25">
                <Upload className="h-8 w-8 text-violet-200" />
              </div>
              <p className="mt-4 font-display text-lg font-bold text-white">
                Drop .VRM / .GLB · .VRMA · .MP3/.WAV · .HDR/.PNG
              </p>
              <p className="mt-1 text-xs text-violet-200/85">
                Auto-detects avatars, dance animations, karaoke tracks &amp; stage backdrops
              </p>
            </div>
          )}
        </div>
      );
};
