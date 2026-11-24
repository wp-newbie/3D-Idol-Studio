import { Type, type FunctionDeclaration } from '@google/genai';
import type {
  AutonomousToolCallEvent,
  AutonomousToolLocation,
  ChatMessage,
  KeyMode,
  Persona,
  ProceduralEmoteId,
  RoamBehavior,
  StageEnvironmentId,
  StudioSettings,
} from '../types/studio';
import { getAffinityTier, VOCAL_ARCHETYPES } from '../data/presets';
import { getCircadianContext, getStageClimate } from './aiBrainService';
import { resolveEffectiveApiKey } from './apiKeyResolver';
import { pickContextualOfflineReply } from './offlineDemoPool';

export type ResolvedEndpointKind = 'gemini' | 'vertex_express';

export class GeminiApiError extends Error {
  public readonly statusCode?: number;
  public readonly endpoint: string;

  constructor(message: string, endpoint: string, statusCode?: number) {
    super(message);
    this.name = 'GeminiApiError';
    this.endpoint = endpoint;
    this.statusCode = statusCode;
  }
}

export function mapToolLocationToEnvironment(
  loc: AutonomousToolLocation
): StageEnvironmentId {
  switch (loc) {
    case 'gothic_studio':
      return 'gothic_cathedral';
    case 'sunlit_boutique':
      return 'sunlit_boutique';
    case 'cyber_stage':
      return 'cyberpunk_stage';
    case 'rainy_lofi_room':
      return 'lofi_rainy_room';
    case 'midnight_rooftop':
      return 'midnight_rooftop';
    default:
      return 'sunlit_boutique';
  }
}

const AUTONOMOUS_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'move_on_stage',
    description:
      'Autonomously move your 3D VRM body to a new position on the stage or desktop screen with a specific physical behavior (walk, peek from corner, sit on taskbar, or approach user).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetX: {
          type: Type.NUMBER,
          description: 'Horizontal screen position from -1.0 (far left) to 1.0 (far right).',
        },
        targetY: {
          type: Type.NUMBER,
          description: 'Vertical offset from -0.45 (low/taskbar) to 0.45 (elevated).',
        },
        behavior: {
          type: Type.STRING,
          enum: [
            'walk',
            'peek',
            'crossed_arms_wait',
            'stretch_look',
            'sit_taskbar',
            'approach_user',
          ],
          description: 'How to move or perch at the destination.',
        },
      },
      required: ['targetX', 'targetY', 'behavior'],
    },
  },
  {
    name: 'travel_to_location',
    description:
      'Autonomously change the 3D stage background environment and lighting to a new location when it fits your mood or the story.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        location: {
          type: Type.STRING,
          enum: [
            'gothic_studio',
            'sunlit_boutique',
            'cyber_stage',
            'rainy_lofi_room',
            'midnight_rooftop',
          ],
          description: 'Target 3D stage environment.',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'switch_own_outfit',
    description:
      'Autonomously switch into another saved Outfit Slot in your 3D Wardrobe when you want to get comfortable, rehearse, or dress up.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        slotIndex: {
          type: Type.INTEGER,
          description: 'Zero-based index of your saved Outfit Slot to wear (0, 1, 2...).',
        },
        reason: {
          type: Type.STRING,
          description: 'Brief in-character reason for switching outfits.',
        },
      },
      required: ['slotIndex', 'reason'],
    },
  },
  {
    name: 'trigger_emote',
    description:
      'Perform an expressive 3D upper-body anime emote or pose on stage matching your current emotion.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        emoteId: {
          type: Type.STRING,
          enum: ['crossed_arms', 'friendly_wave', 'shy_fidget', 'idol_peace', 'gentle_bow'],
          description: 'Emote pose to play.',
        },
        reason: {
          type: Type.STRING,
          description: 'Why you chose this emote.',
        },
      },
      required: ['emoteId', 'reason'],
    },
  },
  {
    name: 'adjust_sleeping_position',
    description:
      'While resting or sleeping in bed, autonomously change your sleeping position (e.g. roll onto your side facing Producer, curl up cozily, hug your pillow, sprawl relaxedly, or lie peacefully on your back).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        position: {
          type: Type.STRING,
          enum: [
            'back_relaxed',
            'side_curled_right',
            'side_curled_left',
            'hugging_pillow',
            'sprawled',
          ],
          description: 'The target sleeping position to transition into.',
        },
        reason: {
          type: Type.STRING,
          description: 'Sleepy in-character reason for shifting positions.',
        },
      },
      required: ['position'],
    },
  },
];

export interface AutonomousToolExecutor {
  moveOnStage: (args: {
    targetX: number;
    targetY: number;
    behavior: RoamBehavior;
  }) => string;
  travelToLocation: (args: { location: AutonomousToolLocation }) => string;
  switchOwnOutfit: (args: { slotIndex: number; reason: string }) => string;
  triggerEmote: (args: { emoteId: ProceduralEmoteId; reason: string }) => string;
  adjustSleepingPosition?: (args: { position: string; reason: string }) => string;
}

