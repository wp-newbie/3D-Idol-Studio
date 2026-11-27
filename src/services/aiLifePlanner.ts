import type {
  ActiveAiChair,
  ActiveDestinationScene,
  ActiveDiningScene,
  ActiveHobbyScene,
  ActiveLifeScene,
  AiChairStyleId,
  DestinationKindId,
  FoodVisualId,
  HobbyKindId,
  Persona,
  StretchRoutineId,
} from '../types/studio';
import { getCircadianContext } from './aiBrainService';
import { queryDualLmStudioJson, type AiGenTaskKind } from './localLlmOrchestrator';
import {
  AI_CHAIR_STYLE_META,
  DESTINATION_KIND_META,
  FOOD_VISUAL_META,
  HOBBY_KIND_META,
} from '../stage/lifePropsRig';

export type LifeEngineSource = 'lm-studio' | 'offline-planner';

export interface PlannedFoodResult {
  dining: ActiveDiningScene;
  source: LifeEngineSource;
  modelUsed?: string;
}

export interface PlannedHobbyResult {
  hobby: ActiveHobbyScene;
  source: LifeEngineSource;
  modelUsed?: string;
}

export interface PlannedDestinationResult {
  destination: ActiveDestinationScene;
  suggestedOutfitPrompt: string | null;
  source: LifeEngineSource;
  modelUsed?: string;
}

export interface SpontaneousDesireResult {
  choice: 'dining' | 'hobby' | 'travel' | 'study' | 'hygiene' | 'gym_sport' | 'stretch' | 'roam';
  prompt: string;
  thought: string;
  source: LifeEngineSource;
  modelUsed?: string;
}

export interface PlannedStretchResult {
  routine: StretchRoutineId;
  stretchName: string;
  note: string;
  hobby: ActiveHobbyScene;
  source: LifeEngineSource;
  modelUsed?: string;
}

export type GymSportKindId =
  | 'gym_weights'
  | 'gym_treadmill'
  | 'sports_basketball'
  | 'sports_tennis';

export interface PlannedGymSportResult {
  sportKind: GymSportKindId;
  workoutName: string;
  note: string;
  hobby: ActiveHobbyScene;
  destination: ActiveDestinationScene;
  sportOutfitPrompt: string;
  source: LifeEngineSource;
  modelUsed?: string;
}

export interface PlannedAutoRoamDecision {
  wantToRoam: boolean;
  reason: string;
  source: LifeEngineSource;
  modelUsed?: string;
}

export type HygieneRoutineId = 'shower' | 'towel_dry' | 'brush_teeth';

export interface PlannedHygieneResult {
  routine: HygieneRoutineId;
  scentName: string;
  note: string;
  hobby: ActiveHobbyScene;
  destination: ActiveDestinationScene;
  wearHeadTowel: boolean;
  bathOutfitPrompt: string;
  afterOutfitPrompt: string | null;
  source: LifeEngineSource;
  modelUsed?: string;
}

export const HYGIENE_QUICK_CHIPS: {
  id: string;
  routine: HygieneRoutineId;
  label: string;
  hint: string;
}[] = [
  {
    id: 'sakura_shower',
    routine: 'shower',
    label: '🌸 Sakura Shampoo Shower',
    hint: 'Warm censored shower with sakura blossom shampoo and creamy body soap',
  },
  {
    id: 'lavender_soap',
    routine: 'shower',
    label: '🫧 Lavender Soap & Bubbles',
    hint: 'Relaxing evening censored shower with lavender bubble soap and warm steam',
  },
  {
    id: 'towel_dry',
    routine: 'towel_dry',
    label: '🧖‍♀️ Fluffy Towel & Hair Dry',
    hint: 'Drying off with a soft warm bath towel and changing into fresh cozy loungewear',
  },
  {
    id: 'brush_mint',
    routine: 'brush_teeth',
    label: '🪥 Minty Toothbrush',
    hint: 'Brushing teeth thoroughly at the bathroom sink with fresh mint toothpaste',
  },
];

export type SchoolLevel = 'highschool' | 'college';

export interface PlannedSchoolStudyResult {
  level: SchoolLevel;
  subjectName: string;
  studyNote: string;
  hobby: ActiveHobbyScene;
  destination: ActiveDestinationScene;
  uniformPrompt: string;
  source: LifeEngineSource;
  modelUsed?: string;
}

export const SCHOOL_SUBJECT_CHIPS: { id: string; label: string; prompt: string }[] = [
  { id: 'math', label: '📐 Math & Calculus', prompt: 'Mathematics & calculus equations on lined notebook paper' },
  { id: 'literature', label: '📖 Literature & Kanji', prompt: 'Japanese literature essay and kanji notes' },
  { id: 'science', label: '🧪 Chemistry & Science', prompt: 'Chemistry formulas and science lab review notes' },
  { id: 'history', label: '🌍 World History', prompt: 'World history timeline summary for upcoming exam' },
  { id: 'music', label: '🎵 Music Theory', prompt: 'Music theory chord progressions and lyric writing' },
  { id: 'cs', label: '💻 Computer Science', prompt: 'Algorithms and computer science study notes' },
];

const VALID_FOODS: FoodVisualId[] = [
  'ramen',
  'cake',
  'sushi',
  'pancakes',
  'curry',
  'bento',
  'pasta',
  'tea_sweets',
  'ice_cream',
  'burger',
];

const VALID_HOBBIES: HobbyKindId[] = [
  'painting',
  'music_keyboard',
  'reading',
  'gaming',
  'baking',
  'photography',
  'yoga',
  'journaling',
  'studying',
  'showering',
  'towel_dry',
  'brushing_teeth',
];

const VALID_DESTINATIONS: Exclude<DestinationKindId, 'none'>[] = [
  'home_kitchen',
  'shopping_mall',
  'tropical_beach',
  'vacation_cafe',
  'mountain_onsen',
  'amusement_park',
  'highschool_classroom',
  'college_campus',
  'bathroom_spa',
];

function cleanHex(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return fallback;
}

/**
 * Lets the AI character choose Gemma, Qwen, or BOTH loaded LM Studio models
 * for structured Life Planner JSON based on her current mood and activity type.
 */
async function queryLmStudioJson(params: {
  systemPrompt: string;
  userPrompt: string;
  taskKind: AiGenTaskKind;
  mood: string;
}): Promise<{
  json: Record<string, unknown>;
  modelUsed: string;
  choiceMode: 'gemma' | 'qwen' | 'dual';
  choiceReason: string;
} | null> {
  const res = await queryDualLmStudioJson({
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    taskKind: params.taskKind,
    mood: params.mood,
    temperature: 0.84,
    maxTokens: 340,
  });
  if (!res) return null;
  return {
    json: res.json,
    modelUsed: res.modelLabel,
    choiceMode: res.choiceMode,
    choiceReason: res.choiceReason,
  };
}

function normalizeFoodVisual(raw: unknown, prompt: string, mood: string): FoodVisualId {
  if (typeof raw === 'string' && VALID_FOODS.includes(raw.trim().toLowerCase() as FoodVisualId)) {
    return raw.trim().toLowerCase() as FoodVisualId;
  }
  const hay = `${String(raw || '')} ${prompt}`.toLowerCase();
  if (/ramen|noodle|udon|soba|soup|spicy/.test(hay)) return 'ramen';
  if (/cake|shortcake|dessert|pastry|pie|sweet/.test(hay)) return 'cake';
  if (/sushi|sashimi|salmon|maki|roll/.test(hay)) return 'sushi';
  if (/pancake|waffle|breakfast|toast|brunch/.test(hay)) return 'pancakes';
  if (/curry|katsu|stew/.test(hay)) return 'curry';
  if (/bento|lunch|rice|onigiri/.test(hay)) return 'bento';
  if (/pasta|spaghetti|italian|napolitan/.test(hay)) return 'pasta';
  if (/matcha|tea|dango|mochi|wagashi|macaron/.test(hay)) return 'tea_sweets';
  if (/ice.?cream|parfait|sundae|gelato|boba/.test(hay)) return 'ice_cream';
  if (/burger|fries|sandwich|cafe/.test(hay)) return 'burger';

  // Mood-driven craving default
  if (mood === 'Annoyed' || mood === 'Pouty') return 'ramen';
  if (mood === 'Warm' || mood === 'Shy' || mood === 'Flustered') return 'cake';
  if (mood === 'Proud' || mood === 'Amused') return 'sushi';
  return 'pancakes';
}

