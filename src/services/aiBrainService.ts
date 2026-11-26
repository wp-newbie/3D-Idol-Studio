import type {
  AutonomousNeedTrigger,
  BrainThought,
  CareActivityId,
  CircadianPhase,
  EmotionalCarryover,
  MicroTellKind,
  MoodType,
  Persona,
  PersonaBrainState,
  StageEnvironmentId,
} from '../types/studio';

export interface CircadianContext {
  phase: CircadianPhase;
  phaseLabel: string;
  phaseEmoji: string;
  clockText: string;
  hour: number;
  mealWindow: string | null;
  isLateNight: boolean;
}

export function getCircadianContext(now = new Date()): CircadianContext {
  const hour = now.getHours();
  const min = now.getMinutes();
  const decimalHour = hour + min / 60;
  const clockText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let phase: CircadianPhase = 'afternoon';
  let phaseLabel = 'Afternoon';
  let phaseEmoji = '☀️';
  if (hour >= 5 && hour < 12) {
    phase = 'morning';
    phaseLabel = 'Morning';
    phaseEmoji = '🌅';
  } else if (hour >= 12 && hour < 18) {
    phase = 'afternoon';
    phaseLabel = 'Afternoon';
    phaseEmoji = '☀️';
  } else if (hour >= 18 && hour < 23) {
    phase = 'evening';
    phaseLabel = 'Evening';
    phaseEmoji = '🌆';
  } else {
    phase = 'late_night';
    phaseLabel = 'Late Night';
    phaseEmoji = '🌙';
  }

  let mealWindow: string | null = null;
  if (decimalHour >= 7 && decimalHour <= 9.5) {
    mealWindow = 'morning coffee/tea & breakfast';
  } else if (decimalHour >= 11.75 && decimalHour <= 13.5) {
    mealWindow = 'lunch';
  } else if (decimalHour >= 15 && decimalHour <= 17) {
    mealWindow = 'afternoon pastry & tea';
  } else if (decimalHour >= 18 && decimalHour <= 20.5) {
    mealWindow = 'dinner';
  } else if (decimalHour >= 23 || decimalHour <= 3) {
    mealWindow = 'late-night snack cravings';
  }

  const isLateNight = decimalHour >= 23.5 || decimalHour <= 4.0;
  return { phase, phaseLabel, phaseEmoji, clockText, hour, mealWindow, isLateNight };
}

export function getStageClimate(env: StageEnvironmentId): {
  label: string;
  comfortDriftPerTick: number;
  isChilly: boolean;
} {
  switch (env) {
    case 'lofi_rainy_room':
      return { label: 'cool & rainy', comfortDriftPerTick: -1.1, isChilly: true };
    case 'midnight_rooftop':
      return { label: 'breezy & chilly night air', comfortDriftPerTick: -1.5, isChilly: true };
    case 'gothic_cathedral':
      return { label: 'cool candlelit stone hall', comfortDriftPerTick: -0.7, isChilly: true };
    case 'cyberpunk_stage':
      return { label: 'air-conditioned concert stage', comfortDriftPerTick: -0.25, isChilly: false };
    case 'sunlit_boutique':
    default:
      return { label: 'warm sunlit afternoon loft', comfortDriftPerTick: 0.9, isChilly: false };
  }
}

const THOUGHTS_BY_MOOD: Record<MoodType, string[]> = {
  Deadpan: [
    "He's been quiet for a while... not that I care!",
    'The studio lighting feels strangely calm right now.',
    'Wonder if Producer remembers to drink water while working...',
  ],
  Flustered: [
    'W-Why is my face still warm?! Act normal, act normal!',
    'I really hope he did not notice how fast my heart beat just now...',
    'Stop looking at me so sincerely, idiot...!',
  ],
  Annoyed: [
    'Honestly, Producer has zero sense of timing sometimes...',
    'Hmph! Crossed arms definitely make me look unbothered.',
    'If he teases me one more time, I am pouting for real.',
  ],
  Shy: [
    'That was actually kind of sweet... wait, no, stop smiling!',
    'I wonder if my company really helps him relax after a long day...',
    'Maybe I will let him pat my head again later... maybe.',
  ],
  Amused: [
    'Hehe, watching Producer work is kind of cozy and entertaining.',
    'Wonder if we should hum a melody or play a quick game soon?',
    'Not a bad vibe in here at all.',
  ],
  Warm: [
    'Spending quiet time together in this studio feels surprisingly grounding.',
    'I am glad he is here... even if I will never say it out loud directly.',
    'This peaceful moment is actually really nice.',
  ],
  Pouty: [
    'Hmph... ignoring me for this long is seriously rude.',
    'Fine, I will just pout over here until he notices!',
    'My stomach might be complaining a little, too...',
  ],
  Proud: [
    'Naturally, nobody owns this 3D stage quite like me.',
    'All that rehearsal really pays off when the lights hit right.',
    'Heh—bet Producer cannot take his eyes off the stage.',
  ],
};

