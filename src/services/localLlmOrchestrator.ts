/**
 * Autonomous Multi-Model LM Studio Orchestrator (:1234)
 * Discovers ALL ready chat models loaded in LM Studio (e.g. gemma-4-e4b-it + qwen2.5-7b-instruct-1m)
 * and lets the AI character autonomously choose whether to use Gemma, Qwen, or BOTH together
 * depending on her mood and what she is generating (actions/dialogue, wardrobe, scenes, activities, chairs).
 */

export type AiGenTaskKind =
  | 'dialogue'
  | 'wardrobe'
  | 'hairstyle'
  | 'scene'
  | 'dining'
  | 'hobby'
  | 'study'
  | 'bath'
  | 'travel'
  | 'chair'
  | 'whim';

export interface AiModelChoiceStrategy {
  mode: 'gemma' | 'qwen' | 'dual';
  selectedModels: string[];
  choiceReason: string;
}

export interface DualModelJsonResult {
  json: Record<string, unknown>;
  modelsUsed: string[];
  modelLabel: string;
  choiceMode: 'gemma' | 'qwen' | 'dual';
  choiceReason: string;
}

export interface DualModelTextResult {
  text: string;
  modelsUsed: string[];
  modelLabel: string;
  choiceMode: 'gemma' | 'qwen' | 'dual';
  choiceReason: string;
}

export interface CharacterChatResult {
  text: string;
  resolvedModel: string;
  choiceMode: 'gemma' | 'qwen' | 'dual';
  choiceReason: string;
}

export const LM_STUDIO_HOSTS = ['http://127.0.0.1:1234', 'http://localhost:1234'];

let cachedModels: { ids: string[]; at: number } = { ids: [], at: 0 };

/**
 * Discovers all currently loaded chat models in LM Studio (excluding embedding models).
 */
export async function discoverLoadedLmStudioModels(): Promise<string[]> {
  const now = Date.now();
  if (cachedModels.ids.length > 0 && now - cachedModels.at < 15_000) {
    return cachedModels.ids;
  }

  // 1. Electron IPC check (zero CORS in standalone desktop app)
  const checkIpc =
    (typeof window !== 'undefined' &&
      (window.studioAPI?.checkLocalAi || window.desktopBridge?.checkLocalAi)) ||
    null;
  if (checkIpc) {
    try {
      const res = await checkIpc();
      if (res?.ok) {
        const list =
          Array.isArray(res.models) && res.models.length > 0
            ? res.models
            : res.model
            ? [res.model]
            : [];
        if (list.length > 0) {
          cachedModels = { ids: list, at: now };
          return list;
        }
      }
    } catch {
      // fall through to HTTP discovery
    }
  }

  // 2. Direct LM Studio HTTP /v1/models
  for (const base of LM_STUDIO_HOSTS) {
    try {
      const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(2200) });
      if (!res.ok) continue;
      const data = (await res.json()) as { data?: { id?: string }[] };
      const ids = (data.data || [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === 'string' && !/embed/i.test(id));
      if (ids.length > 0) {
        cachedModels = { ids, at: now };
        return ids;
      }
    } catch {
      // try next host
    }
  }

  return [];
}

/**
 * Lets the AI character autonomously decide which loaded LM Studio model(s) she wants to use
 * (Gemma, Qwen, or Both together) based on her current mood and task!
 */
