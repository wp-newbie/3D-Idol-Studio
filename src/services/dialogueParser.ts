import type { DialogueSegment, MoodType } from '../types/studio';

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

export function stripHiddenTags(text: string): string {
  return text
    .replace(MOOD_TAG_REGEX, '')
    .replace(AFFINITY_TAG_REGEX, '')
    .replace(INTENSITY_TAG_REGEX, '')
    .replace(THOUGHT_TAG_REGEX, '')
    .replace(FEELING_TAG_REGEX, '')
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
  return quoted.join(' ').trim();
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
  return subs.join(' ').trim();
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
} {
  const mood = extractMoodFromText(rawText, fallbackMood);
  const affinityDelta = extractAffinityDelta(rawText);
  const emotionIntensity = extractEmotionIntensity(rawText, mood);
  const innerThought = extractInnerThought(rawText);
  const nuancedFeeling = extractNuancedFeeling(rawText);
  const cleaned = stripHiddenTags(rawText);
  const spokenText = extractSpokenDialogue(rawText);

  const segments: DialogueSegment[] = [];
  const tokenRegex =
    /(\*[^*]+\*|"[^"]+"|“[^”]+”|「[^」]+」|\([^)]+\)|（[^）]+）)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(cleaned)) !== null) {
    const preceding = cleaned.slice(lastIndex, match.index).trim();
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

  const tail = cleaned.slice(lastIndex).trim();
  if (tail) segments.push({ kind: 'action', text: tail });

  if (segments.length === 0 && cleaned) {
    segments.push({ kind: 'dialogue', text: cleaned });
  }

  return {
    segments,
    spokenText,
    mood,
    affinityDelta,
    emotionIntensity,
    innerThought,
    nuancedFeeling,
  };
}
