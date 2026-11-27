import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { CustomStageEnvironment, MusicSyncFrame, StageEnvironmentId } from '../types/studio';
import { getEnvironmentFromVault } from '../storage/modelVault';

export interface BedMetrics {
  mattressTopY: number;
  bedCenterX: number;
  bedCenterZ: number;
  bedWidth: number;
  bedLength: number;
  bedMinX: number;
  bedMaxX: number;
  bedMinZ: number;
  bedMaxZ: number;
  pillowCenter: THREE.Vector3;
}

export interface StageEnvironmentMeta {
  id: StageEnvironmentId;
  name: string;
  shortName: string;
  emoji: string;
  description: string;
  bgGradient: string;
  fogColor: string;
  fogDensity: number;
  ambientColor: string;
  ambientIntensity: number;
  keyColor: string;
  keyIntensity: number;
  rimColor: string;
  rimIntensity: number;
  fillColor: string;
  fillIntensity: number;
  ringColor: string;
  particleColor: string;
  particleMode: 'embers' | 'dust' | 'neon' | 'rain';
}

export const STAGE_ENVIRONMENTS: Record<StageEnvironmentId, StageEnvironmentMeta> = {
  gothic_cathedral: {
    id: 'gothic_cathedral',
    name: 'Midnight Gothic Cathedral',
    shortName: 'Gothic Cathedral',
    emoji: '🏰',
    description: 'Crimson/indigo stained-glass rim light, moonbeams & floating crimson embers',
    bgGradient:
      'radial-gradient(ellipse at 50% 20%, rgba(190, 18, 60, 0.28), rgba(30, 27, 75, 0.52) 45%, rgba(7, 6, 14, 0.99) 82%)',
    fogColor: '#0c0612',
    fogDensity: 0.08,
    ambientColor: '#e9d5ff',
    ambientIntensity: 0.78,
    keyColor: '#ffe4e6',
    keyIntensity: 1.18,
    rimColor: '#f43f5e',
    rimIntensity: 1.35,
    fillColor: '#6366f1',
    fillIntensity: 0.72,
    ringColor: '#f43f5e',
    particleColor: '#fb7185',
    particleMode: 'embers',
  },
  sunlit_boutique: {
    id: 'sunlit_boutique',
    name: 'Sunlit Minimalist Boutique',
    shortName: 'Sunlit Boutique',
    emoji: '☀️',
    description: 'Warm afternoon window light & soft golden dust motes',
    bgGradient:
      'radial-gradient(ellipse at 65% 18%, rgba(251, 191, 36, 0.24), rgba(67, 48, 74, 0.42) 46%, rgba(14, 12, 20, 0.97) 84%)',
    fogColor: '#16131c',
    fogDensity: 0.055,
    ambientColor: '#fffbeb',
    ambientIntensity: 0.98,
    keyColor: '#fff3d6',
    keyIntensity: 1.32,
    rimColor: '#fbbf24',
    rimIntensity: 0.85,
    fillColor: '#fde68a',
    fillIntensity: 0.55,
    ringColor: '#f59e0b',
    particleColor: '#fde68a',
    particleMode: 'dust',
  },
  cyberpunk_stage: {
    id: 'cyberpunk_stage',
    name: 'Cyberpunk Idol Concert Stage',
    shortName: 'Cyberpunk Stage',
    emoji: '⚡',
    description: 'Neon cyan/magenta spotlights, glowing floor grid & beat-reactive pulse',
    bgGradient:
      'radial-gradient(ellipse at 50% 24%, rgba(6, 182, 212, 0.25), rgba(192, 38, 211, 0.24) 48%, rgba(6, 7, 16, 0.99) 82%)',
    fogColor: '#060712',
    fogDensity: 0.075,
    ambientColor: '#e0f2fe',
    ambientIntensity: 0.82,
    keyColor: '#f0fdfa',
    keyIntensity: 1.15,
    rimColor: '#e879f9',
    rimIntensity: 1.35,
    fillColor: '#22d3ee',
    fillIntensity: 0.95,
    ringColor: '#22d3ee',
    particleColor: '#38bdf8',
    particleMode: 'neon',
  },
  lofi_rainy_room: {
    id: 'lofi_rainy_room',
    name: 'Cozy Lo-Fi Rainy Room',
    shortName: 'Lo-Fi Rainy',
    emoji: '🌧️',
    description: 'Soft warm desk lamp glow & gentle rain streaks outside window',
    bgGradient:
      'radial-gradient(ellipse at 25% 28%, rgba(245, 158, 11, 0.2), rgba(30, 58, 138, 0.36) 52%, rgba(8, 10, 18, 0.98) 86%)',
    fogColor: '#0a0d17',
    fogDensity: 0.08,
    ambientColor: '#dbeafe',
    ambientIntensity: 0.8,
    keyColor: '#fed7aa',
    keyIntensity: 1.18,
    rimColor: '#60a5fa',
    rimIntensity: 1.0,
    fillColor: '#f59e0b',
    fillIntensity: 0.62,
    ringColor: '#60a5fa',
    particleColor: '#93c5fd',
    particleMode: 'rain',
  },
  midnight_rooftop: {
    id: 'midnight_rooftop',
    name: 'Midnight Rooftop Under Stars',
    shortName: 'Midnight Rooftop',
    emoji: '🌃',
    description: 'Starry night breeze, glowing city horizon & silver-indigo moonlight',
    bgGradient:
      'radial-gradient(ellipse at 50% 14%, rgba(56, 189, 248, 0.2), rgba(30, 27, 75, 0.56) 48%, rgba(4, 6, 14, 0.99) 85%)',
    fogColor: '#050814',
    fogDensity: 0.07,
    ambientColor: '#e0e7ff',
    ambientIntensity: 0.82,
    keyColor: '#e0f2fe',
    keyIntensity: 1.2,
    rimColor: '#818cf8',
    rimIntensity: 1.25,
    fillColor: '#38bdf8',
    fillIntensity: 0.65,
    ringColor: '#818cf8',
    particleColor: '#e0f2fe',
    particleMode: 'dust',
  },
};