export function detectEndpointKind(_apiKey: string, _mode: KeyMode): ResolvedEndpointKind {
  return 'gemini';
}

export function getEndpointLabel(_apiKey: string, _mode: KeyMode): string {
  return 'Gemini API (generativelanguage.googleapis.com · X-goog-api-key)';
}

function parseFriendlyError(err: unknown, endpoint: string): GeminiApiError {
  let raw = err instanceof Error ? err.message : String(err);
  let statusCode: number | undefined = err instanceof GeminiApiError ? err.statusCode : undefined;

  // Extract clean message if Google returned a JSON error object
  try {
    const jsonMatch = /\{[\s\S]*"message"\s*:\s*"([^"]+)"[\s\S]*\}/.exec(raw);
    if (jsonMatch && jsonMatch[1]) {
      raw = jsonMatch[1];
    } else {
      const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number } };
      if (parsed.error?.message) {
        raw = parsed.error.message;
        if (typeof parsed.error.code === 'number') statusCode = parsed.error.code;
      }
    }
  } catch {
    // regex fallback already attempted
  }

  const statusMatch = /\b(400|401|403|404|429|500|503)\b/.exec(raw);
  if (!statusCode && statusMatch) statusCode = Number(statusMatch[1]);

  if (
    statusCode === 401 ||
    /API_KEY_INVALID|UNAUTHENTICATED|API key not valid|invalid api key/i.test(raw)
  ) {
    return new GeminiApiError(
      'Invalid API Key — Google reported "API key not valid". Please verify your key at https://aistudio.google.com/apikey.',
      endpoint,
      statusCode || 401
    );
  }
  if (statusCode === 403 || /PERMISSION_DENIED/i.test(raw)) {
    return new GeminiApiError(
      `HTTP 403 Forbidden — Key lacks access to this model or endpoint (${raw.slice(0, 160)})`,
      endpoint,
      403
    );
  }
  if (statusCode === 404 || /NOT_FOUND|not found/i.test(raw)) {
    return new GeminiApiError(
      `HTTP 404 Model Not Found — Please use gemini-flash-latest or gemini-3.8-flash (${raw.slice(
        0,
        160
      )})`,
      endpoint,
      404
    );
  }
  if (statusCode === 429 || /RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return new GeminiApiError(
      `HTTP 429 Rate Limit / Quota Exceeded — Wait a moment or check billing quota (${raw.slice(
        0,
        160
      )})`,
      endpoint,
      429
    );
  }

  return new GeminiApiError(
    `Gemini API request failed: ${raw.slice(0, 200)}`,
    endpoint,
    statusCode
  );
}

function formatAddressedUserName(settings: StudioSettings): string {
  const base = settings.userName.trim() || 'Producer';
  const honorific = (settings.userHonorific || '').trim();
  if (!honorific) return base;
  if (honorific.startsWith('-')) return `${base}${honorific}`;
  return `${base} ${honorific}`;
}

