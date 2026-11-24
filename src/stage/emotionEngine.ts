import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { InteractionZone, MicroTellKind, MoodType } from '../types/studio';

export interface ActiveMicroTellState {
  kind: MicroTellKind;
  progress: number; // 0..1
}

export interface HumanSensationContext {
  sleepiness: number; // 0..100
  comfort: number; // 0..100
  isSleeping: boolean;
  isUserTyping: boolean;
  empathySoftening: boolean;
  activeTell: ActiveMicroTellState | null;
}

export interface EmotionBodyLanguage {
  headYawBias: number;
  headPitchBias: number;
  headRollBias: number;
  shoulderFidget: number;
  shoulderDroop: number;
  spineLeanX: number;
  coldRubArms: number;
  hipWeightShift: number;
  breathingRate: number;
  armsCrossTension: number;
  blinkIntervalMin: number;
  blinkIntervalMax: number;
  yawnOhWeight: number;
}

/**
 * Multi-Layer Human Emotion, Micro-Tell & VRM Blendshape Controller.
 * Smoothly interpolates facial expressions, circadian sleepiness, active listening posture,
 * genuine empathy softening, and organic physical tells (sigh, yawn, startled, eat/sip, shiver).
 */
export class VrmEmotionEngine {
  private weights: Record<string, number> = {
    happy: 0,
    angry: 0,
    sad: 0,
    relaxed: 0,
    surprised: 0,
    blush: 0,
    blink: 0,
    blinkLeft: 0,
  };

  private blinkTimer = 3.0;
  private blinkProgress = 0;
  private isBlinking = false;