export class StageEnvironmentController {
  private scene: THREE.Scene;
  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private spotLeft: THREE.SpotLight;
  private spotRight: THREE.SpotLight;
  private stageRing: THREE.Mesh;
  private seatPropGroup: THREE.Group;
  private seatAccentRingMat: THREE.MeshBasicMaterial;
  private seatVisible = true;
  private bedPropGroup: THREE.Group;
  private bedAccentStripMat: THREE.MeshBasicMaterial;
  private nightLampLight: THREE.PointLight;
  private bedVisible = false;
  private mattressMesh: THREE.Mesh | null = null;
  private hugPillowMesh: THREE.Mesh | null = null;
  private hugPillowAccentMat: THREE.MeshBasicMaterial;
  private hugPillowVisible = false;
  private propsGroup: THREE.Group;
  private customRoomGroup: THREE.Group;
  private particles: THREE.Points;
  private particleGeo: THREE.BufferGeometry;
  private particleMat: THREE.PointsMaterial;
  private particleSpeeds: Float32Array;
  private rainLines: THREE.LineSegments;
  private rainPositions: Float32Array;
  private currentPreset: StageEnvironmentId = 'sunlit_boutique';
  private activeCustomTexture: THREE.Texture | null = null;
  private loadedCustomVaultId: string | null = null;
  private isOverlayTransparent = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.ambientLight = new THREE.AmbientLight('#ffffff', 0.92);
    this.keyLight = new THREE.DirectionalLight('#fff8f0', 1.25);
    this.keyLight.position.set(1.6, 2.8, 2.4);

    this.rimLight = new THREE.DirectionalLight('#a78bfa', 0.95);
    this.rimLight.position.set(-1.6, 2.2, -2.0);

    this.fillLight = new THREE.DirectionalLight('#bae6fd', 0.55);
    this.fillLight.position.set(-2.0, 1.5, 1.5);

    // Beat-reactive concert spotlights
    this.spotLeft = new THREE.SpotLight('#22d3ee', 0, 10, Math.PI / 5, 0.55);
    this.spotLeft.position.set(-2.2, 3.2, 1.6);
    this.spotRight = new THREE.SpotLight('#f43f5e', 0, 10, Math.PI / 5, 0.55);
    this.spotRight.position.set(2.2, 3.2, 1.6);

    scene.add(
      this.ambientLight,
      this.keyLight,
      this.rimLight,
      this.fillLight,
      this.spotLeft,
      this.spotRight
    );

