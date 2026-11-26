import type {
  AvatarPosture,
  DialogueSegment,
  MoodType,
  ProceduralEmoteId,
  RoamBehavior,
  VocalArchetype,
} from '../types/studio';

const VALID_MOODS: MoodType[] = [
  'Deadpan',
  'Flustered',
  'Annoyed',
  'Shy',
  'Amused',
  'Warm',
  'Pouty',
  'Proud',
];

const MOOD_TAG_REGEX = /\[MOOD\s*:\s*([A-Za-z]+)\s*\]/gi;
const AFFINITY_TAG_REGEX = /\[AFFINITY\s*:\s*([+-]?\d+)\s*\]/gi;
const INTENSITY_TAG_REGEX = /\[INTENSITY\s*:\s*([0-9]*\.?[0-9]+)\s*\]/gi;
const THOUGHT_TAG_REGEX = /\[THOUGHT\s*:\s*([^\]]+)\]/gi;
const FEELING_TAG_REGEX = /\[FEELING\s*:\s*([^\]]+)\]/gi;
const ARCHETYPE_TAG_REGEX = /\[ARCHETYPE\s*:\s*([A-Za-z0-9_-]+)\s*\]/gi;
const EQUIP_OUTFIT_TAG_REGEX = /\[EQUIP_OUTFIT\s*:\s*([^\]]+)\]/gi;
const TOGGLE_LAYER_TAG_REGEX = /\[TOGGLE_LAYER\s*:\s*([^\]=]+)=(on|off|true|false)\s*\]/gi;
const POSTURE_TAG_REGEX = /\[POSTURE\s*:\s*(seated|standing|sleeping)\s*\]/gi;
const MOVE_TAG_REGEX = /\[MOVE\s*:\s*(walk|peek|sit_taskbar|approach_user)\s*\]/gi;
const EMOTE_TAG_REGEX = /\[(?:EMOTE|POSE)\s*:\s*([A-Za-z0-9_-]+)\s*\]/gi;
const GAZE_TAG_REGEX = /\[GAZE\s*:\s*(camera|mouse|look_away|shy_down|screen)\s*\]/gi;
const EXPRESSION_TAG_REGEX = /\[EXPRESSION\s*:\s*([A-Za-z0-9_-]+)\s*\]/gi;
const LAUNCH_APP_TAG_REGEX = /\[LAUNCH_APP\s*:\s*([^\]]+)\]/gi;
const CLOSE_APP_TAG_REGEX = /\[CLOSE_APP\s*:\s*([^\]]+)\]/gi;
const FOCUS_APP_TAG_REGEX = /\[FOCUS_APP\s*:\s*([^\]]+)\]/gi;
const LIST_APPS_TAG_REGEX = /\[LIST_APPS\]/gi;
const GENERATE_STAGE_TAG_REGEX = /\[GENERATE_STAGE\s*:\s*([^\]]+)\]/gi;

export function extractGenerateStageAction(text: string): string | null {
  let prompt: string | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(GENERATE_STAGE_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim();
    if (raw) prompt = raw;
  }
  return prompt;
}

export interface DesktopAppAction {
  type: 'launch' | 'close' | 'focus' | 'list';
  target?: string;
}

export function extractDesktopAppActions(text: string): DesktopAppAction[] {
  const actions: DesktopAppAction[] = [];
  let match: RegExpExecArray | null;

  const launchRegex = new RegExp(LAUNCH_APP_TAG_REGEX.source, 'gi');
  while ((match = launchRegex.exec(text)) !== null) {
    const target = match[1].trim();
    if (target) actions.push({ type: 'launch', target });
  }

  const closeRegex = new RegExp(CLOSE_APP_TAG_REGEX.source, 'gi');
  while ((match = closeRegex.exec(text)) !== null) {
    const target = match[1].trim();
    if (target) actions.push({ type: 'close', target });
  }

  const focusRegex = new RegExp(FOCUS_APP_TAG_REGEX.source, 'gi');
  while ((match = focusRegex.exec(text)) !== null) {
    const target = match[1].trim();
    if (target) actions.push({ type: 'focus', target });
  }

  const listRegex = new RegExp(LIST_APPS_TAG_REGEX.source, 'gi');
  while ((match = listRegex.exec(text)) !== null) {
    actions.push({ type: 'list' });
  }

  return actions;
}