export function pickMoodInnerThought(mood: MoodType, prevThought?: string): string {
  const pool = THOUGHTS_BY_MOOD[mood] || THOUGHTS_BY_MOOD.Deadpan;
  const filtered = pool.filter((t) => t !== prevThought);
  const src = filtered.length > 0 ? filtered : pool;
  return src[Math.floor(Math.random() * src.length)];
}

export function deriveDefaultNuancedFeeling(mood: MoodType, brain: PersonaBrainState): string {
  if (brain.isSleeping) return 'Dozing Peacefully';
  if (brain.carryover && brain.carryover.turnsRemaining > 0) return brain.carryover.feeling;
  if (brain.sleepiness > 70) return mood === 'Warm' ? 'Tired & Fond' : 'Drowsy & Quiet';
  if (brain.hunger > 70) return mood === 'Pouty' || mood === 'Annoyed' ? 'Hungry & Pouty' : 'Craving a Snack';
  if (brain.comfort < 35) return 'A Little Chilly';
  if (brain.boredom > 68) return 'Restless & Bored';

  switch (mood) {
    case 'Warm':
      return 'Quietly Content';
    case 'Amused':
      return 'Playfully Teasing';
    case 'Flustered':
      return 'Flustered & Self-Conscious';
    case 'Shy':
      return 'Softly Vulnerable';
    case 'Annoyed':
      return 'Playfully Annoyed';
    case 'Pouty':
      return 'Sulking & Wanting Attention';
    case 'Proud':
      return 'Confident & Glowing';
    case 'Deadpan':
    default:
      return 'Calm & Observant';
  }
}

export function detectUserEmpathyCue(userText: string): boolean {
  return /\b(tired|exhausted|stressed|stress|burnout|burnt out|sick|headache|rough day|bad day|sad|lonely|anxious|overwhelmed|depressed|hard day|struggling|drained|couldn't sleep|can't sleep|hurt|crying)\b|疲れ|しんどい|つらい|辛い|体調|頭痛|眠い|寂しい|不安|ストレス/i.test(
    userText
  );
}

export function advanceEmotionalCarryover(params: {
  prev: EmotionalCarryover | null;
  parsedMood: MoodType;
  parsedFeeling: string | null;
  userTriggeredEmpathy: boolean;
}): EmotionalCarryover | null {
  const { prev, parsedMood, parsedFeeling, userTriggeredEmpathy } = params;

  if (userTriggeredEmpathy) {
    return {
      feeling: parsedFeeling || 'Quietly Worried & Caring',
      mood: 'Warm',
      turnsRemaining: 3,
      empathySoftening: true,
    };
  }

  // Deeply touched / startled / upset feelings linger across 2-3 turns
  if (
    parsedFeeling &&
    /(worried|caring|touched|hurt|upset|jealous|vulnerable|lonely|nostalgic|startled)/i.test(
      parsedFeeling
    )
  ) {
    return {
      feeling: parsedFeeling,
      mood: parsedMood,
      turnsRemaining: 3,
      empathySoftening: /(worried|caring|touched|vulnerable|nostalgic|tired)/i.test(parsedFeeling),
    };
  }

  if (prev && prev.turnsRemaining > 1) {
    return {
      ...prev,
      turnsRemaining: prev.turnsRemaining - 1,
    };
  }

  return null;
}

/**
 * Advances a Persona's realistic Human Needs (Hunger, Sleepiness, Boredom, Comfort, Energy, Curiosity)
 * synced to the real-world circadian clock, stage climate, and user activity.
 */
