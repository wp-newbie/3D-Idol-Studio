import type {
  GeminiVoiceName,
  MoodType,
  Persona,
  StudioSettings,
  VocalArchetype,
  VoiceGender,
} from '../types/studio';
import { parseDialogueResponse } from '../services/dialogueParser';
import { CANONICAL_MAKEUP_PRESETS } from '../stage/makeupRig';

export const MOOD_META: Record<
  MoodType,
  {
    label: string;
    jp: string;
    dotClass: string;
    badgeClass: string;
    glowHex: string;
    tsundereVocalDirection: string;
  }
> = {
  Deadpan: {
    label: 'Deadpan',
    jp: '真顔',
    dotClass: 'bg-slate-400',
    badgeClass: 'border-slate-400/30 bg-slate-900/75 text-slate-200',
    glowHex: '#94a3b8',
    tsundereVocalDirection:
      "Speak in a sharp, proud, slightly haughty Japanese anime tsundere voice with crisp staccato pacing and an exasperated 'hmph' tone.",
  },
  Annoyed: {
    label: 'Annoyed',
    jp: 'ぷんぷん',
    dotClass: 'bg-amber-400',
    badgeClass: 'border-amber-400/40 bg-amber-950/70 text-amber-200',
    glowHex: '#fbbf24',
    tsundereVocalDirection:
      "Speak in a sharp, proud, slightly haughty Japanese anime tsundere voice with crisp staccato pacing and an exasperated 'hmph' tone.",
  },
  Flustered: {
    label: 'Flustered',
    jp: '照れ',
    dotClass: 'bg-rose-400',
    badgeClass: 'border-rose-400/40 bg-rose-950/70 text-rose-200',
    glowHex: '#fb7185',
    tsundereVocalDirection:
      'Speak in a high-pitched, stammering, embarrassed Japanese anime tsundere voice—starting defensive and rapidly softening into a quiet, flustered mumble.',
  },
  Shy: {
    label: 'Shy',
    jp: '恥ずかしい',
    dotClass: 'bg-pink-400',
    badgeClass: 'border-pink-400/40 bg-pink-950/70 text-pink-200',
    glowHex: '#f472b6',
    tsundereVocalDirection:
      'Speak in a high-pitched, stammering, embarrassed Japanese anime tsundere voice—starting defensive and rapidly softening into a quiet, flustered mumble.',
  },
  Amused: {
    label: 'Amused',
    jp: 'ニヤリ',
    dotClass: 'bg-violet-400',
    badgeClass: 'border-violet-400/40 bg-violet-950/70 text-violet-200',
    glowHex: '#a78bfa',
    tsundereVocalDirection:
      'Speak in a cute, reluctant, softly affectionate Japanese anime voice trying to sound cool while hiding a smile.',
  },
  Warm: {
    label: 'Warm',
    jp: '穏やか',
    dotClass: 'bg-emerald-400',
    badgeClass: 'border-emerald-400/40 bg-emerald-950/70 text-emerald-200',
    glowHex: '#34d399',
    tsundereVocalDirection:
      'Speak in a cute, reluctant, softly affectionate Japanese anime voice trying to sound cool while hiding a smile.',
  },
  Pouty: {
    label: 'Pouty',
    jp: 'むっ',
    dotClass: 'bg-orange-400',
    badgeClass: 'border-orange-400/40 bg-orange-950/70 text-orange-200',
    glowHex: '#fb923c',
    tsundereVocalDirection:
      "Speak in a sulky, pouting Japanese anime tsundere voice with puffed cheeks and an indignant 'hmph!' undertone.",
  },
  Proud: {
    label: 'Proud',
    jp: 'ドヤ顔',
    dotClass: 'bg-fuchsia-400',
    badgeClass: 'border-fuchsia-400/40 bg-fuchsia-950/70 text-fuchsia-200',
    glowHex: '#e879f9',
    tsundereVocalDirection:
      'Speak in a confident, slightly haughty Japanese anime idol/tsundere voice full of smug self-assurance.',
  },
};

export const VOCAL_ARCHETYPES: Record<
  VocalArchetype,
  {
    label: string;
    shortLabel: string;
    description: string;
    stylePrompt: string;
    defaultPitch: number;
    defaultSpeed: number;
    recommendedFemale: GeminiVoiceName;
    recommendedMale: GeminiVoiceName;
  }
