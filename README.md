# Zeta 3D Idol Studio — Desktop Anime Roleplay & Virtual Idol Stage

A standalone widescreen desktop **3D Anime Roleplay & Virtual Idol Studio** built with **Electron**, **React**, **TypeScript**, **Tailwind CSS**, **Three.js**, **`@pixiv/three-vrm`**, and **`@google/genai`**, styled after Zeta AI's sleek dark-mode visual novel interface.

---

## Features

### 1. Desktop Widescreen Architecture & Layout
- **Split-Pane Widescreen Stage:**
  - **Left Pane (65% width):** Full-bleed interactive 3D WebGL stage (`Three.js` + `OrbitControls`), soft studio rim lighting, reflective stage pedestal, subtle floating particle dust, camera presets (`Portrait`, `Bust`, `Full`, `Reset`), drag-and-drop `.vrm`/`.glb` import, and an on-screen floating **Live Mood Badge** (`[MOOD: Deadpan | Flustered | Annoyed | Shy | Amused | Warm]`).
  - **Right Pane (35% width):** Translucent dark-glass visual novel chat sidebar with structured dialogue cards separating `*italicized micro-actions*`, `"spoken Japanese/English dialogue"`, and smaller `(English subtitle translations)` underneath.
- **Top Control Toolbar:** Instant toggles for **Persona Switcher**, **Persona Roster & Builder**, **3D Wardrobe (`👗`)**, **Voice Language (`日本語` / `English`)**, **Voice Gender (`Female` / `Male`)**, **Vocal Archetype**, **Auto-Speak (`🔊`)**, and **Settings (`⚙️`)**.

### 2. Persistent Local Storage (IndexedDB + Electron Local Disk JSON)
- **3D Model & Outfit Vault (IndexedDB):** Imported `.vrm` and `.glb` models are stored as binary `ArrayBuffer` blobs alongside filenames, format metadata, and auto-captured WebGL preview thumbnails in IndexedDB (`zeta-idol-studio-model-vault`)—bypassing `localStorage` size limits and surviving desktop restarts.
- **Persistent Persona Roster:**
  - Pre-seeded with three complete presets:
    1. **Tachibana Yoshiko (`橘 佳子`)** — Deadpan / tsundere casual girl
    2. **Hatsune Miku (`初音ミク — 紅の夜想曲`)** — Crimson Nocturne Vampire Virtual Diva
    3. **Kurogane Ren (`黒鉄 蓮`)** — Cool guarded male tsundere vocalist
  - Full **Persona Roster & Builder Modal** to create, edit, duplicate, export/import JSON, and delete unlimited custom personas—each with isolated chat history, active `[MOOD]`, default voice settings, and linked 3D outfit slots.
  - Persists simultaneously to IndexedDB (`zeta-idol-studio-state-db`) and Electron's local disk (`<userData>/zeta-studio-state.json`).

### 3. Three-Way 3D Wardrobe & Outfit Switcher (`👗`)
- **Per-Persona Outfit Slots:** Link multiple `.vrm` / `.glb` files (or built-in studio rigs) as named Outfit Slots per persona. Clicking a slot hot-swaps the 3D model **without resetting camera angle, `[MOOD]`, or active chat history**.
- **Live In-Model Clothing & Texture Modding:**
  - **Mesh Layer Toggles:** Automatically runs `scene.traverse()` to detect removable clothing & accessory layers (`Top`, `Jacket`, `Skirt`, `Shorts`, `Shoes`, `Headset`, `Ribbon`, `Coat`) with live `mesh.visible` switches saved per Outfit Slot.
  - **Recolor & Custom `.png` Texture Overlay:** Tint clothing materials (`material.color` & VRM MToon `shadeColorFactor`) with quick swatches or a custom color picker, or upload any `.png` texture live via `THREE.TextureLoader`.
- **Live Outfit-to-Tsundere AI Reaction:** Every outfit swap, layer toggle, or color/texture edit injects `[SYSTEM EVENT: {{user}} just changed your outfit to "${outfitName}" (${changeSummary}). React immediately in character!]` and triggers an immediate in-character reaction turn.

### 4. Japanese Tsundere Dialogue, Gemini TTS & Real-Time 3D VRM Lip-Sync
- **Dual-Key Gemini Client (`@google/genai` + Vertex AI Express):**
  - Supports both standard **`AIza...`** Gemini API keys (`generativelanguage.googleapis.com`) and **`AQ...`** Vertex AI Express keys (`aiplatform.googleapis.com`), configured via `.env` (`GEMINI_API_KEY=...`) or in-app **Settings (`⚙️`)**.
  - Works out of the box with an offline in-character demo fallback before an API key is entered.
- **Japanese Visual Novel Dialogue Format:** Concise 2–4 sentence responses with English `*micro-actions*`, natural conversational Japanese `"dialogue"`, `(English subtitle translation)`, and trailing `[MOOD: ...]`.
- **Voice Acting (`gemini-3.8-flash-tts`) + `ja-JP` Fallback:**
  - Strips `*actions*`, `(translations)`, and `[MOOD]` tags—reading **only** text inside `"quotation marks"`.
  - **Female** (`Aoede` / `Leda`) and **Male** (`Fenrir` / `Charon`) voices across four anime archetypes (*Sharp Classic Tsundere*, *Theatrical Gothic Diva*, *Deadpan & Sleepy*, *Cool Guarded Tsundere*) with **Pitch (`0.85x–1.45x`)** and **Speed (`0.90x–1.25x`)** sliders, plus automatic `ja-JP` / `en-US` `window.speechSynthesis` fallback.
- **Real-Time VRM Lip-Sync & Tsundere Head-Turn:** Connects audio playback to a Web Audio `AnalyserNode` to drive VRM mouth blendshapes (`aa`, `ih`, `ou`) in real time, and smoothly applies a blushing tsundere head turn (`head.rotation.y = -0.18`) when `[MOOD]` shifts to `Flustered` or `Annoyed`.

---

## Quick Start

### Prerequisites
- **Node.js 20+ (LTS)** and **npm**

### 1. Install Dependencies
```bash
npm install
```

### 2. Optional: Configure API Key via `.env`
Copy `.env.example` to `.env` and add either a Gemini API key (`AIza...`) or a Vertex AI Express key (`AQ...`):
```env
GEMINI_API_KEY=AIza...
```
*(You can also enter or switch keys anytime inside the app's **Settings (`⚙️`)** modal.)*

### 3. Run Desktop App in Development Mode
Launches the Vite dev server and Electron desktop widescreen window together:
```bash
npm run dev
```

To run the web preview only (browser mode):
```bash
npm run dev:vite
```

### 4. Type-Check & Build Production Desktop Package
Verify TypeScript compilation with zero errors:
```bash
npm run typecheck
```

Build the production web bundle + standalone desktop Electron installer/portable binary (outputs to `release/`):
```bash
npm run build
```

Build an unpacked desktop directory (fast local test without creating an installer):
```bash
npm run build:dir
```
