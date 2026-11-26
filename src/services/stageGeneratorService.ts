import { GoogleGenAI } from '@google/genai';
import { saveEnvironmentToVault } from '../storage/modelVault';
import type { CustomStageEnvironment } from '../types/studio';

export interface StageSceneryGenParams {
  prompt: string;
  apiKey?: string;
  style?: 'anime' | 'cyberpunk' | 'gothic' | 'photorealistic' | 'fantasy' | 'cozy';
}

export interface StageSceneryGenResult {
  ok: boolean;
  environment?: CustomStageEnvironment;
  dataUrl?: string;
  engineUsed?: 'imagen' | 'pollinations';
  promptUsed?: string;
  error?: string;
}

export const PRESET_SCENERY_IDEAS = [
  {
    label: '🌸 Sakura Shrine',
    prompt: 'Japanese cherry blossom shrine courtyard at golden hour sunset with hanging lanterns and petals falling',
  },
  {
    label: '🏙️ Cyberpunk Alley',
    prompt: 'Futuristic Neo-Tokyo alley at night with glowing neon kanji signs, wet reflective pavement and holographic billboards',
  },
  {
    label: '🌌 Cosmic Starry Sky',
    prompt: 'Breathtaking celestial galaxy night sky with glowing nebula, purple and teal stardust, and shooting stars over a glass platform',
  },
  {
    label: '🌊 Sunset Beach',
    prompt: 'Tropical anime beach at sunset with calm turquoise waves, soft sand, palm trees and warm orange-pink twilight horizon',
  },
  {
    label: '☕ Rainy Lo-Fi Room',
    prompt: 'Cozy aesthetic room interior at night with rain drizzling on large floor-to-ceiling windows and warm ambient lamp light',
  },
  {
    label: '🏰 Gothic Cathedral',
    prompt: 'Majestic gothic cathedral interior with towering stone arches, intricate purple stained-glass windows and dramatic moonbeams',
  },
  {
    label: '🎤 Idol Concert Stage',
    prompt: 'Grand stadium virtual idol concert stage with dramatic volumetric laser light beams, stage pyrotechnics and cheering glowsticks in the distance',
  },
];

export function enhanceSceneryPrompt(userPrompt: string, style = 'anime'): string {
  const cleanPrompt = userPrompt.trim() || 'futuristic anime idol stage backdrop with atmospheric lighting';
  const styleKeywords = {
    anime: 'masterpiece anime background art, Makoto Shinkai style, vibrant colors, atmospheric lighting',
    cyberpunk: 'cyberpunk 2077 aesthetic, volumetric neon lighting, high-tech reflections, atmospheric haze',
    gothic: 'dark gothic fantasy architecture, dramatic chiaroscuro lighting, intricate details, moody atmosphere',
    photorealistic: 'photorealistic 8k landscape photography, cinematic composition, natural depth of field',
    fantasy: 'ethereal fantasy landscape, magical bioluminescent glow, dreamlike atmospheric scale',
    cozy: 'warm aesthetic illustration, soft ambient lighting, lo-fi nostalgic mood, peaceful serenity',
  };

  const stylePrefix = styleKeywords[style as keyof typeof styleKeywords] || styleKeywords.anime;
  // Ensure the prompt focuses strictly on the stage environment/scenery, without drawing duplicate characters
  return `${stylePrefix}, seamless 360 degree equirectangular panorama backdrop of an empty stage environment, no people, no humans, no characters, no text, no watermark: ${cleanPrompt}`;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Generates an AI stage backdrop using Google GenAI Imagen 3 (or Pollinations AI fallback),
 * and automatically persists it to the IndexedDB Environment Vault.
 */
export async function generateStageScenery(
  params: StageSceneryGenParams
): Promise<StageSceneryGenResult> {
  const enhanced = enhanceSceneryPrompt(params.prompt, params.style);

  // 1. Try Google GenAI Imagen 3 if an API key is provided
  const apiKey = (params.apiKey || '').trim();
  const isLocalKeyword = /^(local|lm-studio|ollama)$/i.test(apiKey);
  if (apiKey && !isLocalKeyword) {
    try {
      const client = new GoogleGenAI({ apiKey });
      const res = await client.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: enhanced,
        config: {
          numberOfImages: 1,
          aspectRatio: '16:9',
          outputMimeType: 'image/jpeg',
        },
      });

      if (res.generatedImages && res.generatedImages.length > 0) {
        const imgObj = res.generatedImages[0].image;
        if (imgObj?.imageBytes) {
          const buffer = base64ToArrayBuffer(imgObj.imageBytes);
          const dataUrl = `data:image/jpeg;base64,${imgObj.imageBytes}`;

          const fileName = `ai_scenery_${Date.now()}.jpg`;
          const saved = await saveEnvironmentToVault({
            fileName,
            kind: 'image',
            mimeType: 'image/jpeg',
            buffer,
          });

          return {
            ok: true,
            environment: {
              vaultId: saved.id,
              fileName: saved.fileName,
              kind: 'image',
            },
            dataUrl,
            engineUsed: 'imagen',
            promptUsed: params.prompt,
          };
        }
      }
    } catch (err) {
      console.warn('[StageGenerator] Imagen 3 generation failed, falling back to Pollinations:', err);
      // Fall through to Pollinations fallback
    }
  }

  // 2. High-speed Pollinations AI fallback (free, keyless). 2:1 so it maps cleanly onto the sky sphere.
  try {
    const seed = Math.floor(Math.random() * 1000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      enhanced
    )}?width=2048&height=1024&nologo=true&seed=${seed}`;

    let buffer: ArrayBuffer;
    let mimeType = 'image/jpeg';
    let dataUrl: string;

    // Prefer the Electron main process (no CORS issues, host allow-listed); fall back to fetch in the browser build.
    const fetchViaMain = window.studioAPI?.fetchImage || window.desktopBridge?.fetchImage;
    if (fetchViaMain) {
      const res = await fetchViaMain(pollinationsUrl);
      if (!res.ok || !res.base64) throw new Error(res.error || 'Image download failed');
      mimeType = res.mimeType || mimeType;
      buffer = base64ToArrayBuffer(res.base64);
      dataUrl = `data:${mimeType};base64,${res.base64}`;
    } else {
      const response = await fetch(pollinationsUrl);
      if (!response.ok) throw new Error(`Pollinations API returned status ${response.status}`);
      const blob = await response.blob();
      mimeType = blob.type || mimeType;
      buffer = await blob.arrayBuffer();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    const fileName = `ai_scenery_${Date.now()}.jpg`;
    const saved = await saveEnvironmentToVault({
      fileName,
      kind: 'image',
      mimeType,
      buffer,
    });

    return {
      ok: true,
      environment: {
        vaultId: saved.id,
        fileName: saved.fileName,
        kind: 'image',
      },
      dataUrl,
      engineUsed: 'pollinations',
      promptUsed: params.prompt,
    };
  } catch (fallbackErr) {
    console.error('[StageGenerator] Both Imagen and Pollinations failed:', fallbackErr);
    return {
      ok: false,
      error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
    };
  }
}