export function chooseAiModelForCharacter(params: {
  loadedModels: string[];
  taskKind?: AiGenTaskKind;
  mood?: string;
  allowDual?: boolean;
}): AiModelChoiceStrategy {
  const { loadedModels, taskKind = 'whim', mood = 'Warm', allowDual = true } = params;
  const unique = Array.from(new Set(loadedModels.filter(Boolean)));
  if (unique.length === 0) {
    return {
      mode: 'qwen',
      selectedModels: ['qwen2.5-7b-instruct-1m'],
      choiceReason: 'Default local LM Studio model',
    };
  }

  const gemma = unique.find((m) => /gemma/i.test(m)) || null;
  const qwen = unique.find((m) => /qwen/i.test(m)) || null;

  // If only 1 model is loaded (or only 1 distinct chat model), use it directly
  if (unique.length === 1) {
    const only = unique[0];
    return {
      mode: /gemma/i.test(only) ? 'gemma' : 'qwen',
      selectedModels: [only],
      choiceReason: `Using available model (${only})`,
    };
  }

  const primaryVisual = gemma || unique[0];
  const primaryPersona = qwen || unique.find((m) => m !== primaryVisual) || unique[0];
  const roll = Math.random();

  // Mood bias: creative/bright moods lean slightly more toward Gemma or Dual;
  // reflective/deadpan/tsundere moods lean slightly more toward Qwen or Dual.
  const isCreativeMood = mood === 'Warm' || mood === 'Proud' || mood === 'Amused';
  const isPersonaMood =
    mood === 'Deadpan' || mood === 'Pouty' || mood === 'Shy' || mood === 'Annoyed' || mood === 'Flustered';

  // Single-stream conversational dialogue/actions: character chooses Gemma OR Qwen herself!
  if (!allowDual || taskKind === 'dialogue') {
    const gemmaChance =
      taskKind === 'scene'
        ? 0.65
        : isCreativeMood
        ? 0.48
        : isPersonaMood
        ? 0.30
        : 0.42;
    if (roll < gemmaChance) {
      return {
        mode: 'gemma',
        selectedModels: [primaryVisual],
        choiceReason: `She chose Gemma (${primaryVisual}) for expressive ${taskKind}`,
      };
    }
    return {
      mode: 'qwen',
      selectedModels: [primaryPersona],
      choiceReason: `She chose Qwen (${primaryPersona}) for nuanced ${taskKind}`,
    };
  }

  // Visual / wardrobe / scenery / travel / chair / whim tasks: character picks Gemma, Qwen, OR Both!
  const isVisualDesign =
    taskKind === 'wardrobe' ||
    taskKind === 'hairstyle' ||
    taskKind === 'scene' ||
    taskKind === 'travel' ||
    taskKind === 'chair';

  if (isVisualDesign) {
    // 50% Both Gemma + Qwen collaboration, 32% Gemma solo, 18% Qwen solo (adjusted by mood)
    const dualCutoff = isCreativeMood ? 0.54 : 0.46;
    const gemmaCutoff = dualCutoff + (isCreativeMood ? 0.32 : 0.26);
    if (roll < dualCutoff) {
      return {
        mode: 'dual',
        selectedModels: [primaryVisual, primaryPersona],
        choiceReason: `She teamed up Gemma + Qwen together for ${taskKind}`,
      };
    }
    if (roll < gemmaCutoff) {
      return {
        mode: 'gemma',
        selectedModels: [primaryVisual],
        choiceReason: `She chose Gemma (${primaryVisual}) for visual ${taskKind} design`,
      };
    }
    return {
      mode: 'qwen',
      selectedModels: [primaryPersona],
      choiceReason: `She chose Qwen (${primaryPersona}) for personal ${taskKind} style`,
    };
  }

  // Daily life activities (whim, dining, hobby, study, bath): balanced Gemma / Qwen / Dual choice
  const dualCutoff = taskKind === 'whim' ? 0.48 : 0.40;
  const gemmaCutoff = dualCutoff + (isCreativeMood ? 0.34 : isPersonaMood ? 0.22 : 0.30);
  if (roll < dualCutoff) {
    return {
      mode: 'dual',
      selectedModels: [primaryVisual, primaryPersona],
      choiceReason: `She combined Gemma + Qwen for her ${taskKind} decision`,
    };
  }
  if (roll < gemmaCutoff) {
    return {
      mode: 'gemma',
      selectedModels: [primaryVisual],
      choiceReason: `She chose Gemma (${primaryVisual}) for her ${taskKind} vibe`,
    };
  }
  return {
    mode: 'qwen',
    selectedModels: [primaryPersona],
    choiceReason: `She chose Qwen (${primaryPersona}) for her ${taskKind} mood`,
  };
}

