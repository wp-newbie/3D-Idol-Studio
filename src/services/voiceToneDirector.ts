import type {
  InteractionZone,
  MoodType,
  Persona,
  VoiceSettings,
} from '../types/studio';
import { MOOD_META, VOCAL_ARCHETYPES } from '../data/presets';
import { getCircadianContext } from './aiBrainService';

export interface VoiceModulationProfile {
  toneId:
    | 'empathetic'
    | 'sleepy'
    | 'flustered'
    | 'sharp_tsundere'
    | 'hungry'
    | 'bored'
    | 'playful_melodic'
    | 'proud_radiant'
    | 'cool_deadpan';
  toneLabel: string;
  badgeClass: string;
  pitchMultiplier: number;
  rateMultiplier: number;
  effectivePitch: number;
  effectiveRate: number;
  stylePrompt: string;
  summaryDetail: string;
}

export interface VoiceToneInput {
  personaName?: string;
  personaTitle?: string;
  mood: MoodType;
  emotionIntensity?: number; // 0.0 - 1.0
  voice: VoiceSettings;
  hunger?: number;
  sleepiness?: number;
  boredom?: number;
  comfort?: number;
  isSleeping?: boolean;
  nuancedFeeling?: string;
  empathySoftening?: boolean;
  recentInteractionZone?: InteractionZone | null;
}

const INTERACTION_CONTEXT_NOTE: Record<InteractionZone, string> = {
  headpat: 'after a sudden, gentle headpat',
  poke: 'after being playfully poked on the cheek',
  hair_tug: 'after someone playfully bounced her hair',
  outfit_tap: 'after someone unexpectedly poked her outfit',
};

/**
 * Dynamic Emotion & Physical-Sensation Voice Modulation Matrix.
 * Combines base Vocal Archetype + live [MOOD] + Emotional Intensity (0.0-1.0)
 * + Human Needs (Hunger, Sleepiness, Boredom, Comfort) + immediate physical reaction.
 */
