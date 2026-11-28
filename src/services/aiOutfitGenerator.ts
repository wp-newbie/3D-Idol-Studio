import type {
  ActiveLifeScene,
  CircadianPhase,
  FabricPatternId,
  GarmentStyleId,
  HairStyleId,
  MaterialMod,
  MeshDescriptor,
  Persona,
  ProceduralAccessoryId,
  StudioSettings,
  VaultModelMeta,
  VrmAppearanceVariant,
} from '../types/studio';
import { getCircadianContext, getStageClimate } from './aiBrainService';
import { resolveEffectiveApiKey } from './apiKeyResolver';
import { DEFAULT_TEXT_MODEL, listAvailableGeminiModels } from './geminiClient';
import { STAGE_ENVIRONMENTS } from '../stage/stageEnvironments';
import { HAIR_STYLE_META, HAIR_STYLE_ORDER } from '../stage/hairStyleRig';
import { GARMENT_STYLE_META, GARMENT_STYLE_ORDER } from '../stage/garmentRig';
import { queryDualLmStudioJsonText } from './localLlmOrchestrator';
import { saveTextureToVault } from '../storage/modelVault';

export type OutfitEngineSource = 'local-llm' | 'gemini-llm' | 'offline-stylist';

export interface VrmStructuralSummary {
  hasCulledTorsoSkin: boolean;
  hasCulledLegSkin: boolean;
  activePosture: 'standing' | 'seated_table' | 'active_arms';
  nativeOutfitSlots: string[];
}

export interface AiOutfitPlan {
  outfitName: string;
  styleNote: string;
  occasionLabel: string;
  garmentStyle: GarmentStyleId;
  topHex: string;
  topAccentHex: string;
  topPattern: FabricPatternId;
  bottomHex: string;
  bottomAccentHex: string;
  bottomPattern: FabricPatternId;
  footwearHex: string;
  accessoryHex: string;
  hairTintHex?: string | null;
  hairHighlightHex?: string | null;
  hairStyle: HairStyleId;
  hideOuterLayers?: boolean;
  preferredExistingSlot?: string | null;
  accessories: ProceduralAccessoryId[];
  clearanceBoost?: boolean;
  seatedFriendly?: boolean;
  source: OutfitEngineSource;
  modelUsed?: string;
}

export interface GeneratedOutfitPayload {
  plan: AiOutfitPlan;
  materialMods: Record<string, MaterialMod>;
  meshVisibility: Record<string, boolean>;
  accessories: ProceduralAccessoryId[];
  accessoryColorHex: string;
  hairStyle: HairStyleId;
  hairColorHex: string | null;
  hairHighlightHex: string | null;
  garmentStyle: GarmentStyleId;
  garmentPalette: {
    topHex: string;
    topAccentHex: string;
    bottomHex: string;
    bottomAccentHex: string;
    accessoryHex: string;
    topTextureDataUrl?: string | null;
    bottomTextureDataUrl?: string | null;
  };
  preferredExistingSlot: string | null;
}

export interface AiHairStylePlan {
  hairStyle: HairStyleId;
  hairColorHex: string | null;
  hairHighlightHex: string | null;
  styleNote: string;
  source: OutfitEngineSource;
  modelUsed?: string;
}

export const DEFAULT_SAMPLE_VRM_LABEL = 'Default Anime VRM';

export interface VrmSwitchCandidate {
  id: string | null; // null === built-in default-anime.vrm
  label: string;
  fileName: string;
  format: 'vrm' | 'glb';
  isActive: boolean;
}

export interface AiVrmSwitchPlan {
  targetModelId: string | null;
  targetLabel: string;
  reason: string;
  source: OutfitEngineSource;
  modelUsed?: string;
}

export function listAvailableVrmModels(
  vaultModels: VaultModelMeta[],
  activeModelVaultId: string | null | undefined
): VrmSwitchCandidate[] {
  const activeId = activeModelVaultId ?? null;
  const list: VrmSwitchCandidate[] = [
    {
      id: null,
      label: DEFAULT_SAMPLE_VRM_LABEL,
      fileName: 'default-anime.vrm',
      format: 'vrm',
      isActive: activeId === null,
    },
  ];
  for (const m of vaultModels) {
    if (m.format === 'vrm' || m.format === 'glb') {
      list.push({
        id: m.id,
        label: m.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
        fileName: m.fileName,
        format: m.format,
        isActive: activeId === m.id,
      });
    }
  }
  return list;
}

export function doesVrmNameMatchScene(
  vrmName: string | null | undefined,
  sceneGarment: GarmentStyleId | null
): boolean {
  if (!vrmName || !sceneGarment) return false;
  const n = vrmName.toLowerCase();
  if (sceneGarment === 'bath_wrap') return /bath|towel|shower|spa|robe|onsen/.test(n);
  if (sceneGarment === 'beach_swimsuit') return /swim|beach|bikini|summer|resort|pool|mizugi/.test(n);
  if (sceneGarment === 'kimono_yukata') return /kimono|yukata|festival|onsen|shrine|miko/.test(n);
  if (sceneGarment === 'school_blazer') return /school|uniform|blazer|sailor|seifuku|student|academy/.test(n);
  if (sceneGarment === 'cozy_pajamas') return /pajama|sleep|night|lounge|roomwear|bed/.test(n);
  if (sceneGarment === 'sporty_tee_leggings') return /sport|gym|yoga|workout|athletic|jersey|track/.test(n);
  return false;
}

export interface TimeOccasionBrief {
  phase: CircadianPhase;
  phaseEmoji: string;
  phaseLabel: string;
  clockText: string;
  dayType: 'weekday' | 'weekend';
  occasionLabel: string;
  promptSummary: string;
}

export const OCCASION_QUICK_CHIPS: {
  id: string;
  label: string;
  prompt: string;
}[] = [
  {
    id: 'school_uniform',
    label: '🏫 School Uniform',
    prompt: 'Classic Japanese high school blazer and sailor uniform with crisp white shirt, navy plaid skirt, ribbon tie and loafers',
  },
  {
    id: 'college_campus',
    label: '🎓 College Preppy',
    prompt: 'Smart university college student preppy argyle cardigan and tailored plaid skirt with loafers',
  },
  {
    id: 'morning_casual',
    label: '🌅 Morning Casual',
    prompt: 'Fresh crisp morning casual outfit for starting the day and grabbing coffee',
  },
  {
    id: 'cafe_date',
    label: '☕ Cafe Hangout',
    prompt: 'Cute stylish afternoon cafe hangout streetwear with pastel accents and hair ribbon',
  },
  {
    id: 'concert_stage',
    label: '🎤 Idol Stage',
    prompt: 'Glamorous cyberpunk neon idol concert stage performance outfit with glowing accessories',
  },
  {
    id: 'rainy_cozy',
    label: '🌧️ Rainy Cozy',
    prompt: 'Warm cozy rainy-day knit argyle loungewear for staying indoors',
  },
  {
    id: 'dinner_date',
    label: '🌆 Evening Date',
    prompt: 'Classy evening dinner date crimson and midnight lace dress with choker',
  },
  {
    id: 'sleepwear',
    label: '🌙 Sleepwear',
    prompt: 'Soft comfy late-night pastel starry pajamas and loungewear for relaxing before bed',
  },
];

const VALID_PATTERNS: FabricPatternId[] = [
  'none',
  'plaid',
  'gothic_lace',
  'cyber_grid',
  'sakura_petals',
  'starry_night',
  'pastel_stripes',
  'polka_dots',
  'argyle',
];

const VALID_ACCESSORIES: ProceduralAccessoryId[] = [
  'cat_ears',
  'halo',
  'ribbon_bow',
  'cyber_visor',
  'choker',
  'fairy_wings',
  'idol_crown',
];

