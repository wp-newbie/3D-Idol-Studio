export type MoodType =
  | 'Deadpan'
  | 'Flustered'
  | 'Annoyed'
  | 'Shy'
  | 'Amused'
  | 'Warm'
  | 'Pouty'
  | 'Proud';

export type VoiceLanguage = 'ja' | 'en';
export type VoiceGender = 'female' | 'male';

export type VocalArchetype =
  | 'sharp_tsundere'
  | 'gothic_diva'
  | 'deadpan_sleepy'
  | 'cool_guarded_tsundere';

export type GeminiVoiceName = 'Aoede' | 'Leda' | 'Fenrir' | 'Charon';

export type ClothingCategory =
  | 'Tops'
  | 'Bottoms'
  | 'Footwear'
  | 'Accessories'
  | 'Hair';

export type ProceduralAccessoryId =
  | 'cat_ears'
  | 'halo'
  | 'ribbon_bow'
  | 'cyber_visor'
  | 'choker'
  | 'fairy_wings'
  | 'idol_crown'
  | 'spa_towel';

export type HairStyleId =
  | 'default'
  | 'high_ponytail'
  | 'twin_tails'
  | 'twin_buns'
  | 'side_braid'
  | 'long_wavy'
  | 'drill_twintails'
  | 'bob_cut'
  | 'ahoge_clips';

export type GarmentStyleId =
  | 'default'
  | 'cozy_hoodie_pants'
  | 'summer_sundress'
  | 'streetwear_jacket_shorts'
  | 'sporty_tee_leggings'
  | 'kimono_yukata'
  | 'evening_gown'
  | 'cozy_pajamas'
  | 'school_blazer'
  | 'trench_coat_pants'
  | 'bath_wrap'
  | 'beach_swimsuit';

export type FoodVisualId =
  | 'ramen'
  | 'cake'
  | 'sushi'
  | 'pancakes'
  | 'curry'
  | 'bento'
  | 'pasta'
  | 'tea_sweets'
  | 'ice_cream'
  | 'burger';

export type HobbyKindId =
  | 'painting'
  | 'music_keyboard'
  | 'reading'
  | 'gaming'
  | 'baking'
  | 'photography'
  | 'yoga'
  | 'journaling'
  | 'studying'
  | 'showering'
  | 'towel_dry'
  | 'brushing_teeth';

export type DestinationKindId =
  | 'none'
  | 'home_kitchen'
  | 'shopping_mall'
  | 'tropical_beach'
  | 'vacation_cafe'
  | 'mountain_onsen'
  | 'amusement_park'
  | 'highschool_classroom'
  | 'college_campus'
  | 'bathroom_spa';

export interface ActiveDiningScene {
  dishName: string;
  drinkName: string;
  foodVisual: FoodVisualId;
  accentHex: string;
  moodReason: string;
  withKitchenCounter: boolean;
}

export interface ActiveHobbyScene {
  hobbyName: string;
  hobbyKind: HobbyKindId;
  accentHex: string;
  description: string;
  recommendedPosture: 'seated' | 'standing';
}

export interface ActiveDestinationScene {
  placeName: string;
  destinationKind: DestinationKindId;
  accentHex: string;
  description: string;
  skyTopHex: string;
  skyBottomHex: string;
  groundHex: string;
}

export type AiChairStyleId =
  | 'wooden_dining'
  | 'gaming_chair'
  | 'velvet_armchair'
  | 'cafe_bistro'
  | 'school_chair'
  | 'princess_throne';

export interface ActiveAiChair {
  chairStyle: AiChairStyleId;
  chairName: string;
  frameHex: string;
  cushionHex: string;
  accentHex: string;
  reason: string;
}

export interface ActiveLifeScene {
  dining: ActiveDiningScene | null;
  hobby: ActiveHobbyScene | null;
  destination: ActiveDestinationScene | null;
  chair?: ActiveAiChair | null;
}

