# Zeta 3D Idol Studio - Development Rules & Guidelines

## 1. Mandatory Desktop Release Updates
- **Always Update Desktop Build**: On every code change, feature implementation, UI tweak, or bug fix, ALWAYS compile and update the Windows Electron desktop build by running `npm run build:dir`. Ensure the packaged application in `release/win-unpacked/Zeta 3D Idol Studio.exe` is kept 100% in sync with the codebase. Do not wait for the user to ask "update desktop".

## 2. Avatar Proportions & 3D Wardrobe Fitting
- **Keep All VRM Body and Head Proportions Unlocked**: Never clamp body, chest, hip, or head scaling to a fixed 1.0. Proportions remain fully customizable and dynamically scaled.
- **Nearest-Surface Skin Weight Transfer**: Procedural garments must bind directly to the VRM's skeleton using barycentric skin weight transfer and outward normal clearance.
- **Watertight Culled-Skin Safety**: Never leave hollow cavities or transparent gaps on models with culled skin polygons. Always bridge missing torso, arm, or pelvic polygons with watertight MToon skin underlays.
- **Mutually Exclusive Wardrobe Layering**: On multi-material merged meshes (`Body_00_SKIN`, `Tops_01_CLOTH`, `Bottoms_01_CLOTH`), hide conflicting native clothing slots (`mat.visible = false`, `opacity = 0`, `colorWrite = false`) when procedural garments or shower care are active so native clothes never clip through or peek out.

## 3. Local AI & Autonomous Systems
- **LM Studio Local AI**: Pure LM Studio integration for local LLM inference (do not use Ollama).
- **AI-Only Autonomous Behaviors**: Physical stretching and life routines are triggered by the idol's autonomous AI brain (no manual user stretch buttons).
- **Offline / Cloud Toggle**: Respect `enableGeminiCloud`. When disabled, block all Google Cloud API calls and fall back cleanly to local LM Studio without error alerts.