function normalizeHex(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) return cleaned.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned.toLowerCase()}`;
  return fallback;
}

/**
 * Builds a realistic human-like daily time-of-day & occasion fashion brief based on
 * local clock, weekday/weekend, stage environment/weather, and the persona's current needs/mood.
 */
export function buildTimeOccasionBrief(params: {
  persona: Persona;
  occasionOverride?: string;
  now?: Date;
}): TimeOccasionBrief {
  const { persona, occasionOverride, now = new Date() } = params;
  const circadian = getCircadianContext(now);
  const climate = getStageClimate(persona.stageEnvironment);
  const envMeta = STAGE_ENVIRONMENTS[persona.stageEnvironment];
  const day = now.getDay();
  const dayType: 'weekday' | 'weekend' = day === 0 || day === 6 ? 'weekend' : 'weekday';

  const isDrowsyOrSleeping =
    Boolean(persona.brain?.isSleeping) || (persona.brain?.sleepiness ?? 0) >= 68;
  const isChilly = climate.isChilly || (persona.brain?.comfort ?? 80) < 42;

  if (occasionOverride && occasionOverride.trim()) {
    return {
      phase: circadian.phase,
      phaseEmoji: circadian.phaseEmoji,
      phaseLabel: circadian.phaseLabel,
      clockText: circadian.clockText,
      dayType,
      occasionLabel: occasionOverride.trim().slice(0, 42),
      promptSummary: `It is ${circadian.clockText} (${circadian.phaseLabel}, ${dayType}) in ${envMeta?.name || 'the studio'} (${climate.label}). Occasion: ${occasionOverride.trim()}. Design a realistic, fashionable anime outfit she would personally choose for this exact moment.`,
    };
  }

  let occasionLabel = 'Everyday Casual';
  let vibeHint = '';

  if (isDrowsyOrSleeping || circadian.phase === 'late_night') {
    occasionLabel = 'Late-Night Cozy Loungewear / Pajamas';
    vibeHint =
      'It is late night and time to unwind/sleep. Like a real person changing into pajamas, pick soft pastel or starry-night colors, comfy loungewear stripes or starry print, and minimal cute bedtime touches (e.g. cat ears or no heavy stage gear).';
  } else if (persona.stageEnvironment === 'cyberpunk_stage' && circadian.phase === 'evening') {
    occasionLabel = 'Evening Idol Stage Live';
    vibeHint =
      'Evening live concert performance on a neon cyberpunk stage. Go bold with glowing cyan/magenta cyber grid or starlight accents and stage accessories (visor, tiara, or choker).';
  } else if (persona.stageEnvironment === 'lofi_rainy_room') {
    occasionLabel = isChilly ? 'Rainy Day Cozy Indoors' : 'Lo-Fi Rainy Chill';
    vibeHint =
      'Cozy rainy indoor weather. Design a warm, comfortable sweater/argyle or soft plaid look in comforting muted/warm tones with a cute ribbon or choker.';
  } else if (circadian.phase === 'morning') {
    occasionLabel =
      dayType === 'weekend' ? 'Relaxed Weekend Morning Coffee' : 'Fresh Weekday Morning';
    vibeHint =
      dayType === 'weekend'
        ? 'Bright weekend morning coffee & brunch vibe: light airy pastels, sakura or soft stripes, relaxed footwear, cute hair ribbon.'
        : 'Crisp weekday morning routine & rehearsal prep: clean ivory/white or pastel top, tailored plaid or argyle bottoms, neat hair ribbon.';
  } else if (circadian.phase === 'afternoon') {
    occasionLabel =
      dayType === 'weekend' ? 'Weekend Afternoon Cafe & Shopping' : 'Afternoon Studio Hangout';
    vibeHint =
      dayType === 'weekend'
        ? 'Stylish weekend afternoon outing: chic sakura/polka-dot or boutique plaid coordination with trendy shoes and a ribbon or choker.'
        : 'Smart-casual afternoon studio session: expressive streetwear palette matching her personality, clean fabric pattern, light accessory.';
  } else {
    // Evening (18:00 - 22:59)
    occasionLabel =
      persona.stageEnvironment === 'gothic_cathedral'
        ? 'Candlelit Evening Gothic Diva'
        : dayType === 'weekend'
        ? 'Weekend Evening Dinner & Night Out'
        : 'Relaxed Evening Hangout';
    vibeHint =
      persona.stageEnvironment === 'gothic_cathedral'
        ? 'Atmospheric candlelit evening: rich crimson/plum gothic lace with dark bottoms, choker, or mini tiara.'
        : 'Stylish evening wear that feels natural for dinner or relaxing after work: deep twilight, wine, navy, or warm rose tones with subtle lace, starry, or plaid details.';
  }

  return {
    phase: circadian.phase,
    phaseEmoji: circadian.phaseEmoji,
    phaseLabel: circadian.phaseLabel,
    clockText: circadian.clockText,
    dayType,
    occasionLabel,
    promptSummary: `Current real-world time: ${circadian.clockText} (${circadian.phaseLabel}, ${dayType}). Setting: ${envMeta?.name || 'Studio'} (${climate.label}). Current mood: ${persona.mood}. Occasion: ${occasionLabel}. ${vibeHint}`,
  };
}

/**
 * Renders a crisp 512x512 tileable anime clothing pattern `.PNG` data URL on an offscreen canvas.
 */
export function renderFabricPatternDataUrl(params: {
  pattern: FabricPatternId;
  baseHex: string;
  accentHex: string;
}): string {
  const { pattern, baseHex, accentHex } = params;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Base fabric fill + subtle woven sheen
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  const sheen = ctx.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
  sheen.addColorStop(0.5, 'rgba(0,0,0,0.04)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  // Subtle fabric weave micro-texture
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < size; y += 8) {
    ctx.fillRect(0, y, size, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.03)';
  for (let x = 0; x < size; x += 8) {
    ctx.fillRect(x, 0, 1, size);
  }

  if (pattern === 'plaid') {
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = accentHex;
    for (let i = 0; i < size; i += 64) {
      ctx.fillRect(i, 0, 22, size);
      ctx.fillRect(0, i, size, 22);
    }
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffffff';
    for (let i = 32; i < size; i += 64) {
      ctx.fillRect(i, 0, 3, size);
      ctx.fillRect(0, i, size, 3);
    }
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#09090f';
    for (let i = 10; i < size; i += 64) {
      ctx.fillRect(i, 0, 4, size);
      ctx.fillRect(0, i, size, 4);
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'gothic_lace') {
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.58;
    const step = 64;
    for (let y = 0; y <= size; y += step) {
      for (let x = 0; x <= size; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, y - 24);
        ctx.lineTo(x + 24, y);
        ctx.lineTo(x, y + 24);
        ctx.lineTo(x - 24, y);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000000';
    for (let y = 32; y < size; y += step) {
      for (let x = 32; x < size; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'cyber_grid') {
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.65;
    for (let i = 0; i <= size; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.fillStyle = accentHex;
    ctx.globalAlpha = 0.85;
    for (let y = 48; y < size; y += 96) {
      for (let x = 48; x < size; x += 96) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x, y - 1, 30, 2);
      }
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'sakura_petals') {
    ctx.fillStyle = accentHex;
    for (let i = 0; i < 42; i++) {
      const px = ((i * 97 + 41) % (size - 32)) + 16;
      const py = ((i * 131 + 29) % (size - 32)) + 16;
      const rot = (i * 0.85) % (Math.PI * 2);
      const r = 10 + (i % 4) * 3;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot);
      ctx.globalAlpha = 0.72;
      for (let p = 0; p < 5; p++) {
        ctx.rotate((Math.PI * 2) / 5);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.72, r * 0.38, r * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accentHex;
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'starry_night') {
    for (let i = 0; i < 68; i++) {
      const sx = (i * 79 + 23) % size;
      const sy = (i * 113 + 47) % size;
      const r = i % 5 === 0 ? 9 : 3 + (i % 3);
      ctx.fillStyle = i % 3 === 0 ? '#fef08a' : accentHex;
      ctx.globalAlpha = i % 5 === 0 ? 0.9 : 0.6;
      ctx.beginPath();
      if (i % 5 === 0) {
        ctx.moveTo(sx, sy - r);
        ctx.quadraticCurveTo(sx, sy, sx + r, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy + r);
        ctx.quadraticCurveTo(sx, sy, sx - r, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy - r);
      } else {
        ctx.arc(sx, sy, r * 0.65, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'pastel_stripes') {
    ctx.fillStyle = accentHex;
    ctx.globalAlpha = 0.42;
    for (let i = 0; i < size; i += 40) {
      ctx.fillRect(i, 0, 16, size);
    }
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.28;
    for (let i = 18; i < size; i += 40) {
      ctx.fillRect(i, 0, 4, size);
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'polka_dots') {
    ctx.fillStyle = accentHex;
    ctx.globalAlpha = 0.68;
    for (let y = 24; y < size; y += 52) {
      const offsetX = Math.floor(y / 52) % 2 === 0 ? 24 : 50;
      for (let x = offsetX; x < size; x += 52) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  } else if (pattern === 'argyle') {
    const w = 64;
    const h = 96;
    for (let y = 0; y < size + h; y += h) {
      for (let x = 0; x < size + w; x += w) {
        ctx.fillStyle = accentHex;
        ctx.globalAlpha = 0.36;
        ctx.beginPath();
        ctx.moveTo(x, y - h / 2);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x, y + h / 2);
        ctx.lineTo(x - w / 2, y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y - h / 2);
        ctx.lineTo(x + w / 2, y + h / 2);
        ctx.moveTo(x + w / 2, y - h / 2);
        ctx.lineTo(x - w / 2, y + h / 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  return canvas.toDataURL('image/png');
}

function normalizeGarmentStyle(
  raw: unknown,
  prompt: string,
  fallback: GarmentStyleId
): GarmentStyleId {
  if (typeof raw === 'string') {
    const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (GARMENT_STYLE_ORDER.includes(cleaned as GarmentStyleId)) {
      return cleaned as GarmentStyleId;
    }
    if (/bath|towel|shower|spa|robe/.test(cleaned)) return 'bath_wrap';
    if (/swim|bikini|beach|pool|resort/.test(cleaned)) return 'beach_swimsuit';
    if (/hoodie|jogger|sweat|pullover/.test(cleaned)) return 'cozy_hoodie_pants';
    if (/sundress|summer|dress/.test(cleaned)) return 'summer_sundress';
    if (/street|jacket|bomber|shorts|denim|mall/.test(cleaned)) return 'streetwear_jacket_shorts';
    if (/sport|tee|tshirt|t_shirt|athleisure|legging|yoga|gym/.test(cleaned)) return 'sporty_tee_leggings';
    if (/kimono|yukata|onsen|traditional|japanese/.test(cleaned)) return 'kimono_yukata';
    if (/gown|ball|evening|gothic|formal|concert|princess/.test(cleaned)) return 'evening_gown';
    if (/pajama|sleep|lounge|bed|night/.test(cleaned)) return 'cozy_pajamas';
    if (/school|blazer|sailor|academy|college|uniform/.test(cleaned)) return 'school_blazer';
    if (/trench|coat|trouser|pant|rain/.test(cleaned)) return 'trench_coat_pants';
    if (/default|original|native/.test(cleaned)) return 'default';
  }
  const hay = prompt.toLowerCase();
  if (/bath.?wrap|bath.?towel|shower|spa.?robe|bathroom/.test(hay)) return 'bath_wrap';
  if (/swimsuit|swimwear|tropical.?beach|beach|ocean|pool|bikini/.test(hay)) return 'beach_swimsuit';
  if (/pajama|sleep|bed|late.?night|loungewear/.test(hay)) return 'cozy_pajamas';
  if (/kimono|yukata|onsen|hot.?spring|ryokan/.test(hay)) return 'kimono_yukata';
  if (/school|blazer|sailor|classroom|college|university/.test(hay)) return 'school_blazer';
  if (/sundress|summer|resort/.test(hay)) return 'summer_sundress';
  if (/yoga|sport|gym|workout|t.?shirt|short.?sleeve|legging/.test(hay)) return 'sporty_tee_leggings';
  if (/hoodie|jogger|gaming|cozy|sweater/.test(hay)) return 'cozy_hoodie_pants';
  if (/mall|shopping|streetwear|shorts|bomber|denim|amusement/.test(hay)) return 'streetwear_jacket_shorts';
  if (/gown|gothic|concert|dinner|date|formal|princess|angel/.test(hay)) return 'evening_gown';
  if (/trench|rain|coat|trouser|pants/.test(hay)) return 'trench_coat_pants';
  return fallback;
}

function buildOfflineOutfitPlan(prompt: string, occasionLabel = 'Custom Look'): AiOutfitPlan {
  const p = `${prompt} ${occasionLabel}`.toLowerCase();
  if (/bath.?wrap|bath.?towel|shower|bathroom|spa.?robe/i.test(p)) {
    return {
      outfitName: 'Fluffy Spa Bath Wrap',
      styleNote: 'Soft pastel terry-cloth bath towel wrap for a relaxing, wholesome shower & bathroom care routine.',
      occasionLabel: occasionLabel || 'Bath & Spa Care',
      garmentStyle: 'bath_wrap',
      topHex: '#fce7f3',
      topAccentHex: '#f472b6',
      topPattern: 'none',
      bottomHex: '#fce7f3',
      bottomAccentHex: '#f9a8d4',
      bottomPattern: 'none',
      footwearHex: '#f8fafc',
      accessoryHex: '#f472b6',
      hairStyle: 'twin_buns',
      accessories: ['spa_towel'],
      source: 'offline-stylist',
    };
  }
  if (/swimsuit|swimwear|tropical.?beach|beach|ocean|pool|bikini/i.test(p)) {
    return {
      outfitName: 'Sunny Resort Swimsuit',
      styleNote: 'Vibrant turquoise anime one-piece resort swimsuit with breezy pastel pareo wrap for the beach!',
      occasionLabel: occasionLabel || 'Beach Swimwear',
      garmentStyle: 'beach_swimsuit',
      topHex: '#06b6d4',
      topAccentHex: '#f8fafc',
      topPattern: 'pastel_stripes',
      bottomHex: '#fef08a',
      bottomAccentHex: '#f472b6',
      bottomPattern: 'none',
      footwearHex: '#fde68a',
      accessoryHex: '#f472b6',
      hairStyle: 'high_ponytail',
      accessories: ['ribbon_bow'],
      source: 'offline-stylist',
    };
  }
  if (/sleep|pajama|bed|late.?night|loungewear|unwind|drowsy/i.test(p)) {
    return {
      outfitName: 'Midnight Starry Pajamas',
      styleNote: 'Soft lavender pajama shirt & comfy lounge pants with starry print for late-night rest.',
      occasionLabel: occasionLabel || 'Late-Night Loungewear',
      garmentStyle: 'cozy_pajamas',
      topHex: '#e0e7ff',
      topAccentHex: '#818cf8',
      topPattern: 'starry_night',
      bottomHex: '#312e81',
      bottomAccentHex: '#c7d2fe',
      bottomPattern: 'pastel_stripes',
      footwearHex: '#ede9fe',
      accessoryHex: '#a5b4fc',
      hairStyle: 'ahoge_clips',
      hideOuterLayers: true,
      accessories: ['cat_ears'],
      source: 'offline-stylist',
    };
  }
  if (/kimono|yukata|onsen|hot.?spring|ryokan|festival/i.test(p)) {
    return {
      outfitName: 'Sakura Onsen Yukata',
      styleNote: 'Flowing floral sakura kimono with rich crimson obi sash and draping furisode sleeves.',
      occasionLabel: occasionLabel || 'Onsen & Festival',
      garmentStyle: 'kimono_yukata',
      topHex: '#fdf2f8',
      topAccentHex: '#f472b6',
      topPattern: 'sakura_petals',
      bottomHex: '#fce7f3',
      bottomAccentHex: '#f43f5e',
      bottomPattern: 'sakura_petals',
      footwearHex: '#78350f',
      accessoryHex: '#e11d48',
      hairStyle: 'twin_buns',
      accessories: ['ribbon_bow'],
      source: 'offline-stylist',
    };
  }
  if (/high.?school|sailor|school.?uniform|classroom|academy|student/i.test(p)) {
    return {
      outfitName: 'Academy School Blazer',
      styleNote: 'Tailored academy blazer, crisp white collar, navy plaid pleated skirt & neat student ponytail.',
      occasionLabel: occasionLabel || 'High School Uniform',
      garmentStyle: 'school_blazer',
      topHex: '#1e2952',
      topAccentHex: '#f8fafc',
      topPattern: 'none',
      bottomHex: '#1e2952',
      bottomAccentHex: '#e11d48',
      bottomPattern: 'plaid',
      footwearHex: '#3b2314',
      accessoryHex: '#e11d48',
      hairStyle: 'high_ponytail',
      accessories: ['ribbon_bow'],
      source: 'offline-stylist',
    };
  }
  if (/college|university|campus|lecture|library/i.test(p)) {
    return {
      outfitName: 'Campus Preppy Blazer',
      styleNote: 'Smart tailored university blazer with argyle accent, pleated plaid skirt & side braid.',
      occasionLabel: occasionLabel || 'College Campus',
      garmentStyle: 'school_blazer',
      topHex: '#334155',
      topAccentHex: '#93c5fd',
      topPattern: 'argyle',
      bottomHex: '#1f2937',
      bottomAccentHex: '#93c5fd',
      bottomPattern: 'plaid',
      footwearHex: '#3b2314',
      accessoryHex: '#2563eb',
      hairStyle: 'side_braid',
      accessories: ['ribbon_bow'],
      source: 'offline-stylist',
    };
  }
  if (/yoga|sport|gym|workout|athleisure|t.?shirt|short.?sleeve|legging/i.test(p)) {
    return {
      outfitName: 'Active Short-Sleeve & Leggings',
      styleNote: 'Breezy short-sleeve athletic tee paired with sleek high-waist sport leggings and high ponytail.',
      occasionLabel: occasionLabel || 'Active & Sporty',
      garmentStyle: 'sporty_tee_leggings',
      topHex: '#38bdf8',
      topAccentHex: '#f8fafc',
      topPattern: 'pastel_stripes',
      bottomHex: '#18181b',
      bottomAccentHex: '#38bdf8',
      bottomPattern: 'none',
      footwearHex: '#f8fafc',
      accessoryHex: '#0ea5e9',
      hairStyle: 'high_ponytail',
      accessories: [],
      source: 'offline-stylist',
    };
  }
  if (/morning|breakfast|coffee|brunch|weekday|preppy/i.test(p)) {
    return {
      outfitName: 'Crisp Morning Trench & Pants',
      styleNote: 'Chic ivory trench coat over tailored trousers with a fresh morning ponytail.',
      occasionLabel: occasionLabel || 'Morning Casual',
      garmentStyle: 'trench_coat_pants',
      topHex: '#f5f0e6',
      topAccentHex: '#38bdf8',
      topPattern: 'none',
      bottomHex: '#1e3a5f',
      bottomAccentHex: '#bae6fd',
      bottomPattern: 'none',
      footwearHex: '#334155',
      accessoryHex: '#38bdf8',
      hairStyle: 'high_ponytail',
      accessories: ['ribbon_bow'],
      source: 'offline-stylist',
    };
  }
  if (/rain|chilly|cozy|knit|sweater|indoor|lo-fi|hoodie|gaming/i.test(p)) {
    return {
      outfitName: 'Cozy Oversized Hoodie & Joggers',
      styleNote: 'Plush warm oversized pullover hoodie with drawstrings and comfy jogger pants.',
      occasionLabel: occasionLabel || 'Cozy Hoodie',
      garmentStyle: 'cozy_hoodie_pants',
      topHex: '#fef3c7',
      topAccentHex: '#d97706',
      topPattern: 'argyle',
      bottomHex: '#27272a',
      bottomAccentHex: '#fbbf24',
      bottomPattern: 'none',
      footwearHex: '#451a03',
      accessoryHex: '#f59e0b',
      hairStyle: 'side_braid',
      accessories: ['ribbon_bow'],
      source: 'offline-stylist',
    };
  }
  if (/cyber|neon|future|tech|vapor|synth|mall|shopping|streetwear|shorts/i.test(p)) {
    return {
      outfitName: 'Neon Streetwear Jacket & Shorts',
      styleNote: 'Cropped cyber bomber jacket over crisp inner tee with belted streetwear shorts.',
      occasionLabel: occasionLabel || 'Streetwear Outing',
      garmentStyle: 'streetwear_jacket_shorts',
      topHex: '#13162a',
      topAccentHex: '#22d3ee',
      topPattern: 'cyber_grid',
      bottomHex: '#0f172a',
      bottomAccentHex: '#e879f9',
      bottomPattern: 'none',
      footwearHex: '#1e1b4b',
      accessoryHex: '#22d3ee',
      hairStyle: 'twin_tails',
      accessories: ['cyber_visor', 'choker'],
      source: 'offline-stylist',
    };
  }
  if (/goth|vamp|crimson|dark|noir|black|rock|dinner|evening|date|concert|gown/i.test(p)) {
    return {
      outfitName: 'Crimson Evening Gown',
      styleNote: 'Sweeping off-shoulder crimson lace evening gown with opera gloves and flowing waves.',
      occasionLabel: occasionLabel || 'Evening Gown',
      garmentStyle: 'evening_gown',
      topHex: '#4c0519',
      topAccentHex: '#fb7185',
      topPattern: 'gothic_lace',
      bottomHex: '#11111b',
      bottomAccentHex: '#9f1239',
      bottomPattern: 'gothic_lace',
      footwearHex: '#18181b',
      accessoryHex: '#f43f5e',
      hairStyle: 'long_wavy',
      accessories: ['choker', 'ribbon_bow'],
      source: 'offline-stylist',
    };
  }
  if (/sakura|cherry|pink|cute|kawaii|pastel|maid|cafe|afternoon|beach|summer|sundress|resort/i.test(p)) {
    return {
      outfitName: 'Blossom Summer Sundress',
      styleNote: 'Airy sleeveless sakura-petal summer sundress with waist ribbon sash and playful twin buns.',
      occasionLabel: occasionLabel || 'Summer Sundress',
      garmentStyle: 'summer_sundress',
      topHex: '#fdf2f8',
      topAccentHex: '#f472b6',
      topPattern: 'sakura_petals',
      bottomHex: '#fce7f3',
      bottomAccentHex: '#f472b6',
      bottomPattern: 'sakura_petals',
      footwearHex: '#fce7f3',
      accessoryHex: '#f472b6',
      hairStyle: 'twin_buns',
      accessories: ['ribbon_bow'],
      source: 'offline-stylist',
    };
  }
  if (/angel|star|galaxy|princess|royal|fairy|dream|sky/i.test(p)) {
    return {
      outfitName: 'Starlight Evening Ballgown',
      styleNote: 'Midnight starry floor-length princess gown with luminous halo, twin drills & fairy wings.',
      occasionLabel: occasionLabel || 'Starlight Special',
      garmentStyle: 'evening_gown',
      topHex: '#1e1b4b',
      topAccentHex: '#a78bfa',
      topPattern: 'starry_night',
      bottomHex: '#312e81',
      bottomAccentHex: '#fde68a',
      bottomPattern: 'starry_night',
      footwearHex: '#e0e7ff',
      accessoryHex: '#c4b5fd',
      hairStyle: 'drill_twintails',
      accessories: ['halo', 'fairy_wings'],
      source: 'offline-stylist',
    };
  }
  return {
    outfitName: `Custom: ${prompt.trim().slice(0, 26) || 'Studio Hoodie Look'}`,
    styleNote: 'Fresh coordinated streetwear jacket and tailored shorts matching her mood.',
    occasionLabel,
    garmentStyle: 'streetwear_jacket_shorts',
    topHex: '#f8fafc',
    topAccentHex: '#8b5cf6',
    topPattern: 'argyle',
    bottomHex: '#1e1b4b',
    bottomAccentHex: '#a78bfa',
    bottomPattern: 'none',
    footwearHex: '#1f2937',
    accessoryHex: '#a78bfa',
    hairStyle: 'default',
    accessories: ['ribbon_bow'],
    source: 'offline-stylist',
  };
}

function normalizeHairStyle(raw: unknown, fallback: HairStyleId): HairStyleId {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (HAIR_STYLE_ORDER.includes(cleaned as HairStyleId)) return cleaned as HairStyleId;
  if (/ponytail|pony/.test(cleaned)) return 'high_ponytail';
  if (/drill|curl|spiral/.test(cleaned)) return 'drill_twintails';
  if (/twin.*bun|odango|bun/.test(cleaned)) return 'twin_buns';
  if (/twin|pigtail/.test(cleaned)) return 'twin_tails';
  if (/braid|plait|side/.test(cleaned)) return 'side_braid';
  if (/wave|wavy|long|loose/.test(cleaned)) return 'long_wavy';
  if (/bob|short|cut/.test(cleaned)) return 'bob_cut';
  if (/ahoge|clip|pin|messy/.test(cleaned)) return 'ahoge_clips';
  if (/default|original|native|reset/.test(cleaned)) return 'default';
  return fallback;
}

function parseOutfitPlanJson(
  rawText: string,
  fallback: AiOutfitPlan,
  source: OutfitEngineSource,
  modelUsed?: string
): AiOutfitPlan | null {
  const jsonMatch = /\{[\s\S]*\}/.exec(rawText);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const topPattern = VALID_PATTERNS.includes(parsed.topPattern as FabricPatternId)
      ? (parsed.topPattern as FabricPatternId)
      : fallback.topPattern;
    const bottomPattern = VALID_PATTERNS.includes(parsed.bottomPattern as FabricPatternId)
      ? (parsed.bottomPattern as FabricPatternId)
      : fallback.bottomPattern;
    const accessories = Array.isArray(parsed.accessories)
      ? (parsed.accessories.filter((a) =>
          VALID_ACCESSORIES.includes(a as ProceduralAccessoryId)
        ) as ProceduralAccessoryId[]).slice(0, 3)
      : fallback.accessories;
    const hairStyle = normalizeHairStyle(parsed.hairStyle, fallback.hairStyle);
    const garmentStyle = normalizeGarmentStyle(
      parsed.garmentStyle,
      `${String(parsed.outfitName || '')} ${String(parsed.styleNote || '')}`,
      fallback.garmentStyle
    );

    return {
      outfitName:
        typeof parsed.outfitName === 'string' && parsed.outfitName.trim()
          ? parsed.outfitName.trim().slice(0, 42)
          : fallback.outfitName,
      styleNote:
        typeof parsed.styleNote === 'string' && parsed.styleNote.trim()
          ? parsed.styleNote.trim().slice(0, 140)
          : fallback.styleNote,
      occasionLabel:
        typeof parsed.occasionLabel === 'string' && parsed.occasionLabel.trim()
          ? parsed.occasionLabel.trim().slice(0, 42)
          : fallback.occasionLabel,
      garmentStyle,
      topHex: normalizeHex(parsed.topHex, fallback.topHex),
      topAccentHex: normalizeHex(parsed.topAccentHex, fallback.topAccentHex),
      topPattern,
      bottomHex: normalizeHex(parsed.bottomHex, fallback.bottomHex),
      bottomAccentHex: normalizeHex(parsed.bottomAccentHex, fallback.bottomAccentHex),
      bottomPattern,
      footwearHex: normalizeHex(parsed.footwearHex, fallback.footwearHex),
      accessoryHex: normalizeHex(parsed.accessoryHex, fallback.accessoryHex),
      hairTintHex:
        typeof parsed.hairTintHex === 'string' &&
        /^#?[0-9a-fA-F]{6}$/.test(parsed.hairTintHex.trim())
          ? normalizeHex(parsed.hairTintHex, '#ffffff')
          : null,
      hairHighlightHex:
        typeof parsed.hairHighlightHex === 'string' &&
        /^#?[0-9a-fA-F]{6}$/.test(parsed.hairHighlightHex.trim())
          ? normalizeHex(parsed.hairHighlightHex, '#ffffff')
          : null,
      hairStyle,
      hideOuterLayers:
        typeof parsed.hideOuterLayers === 'boolean'
          ? parsed.hideOuterLayers
          : fallback.hideOuterLayers,
      preferredExistingSlot:
        typeof parsed.preferredExistingSlot === 'string' && parsed.preferredExistingSlot.trim()
          ? parsed.preferredExistingSlot.trim()
          : null,
      accessories,
      clearanceBoost:
        typeof parsed.clearanceBoost === 'boolean'
          ? parsed.clearanceBoost
          : fallback.clearanceBoost,
      seatedFriendly:
        typeof parsed.seatedFriendly === 'boolean'
          ? parsed.seatedFriendly
          : fallback.seatedFriendly,
      source,
      modelUsed,
    };
  } catch {
    return null;
  }
}

/**
 * Lets the AI character autonomously choose Gemma, Qwen, or BOTH loaded LM Studio models
 * to design a custom outfit / hairstyle JSON completely offline with zero cloud API usage.
 */
async function queryLocalLlmForOutfit(params: {
  systemPrompt: string;
  userText: string;
  taskKind?: 'wardrobe' | 'hairstyle';
  mood?: string;
}): Promise<{ text: string; modelUsed: string } | null> {
  const res = await queryDualLmStudioJsonText({
    systemPrompt: params.systemPrompt,
    userPrompt: params.userText,
    taskKind: params.taskKind || 'wardrobe',
    mood: params.mood,
    temperature: 0.78,
    maxTokens: 380,
  });
  if (!res) return null;
  return { text: res.text, modelUsed: res.modelLabel };
}

async function requestLlmOutfitPlan(params: {
  prompt: string;
  occasionLabel: string;
  persona: Persona;
  detectedMeshes: MeshDescriptor[];
  settings: StudioSettings;
  vaultModels?: VaultModelMeta[];
  activeLifeScene?: ActiveLifeScene | null;
  allowWholeOutfitSwitch?: boolean;
  preferLocalFirst?: boolean;
  structuralSummary?: VrmStructuralSummary | null;
}): Promise<AiOutfitPlan> {
  const {
    prompt,
    occasionLabel,
    persona,
    detectedMeshes,
    settings,
    vaultModels = [],
    activeLifeScene = null,
    allowWholeOutfitSwitch = false,
    preferLocalFirst = true,
    structuralSummary = null,
  } = params;

  const activeSlot = persona.outfitSlots.find((s) => s.id === persona.activeOutfitSlotId);
  const previousGarmentStyle = activeSlot?.garmentStyle || 'default';
  const sceneContextParts: string[] = [];
  if (activeLifeScene?.destination && activeLifeScene.destination.destinationKind !== 'none') {
    sceneContextParts.push(`Location: ${activeLifeScene.destination.placeName} (${activeLifeScene.destination.destinationKind})`);
  }
  if (activeLifeScene?.dining) {
    sceneContextParts.push(`Dining: eating ${activeLifeScene.dining.dishName}`);
  }
  if (activeLifeScene?.hobby) {
    sceneContextParts.push(`Activity: ${activeLifeScene.hobby.hobbyName} (${activeLifeScene.hobby.hobbyKind})`);
  }
  const liveSceneSummary = sceneContextParts.join(' | ');

  const fallback = buildOfflineOutfitPlan(`${prompt} ${liveSceneSummary}`, occasionLabel);

  // Enforce mandatory scene-appropriate garment silhouette (bath -> bath_wrap, beach -> beach_swimsuit, etc.)
  // while still letting Gemma / Qwen freely design the colors, patterns, hair, accessories & style note!
  const combinedHay = `${prompt} ${liveSceneSummary}`.toLowerCase();
  let forcedSceneGarment: GarmentStyleId | null = null;
  if (
    activeLifeScene?.hobby?.hobbyKind === 'showering' ||
    activeLifeScene?.hobby?.hobbyKind === 'towel_dry' ||
    /bath.?wrap|bath.?towel|bath.?cloth|shower|spa.?robe/.test(combinedHay)
  ) {
    forcedSceneGarment = 'bath_wrap';
  } else if (
    activeLifeScene?.destination?.destinationKind === 'tropical_beach' ||
    /swimsuit|swimwear|tropical.?beach|\bbeach\b|bikini/.test(combinedHay)
  ) {
    forcedSceneGarment = 'beach_swimsuit';
  } else if (
    activeLifeScene?.destination?.destinationKind === 'mountain_onsen' ||
    /kimono|yukata|onsen|hot.?spring/.test(combinedHay)
  ) {
    forcedSceneGarment = 'kimono_yukata';
  } else if (
    activeLifeScene?.hobby?.hobbyKind === 'studying' ||
    activeLifeScene?.destination?.destinationKind === 'highschool_classroom' ||
    activeLifeScene?.destination?.destinationKind === 'college_campus' ||
    /school.?uniform|school.?blazer/.test(combinedHay)
  ) {
    forcedSceneGarment = 'school_blazer';
  } else if (
    activeLifeScene?.hobby?.hobbyKind === 'yoga' ||
    activeLifeScene?.hobby?.hobbyKind === 'gym_weights' ||
    activeLifeScene?.hobby?.hobbyKind === 'gym_treadmill' ||
    activeLifeScene?.hobby?.hobbyKind === 'sports_basketball' ||
    activeLifeScene?.hobby?.hobbyKind === 'sports_tennis' ||
    activeLifeScene?.destination?.destinationKind === 'gym_studio' ||
    activeLifeScene?.destination?.destinationKind === 'sports_court' ||
    /\byoga\b|workout|athleisure|sporty.?tee|\bgym\b|dumbbell|treadmill|cardio|basketball|tennis|fitness/.test(combinedHay)
  ) {
    forcedSceneGarment = 'sporty_tee_leggings';
  } else if (
    persona.brain?.isSleeping ||
    activeLifeScene?.hobby?.hobbyKind === 'brushing_teeth' ||
    /pajama|sleepwear|bedtime|late.?night.?loungewear/.test(combinedHay)
  ) {
    forcedSceneGarment = 'cozy_pajamas';
  }

  const explicitNativeRequest = /\b(default|original|native)\s*(vrm|outfit|clothes|mesh)\b/i.test(prompt);

  // Collect distinct wearable 3D VRM/GLB avatar models (NOT recycled recolored slots of the same VRM!)
  const activeVaultId = activeSlot?.modelVaultId ?? null;
  const availableVrms = listAvailableVrmModels(vaultModels, activeVaultId);
  const alternativeVrmModels: VrmSwitchCandidate[] =
    allowWholeOutfitSwitch && settings.autoSwitchVrmModels !== false && availableVrms.length > 1
      ? availableVrms.filter((v) => !v.isActive)
      : [];

  const enforceSceneGarment = (plan: AiOutfitPlan): AiOutfitPlan => {
    const pickedVrmName = plan.preferredExistingSlot?.trim() || null;
    const pickedValidAltVrm =
      pickedVrmName &&
      alternativeVrmModels.some(
        (v) =>
          v.fileName.toLowerCase() === pickedVrmName.toLowerCase() ||
          v.label.toLowerCase() === pickedVrmName.toLowerCase() ||
          v.fileName.toLowerCase().includes(pickedVrmName.toLowerCase())
      )
        ? pickedVrmName
        : null;

    if (forcedSceneGarment) {
      // If she picked a dedicated VRM whose filename matches the scene (e.g. Miku_Swimsuit.vrm at the beach!),
      // show off that VRM's real native outfit! Otherwise keep any chosen VRM swap + apply the scene 3D garment.
      if (pickedValidAltVrm && doesVrmNameMatchScene(pickedValidAltVrm, forcedSceneGarment)) {
        return {
          ...plan,
          garmentStyle: 'default',
          preferredExistingSlot: pickedValidAltVrm,
        };
      }
      return {
        ...plan,
        garmentStyle: forcedSceneGarment,
        preferredExistingSlot: pickedValidAltVrm,
      };
    }
    // Never wear bath wrap or beach swimsuit outside bath/beach scenes!
    if (plan.garmentStyle === 'bath_wrap' || plan.garmentStyle === 'beach_swimsuit') {
      return {
        ...plan,
        garmentStyle:
          fallback.garmentStyle !== 'bath_wrap' &&
          fallback.garmentStyle !== 'beach_swimsuit' &&
          fallback.garmentStyle !== 'default'
            ? fallback.garmentStyle
            : 'summer_sundress',
        preferredExistingSlot: pickedValidAltVrm,
      };
    }
    // If she explicitly chose to switch to a different VRM model type, let that VRM's own look shine!
    if (pickedValidAltVrm) {
      return {
        ...plan,
        garmentStyle: 'default',
        preferredExistingSlot: pickedValidAltVrm,
      };
    }
    // Never lazily stay locked in the current VRM's baked-in skirt & long sleeves unless explicitly asked!
    if (plan.garmentStyle === 'default' && !explicitNativeRequest) {
      return {
        ...plan,
        garmentStyle:
          fallback.garmentStyle !== 'default' &&
          fallback.garmentStyle !== 'bath_wrap' &&
          fallback.garmentStyle !== 'beach_swimsuit'
            ? fallback.garmentStyle
            : 'streetwear_jacket_shorts',
        preferredExistingSlot: null,
      };
    }
    return {
      ...plan,
      preferredExistingSlot: null,
    };
  };
  const meshSummary = detectedMeshes
    .map((m) => `${m.category}: ${m.label} (${m.currentColorHex})`)
    .join(', ');

  const wholeOutfitRule =
    alternativeVrmModels.length > 0
      ? `- Optional VRM Model Type Switch: You are ALLOWED to switch your entire 3D VRM avatar model to a different type! If one of these other available 3D VRM/GLB models fits the mood, time, or scene well (or you feel like changing VRM types), set "preferredExistingSlot" to its exact filename or label; otherwise set "preferredExistingSlot": null to design a 3D garment silhouette on your current VRM. Available alternative VRM models: ${alternativeVrmModels
          .slice(0, 12)
          .map((v) => `"${v.fileName}" (${v.label})`)
          .join(', ')}.`
      : '- Keep "preferredExistingSlot": null.';

  const systemPrompt = `You are a 3D Anime Virtual Idol designing her own FULL 3D CLOTHING TYPE (not stuck in a skirt & long sleeves!) AND hairstyle based on the current real-world time of day, your live mood, and the current scene/activity.