function normalizeHobbyKind(raw: unknown, prompt: string, mood: string): HobbyKindId {
  if (typeof raw === 'string' && VALID_HOBBIES.includes(raw.trim().toLowerCase() as HobbyKindId)) {
    return raw.trim().toLowerCase() as HobbyKindId;
  }
  const hay = `${String(raw || '')} ${prompt}`.toLowerCase();
  if (/paint|draw|sketch|art|canvas|easel/.test(hay)) return 'painting';
  if (/music|piano|keyboard|synth|song|compose|sing/.test(hay)) return 'music_keyboard';
  if (/read|book|manga|novel|study/.test(hay)) return 'reading';
  if (/game|gaming|stream|pc|play|rpg/.test(hay)) return 'gaming';
  if (/bake|baking|cook|cupcake|cookie|kitchen/.test(hay)) return 'baking';
  if (/photo|camera|pic|snap/.test(hay)) return 'photography';
  if (/yoga|stretch|workout|exercise|meditat/.test(hay)) return 'yoga';
  if (/tooth|brush|dental|paste|mint/.test(hay)) return 'brushing_teeth';
  if (/towel|dry|dryer/.test(hay)) return 'towel_dry';
  if (/shower|shampoo|soap|wash|bath/.test(hay)) return 'showering';
  if (/study|homework|exam|class|school|college|note|pen|paper|math|lecture/.test(hay)) return 'studying';
  if (/journal|diary|scrapbook|write|planner/.test(hay)) return 'journaling';

  if (mood === 'Proud' || mood === 'Amused') return 'music_keyboard';
  if (mood === 'Warm' || mood === 'Shy') return 'painting';
  if (mood === 'Deadpan') return 'reading';
  return 'gaming';
}

function normalizeDestinationKind(raw: unknown, prompt: string): Exclude<DestinationKindId, 'none'> {
  if (
    typeof raw === 'string' &&
    VALID_DESTINATIONS.includes(raw.trim().toLowerCase() as Exclude<DestinationKindId, 'none'>)
  ) {
    return raw.trim().toLowerCase() as Exclude<DestinationKindId, 'none'>;
  }
  const hay = `${String(raw || '')} ${prompt}`.toLowerCase();
  if (/mall|shop|boutique|store|fashion|clothes/.test(hay)) return 'shopping_mall';
  if (/beach|ocean|sea|island|tropical|summer|resort|swim|vacation|hawaii|okinawa/.test(hay)) {
    return 'tropical_beach';
  }
  if (/onsen|hot.?spring|mountain|ryokan|kyoto|spa|bath/.test(hay)) return 'mountain_onsen';
  if (/park|ferris|carnival|festival|amusement|disney|date/.test(hay)) return 'amusement_park';
  if (/bath|shower|sink|washroom|toothbrush|towel/.test(hay)) return 'bathroom_spa';
  if (/college|university|campus|lecture|library/.test(hay)) return 'college_campus';
  if (/high.?school|school|classroom|academy|chalkboard|study/.test(hay)) return 'highschool_classroom';
  if (/kitchen|dining|home|cook|eat/.test(hay)) return 'home_kitchen';
  return 'vacation_cafe';
}

/**
 * Lets LM Studio think of a realistic meal/craving depending on her current mood, hunger & time of day,
 * then builds a 3D dining table, chair, kitchen & food setup!
 */
export async function planAiMoodFood(params: {
  persona: Persona;
  prompt?: string;
  withKitchenCounter?: boolean;
}): Promise<PlannedFoodResult> {
  const { persona, prompt = '', withKitchenCounter = true } = params;
  const circadian = getCircadianContext();
  const fallbackVisual = normalizeFoodVisual('', prompt, persona.mood);
  const fallbackMeta = FOOD_VISUAL_META[fallbackVisual];

  const systemPrompt = `You are a 3D Anime Virtual Idol deciding what food & drink you are craving right now based on your mood, hunger, and time of day.
Return ONLY valid raw JSON (no markdown, no explanation):
{
  "dishName": "Appetizing 2-4 word dish name",
  "drinkName": "Matching drink name",
  "foodVisual": "ramen|cake|sushi|pancakes|curry|bento|pasta|tea_sweets|ice_cream|burger",
  "accentHex": "#RRGGBB",
  "moodReason": "One short in-character sentence explaining why you want to eat this right now"
}`;

  const userPrompt = `Character: ${persona.name} (${persona.title})
Current Mood: ${persona.mood} (${persona.brain?.nuancedFeeling || 'Calm'})
Hunger: ${Math.round(persona.brain?.hunger ?? 50)}%
Time of Day: ${circadian.clockText} (${circadian.phaseLabel})
User request / craving hint: ${prompt.trim() || 'Think of whatever food fits your mood and time of day right now!'}
Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'dining',
    mood: persona.mood,
  });
  if (res?.json) {
    const foodVisual = normalizeFoodVisual(res.json.foodVisual, prompt, persona.mood);
    const meta = FOOD_VISUAL_META[foodVisual];
    return {
      dining: {
        dishName:
          typeof res.json.dishName === 'string' && res.json.dishName.trim()
            ? res.json.dishName.trim().slice(0, 44)
            : meta.label,
        drinkName:
          typeof res.json.drinkName === 'string' && res.json.drinkName.trim()
            ? res.json.drinkName.trim().slice(0, 34)
            : meta.defaultDrink,
        foodVisual,
        accentHex: cleanHex(res.json.accentHex, persona.accentColor),
        moodReason:
          typeof res.json.moodReason === 'string' && res.json.moodReason.trim()
            ? res.json.moodReason.trim().slice(0, 140)
            : `Feeling ${persona.mood.toLowerCase()} — ${meta.label.toLowerCase()} hits the spot right now.`,
        withKitchenCounter,
      },
      source: 'lm-studio',
      modelUsed: res.modelUsed,
    };
  }

  return {
    dining: {
      dishName: prompt.trim() ? prompt.trim().slice(0, 38) : fallbackMeta.label,
      drinkName: fallbackMeta.defaultDrink,
      foodVisual: fallbackVisual,
      accentHex: persona.accentColor,
      moodReason: `In a ${persona.mood.toLowerCase()} mood for ${fallbackMeta.label.toLowerCase()} at the dining table!`,
      withKitchenCounter,
    },
    source: 'offline-planner',
  };
}

/**
 * Lets LM Studio invent a hobby or activity the character wants to do right now,
 * mapped to a live 3D hobby station on stage!
 */
export async function planAiHobby(params: {
  persona: Persona;
  prompt?: string;
}): Promise<PlannedHobbyResult> {
  const { persona, prompt = '' } = params;
  const circadian = getCircadianContext();
  const fallbackKind = normalizeHobbyKind('', prompt, persona.mood);
  const fallbackMeta = HOBBY_KIND_META[fallbackKind];

  const systemPrompt = `You are a 3D Anime Virtual Idol choosing a fun hobby or personal activity you genuinely feel like doing right now.
Return ONLY valid raw JSON:
{
  "hobbyName": "Creative 2-4 word hobby activity title",
  "hobbyKind": "painting|music_keyboard|reading|gaming|baking|photography|yoga|journaling",
  "accentHex": "#RRGGBB",
  "description": "One short in-character sentence about what you are creating or doing"
}`;

  const userPrompt = `Character: ${persona.name} (${persona.title})
Personality: ${persona.traits}
Current Mood: ${persona.mood}, Boredom: ${Math.round(persona.brain?.boredom ?? 40)}%, Energy: ${Math.round(persona.brain?.energy ?? 75)}%
Time of Day: ${circadian.clockText} (${circadian.phaseLabel})
Requested hobby / hint: ${prompt.trim() || 'Choose a hobby or activity you feel excited to do right now!'}
Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'hobby',
    mood: persona.mood,
  });
  if (res?.json) {
    const hobbyKind = normalizeHobbyKind(res.json.hobbyKind, prompt, persona.mood);
    const meta = HOBBY_KIND_META[hobbyKind];
    return {
      hobby: {
        hobbyName:
          typeof res.json.hobbyName === 'string' && res.json.hobbyName.trim()
            ? res.json.hobbyName.trim().slice(0, 44)
            : meta.label,
        hobbyKind,
        accentHex: cleanHex(res.json.accentHex, persona.accentColor),
        description:
          typeof res.json.description === 'string' && res.json.description.trim()
            ? res.json.description.trim().slice(0, 140)
            : meta.summary,
        recommendedPosture: meta.posture,
      },
      source: 'lm-studio',
      modelUsed: res.modelUsed,
    };
  }

  return {
    hobby: {
      hobbyName: prompt.trim() ? prompt.trim().slice(0, 38) : fallbackMeta.label,
      hobbyKind: fallbackKind,
      accentHex: persona.accentColor,
      description: fallbackMeta.summary,
      recommendedPosture: fallbackMeta.posture,
    },
    source: 'offline-planner',
  };
}