export interface WardrobeOutfitAction {
  slotTarget: string;
}

export interface WardrobeLayerAction {
  layerName: string;
  visible: boolean;
}

export function extractOutfitAction(text: string): WardrobeOutfitAction | null {
  let action: WardrobeOutfitAction | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(EQUIP_OUTFIT_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const target = match[1].trim();
    if (target) action = { slotTarget: target };
  }
  return action;
}

export function extractLayerActions(text: string): WardrobeLayerAction[] {
  const actions: WardrobeLayerAction[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOGGLE_LAYER_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const layerName = match[1].trim();
    const val = match[2].trim().toLowerCase();
    const visible = val === 'on' || val === 'true';
    if (layerName) {
      actions.push({ layerName, visible });
    }
  }
  return actions;
}

export function extractMoodFromText(text: string, fallback: MoodType = 'Deadpan'): MoodType {
  let detected: MoodType = fallback;
  let match: RegExpExecArray | null;
  const regex = new RegExp(MOOD_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const candidate = match[1].trim().toLowerCase();
    const found = VALID_MOODS.find((m) => m.toLowerCase() === candidate);
    if (found) detected = found;
  }
  return detected;
}

export function extractAffinityDelta(text: string): number {
  let delta = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(AFFINITY_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const parsed = Number.parseInt(match[1], 10);
    if (!Number.isNaN(parsed)) {
      delta = Math.max(-2, Math.min(3, parsed));
    }
  }
  return delta;
}

export function extractEmotionIntensity(text: string, mood: MoodType): number {
  let match: RegExpExecArray | null;
  let intensity: number | null = null;
  const regex = new RegExp(INTENSITY_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const val = Number.parseFloat(match[1]);
    if (!Number.isNaN(val)) {
      intensity = Math.max(0.15, Math.min(1.0, val));
    }
  }
  if (intensity !== null) return intensity;

  // Heuristic intensity based on punctuation & mood expressiveness
  const exclamations = (text.match(/[!！?？]/g) || []).length;
  const base =
    mood === 'Deadpan'
      ? 0.55
      : mood === 'Flustered' || mood === 'Annoyed' || mood === 'Pouty'
      ? 0.78
      : 0.7;
  return Math.min(1.0, Number((base + Math.min(0.22, exclamations * 0.06)).toFixed(2)));
}