export type FabricPatternId =
  | 'none'
  | 'plaid'
  | 'gothic_lace'
  | 'cyber_grid'
  | 'sakura_petals'
  | 'starry_night'
  | 'pastel_stripes'
  | 'polka_dots'
  | 'argyle';

export type CameraPreset = 'portrait' | 'bust' | 'full' | 'reset';

export type AvatarPosture = 'seated' | 'standing' | 'sleeping';

export type SleepingPosition =
  | 'back_relaxed'
  | 'side_curled_right'
  | 'side_curled_left'
  | 'hugging_pillow'
  | 'sprawled';

export type InteractionZone = 'headpat' | 'poke' | 'hair_tug' | 'outfit_tap';

export type ProceduralEmoteId =
  | 'crossed_arms'
  | 'friendly_wave'
  | 'shy_fidget'
  | 'idol_peace'
  | 'gentle_bow'
  | 'thinking_chin'
  | 'cat_paws'
  | 'arms_behind_back'
  | 'lean_forward'
  | 'pout_turn'
  | 'hands_on_hips';

export type StageEnvironmentId =
  | 'gothic_cathedral'
  | 'sunlit_boutique'
  | 'cyberpunk_stage'
  | 'lofi_rainy_room'
  | 'midnight_rooftop';

export type RoamBehavior =
  | 'idle'
  | 'walk'
  | 'peek'
  | 'crossed_arms_wait'
  | 'stretch_look'
  | 'sit_taskbar'
  | 'approach_user';

export interface RoamCommand {
  id: number;
  targetX: number; // -1.0 .. 1.0
  targetY: number; // -0.5 .. 0.5
  targetZ?: number; // -0.4 .. 0.45
  startFromX?: number; // optional starting coordinate when crossing monitor displays
  behavior: RoamBehavior;
}

export type AutonomousToolLocation =
  | 'gothic_studio'
  | 'sunlit_boutique'
  | 'cyber_stage'
  | 'rainy_lofi_room'
  | 'midnight_rooftop';