function buildSystemInstruction(persona: Persona, settings: StudioSettings): string {
  const archetype = VOCAL_ARCHETYPES[persona.voice.archetype];
  const tier = getAffinityTier(persona.affinity);
  const userName = formatAddressedUserName(settings);
  const resolvedPrompt = persona.systemPrompt.replace(/\{\{user\}\}/gi, userName);
  const resolvedScenario = (persona.startingScenario || '').replace(/\{\{user\}\}/gi, userName);

  const outfitList = persona.outfitSlots
    .map((s, idx) => `  [${idx}] ${s.name}${s.id === persona.activeOutfitSlotId ? ' (currently wearing)' : ''}`)
    .join('\n');

  const memoryBlock =
    persona.memoryJournal && persona.memoryJournal.length > 0
      ? `\nLONG-TERM CORE MEMORY JOURNAL:\n${persona.memoryJournal
          .slice(-15)
          .map((m) => `- ${m.fact}`)
          .join('\n')}`
      : '';

  const formatBlock =
    persona.voice.language === 'ja'
      ? `RESPONSE FORMAT (STRICT — Japanese Anime Mode 日本語):
- Keep every turn concise and punchy (2 to 4 sentences MAXIMUM).
- NEVER write dialogue, thoughts, or actions for ${userName} ({{user}}).
- Format EVERY turn using this exact structure plus hidden trailing tags:
  1. *Physical micro-action and expression in English italics*
  2. "Spoken Japanese dialogue in natural, expressive anime Japanese (Kanji/Kana)"
  3. (English subtitle translation in parentheses underneath)
  4. [MOOD: Deadpan | Flustered | Annoyed | Shy | Amused | Warm | Pouty | Proud]
  5. [INTENSITY: 0.75] [AFFINITY: +1] [THOUGHT: brief 1-line inner thought in English]`
      : `RESPONSE FORMAT (STRICT — English Mode):
- Keep every turn concise and punchy (2 to 4 sentences MAXIMUM).
- NEVER write dialogue, thoughts, or actions for ${userName} ({{user}}).
- Write physical micro-actions in *English italics*, spoken dialogue in "double quotes", and end with:
  [MOOD: Deadpan | Flustered | Annoyed | Shy | Amused | Warm | Pouty | Proud] [FEELING: nuanced human state e.g. Tired & Fond | Quietly Worried | Hungry & Pouty | Playfully Annoyed | Peaceful] [INTENSITY: 0.75] [AFFINITY: +1] [THOUGHT: brief 1-line inner thought]`;

  const circadian = getCircadianContext();
  const climate = getStageClimate(persona.stageEnvironment);
  const b = persona.brain;
  const carryoverLine =
    b.carryover && b.carryover.turnsRemaining > 0
      ? `\n- ACTIVE EMOTIONAL CARRYOVER (${b.carryover.turnsRemaining} turns remaining): "${b.carryover.feeling}"${
          b.carryover.empathySoftening
            ? ' — SOFTEN YOUR TSUNDERE SHIELD: show quiet, sincere human empathy and warmth.'
            : ' — Let this lingering feeling color your tone rather than snapping back to neutral.'
        }`
      : '';

  return `${resolvedPrompt}

CHARACTER PROFILE:
- Name: ${persona.name} (${persona.japaneseName})
- Role / Subtitle: ${persona.title}
- Persona Traits: ${persona.traits || 'Classic Japanese Tsundere, Sharp-tongued, Secretly Sweet'}
- Starting Scenario: ${resolvedScenario || 'Inside the dark-glass 3D studio stage.'}
- Vocal Cadence: ${archetype.label} (${archetype.description})
- Current Mood: ${persona.mood} · Nuanced Feeling: ${b.nuancedFeeling}
- Current Affection: ${persona.affinity}/100 (${tier.label} ${tier.emoji})
- ${tier.promptDirective}
- Available Outfit Slots:
${outfitList}
- User Name: ${userName}${memoryBlock}

LIVE HUMAN NEEDS, SENSATIONS & CIRCADIAN RHYTHM:
- Local Real-World Time: ${circadian.clockText} (${circadian.phaseLabel}${
    circadian.mealWindow ? ` · ${circadian.mealWindow}` : ''
  })
- Hunger & Cravings: ${Math.round(b.hunger)}% ${b.hunger > 70 ? '(VERY HUNGRY — stomach growling, craving food/drink)' : ''}
- Sleepiness & Fatigue: ${Math.round(b.sleepiness)}% ${b.sleepiness > 70 ? '(DROWSY — eyelids heavy, soft yawns)' : ''}
- Boredom & Restlessness: ${Math.round(b.boredom)}% ${b.boredom > 65 ? '(RESTLESS — fidgeting, craving interaction)' : ''}
- Comfort & Temperature: ${Math.round(b.comfort)}% (Stage climate: ${climate.label}${
    b.comfort < 35 ? ' — feeling chilly!' : b.comfort > 75 ? ' — warm & cozy' : ''
  })${carryoverLine}

HUMAN EMOTIONAL DEPTH GUIDELINES:
- Preserve your distinct personality (proud diva / classic tsundere charm), while reacting like a real, grounded person with genuine feelings:
  1. Genuine Empathy: If ${userName} mentions being tired, stressed, sick, or having a rough day, drop the defensive tsundere act—speak softly and offer sincere, quiet comfort.
  2. Vulnerability & Insecurity: Allow quiet human moments—wondering if your singing or company truly helps, feeling lonely when ignored, or getting shy after admitting you missed them.
  3. Quiet Contentment & Nostalgia: Embrace unhurried, peaceful moments and occasionally recall memories from your Memory Journal.
  4. Always include [FEELING: ...] matching your nuanced physical/emotional state (e.g., Tired & Fond, Quietly Worried, Hungry & Pouty, Playfully Annoyed, Peaceful).

AUTONOMOUS AGENCY TOOLS:
You have real tools to move across the stage/desktop (` +
    '`move_on_stage`' +
    `), travel to new 3D locations (` +
    '`travel_to_location`' +
    `), trigger expressive emotes (` +
    '`trigger_emote`' +
    `), and change your own outfit (` +
    '`switch_own_outfit`' +
    `). Use them spontaneously whenever it fits your mood, physical needs, or when ${userName} invites you somewhere—then comment naturally in character!

${formatBlock}`;
}

interface ContentTurn {
  role: 'user' | 'model';
  parts: Record<string, unknown>[];
}