/**
 * Lets LM Studio plan a real-world trip / scenery change (shopping mall, tropical beach,
 * vacation terrace cafe, mountain onsen, amusement park, home kitchen) + matching outfit prompt!
 */
export async function planAiDestination(params: {
  persona: Persona;
  prompt?: string;
}): Promise<PlannedDestinationResult> {
  const { persona, prompt = '' } = params;
  const circadian = getCircadianContext();
  const fallbackKind = normalizeDestinationKind('', prompt);
  const fallbackMeta = DESTINATION_KIND_META[fallbackKind];

  const systemPrompt = `You are a 3D Anime Virtual Idol choosing a real-world place, shopping trip, or vacation destination to visit right now.
Return ONLY valid raw JSON:
{
  "placeName": "Vibrant 2-5 word destination name (e.g. 'Shibuya Boutique Mall', 'Okinawa Sunset Beach', 'Hakone Starry Onsen')",
  "destinationKind": "home_kitchen|shopping_mall|tropical_beach|vacation_cafe|mountain_onsen|amusement_park",
  "accentHex": "#RRGGBB",
  "skyTopHex": "#RRGGBB",
  "skyBottomHex": "#RRGGBB",
  "groundHex": "#RRGGBB",
  "description": "One short exciting sentence about why you want to go here",
  "suggestedOutfitPrompt": "Short outfit idea matching this destination (e.g. 'breezy pastel beach resort sundress' or 'trendy mall shopping streetwear')"
}`;

  const userPrompt = `Character: ${persona.name} (${persona.title})
Mood: ${persona.mood}, Time: ${circadian.clockText} (${circadian.phaseLabel})
Destination idea / request: ${prompt.trim() || 'Pick an exciting place, shopping mall, beach, or vacation spot you feel like visiting right now!'}
Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'travel',
    mood: persona.mood,
  });
  if (res?.json) {
    const destinationKind = normalizeDestinationKind(res.json.destinationKind, prompt);
    const meta = DESTINATION_KIND_META[destinationKind];
    return {
      destination: {
        placeName:
          typeof res.json.placeName === 'string' && res.json.placeName.trim()
            ? res.json.placeName.trim().slice(0, 48)
            : meta.label,
        destinationKind,
        accentHex: cleanHex(res.json.accentHex, meta.accentHex),
        skyTopHex: cleanHex(res.json.skyTopHex, meta.skyTopHex),
        skyBottomHex: cleanHex(res.json.skyBottomHex, meta.skyBottomHex),
        groundHex: cleanHex(res.json.groundHex, meta.groundHex),
        description:
          typeof res.json.description === 'string' && res.json.description.trim()
            ? res.json.description.trim().slice(0, 140)
            : meta.summary,
      },
      suggestedOutfitPrompt:
        typeof res.json.suggestedOutfitPrompt === 'string' &&
        res.json.suggestedOutfitPrompt.trim()
          ? res.json.suggestedOutfitPrompt.trim().slice(0, 100)
          : null,
      source: 'lm-studio',
      modelUsed: res.modelUsed,
    };
  }

  return {
    destination: {
      placeName: prompt.trim() ? prompt.trim().slice(0, 42) : fallbackMeta.label,
      destinationKind: fallbackKind,
      accentHex: fallbackMeta.accentHex,
      skyTopHex: fallbackMeta.skyTopHex,
      skyBottomHex: fallbackMeta.skyBottomHex,
      groundHex: fallbackMeta.groundHex,
      description: fallbackMeta.summary,
    },
    suggestedOutfitPrompt:
      fallbackKind === 'tropical_beach'
        ? 'Stylish anime one-piece tropical beach swimsuit swimwear with pastel pareo wrap'
        : fallbackKind === 'shopping_mall'
        ? 'Trendy stylish mall shopping streetwear bomber jacket and belted shorts'
        : fallbackKind === 'mountain_onsen'
        ? 'Traditional floral Japanese kimono yukata with wide obi sash for mountain onsen'
        : fallbackKind === 'vacation_cafe'
        ? 'Airy sleeveless summer sundress with ribbon sash for terrace cafe'
        : fallbackKind === 'amusement_park'
        ? 'Playful cropped streetwear jacket and shorts for amusement park'
        : null,
    source: 'offline-planner',
  };
}

/**
 * Lets the AI character follow her own spontaneous free will based on her live MOOD, needs & clock:
 * LM Studio decides whether she wants to cook/eat a mood craving, start a hobby, study in school,
 * take a censored shower/brush teeth, or travel somewhere!
 */
export async function planAiSpontaneousDesire(params: {
  persona: Persona;
  currentScene?: ActiveLifeScene;
}): Promise<SpontaneousDesireResult> {
  const { persona, currentScene } = params;
  const circadian = getCircadianContext();
  const hunger = Math.round(persona.brain?.hunger ?? 45);
  const boredom = Math.round(persona.brain?.boredom ?? 45);
  const comfort = Math.round(persona.brain?.comfort ?? 75);
  const mood = persona.mood;

  // Identify current active category so she naturally transitions to something fresh when her mood shifts
  const activeCategory: 'dining' | 'hobby' | 'study' | 'hygiene' | 'gym_sport' | 'stretch' | 'travel' | 'none' =
    currentScene?.dining
      ? 'dining'
      : currentScene?.hobby?.hobbyKind === 'studying'
      ? 'study'
      : currentScene?.hobby?.hobbyKind === 'stretching'
      ? 'stretch'
      : currentScene?.hobby?.hobbyKind === 'showering' ||
        currentScene?.hobby?.hobbyKind === 'towel_dry' ||
        currentScene?.hobby?.hobbyKind === 'brushing_teeth'
      ? 'hygiene'
      : currentScene?.hobby?.hobbyKind === 'gym_weights' ||
        currentScene?.hobby?.hobbyKind === 'gym_treadmill' ||
        currentScene?.hobby?.hobbyKind === 'sports_basketball' ||
        currentScene?.hobby?.hobbyKind === 'sports_tennis'
      ? 'gym_sport'
      : currentScene?.hobby
      ? 'hobby'
      : currentScene?.destination && currentScene.destination.destinationKind !== 'none'
      ? 'travel'
      : 'none';

  const moodGuidanceMap: Record<string, string> = {
    Pouty: 'Feeling pouty — craves comfort food/sweets at the dining table OR a relaxing warm shower/towel-dry to cheer up.',
    Annoyed: 'Feeling annoyed — wants spicy ramen/comfort food OR an energetic gym dumbbell/treadmill workout to blow off steam OR solo gaming.',
    Warm: 'Feeling warm & happy — loves cozy creative hobbies (painting, baking, journaling), playful tennis/basketball outdoors, cafe treats, or a sunny beach trip.',
    Shy: 'Feeling shy & quiet — prefers peaceful pen-and-paper studying, reading manga, journaling, or a quiet mountain onsen.',
    Flustered: 'Feeling flustered — wants a quick refreshing wash/brush teeth, sweet strawberry cake, or light cardio jog to clear her head.',
    Proud: 'Feeling proud & energetic — wants to crush a fitness gym dumbbell/cardio session, play competitive tennis/basketball, visit a shopping mall, or perform music.',
    Amused: 'Feeling playful & amused — loves fun sports (basketball shootaround, tennis rally), amusement park trips, gaming, photography, or gourmet treats.',
    Deadpan: 'Feeling calm & focused — ideal for steady treadmill cardio, high school/college studying with pen & paper, quiet reading, or a simple savory meal.',
  };
  const moodHint = moodGuidanceMap[mood] || moodGuidanceMap.Deadpan;

  const systemPrompt = `You are a 3D Anime Virtual Idol living your own daily life automatically based on your MOOD, physical needs, energy, and real-world time of day.
Choose one of:
- "dining" (craving mood-based food & eating at a wooden dining table with kitchen)
- "hobby" (doing a creative or fun hobby like painting, synth music, gaming, baking, reading, yoga)
- "study" (going to high school or college in school uniform to study with pen & paper)
- "hygiene" (SFW frosted-glass censored shower with shampoo & soap, bath towel dry, or brushing teeth)
- "gym_sport" (changing into athletic sportswear to hit the 3D gym for dumbbells/treadmill cardio OR play basketball/tennis on the sports court!)
- "stretch" (standing up on a stretch mat to smoothly perform a flexible full-body anatomical stretching routine whenever YOU feel stiff, waking up, or cooling down!)
- "travel" (visiting a shopping mall, tropical beach, vacation cafe, mountain onsen, or amusement park)
- "roam" (standing up, stretching your legs, and freely auto-roaming / walking around the stage or desktop)
Return ONLY valid raw JSON:
{
  "choice": "dining|hobby|study|hygiene|gym_sport|stretch|travel|roam",
  "prompt": "Specific dish, hobby, school subject, bath/toothbrush routine, gym workout/sport, anatomical stretch routine, destination, or roaming mood",
  "thought": "Short 1-sentence in-character mood reason"
}`;

  const userPrompt = `Character: ${persona.name}
Current Mood: ${mood} (${moodHint})
Needs: Hunger ${hunger}%, Boredom ${boredom}%, Comfort ${comfort}%, Energy ${Math.round(persona.brain?.energy ?? 75)}%
Time of Day: ${circadian.clockText} (${circadian.phaseLabel})
Currently doing: ${activeCategory} (prefer switching to a fresh activity if appropriate!)
Output ONLY the JSON object.`;

  const pickMoodFallback = (): 'dining' | 'hobby' | 'travel' | 'study' | 'hygiene' | 'gym_sport' | 'stretch' | 'roam' => {
    const candidates: ('dining' | 'hobby' | 'travel' | 'study' | 'hygiene' | 'gym_sport' | 'stretch' | 'roam')[] = [];
    const energy = Math.round(persona.brain?.energy ?? 75);
    if (hunger >= 58) candidates.push('dining');
    if (comfort <= 56 || activeCategory === 'gym_sport' || activeCategory === 'study') {
      candidates.push('stretch');
    }
    if (comfort <= 45 || circadian.phase === 'late_night') candidates.push('hygiene');
    if (energy >= 62 && circadian.phase !== 'late_night' && (mood === 'Proud' || mood === 'Amused' || mood === 'Annoyed')) {
      candidates.push('gym_sport');
    }
    if (boredom >= 62 && energy >= 55) candidates.push('roam');

    if (mood === 'Pouty' || mood === 'Annoyed') {
      candidates.push('gym_sport', 'stretch', 'dining', 'roam', 'hygiene', 'hobby');
    } else if (mood === 'Proud' || mood === 'Amused') {
      candidates.push('gym_sport', 'stretch', 'roam', 'travel', 'hobby', 'dining');
    } else if (mood === 'Deadpan' || mood === 'Shy') {
      candidates.push('stretch', 'study', 'hobby', 'gym_sport', 'hygiene');
    } else if (mood === 'Flustered') {
      candidates.push('hygiene', 'stretch', 'dining', 'study');
    } else {
      // Warm
      candidates.push('stretch', 'hobby', 'gym_sport', 'roam', 'travel', 'dining');
    }

    if (circadian.phase === 'morning') candidates.unshift('stretch');
    if (circadian.phase === 'morning') candidates.push('gym_sport', 'study', 'hygiene');
    const fresh = candidates.find((c) => c !== activeCategory);
    return fresh || candidates[0] || 'hobby';
  };

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'whim',
    mood: persona.mood,
  });
  if (res?.json) {
    const rawChoice = String(res.json.choice || '').toLowerCase();
    const choice: 'dining' | 'hobby' | 'travel' | 'study' | 'hygiene' | 'gym_sport' | 'stretch' | 'roam' =
      rawChoice === 'dining' ||
      rawChoice === 'hobby' ||
      rawChoice === 'travel' ||
      rawChoice === 'study' ||
      rawChoice === 'hygiene' ||
      rawChoice === 'gym_sport' ||
      rawChoice === 'stretch' ||
      rawChoice === 'roam'
        ? rawChoice
        : /stretch|flex|limber|warm.?up|cool.?down/.test(rawChoice)
        ? 'stretch'
        : /gym|sport|workout|dumbbell|treadmill|tennis|basketball/.test(rawChoice)
        ? 'gym_sport'
        : pickMoodFallback();
    return {
      choice,
      prompt: typeof res.json.prompt === 'string' ? res.json.prompt.trim() : '',
      thought:
        typeof res.json.thought === 'string' && res.json.thought.trim()
          ? res.json.thought.trim()
          : `Feeling ${mood.toLowerCase()} — I feel like doing this right now!`,
      source: 'lm-studio',
      modelUsed: res.modelUsed,
    };
  }

  const choice = pickMoodFallback();
  return {
    choice,
    prompt: '',
    thought:
      choice === 'dining'
        ? `Feeling ${mood.toLowerCase()} — time to cook and eat something comforting at the table!`
        : choice === 'hygiene'
        ? `Feeling ${mood.toLowerCase()} — time to freshen up in the bathroom!`
        : choice === 'study'
        ? `In a focused ${mood.toLowerCase()} mood — putting on my school uniform to study with pen & paper!`
        : choice === 'gym_sport'
        ? `Feeling ${mood.toLowerCase()} and energized — changing into my sportswear for a gym & sports session!`
        : choice === 'stretch'
        ? `My shoulders and legs could use a nice smooth flexible stretch right now!`
        : choice === 'travel'
        ? `Feeling ${mood.toLowerCase()} — let's head out for a change of scenery!`
        : choice === 'roam'
        ? `Feeling ${mood.toLowerCase()} — I want to stand up, stretch my legs, and roam around!`
        : `Feeling ${mood.toLowerCase()} — perfect time to enjoy a hobby!`,
    source: 'offline-planner',
  };
}