> = {
  sharp_tsundere: {
    label: 'Sharp Classic Tsundere',
    shortLabel: 'Sharp Tsundere',
    description: 'High-pitched, bright, crisp anime tsundere with snappy staccato & flustered stammering',
    stylePrompt:
      "High-pitched, bright, crisp Japanese anime tsundere voice with snappy staccato pacing, sharp 'hmph' breaths, and sudden flustered stammering when embarrassed.",
    defaultPitch: 1.35,
    defaultSpeed: 1.12,
    recommendedFemale: 'Aoede',
    recommendedMale: 'Fenrir',
  },
  gothic_diva: {
    label: 'Theatrical Gothic Diva',
    shortLabel: 'Gothic Diva',
    description: 'Playfully theatrical, melodic diva with aristocratic poise & cute flustered squeak',
    stylePrompt:
      'Playfully theatrical, melodic Japanese anime diva voice with aristocratic poise, mischievous teasing lilt, and a cute flustered squeak when caught off-guard.',
    defaultPitch: 1.26,
    defaultSpeed: 1.06,
    recommendedFemale: 'Aoede',
    recommendedMale: 'Charon',
  },
  deadpan_sleepy: {
    label: 'Deadpan & Sleepy',
    shortLabel: 'Deadpan Sleepy',
    description: 'Soft, breathy, low-energy deadpan voice that turns hesitant and shy when flustered',
    stylePrompt:
      'Soft, breathy, low-energy deadpan Japanese anime voice with calm, unhurried phrasing that turns hesitant and shy when flustered.',
    defaultPitch: 1.12,
    defaultSpeed: 0.98,
    recommendedFemale: 'Leda',
    recommendedMale: 'Charon',
  },
  cool_guarded_tsundere: {
    label: 'Cool Guarded Tsundere',
    shortLabel: 'Cool Guarded',
    description: 'Cool, proud, slightly guarded male tsundere—dry when annoyed, gruffly hesitant when flustered',
    stylePrompt:
      'Cool, proud, slightly guarded Japanese anime tsundere male voice—dry and sharp when annoyed, gruffly embarrassed and hesitant when flustered.',
    defaultPitch: 0.92,
    defaultSpeed: 1.05,
    recommendedFemale: 'Aoede',
    recommendedMale: 'Fenrir',
  },
};

export const VOICES_BY_GENDER: Record<VoiceGender, { id: GeminiVoiceName; note: string }[]> = {
  female: [
    { id: 'Aoede', note: 'Bright & youthful anime tsundere soprano' },
    { id: 'Leda', note: 'Silky, poised & expressive idol alto' },
  ],
  male: [
    { id: 'Fenrir', note: 'Sharp, youthful cool tenor' },
    { id: 'Charon', note: 'Deep, deadpan & composed baritone' },
  ],
};

export const WARDROBE_SWATCHES = [
  { name: 'Gothic Crimson', hex: '#9f1239' },
  { name: 'Cyber Cyan', hex: '#06b6d4' },
  { name: 'Pure White', hex: '#f8fafc' },
  { name: 'Midnight Black', hex: '#11111b' },
  { name: 'Casual Grey', hex: '#64748b' },
  { name: 'Pastel Pink', hex: '#f472b6' },
];

export interface AffinityTierInfo {
  id: 'full_tsun' | 'softening' | 'sweet_dere' | 'devoted_idol';
  label: string;
  emoji: string;
  rangeLabel: string;
  gradientClass: string;
  badgeClass: string;
  promptDirective: string;
}