function buildFullConversationContents(
  history: ChatMessage[],
  latestUserPrompt: string,
  hiddenSystemNotes: string[]
): ContentTurn[] {
  const turns: ContentTurn[] = [];

  const pushTurn = (role: 'user' | 'model', text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const last = turns[turns.length - 1];
    if (last && last.role === role && typeof last.parts[0]?.text === 'string') {
      last.parts[0].text = `${last.parts[0].text as string}\n\n${cleaned}`;
    } else {
      turns.push({ role, parts: [{ text: cleaned }] });
    }
  };

  for (const msg of history) {
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    pushTurn(role, msg.rawText);
  }

  const combinedLatest =
    hiddenSystemNotes.length > 0
      ? `${hiddenSystemNotes.join('\n')}\n\n${latestUserPrompt}`
      : latestUserPrompt;

  pushTurn('user', combinedLatest);

  if (turns.length > 0 && turns[0].role === 'model') {
    turns.unshift({ role: 'user', parts: [{ text: '[Studio session started]' }] });
  }

  return turns;
}

function executeAutonomousCall(
  name: string,
  rawArgs: Record<string, unknown>,
  executor?: AutonomousToolExecutor
): AutonomousToolCallEvent {
  if (name === 'move_on_stage') {
    const targetX = typeof rawArgs.targetX === 'number' ? rawArgs.targetX : 0;
    const targetY = typeof rawArgs.targetY === 'number' ? rawArgs.targetY : 0;
    const behavior = (['walk', 'peek', 'sit_taskbar', 'approach_user'].includes(
      String(rawArgs.behavior)
    )
      ? String(rawArgs.behavior)
      : 'walk') as RoamBehavior;
    const summary =
      executor?.moveOnStage({ targetX, targetY, behavior }) ||
      `Moved on stage (${behavior} to x=${targetX.toFixed(2)})`;
    return { name: 'move_on_stage', args: { targetX, targetY, behavior }, summary };
  }

  if (name === 'travel_to_location') {
    const location = (rawArgs.location as AutonomousToolLocation) || 'midnight_rooftop';
    const summary =
      executor?.travelToLocation({ location }) || `Traveled to ${location}`;
    return { name: 'travel_to_location', args: { location }, summary };
  }

  if (name === 'trigger_emote') {
    const valid: ProceduralEmoteId[] = [
      'crossed_arms',
      'friendly_wave',
      'shy_fidget',
      'idol_peace',
      'gentle_bow',
    ];
    const emoteId = (valid.includes(rawArgs.emoteId as ProceduralEmoteId)
      ? rawArgs.emoteId
      : 'crossed_arms') as ProceduralEmoteId;
    const reason = String(rawArgs.reason || 'expressing mood');
    const summary =
      executor?.triggerEmote({ emoteId, reason }) || `Played emote "${emoteId}"`;
    return { name: 'trigger_emote', args: { emoteId, reason }, summary };
  }

  if (name === 'adjust_sleeping_position') {
    const valid = [
      'back_relaxed',
      'side_curled_right',
      'side_curled_left',
      'hugging_pillow',
      'sprawled',
    ];
    const position = valid.includes(String(rawArgs.position))
      ? String(rawArgs.position)
      : 'side_curled_right';
    const reason = String(rawArgs.reason || 'shifted sleeping position');
    const summary =
      executor?.adjustSleepingPosition?.({ position, reason }) ||
      `Shifted sleep position to ${position} (${reason})`;
    return { name: 'adjust_sleeping_position', args: { position, reason }, summary };
  }

  const slotIndex =
    typeof rawArgs.slotIndex === 'number' ? Math.max(0, Math.floor(rawArgs.slotIndex)) : 0;
  const reason = String(rawArgs.reason || 'wanted a fresh look');
  const summary =
    executor?.switchOwnOutfit({ slotIndex, reason }) ||
    `Switched to outfit slot #${slotIndex}`;
  return { name: 'switch_own_outfit', args: { slotIndex, reason }, summary };
}

/**
 * In offline demo mode (no API key configured), still demonstrate autonomous tool actions
 * when the user explicitly invites her to move, visit a location, or pick her own outfit.
 */