/**
 * Lets the AI character decide on her own (using Gemma / Qwen / Both or live mood/needs)
 * whether she feels like standing up to Auto-Roam around OR staying still / sitting to relax!
 */
export async function planAiAutoRoamDecision(params: {
  persona: Persona;
  isCurrentlyRoaming: boolean;
  hasActiveStation: boolean;
}): Promise<PlannedAutoRoamDecision> {
  const { persona, isCurrentlyRoaming, hasActiveStation } = params;
  const energy = Math.round(persona.brain?.energy ?? 75);
  const boredom = Math.round(persona.brain?.boredom ?? 40);
  const sleepiness = Math.round(persona.brain?.sleepiness ?? 20);
  const curiosity = Math.round(persona.brain?.curiosity ?? 55);
  const mood = persona.mood;

  const heuristicRoam = (): PlannedAutoRoamDecision => {
    if (sleepiness >= 64 || energy <= 32 || persona.brain?.isSleeping) {
      return {
        wantToRoam: false,
        reason: `Feeling sleepy (${energy}% energy) — I'd rather sit still and rest.`,
        source: 'offline-planner',
      };
    }
    const urgeScore =
      (boredom - 35) * 0.7 +
      (energy - 45) * 0.5 +
      (curiosity - 45) * 0.45 +
      (mood === 'Proud' || mood === 'Amused' || mood === 'Warm' ? 18 : 0) +
      (mood === 'Shy' || mood === 'Deadpan' ? -14 : 0) +
      (hasActiveStation ? -16 : 12);
    const wantToRoam = urgeScore >= 14;
    return {
      wantToRoam,
      reason: wantToRoam
        ? `Feeling ${mood.toLowerCase()} & curious — I feel like getting up to stroll around!`
        : `Feeling ${mood.toLowerCase()} — I'm happy staying relaxed in my spot right now.`,
      source: 'offline-planner',
    };
  };

  const systemPrompt = `You are a 3D Anime Virtual Idol deciding on your own whether you currently want to stand up and Auto-Roam (walk around, peek, stretch) OR stay still / sit comfortably.
Return ONLY valid raw JSON:
{
  "wantToRoam": true,
  "reason": "One short natural in-character sentence explaining why you want to roam or stay put"
}`;

  const userPrompt = `Character: ${persona.name}
Mood: ${mood}, Energy: ${energy}%, Boredom: ${boredom}%, Curiosity: ${curiosity}%, Sleepiness: ${sleepiness}%
Currently Auto-Roaming: ${isCurrentlyRoaming ? 'yes' : 'no'}
Currently busy at a table/hobby station: ${hasActiveStation ? 'yes' : 'no'}
Decide freely whether you feel like roaming around right now! Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'whim',
    mood,
  });
  if (res?.json && typeof res.json.wantToRoam === 'boolean') {
    const wantToRoam = res.json.wantToRoam;
    const reason =
      typeof res.json.reason === 'string' && res.json.reason.trim()
        ? res.json.reason.trim().slice(0, 120)
        : wantToRoam
        ? 'I feel like walking around and stretching my legs!'
        : 'I feel like staying cozy right here for now.';
    return {
      wantToRoam,
      reason,
      source: 'lm-studio',
      modelUsed: res.modelUsed,
    };
  }

  return heuristicRoam();
}

/**
 * Lets LM Studio decide a wholesome, tastefully censored bathroom care routine:
 * warm shower (frosted glass + steam + shampoo + soap), towel drying, or brushing teeth!
 */
export async function planAiHygieneRoutine(params: {
  persona: Persona;
  routine?: HygieneRoutineId;
  hint?: string;
}): Promise<PlannedHygieneResult> {
  const { persona, routine, hint = '' } = params;
  const circadian = getCircadianContext();

  const inferRoutine = (raw: string): HygieneRoutineId => {
    const s = raw.toLowerCase();
    if (/tooth|brush|dental|mint|paste/.test(s)) return 'brush_teeth';
    if (/towel|dry|dryer|robe/.test(s)) return 'towel_dry';
    if (/shower|shampoo|soap|wash|bath/.test(s)) return 'shower';
    return circadian.phase === 'morning' ? 'brush_teeth' : 'shower';
  };

  const buildResult = (
    resolvedRoutine: HygieneRoutineId,
    scentName: string,
    note: string,
    source: LifeEngineSource,
    modelUsed?: string
  ): PlannedHygieneResult => {
    const destMeta = DESTINATION_KIND_META.bathroom_spa;
    const hobbyKind: HobbyKindId =
      resolvedRoutine === 'shower'
        ? 'showering'
        : resolvedRoutine === 'towel_dry'
        ? 'towel_dry'
        : 'brushing_teeth';

    const hobbyLabel =
      resolvedRoutine === 'shower'
        ? `Censored Shower · ${scentName}`
        : resolvedRoutine === 'towel_dry'
        ? `Towel Dry · ${scentName}`
        : `Brushing Teeth · ${scentName}`;

    return {
      routine: resolvedRoutine,
      scentName,
      note,
      hobby: {
        hobbyName: hobbyLabel,
        hobbyKind,
        accentHex: resolvedRoutine === 'brush_teeth' ? '#22d3ee' : '#f472b6',
        description: note,
        recommendedPosture: 'standing',
      },
      destination: {
        placeName:
          resolvedRoutine === 'shower'
            ? 'Steamy Bathroom (Frosted Glass Censored)'
            : 'Bright Bathroom Vanity & Sink',
        destinationKind: 'bathroom_spa',
        accentHex: destMeta.accentHex,
        description: destMeta.summary,
        skyTopHex: destMeta.skyTopHex,
        skyBottomHex: destMeta.skyBottomHex,
        groundHex: destMeta.groundHex,
      },
      wearHeadTowel: resolvedRoutine === 'shower' || resolvedRoutine === 'towel_dry',
      bathOutfitPrompt:
        resolvedRoutine === 'brush_teeth'
          ? 'Soft pastel cozy pajama shirt and lounge pants for brushing teeth at the bathroom sink'
          : `Fluffy pastel bath towel wrap bath cloth for ${resolvedRoutine === 'shower' ? 'warm censored shower' : 'drying off after shower'} with ${scentName}`,
      afterOutfitPrompt:
        resolvedRoutine === 'towel_dry'
          ? 'Soft pastel fresh after-shower cozy loungewear and sleepwear'
          : null,
      source,
      modelUsed,
    };
  };

  const systemPrompt = `You are a 3D Anime Virtual Idol deciding your wholesome daily bathroom care routine (SFW censored shower with shampoo & soap, drying off with a fluffy towel, or brushing your teeth at the sink).
Return ONLY valid raw JSON:
{
  "routine": "shower|towel_dry|brush_teeth",
  "scentName": "2-4 word scent or product name (e.g. 'Sakura Shampoo & Soap', 'Fluffy Warm Towel', 'Fresh Mint Toothpaste')",
  "note": "One cute, wholesome in-character sentence (mention frosted glass/steam privacy if showering!)"
}`;

  const userPrompt = `Character: ${persona.name} (${persona.title})
Preferred routine: ${routine || 'choose shower, towel_dry, or brush_teeth naturally for the time of day'}
Current Mood: ${persona.mood}, Time: ${circadian.clockText} (${circadian.phaseLabel})
Hint / request: ${hint.trim() || 'Choose your natural bath/shower/towel/toothbrush care routine right now!'}
Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'bath',
    mood: persona.mood,
  });
  if (res?.json) {
    const resolvedRoutine: HygieneRoutineId =
      routine || inferRoutine(String(res.json.routine || hint));
    const defaultScent =
      resolvedRoutine === 'shower'
        ? 'Sakura Shampoo & Soap'
        : resolvedRoutine === 'towel_dry'
        ? 'Fluffy Pastel Towel'
        : 'Fresh Mint Toothpaste';
    const scentName =
      typeof res.json.scentName === 'string' && res.json.scentName.trim()
        ? res.json.scentName.trim().slice(0, 38)
        : defaultScent;
    const note =
      typeof res.json.note === 'string' && res.json.note.trim()
        ? res.json.note.trim().slice(0, 140)
        : resolvedRoutine === 'shower'
        ? `Taking a warm censored shower with ${scentName} behind the frosted glass—no peeking!`
        : resolvedRoutine === 'towel_dry'
        ? `Drying off with a fluffy bath towel and feeling super fresh!`
        : `Brushing my teeth cleanly with ${scentName} at the vanity sink!`;
    return buildResult(resolvedRoutine, scentName, note, 'lm-studio', res.modelUsed);
  }

  const fallbackRoutine = routine || inferRoutine(hint);
  const fallbackScent =
    fallbackRoutine === 'shower'
      ? 'Sakura Shampoo & Honey Soap'
      : fallbackRoutine === 'towel_dry'
      ? 'Fluffy Warm Bath Towel'
      : 'Fresh Mint Toothpaste';
  const fallbackNote =
    fallbackRoutine === 'shower'
      ? 'Washing up behind the frosted shower glass with sakura shampoo, soap, and warm steam!'
      : fallbackRoutine === 'towel_dry'
      ? 'Wrapping up in a warm bath towel and drying my hair!'
      : 'Brushing my teeth with fresh mint toothpaste at the bathroom mirror!';
  return buildResult(fallbackRoutine, fallbackScent, fallbackNote, 'offline-planner');
}

