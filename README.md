# Zeta 3D Idol Studio — Autonomous 3D Virtual Idol & Desktop Companion

A standalone widescreen desktop **3D Anime Roleplay, Autonomous Life & Virtual Idol Studio** built with **Electron**, **React 19**, **TypeScript**, **Tailwind CSS**, **Three.js**, **`@pixiv/three-vrm`**, and **Multi-Model Local Offline AI (LM Studio — Gemma 4 + Qwen 2.5)** + optional **Google Gemini Cloud AI**.

---

## 🌟 Highlights

* **🧠 Autonomous Multi-Model Local AI (LM Studio — Gemma 4 + Qwen 2.5):**
  * Auto-discovers all loaded chat models on `http://127.0.0.1:1234` (e.g., `gemma-4-e4b-it` and `qwen2.5-7b-instruct-1m`).
  * The AI character **autonomously chooses** whether to use **Gemma**, **Qwen**, or **Both together** based on her live mood and task across dialogue, actions, outfits, hairstyles, 360° scenery, daily life activities, and custom 3D chairs.
  * Seamless fallback to **Google Gemini API** when Cloud Mode is preferred.
* **👗 Bone-Tracked 3D Garment & Silhouette Studio + AI Hairstyles:**
  * **12 Full-Body 3D Garment Silhouettes** mounted directly onto VRM humanoid bones: Oversized Hoodie & Joggers, Summer Sundress, Streetwear Jacket & Shorts, Short-Sleeve Tee & Leggings, Kimono/Yukata, Floor-Length Evening Gown, Cozy Pajamas, School Blazer & Pleated Skirt, Trench Coat & Trousers, **SFW Fluffy Bath Towel Wrap**, **SFW Beach Resort Swimsuit**, plus native VRM clothing.
  * **Scene-Appropriate Wardrobe Enforcement:** Automatically dresses appropriately for every scene (bath towel wrap for showers, beach resort swimsuit for tropical beaches, kimono/yukata for onsen, school blazer for classroom/college, sporty tee & leggings for yoga, pajamas for bedtime).
  * **9 Procedural 3D Hairstyles & Live Sway** + fabric pattern generator (`plaid`, `sakura_petals`, `starry_night`, `gothic_lace`, `cyber_grid`, `pastel_stripes`, `polka_dots`, `argyle`) + whole-outfit `.vrm`/`.glb` Vault switching.
* **🏡 Autonomous AI Life, Dining, Hobbies, School, Bath & Travel:**
  * **Pure AI Free Will:** One button (**🎲 Let Her Decide**) plus an automatic mood/needs living loop lets the character decide on her own when to cook & eat, pursue hobbies, attend High School/College, freshen up, travel, or roam—working in **both Full Studio and transparent Desktop Roam**.
  * **Synchronized 3D Eating & Drinking:** Real 3D dining table, kitchen counter, 10 dishes, world-leveled handheld teacup with sip tilt, and zero-overshoot chopstick pinch & mouth targeting with per-finger articulation.
  * **8 Live 3D Hobby & Study Stations:** Painting (easel + handheld palette & brush), Synth Keyboard, Gaming Setup, Reading (handheld manga + page turns), Baking (mixing bowl + whisk), Photography (camera aim & snap), Yoga, Journaling, plus High School Classroom & College Library with pen-and-paper desk writing.
  * **Wholesome SFW Bathroom Care:** Triple-layer frosted-glass censored shower (steam, bubbles, shampoo, soap, head towel & bath wrap), fluffy towel drying, and bathroom vanity sink toothbrushing.
  * **AI-Generated 3D Chairs:** Whenever she sits down or perches during Roam, she freely chooses her chair style (Princess Throne, Gaming Chair, Velvet Armchair, Cafe Bistro, Wooden Dining, School Chair) and which AI model designs it.
* **🪟 AI-Driven Auto-Roam & Transparent Desktop Roam Mode:**
  * Pop your 3D character onto your Windows desktop with transparent click-through overlay, multi-monitor roaming, floating activity/chat bubble, and foreground 3D props.
  * **AI-Controlled Auto-Roam:** The character autonomously decides when to stand up and stroll around vs. pause roaming and sit down in an AI chair based on her mood, energy, boredom, and curiosity.
* **💃 Convention-Free Smooth 3D Animations (VRM 0.x & VRM 1.0):**
  * Character-frame vector arm solver & palm-forward hand orientation guarantee palm-forward waving, V-sign Idol Peace, crossed arms, shoulder/overhead stretches, and all 13 activity motions never bend backwards on any VRM 0.x or VRM 1.0 rig.
  * Frame-rate-independent exponential smoothing (`expSmooth`) for fluid bone, head, gaze, and viseme transitions.
* **🎙️ Real-Time 3D Lip-Sync & VOICEVOX:** Web Audio `AnalyserNode` maps VOICEVOX / Gemini TTS audio directly to VRM vowel blendshapes (`aa`, `ih`, `ou`, `ee`, `oh`) in real time.

---

## 🚀 Getting Started & Setup