async function callSingleLmStudioModel(params: {
  model: string;
  messages: { role: string; content: string }[];
  temperature: number;
  maxTokens: number;
}): Promise<{ text: string; model: string } | null> {
  const { model, messages, temperature, maxTokens } = params;

  // 1. Electron IPC (zero CORS)
  const queryIpc =
    (typeof window !== 'undefined' &&
      (window.studioAPI?.queryLocalAi || window.desktopBridge?.queryLocalAi)) ||
    null;
  if (queryIpc) {
    try {
      const res = await queryIpc({
        model,
        messages,
        temperature,
        maxTokens,
      });
      if (res?.ok && res.text) {
        return { text: res.text, model: res.resolvedModel || model };
      }
    } catch {
      // fall through to HTTP
    }
  }

  // 2. Direct HTTP
  for (const base of LM_STUDIO_HOSTS) {
    try {
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(28000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          model?: string;
        };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          return { text, model: data.model || model };
        }
      }
      break;
    } catch {
      // try next host
    }
  }

  return null;
}

function extractFirstJsonObject(raw: string): Record<string, unknown> | null {
  const match = /\{[\s\S]*\}/.exec(raw);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Merges JSON outputs from TWO LM Studio models (e.g. Gemma + Qwen):
 * - Visual/structural fields come primarily from the creative visual model (e.g. gemma-4-e4b-it)
 * - In-character commentary/reasons/titles blend the richest non-empty fields from the persona model (e.g. qwen2.5-7b-instruct-1m)
 */
function mergeDualModelJson(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...primary };

  // Prefer expressive character notes/reasons from the secondary (persona) model when rich & valid
  const personaPreferredKeys = [
    'styleNote',
    'moodReason',
    'description',
    'studyNote',
    'note',
    'reason',
    'thought',
  ];
  for (const key of personaPreferredKeys) {
    const secVal = secondary[key];
    if (typeof secVal === 'string' && secVal.trim().length >= 8) {
      merged[key] = secVal.trim();
    }
  }

  // Fill any missing/null fields in primary from secondary
  for (const [k, v] of Object.entries(secondary)) {
    if (
      (merged[k] === undefined || merged[k] === null || merged[k] === '') &&
      v !== undefined &&
      v !== null &&
      v !== ''
    ) {
      merged[k] = v;
    }
  }

  // Combine accessories if both suggested tasteful unique picks (max 2)
  if (Array.isArray(primary.accessories) && Array.isArray(secondary.accessories)) {
    const combined = Array.from(
      new Set([...primary.accessories, ...secondary.accessories])
    ).slice(0, 2);
    if (combined.length > 0) merged.accessories = combined;
  }

  return merged;
}

/**
 * Lets the AI character autonomously pick Gemma or Qwen for free-form chat, actions, or scenery prompts,
 * with automatic fallback to the other loaded LM Studio model if her first choice fails.
 */