export interface PlannedChairResult {
  chair: ActiveAiChair;
  source: LifeEngineSource;
  modelUsed?: string;
  choiceMode?: 'gemma' | 'qwen' | 'dual';
  choiceReason?: string;
}

const VALID_CHAIR_STYLES: AiChairStyleId[] = [
  'wooden_dining',
  'gaming_chair',
  'velvet_armchair',
  'cafe_bistro',
  'school_chair',
  'princess_throne',
];

function normalizeChairStyle(
  raw: unknown,
  hint: string,
  mood: string,
  previousChairStyle?: AiChairStyleId | null
): AiChairStyleId {
  if (
    typeof raw === 'string' &&
    VALID_CHAIR_STYLES.includes(raw.trim().toLowerCase() as AiChairStyleId)
  ) {
    return raw.trim().toLowerCase() as AiChairStyleId;
  }
  const hay = `${String(raw || '')} ${hint}`.toLowerCase();
  if (/gaming|pc|stream/.test(hay)) return 'gaming_chair';
  if (/school|study|college|class/.test(hay)) return 'school_chair';
  if (/dining|eat|food|kitchen|ramen|tea|cake/.test(hay)) return 'wooden_dining';
  if (/cafe|bistro|coffee|paris/.test(hay)) return 'cafe_bistro';
  if (/throne|royal|princess|idol|gothic/.test(hay)) return 'princess_throne';
  if (/velvet|armchair|lounge/.test(hay)) return 'velvet_armchair';

  // Varied mood-weighted selection when freely choosing a chair
  const moodPools: Record<string, AiChairStyleId[]> = {
    Proud: ['princess_throne', 'gaming_chair', 'velvet_armchair'],
    Amused: ['gaming_chair', 'cafe_bistro', 'princess_throne'],
    Warm: ['velvet_armchair', 'cafe_bistro', 'wooden_dining'],
    Shy: ['velvet_armchair', 'wooden_dining', 'school_chair'],
    Deadpan: ['cafe_bistro', 'gaming_chair', 'school_chair'],
    Pouty: ['princess_throne', 'velvet_armchair', 'cafe_bistro'],
    Annoyed: ['gaming_chair', 'princess_throne', 'wooden_dining'],
    Flustered: ['cafe_bistro', 'velvet_armchair', 'wooden_dining'],
  };
  const pool = (moodPools[mood] || VALID_CHAIR_STYLES).filter((s) => s !== previousChairStyle);
  const pickPool = pool.length > 0 ? pool : VALID_CHAIR_STYLES;
  return pickPool[Math.floor(Math.random() * pickPool.length)];
}