export function computeVoiceModulation(input: VoiceToneInput): VoiceModulationProfile {
  const {
    personaName = 'an anime virtual idol',
    mood,
    emotionIntensity = 0.72,
    voice,
    hunger = 25,
    sleepiness = 20,
    boredom = 25,
    isSleeping = false,
    nuancedFeeling = '',
    empathySoftening = false,
    recentInteractionZone = null,
  } = input;

  const k = Math.max(0.15, Math.min(1.0, emotionIntensity));
  const intensityScale = 0.45 + 0.55 * k;
  const archetype = VOCAL_ARCHETYPES[voice.archetype];
  const circadian = getCircadianContext();
  const feelingLower = nuancedFeeling.toLowerCase();

  const isEmpathetic =
    empathySoftening ||
    /(worried|caring|empathetic|comforting|reassuring|softly caring)/i.test(feelingLower);
  const isSleepy =
    isSleeping ||
    sleepiness > 65 ||
    (circadian.isLateNight && sleepiness > 45) ||
    /(sleepy|tired|drowsy|dozing)/i.test(feelingLower);
  const isFlusteredReaction =
    recentInteractionZone === 'headpat' ||
    recentInteractionZone === 'poke' ||
    recentInteractionZone === 'hair_tug' ||
    mood === 'Flustered' ||
    mood === 'Shy';
  const isSharpReaction =
    recentInteractionZone === 'outfit_tap' ||
    mood === 'Annoyed' ||
    mood === 'Pouty';
  const isHungry = hunger > 65 || /hungry|craving/i.test(feelingLower);
  const isBored = boredom > 65 || /restless|bored/i.test(feelingLower);

  let toneId: VoiceModulationProfile['toneId'] = 'cool_deadpan';
  let toneLabel = 'Cool & Deadpan';
  let badgeClass = 'border-slate-400/35 bg-slate-900/75 text-slate-200';
  let rawPitchMult = 0.99;
  let rawRateMult = 0.98;
  let dynamicDirection =
    'Dry, deadpan, composed anime delivery with understated comedic timing.';

  // Priority: Active Dozing/Sleep > Genuine Empathy > High Sleepiness/Late Night > Flustered/Sharp Reaction > Hunger/Boredom > Mood
  if (isSleeping) {
    toneId = 'sleepy';
    toneLabel = 'Soft & Sleepy';
    badgeClass = 'border-indigo-400/45 bg-indigo-950/75 text-indigo-100';
    rawPitchMult = 0.92; // -8% lower pitch
    rawRateMult = 0.88; // 0.88x slower unhurried rate
    dynamicDirection =
      'Speak with a lower-pitched, soft airy and breathy half-asleep whisper tone, unhurried cadence, and a gentle yawn-like sigh at the start of the sentence.';
  } else if (isEmpathetic) {
    toneId = 'empathetic';
    toneLabel = 'Gentle & Empathetic';
    badgeClass = 'border-emerald-400/40 bg-emerald-950/75 text-emerald-100';
    rawPitchMult = 0.96; // -4% warm lower-mid register
    rawRateMult = 0.95; // 0.95x steady reassuring cadence
    dynamicDirection =
      'Drop the harsh tsundere edge completely—speak in a warm, gentle, grounded lower-mid register with soft reassuring breathiness and sincere human concern.';
  } else if (isSleepy) {
    toneId = 'sleepy';
    toneLabel = 'Soft & Sleepy';
    badgeClass = 'border-indigo-400/45 bg-indigo-950/75 text-indigo-100';
    rawPitchMult = 0.92; // -8% lower pitch
    rawRateMult = 0.88; // 0.88x slower unhurried rate
    dynamicDirection =
      'Speak with a lower-pitched, soft airy and breathy half-asleep whisper tone, unhurried cadence, and a gentle yawn-like sigh at the start of the sentence.';
  } else if (isFlusteredReaction) {
    toneId = 'flustered';
    toneLabel = 'Flustered & Breathless';
    badgeClass = 'border-rose-400/45 bg-rose-950/75 text-rose-100';
    rawPitchMult = 1.08 + 0.04 * k; // +8% to +12% higher pitch
    rawRateMult = 1.12; // 1.12x faster nervous cadence
    const reactNote = recentInteractionZone
      ? ` ${INTERACTION_CONTEXT_NOTE[recentInteractionZone]}`
      : '';
    dynamicDirection = `Currently flustered${reactNote}—higher-pitched, breathy, fast nervous cadence with slight stammering pauses and a soft embarrassed vocal tremor, trying and failing to sound annoyed.`;
  } else if (isHungry && (mood === 'Pouty' || mood === 'Deadpan' || mood === 'Annoyed')) {
    toneId = 'hungry';
    toneLabel = 'Hungry & Pouting';
    badgeClass = 'border-amber-400/45 bg-amber-950/75 text-amber-100';
    rawPitchMult = 0.97; // -3%
    rawRateMult = 0.97;
    dynamicDirection =
      'Slightly whiny, dramatic, pleading tsundere inflection with expressive rising-falling intonation, as if embarrassed and trying to hide a growling stomach.';
  } else if (isSharpReaction) {
    toneId = 'sharp_tsundere';
    toneLabel = 'Sharp Tsundere';
    badgeClass = 'border-orange-400/45 bg-orange-950/75 text-orange-100';
    rawPitchMult = 1.03; // brighter projection
    rawRateMult = 1.07; // crisp, clipped endings
    const reactNote = recentInteractionZone
      ? ` ${INTERACTION_CONTEXT_NOTE[recentInteractionZone]}`
      : '';
    dynamicDirection = `Crisp, sharp staccato tsundere delivery${reactNote} with slightly brighter projection, clipped sentence endings, and a brief exasperated "Hmph!" breath before speaking.`;
  } else if (isBored) {
    toneId = 'bored';
    toneLabel = 'Restless & Sighing';
    badgeClass = 'border-fuchsia-400/40 bg-fuchsia-950/75 text-fuchsia-100';
    rawPitchMult = 0.99;
    rawRateMult = 0.94; // 0.94x drawling restless delivery
    dynamicDirection =
      'Drawling, restless, half-sighing delivery with an impatient lilting upward inflection at the end to pull the listener back into the conversation.';
  } else if (mood === 'Proud') {
    toneId = 'proud_radiant';
    toneLabel = 'Proud & Radiant';
    badgeClass = 'border-yellow-400/45 bg-yellow-950/75 text-yellow-100';
    rawPitchMult = 1.04; // +4%
    rawRateMult = 1.04; // 1.04x lively rhythm
    dynamicDirection =
      'Confident, melodic diva lilt with lively rhythm, crisp pride, and a subtle triumphant smile audible in her phrasing.';
  } else if (mood === 'Amused' || mood === 'Warm') {
    toneId = 'playful_melodic';
    toneLabel = mood === 'Warm' ? 'Warm & Melodic' : 'Playful & Melodic';
    badgeClass = 'border-pink-400/40 bg-pink-950/75 text-pink-100';
    rawPitchMult = 1.04; // +4%
    rawRateMult = 1.04; // 1.04x lively rhythm
    dynamicDirection =
      'Melodic, playful lilt with lively phrasing and a subtle affectionate smile audible in her voice.';
  } else if (isHungry) {
    toneId = 'hungry';
    toneLabel = 'Hungry & Pouting';
    badgeClass = 'border-amber-400/45 bg-amber-950/75 text-amber-100';
    rawPitchMult = 0.97;
    rawRateMult = 0.97;
    dynamicDirection =
      'Slightly whiny, dramatic, pleading tsundere inflection with expressive rising-falling intonation, trying to hide a growling stomach.';
  }

  // Scale modulation cleanly by Emotional Intensity (0.0 - 1.0)
  const pitchMultiplier = Number((1 + (rawPitchMult - 1) * intensityScale).toFixed(3));
  const rateMultiplier = Number((1 + (rawRateMult - 1) * intensityScale).toFixed(3));

  const basePitch = voice.pitch || (voice.gender === 'female' ? 1.28 : 0.92);
  const baseSpeed = voice.speed || (voice.gender === 'female' ? 1.08 : 1.04);
  const effectivePitch = Math.max(
    0.72,
    Math.min(1.55, Number((basePitch * pitchMultiplier).toFixed(2)))
  );
  const effectiveRate = Math.max(
    0.78,
    Math.min(1.32, Number((baseSpeed * rateMultiplier).toFixed(2)))
  );

  const langLabel = voice.language === 'ja' ? 'Japanese (ja-JP)' : 'English';
  const moodDir = MOOD_META[mood]?.tsundereVocalDirection || '';
  const feelingClause = nuancedFeeling ? ` Nuanced feeling: ${nuancedFeeling}.` : '';

  const stylePrompt = `Speak in ${langLabel} as ${personaName} (${archetype.label}). ${archetype.stylePrompt} ${dynamicDirection} ${moodDir}${feelingClause} Emotional intensity: ${Math.round(
    k * 100
  )}%.`;

  const pitchPct = Math.round((pitchMultiplier - 1) * 100);
  const pitchStr = pitchPct >= 0 ? `+${pitchPct}%` : `${pitchPct}%`;
  const summaryDetail = `Pitch ${pitchStr} · Rate ${rateMultiplier.toFixed(2)}x`;

  return {
    toneId,
    toneLabel,
    badgeClass,
    pitchMultiplier,
    rateMultiplier,
    effectivePitch,
    effectiveRate,
    stylePrompt,
    summaryDetail,
  };
}

export function computePersonaLiveVoiceTone(
  persona: Persona,
  recentInteractionZone?: InteractionZone | null
): VoiceModulationProfile {
  return computeVoiceModulation({
    personaName: persona.name,
    personaTitle: persona.title,
    mood: persona.mood,
    emotionIntensity: persona.emotionIntensity,
    voice: persona.voice,
    hunger: persona.brain?.hunger,
    sleepiness: persona.brain?.sleepiness,
    boredom: persona.brain?.boredom,
    comfort: persona.brain?.comfort,
    isSleeping: persona.brain?.isSleeping,
    nuancedFeeling: persona.brain?.nuancedFeeling,
    empathySoftening: Boolean(persona.brain?.carryover?.empathySoftening),
    recentInteractionZone,
  });
}