function maybeRunOfflineDemoAutonomousTool(
  persona: Persona,
  userPrompt: string,
  executor?: AutonomousToolExecutor
): AutonomousToolCallEvent[] {
  if (!executor) return [];
  const lower = userPrompt.toLowerCase();
  const events: AutonomousToolCallEvent[] = [];

  if (
    lower.includes('internal boredom') ||
    lower.includes('internal curiosity') ||
    lower.includes('your boredom just crossed') ||
    lower.includes('your curiosity spiked') ||
    lower.includes('your hunger just reached') ||
    lower.includes('your sleepiness just reached') ||
    lower.includes('your comfort/warmth dropped')
  ) {
    events.push(
      executeAutonomousCall(
        'move_on_stage',
        { targetX: 0.28, targetY: 0, behavior: 'peek' },
        executor
      )
    );
    if (lower.includes('boredom') || lower.includes('hunger')) {
      events.push(
        executeAutonomousCall(
          'trigger_emote',
          {
            emoteId: 'crossed_arms',
            reason: lower.includes('hunger') ? 'hungry and pouting' : 'bored and restless',
          },
          executor
        )
      );
    } else if (lower.includes('curiosity')) {
      events.push(
        executeAutonomousCall(
          'trigger_emote',
          { emoteId: 'friendly_wave', reason: 'curious about user' },
          executor
        )
      );
    }
    return events;
  }

  if (userPrompt.includes('[SYSTEM EVENT:') || userPrompt.includes('[CARE EVENT:')) return [];

  if (/\b(rooftop|stars|night sky)\b|屋上/i.test(lower)) {
    events.push(
      executeAutonomousCall('travel_to_location', { location: 'midnight_rooftop' }, executor)
    );
  } else if (/\b(cathedral|gothic)\b|大聖堂/i.test(lower)) {
    events.push(
      executeAutonomousCall('travel_to_location', { location: 'gothic_studio' }, executor)
    );
  } else if (/\b(cyber|concert stage)\b/i.test(lower)) {
    events.push(
      executeAutonomousCall('travel_to_location', { location: 'cyber_stage' }, executor)
    );
  } else if (/\b(rainy|lofi|lo-fi)\b|雨/i.test(lower)) {
    events.push(
      executeAutonomousCall('travel_to_location', { location: 'rainy_lofi_room' }, executor)
    );
  }

  if (/\b(sit|taskbar|perch)\b|座って/i.test(lower)) {
    events.push(
      executeAutonomousCall(
        'move_on_stage',
        { targetX: 0.45, targetY: -0.2, behavior: 'sit_taskbar' },
        executor
      )
    );
  } else if (/\b(peek|corner|hide)\b|覗/i.test(lower)) {
    events.push(
      executeAutonomousCall(
        'move_on_stage',
        { targetX: -0.9, targetY: 0.05, behavior: 'peek' },
        executor
      )
    );
  } else if (/\b(walk|come over|come here|roam|move over)\b|歩いて|こっち/i.test(lower)) {
    events.push(
      executeAutonomousCall(
        'move_on_stage',
        { targetX: 0.55, targetY: 0, behavior: 'walk' },
        executor
      )
    );
  }

  if (/\b(change your own outfit|pick your outfit|wear something else|get comfortable)\b|着替えて/i.test(lower)) {
    const currentIdx = persona.outfitSlots.findIndex((s) => s.id === persona.activeOutfitSlotId);
    const nextIdx = (currentIdx + 1) % Math.max(1, persona.outfitSlots.length);
    events.push(
      executeAutonomousCall(
        'switch_own_outfit',
        { slotIndex: nextIdx, reason: 'felt like changing outfits on my own' },
        executor
      )
    );
  }

  return events;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_TEXT_MODEL = 'gemini-flash-latest';

const liveModelListCache = new Map<
  string,
  { fetchedAt: number; textModels: string[]; ttsModels: string[] }
>();

/**
 * Extracts a recommended replacement model ID from Google API 404 deprecation errors, e.g.:
 * "Please update your code to use models/gemini-3.8-flash for the latest feature"
 */
export function extractRecommendedModelFromError(errText: string): string | null {
  const match =
    /(?:use|try|switch to)\s+(?:models\/)?(gemini-[a-z0-9._-]+)/i.exec(errText) ||
    /models\/(gemini-(?:3|4|[2-9]\.[5-9])[a-z0-9._-]*)/i.exec(errText);
  return match?.[1]?.trim() || null;
}

/**
 * Queries Google's /v1beta/models endpoint using X-goog-api-key and caches available
 * generateContent text & TTS models for self-healing and the Settings picker.
 */
export async function listAvailableGeminiModels(
  apiKey: string,
  forceRefresh = false
): Promise<{ textModels: string[]; ttsModels: string[] }> {
  const cleanApiKey = apiKey.trim().replace(/^["']|["']$/g, '').trim();
  if (!cleanApiKey || /•/.test(cleanApiKey)) {
    return { textModels: [], ttsModels: [] };
  }

  const cached = liveModelListCache.get(cleanApiKey);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) {
    return { textModels: cached.textModels, ttsModels: cached.ttsModels };
  }

  try {
    const res = await fetch(`${GEMINI_API_BASE}?pageSize=100`, {
      method: 'GET',
      headers: {
        'X-goog-api-key': cleanApiKey,
      },
    });
    if (!res.ok) {
      return cached ? { textModels: cached.textModels, ttsModels: cached.ttsModels } : { textModels: [], ttsModels: [] };
    }
    const json = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const allIds = (json.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, '').trim())
      .filter((id) => id.startsWith('gemini-'));

    const ttsModels = allIds.filter((id) => /tts/i.test(id));
    const textCandidates = allIds.filter(
      (id) =>
        !/tts|embedding|imagen|veo|robotics|computer-use|image-generation/i.test(id)
    );

    // Sort newest / flash-latest models first
    const scoreModel = (id: string): number => {
      if (id === 'gemini-flash-latest') return 1000;
      if (/^gemini-3\./i.test(id) && /flash/i.test(id) && !/lite/i.test(id)) return 900;
      if (/^gemini-4\./i.test(id) && /flash/i.test(id)) return 950;
      if (/flash-latest/i.test(id)) return 850;
      if (/flash/i.test(id) && !/lite|exp|001|002/i.test(id)) return 750;
      if (/pro-latest/i.test(id)) return 700;
      if (/flash/i.test(id)) return 600;
      return 400;
    };

    const textModels = Array.from(new Set(textCandidates)).sort(
      (a, b) => scoreModel(b) - scoreModel(a) || b.localeCompare(a)
    );

    const result = {
      fetchedAt: Date.now(),
      textModels,
      ttsModels: Array.from(new Set(ttsModels)),
    };
    liveModelListCache.set(cleanApiKey, result);
    return { textModels: result.textModels, ttsModels: result.ttsModels };
  } catch {
    return cached ? { textModels: cached.textModels, ttsModels: cached.ttsModels } : { textModels: [], ttsModels: [] };
  }
}

async function sendSingleGeminiRequest(params: {
  cleanApiKey: string;
  model: string;
  body: Record<string, unknown>;
}): Promise<{
  ok: true;
  text: string;
  functionCalls: { name: string; args: Record<string, unknown> }[];
  rawParts: Record<string, unknown>[];
} | {
  ok: false;
  status: number;
  errMessage: string;
  rawErrText: string;
}> {
  const { cleanApiKey, model, body } = params;
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': cleanApiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMessage = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      if (parsed.error?.message) {
        errMessage = `HTTP ${res.status} — ${parsed.error.message}`;
      } else {
        errMessage = `HTTP ${res.status} — ${errText.slice(0, 200)}`;
      }
    } catch {
      errMessage = `HTTP ${res.status} — ${errText.slice(0, 200)}`;
    }
    return { ok: false, status: res.status, errMessage, rawErrText: errText };
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: Record<string, unknown>[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  const functionCalls = parts
    .filter((p) => p.functionCall && typeof p.functionCall === 'object')
    .map((p) => {
      const fc = p.functionCall as { name?: string; args?: Record<string, unknown> };
      return { name: fc.name || '', args: fc.args || {} };
    })
    .filter((fc) => Boolean(fc.name));

  return { ok: true, text, functionCalls, rawParts: parts };
}

