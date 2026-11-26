# Zeta 3D Idol Studio — Desktop Anime Roleplay & Virtual Idol Stage

A standalone widescreen desktop **3D Anime Roleplay & Virtual Idol Studio** built with **Electron**, **React**, **TypeScript**, **Tailwind CSS**, **Three.js**, **`@pixiv/three-vrm`**, and dual **Cloud & Local Offline AI** support.

---

## 🌟 Highlights

* **3D Virtual Idol Stage:** Real-time WebGL rendering with `@pixiv/three-vrm`, dynamic lighting, customizable cameras, and audio-reactive lip-syncing.
* **Dual AI Modes:**
  * 🌐 **Cloud AI:** Google Gemini API (`gemini-flash-latest` / `gemini-3.8-flash`) + Gemini TTS.
  * ⚡ **Local Offline AI:** **LM Studio (Qwen 2.5 7B)** + **VOICEVOX (Japanese Anime Voice)** with zero API keys and no quota limits.
* **Real-Time 3D Lip-Sync:** Web Audio `AnalyserNode` maps synthesized audio directly to VRM vowel blendshapes (`aa`, `ih`, `ou`) in real time.
* **3D Wardrobe & Layer Modding:** Detects removable outfit layers, custom texture overlays, and recoloring with live in-character reactions.
* **Desktop Roam Mode:** Pop Zeta out of the studio onto your Windows desktop with click-through transparency and idle check-ins.

---

## 🚀 Getting Started & Setup

### Prerequisites
1. **Node.js 20+ (LTS)** and **npm**
2. *(Optional for Offline Mode)*:
   * **[LM Studio](https://lmstudio.ai/)** (Local LLM Server)
   * **[VOICEVOX](https://voicevox.hiroshiba.jp/)** (Japanese Anime Speech Engine)

---

### Step 1: Install Dependencies
Open a terminal in the project directory and run:

```bash
npm install
```

---

### Step 2: Choose Your AI Backend

You can run Zeta in **Cloud Mode**, **Local Offline Mode**, or seamlessly switch between both anytime.

#### Option A: Local Offline AI Mode (100% Free, Zero Quotas)

1. **Set up LM Studio:**
   * Download and install **[LM Studio](https://lmstudio.ai/)**.
   * In the Search tab, search for and download:
     ```text
     qwen2.5-7b-instruct-1m
     ```
     *(Quantization: `Q4_K_M` recommended)*
   * Go to the **Model Server (`<->`)** tab:
     * Select `Qwen 2.5 7B` at the top.
     * Turn on **CORS** in the right-hand Server Settings.
     * Click **Start Server** (runs at `http://127.0.0.1:1234`).

2. **Set up VOICEVOX (Voice Engine):**
   * Download and run **VOICEVOX** (runs local engine at `http://127.0.0.1:50021`).
   * Default idol voice: **Kasukabe Tsumugi (ID: 8)**.

3. **Activate in App:**
   * Open the app's **Settings (`⚙️`)**.
   * Turn **ON** the switch: **`⚡ Prioritize Local Offline AI`**.
   * Click **Test Local Connection** to confirm connectivity.

---

#### Option B: Cloud Mode (Google Gemini)

1. Create a `.env` file in the project root:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *(Or paste your key into the app's in-game **Settings (`⚙️`)** modal).*
2. Supports standard `AIza...` Gemini keys and `AQ...` Vertex AI Express keys.

---

### Step 3: Run the Studio

Run the desktop widescreen app (launches Vite + Electron together):

```bash
npm run dev
```

To run only the web interface in your browser:
```bash
npm run dev:vite
```

---

## 🛠️ Project Architecture

```
F:\Personal
├── electron/                 # Electron desktop wrapper
│   ├── main.cjs              # Main process, window lifecycle, native IPC proxy
│   ├── preload.cjs           # Secure context bridge API
│   └── launch.cjs            # Desktop hot-reloading orchestrator
├── src/
│   ├── components/           # UI components (Settings, Wardrobe, Toolbar, Viewport)
│   ├── data/                 # Character presets and vocal archetypes
│   ├── services/
│   │   ├── aiBrainService.ts # Context, circadian clock & environmental drift
│   │   ├── geminiClient.ts   # Dual Gemini & LM Studio (Qwen 2.5) brain client
│   │   ├── ttsService.ts     # Audio engine, VOICEVOX bridge & lip-sync analyser
│   │   └── apiKeyResolver.ts # Multi-source key resolver & offline mode detection
│   ├── stage/                # Three.js 3D VRM stage, lighting, and animation
│   └── storage/              # IndexedDB model vault & state persistence
├── package.json
└── vite.config.ts
```

---

## 📦 Build & Release

| Command | Description |
| :--- | :--- |
| `npm run typecheck` | Type-checks all TypeScript files with zero errors. |
| `npm run build:web` | Compiles the production React/Three.js bundle to `dist/`. |
| `npm run build:dir` | Builds an unpacked desktop test package in `release/win-unpacked/`. |
| `npm run build` | Builds full desktop installer & portable `.exe` in `release/`. |

---

## 🔧 Troubleshooting

* **LM Studio Connection Error:**
  * Ensure LM Studio has **Model Server** turned ON (green toggle).
  * Ensure the server port is set to `1234` and **CORS** is enabled.
* **VOICEVOX Audio Error:**
  * Verify VOICEVOX is running in the background (`http://127.0.0.1:50021`).
  * If the port is not active, run `VOICEVOX.exe` or `vv-engine/run.exe --host 127.0.0.1 --port 50021`.
* **IPv6 / Localhost Resolution:**
  * The studio binds directly to IPv4 `127.0.0.1` to avoid Windows IPv6 resolution drops.

---

## 📄 License
Private & Proprietary — Zeta 3D Idol Studio.