export function extractInnerThought(text: string): string | null {
  let thought: string | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(THOUGHT_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const inner = match[1].trim().replace(/^["']|["']$/g, '');
    if (inner) thought = inner;
  }
  return thought;
}

export function extractNuancedFeeling(text: string): string | null {
  let feeling: string | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(FEELING_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const inner = match[1].trim().replace(/^["']|["']$/g, '');
    if (inner) feeling = inner;
  }
  return feeling;
}

export function extractArchetypeFromText(text: string): VocalArchetype | null {
  let archetype: VocalArchetype | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(ARCHETYPE_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim().toLowerCase();
    if (
      raw === 'sharp_tsundere' ||
      raw === 'gothic_diva' ||
      raw === 'deadpan_sleepy' ||
      raw === 'cool_guarded_tsundere'
    ) {
      archetype = raw as VocalArchetype;
    }
  }
  return archetype;
}

export function extractPostureAction(text: string): AvatarPosture | null {
  let posture: AvatarPosture | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(POSTURE_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim().toLowerCase();
    if (raw === 'seated' || raw === 'standing' || raw === 'sleeping') {
      posture = raw;
    }
  }
  return posture;
}

export function extractMoveAction(text: string): RoamBehavior | null {
  let move: RoamBehavior | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(MOVE_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim().toLowerCase();
    if (raw === 'walk' || raw === 'peek' || raw === 'sit_taskbar' || raw === 'approach_user') {
      move = raw as RoamBehavior;
    }
  }
  return move;
}

export function extractEmoteAction(text: string): ProceduralEmoteId | null {
  let emote: ProceduralEmoteId | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(EMOTE_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim().toLowerCase();
    if (raw) emote = raw as ProceduralEmoteId;
  }
  return emote;
}

export function extractGazeAction(
  text: string
): 'camera' | 'mouse' | 'look_away' | 'shy_down' | 'screen' | null {
  let gaze: 'camera' | 'mouse' | 'look_away' | 'shy_down' | 'screen' | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(GAZE_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim().toLowerCase();
    if (
      raw === 'camera' ||
      raw === 'mouse' ||
      raw === 'look_away' ||
      raw === 'shy_down' ||
      raw === 'screen'
    ) {
      gaze = raw;
    }
  }
  return gaze;
}

export function extractExpressionAction(text: string): string | null {
  let expr: string | null = null;
  let match: RegExpExecArray | null;
  const regex = new RegExp(EXPRESSION_TAG_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1].trim();
    if (raw) expr = raw;
  }
  return expr;
}

export function stripHiddenTags(text: string): string {
  return text
    .replace(MOOD_TAG_REGEX, '')
    .replace(AFFINITY_TAG_REGEX, '')
    .replace(INTENSITY_TAG_REGEX, '')
    .replace(THOUGHT_TAG_REGEX, '')
    .replace(FEELING_TAG_REGEX, '')
    .replace(ARCHETYPE_TAG_REGEX, '')
    .replace(EQUIP_OUTFIT_TAG_REGEX, '')
    .replace(TOGGLE_LAYER_TAG_REGEX, '')
    .replace(POSTURE_TAG_REGEX, '')
    .replace(MOVE_TAG_REGEX, '')
    .replace(EMOTE_TAG_REGEX, '')
    .replace(GAZE_TAG_REGEX, '')
    .replace(EXPRESSION_TAG_REGEX, '')
    .replace(LAUNCH_APP_TAG_REGEX, '')
    .replace(CLOSE_APP_TAG_REGEX, '')
    .replace(FOCUS_APP_TAG_REGEX, '')
    .replace(LIST_APPS_TAG_REGEX, '')
    .replace(GENERATE_STAGE_TAG_REGEX, '')
    .trim();
}

export function stripMoodTag(text: string): string {
  return stripHiddenTags(text);
}

export function extractSpokenDialogue(rawText: string): string {
  const withoutTags = stripHiddenTags(rawText);
  const withoutActionsAndSubs = withoutTags
    .replace(/\*[^*]+\*/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/（[^）]*）/g, ' ');

  const quoted: string[] = [];
  const quoteRegex = /"([^"]+)"|“([^”]+)”|「([^」]+)」/g;
  let match: RegExpExecArray | null;
  while ((match = quoteRegex.exec(withoutActionsAndSubs)) !== null) {
    const spoken = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (spoken.length > 0) quoted.push(spoken);
  }
  if (quoted.length > 0) {
    return quoted.join(' ').trim();
  }

  // Fallback if model omitted quotes: extract Japanese character sequences
  const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(withoutActionsAndSubs);
  if (hasJapanese) {
    return withoutActionsAndSubs.trim();
  }

  return '';
}

export function extractEnglishSubtitle(rawText: string): string {
  const withoutTags = stripHiddenTags(rawText);
  const subs: string[] = [];
  const subRegex = /\(([^)]+)\)|（([^）]+)）/g;
  let match: RegExpExecArray | null;
  while ((match = subRegex.exec(withoutTags)) !== null) {
    const inner = (match[1] ?? match[2] ?? '').trim();
    if (inner.length > 0) subs.push(inner);
  }
  if (subs.length > 0) {
    return subs.join(' ').trim();
  }

  // Fallback: check for English text outside quotes/actions
  const withoutQuotes = withoutTags
    .replace(/\*[^*]+\*/g, ' ')
    .replace(/"[^"]+"|“[^”]+”|「([^」]+)」/g, ' ')
    .trim();
  if (withoutQuotes && /[A-Za-z]{2,}/.test(withoutQuotes)) {
    return withoutQuotes.replace(/^[-–—:\s]+/, '').trim();
  }

  return '';
}