/**
 * Lets the AI character freely choose BOTH which chair style/design she wants right now
 * AND which local AI model (Gemma, Qwen, or Both together) she wants to use to generate it!
 */
export async function planAiChair(params: {
  persona: Persona;
  contextHint?: string;
  previousChairStyle?: AiChairStyleId | null;
}): Promise<PlannedChairResult> {
  const { persona, contextHint = '', previousChairStyle = null } = params;
  const fallbackStyle = normalizeChairStyle('', contextHint, persona.mood, previousChairStyle);
  const fallbackMeta = AI_CHAIR_STYLE_META[fallbackStyle];

  const systemPrompt = `You are a 3D Anime Virtual Idol freely choosing and designing whatever 3D chair YOU personally want to sit on right now.
You have complete freedom to pick ANY of these 6 chair styles based on your mood and personal taste:
- "princess_throne" (ornate royal velvet idol throne with gilded trim)
- "gaming_chair" (ergonomic high-back RGB/racing esports chair with headrest)
- "velvet_armchair" (plush lounge armchair with padded armrests)
- "cafe_bistro" (stylish Parisian curved-back bistro chair)
- "wooden_dining" (warm classic handcrafted wooden chair)
- "school_chair" (neat anime classroom/campus chair)

Return ONLY valid raw JSON:
{
  "chairStyle": "wooden_dining|gaming_chair|velvet_armchair|cafe_bistro|school_chair|princess_throne",
  "chairName": "2-4 word creative chair name you invented",
  "frameHex": "#RRGGBB",
  "cushionHex": "#RRGGBB",
  "accentHex": "#RRGGBB",
  "reason": "One short in-character sentence explaining why you chose this chair"
}`;

  const userPrompt = `Character: ${persona.name} (${persona.title})
Personality: ${persona.traits}
Current Mood: ${persona.mood}, Favorite Accent: ${persona.accentColor}
Sitting Context: ${contextHint || 'Taking a seat — pick whichever chair style you genuinely feel like sitting on right now!'}
${previousChairStyle ? `Previous chair style used: ${previousChairStyle} (feel free to pick a different style if you want a fresh vibe!)` : ''}
Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'chair',
    mood: persona.mood,
  });
  if (res?.json) {
    const style = normalizeChairStyle(
      res.json.chairStyle,
      contextHint,
      persona.mood,
      previousChairStyle
    );
    const meta = AI_CHAIR_STYLE_META[style];
    return {
      chair: {
        chairStyle: style,
        chairName:
          typeof res.json.chairName === 'string' && res.json.chairName.trim()
            ? res.json.chairName.trim().slice(0, 40)
            : meta.label,
        frameHex: cleanHex(res.json.frameHex, meta.frameHex),
        cushionHex: cleanHex(res.json.cushionHex, meta.cushionHex),
        accentHex: cleanHex(res.json.accentHex, persona.accentColor || meta.accentHex),
        reason:
          typeof res.json.reason === 'string' && res.json.reason.trim()
            ? res.json.reason.trim().slice(0, 140)
            : `Picked a ${meta.label.toLowerCase()} to match my mood!`,
      },
      source: 'lm-studio',
      modelUsed: res.modelUsed,
      choiceMode: res.choiceMode,
      choiceReason: res.choiceReason,
    };
  }

  return {
    chair: {
      chairStyle: fallbackStyle,
      chairName: fallbackMeta.label,
      frameHex: fallbackMeta.frameHex,
      cushionHex: fallbackMeta.cushionHex,
      accentHex: persona.accentColor || fallbackMeta.accentHex,
      reason: `Picked a ${fallbackMeta.label.toLowerCase()} to match my ${persona.mood.toLowerCase()} mood!`,
    },
    source: 'offline-planner',
  };
}

/**
 * Lets LM Studio plan a realistic High School or College study session
 * (school uniform + classroom/campus + student desk + pen & paper notebook!).
 */
export async function planAiSchoolStudy(params: {
  persona: Persona;
  level?: SchoolLevel;
  subjectPrompt?: string;
}): Promise<PlannedSchoolStudyResult> {
  const { persona, level, subjectPrompt = '' } = params;
  const circadian = getCircadianContext();
  const inferredLevel: SchoolLevel =
    level ||
    (/college|university|campus|lecture|major/i.test(subjectPrompt) ? 'college' : 'highschool');

  const buildFromParts = (
    resolvedLevel: SchoolLevel,
    subjectName: string,
    studyNote: string,
    accentHex: string,
    source: LifeEngineSource,
    modelUsed?: string
  ): PlannedSchoolStudyResult => {
    const destKind: Exclude<DestinationKindId, 'none'> =
      resolvedLevel === 'college' ? 'college_campus' : 'highschool_classroom';
    const destMeta = DESTINATION_KIND_META[destKind];
    const uniformPrompt =
      resolvedLevel === 'college'
        ? 'College university preppy student uniform with ivory argyle knit vest, tailored navy plaid skirt, ribbon and loafers'
        : 'Classic Japanese high school uniform with crisp white sailor/blazer shirt, navy pleated plaid skirt, crimson ribbon and loafers';

    return {
      level: resolvedLevel,
      subjectName,
      studyNote,
      hobby: {
        hobbyName: `Studying: ${subjectName}`,
        hobbyKind: 'studying',
        accentHex,
        description: studyNote,
        recommendedPosture: 'seated',
      },
      destination: {
        placeName:
          resolvedLevel === 'college'
            ? `University Campus · ${subjectName}`
            : `High School Classroom · ${subjectName}`,
        destinationKind: destKind,
        accentHex: destMeta.accentHex,
        description: destMeta.summary,
        skyTopHex: destMeta.skyTopHex,
        skyBottomHex: destMeta.skyBottomHex,
        groundHex: destMeta.groundHex,
      },
      uniformPrompt,
      source,
      modelUsed,
    };
  };

  const systemPrompt = `You are a 3D Anime Virtual Idol attending high school or college in your school uniform and studying with pen and paper at your desk.
Return ONLY valid raw JSON:
{
  "level": "highschool|college",
  "subjectName": "2-4 word school/college subject (e.g. 'Calculus Exam Prep', 'Japanese Literature', 'Chemistry Lab Notes')",
  "studyNote": "One short in-character sentence about what you are writing on your paper notebook right now",
  "accentHex": "#RRGGBB"
}`;

  const userPrompt = `Character: ${persona.name} (${persona.title})
Preferred school level: ${level || 'choose highschool or college naturally'}
Current Mood: ${persona.mood}, Time: ${circadian.clockText} (${circadian.phaseLabel})
Subject / request: ${subjectPrompt.trim() || 'Choose a realistic class subject to study with pen and paper right now!'}
Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'study',
    mood: persona.mood,
  });
  if (res?.json) {
    const resolvedLevel: SchoolLevel =
      level ||
      (String(res.json.level || '').toLowerCase() === 'college' ? 'college' : inferredLevel);
    const subjectName =
      typeof res.json.subjectName === 'string' && res.json.subjectName.trim()
        ? res.json.subjectName.trim().slice(0, 42)
        : subjectPrompt.trim().slice(0, 38) || 'Exam Review Notes';
    const studyNote =
      typeof res.json.studyNote === 'string' && res.json.studyNote.trim()
        ? res.json.studyNote.trim().slice(0, 140)
        : `Taking neat handwritten pen-and-paper notes for ${subjectName}.`;
    const accentHex = cleanHex(res.json.accentHex, resolvedLevel === 'college' ? '#0284c7' : '#2563eb');
    return buildFromParts(
      resolvedLevel,
      subjectName,
      studyNote,
      accentHex,
      'lm-studio',
      res.modelUsed
    );
  }

  const fallbackSubject =
    subjectPrompt.trim().slice(0, 38) ||
    (inferredLevel === 'college' ? 'Literature & Music Theory' : 'Mathematics & Kanji Review');
  return buildFromParts(
    inferredLevel,
    fallbackSubject,
    `Sitting at the desk in school uniform writing neat pen-and-paper notes for ${fallbackSubject}.`,
    inferredLevel === 'college' ? '#0284c7' : '#2563eb',
    'offline-planner'
  );
}


