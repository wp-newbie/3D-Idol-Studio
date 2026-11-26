import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PRESET_SCENERY_IDEAS } from '../services/stageGeneratorService';

const STYLES: Array<{ id: string; label: string }> = [
  { id: 'anime', label: 'Anime' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'gothic', label: 'Gothic' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'cozy', label: 'Cozy' },
  { id: 'photorealistic', label: 'Realistic' },
];

interface StagePainterProps {
  isGenerating: boolean;
  onGenerate: (prompt: string, style?: string) => void;
}

/** Prompt box that asks the AI to paint a brand-new stage backdrop. */
export function StagePainter({ isGenerating, onGenerate }: StagePainterProps) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('anime');

  const submit = () => {
    const clean = prompt.trim();
    if (!clean || isGenerating) return;
    onGenerate(clean, style);
  };

  return (
    <div className="space-y-2 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-950/15 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-fuchsia-200">
        <Sparkles className="h-3.5 w-3.5" />
        AI Stage Painter
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        maxLength={300}
        placeholder="Describe a place… e.g. rainy neon alley at midnight"
        className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px] text-white placeholder:text-zinc-500 focus:border-fuchsia-400/50 focus:outline-none"
      />

      <div className="flex flex-wrap gap-1">
        {PRESET_SCENERY_IDEAS.map((idea) => (
          <button
            key={idea.label}
            type="button"
            disabled={isGenerating}
            onClick={() => setPrompt(idea.prompt)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-300 hover:border-fuchsia-400/40 hover:text-white disabled:opacity-50"
          >
            {idea.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-zinc-200 focus:outline-none"
        >
          {STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={isGenerating || !prompt.trim()}
          className="flex items-center gap-1 rounded-lg bg-fuchsia-500/80 px-3 py-1 text-[11px] font-semibold text-white hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3" />
          {isGenerating ? 'Painting…' : 'Paint stage'}
        </button>
      </div>
      <p className="text-[10px] leading-snug text-zinc-500">
        Uses Imagen with your Gemini key when available, otherwise a free image service (your
        description is sent to it). Takes 10–30 seconds.
      </p>
    </div>
  );
}
