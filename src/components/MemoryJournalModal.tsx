import React, { useState } from 'react';
import { Brain, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { Persona } from '../types/studio';
import { getAffinityTier } from '../data/presets';

interface MemoryJournalModalProps {
  isOpen: boolean;
  persona: Persona;
  isSummarizing: boolean;
  onClose: () => void;
  onAddMemory: (fact: string) => void;
  onDeleteMemory: (id: string) => void;
  onSummarizeNow: () => void;
}

export const MemoryJournalModal: React.FC<MemoryJournalModalProps> = ({
  isOpen,
  persona,
  isSummarizing,
  onClose,
  onAddMemory,
  onDeleteMemory,
  onSummarizeNow,
}) => {
  const [draft, setDraft] = useState('');

  if (!isOpen) return null;

  const tier = getAffinityTier(persona.affinity);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onAddMemory(draft.trim());
    setDraft('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div className="flex max-h-[84vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/[0.12] bg-[#0b0b15] shadow-glass">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-pink-500/20 text-pink-300">
              <Brain className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-white">
                Core Memory Journal — {persona.name}
              </h3>
              <p className="text-xs text-zinc-400">
                Auto-summarized every 12 messages · Persisted in localStorage &amp; injected into AI prompt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Affection Tier Summary */}
        <div className="border-b border-white/[0.08] bg-white/[0.02] px-6 py-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200">
              Tsun ❄️ → Dere 🌸 Affection Gauge
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tier.badgeClass}`}
            >
              {tier.emoji} {tier.label} ({persona.affinity}/100)
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${tier.gradientClass}`}
              style={{ width: `${Math.max(3, persona.affinity)}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-[10px] text-zinc-400">
            <span>0–25 Full Tsun ❄️</span>
            <span>26–55 Softening 🌤️</span>
            <span>56–80 Sweet Dere 🌸</span>
            <span>81–100 Devoted 💖</span>
          </div>
        </div>

        {/* Memory Bullet List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Remembered Facts ({persona.memoryJournal.length})
            </span>
            <button
              type="button"
              disabled={isSummarizing}
              onClick={onSummarizeNow}
              className="flex items-center gap-1.5 rounded-xl border border-violet-400/35 bg-violet-500/15 px-3 py-1 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-500/25 disabled:opacity-50"
            >
              <Sparkles className={`h-3.5 w-3.5 ${isSummarizing ? 'animate-spin' : ''}`} />
              {isSummarizing ? 'Summarizing...' : 'Summarize Recent Chat'}
            </button>
          </div>

          {persona.memoryJournal.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-center text-xs text-zinc-500">
              No saved memories yet. Chat for 12 messages or click &ldquo;Summarize Recent Chat&rdquo; above!
            </div>
          ) : (
            persona.memoryJournal.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-start justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#121220] px-3.5 py-2.5"
              >
                <p className="text-xs leading-relaxed text-zinc-200">• {entry.fact}</p>
                <button
                  type="button"
                  onClick={() => onDeleteMemory(entry.id)}
                  className="shrink-0 rounded-lg p-1 text-zinc-500 opacity-70 transition hover:bg-rose-500/20 hover:text-rose-300 group-hover:opacity-100"
                  title="Forget memory"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Custom Memory Input */}
        <form
          onSubmit={handleAdd}
          className="flex items-center gap-2 border-t border-white/[0.08] px-6 py-3.5"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a permanent memory fact (e.g. Producer loves synthwave music)..."
            className="flex-1 rounded-xl border border-white/10 bg-[#121220] px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-400"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </form>
      </div>
    </div>
  );
};