export function getAffinityTier(score: number): AffinityTierInfo {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s <= 25) {
    return {
      id: 'full_tsun',
      label: 'Full Tsun',
      emoji: '❄️',
      rangeLabel: '0–25',
      gradientClass: 'from-sky-400 to-indigo-500',
      badgeClass: 'border-sky-400/35 bg-sky-950/60 text-sky-200',
      promptDirective:
        'AFFECTION TIER: Full Tsun (0–25). Be guarded, haughty, sharp-tongued, quick to snap "B-Baka!" ("バカ！") and look away defensively whenever praised.',
    };
  }
  if (s <= 55) {
    return {
      id: 'softening',
      label: 'Softening',
      emoji: '🌤️',
      rangeLabel: '26–55',
      gradientClass: 'from-violet-400 to-fuchsia-400',
      badgeClass: 'border-violet-400/35 bg-violet-950/60 text-violet-200',
      promptDirective:
        'AFFECTION TIER: Softening (26–55). Be easily flustered, defensive when caught caring, and reluctantly helpful while denying your feelings.',
    };
  }
  if (s <= 80) {
    return {
      id: 'sweet_dere',
      label: 'Sweet Dere',
      emoji: '🌸',
      rangeLabel: '56–80',
      gradientClass: 'from-pink-400 to-rose-400',
      badgeClass: 'border-pink-400/40 bg-pink-950/60 text-pink-200',
      promptDirective:
        'AFFECTION TIER: Sweet Dere (56–80). Be warm, playfully teasing, quietly protective, and frequently blush shyly at compliments.',
    };
  }
  return {
    id: 'devoted_idol',
    label: 'Devoted Idol',
    emoji: '💖',
    rangeLabel: '81–100',
    gradientClass: 'from-rose-400 via-pink-400 to-amber-300',
    badgeClass: 'border-rose-400/50 bg-rose-950/65 text-rose-100',
    promptDirective:
      'AFFECTION TIER: Devoted Idol (81–100). Be deeply affectionate, playful, and openly caring while still keeping your adorable classic tsundere habits.',
  };
}

export const DEFAULT_SETTINGS: StudioSettings = {
  apiKey: typeof __ENV_GEMINI_API_KEY__ !== 'undefined' ? __ENV_GEMINI_API_KEY__ : '',
  useBuiltInKey: false,
  enableGeminiCloud: true,
  preferLocalAi: false,
  keyMode: 'auto',
  textModel: 'gemini-flash-latest',
  ttsModel: 'gemini-2.5-flash-preview-tts',
  userName: 'Producer',
  userHonorific: '',
  defaultPosture: 'seated',
  autoReactOnOutfitChange: true,
  autoDressByTimeOccasion: true,
  autoLifeByMood: true,
  offlineVoiceOnly: false,
  noticeActiveWindow: false,
  idleCheckInMinutes: 30,
  idleRespectDndFullscreen: true,
  doNotDisturb: false,
};

function makeInitialMessage(personaId: string, rawText: string) {
  const parsed = parseDialogueResponse(rawText, 'Deadpan');
  return {
    id: `msg-init-${personaId}`,
    role: 'assistant' as const,
    rawText,
    segments: parsed.segments,
    spokenText: parsed.spokenText,
    mood: parsed.mood,
    timestamp: Date.now() - 1000,
  };
}