export function parseDialogueResponse(
  rawText: string,
  fallbackMood: MoodType = 'Deadpan'
): {
  segments: DialogueSegment[];
  spokenText: string;
  mood: MoodType;
  affinityDelta: number;
  emotionIntensity: number;
  innerThought: string | null;
  nuancedFeeling: string | null;
  archetype: VocalArchetype | null;
  outfitAction: WardrobeOutfitAction | null;
  layerActions: WardrobeLayerAction[];
  postureAction: AvatarPosture | null;
  moveAction: RoamBehavior | null;
  emoteAction: ProceduralEmoteId | null;
  poseAction: ProceduralEmoteId | null;
  gazeAction: 'camera' | 'mouse' | 'look_away' | 'shy_down' | 'screen' | null;
  expressionAction: string | null;
  appActions: DesktopAppAction[];
  stageAction: string | null;
} {
  const mood = extractMoodFromText(rawText, fallbackMood);
  const affinityDelta = extractAffinityDelta(rawText);
  const emotionIntensity = extractEmotionIntensity(rawText, mood);
  const innerThought = extractInnerThought(rawText);
  const nuancedFeeling = extractNuancedFeeling(rawText);
  const archetype = extractArchetypeFromText(rawText);
  const outfitAction = extractOutfitAction(rawText);
  const layerActions = extractLayerActions(rawText);
  const postureAction = extractPostureAction(rawText);
  const moveAction = extractMoveAction(rawText);
  const emoteAction = extractEmoteAction(rawText);
  const gazeAction = extractGazeAction(rawText);
  const expressionAction = extractExpressionAction(rawText);
  const appActions = extractDesktopAppActions(rawText);
  const stageAction = extractGenerateStageAction(rawText);
  const cleaned = stripHiddenTags(rawText);
  const spokenText = extractSpokenDialogue(rawText);

  // Normalize any unclosed quotes or parentheses to prevent trailing fragments
  let normalized = cleaned;
  if ((normalized.match(/"/g) || []).length % 2 === 1) normalized += '"';
  if ((normalized.match(/“/g) || []).length > (normalized.match(/”/g) || []).length) normalized += '”';
  if ((normalized.match(/「/g) || []).length > (normalized.match(/」/g) || []).length) normalized += '」';
  if ((normalized.match(/\(/g) || []).length > (normalized.match(/\)/g) || []).length) normalized += ')';
  if ((normalized.match(/（/g) || []).length > (normalized.match(/）/g) || []).length) normalized += '）';

  const segments: DialogueSegment[] = [];
  const tokenRegex =
    /(\*[^*]+\*|"[^"]+"|“[^”]+”|「[^」]+」|\([^)]+\)|（[^）]+）)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(normalized)) !== null) {
    const preceding = normalized.slice(lastIndex, match.index).trim();
    if (preceding) segments.push({ kind: 'action', text: preceding });

    const token = match[0].trim();
    if (token.startsWith('*') && token.endsWith('*')) {
      const inner = token.slice(1, -1).trim();
      if (inner) segments.push({ kind: 'action', text: inner });
    } else if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith('“') && token.endsWith('”')) ||
      (token.startsWith('「') && token.endsWith('」'))
    ) {
      const inner = token.slice(1, -1).trim();
      if (inner) segments.push({ kind: 'dialogue', text: inner });
    } else if (
      (token.startsWith('(') && token.endsWith(')')) ||
      (token.startsWith('（') && token.endsWith('）'))
    ) {
      const inner = token.slice(1, -1).trim();
      if (inner) segments.push({ kind: 'subtitle', text: inner });
    }
    lastIndex = tokenRegex.lastIndex;
  }

  const tail = normalized.slice(lastIndex).trim();
  if (tail) segments.push({ kind: 'action', text: tail });

  if (segments.length === 0 && normalized) {
    segments.push({ kind: 'dialogue', text: normalized });
  }

  return {
    segments,
    spokenText,
    mood,
    affinityDelta,
    emotionIntensity,
    innerThought,
    nuancedFeeling,
    archetype,
    outfitAction,
    layerActions,
    postureAction,
    moveAction,
    emoteAction,
    poseAction: emoteAction,
    gazeAction,
    expressionAction,
    appActions,
    stageAction,
  };
}