/**
 * Lets the AI character freely choose her own Gym or Sports lifestyle session
 * (Dumbbell Strength Training, Treadmill Cardio Jog, Basketball Shootaround, or Tennis Rally)
 * based on her live mood, energy, and time of day via LM Studio!
 */
export async function planAiGymSport(params: {
  persona: Persona;
  hint?: string;
  previousSportKind?: GymSportKindId | null;
}): Promise<PlannedGymSportResult> {
  const { persona, hint = '', previousSportKind = null } = params;
  const circadian = getCircadianContext();
  const validKinds: GymSportKindId[] = [
    'gym_weights',
    'gym_treadmill',
    'sports_basketball',
    'sports_tennis',
  ];

  const inferKind = (raw: string): GymSportKindId => {
    const s = raw.toLowerCase();
    if (/treadmill|run|jog|cardio|sprint/.test(s)) return 'gym_treadmill';
    if (/basketball|hoop|dribble|dunk|shoot/.test(s)) return 'sports_basketball';
    if (/tennis|racket|badminton|volley|rally/.test(s)) return 'sports_tennis';
    if (/weight|dumbbell|lift|curl|strength|press|gym/.test(s)) return 'gym_weights';
    const moodPools: Record<string, GymSportKindId[]> = {
      Proud: ['gym_weights', 'sports_tennis', 'sports_basketball'],
      Amused: ['sports_basketball', 'sports_tennis', 'gym_treadmill'],
      Annoyed: ['gym_weights', 'gym_treadmill', 'sports_tennis'],
      Warm: ['sports_tennis', 'gym_treadmill', 'sports_basketball'],
      Deadpan: ['gym_treadmill', 'gym_weights'],
      Pouty: ['gym_weights', 'sports_basketball'],
      Shy: ['gym_treadmill', 'sports_tennis'],
      Flustered: ['gym_treadmill', 'sports_tennis'],
    };
    const pool = (moodPools[persona.mood] || validKinds).filter((k) => k !== previousSportKind);
    const pick = pool.length > 0 ? pool : validKinds;
    return pick[Math.floor(Math.random() * pick.length)];
  };

  const buildResult = (
    sportKind: GymSportKindId,
    workoutName: string,
    note: string,
    accentHex: string,
    source: LifeEngineSource,
    modelUsed?: string
  ): PlannedGymSportResult => {
    const destKind: Exclude<DestinationKindId, 'none'> =
      sportKind === 'gym_weights' || sportKind === 'gym_treadmill'
        ? 'gym_studio'
        : 'sports_court';
    const destMeta = DESTINATION_KIND_META[destKind];
    const sportOutfitPrompt =
      sportKind === 'sports_tennis'
        ? 'Crisp athletic short-sleeve tennis jersey tee and sleek sport leggings with high ponytail'
        : sportKind === 'sports_basketball'
        ? 'Vibrant sporty short-sleeve basketball jersey tee and athletic leggings with high ponytail'
        : 'Energetic fitness gym short-sleeve athletic tee and high-waist sport leggings with high ponytail';

    return {
      sportKind,
      workoutName,
      note,
      hobby: {
        hobbyName: workoutName,
        hobbyKind: sportKind,
        accentHex,
        description: note,
        recommendedPosture: 'standing',
      },
      destination: {
        placeName:
          destKind === 'gym_studio'
            ? `Fitness Gym Studio · ${workoutName}`
            : `Sunny Sports Court · ${workoutName}`,
        destinationKind: destKind,
        accentHex: destMeta.accentHex,
        description: destMeta.summary,
        skyTopHex: destMeta.skyTopHex,
        skyBottomHex: destMeta.skyBottomHex,
        groundHex: destMeta.groundHex,
      },
      sportOutfitPrompt,
      source,
      modelUsed,
    };
  };

  const systemPrompt = `You are a 3D Anime Virtual Idol choosing your own Gym Workout or Sports activity based on your live mood, energy, and time of day!
Choose whichever of these 4 gym/sports activities YOU personally want right now:
- "gym_weights" (strength training with 3D dumbbells in the fitness gym studio)
- "gym_treadmill" (cardio running / jogging on the 3D treadmill in the fitness gym)
- "sports_basketball" (shooting hoops & dribbling on the 3D basketball court)
- "sports_tennis" (playing an energetic tennis rally with a 3D racket on the sports court)

Return ONLY valid raw JSON:
{
  "sportKind": "gym_weights|gym_treadmill|sports_basketball|sports_tennis",
  "workoutName": "2-4 word energetic workout/sport title (e.g. 'Power Dumbbell Session', 'Sunrise Cardio Run', 'Court Hoops Practice', 'Pro Tennis Rally')",
  "note": "One short in-character sentence about why you feel like doing this workout or sport right now",
  "accentHex": "#RRGGBB"
}`;

  const userPrompt = `Character: ${persona.name} (${persona.title})
Mood: ${persona.mood}, Energy: ${Math.round(persona.brain?.energy ?? 75)}%, Time: ${circadian.clockText} (${circadian.phaseLabel})
${previousSportKind ? `Previous sport: ${previousSportKind} (feel free to pick a fresh one!)` : ''}
${hint.trim() ? `Hint / request: ${hint.trim()}` : 'Freely pick the gym workout or sport you feel like doing right now!'}
Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'hobby',
    mood: persona.mood,
  });

  if (res?.json) {
    const rawKind = String(res.json.sportKind || '').trim().toLowerCase();
    const resolvedKind: GymSportKindId = validKinds.includes(rawKind as GymSportKindId)
      ? (rawKind as GymSportKindId)
      : inferKind(`${rawKind} ${String(res.json.workoutName || '')} ${hint}`);
    const defaultTitle = HOBBY_KIND_META[resolvedKind].label;
    const workoutName =
      typeof res.json.workoutName === 'string' && res.json.workoutName.trim()
        ? res.json.workoutName.trim().slice(0, 40)
        : defaultTitle;
    const note =
      typeof res.json.note === 'string' && res.json.note.trim()
        ? res.json.note.trim().slice(0, 140)
        : `Getting an energizing ${workoutName.toLowerCase()} session in to stay fit and sharp!`;
    const accentHex = cleanHex(res.json.accentHex, '#10b981');
    return buildResult(resolvedKind, workoutName, note, accentHex, 'lm-studio', res.modelUsed);
  }

  const fbKind = inferKind(hint);
  const fbMeta = HOBBY_KIND_META[fbKind];
  return buildResult(
    fbKind,
    fbMeta.label,
    `Feeling ${persona.mood.toLowerCase()} — hitting ${fbMeta.label.toLowerCase()} for an energizing workout!`,
    '#10b981',
    'offline-planner'
  );
}


const VALID_STRETCH_ROUTINES: StretchRoutineId[] = [
  'overhead_sky_reach',
  'lateral_side_bend',
  'neck_shoulder_rolls',
  'forward_hamstring_fold',
  'quad_runner_lunge',
];

const STRETCH_ROUTINE_META: Record<
  StretchRoutineId,
  { label: string; accentHex: string; note: string }
> = {
  overhead_sky_reach: {
    label: 'Overhead Sky Reach Stretch',
    accentHex: '#a78bfa',
    note: 'Reaching high toward the sky with a deep inhale to lengthen my spine and wake up my shoulders!',
  },
  lateral_side_bend: {
    label: 'Graceful Side-Body Stretch',
    accentHex: '#f472b6',
    note: 'Curving smoothly from side to side to loosen my ribs, waist, and obliques!',
  },
  neck_shoulder_rolls: {
    label: 'Neck & Shoulder Release',
    accentHex: '#38bdf8',
    note: 'Gently rolling my neck and opening my shoulders to melt away stiffness!',
  },
  forward_hamstring_fold: {
    label: 'Flexible Forward Fold',
    accentHex: '#10b981',
    note: 'Bending softly forward from my hips to stretch my back and hamstrings gracefully!',
  },
  quad_runner_lunge: {
    label: 'Athletic Dynamic Lunge Stretch',
    accentHex: '#f59e0b',
    note: 'Sinking into smooth alternating side lunges to keep my legs and hips flexible!',
  },
};

/**
 * Strictly AI-driven anatomical stretching planner: the AI character decides on her own
 * (via LM Studio — Gemma, Qwen, or Both!) which flexible full-body stretch feels best
 * for her current mood, comfort, energy, and time of day.
 */
export async function planAiStretchRoutine(params: {
  persona: Persona;
  hint?: string;
  previousRoutine?: StretchRoutineId | null;
}): Promise<PlannedStretchResult> {
  const { persona, hint = '', previousRoutine = null } = params;
  const circadian = getCircadianContext();

  const inferRoutine = (raw: string): StretchRoutineId => {
    const s = raw.toLowerCase();
    if (/side|lateral|oblique|waist/.test(s)) return 'lateral_side_bend';
    if (/neck|shoulder|roll|stiff|tension/.test(s)) return 'neck_shoulder_rolls';
    if (/forward|hamstring|fold|toe|back/.test(s)) return 'forward_hamstring_fold';
    if (/lunge|quad|leg|hip|runner/.test(s)) return 'quad_runner_lunge';
    if (/sky|overhead|reach|morning|wake/.test(s)) return 'overhead_sky_reach';

    const pool = VALID_STRETCH_ROUTINES.filter((r) => r !== previousRoutine);
    if (circadian.phase === 'morning' && previousRoutine !== 'overhead_sky_reach') {
      return 'overhead_sky_reach';
    }
    return pool[Math.floor(Math.random() * pool.length)] || 'overhead_sky_reach';
  };

  const buildResult = (
    routine: StretchRoutineId,
    stretchName: string,
    note: string,
    accentHex: string,
    source: LifeEngineSource,
    modelUsed?: string
  ): PlannedStretchResult => ({
    routine,
    stretchName,
    note,
    hobby: {
      hobbyName: stretchName,
      hobbyKind: 'stretching',
      accentHex,
      description: note,
      recommendedPosture: 'standing',
      stretchRoutine: routine,
    },
    source,
    modelUsed,
  });

  const systemPrompt = `You are a 3D Anime Virtual Idol choosing a smooth, flexible full-body anatomical stretch routine strictly on your own free will based on how your body feels right now.
Choose whichever of these 5 anatomical stretches feels best to you:
- "overhead_sky_reach" (tall full-body arms-overhead reach with gentle upper-back arch)
- "lateral_side_bend" (smooth alternating left/right side-body & oblique stretch with overhead arc)
- "neck_shoulder_rolls" (gentle neck tilts, shoulder opener & upper-back tension release)
- "forward_hamstring_fold" (graceful hip-hinged forward bend stretching back & hamstrings)
- "quad_runner_lunge" (smooth alternating dynamic leg lunges & hip-opener)

Return ONLY valid raw JSON:
{
  "routine": "overhead_sky_reach|lateral_side_bend|neck_shoulder_rolls|forward_hamstring_fold|quad_runner_lunge",
  "stretchName": "2-4 word graceful stretch title",
  "note": "One short in-character sentence about why your body feels like doing this stretch right now",
  "accentHex": "#RRGGBB"
}`;

  const userPrompt = `Character: ${persona.name} (${persona.title})
Mood: ${persona.mood}, Comfort: ${Math.round(persona.brain?.comfort ?? 70)}%, Energy: ${Math.round(persona.brain?.energy ?? 75)}%, Time: ${circadian.clockText} (${circadian.phaseLabel})
${previousRoutine ? `Previous stretch: ${previousRoutine} (feel free to pick a fresh stretch!)` : ''}
${hint.trim() ? `Body cue: ${hint.trim()}` : 'Pick whichever anatomical stretch feels most relaxing and natural for your body right now!'}
Output ONLY the JSON object.`;

  const res = await queryLmStudioJson({
    systemPrompt,
    userPrompt,
    taskKind: 'hobby',
    mood: persona.mood,
  });

  if (res?.json) {
    const rawR = String(res.json.routine || '').trim().toLowerCase();
    const resolved: StretchRoutineId = VALID_STRETCH_ROUTINES.includes(rawR as StretchRoutineId)
      ? (rawR as StretchRoutineId)
      : inferRoutine(`${rawR} ${String(res.json.stretchName || '')} ${hint}`);
    const meta = STRETCH_ROUTINE_META[resolved];
    const stretchName =
      typeof res.json.stretchName === 'string' && res.json.stretchName.trim()
        ? res.json.stretchName.trim().slice(0, 40)
        : meta.label;
    const note =
      typeof res.json.note === 'string' && res.json.note.trim()
        ? res.json.note.trim().slice(0, 140)
        : meta.note;
    const accentHex = cleanHex(res.json.accentHex, meta.accentHex);
    return buildResult(resolved, stretchName, note, accentHex, 'lm-studio', res.modelUsed);
  }

  const fb = inferRoutine(hint);
  const meta = STRETCH_ROUTINE_META[fb];
  return buildResult(fb, meta.label, meta.note, meta.accentHex, 'offline-planner');
}