export function tickBrainNeeds(params: {
  brain: PersonaBrainState;
  mood: MoodType;
  stageEnvironment: StageEnvironmentId;
  secondsSinceUserActivity: number;
  sessionMinutes: number;
  isMovingOrDancing: boolean;
  cursorActive: boolean;
}): {
  nextBrain: PersonaBrainState;
  shouldTriggerAutonomousImpulse: AutonomousNeedTrigger | null;
  suggestedTell: MicroTellKind;
  naturalMoodShift?: MoodType;
} {
  const {
    brain,
    mood,
    stageEnvironment,
    secondsSinceUserActivity,
    sessionMinutes,
    isMovingOrDancing,
    cursorActive,
  } = params;

  const circadian = getCircadianContext();
  const climate = getStageClimate(stageEnvironment);

  // Sleeping / Dozing Mode gently restores Energy & clears Sleepiness
  if (brain.isSleeping) {
    const energy = Math.min(100, Number((brain.energy + 2.4).toFixed(1)));
    const sleepiness = Math.max(0, Number((brain.sleepiness - 3.2).toFixed(1)));
    const boredom = Math.max(0, Number((brain.boredom - 1.2).toFixed(1)));
    const comfort = Math.min(100, Number((brain.comfort + 0.5).toFixed(1)));
    const hunger = Math.min(100, Number((brain.hunger + 0.15).toFixed(1)));

    return {
      nextBrain: {
        ...brain,
        energy,
        sleepiness,
        boredom,
        comfort,
        hunger,
        nuancedFeeling: 'Dozing Peacefully',
      },
      shouldTriggerAutonomousImpulse: null,
      suggestedTell: 'none',
    };
  }

  const isQuiet = secondsSinceUserActivity > 18;

  // 1. Hunger drifts steadily and rises faster during meal windows
  const hungerStep = circadian.mealWindow ? 0.65 : 0.25;
  const hunger = Math.max(0, Math.min(100, Number((brain.hunger + hungerStep).toFixed(1))));

  // 2. Sleepiness rises faster late at night (11:30 PM - 4:00 AM) or after 45+ min active sessions
  const sleepStep = circadian.isLateNight
    ? 0.95
    : sessionMinutes > 45
    ? 0.45
    : circadian.phase === 'evening'
    ? 0.22
    : 0.08;
  const sleepiness = Math.max(
    0,
    Math.min(100, Number((brain.sleepiness + sleepStep).toFixed(1)))
  );

  // 3. Energy drains with activity / fatigue & high hunger
  const energyDelta =
    (isMovingOrDancing ? -0.7 : 0.35) - (sleepiness > 65 ? 0.45 : 0) - (hunger > 75 ? 0.25 : 0);
  const energy = Math.max(10, Math.min(100, Number((brain.energy + energyDelta).toFixed(1))));

  // 4. Boredom rises when left idle without chat/cursor interaction
  const boredomDelta = isQuiet ? 1.5 : -0.6;
  const boredom = Math.max(0, Math.min(100, Number((brain.boredom + boredomDelta).toFixed(1))));

  // 5. Comfort responds to active 3D stage climate (chilly rainy/night vs warm sunlit room)
  const comfort = Math.max(
    10,
    Math.min(100, Number((brain.comfort + climate.comfortDriftPerTick * 0.45).toFixed(1)))
  );

  // 6. Curiosity reacts to cursor presence
  const curiosityDelta = cursorActive ? 1.5 : isQuiet ? 0.35 : -0.35;
  const curiosity = Math.max(
    10,
    Math.min(100, Number((brain.curiosity + curiosityDelta).toFixed(1)))
  );

  let currentThought = brain.currentThought;
  let thoughtStream = brain.thoughtStream;
  let suggestedTell: MicroTellKind = 'none';

  // Periodic subtle physical tells based on live physical sensations
  const tellRoll = Math.random();
  if (sleepiness > 65 && tellRoll < 0.22) {
    suggestedTell = 'yawn';
  } else if (comfort < 35 && tellRoll < 0.22) {
    suggestedTell = 'cold_shiver';
  } else if (boredom > 65 && tellRoll < 0.2) {
    suggestedTell = 'sigh';
  }

  // Surface fresh organic inner thoughts tied to circadian needs
  if (Math.random() < 0.16) {
    let nextThought = pickMoodInnerThought(mood, brain.currentThought);
    let trigger: BrainThought['trigger'] = 'idle';

    if (sleepiness > 70) {
      nextThought = circadian.isLateNight
        ? "Mmm... it's so late already. Aren't you getting sleepy too?"
        : 'My eyelids feel a little heavy... maybe a quick nap later?';
      trigger = 'sleepiness';
    } else if (hunger > 70) {
      nextThought = circadian.mealWindow
        ? `It's around ${circadian.mealWindow} time... my stomach is definitely complaining.`
        : 'Ugh, I could really go for warm tea or strawberry cake right now...';
      trigger = 'hunger';
    } else if (comfort < 35) {
      nextThought = `It feels a bit chilly in this ${climate.label}... a warm blanket sounds nice.`;
      trigger = 'comfort';
    } else if (boredom > 65) {
      nextThought = "He's been quiet for a while... not that I care! Maybe I should poke him.";
      trigger = 'boredom';
    } else if (curiosity > 78) {
      nextThought = 'What is Producer focusing on over there? Let me peek closer...';
      trigger = 'curiosity';
    }

    if (nextThought !== currentThought) {
      currentThought = nextThought;
      const entry: BrainThought = {
        id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        text: nextThought,
        trigger,
        timestamp: Date.now(),
      };
      thoughtStream = [...thoughtStream, entry].slice(-12);
    }
  }

  // Need-driven autonomous trigger when any need crosses 75% (or Comfort < 25%) with safe 90s cooldown
  const now = Date.now();
  const cooledDown = now - (brain.lastAutonomousActionAt || 0) > 90000;
  let shouldTriggerAutonomousImpulse: AutonomousNeedTrigger | null = null;
  if (cooledDown) {
    if (sleepiness > 75) {
      shouldTriggerAutonomousImpulse = 'sleepiness';
      suggestedTell = 'yawn';
    } else if (hunger > 75) {
      shouldTriggerAutonomousImpulse = 'hunger';
    } else if (comfort < 25) {
      shouldTriggerAutonomousImpulse = 'comfort';
      suggestedTell = 'cold_shiver';
    } else if (boredom > 75) {
      shouldTriggerAutonomousImpulse = 'boredom';
      suggestedTell = 'sigh';
    } else if (curiosity > 86) {
      shouldTriggerAutonomousImpulse = 'curiosity';
    }
  }

  const nextBrain: PersonaBrainState = {
    ...brain,
    energy,
    hunger,
    sleepiness,
    boredom,
    comfort,
    curiosity,
    currentThought,
    thoughtStream,
    nuancedFeeling: deriveDefaultNuancedFeeling(mood, {
      ...brain,
      energy,
      hunger,
      sleepiness,
      boredom,
      comfort,
      curiosity,
    }),
  };

  // Organic AI-driven mood shifts when physical needs cross strong thresholds (respecting active carryover)
  let naturalMoodShift: MoodType | undefined;
  const hasCarryover = Boolean(brain.carryover && brain.carryover.turnsRemaining > 0);
  if (!hasCarryover) {
    if (sleepiness > 75 && mood !== 'Warm' && mood !== 'Deadpan') {
      naturalMoodShift = 'Deadpan';
    } else if (hunger > 75 && mood !== 'Pouty') {
      naturalMoodShift = 'Pouty';
    } else if (comfort < 28 && mood !== 'Shy') {
      naturalMoodShift = 'Shy';
    } else if (boredom > 75 && mood !== 'Pouty' && mood !== 'Annoyed') {
      naturalMoodShift = 'Pouty';
    }
  }

  return {
    nextBrain,
    shouldTriggerAutonomousImpulse,
    suggestedTell,
    naturalMoodShift,
  };
}