Return ONLY a valid raw JSON object (no markdown fences, no commentary) with this exact schema:
{
  "outfitName": "2 to 4 word outfit title",
  "occasionLabel": "short time/occasion label",
  "styleNote": "concise 1-sentence reason why she picked this clothing type & hairstyle for the time, mood, and scene",
  "garmentStyle": "bath_wrap|beach_swimsuit|cozy_hoodie_pants|summer_sundress|streetwear_jacket_shorts|sporty_tee_leggings|kimono_yukata|evening_gown|cozy_pajamas|school_blazer|trench_coat_pants",
  "topHex": "#RRGGBB",
  "topAccentHex": "#RRGGBB",
  "topPattern": "none|plaid|gothic_lace|cyber_grid|sakura_petals|starry_night|pastel_stripes|polka_dots|argyle",
  "bottomHex": "#RRGGBB",
  "bottomAccentHex": "#RRGGBB",
  "bottomPattern": "none|plaid|gothic_lace|cyber_grid|sakura_petals|starry_night|pastel_stripes|polka_dots|argyle",
  "footwearHex": "#RRGGBB",
  "accessoryHex": "#RRGGBB",
  "hairStyle": "default|high_ponytail|twin_tails|twin_buns|side_braid|long_wavy|drill_twintails|bob_cut|ahoge_clips",
  "hairTintHex": null,
  "hairHighlightHex": null,
  "hideOuterLayers": false,
  "preferredExistingSlot": null,
  "accessories": [],
  "clearanceBoost": false,
  "seatedFriendly": false
}
MANDATORY Scene-Appropriate Wardrobe Rules (ALWAYS match the scene!):
- "bath_wrap": REQUIRED for bathroom / shower / towel-dry / bath care (fluffy SFW bath towel wrap)
- "beach_swimsuit": REQUIRED for tropical beach / ocean / swimming (stylish SFW anime one-piece resort swimsuit + pareo wrap)
- "kimono_yukata": REQUIRED for mountain onsen / hot spring / Japanese festival
- "school_blazer": REQUIRED for high school classroom / college campus studying
- "cozy_pajamas": REQUIRED for sleeping / bedtime / late night lounging / brushing teeth before bed
- "sporty_tee_leggings": REQUIRED for yoga / stretching / workout / energetic active morning
- "cozy_hoodie_pants": Oversized pullover hoodie + jogger pants (rainy lo-fi room, gaming, relaxing)
- "summer_sundress": Sleeveless strappy summer sundress with flared midi skirt (sunny afternoon cafe, warm mood)
- "streetwear_jacket_shorts": Cropped bomber jacket + belted casual shorts (shopping mall, amusement park, proud/amused outings)
- "evening_gown": Off-shoulder floor-length evening gown & opera gloves (gothic cathedral, evening dinner/date, concert stage)
- "trench_coat_pants": Chic double-breasted belted trench coat + tailored trousers (crisp weekday mornings, rainy walks, evening city strolls)
- NEVER lock her into her VRM model's default skirt & long sleeves: always pick the best 3D clothing silhouette above for the time, mood, and live scene!
- Pick a matching "hairStyle" and 0 to 2 tasteful accessories from ONLY: "cat_ears", "halo", "ribbon_bow", "cyber_visor", "choker", "fairy_wings", "idol_crown".
- Keep hairTintHex & hairHighlightHex as null unless explicitly asked to dye hair.
${structuralSummary?.hasCulledTorsoSkin ? '- STRUCTURAL GUARD: This VRM has culled/deleted skin underneath clothes. Prefer full-coverage silhouettes (onepiece, cozy_pajamas, cozy_hoodie_pants, school_blazer) or set "clearanceBoost": true. Avoid micro-crop tops.' : ''}
${structuralSummary?.activePosture === 'seated_table' ? '- SEATED GUARD: The idol is currently seated at a table. Set "seatedFriendly": true to apply rear-glute skirt deflection and avoid stiff floor-length hems.' : ''}
${wholeOutfitRule}`;

  const userText = `Character: ${persona.name} (${persona.title})