    // Stage Halo Ring
    this.stageRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 0.96, 80),
      new THREE.MeshBasicMaterial({
        color: '#8b5cf6',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      })
    );
    this.stageRing.name = 'stage_ring';
    this.stageRing.rotation.x = -Math.PI / 2;
    this.stageRing.position.y = 0.003;
    scene.add(this.stageRing);

    // Minimalist Dark-Glass Studio Stool (y = 0 .. 0.45) + Soft Contact Shadow Catcher
    this.seatPropGroup = new THREE.Group();
    this.seatPropGroup.name = 'studio_seat_prop';
    this.seatPropGroup.position.set(0, 0, -0.055);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
      grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.56, 48),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.002, 0.05);

    const basePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.27, 0.024, 40),
      new THREE.MeshStandardMaterial({
        color: '#11111d',
        roughness: 0.28,
        metalness: 0.78,
      })
    );
    basePlate.position.y = 0.012;

    const pedestalStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.042, 0.365, 24),
      new THREE.MeshStandardMaterial({
        color: '#1c1c2e',
        roughness: 0.22,
        metalness: 0.85,
      })
    );
    pedestalStem.position.y = 0.205;

    const darkGlassDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.255, 0.23, 0.032, 44),
      new THREE.MeshStandardMaterial({
        color: '#0e0e1a',
        roughness: 0.14,
        metalness: 0.6,
        transparent: true,
        opacity: 0.88,
      })
    );
    darkGlassDeck.position.y = 0.398;

    const seatCushion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.235, 0.245, 0.036, 44),
      new THREE.MeshStandardMaterial({
        color: '#1a1829',
        roughness: 0.72,
        metalness: 0.12,
      })
    );
    // Top surface lands cleanly at y = 0.432 + 0.018 = 0.450
    seatCushion.position.y = 0.432;

    this.seatAccentRingMat = new THREE.MeshBasicMaterial({
      color: '#8b5cf6',
      transparent: true,
      opacity: 0.72,
    });
    const seatRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.248, 0.005, 12, 48),
      this.seatAccentRingMat
    );
    seatRim.rotation.x = Math.PI / 2;
    seatRim.position.y = 0.414;

    this.seatPropGroup.add(
      contactShadow,
      basePlate,
      pedestalStem,
      darkGlassDeck,
      seatCushion,
      seatRim
    );
    scene.add(this.seatPropGroup);

    // ==========================================
    // Cozy Cyber-Idol Sleeping Bed Prop (y = 0 .. 0.95m, z = -1.15m .. +0.95m)
    // ==========================================
    this.bedPropGroup = new THREE.Group();
    this.bedPropGroup.name = 'studio_bed_prop';
    this.bedPropGroup.position.set(0, 0, -0.05);
    this.bedPropGroup.visible = false;

    // 1. Soft Bed Ground Contact Shadow
    const bedShadowCanvas = document.createElement('canvas');
    bedShadowCanvas.width = 256;
    bedShadowCanvas.height = 256;
    const bCtx = bedShadowCanvas.getContext('2d');
    if (bCtx) {
      const grad = bCtx.createRadialGradient(128, 128, 30, 128, 128, 120);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
      grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.32)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      bCtx.fillStyle = grad;
      bCtx.fillRect(0, 0, 256, 256);
    }
    const bedShadowTex = new THREE.CanvasTexture(bedShadowCanvas);
    const bedContactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 2.6),
      new THREE.MeshBasicMaterial({
        map: bedShadowTex,
        transparent: true,
        depthWrite: false,
      })
    );
    bedContactShadow.rotation.x = -Math.PI / 2;
    bedContactShadow.position.set(0, 0.002, -0.05);
    this.bedPropGroup.add(bedContactShadow);

    // 2. Bed Platform Base (Modern Cyber-Studio Wood/Metal Deck)
    const bedFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.22, 0.16, 2.22),
      new THREE.MeshStandardMaterial({
        color: '#12111e',
        roughness: 0.32,
        metalness: 0.65,
      })
    );
    bedFrame.position.set(0, 0.14, -0.05);

    // 4 Corner Legs
    const legGeo = new THREE.CylinderGeometry(0.038, 0.042, 0.08, 16);
    const legMat = new THREE.MeshStandardMaterial({
      color: '#1e1c30',
      roughness: 0.2,
      metalness: 0.85,
    });
    const legOffsets: [number, number][] = [
      [-0.56, -1.06],
      [0.56, -1.06],
      [-0.56, 0.96],
      [0.56, 0.96],
    ];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.04, lz);
      this.bedPropGroup.add(leg);
    }

    // 3. Ambient LED Glow Strip along bed base perimeter
    this.bedAccentStripMat = new THREE.MeshBasicMaterial({
      color: '#8b5cf6',
      transparent: true,
      opacity: 0.85,
    });
    const bedGlowStrip = new THREE.Mesh(
      new THREE.BoxGeometry(1.24, 0.015, 2.24),
      this.bedAccentStripMat
    );
    bedGlowStrip.position.set(0, 0.065, -0.05);

    // 4. Padded Idol Headboard at Z = -1.14
    const headboardBack = new THREE.Mesh(
      new THREE.BoxGeometry(1.30, 0.74, 0.08),
      new THREE.MeshStandardMaterial({
        color: '#161426',
        roughness: 0.4,
        metalness: 0.5,
      })
    );
    headboardBack.position.set(0, 0.52, -1.14);

    // 3 Padded Cushion Tufts on Headboard
    const tuftMat = new THREE.MeshStandardMaterial({
      color: '#282442',
      roughness: 0.8,
      metalness: 0.15,
    });
    for (let i = -1; i <= 1; i++) {
      const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.64, 0.04), tuftMat);
      tuft.position.set(i * 0.40, 0.52, -1.08);
      this.bedPropGroup.add(tuft);
    }

    // 5. Plush Mattress (y = 0.22 .. 0.40)
    const mattress = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 0.18, 2.08),
      new THREE.MeshStandardMaterial({
        color: '#f8fafc',
        roughness: 0.88,
        metalness: 0.08,
      })
    );
    mattress.position.set(0, 0.31, -0.05);
    this.mattressMesh = mattress;

    // Mattress edge piping / border trim
    const mattressTrim = new THREE.Mesh(
      new THREE.BoxGeometry(1.155, 0.02, 2.095),
      new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        roughness: 0.6,
        metalness: 0.2,
      })
    );
    mattressTrim.position.set(0, 0.395, -0.05);

    // 6. Fluffy Pillows
    // Main Sleeping Pillow (where avatar's head rests)
    const mainPillow = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.10, 0.38),
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: 0.92,
        metalness: 0.05,
      })
    );
    mainPillow.rotation.x = 0.14; // slight tilt
    mainPillow.position.set(0, 0.435, -0.74);

    // Cute Accent Cushion / Star Pillow beside it
    const accentCushion = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.08, 0.32),
      new THREE.MeshStandardMaterial({
        color: '#c4b5fd',
        roughness: 0.82,
        metalness: 0.12,
      })
    );
    accentCushion.rotation.y = 0.45;
    accentCushion.rotation.x = 0.12;
    accentCushion.position.set(-0.35, 0.435, -0.72);

    // 6b. Soft Hug Pillow / Dakimakura Body Pillow Prop (for 'hugging_pillow' & cozy 'curled' sleep)
    // Capsule: radius 0.095m, cylinder length 0.52m (total length 0.71m)
    const hugPillowGeo = new THREE.CapsuleGeometry(0.095, 0.52, 16, 24);
    const hugPillowMat = new THREE.MeshStandardMaterial({
      color: '#fdf2f8', // soft pastel sakura/blush velvet
      roughness: 0.88,
      metalness: 0.04,
    });
    this.hugPillowAccentMat = new THREE.MeshBasicMaterial({
      color: '#ec4899',
      transparent: true,
      opacity: 0.85,
    });
    this.hugPillowMesh = new THREE.Mesh(hugPillowGeo, hugPillowMat);
    this.hugPillowMesh.name = 'bed_hug_pillow';
    this.hugPillowMesh.castShadow = true;
    this.hugPillowMesh.receiveShadow = true;
    // Align horizontally along the bed Z-axis
    this.hugPillowMesh.rotation.x = Math.PI / 2;
    // Position on top of mattress: y = mattressTopY + 0.11 = 0.40 + 0.11 = 0.51
    this.hugPillowMesh.position.set(0.18, 0.51, -0.10);
    this.hugPillowMesh.visible = false;

    // Cute pastel decorative seam rings on both ends
    const seamGeo = new THREE.TorusGeometry(0.096, 0.007, 12, 28);
    const seamTop = new THREE.Mesh(seamGeo, this.hugPillowAccentMat);
    seamTop.rotation.x = Math.PI / 2;
    seamTop.position.set(0, 0.20, 0);
    this.hugPillowMesh.add(seamTop);

    const seamBottom = new THREE.Mesh(seamGeo, this.hugPillowAccentMat);
    seamBottom.rotation.x = Math.PI / 2;
    seamBottom.position.set(0, -0.20, 0);
    this.hugPillowMesh.add(seamBottom);

    this.bedPropGroup.add(this.hugPillowMesh);

    // 7. Soft Plush Duvet / Blanket (comfortably covering lower body from waist Z = -0.14 to Z = +0.98)
    const duvet = new THREE.Mesh(
      new THREE.BoxGeometry(1.20, 0.14, 1.18),
      new THREE.MeshStandardMaterial({
        color: '#818cf8',
        roughness: 0.82,
        metalness: 0.12,
      })
    );
    duvet.position.set(0, 0.485, 0.44);

    // Turned-Over Duvet Cuff / Soft Lining at waist
    const duvetCuff = new THREE.Mesh(
      new THREE.BoxGeometry(1.20, 0.11, 0.22),
      new THREE.MeshStandardMaterial({
        color: '#ede9fe',
        roughness: 0.85,
        metalness: 0.1,
      })
    );
    duvetCuff.position.set(0, 0.495, -0.14);

    // Duvet Side Drapes (flowing softly down sides of mattress)
    const drapeLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.26, 1.18),
      new THREE.MeshStandardMaterial({
        color: '#6366f1',
        roughness: 0.8,
        metalness: 0.15,
      })
    );
    drapeLeft.position.set(-0.60, 0.36, 0.44);

    const drapeRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.26, 1.18),
      new THREE.MeshStandardMaterial({
        color: '#6366f1',
        roughness: 0.8,
        metalness: 0.15,
      })
    );
    drapeRight.position.set(0.60, 0.36, 0.44);

    // 8. Petite Nightstand + Warm Glowing Lamp on left side
    const nightstand = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.32, 0.42),
      new THREE.MeshStandardMaterial({
        color: '#181628',
        roughness: 0.3,
        metalness: 0.6,
      })
    );
    nightstand.position.set(-0.84, 0.16, -0.84);

    const lampStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.02, 0.14, 16),
      new THREE.MeshStandardMaterial({
        color: '#e2e8f0',
        metalness: 0.9,
        roughness: 0.15,
      })
    );
    lampStem.position.set(-0.84, 0.38, -0.84);

    const lampShade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.09, 0.10, 24),
      new THREE.MeshStandardMaterial({
        color: '#fef08a',
        roughness: 0.4,
        emissive: '#fef08a',
        emissiveIntensity: 0.6,
      })
    );
    lampShade.position.set(-0.84, 0.48, -0.84);

    this.nightLampLight = new THREE.PointLight('#fef08a', 0.85, 3.2, 1.8);
    this.nightLampLight.position.set(-0.84, 0.52, -0.84);

    // 9. Cute Mini Mascot Plushie resting near bed foot
    const plushieBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 20, 20),
      new THREE.MeshStandardMaterial({
        color: '#f472b6',
        roughness: 0.9,
      })
    );
    plushieBody.position.set(0.42, 0.49, -0.28);
    const plushieHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 20, 20),
      new THREE.MeshStandardMaterial({
        color: '#f472b6',
        roughness: 0.9,
      })
    );
    plushieHead.position.set(0.42, 0.58, -0.32);
    const earLeft = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.9 })
    );
    earLeft.rotation.z = 0.25;
    earLeft.position.set(0.39, 0.64, -0.32);
    const earRight = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.9 })
    );
    earRight.rotation.z = -0.25;
    earRight.position.set(0.45, 0.64, -0.32);

    this.bedPropGroup.add(
      bedFrame,
      bedGlowStrip,
      headboardBack,
      mattress,
      mattressTrim,
      mainPillow,
      accentCushion,
      duvet,
      duvetCuff,
      drapeLeft,
      drapeRight,
      nightstand,
      lampStem,
      lampShade,
      this.nightLampLight,
      plushieBody,
      plushieHead,
      earLeft,
      earRight
    );

    scene.add(this.bedPropGroup);

    this.propsGroup = new THREE.Group();
    this.propsGroup.name = 'stage_env_props';
    scene.add(this.propsGroup);

    this.customRoomGroup = new THREE.Group();
    this.customRoomGroup.name = 'stage_custom_room';
    scene.add(this.customRoomGroup);

    // Floating Particles (Embers / Golden Dust / Neon Sparks)
    const count = 150;
    const positions = new Float32Array(count * 3);
    this.particleSpeeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 4.8;
      positions[i * 3 + 1] = Math.random() * 2.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4.2;
      this.particleSpeeds[i] = 0.04 + Math.random() * 0.1;
    }
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleMat = new THREE.PointsMaterial({
      color: '#fde68a',
      size: 0.02,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.particles = new THREE.Points(this.particleGeo, this.particleMat);
    scene.add(this.particles);

    // Gentle Rain Streaks for Lo-Fi Rainy Room
    const rainCount = 90;
    this.rainPositions = new Float32Array(rainCount * 6);
    for (let i = 0; i < rainCount; i++) {
      const x = (Math.random() - 0.5) * 5.2;
      const y = Math.random() * 3.4;
      const z = -1.2 - Math.random() * 2.6;
      this.rainPositions[i * 6] = x;
      this.rainPositions[i * 6 + 1] = y;
      this.rainPositions[i * 6 + 2] = z;
      this.rainPositions[i * 6 + 3] = x - 0.05;
      this.rainPositions[i * 6 + 4] = y - 0.24;
      this.rainPositions[i * 6 + 5] = z;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainLines = new THREE.LineSegments(
      rainGeo,
      new THREE.LineBasicMaterial({
        color: '#93c5fd',
        transparent: true,
        opacity: 0.35,
      })
    );
    this.rainLines.visible = false;
    scene.add(this.rainLines);
  }

  public setSeatVisible(visible: boolean): void {
    this.seatVisible = visible;
    this.seatPropGroup.visible = this.seatVisible && !this.bedVisible && !this.isOverlayTransparent;
  }

  public setBedVisible(visible: boolean): void {
    this.bedVisible = visible;
    this.bedPropGroup.visible = this.bedVisible;
    if (this.hugPillowMesh) {
      this.hugPillowMesh.visible = this.bedVisible && this.hugPillowVisible;
    }
    // Automatically hide stool when bed is visible so they never collide
    if (this.bedVisible) {
      this.seatPropGroup.visible = false;
    } else {
      this.seatPropGroup.visible = this.seatVisible && !this.isOverlayTransparent;
    }
  }

  public setHugPillowVisible(visible: boolean, side: 'right' | 'left' = 'right'): void {
    this.hugPillowVisible = visible;
    if (this.hugPillowMesh) {
      this.hugPillowMesh.visible = visible && this.bedVisible;
      this.hugPillowMesh.position.x = side === 'left' ? -0.18 : 0.18;
    }
  }

  public getBedMetrics(): BedMetrics {
    if (this.mattressMesh) {
      this.mattressMesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.mattressMesh);
      const center = new THREE.Vector3();
      box.getCenter(center);
      return {
        mattressTopY: box.max.y,
        bedCenterX: center.x,
        bedCenterZ: center.z,
        bedWidth: box.max.x - box.min.x,
        bedLength: box.max.z - box.min.z,
        bedMinX: box.min.x,
        bedMaxX: box.max.x,
        bedMinZ: box.min.z,
        bedMaxZ: box.max.z,
        pillowCenter: new THREE.Vector3(0, 0.485, -0.79),
      };
    }
    return {
      mattressTopY: 0.40,
      bedCenterX: 0.0,
      bedCenterZ: -0.10,
      bedWidth: 1.14,
      bedLength: 2.08,
      bedMinX: -0.57,
      bedMaxX: 0.57,
      bedMinZ: -1.14,
      bedMaxZ: 0.94,
      pillowCenter: new THREE.Vector3(0, 0.485, -0.79),
    };
  }

  public setOverlayTransparent(transparent: boolean): void {
    this.isOverlayTransparent = transparent;
    this.stageRing.visible = !transparent;
    this.seatPropGroup.visible = this.seatVisible && !this.bedVisible && !transparent;
    this.bedPropGroup.visible = this.bedVisible;
    if (this.hugPillowMesh) {
      this.hugPillowMesh.visible = this.bedVisible && this.hugPillowVisible;
    }
    this.propsGroup.visible = !transparent;
    this.customRoomGroup.visible = !transparent;
    this.particles.visible =
      !transparent && STAGE_ENVIRONMENTS[this.currentPreset].particleMode !== 'rain';
    this.rainLines.visible =
      !transparent && STAGE_ENVIRONMENTS[this.currentPreset].particleMode === 'rain';
    if (transparent) {
      this.scene.fog = null;
      this.scene.background = null;
    } else {
      const meta = STAGE_ENVIRONMENTS[this.currentPreset];
      this.scene.fog = new THREE.FogExp2(meta.fogColor, meta.fogDensity);
      if (this.activeCustomTexture) {
        this.scene.background = this.activeCustomTexture;
      }
    }
  }

  public applyPreset(presetId: StageEnvironmentId): void {
    this.currentPreset = presetId;
    const meta = STAGE_ENVIRONMENTS[presetId];

    this.scene.fog = this.isOverlayTransparent
      ? null
      : new THREE.FogExp2(meta.fogColor, meta.fogDensity);
    this.ambientLight.color.set(meta.ambientColor);
    this.ambientLight.intensity = meta.ambientIntensity;
    this.keyLight.color.set(meta.keyColor);
    this.keyLight.intensity = meta.keyIntensity;
    this.rimLight.color.set(meta.rimColor);
    this.rimLight.intensity = meta.rimIntensity;
    this.fillLight.color.set(meta.fillColor);
    this.fillLight.intensity = meta.fillIntensity;

    (this.stageRing.material as THREE.MeshBasicMaterial).color.set(meta.ringColor);
    this.seatAccentRingMat.color.set(meta.ringColor);
    this.bedAccentStripMat.color.set(meta.ringColor);
    if (this.hugPillowAccentMat) {
      this.hugPillowAccentMat.color.set(meta.ringColor);
    }
    this.particleMat.color.set(meta.particleColor);
    this.particleMat.size = meta.particleMode === 'embers' ? 0.024 : 0.018;
    this.rainLines.visible = !this.isOverlayTransparent && meta.particleMode === 'rain';
    this.particles.visible = !this.isOverlayTransparent && meta.particleMode !== 'rain';

    // Rebuild lightweight architectural accent props
    while (this.propsGroup.children.length > 0) {
      this.propsGroup.remove(this.propsGroup.children[0]);
    }

    if (presetId === 'cyberpunk_stage') {
      const grid = new THREE.GridHelper(10, 26, '#22d3ee', '#701a75');
      grid.position.y = 0.001;
      const gridMat = grid.material as THREE.Material;
      gridMat.transparent = true;
      gridMat.opacity = 0.35;
      this.propsGroup.add(grid);

      const neonRingOuter = new THREE.Mesh(
        new THREE.RingGeometry(1.42, 1.45, 72),
        new THREE.MeshBasicMaterial({
          color: '#e879f9',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.45,
        })
      );
      neonRingOuter.rotation.x = -Math.PI / 2;
      neonRingOuter.position.y = 0.002;
      this.propsGroup.add(neonRingOuter);
    } else if (presetId === 'gothic_cathedral') {
      // Stained-glass crimson/indigo moonbeam backdrop ring
      const moonHalo = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.15, 64),
        new THREE.MeshBasicMaterial({
          color: '#9f1239',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.22,
        })
      );
      moonHalo.position.set(0, 1.55, -2.4);
      this.propsGroup.add(moonHalo);

      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 3.6),
        new THREE.MeshBasicMaterial({
          color: '#818cf8',
          transparent: true,
          opacity: 0.06,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      beam.position.set(0.55, 1.6, -1.8);
      beam.rotation.z = -0.22;
      this.propsGroup.add(beam);
    } else if (presetId === 'sunlit_boutique') {
      const sunBeam = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 3.6),
        new THREE.MeshBasicMaterial({
          color: '#fde68a',
          transparent: true,
          opacity: 0.075,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      sunBeam.position.set(0.85, 1.65, -1.6);
      sunBeam.rotation.z = -0.34;
      this.propsGroup.add(sunBeam);
    } else if (presetId === 'lofi_rainy_room') {
      const windowFrame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.6, 1.8)),
        new THREE.LineBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.25 })
      );
      windowFrame.position.set(0, 1.45, -2.1);
      this.propsGroup.add(windowFrame);
    }
  }

  public async applyCustomEnvironment(
    customEnv: CustomStageEnvironment | null | undefined
  ): Promise<void> {
    if (!customEnv) {
      this.clearCustomEnvironment();
      return;
    }
    if (this.loadedCustomVaultId === customEnv.vaultId) return;

    this.clearCustomEnvironment();
    const record = await getEnvironmentFromVault(customEnv.vaultId);
    if (!record) return;

    this.loadedCustomVaultId = customEnv.vaultId;
    const blob = new Blob([record.buffer], { type: record.mimeType || undefined });
    const url = URL.createObjectURL(blob);

    try {
      if (record.kind === 'image') {
        const tex = await new THREE.TextureLoader().loadAsync(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        this.activeCustomTexture = tex;
        this.scene.background = tex;
      } else if (record.kind === 'hdr') {
        const tex = await new RGBELoader().loadAsync(url);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        this.activeCustomTexture = tex;
        this.scene.background = tex;
        this.scene.environment = tex;
      } else if (record.kind === 'glb') {
        const gltf = await new GLTFLoader().loadAsync(url);
        const room = gltf.scene;
        const box = new THREE.Box3().setFromObject(room);
        const center = new THREE.Vector3();
        box.getCenter(center);
        room.position.x -= center.x;
        room.position.z -= center.z;
        room.position.y -= box.min.y;
        this.customRoomGroup.add(room);
      }
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  public clearCustomEnvironment(): void {
    this.loadedCustomVaultId = null;
    if (this.activeCustomTexture) {
      this.activeCustomTexture.dispose();
      this.activeCustomTexture = null;
    }
    this.scene.background = null;
    this.scene.environment = null;
    while (this.customRoomGroup.children.length > 0) {
      this.customRoomGroup.remove(this.customRoomGroup.children[0]);
    }
  }

  public update(dt: number, elapsed: number, music: MusicSyncFrame): void {
    const meta = STAGE_ENVIRONMENTS[this.currentPreset];

    // 1. Animate environment particles or rain streaks
    if (meta.particleMode === 'rain') {
      const posAttr = this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute;
      const rainCount = this.rainPositions.length / 6;
      for (let i = 0; i < rainCount; i++) {
        let yTop = posAttr.getY(i * 2) - dt * 3.4;
        let xTop = posAttr.getX(i * 2) - dt * 0.45;
        if (yTop < 0) {
          yTop = 3.2 + Math.random() * 0.5;
          xTop = (Math.random() - 0.5) * 5.2;
        }
        posAttr.setXYZ(i * 2, xTop, yTop, posAttr.getZ(i * 2));
        posAttr.setXYZ(i * 2 + 1, xTop - 0.05, yTop - 0.24, posAttr.getZ(i * 2 + 1));
      }
      posAttr.needsUpdate = true;
    } else {
      const posAttr = this.particleGeo.getAttribute('position') as THREE.BufferAttribute;
      const speedMult = music.isPlaying ? 1 + music.bass * 2.4 : 1;
      for (let i = 0; i < this.particleSpeeds.length; i++) {
        let y = posAttr.getY(i) + this.particleSpeeds[i] * dt * speedMult;
        if (y > 2.85) y = 0.04;
        posAttr.setY(i, y);
        posAttr.setX(i, posAttr.getX(i) + Math.sin(elapsed * 0.65 + i) * 0.0005);
      }
      posAttr.needsUpdate = true;
    }

    // 2. Beat-reactive spotlights & stage halo ring during Idol Karaoke Music Sync
    if (music.isPlaying) {
      const pulse = 1 + music.bass * 0.24 + music.beatPulse * 0.12;
      this.stageRing.scale.set(pulse, pulse, 1);
      (this.stageRing.material as THREE.MeshBasicMaterial).opacity = Math.min(
        1,
        0.55 + music.bass * 0.45
      );
      this.rimLight.intensity = meta.rimIntensity + music.bass * 1.4;
      this.spotLeft.intensity = 1.6 + music.bass * 4.5;
      this.spotRight.intensity = 1.6 + music.treble * 4.5;
      this.spotLeft.position.x = -2.2 + Math.sin(elapsed * 2.2) * 0.6;
      this.spotRight.position.x = 2.2 - Math.sin(elapsed * 2.2) * 0.6;
    } else {
      this.stageRing.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 8));
      (this.stageRing.material as THREE.MeshBasicMaterial).opacity = 0.65;
      this.rimLight.intensity = THREE.MathUtils.lerp(
        this.rimLight.intensity,
        meta.rimIntensity,
        Math.min(1, dt * 6)
      );
      this.spotLeft.intensity = THREE.MathUtils.lerp(this.spotLeft.intensity, 0, Math.min(1, dt * 6));
      this.spotRight.intensity = THREE.MathUtils.lerp(this.spotRight.intensity, 0, Math.min(1, dt * 6));
    }

    // 3. Gentle ambient pulse on bedroom night light
    if (this.bedVisible && this.nightLampLight) {
      this.nightLampLight.intensity = 0.82 + Math.sin(elapsed * 1.6) * 0.08;
    }
  }
}