  public getBodyLanguage(
    mood: MoodType,
    intensity: number,
    elapsed: number,
    human?: HumanSensationContext
  ): EmotionBodyLanguage {
    const k = THREE.MathUtils.clamp(intensity, 0.15, 1.0);
    const sleepiness = human?.sleepiness ?? 0;
    const comfort = human?.comfort ?? 80;
    const isSleeping = Boolean(human?.isSleeping);
    const isUserTyping = Boolean(human?.isUserTyping);
    const empathySoftening = Boolean(human?.empathySoftening);
    const tell = human?.activeTell ?? null;

    // 1. Peaceful Sleep / Dozing Mode
    if (isSleeping) {
      return {
        headYawBias: Math.sin(elapsed * 0.35) * 0.04,
        headPitchBias: 0.16 + Math.sin(elapsed * 0.8) * 0.025,
        headRollBias: 0.09 + Math.sin(elapsed * 0.45) * 0.04,
        shoulderFidget: 0,
        shoulderDroop: 0.14,
        spineLeanX: 0.03 + Math.sin(elapsed * 0.9) * 0.02,
        coldRubArms: 0,
        hipWeightShift: Math.sin(elapsed * 0.45) * 0.015,
        breathingRate: 0.92,
        armsCrossTension: 0,
        blinkIntervalMin: 5,
        blinkIntervalMax: 6,
        yawnOhWeight: 0,
      };
    }

    let base: EmotionBodyLanguage;
    switch (mood) {
      case 'Flustered':
        base = {
          headYawBias: -0.2 * k,
          headPitchBias: 0.04 * k,
          headRollBias: -0.05 * k,
          shoulderFidget: Math.sin(elapsed * 6.5) * 0.045 * k,
          shoulderDroop: 0,
          spineLeanX: 0,
          coldRubArms: 0,
          hipWeightShift: Math.sin(elapsed * 2.2) * 0.025 * k,
          breathingRate: 2.5,
          armsCrossTension: 0.15 * k,
          blinkIntervalMin: 1.5,
          blinkIntervalMax: 2.5,
          yawnOhWeight: 0,
        };
        break;
      case 'Shy':
        base = {
          headYawBias: -0.18 * k,
          headPitchBias: 0.1 * k,
          headRollBias: 0.06 * k,
          shoulderFidget: Math.sin(elapsed * 5.2) * 0.035 * k,
          shoulderDroop: 0.02,
          spineLeanX: 0.01,
          coldRubArms: 0,
          hipWeightShift: Math.sin(elapsed * 1.8) * 0.03 * k,
          breathingRate: 2.1,
          armsCrossTension: 0.18 * k,
          blinkIntervalMin: 1.8,
          blinkIntervalMax: 2.8,
          yawnOhWeight: 0,
        };
        break;
      case 'Annoyed':
      case 'Pouty':
        base = {
          headYawBias: -0.19 * k,
          headPitchBias: -0.03 * k,
          headRollBias: -0.04 * k,
          shoulderFidget: 0,
          shoulderDroop: 0,
          spineLeanX: -0.01,
          coldRubArms: 0,
          hipWeightShift: Math.sin(elapsed * 2.1) * 0.055 * k,
          breathingRate: 2.1,
          armsCrossTension: mood === 'Pouty' ? 0.52 * k : 0.42 * k,
          blinkIntervalMin: 2.6,
          blinkIntervalMax: 4.0,
          yawnOhWeight: 0,
        };
        break;
      case 'Amused':
      case 'Warm':
        base = {
          headYawBias: 0,
          headPitchBias: -0.02 * k,
          headRollBias: 0.08 * k,
          shoulderFidget: 0,
          shoulderDroop: 0,
          spineLeanX: 0.02,
          coldRubArms: 0,
          hipWeightShift: Math.sin(elapsed * 1.1) * 0.02 * k,
          breathingRate: 1.6,
          armsCrossTension: 0,
          blinkIntervalMin: 3.0,
          blinkIntervalMax: 4.8,
          yawnOhWeight: 0,
        };
        break;
      case 'Proud':
        base = {
          headYawBias: 0.06 * k,
          headPitchBias: -0.07 * k,
          headRollBias: 0.04 * k,
          shoulderFidget: 0,
          shoulderDroop: 0,
          spineLeanX: -0.02,
          coldRubArms: 0,
          hipWeightShift: 0.04 * k,
          breathingRate: 1.75,
          armsCrossTension: 0.25 * k,
          blinkIntervalMin: 3.0,
          blinkIntervalMax: 4.6,
          yawnOhWeight: 0,
        };
        break;
      case 'Deadpan':
      default:
        base = {
          headYawBias: 0,
          headPitchBias: 0.02 * k,
          headRollBias: 0,
          shoulderFidget: 0,
          shoulderDroop: 0,
          spineLeanX: 0,
          coldRubArms: 0,
          hipWeightShift: 0,
          breathingRate: 1.35,
          armsCrossTension: 0,
          blinkIntervalMin: 3.6,
          blinkIntervalMax: 5.4,
          yawnOhWeight: 0,
        };
        break;
    }

    // 2. High Sleepiness / Fatigue physical droop & slower blinking
    if (sleepiness > 55) {
      const sFactor = THREE.MathUtils.clamp((sleepiness - 55) / 45, 0, 1);
      base.shoulderDroop += 0.1 * sFactor;
      base.headPitchBias += 0.08 * sFactor;
      base.breathingRate = THREE.MathUtils.lerp(base.breathingRate, 1.05, sFactor);
      base.blinkIntervalMin += 1.4 * sFactor;
      base.blinkIntervalMax += 1.8 * sFactor;
    }

    // 3. Chilly Stage / Low Comfort subtle arm-rubbing
    if (comfort < 38) {
      const chillFactor = THREE.MathUtils.clamp((38 - comfort) / 30, 0, 1);
      base.coldRubArms = Math.max(base.coldRubArms, 0.55 * chillFactor);
      base.shoulderFidget += Math.sin(elapsed * 11) * 0.014 * chillFactor;
    }

    // 4. Genuine Empathy & Concern softening (drops defensive shield, leans subtly forward)
    if (empathySoftening) {
      base.headYawBias *= 0.25;
      base.headRollBias = 0.07;
      base.spineLeanX += 0.048;
      base.armsCrossTension = 0;
      base.breathingRate = Math.min(base.breathingRate, 1.4);
    }

    // 5. Active Listening Posture while the user is typing in chat
    if (isUserTyping) {
      base.headYawBias = THREE.MathUtils.lerp(base.headYawBias, 0.02, 0.7);
      base.headRollBias = 0.095;
      base.headPitchBias = -0.015;
      base.spineLeanX += 0.04;
      base.armsCrossTension *= 0.4;
      base.breathingRate = Math.min(base.breathingRate, 1.45);
    }

    // 6. Organic Micro-Tells (Sigh, Yawn, Startled, Eat/Sip, Cold Shiver, Cozy Warm)
    if (tell && tell.kind !== 'none') {
      const p = THREE.MathUtils.clamp(tell.progress, 0, 1);
      const bell = Math.sin(p * Math.PI);

      if (tell.kind === 'sigh') {
        // Gentle chest rise on inhale (first 35%), then soft exhale drop
        base.spineLeanX += p < 0.35 ? -0.06 * (p / 0.35) : 0.05 * ((p - 0.35) / 0.65) * (1 - p);
        base.shoulderDroop += 0.08 * bell;
      } else if (tell.kind === 'yawn') {
        base.spineLeanX -= 0.055 * bell;
        base.headPitchBias -= 0.07 * bell;
        base.shoulderDroop += 0.06 * bell;
        // Smooth natural yawn curve (`oh`) returning cleanly to 0.0 afterward
        base.yawnOhWeight = Math.max(0, Math.sin(p * Math.PI) * 0.54);
      } else if (tell.kind === 'startled') {
        const flinch = Math.sin(Math.min(1, p * 3.2) * Math.PI);
        base.headYawBias -= 0.16 * bell;
        base.spineLeanX -= 0.05 * flinch;
        base.shoulderFidget += Math.sin(p * 26) * 0.04 * (1 - p);
      } else if (tell.kind === 'eat_sip') {
        // Happy sipping / eating gentle head-nod rhythm
        const nod = Math.sin(p * Math.PI * 3) * 0.085 * bell;
        base.headPitchBias += nod + 0.04 * bell;
        base.headRollBias += Math.sin(p * Math.PI * 2) * 0.05;
        base.spineLeanX += 0.03 * bell;
        base.armsCrossTension = 0;
      } else if (tell.kind === 'cold_shiver') {
        base.coldRubArms = Math.max(base.coldRubArms, 0.85 * bell);
        base.shoulderFidget += Math.sin(p * 34) * 0.022 * bell;
      } else if (tell.kind === 'cozy_warm') {
        base.shoulderDroop += 0.07 * bell;
        base.headRollBias += 0.09 * bell;
        base.spineLeanX += 0.03 * bell;
        base.armsCrossTension = 0;
      }
    }

    return base;
  }