Personality: ${persona.traits}
Current Mood: ${persona.mood}
Previous Garment Type: ${previousGarmentStyle} (prefer choosing a fresh clothing type that fits the time, mood & scene!)
${liveSceneSummary ? `Current Live Scene / Activity: ${liveSceneSummary}` : ''}
${structuralSummary ? `VRM Structure: Torso Skin ${structuralSummary.hasCulledTorsoSkin ? 'Culled' : 'Intact'}, Posture ${structuralSummary.activePosture}, Native slots [${structuralSummary.nativeOutfitSlots.join(', ')}]` : ''}
Available clothing meshes: ${meshSummary || 'Tops, Bottoms, Footwear, Hair'}
Fashion Brief / Request: ${prompt}
Output ONLY the JSON object.`;

  // 1. Local LLM FIRST (LM Studio :1234 — character chooses Gemma, Qwen, or Both!)
  if (preferLocalFirst || settings.preferLocalAi) {
    const localResult = await queryLocalLlmForOutfit({
      systemPrompt,
      userText,
      taskKind: 'wardrobe',
      mood: persona.mood,
    });
    if (localResult?.text) {
      const parsedLocal = parseOutfitPlanJson(
        localResult.text,
        fallback,
        'local-llm',
        localResult.modelUsed
      );
      if (parsedLocal) {
        return enforceSceneGarment(parsedLocal);
      }
    }
    // If user explicitly enabled Prefer Local Offline AI, stay 100% offline without calling cloud
    if (settings.preferLocalAi) {
      return enforceSceneGarment(fallback);
    }
  }

  // 2. Gemini LLM fallback (when Local LLM is not running & cloud key is configured)
  const apiKey = resolveEffectiveApiKey(settings);
  const isLocalKeyword = /^(local|lm-studio|ollama)$/i.test(apiKey);
  if (!apiKey || isLocalKeyword) {
    return enforceSceneGarment(fallback);
  }

  const callModel = async (model: string): Promise<Response> =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 360,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

  const primaryModel = settings.textModel?.trim() || DEFAULT_TEXT_MODEL;
  let res = await callModel(primaryModel);
  if (res.status === 404) {
    const discovered = await listAvailableGeminiModels(apiKey);
    const nextModel = discovered.textModels[0] || DEFAULT_TEXT_MODEL;
    if (nextModel !== primaryModel) {
      res = await callModel(nextModel);
    }
  }

  if (!res.ok) {
    console.warn(`[AI Outfit] Gemini returned HTTP ${res.status}, using offline stylist`);
    return enforceSceneGarment(fallback);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const rawText = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();

  return enforceSceneGarment(
    parseOutfitPlanJson(rawText, fallback, 'gemini-llm', primaryModel) || fallback
  );
}

async function materializeOutfitPlan(
  plan: AiOutfitPlan,
  detectedMeshes: MeshDescriptor[]
): Promise<GeneratedOutfitPayload> {
  const materialMods: Record<string, MaterialMod> = {};
  const meshVisibility: Record<string, boolean> = {};

  let topTexRecord: { id: string; dataUrl: string; fileName: string } | null = null;
  if (plan.topPattern !== 'none') {
    const dataUrl = renderFabricPatternDataUrl({
      pattern: plan.topPattern,
      baseHex: plan.topHex,
      accentHex: plan.topAccentHex,
    });
    if (dataUrl) {
      const fileName = `ai-${plan.topPattern}-top.png`;
      const saved = await saveTextureToVault({
        fileName,
        mimeType: 'image/png',
        dataUrl,
        sizeBytes: Math.round(dataUrl.length * 0.75),
      });
      topTexRecord = { id: saved.id, dataUrl, fileName };
    }
  }

  let bottomTexRecord: { id: string; dataUrl: string; fileName: string } | null = null;
  if (plan.bottomPattern !== 'none') {
    const dataUrl = renderFabricPatternDataUrl({
      pattern: plan.bottomPattern,
      baseHex: plan.bottomHex,
      accentHex: plan.bottomAccentHex,
    });
    if (dataUrl) {
      const fileName = `ai-${plan.bottomPattern}-bottom.png`;
      const saved = await saveTextureToVault({
        fileName,
        mimeType: 'image/png',
        dataUrl,
        sizeBytes: Math.round(dataUrl.length * 0.75),
      });
      bottomTexRecord = { id: saved.id, dataUrl, fileName };
    }
  }

  const topMeshes = detectedMeshes.filter((m) => m.category === 'Tops');
  const outerLayerRegex = /(coat|jacket|blazer|cardigan|cloak|cape|mantle|outer|hoodie|bolero|vest)/i;
  const hidesNativeClothes = GARMENT_STYLE_META[plan.garmentStyle]?.hidesNativeClothes ?? false;

  for (const mesh of detectedMeshes) {
    const isOuterLayer =
      mesh.category === 'Tops' &&
      topMeshes.length > 1 &&
      outerLayerRegex.test(`${mesh.name} ${mesh.label}`);

    if (hidesNativeClothes && (mesh.category === 'Tops' || mesh.category === 'Bottoms')) {
      // Hide separate built-in skirt & long-sleeve blouse meshes so the AI's 3D garment silhouette takes over cleanly!
      meshVisibility[mesh.name] = false;
    } else {
      meshVisibility[mesh.name] = plan.hideOuterLayers && isOuterLayer ? false : true;
    }

    if (mesh.category === 'Tops') {
      materialMods[mesh.name] = topTexRecord
        ? {
            textureVaultId: topTexRecord.id,
            textureDataUrl: topTexRecord.dataUrl,
            textureFileName: topTexRecord.fileName,
          }
        : { colorHex: plan.topHex };
    } else if (mesh.category === 'Bottoms') {
      materialMods[mesh.name] = bottomTexRecord
        ? {
            textureVaultId: bottomTexRecord.id,
            textureDataUrl: bottomTexRecord.dataUrl,
            textureFileName: bottomTexRecord.fileName,
          }
        : { colorHex: plan.bottomHex };
    } else if (mesh.category === 'Footwear') {
      materialMods[mesh.name] = { colorHex: plan.footwearHex };
    } else if (mesh.category === 'Accessories') {
      materialMods[mesh.name] = { colorHex: plan.accessoryHex };
    } else if (mesh.category === 'Hair' && plan.hairTintHex) {
      materialMods[mesh.name] = { colorHex: plan.hairTintHex };
    }
  }

  return {
    plan,
    materialMods,
    meshVisibility,
    accessories: plan.accessories,
    accessoryColorHex: plan.accessoryHex,
    hairStyle: plan.hairStyle,
    hairColorHex: plan.hairTintHex || null,
    hairHighlightHex: plan.hairHighlightHex || null,
    garmentStyle: plan.garmentStyle,
    garmentPalette: {
      topHex: plan.topHex,
      topAccentHex: plan.topAccentHex,
      bottomHex: plan.bottomHex,
      bottomAccentHex: plan.bottomAccentHex,
      accessoryHex: plan.accessoryHex,
      topTextureDataUrl: topTexRecord?.dataUrl || null,
      bottomTextureDataUrl: bottomTexRecord?.dataUrl || null,
    },
    preferredExistingSlot: plan.preferredExistingSlot || null,
  };
}

/**
 * Generates a full AI-styled outfit, 3D garment silhouette & matching hairstyle from a custom prompt (LM Studio first).
 */
export async function generateAiOutfit(params: {
  prompt: string;
  persona: Persona;
  detectedMeshes: MeshDescriptor[];
  settings: StudioSettings;
  vaultModels?: VaultModelMeta[];
  activeLifeScene?: ActiveLifeScene | null;
  occasionLabel?: string;
  structuralSummary?: VrmStructuralSummary | null;
}): Promise<GeneratedOutfitPayload> {
  const plan = await requestLlmOutfitPlan({
    prompt: params.prompt,
    occasionLabel: params.occasionLabel || 'Custom Style',
    persona: params.persona,
    detectedMeshes: params.detectedMeshes,
    settings: params.settings,
    vaultModels: params.vaultModels,
    activeLifeScene: params.activeLifeScene,
    allowWholeOutfitSwitch: params.settings.autoSwitchVrmModels !== false,
    preferLocalFirst: true,
    structuralSummary: params.structuralSummary,
  });
  return materializeOutfitPlan(plan, params.detectedMeshes);
}

/**
 * Lets the AI character autonomously design her own outfit silhouette & hairstyle (or swap into another VRM model type)
 * for the current real-world time of day, mood, and live scene using LM Studio first.
 */
export async function generateTimeOccasionOutfit(params: {
  persona: Persona;
  detectedMeshes: MeshDescriptor[];
  settings: StudioSettings;
  vaultModels?: VaultModelMeta[];
  activeLifeScene?: ActiveLifeScene | null;
  occasionOverride?: string;
  allowWholeOutfitSwitch?: boolean;
  structuralSummary?: VrmStructuralSummary | null;
}): Promise<{ payload: GeneratedOutfitPayload; brief: TimeOccasionBrief }> {
  const brief = buildTimeOccasionBrief({
    persona: params.persona,
    occasionOverride: params.occasionOverride,
  });
  const plan = await requestLlmOutfitPlan({
    prompt: brief.promptSummary,
    occasionLabel: brief.occasionLabel,
    persona: params.persona,
    detectedMeshes: params.detectedMeshes,
    settings: params.settings,
    vaultModels: params.vaultModels,
    activeLifeScene: params.activeLifeScene,
    allowWholeOutfitSwitch:
      params.allowWholeOutfitSwitch ?? (params.settings.autoSwitchVrmModels !== false),
    preferLocalFirst: true,
    structuralSummary: params.structuralSummary,
  });
  const payload = await materializeOutfitPlan(plan, params.detectedMeshes);
  return { payload, brief };
}

function buildOfflineHairStylePlan(prompt: string, phase: CircadianPhase): AiHairStylePlan {
  const p = prompt.toLowerCase();
  let hairStyle: HairStyleId =
    phase === 'morning'
      ? 'high_ponytail'
      : phase === 'afternoon'
      ? 'twin_buns'
      : phase === 'evening'
      ? 'long_wavy'
      : 'ahoge_clips';

  if (/ponytail|pony|sport|gym|fresh/.test(p)) hairStyle = 'high_ponytail';
  else if (/drill|spiral|princess|ojou/.test(p)) hairStyle = 'drill_twintails';
  else if (/bun|odango|cute|cafe|china/.test(p)) hairStyle = 'twin_buns';
  else if (/twin|pigtail|idol|miku|stage/.test(p)) hairStyle = 'twin_tails';
  else if (/braid|plait|cozy|rain|soft|gentle/.test(p)) hairStyle = 'side_braid';
  else if (/wave|wavy|long|elegant|date|dinner/.test(p)) hairStyle = 'long_wavy';
  else if (/bob|short|chic|neat/.test(p)) hairStyle = 'bob_cut';
  else if (/ahoge|clip|pin|messy|bed|sleep|pajama/.test(p)) hairStyle = 'ahoge_clips';
  else if (/original|default|normal|reset/.test(p)) hairStyle = 'default';

  let hairColorHex: string | null = null;
  let hairHighlightHex: string | null = null;
  if (/pink|sakura|blossom|rose/.test(p)) {
    hairColorHex = '#f4a5c4';
    hairHighlightHex = '#ffe4ef';
  } else if (/lavender|purple|violet|lilac|silver/.test(p)) {
    hairColorHex = '#c8b6ff';
    hairHighlightHex = '#eef2ff';
  } else if (/blue|midnight|navy|sapphire/.test(p)) {
    hairColorHex = '#23326b';
    hairHighlightHex = '#60a5fa';
  } else if (/teal|cyan|mint|aqua|miku/.test(p)) {
    hairColorHex = '#38bdf8';
    hairHighlightHex = '#99f6e4';
  } else if (/blonde|gold|honey|yellow/.test(p)) {
    hairColorHex = '#f3d08a';
    hairHighlightHex = '#fffbeb';
  } else if (/red|crimson|ruby|wine/.test(p)) {
    hairColorHex = '#881337';
    hairHighlightHex = '#fb7185';
  } else if (/black|obsidian|noir|dark/.test(p)) {
    hairColorHex = '#181826';
    hairHighlightHex = '#6366f1';
  }

  const meta = HAIR_STYLE_META[hairStyle];
  return {
    hairStyle,
    hairColorHex,
    hairHighlightHex,
    styleNote: `Styled into ${meta.label.toLowerCase()} for the vibe.`,
    source: 'offline-stylist',
  };
}

/**
 * Uses LM Studio first to pick a 3D hairstyle + optional hair dye/highlight
 * based on a user request, mood, or current real-world time of day.
 */
export async function generateAiHairstyle(params: {
  prompt?: string;
  persona: Persona;
  settings?: StudioSettings;
}): Promise<AiHairStylePlan> {
  const { prompt = '', persona } = params;
  const circadian = getCircadianContext();
  const fallback = buildOfflineHairStylePlan(prompt, circadian.phase);

  const systemPrompt = `You are a 3D Anime Virtual Idol choosing a new hairstyle for yourself.