### Prerequisites
1. **Node.js 20+ (LTS)** and **npm**
2. *(Recommended for 100% Local Offline AI)*:
   * **[LM Studio](https://lmstudio.ai/)** (Local LLM Server on `:1234`)
   * **[VOICEVOX](https://voicevox.hiroshiba.jp/)** (Japanese Anime Speech Engine on `:50021`)

---

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Up LM Studio (Local Offline Multi-Model AI)
1. Download and install **[LM Studio](https://lmstudio.ai/)**.
2. Load one or **both** recommended chat models simultaneously in LM Studio:
   ```text
   gemma-4-e4b-it
   qwen2.5-7b-instruct-1m
   ```
3. In the **Developer / Local Server** tab:
   * Enable **CORS**.
   * Click **Start Server** (runs at `http://127.0.0.1:1234`).
4. *(Optional)* Run **VOICEVOX** (`http://127.0.0.1:50021`) for Japanese idol speech synthesis.
5. In the app's **Settings (`⚙️`)**, enable **`⚡ Prioritize Local Offline AI`** and click **Test Local Connection**.

*(Cloud Mode Option: You can also provide a `GEMINI_API_KEY` in `.env` or Settings `⚙️` to use Google Gemini models.)*

### Step 3: Run the Studio
Run the Electron desktop app + Vite together:
```bash
npm run dev
```

Or run the web app only:
```bash
npm run dev:vite
```

---

## 🛠️ Project Architecture

```text
F:\Personal
├── electron/
│   ├── main.cjs                     # Electron main process, transparent Desktop Roam & LM Studio IPC
│   ├── preload.cjs                  # Secure contextBridge API
│   └── launch.cjs                   # Dev orchestrator
├── src/
│   ├── components/
│   │   ├── StageViewport.tsx        # Three.js + VRM viewport, animations, props & camera rig
│   │   ├── LifeStudioDrawer.tsx     # AI-only Autonomous Life drawer (Food/Hobby/School/Bath/Places)
│   │   ├── WardrobeDrawer.tsx       # AI Outfit Designer, 3D Hairstyles, Vault & mesh modding
│   │   ├── FloatingRoamBubble.tsx   # Transparent Desktop Roam companion HUD & activity pill
│   │   ├── AiBrainPopover.tsx       # Live emotion, human needs, thoughts & AI Auto-Roam status
│   │   ├── StagePainter.tsx         # AI-directed 360° stage scenery generator
│   │   └── SettingsModal.tsx        # LM Studio, VOICEVOX, Gemini & studio settings
│   ├── services/
│   │   ├── localLlmOrchestrator.ts  # Autonomous Gemma / Qwen / Dual-Model LM Studio orchestrator
│   │   ├── aiLifePlanner.ts         # AI food, hobbies, school, bath, travel, chair & Auto-Roam planner
│   │   ├── aiOutfitGenerator.ts     # Scene/mood/time-aware AI outfit, garment & hairstyle stylist
│   │   ├── stageGeneratorService.ts # AI-directed 360° backdrop generator
│   │   ├── aiBrainService.ts        # Circadian clock, human needs & climate engine
│   │   ├── geminiClient.ts          # Local LM Studio & Gemini dialogue client
│   │   └── ttsService.ts            # VOICEVOX / Gemini TTS & real-time Web Audio lip-sync
│   ├── stage/
│   │   ├── naturalArmPose.ts        # Convention-free VRM 0.x/1.0 vector arm, palm & activity solver
│   │   ├── garmentRig.ts            # 12 bone-tracked 3D garment silhouettes (dresses, hoodies, swim, bath, etc.)
│   │   ├── hairStyleRig.ts          # 9 procedural 3D hairstyles & live hair sway
│   │   ├── handPropsRig.ts          # Bone-locked 3D handheld props (level teacup, mouth-aimed chopsticks, etc.)
│   │   ├── lifePropsRig.ts          # 3D dining, hobby, school, SFW bath, travel dioramas & 6 AI chair styles
│   │   ├── accessoryRig.ts          # Procedural 3D head/neck/chest accessories
│   │   ├── poseController.ts        # Seated, standing, sleeping poses & anatomical finger grips
│   │   ├── roamController.ts        # Autonomous Desktop & Stage Roam waypoint controller
│   │   ├── emoteController.ts       # Convention-free procedural emotes & .vrma player
│   │   └── clothingModder.ts        # VRM mesh detection, recoloring, textures & modesty shorts
│   └── storage/                     # IndexedDB model/texture vault & studio persistence
├── package.json
└── vite.config.ts
```

---

## 📦 Build & Release

| Command | Description |
| :--- | :--- |
| `npm run typecheck` | Type-checks all TypeScript files with zero errors. |
| `npm run build:web` | Compiles the production React/Three.js bundle to `dist/`. |
| `npm run build:dir` | Builds an unpacked Windows desktop build in `release/win-unpacked/`. |
| `npm run build` | Builds full Windows NSIS installer & portable `.exe` in `release/`. |

---

## 🔧 Troubleshooting

* **LM Studio Connection Error:** Ensure LM Studio's **Local Server** is running on `127.0.0.1:1234` with **CORS** enabled and at least one chat model (`gemma-4-e4b-it` or `qwen2.5-7b-instruct-1m`) loaded.
* **VOICEVOX Audio Error:** Verify VOICEVOX is running on `http://127.0.0.1:50021`.
* **IPv6 / Localhost Resolution:** The studio explicitly prefers IPv4 `127.0.0.1` to prevent Windows IPv6 connection drops.

---

## 📄 License
Private & Proprietary — Zeta 3D Idol Studio.