  public updateExpressions(params: {
    vrm: VRM;
    dt: number;
    mood: MoodType;
    intensity: number;
    activeReactionZone: InteractionZone | null;
    isEmoteControllingFace: boolean;
    isMusicPlaying: boolean;
    isSpeaking: boolean;
    human?: HumanSensationContext;
  }): void {
    const {
      vrm,
      dt,
      mood,
      intensity,
      activeReactionZone,
      isEmoteControllingFace,
      isMusicPlaying,
      isSpeaking,
      human,
    } = params;

    const expr = vrm.expressionManager;
    if (!expr || isEmoteControllingFace) return;

    const k = THREE.MathUtils.clamp(intensity, 0.15, 1.0);
    const bodyLang = this.getBodyLanguage(mood, k, 0, human);
    const isSleeping = Boolean(human?.isSleeping);
    const sleepiness = human?.sleepiness ?? 0;
    const empathySoftening = Boolean(human?.empathySoftening);
    const tell = human?.activeTell ?? null;

    const targets: Record<string, number> = {
      happy: 0,
      angry: 0,
      sad: 0,
      relaxed: 0,
      surprised: 0,
      blush: 0,
      blink: 0,
      blinkLeft: 0,
    };

    if (isSleeping) {
      targets.relaxed = 0.34;
      targets.blink = 0.96;
      targets.blush = 0.15;
    } else if (activeReactionZone === 'headpat') {
      targets.happy = 0.55;
      targets.relaxed = 0.48;
      targets.blush = 0.75;
      targets.blink = 0.92;
    } else if (activeReactionZone === 'poke') {
      targets.surprised = 0.55;
      targets.angry = 0.45;
      targets.blush = 0.85;
    } else if (activeReactionZone === 'hair_tug') {
      targets.surprised = 0.45;
      targets.angry = 0.4;
      targets.blush = 0.6;
    } else if (activeReactionZone === 'outfit_tap') {
      targets.angry = 0.55;
      targets.surprised = 0.25;
      targets.blush = 0.7;
    } else {
      if (empathySoftening) {
        // Sincere human empathy: soften brow gently, warm closed-lip expression
        targets.sad = 0.18;
        targets.relaxed = 0.32;
        targets.blush = 0.16;
      } else {
        switch (mood) {
          case 'Flustered':
            targets.surprised = (isSpeaking ? 0.28 : 0.06) * k;
            targets.angry = (isSpeaking ? 0.22 : 0.05) * k;
            targets.blush = 0.9 * k;
            break;
          case 'Shy':
            targets.sad = 0.18 * k;
            targets.relaxed = 0.22 * k;
            targets.blush = 0.82 * k;
            break;
          case 'Annoyed':
            targets.angry = (isSpeaking ? 0.48 : 0.14) * k;
            targets.sad = 0.12 * k;
            targets.blush = 0.3 * k;
            break;
          case 'Pouty':
            targets.angry = (isSpeaking ? 0.42 : 0.12) * k;
            targets.sad = 0.24 * k;
            targets.blush = 0.45 * k;
            break;
          case 'Amused':
            targets.happy = (isSpeaking ? 0.35 : 0.06) * k;
            targets.relaxed = 0.35 * k;
            break;
          case 'Warm':
            targets.happy = (isSpeaking ? 0.35 : 0.08) * k;
            targets.relaxed = 0.42 * k;
            targets.blush = 0.25 * k;
            break;
          case 'Proud':
            targets.happy = (isSpeaking ? 0.32 : 0.06) * k;
            targets.relaxed = 0.28 * k;
            break;
          case 'Deadpan':
          default:
            targets.relaxed = 0.12 * k;
            break;
        }
      }

      if (isMusicPlaying) {
        targets.happy = Math.max(targets.happy, 0.32);
      }

      // Micro-tell facial overlays
      if (tell && tell.kind !== 'none') {
        const bell = Math.sin(THREE.MathUtils.clamp(tell.progress, 0, 1) * Math.PI);
        if (tell.kind === 'sigh' || tell.kind === 'cozy_warm' || tell.kind === 'eat_sip') {
          targets.relaxed = Math.max(targets.relaxed, 0.45 * bell);
          if (tell.kind === 'cozy_warm') targets.blush = Math.max(targets.blush, 0.5 * bell);
        } else if (tell.kind === 'yawn') {
          targets.blink = Math.max(targets.blink, 0.9 * bell);
          targets.relaxed = Math.max(targets.relaxed, 0.28 * bell);
        } else if (tell.kind === 'startled') {
          targets.blush = Math.max(targets.blush, 0.72 * bell);
          // Rapid double-blink tell
          const dbl =
            (tell.progress > 0.08 && tell.progress < 0.22) ||
            (tell.progress > 0.3 && tell.progress < 0.44);
          if (dbl) targets.blink = 0.95;
        }
      }

      // Heavy eyelids when sleepiness is high
      if (sleepiness > 72 && targets.blink < 0.3) {
        targets.blink = Math.max(targets.blink, ((sleepiness - 72) / 28) * 0.28);
      }

      // Dynamic blinking cadence modulated by mood & sleepiness
      if (targets.blink < 0.85) {
        if (!this.isBlinking) {
          this.blinkTimer -= dt;
          if (this.blinkTimer <= 0) {
            this.isBlinking = true;
            this.blinkProgress = 0;
          }
        } else {
          const blinkSpeed = sleepiness > 65 ? 6.5 : 10.0;
          this.blinkProgress += dt * blinkSpeed;
          const bVal =
            this.blinkProgress < 1
              ? this.blinkProgress
              : Math.max(0, 2 - this.blinkProgress);
          targets.blink = Math.max(targets.blink, bVal);
          if (this.blinkProgress >= 2) {
            this.isBlinking = false;
            this.blinkTimer =
              bodyLang.blinkIntervalMin +
              Math.random() * (bodyLang.blinkIntervalMax - bodyLang.blinkIntervalMin);
          }
        }
      }
    }

    // Prevent jaw-opening emotion presets from cracking her mouth open at rest
    if (!isSpeaking) {
      targets.surprised = Math.min(targets.surprised, 0.25);
      targets.happy = Math.min(targets.happy, 0.35);
      targets.angry = Math.min(targets.angry, 0.2);
    }

    const alpha = Math.min(1, dt * 6.0);
    const blinkAlpha = Math.min(1, dt * 22.0);

    for (const key of Object.keys(this.weights)) {
      const rate = key === 'blink' ? blinkAlpha : alpha;
      this.weights[key] = THREE.MathUtils.lerp(this.weights[key], targets[key] ?? 0, rate);
    }

    const setSafe = (names: string[], val: number) => {
      for (const n of names) {
        try {
          expr.setValue(n, val);
        } catch {
          // ignore absent custom morph
        }
      }
    };

    setSafe(['happy', 'joy'], this.weights.happy);
    setSafe(['angry'], this.weights.angry);
    setSafe(['sad', 'sorrow'], this.weights.sad);
    setSafe(['relaxed'], this.weights.relaxed);
    setSafe(['surprised'], this.weights.surprised);
    setSafe(['blush', 'Blush', 'cheek', 'Cheek', 'shy'], this.weights.blush);
    setSafe(['blink'], this.weights.blink);
    setSafe(['blinkLeft'], this.weights.blinkLeft);
  }
}