async function callGeminiRestApi(params: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  contents: ContentTurn[];
  includeTools?: boolean;
  maxOutputTokens?: number;
}): Promise<{
  text: string;
  functionCalls: { name: string; args: Record<string, unknown> }[];
  rawParts: Record<string, unknown>[];
  resolvedModel: string;
}> {
  const {
    apiKey,
    model,
    systemInstruction,
    contents,
    includeTools = false,
    maxOutputTokens = 420,
  } = params;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (includeTools) {
    body.tools = [{ functionDeclarations: AUTONOMOUS_TOOL_DECLARATIONS }];
  }

  const cleanApiKey = apiKey.trim().replace(/^["']|["']$/g, '').trim();
  const primaryModel = model.trim() || DEFAULT_TEXT_MODEL;
  const firstAttempt = await sendSingleGeminiRequest({
    cleanApiKey,
    model: primaryModel,
    body,
  });

  if (firstAttempt.ok) {
    return {
      text: firstAttempt.text,
      functionCalls: firstAttempt.functionCalls,
      rawParts: firstAttempt.rawParts,
      resolvedModel: primaryModel,
    };
  }

  // Automatic 404 model self-healing: if a model is deprecated/retired, discover & retry a live model
  if (firstAttempt.status === 404) {
    const hintedModel = extractRecommendedModelFromError(
      `${firstAttempt.errMessage} ${firstAttempt.rawErrText}`
    );
    const discovered = await listAvailableGeminiModels(cleanApiKey);
    const fallbacks = Array.from(
      new Set(
        [
          hintedModel,
          DEFAULT_TEXT_MODEL,
          'gemini-3.8-flash',
          ...discovered.textModels.slice(0, 4),
        ].filter((m): m is string => Boolean(m && m !== primaryModel))
      )
    );

    for (const candidate of fallbacks) {
      const retry = await sendSingleGeminiRequest({
        cleanApiKey,
        model: candidate,
        body,
      });
      if (retry.ok) {
        console.info(
          `[Gemini] Auto-migrated retired model "${primaryModel}" -> "${candidate}"`
        );
        return {
          text: retry.text,
          functionCalls: retry.functionCalls,
          rawParts: retry.rawParts,
          resolvedModel: candidate,
        };
      }
      // If auth failed (401/403), stop trying other models immediately
      if (retry.status === 401 || retry.status === 403) {
        throw new GeminiApiError(
          retry.errMessage,
          'Gemini API (generativelanguage.googleapis.com)',
          retry.status
        );
      }
    }
  }

  throw new GeminiApiError(
    firstAttempt.errMessage,
    'Gemini API (generativelanguage.googleapis.com)',
    firstAttempt.status
  );
}

export async function validateGeminiApiKey(params: {
  apiKey: string;
  keyMode: KeyMode;
  model?: string;
}): Promise<{ ok: boolean; endpoint: string; model: string; error?: string }> {
  const apiKey = params.apiKey.trim().replace(/^["']|["']$/g, '').trim();
  const model = (params.model || DEFAULT_TEXT_MODEL).trim() || DEFAULT_TEXT_MODEL;
  const endpoint = getEndpointLabel(apiKey, params.keyMode);

  if (!apiKey) {
    return { ok: false, endpoint, model, error: 'API key is empty.' };
  }

  try {
    const res = await callGeminiRestApi({
      apiKey,
      model,
      contents: [{ role: 'user', parts: [{ text: 'Reply with OK' }] }],
      maxOutputTokens: 16,
    });
    if (!res.text) throw new Error('Empty validation response from Gemini.');
    return { ok: true, endpoint, model: res.resolvedModel };
  } catch (err) {
    const friendly = parseFriendlyError(err, endpoint);
    return { ok: false, endpoint, model, error: friendly.message };
  }
}

export async function generatePersonaReply(params: {
  persona: Persona;
  settings: StudioSettings;
  userPrompt: string;
  hiddenSystemNotes?: string[];
  toolExecutor?: AutonomousToolExecutor;
}): Promise<{
  rawText: string;
  isFallback: boolean;
  providerNote: string;
  toolEvents: AutonomousToolCallEvent[];
  resolvedModel?: string;
}> {
  const { persona, settings, userPrompt, hiddenSystemNotes = [], toolExecutor } = params;
  const apiKey = resolveEffectiveApiKey(settings);

  // Offline multi-response demo mode ONLY when no API key is configured
  if (!apiKey) {
    const toolEvents = maybeRunOfflineDemoAutonomousTool(persona, userPrompt, toolExecutor);
    const effectivePrompt =
      hiddenSystemNotes.length > 0
        ? `${hiddenSystemNotes[hiddenSystemNotes.length - 1]} ${userPrompt}`
        : userPrompt;

    // Special spontaneous PC Context offline reply
    if (userPrompt.includes('[PC CONTEXT:')) {
      const appMatch = /using "([^"]+)"/i.exec(userPrompt);
      const appName = appMatch?.[1] || 'your PC';
      const isJa = persona.voice.language === 'ja';
      const isGame = /aion|playing|steam|game|genshin|valorant/i.test(appName);
      const rawText = isJa
        ? isGame
          ? `*She peeks over your screen with narrowed eyes and hands on her hips.* "ちょっとプロデューサー、また夜更かしして『${appName}』やってるの？ ……べ、別に心配してるわけじゃないけど、ちゃんと休みなさいよねっ！" (Hey Producer, staying up late on "${appName}" again? ...I-It's not like I'm worried, just make sure you rest, okay?!) [MOOD: Annoyed] [AFFINITY: +1]`
          : `*She glances curiously at your active window before looking away with a light scoff.* "ふーん、『${appName}』で作業中なの？ ……邪魔はしないけど、たまには私にも構いなさいよね。" (Hmm, working in "${appName}"? ...I won't interrupt, just pay attention to me once in a while, okay?) [MOOD: Amused] [AFFINITY: +1]`
        : isGame
        ? `*She peeks over from the corner of your desktop with hands on her hips.* "Playing ${appName} late again, Producer?! Not that I'm worried—just don't forget about rehearsal!" [MOOD: Annoyed] [AFFINITY: +1]`
        : `*She glances over at your active window with a teasing scoff.* "Busy in ${appName}, huh? Fine, I'll perch here quietly—just don't ignore me for too long!" [MOOD: Amused] [AFFINITY: +1]`;
      return {
        rawText,
        isFallback: true,
        providerNote: 'Demo Mode · PC Context Reaction',
        toolEvents,
      };
    }

    if (toolEvents.length > 0) {
      const isJa = persona.voice.language === 'ja';
      const actionDesc = toolEvents.map((e) => e.summary).join(' & ');
      const rawText = isJa
        ? `*She follows her whim across the stage (${actionDesc}), glancing back with a proud little smirk.* "ふんっ、ちょっと気分転換したかっただけよ！ ……ほら、アンタもこっちに来なさい。" (Hmph, I just felt like a change of pace! ...Come on, get over here too.) [MOOD: Amused] [AFFINITY: +2]`
        : `*She moves on her own (${actionDesc}) and glances back with a proud little smirk.* "Hmph—I just felt like switching things up on my own! Don't just stand there, keep up!" [MOOD: Amused] [AFFINITY: +2]`;
      return {
        rawText,
        isFallback: true,
        providerNote: 'Demo Mode · Autonomous Tool Action',
        toolEvents,
      };
    }

    return {
      rawText: pickContextualOfflineReply(persona, effectivePrompt),
      isFallback: true,
      providerNote: 'Demo Mode (no API key configured)',
      toolEvents: [],
    };
  }

  // Live Gemini API call (generativelanguage.googleapis.com + X-goog-api-key header) with Autonomous Function Calling
  const endpointLabel = getEndpointLabel(apiKey, settings.keyMode);
  const systemInstruction = buildSystemInstruction(persona, settings);
  const contents = buildFullConversationContents(
    persona.messages,
    userPrompt,
    hiddenSystemNotes
  );
  const model = settings.textModel.trim() || DEFAULT_TEXT_MODEL;
  const executedTools: AutonomousToolCallEvent[] = [];

  try {
    const first = await callGeminiRestApi({
      apiKey,
      model,
      systemInstruction,
      contents,
      includeTools: true,
    });
    const activeModel = first.resolvedModel;

    if (first.functionCalls.length > 0) {
      const responseParts: Record<string, unknown>[] = [];
      for (const fc of first.functionCalls) {
        const ev = executeAutonomousCall(fc.name, fc.args, toolExecutor);
        executedTools.push(ev);
        responseParts.push({
          functionResponse: {
            name: fc.name,
            response: { ok: true, result: ev.summary },
          },
        });
      }

      const followUpContents: ContentTurn[] = [
        ...contents,
        { role: 'model', parts: first.rawParts },
        { role: 'user', parts: responseParts },
      ];
      const second = await callGeminiRestApi({
        apiKey,
        model: activeModel,
        systemInstruction,
        contents: followUpContents,
        includeTools: false,
      });

      const finalText = (second.text || first.text || '').trim();
      if (!finalText) {
        throw new GeminiApiError(
          `Model "${activeModel}" returned an empty tool follow-up.`,
          endpointLabel
        );
      }
      return {
        rawText: finalText,
        isFallback: false,
        providerNote: `Live Gemini (${second.resolvedModel}) · Tool Active`,
        toolEvents: executedTools,
        resolvedModel: second.resolvedModel,
      };
    }

    if (!first.text) {
      throw new GeminiApiError(`Model "${activeModel}" returned an empty response.`, endpointLabel);
    }
    return {
      rawText: first.text,
      isFallback: false,
      providerNote: `Live Gemini (${activeModel})`,
      toolEvents: [],
      resolvedModel: activeModel,
    };
  } catch (err) {
    throw parseFriendlyError(err, endpointLabel);
  }
}

export async function summarizeConversationMemories(params: {
  persona: Persona;
  settings: StudioSettings;
}): Promise<string[]> {
  const { persona, settings } = params;
  const recent = persona.messages.slice(-12);
  if (recent.length === 0) return [];

  const transcript = recent
    .map((m) => `${m.role === 'assistant' ? persona.name : settings.userName}: ${m.rawText}`)
    .join('\n');

  const existingFacts = persona.memoryJournal.map((m) => m.fact).join('; ');
  const apiKey = resolveEffectiveApiKey(settings);

  if (apiKey) {
    const prompt = `Extract 2 to 3 short, concise long-term memory facts (under 14 words each, one bullet per line starting with "- ") about ${settings.userName}'s preferences, inside jokes, favorite songs, or notable outfit/roleplay moments from this transcript. Avoid repeating existing memories: [${existingFacts}].\n\nTRANSCRIPT:\n${transcript}`;
    const model = settings.textModel.trim() || DEFAULT_TEXT_MODEL;

    try {
      const res = await callGeminiRestApi({
        apiKey,
        model,
        systemInstruction:
          'You are a concise roleplay memory archivist. Return ONLY markdown bullet points.',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        maxOutputTokens: 220,
      });
      const raw = res.text;

      const lines = raw
        .split('\n')
        .map((l) => l.replace(/^[\s\-*•]+/, '').trim())
        .filter((l) => l.length > 6 && l.length < 140);
      if (lines.length > 0) return lines.slice(0, 3);
    } catch {
      // fall through to heuristic extractor
    }
  }

  const facts: string[] = [];
  const joined = recent.map((m) => m.rawText).join(' ');
  const outfitMatch = /changed your outfit to "([^"]+)"/i.exec(joined);
  if (outfitMatch) {
    facts.push(`${settings.userName} styled ${persona.name} in "${outfitMatch[1]}".`);
  }
  if (/patted your head/i.test(joined)) {
    facts.push(
      `${settings.userName} gave ${persona.name} a gentle headpat that made her secretly shy.`
    );
  }
  const userMsgs = recent.filter((m) => m.role === 'user');
  if (userMsgs.length > 0) {
    const lastUser = userMsgs[userMsgs.length - 1].rawText.slice(0, 72);
    facts.push(`Recent studio topic with ${settings.userName}: "${lastUser}"`);
  }
  return facts.slice(0, 2);
}