export function buildAutonomousBrainPrompt(
  persona: Persona,
  userName: string,
  reason: AutonomousNeedTrigger
): string {
  const circadian = getCircadianContext();
  const climate = getStageClimate(persona.stageEnvironment);

  switch (reason) {
    case 'hunger':
      return `[Context: You're feeling a bit hungry around ${circadian.clockText}. Mention craving a snack in your natural persona.]`;
    case 'sleepiness':
      return `[Context: You are feeling sleepy (${circadian.clockText}). Softly yawn and mention taking a rest in character.]`;
    case 'comfort':
      return `[Context: The studio feels chilly (${climate.label}). Make a brief, natural remark about getting warm and cozy.]`;
    case 'boredom':
      return `[Context: Things have been quiet. Speak up playfully to get ${userName}'s attention in character.]`;
    case 'curiosity':
    default:
      return `[Context: It is ${circadian.clockText}. Make a casual, natural observation about what ${userName} is working on or the day.]`;
  }
}

export interface CareActivityResult {
  toast: string;
  microTell: MicroTellKind;
  prompt: string;
  moodOverride: MoodType;
  nuancedFeeling: string;
  affinityDelta: number;
  brainPatch: Partial<PersonaBrainState>;
  thoughtText: string;
}

export function buildCareActivityEffect(
  activity: CareActivityId,
  userName: string,
  persona: Persona
): CareActivityResult {
  const b = persona.brain;
  switch (activity) {
    case 'snack_tea':
      return {
        toast: '☕ Served Warm Tea / Coffee (-30% Hunger, +15% Energy, +15% Warmth)',
        microTell: 'eat_sip',
        moodOverride: 'Warm',
        nuancedFeeling: 'Warm & Grateful',
        affinityDelta: 2,
        brainPatch: {
          hunger: Math.max(0, b.hunger - 30),
          energy: Math.min(100, b.energy + 15),
          comfort: Math.min(100, b.comfort + 18),
          sleepiness: Math.max(0, b.sleepiness - 12),
          isSleeping: false,
        },
        thoughtText: 'The warm cup feels so comforting in my hands... he really noticed.',
        prompt: `[Context: ${userName} just brought you a warm cup of tea/coffee. React warmly and naturally in character.]`,
      };
    case 'snack_cake':
      return {
        toast: '🍰 Served Strawberry Cake / Pastry (-45% Hunger, +18% Energy, +3 🌸)',
        microTell: 'eat_sip',
        moodOverride: 'Shy',
        nuancedFeeling: 'Delighted & Flustered',
        affinityDelta: 3,
        brainPatch: {
          hunger: Math.max(0, b.hunger - 45),
          energy: Math.min(100, b.energy + 18),
          boredom: Math.max(0, b.boredom - 15),
          isSleeping: false,
        },
        thoughtText: 'Strawberry cake?! Act cool, act cool... okay, one bite is heavenly.',
        prompt: `[Context: ${userName} surprised you with a slice of fresh strawberry cake. React in your cute, flustered persona.]`,
      };
    case 'snack_ramen':
      return {
        toast: '🍜 Served Hot Ramen / Meal (-75% Hunger, +28% Energy, +20% Warmth)',
        microTell: 'eat_sip',
        moodOverride: 'Warm',
        nuancedFeeling: 'Full & Cozy',
        affinityDelta: 2,
        brainPatch: {
          hunger: Math.max(0, b.hunger - 75),
          energy: Math.min(100, b.energy + 28),
          comfort: Math.min(100, b.comfort + 20),
          isSleeping: false,
        },
        thoughtText: 'A proper hot meal... I did not realize how hungry I was until now.',
        prompt: `[Context: ${userName} brought a hot meal/ramen for you. React with happy relief and remind them to eat too.]`,
      };
    case 'snack_midnight':
      return {
        toast: '🍙 Shared Midnight Snack (-40% Hunger, +10% Energy, +2 🌸)',
        microTell: 'eat_sip',
        moodOverride: 'Amused',
        nuancedFeeling: 'Conspiratorial & Cozy',
        affinityDelta: 2,
        brainPatch: {
          hunger: Math.max(0, b.hunger - 40),
          energy: Math.min(100, b.energy + 10),
          comfort: Math.min(100, b.comfort + 12),
          boredom: Math.max(0, b.boredom - 18),
          isSleeping: false,
        },
        thoughtText: 'Sneaking a midnight snack together... honestly, this feels kind of special.',
        prompt: `[Context: You and ${userName} are sharing a quiet midnight snack. Say something playful and cozy in character.]`,
      };
    case 'rest_nap':
      return {
        toast: '💤 Sleep / Dozing Mode Active — Pat her head or chat to wake her gently',
        microTell: 'yawn',
        moodOverride: 'Warm',
        nuancedFeeling: 'Dozing Peacefully',
        affinityDelta: 2,
        brainPatch: {
          isSleeping: true,
        },
        thoughtText: 'Mmm... just closing my eyes for a little while. Stay nearby, okay...?',
        prompt: `[Context: ${userName} told you to rest and take a peaceful nap. Yawn softly and murmur a quiet goodnight.]`,
      };
    case 'wake_up':
      return {
        toast: '🌅 Woke Up Gently (+Rested Energy)',
        microTell: 'sigh',
        moodOverride: 'Shy',
        nuancedFeeling: 'Sleepy & Fond',
        affinityDelta: 1,
        brainPatch: {
          isSleeping: false,
          sleepiness: Math.max(0, b.sleepiness - 30),
          energy: Math.min(100, b.energy + 20),
        },
        thoughtText: 'Mmm... did I really fall asleep right in front of him? Embarrassing...',
        prompt: `[Context: You are waking up gently from your nap in front of ${userName}. Greet them softly.]`,
      };
    case 'entertain_hum':
      return {
        toast: '🎶 Humming a Melody Together (0% Boredom, +3 🌸)',
        microTell: 'cozy_warm',
        moodOverride: 'Warm',
        nuancedFeeling: 'Peaceful & Musical',
        affinityDelta: 3,
        brainPatch: {
          boredom: 0,
          curiosity: Math.min(100, b.curiosity + 12),
          isSleeping: false,
        },
        thoughtText: 'Humming together like this feels effortless... I love this rhythm.',
        prompt: `[Context: ${userName} invited you to hum a quiet song together. Share a warm, musical moment.]`,
      };
    case 'entertain_rps':
      return {
        toast: '✌️ Rock-Paper-Scissors Match! (0% Boredom, +2 🌸)',
        microTell: 'startled',
        moodOverride: 'Amused',
        nuancedFeeling: 'Competitive & Playful',
        affinityDelta: 2,
        brainPatch: {
          boredom: 0,
          energy: Math.max(15, b.energy - 4),
          isSleeping: false,
        },
        thoughtText: 'Jankenpon! There is zero chance I am losing to Producer!',
        prompt: `[Context: ${userName} challenged you to rock-paper-scissors (Jankenpon)! Playfully pick your move in character.]`,
      };
    case 'entertain_story':
      return {
        toast: '📖 Story & Memory Chat (0% Boredom, +2 🌸)',
        microTell: 'sigh',
        moodOverride: 'Warm',
        nuancedFeeling: 'Nostalgic & Fond',
        affinityDelta: 2,
        brainPatch: {
          boredom: 0,
          curiosity: Math.min(100, b.curiosity + 15),
          isSleeping: false,
        },
        thoughtText: 'Sharing stories when the studio is quiet is one of my favorite things.',
        prompt: `[Context: ${userName} asked you to share a story or memory from your time together. Tell a brief, heartwarming anecdote.]`,
      };
    case 'entertain_music':
      return {
        toast: '🎵 Opening Idol Stage Audio to pick a track (0% Boredom)',
        microTell: 'cozy_warm',
        moodOverride: 'Proud',
        nuancedFeeling: 'Excited & Energetic',
        affinityDelta: 2,
        brainPatch: {
          boredom: 0,
          energy: Math.min(100, b.energy + 8),
          isSleeping: false,
        },
        thoughtText: 'Ooh, changing the stage music! Let us pick something unforgettable.',
        prompt: `[Context: ${userName} opened the stage audio mixer to pick music. Ask what mood or beat they want next in character.]`,
      };
    case 'comfort_blanket':
    default:
      return {
        toast: '🧣 Draped Warm Blanket & Cozy Light (100% Comfort, +3 🌸)',
        microTell: 'cozy_warm',
        moodOverride: 'Flustered',
        nuancedFeeling: 'Cozy & Touched',
        affinityDelta: 3,
        brainPatch: {
          comfort: 100,
          boredom: Math.max(0, b.boredom - 12),
          isSleeping: false,
        },
        thoughtText: 'I-It is so warm... why does he always know right when I get chilly?',
        prompt: `[Context: ${userName} gently draped a warm blanket over your shoulders. React in your cozy tsundere persona.]`,
      };
  }
}