export interface DisplayInfo {
  id: number;
  index: number;
  label: string;
  isPrimary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

export interface AutonomousToolCallEvent {
  name:
    | 'move_on_stage'
    | 'travel_to_location'
    | 'switch_own_outfit'
    | 'trigger_emote'
    | 'adjust_sleeping_position'
    | 'change_posture'
    | 'move_to_display'
    | 'take_self_care'
    | 'list_running_apps'
    | 'launch_app'
    | 'close_app'
    | 'focus_app'
    | 'generate_stage';
  args: Record<string, unknown>;
  summary: string;
}

export type CircadianPhase = 'morning' | 'afternoon' | 'evening' | 'late_night';

export type AutonomousNeedTrigger =
  | 'hunger'
  | 'sleepiness'
  | 'boredom'
  | 'comfort'
  | 'curiosity';

export type CareActivityId =
  | 'snack_tea'
  | 'snack_cake'
  | 'snack_ramen'
  | 'snack_midnight'
  | 'rest_nap'
  | 'wake_up'
  | 'entertain_hum'
  | 'entertain_rps'
  | 'entertain_story'
  | 'entertain_music'
  | 'comfort_blanket';

export type MicroTellKind =
  | 'none'
  | 'sigh'
  | 'yawn'
  | 'startled'
  | 'eat_sip'
  | 'cold_shiver'
  | 'cozy_warm';

export interface MicroTellCommand {
  id: number;
  kind: MicroTellKind;
}

export interface EmotionalCarryover {
  feeling: string;
  mood: MoodType;
  turnsRemaining: number;
  empathySoftening: boolean;
}

export interface BrainThought {
  id: string;
  text: string;
  trigger:
    | 'idle'
    | 'boredom'
    | 'curiosity'
    | 'interaction'
    | 'chat'
    | 'hunger'
    | 'sleepiness'
    | 'comfort'
    | 'care'
    | 'empathy';
  timestamp: number;
}

export interface PersonaBrainState {
  energy: number; // 0 - 100
  hunger: number; // 0 - 100 (higher = hungrier)
  sleepiness: number; // 0 - 100 (higher = sleepier)
  boredom: number; // 0 - 100 (higher = more bored/restless)
  comfort: number; // 0 - 100 (higher = warmer/cozier)
  curiosity: number; // 0 - 100
  isSleeping: boolean;
  sleepingPosition?: SleepingPosition;
  nuancedFeeling: string;
  carryover: EmotionalCarryover | null;
  currentThought: string;
  thoughtStream: BrainThought[];
  lastAutonomousActionAt: number;
}

export type CustomBackdropKind = 'image' | 'hdr' | 'glb';

export interface CustomStageEnvironment {
  vaultId: string;
  fileName: string;
  kind: CustomBackdropKind;
}

export interface MemoryEntry {
  id: string;
  fact: string;
  createdAt: number;
}

export interface MeshDescriptor {
  name: string;
  label: string;
  category: ClothingCategory;
  visible: boolean;
  materialName: string;
  isSkinned: boolean;
  currentColorHex: string;
  hasCustomTexture: boolean;
}

export interface MaterialMod {
  colorHex?: string;
  textureVaultId?: string;
  textureDataUrl?: string;
  textureFileName?: string;
}

export interface OutfitSlot {
  id: string;
  name: string;
  modelVaultId: string | null;
  meshVisibility: Record<string, boolean>;
  materialMods: Record<string, MaterialMod>;
  /** Optional per-outfit Y-axis calibration in radians (default 0) for sideways .vrm/.glb exports */
  yawOffset?: number;
  /** Whether cycling / safety shorts (spats) are equipped under the skirt */
  cyclingShorts?: boolean;
  /** Equipped 3D accessories / .xwear dress-up items attached to this outfit */
  accessories?: EquippedAccessory[];
  /** LLM-generated or user-toggled procedural 3D bone-tracked accessories */
  proceduralAccessories?: ProceduralAccessoryId[];
  /** Primary accent color for procedural 3D accessories */
  accessoryColorHex?: string;
  /** Selected or AI-chosen 3D procedural hairstyle overlay */
  hairStyle?: HairStyleId;
  /** Optional hair dye color hex (null/undefined = auto-match VRM's native hair color) */
  hairColorHex?: string | null;
  /** Optional ombre / highlight accent color for hair tips & hair ties */
  hairHighlightHex?: string | null;
  /** AI-chosen 3D garment silhouette (dresses, hoodies, shorts, pants, kimono, pajamas, blazers, etc.) */
  garmentStyle?: GarmentStyleId;
  /** Stored garment color palette for procedural 3D clothing rendering */
  garmentPalette?: {
    topHex: string;
    topAccentHex: string;
    bottomHex: string;
    bottomAccentHex: string;
    accessoryHex: string;
    topTextureDataUrl?: string | null;
    bottomTextureDataUrl?: string | null;
  };
  /** Short AI stylist summary for generated outfits */
  aiStyleNote?: string;
  createdAt: number;
}

export interface VaultModelMeta {
  id: string;
  fileName: string;
  format: 'vrm' | 'glb' | 'xavatar' | 'xwear' | 'vroidcustomitem';
  sizeBytes: number;
  thumbnailDataUrl: string | null;
  isDefaultSample?: boolean;
  createdAt: number;
}

export interface VaultVrmaMeta {
  id: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  createdAt: number;
}

export type AccessoryAttachTarget =
  | 'auto_fit'
  | 'head'
  | 'neck'
  | 'chest'
  | 'hips'
  | 'leftHand'
  | 'rightHand'
  | 'root';

export interface VaultAccessoryMeta {
  id: string;
  name: string;
  fileName: string;
  format: 'xwear' | 'xavatar' | 'glb' | 'vrm' | 'vroidcustomitem';
  defaultTarget: AccessoryAttachTarget;
  thumbnailDataUrl: string | null;
  sizeBytes: number;
  createdAt: number;
}

export interface EquippedAccessory {
  id: string;
  vaultAccessoryId: string;
  name: string;
  fileName: string;
  format: 'xwear' | 'xavatar' | 'glb' | 'vrm' | 'vroidcustomitem';
  visible: boolean;
  attachTarget: AccessoryAttachTarget;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: number;
  scaleXYZ?: [number, number, number];
  colorHex?: string;
}

export interface DialogueSegment {
  kind: 'action' | 'dialogue' | 'subtitle';
  text: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system_event';
  rawText: string;
  segments: DialogueSegment[];
  spokenText: string;
  mood?: MoodType;
  affinityDelta?: number;
  timestamp: number;
  isFallback?: boolean;
}

export interface VoiceSettings {
  language: VoiceLanguage;
  gender: VoiceGender;
  archetype: VocalArchetype;
  voiceName: GeminiVoiceName;
  pitch: number; // 0.85 - 1.45
  speed: number; // 0.90 - 1.25
  autoSpeak: boolean;
}

export interface Persona {
  id: string;
  name: string;
  japaneseName: string;
  title: string;
  tagline: string;
  traits: string;
  startingScenario: string;
  accentColor: string;
  gender: VoiceGender;
  systemPrompt: string;
  appearanceNotes: string;
  greetingJa: string;
  greetingEn: string;
  mood: MoodType;
  emotionIntensity: number; // 0.0 - 1.0
  affinity: number; // 0 - 100 (Tsun -> Dere)
  brain: PersonaBrainState;
  memoryJournal: MemoryEntry[];
  lastMemorySummaryMsgCount: number;
  stageEnvironment: StageEnvironmentId;
  customEnvironment?: CustomStageEnvironment | null;
  voice: VoiceSettings;
  outfitSlots: OutfitSlot[];
  activeOutfitSlotId: string;
  messages: ChatMessage[];
  pendingSystemEvents?: string[];
  createdAt: number;
  updatedAt: number;
  isPreset?: boolean;
}

export type KeyMode = 'auto' | 'gemini' | 'vertex_express';

export type IdleCheckInMinutes = 0 | 15 | 30 | 60;

export type UserHonorific = '' | '-san' | '-kun' | '-chan' | 'Senpai';

export interface StudioSettings {
  apiKey: string;
  useBuiltInKey?: boolean;
  preferLocalAi?: boolean;
  keyMode: KeyMode;
  textModel: string;
  ttsModel: string;
  userName: string;
  userHonorific?: UserHonorific;
  defaultPosture?: AvatarPosture;
  autoReactOnOutfitChange: boolean;
  /** Autonomously design & change into a fitting outfit via Local LLM when time of day / occasion shifts */
  autoDressByTimeOccasion?: boolean;
  /** Autonomously eat, do hobbies, study in school, shower/brush teeth, or travel based on her live mood & needs */
  autoLifeByMood?: boolean;
  offlineVoiceOnly: boolean;
  noticeActiveWindow: boolean;
  idleCheckInMinutes: IdleCheckInMinutes;
  idleRespectDndFullscreen: boolean;
  doNotDisturb: boolean;
}

export interface PersistedStudioState {
  version: number;
  activePersonaId: string;
  personas: Persona[];
  settings: StudioSettings;
  updatedAt: number;
}

export interface LipSyncFrame {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
  volume: number;
  isSpeaking: boolean;
}

export interface MusicSyncFrame {
  isPlaying: boolean;
  bass: number; // 0 - 1
  mid: number; // 0 - 1
  treble: number; // 0 - 1
  beatPulse: number; // 0 - 1
  aa: number;
  ih: number;
  ou: number;
  bars: number[]; // 12 visualizer bars
}