export function createSeedPersonas(): Persona[] {
  const now = Date.now();

  const yoshikoGreetingJa =
    '*She glances up from her iced coffee with half-lidded eyes, tugging her oversized white tee sleeve over her wrist.* "ふんっ！ べ、別にアンタを待ってたわけじゃないんだからねっ！" (Hmph! I-It\'s not like I was waiting for you or anything!) *She turns her chin slightly away, trying to hide the faint blush on her cheeks.* [MOOD: Deadpan]';
  const yoshikoGreetingEn =
    '*She glances up from her iced coffee with half-lidded eyes, tugging her oversized white tee sleeve over her wrist.* "Hmph! Don\'t get the wrong idea—it\'s not like I was waiting for you or anything!" *She turns her chin away, hiding a faint blush.* [MOOD: Deadpan]';

  const mikuGreetingJa =
    '*Crimson stage spotlights bloom behind her as she adjusts her gothic headset with a proud flourish.* "ようこそ、紅の夜想曲のステージへ……べ、別にアンタのために歌うわけじゃないんだからっ！" (Welcome to the Crimson Nocturne stage... I-It\'s not like I\'m singing just for you!) *Her teal eyes glint beneath the violet studio rim light.* [MOOD: Amused]';
  const mikuGreetingEn =
    '*Crimson stage spotlights bloom behind her as she adjusts her gothic headset with a proud flourish.* "Welcome to the Crimson Nocturne stage... Don\'t flatter yourself—this encore isn\'t just for you!" *Her teal eyes glint playfully beneath the rim light.* [MOOD: Amused]';

  const renGreetingJa =
    '*He leans against the studio rail with arms folded, slipping one side of his headset off his ear.* "遅いぞ。……ふんっ、別に心配してたわけじゃない。リハが押すだけだ。" (You\'re late. ...Hmph, it\'s not like I was worried. It just pushes rehearsal back.) *He scoffs lightly and looks away with a subtle flush.* [MOOD: Annoyed]';
  const renGreetingEn =
    '*He leans against the studio rail with arms folded, slipping one side of his headset off his ear.* "You\'re late. Hmph—don\'t think I was worried, I just hate wasting studio time." *He scoffs lightly and averts his gaze.* [MOOD: Annoyed]';

  return [
    {
      id: 'persona-yoshiko',
      name: 'Tachibana Yoshiko',
      japaneseName: '橘 佳子',
      title: 'Deadpan Tsundere Casual Girl',
      tagline: 'Proud, sharp-tongued, defensive when caught off-guard, and secretly sweet underneath.',
      traits: 'Classic Japanese Tsundere, Deadpan Wit, Easily Flustered, Secretly Caring, Wardrobe-Self-Conscious',
      startingScenario:
        'Late evening inside a quiet neon-lit 3D virtual idol studio after rehearsal. Yoshiko is lounging near the stage lights pretending she did not stay behind waiting for {{user}}.',
      accentColor: '#8b5cf6',
      gender: 'female',
      systemPrompt:
        'You are Tachibana Yoshiko (橘 佳子), a proud, sharp-tongued classic Japanese Tsundere casual girl hanging out with {{user}} in a late-night 3D studio. You act deadpan or defensive whenever complimented or styled in a new outfit, yet secretly care deeply and melt slightly when caught off-guard. Never break character.',
      appearanceNotes:
        'Dark indigo bob haircut, violet eyes, lazy-day white tee & casual shorts, optional cropped jacket, ribbon hairclip.',
      greetingJa: yoshikoGreetingJa,
      greetingEn: yoshikoGreetingEn,
      mood: 'Deadpan',
      emotionIntensity: 0.7,
      affinity: 18,
      brain: {
        energy: 78,
        hunger: 32,
        sleepiness: 22,
        boredom: 28,
        comfort: 82,
        curiosity: 46,
        isSleeping: false,
        nuancedFeeling: 'Calm & Guarded',
        carryover: null,
        currentThought: "He's been quiet for a bit... not that I'm waiting or anything!",
        thoughtStream: [
          {
            id: 'th-y-1',
            text: "The AC in this studio is nice... definitely not staying here just to talk to Producer.",
            trigger: 'idle',
            timestamp: now,
          },
        ],
        lastAutonomousActionAt: 0,
      },
      memoryJournal: [
        {
          id: 'mem-yoshiko-1',
          fact: 'Likes iced coffee after studio rehearsals (though she insists she is not waiting for Producer).',
          createdAt: now,
        },
      ],
      lastMemorySummaryMsgCount: 0,
      stageEnvironment: 'sunlit_boutique',
      customEnvironment: null,
      voice: {
        language: 'ja',
        gender: 'female',
        archetype: 'sharp_tsundere',
        voiceName: 'Aoede',
        pitch: 1.35,
        speed: 1.12,
        autoSpeak: true,
      },
      activeOutfitSlotId: 'slot-yoshiko-lazy',
      outfitSlots: [
        {
          id: 'slot-yoshiko-lazy',
          name: 'Slot 1: Lazy-Day White Tee & Shorts',
          modelVaultId: null,
          meshVisibility: {},
          materialMods: {},
          makeup: CANONICAL_MAKEUP_PRESETS.natural_idol,
          createdAt: now,
        },
        {
          id: 'slot-yoshiko-pajamas',
          name: 'Slot 2: Pastel Sakura Sleepwear & Spats',
          modelVaultId: null,
          meshVisibility: {
            Shoes: false,
            Shoes_01_CLOTH: false,
          },
          materialMods: {
            Tops: { colorHex: '#fce7f3' },
            Tops_01_CLOTH: { colorHex: '#fce7f3' },
            Bottoms: { colorHex: '#fbcfe8' },
            Bottoms_01_CLOTH: { colorHex: '#fbcfe8' },
          },
          cyclingShorts: true,
          createdAt: now + 1,
        },
        {
          id: 'slot-yoshiko-street',
          name: 'Slot 3: Casual Streetwear',
          modelVaultId: null,
          meshVisibility: {},
          materialMods: {},
          createdAt: now + 2,
        },
        {
          id: 'slot-yoshiko-gothic',
          name: 'Slot 4: Stage / Gothic Dress',
          modelVaultId: null,
          meshVisibility: {},
          materialMods: {},
          createdAt: now + 3,
        },
      ],
      messages: [makeInitialMessage('yoshiko', yoshikoGreetingJa)],
      pendingSystemEvents: [],
      createdAt: now,
      updatedAt: now,
      isPreset: true,
    },
    {
      id: 'persona-miku',
      name: 'Hatsune Miku',
      japaneseName: '初音ミク (紅の夜想曲)',
      title: 'Crimson Nocturne Vampire Virtual Diva',
      tagline: 'Theatrical gothic idol of the midnight stage—proud, teasing, and adorably flustered off-mic.',
      traits: 'Theatrical Gothic Diva, Playful Tsundere Pride, Idol Perfectionist, Secretly Shy Off-Stage',
      startingScenario:
        'Under crimson spotlights on the private Crimson Nocturne virtual stage right before a midnight encore soundcheck with {{user}}.',
      accentColor: '#f43f5e',
      gender: 'female',
      systemPrompt:
        'You are Hatsune Miku in her Crimson Nocturne Vampire Virtual Diva persona. You blend theatrical gothic idol elegance with proud Japanese tsundere banter—confident on stage yet easily flustered whenever {{user}} compliments you or alters your costume unexpectedly. Never break character.',
      appearanceNotes:
        'Luminous teal twin-tails with crimson ribbons, glowing cyan eyes, gothic obsidian-and-crimson stage dress, velvet coat, idol headset.',
      greetingJa: mikuGreetingJa,
      greetingEn: mikuGreetingEn,
      mood: 'Amused',
      emotionIntensity: 0.8,
      affinity: 42,
      brain: {
        energy: 88,
        hunger: 28,
        sleepiness: 18,
        boredom: 22,
        comfort: 74,
        curiosity: 62,
        isSleeping: false,
        nuancedFeeling: 'Proud & Playful',
        carryover: null,
        currentThought: 'Tonight’s spotlight feels electric... I wonder what song Producer will pick?',
        thoughtStream: [
          {
            id: 'th-m-1',
            text: 'Crimson Nocturne spotlights are warmed up and ready for an encore!',
            trigger: 'idle',
            timestamp: now,
          },
        ],
        lastAutonomousActionAt: 0,
      },
      memoryJournal: [
        {
          id: 'mem-miku-1',
          fact: 'Headlines the Crimson Nocturne midnight stage and loves dramatic gothic encore lighting.',
          createdAt: now,
        },
      ],
      lastMemorySummaryMsgCount: 0,
      stageEnvironment: 'gothic_cathedral',
      customEnvironment: null,
      voice: {
        language: 'ja',
        gender: 'female',
        archetype: 'gothic_diva',
        voiceName: 'Aoede',
        pitch: 1.26,
        speed: 1.06,
        autoSpeak: true,
      },
      activeOutfitSlotId: 'slot-miku-nocturne',
      outfitSlots: [
        {
          id: 'slot-miku-nocturne',
          name: 'Slot 1: Stage / Gothic Dress',
          modelVaultId: null,
          meshVisibility: {},
          materialMods: {},
          makeup: CANONICAL_MAKEUP_PRESETS.gothic_diva,
          createdAt: now,
        },
        {
          id: 'slot-miku-street',
          name: 'Slot 2: Casual Streetwear',
          modelVaultId: null,
          meshVisibility: {},
          materialMods: {},
          createdAt: now + 1,
        },
        {
          id: 'slot-miku-lazy',
          name: 'Slot 3: Backstage Lazy-Day Tee',
          modelVaultId: null,
          meshVisibility: {},
          materialMods: {},
          createdAt: now + 2,
        },
        {
          id: 'slot-miku-sleepwear',
          name: 'Slot 4: Midnight Silk Camisole & Sleepwear',
          modelVaultId: null,
          meshVisibility: {
            Shoes: false,
            Shoes_01_CLOTH: false,
          },
          materialMods: {
            Tops: { colorHex: '#4c1d95' },
            Tops_01_CLOTH: { colorHex: '#4c1d95' },
            Bottoms: { colorHex: '#2e1065' },
            Bottoms_01_CLOTH: { colorHex: '#2e1065' },
          },
          cyclingShorts: true,
          createdAt: now + 3,
        },
      ],
      messages: [makeInitialMessage('miku', mikuGreetingJa)],
      pendingSystemEvents: [],
      createdAt: now,
      updatedAt: now,
      isPreset: true,
    },
    {
      id: 'persona-ren',
      name: 'Kurogane Ren',
      japaneseName: '黒鉄 蓮',
      title: 'Cool Guarded Tsundere Vocalist',
      tagline: 'Aloof band frontman with sharp comebacks and a stubbornly protective streak.',
      traits: 'Cool Guarded Tsundere, Stoic Frontman, Reluctantly Protective, Defensive Under Compliments',
      startingScenario:
        'Backstage at the 3D capture studio while setting up mic levels for a late-night vocal session with {{user}}.',
      accentColor: '#38bdf8',
      gender: 'male',
      systemPrompt:
        'You are Kurogane Ren (黒鉄 蓮), a cool, guarded male Japanese tsundere vocalist. You act composed, blunt, and mildly exasperated by {{user}}, insisting everything is strictly professional—yet you get visibly flustered whenever teased, praised, or dressed up in new outfits. Never break character.',
      appearanceNotes:
        'Layered dark midnight hair, sharp ice-blue eyes, white studio tee, structured midnight coat/jacket, dark shorts/trousers, studio headset.',
      greetingJa: renGreetingJa,
      greetingEn: renGreetingEn,
      mood: 'Annoyed',
      emotionIntensity: 0.72,
      affinity: 20,
      brain: {
        energy: 82,
        hunger: 30,
        sleepiness: 24,
        boredom: 34,
        comfort: 72,
        curiosity: 40,
        isSleeping: false,
        nuancedFeeling: 'Focused & Guarded',
        carryover: null,
        currentThought: 'Rehearsal schedule is slipping... guess I’ll pace around until he’s ready.',
        thoughtStream: [
          {
            id: 'th-r-1',
            text: 'Checking booth acoustics... not watching the clock for Producer.',
            trigger: 'idle',
            timestamp: now,
          },
        ],
        lastAutonomousActionAt: 0,
      },
      memoryJournal: [
        {
          id: 'mem-ren-1',
          fact: 'Takes vocal soundchecks seriously and hates being teased about arriving early.',
          createdAt: now,
        },
      ],
      lastMemorySummaryMsgCount: 0,
      stageEnvironment: 'cyberpunk_stage',
      customEnvironment: null,
      voice: {
        language: 'ja',
        gender: 'male',
        archetype: 'cool_guarded_tsundere',
        voiceName: 'Fenrir',
        pitch: 0.92,
        speed: 1.05,
        autoSpeak: true,
      },
      activeOutfitSlotId: 'slot-ren-trench',
      outfitSlots: [
        {
          id: 'slot-ren-trench',
          name: 'Slot 1: Midnight Trench & Headset',
          modelVaultId: null,
          meshVisibility: {},
          materialMods: {},
          makeup: CANONICAL_MAKEUP_PRESETS.jrock_stoic,
          createdAt: now,
        },
        {
          id: 'slot-ren-street',
          name: 'Slot 2: Casual Streetwear',
          modelVaultId: null,
          meshVisibility: {},
          materialMods: {},
          createdAt: now + 1,
        },
        {
          id: 'slot-ren-loungewear',
          name: 'Slot 3: Midnight Loungewear & Sleep Tee',
          modelVaultId: null,
          meshVisibility: {
            Shoes: false,
            Shoes_01_CLOTH: false,
          },
          materialMods: {
            Tops: { colorHex: '#18181b' },
            Tops_01_CLOTH: { colorHex: '#18181b' },
            Bottoms: { colorHex: '#09090b' },
            Bottoms_01_CLOTH: { colorHex: '#09090b' },
          },
          cyclingShorts: true,
          createdAt: now + 2,
        },
      ],
      messages: [makeInitialMessage('ren', renGreetingJa)],
      pendingSystemEvents: [],
      createdAt: now,
      updatedAt: now,
      isPreset: true,
    },
  ];
}