export async function queryCharacterLmStudioChat(params: {
  messages: { role: string; content: string }[];
  taskKind?: AiGenTaskKind;
  mood?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<CharacterChatResult | null> {
  const {
    messages,
    taskKind = 'dialogue',
    mood = 'Warm',
    temperature = 0.85,
    maxTokens = 350,
  } = params;

  const loaded = await discoverLoadedLmStudioModels();
  const strategy = chooseAiModelForCharacter({
    loadedModels: loaded,
    taskKind,
    mood,
    allowDual: false,
  });

  const primaryModel = strategy.selectedModels[0];
  const alternateModels = loaded.filter((m) => m !== primaryModel);
  const tryOrder = [primaryModel, ...alternateModels];

  for (let i = 0; i < tryOrder.length; i++) {
    const model = tryOrder[i];
    const res = await callSingleLmStudioModel({
      model,
      messages,
      temperature,
      maxTokens,
    });
    if (res?.text) {
      const resolvedMode: 'gemma' | 'qwen' = /gemma/i.test(res.model) ? 'gemma' : 'qwen';
      return {
        text: res.text,
        resolvedModel: res.model,
        choiceMode: resolvedMode,
        choiceReason: i === 0 ? strategy.choiceReason : `Fallback to ${res.model}`,
      };
    }
  }

  return null;
}

/**
 * Lets the AI character autonomously choose Gemma, Qwen, or BOTH loaded LM Studio models together
 * for structured JSON generation (wardrobe, hairstyles, dining, hobbies, study, bath, travel, chairs, whims).
 * Automatically falls back to the other loaded model if a solo pick returns malformed JSON.
 */
export async function queryDualLmStudioJson(params: {
  systemPrompt: string;
  userPrompt: string;
  taskKind?: AiGenTaskKind;
  mood?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<DualModelJsonResult | null> {
  const {
    systemPrompt,
    userPrompt,
    taskKind = 'whim',
    mood = 'Warm',
    temperature = 0.82,
    maxTokens = 380,
  } = params;
  const loaded = await discoverLoadedLmStudioModels();
  const strategy = chooseAiModelForCharacter({
    loadedModels: loaded,
    taskKind,
    mood,
    allowDual: true,
  });

  // Ensure visual model (Gemma) leads when both are selected
  const sorted = [...strategy.selectedModels].sort((a, b) => {
    const aIsGemma = /gemma/i.test(a) ? 0 : 1;
    const bIsGemma = /gemma/i.test(b) ? 0 : 1;
    return aIsGemma - bIsGemma;
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const settled = await Promise.allSettled(
    sorted.map((model, idx) =>
      callSingleLmStudioModel({
        model,
        messages,
        temperature: idx === 0 ? temperature : Math.min(0.95, temperature + 0.08),
        maxTokens,
      })
    )
  );

  const validResults: { json: Record<string, unknown>; model: string }[] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value?.text) {
      const parsed = extractFirstJsonObject(item.value.text);
      if (parsed) {
        validResults.push({ json: parsed, model: item.value.model });
      }
    }
  }

  // If solo pick didn't return valid JSON and another model is loaded, try the alternate model seamlessly
  if (validResults.length === 0) {
    const unused = loaded.filter((m) => !sorted.includes(m));
    for (const altModel of unused) {
      const altRes = await callSingleLmStudioModel({
        model: altModel,
        messages,
        temperature,
        maxTokens,
      });
      if (altRes?.text) {
        const parsed = extractFirstJsonObject(altRes.text);
        if (parsed) {
          validResults.push({ json: parsed, model: altRes.model });
          break;
        }
      }
    }
  }

  if (validResults.length === 0) return null;

  if (validResults.length === 1) {
    const onlyModel = validResults[0].model;
    return {
      json: validResults[0].json,
      modelsUsed: [onlyModel],
      modelLabel: onlyModel,
      choiceMode: /gemma/i.test(onlyModel) ? 'gemma' : 'qwen',
      choiceReason: strategy.choiceReason,
    };
  }

  const merged = mergeDualModelJson(validResults[0].json, validResults[1].json);
  const modelsUsed = validResults.map((r) => r.model);
  return {
    json: merged,
    modelsUsed,
    modelLabel: modelsUsed.join(' + '),
    choiceMode: 'dual',
    choiceReason: strategy.choiceReason,
  };
}

/**
 * Convenience wrapper returning character-chosen Gemma / Qwen / Dual JSON serialized as raw text.
 */
export async function queryDualLmStudioJsonText(params: {
  systemPrompt: string;
  userPrompt: string;
  taskKind?: AiGenTaskKind;
  mood?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<DualModelTextResult | null> {
  const res = await queryDualLmStudioJson(params);
  if (!res) return null;
  return {
    text: JSON.stringify(res.json),
    modelsUsed: res.modelsUsed,
    modelLabel: res.modelLabel,
    choiceMode: res.choiceMode,
    choiceReason: res.choiceReason,
  };
}