Return ONLY valid raw JSON (no markdown, no extra text):
{
  "hairStyle": "default|high_ponytail|twin_tails|twin_buns|side_braid|long_wavy|drill_twintails|bob_cut|ahoge_clips",
  "hairColorHex": null,
  "hairHighlightHex": null,
  "styleNote": "One short sentence explaining why you chose this hairstyle"
}
Rules:
- Pick a hairstyle that fits the request, mood, and time of day (${circadian.phaseLabel}, ${circadian.clockText}).
- Keep hairColorHex and hairHighlightHex as null to match your natural hair color, UNLESS a hair dye/color change is requested or feels fun for a bold look.`;

  const userText = `Character: ${persona.name} (${persona.title})
Mood: ${persona.mood}
Current time: ${circadian.clockText} (${circadian.phaseLabel})
Request: ${prompt.trim() || 'Pick a fresh cute hairstyle you feel like wearing right now!'}
Output ONLY the JSON object.`;

  const localResult = await queryLocalLlmForOutfit({
    systemPrompt,
    userText,
    taskKind: 'hairstyle',
    mood: persona.mood,
  });
  if (localResult?.text) {
    const match = /\{[\s\S]*\}/.exec(localResult.text);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        return {
          hairStyle: normalizeHairStyle(parsed.hairStyle, fallback.hairStyle),
          hairColorHex:
            typeof parsed.hairColorHex === 'string' &&
            /^#?[0-9a-fA-F]{6}$/.test(parsed.hairColorHex.trim())
              ? normalizeHex(parsed.hairColorHex, '#ffffff')
              : null,
          hairHighlightHex:
            typeof parsed.hairHighlightHex === 'string' &&
            /^#?[0-9a-fA-F]{6}$/.test(parsed.hairHighlightHex.trim())
              ? normalizeHex(parsed.hairHighlightHex, '#ffffff')
              : null,
          styleNote:
            typeof parsed.styleNote === 'string' && parsed.styleNote.trim()
              ? parsed.styleNote.trim().slice(0, 140)
              : fallback.styleNote,
          source: 'local-llm',
          modelUsed: localResult.modelUsed,
        };
      } catch {
        // fall through
      }
    }
  }

  return fallback;
}


/**
 * Lets the AI character freely choose which 3D VRM/GLB avatar model type to switch into right now
 * (across all imported .vrm/.glb models in the Vault + built-in Default Anime VRM) via LM Studio first!
 */
export async function planAiVrmModelSwitch(params: {
  persona: Persona;
  vaultModels: VaultModelMeta[];
  activeLifeScene?: ActiveLifeScene | null;
  promptHint?: string;
}): Promise<AiVrmSwitchPlan> {
  const { persona, vaultModels, activeLifeScene = null, promptHint = '' } = params;
  const activeSlot =
    persona.outfitSlots.find((s) => s.id === persona.activeOutfitSlotId) ||
    persona.outfitSlots[0];
  const activeVaultId = activeSlot?.modelVaultId ?? null;
  const candidates = listAvailableVrmModels(vaultModels, activeVaultId);
  const alternatives = candidates.filter((c) => !c.isActive);
  const circadian = getCircadianContext();

  // If only 1 VRM exists (just Default Anime VRM), return it cleanly
  if (alternatives.length === 0) {
    return {
      targetModelId: candidates[0]?.id ?? null,
      targetLabel: candidates[0]?.label ?? DEFAULT_SAMPLE_VRM_LABEL,
      reason: 'Only one VRM model is currently in the Vault—import more .vrm files so I can switch between them!',
      source: 'offline-stylist',
    };
  }

  const pickOfflineCandidate = (): VrmSwitchCandidate => {
    const hint = `${promptHint} ${activeLifeScene?.destination?.placeName || ''} ${activeLifeScene?.hobby?.hobbyName || ''}`.toLowerCase();
    if (hint.trim()) {
      const tokens = hint.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
      for (const c of alternatives) {
        const hay = `${c.fileName} ${c.label}`.toLowerCase();
        if (tokens.some((tok) => hay.includes(tok))) {
          return c;
        }
      }
    }
    return alternatives[Math.floor(Math.random() * alternatives.length)];
  };

  const fallbackCandidate = pickOfflineCandidate();

  const candidateListText = candidates
    .map(
      (c, i) =>
        `  ${i + 1}. "${c.fileName}" (label: "${c.label}")${c.isActive ? ' [CURRENTLY ACTIVE]' : ''}`
    )
    .join('\n');

  const sceneSummary = [
    activeLifeScene?.destination && activeLifeScene.destination.destinationKind !== 'none'
      ? `Location: ${activeLifeScene.destination.placeName}`
      : '',
    activeLifeScene?.hobby ? `Activity: ${activeLifeScene.hobby.hobbyName}` : '',
    activeLifeScene?.dining ? `Dining: ${activeLifeScene.dining.dishName}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const systemPrompt = `You are a 3D Anime Virtual Idol freely choosing which 3D VRM avatar model type you want to switch into right now!
Return ONLY valid raw JSON (no markdown fences, no commentary):
{
  "selectedModel": "exact fileName or label from the available VRM models list (prefer switching to a different VRM model than the currently active one!)",
  "reason": "One short in-character sentence explaining why you chose this VRM type right now"
}`;

  const userText = `Character: ${persona.name} (${persona.title})
Mood: ${persona.mood}
Time: ${circadian.clockText} (${circadian.phaseLabel})
${sceneSummary ? `Live Scene: ${sceneSummary}` : ''}
${promptHint.trim() ? `Request / Hint: ${promptHint.trim()}` : 'Pick whichever VRM model type you feel like switching into right now!'}
Available 3D VRM Models:
${candidateListText}
Output ONLY the JSON object.`;

  const localResult = await queryLocalLlmForOutfit({
    systemPrompt,
    userText,
    taskKind: 'wardrobe',
    mood: persona.mood,
  });

  if (localResult?.text) {
    const match = /\{[\s\S]*\}/.exec(localResult.text);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        const rawSel = String(parsed.selectedModel || '').trim().toLowerCase();
        const resolved =
          alternatives.find(
            (c) =>
              c.fileName.toLowerCase() === rawSel ||
              c.label.toLowerCase() === rawSel ||
              (rawSel.length >= 3 &&
                (c.fileName.toLowerCase().includes(rawSel) ||
                  c.label.toLowerCase().includes(rawSel) ||
                  rawSel.includes(c.label.toLowerCase())))
          ) || fallbackCandidate;

        const reason =
          typeof parsed.reason === 'string' && parsed.reason.trim()
            ? parsed.reason.trim().slice(0, 140)
            : `Switched my VRM model to ${resolved.label} for a fresh ${persona.mood.toLowerCase()} vibe!`;

        return {
          targetModelId: resolved.id,
          targetLabel: resolved.label,
          reason,
          source: 'local-llm',
          modelUsed: localResult.modelUsed,
        };
      } catch {
        // fall through
      }
    }
  }

  return {
    targetModelId: fallbackCandidate.id,
    targetLabel: fallbackCandidate.label,
    reason: `Switched my VRM type to ${fallbackCandidate.label} to match my ${persona.mood.toLowerCase()} mood!`,
    source: 'offline-stylist',
  };
}


export interface GeneratedVrmVariantPayload {
  vrmVariant: VrmAppearanceVariant;
  outfitPayload: GeneratedOutfitPayload;
  baseModelVaultId?: string | null; // undefined = keep current VRM base; null = default-anime.vrm; string = Vault ID
  innerThought: string;
  contextLabel: string;
  source: OutfitEngineSource;
  modelUsed?: string;
}

export interface VrmMoodTimeDayContext {
  dayName: string;
  dayShort: string;
  isWeekend: boolean;
  phase: CircadianPhase;
  phaseLabel: string;
  phaseEmoji: string;
  clockText: string;
  mood: string;
  contextLabel: string;
  vibeBrief: string;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORTS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getVrmMoodTimeDayContext(persona: Persona, now = new Date()): VrmMoodTimeDayContext {
  const circadian = getCircadianContext(now);
  const dayIdx = now.getDay();
  const dayName = WEEKDAY_NAMES[dayIdx] || 'Today';
  const dayShort = WEEKDAY_SHORTS[dayIdx] || 'Day';
  const isWeekend = dayIdx === 0 || dayIdx === 6;

  const dayFlavor =
    dayIdx === 5
      ? 'Friday festive energy — stylish, bold, ready to celebrate the weekend'
      : dayIdx === 6
      ? 'Saturday playful freedom — expressive, fun, adventurous weekend aesthetic'
      : dayIdx === 0
      ? 'Sunday serene relaxation — soft pastel, dreamy, peaceful recharge vibe'
      : dayIdx === 1
      ? 'Monday fresh start — crisp, confident, sharp chic energy'
      : 'Midweek creative rhythm — expressive, comfortable, personal style';

  const timeFlavor =
    circadian.phase === 'morning'
      ? 'bright fresh morning light (clean silhouettes, lively colors, energetic hair)'
      : circadian.phase === 'afternoon'
      ? 'warm sunlit afternoon (playful, airy, expressive daytime look)'
      : circadian.phase === 'evening'
      ? 'golden-hour / neon evening (glamorous, dramatic, atmospheric idol elegance)'
      : 'cozy late-night quiet (dreamy starry pastels, soft loungewear, relaxed hair)';

  const moodFlavorMap: Record<string, string> = {
    Proud: 'bold royal or cyber idol confidence with dramatic eyes and regal flair',
    Warm: 'gentle sunlit pastel warmth with soft golden/peach accents and friendly charm',
    Amused: 'playful, colorful, mischievous anime energy with fun accessories',
    Shy: 'delicate petite fairy or soft braided dreamy pastel look',
    Flustered: 'cute blush-toned romantic ribbons and sweet expressive style',
    Pouty: 'tsundere chic streetwear or dark-cute contrast with attitude',
    Deadpan: 'cool minimalist midnight/lavender aesthetic with calm elegance',
    Annoyed: 'edgy crimson/cyber dark fashion with sharp striking eyes',
  };
  const moodFlavor = moodFlavorMap[persona.mood] || 'expressive anime idol style matching her current mood';

  return {
    dayName,
    dayShort,
    isWeekend,
    phase: circadian.phase,
    phaseLabel: circadian.phaseLabel,
    phaseEmoji: circadian.phaseEmoji,
    clockText: circadian.clockText,
    mood: persona.mood,
    contextLabel: `${dayShort} ${circadian.phaseLabel} · ${persona.mood}`,
    vibeBrief: `${dayName} ${circadian.phaseLabel} (${circadian.clockText}) — ${dayFlavor}; ${timeFlavor}; feeling ${persona.mood} (${moodFlavor}).`,
  };
}

const OFFLINE_VRM_ARCHETYPES: Array<{
  keywords: RegExp;
  variantName: string;
  bodyScale: number;
  headScale: number;
  eyeColorHex: string;
  skinToneShift: NonNullable<VrmAppearanceVariant['skinToneShift']>;
  hairStyle: HairStyleId;
  hairColorHex: string;
  hairHighlightHex: string;
  garmentStyle: GarmentStyleId;
  topHex: string;
  topAccentHex: string;
  bottomHex: string;
  bottomAccentHex: string;
  accessoryHex: string;
  accessories: ProceduralAccessoryId[];
  reason: string;
}> = [
  {
    keywords: /cyber|neon|future|tech|sci.?fi|hologram/i,
    variantName: 'Cyber Neon Idol VRM',
    bodyScale: 1.03,
    headScale: 0.99,
    eyeColorHex: '#22d3ee',
    skinToneShift: 'fair_porcelain',
    hairStyle: 'drill_twintails',
    hairColorHex: '#38bdf8',
    hairHighlightHex: '#e879f9',
    garmentStyle: 'streetwear_jacket_shorts',
    topHex: '#111827',
    topAccentHex: '#22d3ee',
    bottomHex: '#1e1b4b',
    bottomAccentHex: '#f472b6',
    accessoryHex: '#22d3ee',
    accessories: ['cyber_visor', 'choker'],
    reason: 'Generated a tall cyber-neon idol VRM with electric cyan eyes, twin drills & glowing visor!',
  },
  {
    keywords: /fairy|petite|chibi|angel|pastel|princess|cute|sweet/i,
    variantName: 'Petite Pastel Fairy VRM',
    bodyScale: 0.92,
    headScale: 1.06,
    eyeColorHex: '#f472b6',
    skinToneShift: 'warm_peach',
    hairStyle: 'twin_buns',
    hairColorHex: '#f9a8d4',
    hairHighlightHex: '#fef08a',
    garmentStyle: 'summer_sundress',
    topHex: '#fdf2f8',
    topAccentHex: '#f472b6',
    bottomHex: '#fbcfe8',
    bottomAccentHex: '#f472b6',
    accessoryHex: '#fde047',
    accessories: ['fairy_wings', 'halo'],
    reason: 'Generated a petite pastel fairy VRM with sakura hair, rosy eyes, halo & fairy wings!',
  },
  {
    keywords: /goth|vamp|dark|crimson|queen|night|royal|evening/i,
    variantName: 'Crimson Gothic Queen VRM',
    bodyScale: 1.06,
    headScale: 0.98,
    eyeColorHex: '#f43f5e',
    skinToneShift: 'fair_porcelain',
    hairStyle: 'long_wavy',
    hairColorHex: '#1e1b2e',
    hairHighlightHex: '#fb7185',
    garmentStyle: 'evening_gown',
    topHex: '#4c0519',
    topAccentHex: '#fb7185',
    bottomHex: '#18181b',
    bottomAccentHex: '#be123c',
    accessoryHex: '#fbbf24',
    accessories: ['idol_crown', 'choker'],
    reason: 'Generated a tall porcelain gothic queen VRM with ruby eyes, long midnight waves & crimson gown!',
  },
  {
    keywords: /shrine|kimono|yukata|sakura|japanese|festival|onsen/i,
    variantName: 'Sakura Shrine Maiden VRM',
    bodyScale: 1.0,
    headScale: 1.01,
    eyeColorHex: '#a855f7',
    skinToneShift: 'fair_porcelain',
    hairStyle: 'side_braid',
    hairColorHex: '#27273a',
    hairHighlightHex: '#f472b6',
    garmentStyle: 'kimono_yukata',
    topHex: '#fff1f2',
    topAccentHex: '#f43f5e',
    bottomHex: '#be123c',
    bottomAccentHex: '#fde047',
    accessoryHex: '#f43f5e',
    accessories: ['ribbon_bow'],
    reason: 'Generated a classic Japanese shrine/festival VRM with violet eyes, side braid & sakura kimono!',
  },
  {
    keywords: /beach|summer|sun|tropical|swim|gyaru|blonde/i,
    variantName: 'Sun-Kissed Summer Idol VRM',
    bodyScale: 1.01,
    headScale: 1.0,
    eyeColorHex: '#10b981',
    skinToneShift: 'sun_kissed',
    hairStyle: 'high_ponytail',
    hairColorHex: '#f3d08a',
    hairHighlightHex: '#fffbeb',
    garmentStyle: 'beach_swimsuit',
    topHex: '#06b6d4',
    topAccentHex: '#ffffff',
    bottomHex: '#67e8f9',
    bottomAccentHex: '#f472b6',
    accessoryHex: '#f472b6',
    accessories: ['ribbon_bow'],
    reason: 'Generated a sun-kissed blonde summer VRM with emerald eyes, high ponytail & resort swimsuit!',
  },
  {
    keywords: /cozy|gamer|neko|cat|hoodie|casual|lofi/i,
    variantName: 'Lavender Neko Gamer VRM',
    bodyScale: 0.96,
    headScale: 1.03,
    eyeColorHex: '#c084fc',
    skinToneShift: 'warm_peach',
    hairStyle: 'bob_cut',
    hairColorHex: '#c4b5fd',
    hairHighlightHex: '#f5d0fe',
    garmentStyle: 'cozy_hoodie_pants',
    topHex: '#ede9fe',
    topAccentHex: '#8b5cf6',
    bottomHex: '#1e1b4b',
    bottomAccentHex: '#c4b5fd',
    accessoryHex: '#a855f7',
    accessories: ['cat_ears'],
    reason: 'Generated a cute lavender neko-gamer VRM with bob hair, amethyst eyes, cat ears & oversized hoodie!',
  },
];

/**
 * Generates a complete AI-transformed 3D VRM Avatar Type via local LM Studio (Gemma / Qwen / Both!):
 * morphs height & head proportions, recolors Eye Iris anime color, adjusts skin warmth, swaps 3D hairstyle + hair dye,
 * equips a sculpted 3D garment silhouette + 3D accessories, and optionally swaps base `.vrm` if multiple exist!
 * Works seamlessly even when the user only has 1 `.vrm` file in their Vault!
 */
export async function generateAiVrmVariant(params: {
  prompt?: string;
  persona: Persona;
  detectedMeshes: MeshDescriptor[];
  vaultModels: VaultModelMeta[];
  activeLifeScene?: ActiveLifeScene | null;
}): Promise<GeneratedVrmVariantPayload> {
  const { prompt = '', persona, detectedMeshes, vaultModels, activeLifeScene = null } = params;
  const ctx = getVrmMoodTimeDayContext(persona);
  const activeSlot =
    persona.outfitSlots.find((s) => s.id === persona.activeOutfitSlotId) ||
    persona.outfitSlots[0];
  const prevVariantName = activeSlot?.vrmVariant?.variantName || '';

  const pickFallbackArchetype = () => {
    const combined = `${prompt} ${activeLifeScene?.destination?.placeName || ''} ${activeLifeScene?.hobby?.hobbyName || ''}`.trim();
    if (combined) {
      const matched = OFFLINE_VRM_ARCHETYPES.find((a) => a.keywords.test(combined));
      if (matched) return matched;
    }
    // Day + Time + Mood aware archetype selection when thinking autonomously!
    let preferredIdx = -1;
    if (ctx.phase === 'late_night') preferredIdx = 5; // Cozy Lavender Neko Gamer
    else if (ctx.phase === 'evening' && (ctx.mood === 'Proud' || ctx.mood === 'Annoyed' || ctx.dayName === 'Friday')) {
      preferredIdx = 2; // Crimson Gothic Queen
    } else if (ctx.isWeekend && (ctx.mood === 'Warm' || ctx.mood === 'Shy' || ctx.mood === 'Flustered')) {
      preferredIdx = 1; // Petite Pastel Fairy
    } else if (ctx.mood === 'Amused' || ctx.mood === 'Pouty' || ctx.dayName === 'Friday') {
      preferredIdx = 0; // Cyber Neon Idol
    } else if (ctx.dayName === 'Sunday' || ctx.mood === 'Deadpan') {
      preferredIdx = 3; // Sakura Shrine Maiden
    }
    if (preferredIdx >= 0 && OFFLINE_VRM_ARCHETYPES[preferredIdx]?.variantName !== prevVariantName) {
      return OFFLINE_VRM_ARCHETYPES[preferredIdx];
    }
    const pool = OFFLINE_VRM_ARCHETYPES.filter((a) => a.variantName !== prevVariantName);
    return pool[Math.floor(Math.random() * pool.length)] || OFFLINE_VRM_ARCHETYPES[0];
  };

  const fb = pickFallbackArchetype();
  const vrmCandidates = listAvailableVrmModels(vaultModels, activeSlot?.modelVaultId);

  const systemPrompt = `You are a 3D Anime VRM Virtual Idol who THINKS for herself about the current day of the week, real-world time of day, and her live mood — then generates a brand-new VRM avatar transformation!
You can transform body proportions (petite vs tall), anime eye iris color, skin warmth, 3D hairstyle & hair dye/highlights, sculpted 3D clothing silhouette, and 3D accessories.
Return ONLY valid raw JSON (no markdown fences, no commentary):
{
  "innerThought": "One vivid first-person thought reflecting on today's day of week, time of day, and your mood explaining why you want to transform into this new VRM right now",
  "variantName": "2-4 word VRM type title (e.g. 'Friday Neon Idol VRM', 'Sunday Pastel Fairy VRM', 'Midnight Crimson Diva VRM')",
  "bodyScale": 0.98,
  "headScale": 1.02,
  "eyeColorHex": "#RRGGBB",
  "skinToneShift": "default|fair_porcelain|warm_peach|sun_kissed",
  "hairStyle": "high_ponytail|twin_tails|twin_buns|side_braid|long_wavy|drill_twintails|bob_cut|ahoge_clips",
  "hairColorHex": "#RRGGBB",
  "hairHighlightHex": "#RRGGBB",
  "garmentStyle": "cozy_hoodie_pants|summer_sundress|streetwear_jacket_shorts|sporty_tee_leggings|kimono_yukata|evening_gown|cozy_pajamas|school_blazer|trench_coat_pants|beach_swimsuit",
  "topHex": "#RRGGBB",
  "topAccentHex": "#RRGGBB",
  "bottomHex": "#RRGGBB",
  "bottomAccentHex": "#RRGGBB",
  "accessoryHex": "#RRGGBB",
  "accessories": ["cat_ears"|"halo"|"ribbon_bow"|"cyber_visor"|"choker"|"fairy_wings"|"idol_crown"],
  "reason": "One short exciting sentence describing this new AI-generated VRM transformation!"
}
Rules:
- bodyScale must be between 0.88 (petite/cute) and 1.08 (tall runway idol).
- headScale must be between 0.96 and 1.08.
- Match the day of the week (${ctx.dayName}), time (${ctx.phaseLabel} · ${ctx.clockText}), and mood (${ctx.mood}) authentically!
- Preserve a full, continuous watertight humanoid body skin mesh beneath any initial or swapped outfit — NEVER bake occlusion culling or strip under-garment polygons into the base VRM asset!
- Choose vibrant anime eyeColorHex, hairColorHex, hairHighlightHex, and cohesive outfit colors that look dramatically fresh and distinct!
- Only use "beach_swimsuit" when the request or scene is beach/summer/swim related.`;

  const userText = `Character: ${persona.name} (${persona.title})
Personality: ${persona.traits}
Live Context (Day, Time & Mood): ${ctx.vibeBrief}
${prevVariantName ? `Previous VRM Type: ${prevVariantName} (invent a visibly DIFFERENT VRM type!)` : ''}
${activeLifeScene?.destination?.placeName ? `Live Scene: ${activeLifeScene.destination.placeName}` : ''}
Request: ${prompt.trim() || `Think about how you feel on this ${ctx.dayName} ${ctx.phaseLabel.toLowerCase()} while feeling ${ctx.mood}, and generate a brand-new VRM avatar transformation!`}
Output ONLY the JSON object.`;

  let innerThought = `It's ${ctx.dayName} ${ctx.phaseLabel.toLowerCase()} and I'm feeling ${ctx.mood.toLowerCase()} — I want to transform into ${fb.variantName}!`;
  let variantName = fb.variantName;
  let bodyScale = fb.bodyScale;
  let headScale = fb.headScale;
  let eyeColorHex: string | null = fb.eyeColorHex;
  let skinToneShift: NonNullable<VrmAppearanceVariant['skinToneShift']> = fb.skinToneShift;
  let hairStyle: HairStyleId = fb.hairStyle;
  let hairColorHex: string | null = fb.hairColorHex;
  let hairHighlightHex: string | null = fb.hairHighlightHex;
  let garmentStyle: GarmentStyleId =
    ctx.phase === 'late_night' && !prompt.trim() ? 'cozy_pajamas' : fb.garmentStyle;
  let topHex = fb.topHex;
  let topAccentHex = fb.topAccentHex;
  let bottomHex = fb.bottomHex;
  let bottomAccentHex = fb.bottomAccentHex;
  let accessoryHex = fb.accessoryHex;
  let accessories: ProceduralAccessoryId[] = fb.accessories;
  let reason = fb.reason;
  let source: OutfitEngineSource = 'offline-stylist';
  let modelUsed: string | undefined;

  const localResult = await queryLocalLlmForOutfit({
    systemPrompt,
    userText,
    taskKind: 'wardrobe',
    mood: persona.mood,
  });

  if (localResult?.text) {
    const match = /\{[\s\S]*\}/.exec(localResult.text);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        if (typeof parsed.innerThought === 'string' && parsed.innerThought.trim()) {
          innerThought = parsed.innerThought.trim().slice(0, 180);
        }
        if (typeof parsed.variantName === 'string' && parsed.variantName.trim()) {
          variantName = parsed.variantName.trim().slice(0, 40);
        }
        if (typeof parsed.bodyScale === 'number' && Number.isFinite(parsed.bodyScale)) {
          bodyScale = Math.min(1.08, Math.max(0.88, parsed.bodyScale));
        }
        if (typeof parsed.headScale === 'number' && Number.isFinite(parsed.headScale)) {
          headScale = Math.min(1.08, Math.max(0.96, parsed.headScale));
        }
        eyeColorHex = normalizeHex(parsed.eyeColorHex, fb.eyeColorHex);
        const rawSkin = String(parsed.skinToneShift || '').trim().toLowerCase();
        if (
          rawSkin === 'default' ||
          rawSkin === 'fair_porcelain' ||
          rawSkin === 'warm_peach' ||
          rawSkin === 'sun_kissed'
        ) {
          skinToneShift = rawSkin;
        }
        hairStyle = normalizeHairStyle(parsed.hairStyle, fb.hairStyle);
        if (hairStyle === 'default') hairStyle = fb.hairStyle;
        hairColorHex = normalizeHex(parsed.hairColorHex, fb.hairColorHex);
        hairHighlightHex = normalizeHex(parsed.hairHighlightHex, fb.hairHighlightHex);
        garmentStyle = normalizeGarmentStyle(parsed.garmentStyle, `${variantName} ${prompt}`, fb.garmentStyle);
        if (garmentStyle === 'default' || garmentStyle === 'bath_wrap') {
          garmentStyle = fb.garmentStyle;
        }
        if (
          garmentStyle === 'beach_swimsuit' &&
          !/beach|swim|summer|tropical|pool/i.test(`${prompt} ${activeLifeScene?.destination?.placeName || ''}`)
        ) {
          garmentStyle = 'summer_sundress';
        }
        topHex = normalizeHex(parsed.topHex, fb.topHex);
        topAccentHex = normalizeHex(parsed.topAccentHex, fb.topAccentHex);
        bottomHex = normalizeHex(parsed.bottomHex, fb.bottomHex);
        bottomAccentHex = normalizeHex(parsed.bottomAccentHex, fb.bottomAccentHex);
        accessoryHex = normalizeHex(parsed.accessoryHex, fb.accessoryHex);
        if (Array.isArray(parsed.accessories)) {
          const validAcc = parsed.accessories
            .map((a) => String(a || '').trim().toLowerCase())
            .filter((a): a is ProceduralAccessoryId =>
              ['cat_ears', 'halo', 'ribbon_bow', 'cyber_visor', 'choker', 'fairy_wings', 'idol_crown'].includes(a)
            )
            .slice(0, 2);
          if (validAcc.length > 0) accessories = validAcc;
        }
        if (typeof parsed.reason === 'string' && parsed.reason.trim()) {
          reason = parsed.reason.trim().slice(0, 140);
        }
        source = 'local-llm';
        modelUsed = localResult.modelUsed;
      } catch {
        // Use clean archetype fallback
      }
    }
  }

  const outfitPlan: AiOutfitPlan = {
    outfitName: variantName,
    styleNote: reason,
    occasionLabel: ctx.contextLabel,
    garmentStyle,
    topHex,
    topAccentHex,
    topPattern: 'none',
    bottomHex,
    bottomAccentHex,
    bottomPattern: 'none',
    footwearHex: bottomHex,
    accessoryHex,
    hairStyle,
    hairTintHex: hairColorHex,
    hairHighlightHex,
    accessories,
    source,
    modelUsed,
  };

  const outfitPayload = await materializeOutfitPlan(outfitPlan, detectedMeshes);

  // If user explicitly mentioned switching base VRM too and another base exists, swap base VRM cleanly
  let baseModelVaultId: string | null | undefined = undefined;
  if (vrmCandidates.length > 1 && /\b(base|other vrm|default vrm|swap vrm)\b/i.test(prompt)) {
    const alt = vrmCandidates.find((c) => !c.isActive);
    if (alt) baseModelVaultId = alt.id;
  }

  return {
    vrmVariant: {
      variantName,
      bodyScale,
      headScale,
      eyeColorHex,
      skinToneShift,
      reason,
    },
    outfitPayload,
    baseModelVaultId,
    innerThought,
    contextLabel: ctx.contextLabel,
    source,
    modelUsed,
  };
}
