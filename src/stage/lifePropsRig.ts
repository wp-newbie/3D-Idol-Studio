import * as THREE from 'three';
import type {
  ActiveAiChair,
  ActiveDestinationScene,
  ActiveDiningScene,
  ActiveHobbyScene,
  ActiveLifeScene,
  AiChairStyleId,
  DestinationKindId,
  FoodVisualId,
  HobbyKindId,
} from '../types/studio';
import { getDiningAnimationFrame } from './naturalArmPose';

export const AI_CHAIR_STYLE_META: Record<
  AiChairStyleId,
  { label: string; emoji: string; frameHex: string; cushionHex: string; accentHex: string }
> = {
  wooden_dining: {
    label: 'Warm Oak Dining Chair',
    emoji: '🪑',
    frameHex: '#8b5e3c',
    cushionHex: '#fdf2f8',
    accentHex: '#f59e0b',
  },
  gaming_chair: {
    label: 'RGB Pro Gaming Chair',
    emoji: '🎮',
    frameHex: '#181825',
    cushionHex: '#1e1b2e',
    accentHex: '#e879f9',
  },
  velvet_armchair: {
    label: 'Plush Velvet Lounge Chair',
    emoji: '🛋️',
    frameHex: '#d4af37',
    cushionHex: '#7e22ce',
    accentHex: '#f472b6',
  },
  cafe_bistro: {
    label: 'Parisian Cafe Bistro Chair',
    emoji: '☕',
    frameHex: '#27272a',
    cushionHex: '#fef3c7',
    accentHex: '#d97706',
  },
  school_chair: {
    label: 'Academy Student Chair',
    emoji: '🏫',
    frameHex: '#64748b',
    cushionHex: '#c89d6c',
    accentHex: '#2563eb',
  },
  princess_throne: {
    label: 'Idol Royal Accent Chair',
    emoji: '👑',
    frameHex: '#eab308',
    cushionHex: '#9f1239',
    accentHex: '#fb7185',
  },
};

export const FOOD_VISUAL_META: Record<
  FoodVisualId,
  { label: string; emoji: string; defaultDrink: string }
> = {
  ramen: { label: 'Steaming Ramen', emoji: '🍜', defaultDrink: 'Iced Oolong Tea' },
  cake: { label: 'Strawberry Shortcake', emoji: '🍰', defaultDrink: 'Earl Grey Tea' },
  sushi: { label: 'Chef Sushi Platter', emoji: '🍣', defaultDrink: 'Hot Green Tea' },
  pancakes: { label: 'Fluffy Souffle Pancakes', emoji: '🥞', defaultDrink: 'Caramel Latte' },
  curry: { label: 'Savory Japanese Curry', emoji: '🍛', defaultDrink: 'Sparkling Water' },
  bento: { label: 'Artisan Bento Box', emoji: '🍱', defaultDrink: 'Barley Tea' },
  pasta: { label: 'Creamy Tomato Pasta', emoji: '🍝', defaultDrink: 'Berry Soda' },
  tea_sweets: { label: 'Matcha & Wagashi Set', emoji: '🍡', defaultDrink: 'Ceremonial Matcha' },
  ice_cream: { label: 'Berry Parfait Sundae', emoji: '🍨', defaultDrink: 'Vanilla Milk Tea' },
  burger: { label: 'Cafe Gourmet Burger', emoji: '🍔', defaultDrink: 'Lemon Cola' },
};

export const HOBBY_KIND_META: Record<
  HobbyKindId,
  { label: string; emoji: string; posture: 'seated' | 'standing'; summary: string }
> = {
  painting: {
    label: 'Canvas Painting',
    emoji: '🎨',
    posture: 'standing',
    summary: 'Wooden easel, live painted canvas, palette & brushes',
  },
  music_keyboard: {
    label: 'Playing Synth Keyboard',
    emoji: '🎹',
    posture: 'seated',
    summary: 'Digital synthesizer on X-stand with sheet music & floating notes',
  },
  reading: {
    label: 'Reading Manga & Tea',
    emoji: '📚',
    posture: 'seated',
    summary: 'Cozy reading desk, warm brass lamp, open manga & book stack',
  },
  gaming: {
    label: 'Cozy PC Gaming',
    emoji: '🎮',
    posture: 'seated',
    summary: 'Curved monitor desk, RGB keyboard, gaming PC & controller',
  },
  baking: {
    label: 'Home Baking & Kitchen',
    emoji: '🧁',
    posture: 'standing',
    summary: 'Kitchen island with mixing bowl, rolling pin & fresh pastry tray',
  },
  photography: {
    label: 'Camera & Photo Board',
    emoji: '📸',
    posture: 'standing',
    summary: 'Tripod camera, studio ring glow & polaroid memory wall',
  },
  yoga: {
    label: 'Relaxing Yoga Mat',
    emoji: '🧘',
    posture: 'standing',
    summary: 'Pastel yoga mat, scented candle & hydration bottle',
  },
  journaling: {
    label: 'Scrapbook Journaling',
    emoji: '📓',
    posture: 'seated',
    summary: 'Aesthetic desk with open scrapbook, pastel pens & desk lamp',
  },
  studying: {
    label: 'Pen & Paper Studying',
    emoji: '📝',
    posture: 'seated',
    summary: 'School desk & chair, open lined notebook, moving pen, textbooks & pencil case',
  },
  showering: {
    label: 'Censored Warm Shower',
    emoji: '🚿',
    posture: 'standing',
    summary: 'Frosted-glass SFW censor screen, rainfall water, fluffy steam, shampoo, soap & bubbles',
  },
  towel_dry: {
    label: 'Bath Towel & Hair Dry',
    emoji: '🧖‍♀️',
    posture: 'standing',
    summary: 'Fluffy folded towels on rack, steamy mirror vanity, hairdryer & cozy refresh',
  },
  brushing_teeth: {
    label: 'Brushing Teeth at Sink',
    emoji: '🪥',
    posture: 'standing',
    summary: 'Bathroom vanity sink, mirror, toothpaste, rinse cup & animated toothbrush',
  },
};

export const DESTINATION_KIND_META: Record<
  Exclude<DestinationKindId, 'none'>,
  {
    label: string;
    emoji: string;
    skyTopHex: string;
    skyBottomHex: string;
    groundHex: string;
    accentHex: string;
    summary: string;
  }
> = {
  home_kitchen: {
    label: 'Home Kitchen & Dining',
    emoji: '🍳',
    skyTopHex: '#2b2436',
    skyBottomHex: '#5b4338',
    groundHex: '#7a583b',
    accentHex: '#f59e0b',
    summary: 'Warm wood apartment kitchen counter, kettle, stove & cozy dining corner',
  },
  shopping_mall: {
    label: 'Shopping Mall Boutique',
    emoji: '🛍️',
    skyTopHex: '#1f2544',
    skyBottomHex: '#4a3560',
    groundHex: '#e2e8f0',
    accentHex: '#f472b6',
    summary: 'Bright glass atrium mall, fashion racks, glowing boutique sign & shopping bags',
  },
  tropical_beach: {
    label: 'Tropical Beach Vacation',
    emoji: '🏖️',
    skyTopHex: '#0284c7',
    skyBottomHex: '#fde68a',
    groundHex: '#f6d59a',
    accentHex: '#22d3ee',
    summary: 'Golden sand, animated turquoise ocean waves, swaying palm trees & beach umbrella',
  },
  vacation_cafe: {
    label: 'Paris / Shibuya Terrace Cafe',
    emoji: '☕',
    skyTopHex: '#312e81',
    skyBottomHex: '#fb923c',
    groundHex: '#4b5563',
    accentHex: '#fbbf24',
    summary: 'Sunset cobblestone patio, striped cafe awning & glowing warm string lights',
  },
  mountain_onsen: {
    label: 'Mountain Hot Spring Onsen',
    emoji: '♨️',
    skyTopHex: '#0f172a',
    skyBottomHex: '#3730a3',
    groundHex: '#6b4f3a',
    accentHex: '#38bdf8',
    summary: 'Cedar deck, steaming mineral hot-spring pool, river stones & bamboo lanterns',
  },
  amusement_park: {
    label: 'Twilight Amusement Park',
    emoji: '🎢',
    skyTopHex: '#1e1b4b',
    skyBottomHex: '#9d174d',
    groundHex: '#312e81',
    accentHex: '#f43f5e',
    summary: 'Rotating glowing Ferris wheel, festival bunting & carnival lights',
  },
  highschool_classroom: {
    label: 'High School Classroom',
    emoji: '🏫',
    skyTopHex: '#38bdf8',
    skyBottomHex: '#fef3c7',
    groundHex: '#b08968',
    accentHex: '#2563eb',
    summary: 'Sunlit anime classroom with chalkboard, chalk notes, windows & student desks',
  },
  college_campus: {
    label: 'College Lecture & Library',
    emoji: '🎓',
    skyTopHex: '#1e3a5f',
    skyBottomHex: '#e2e8f0',
    groundHex: '#7c5c43',
    accentHex: '#0284c7',
    summary: 'University lecture library with tall bookshelves, warm campus windows & study hall',
  },
  bathroom_spa: {
    label: 'Cozy Anime Bathroom & Spa',
    emoji: '🛁',
    skyTopHex: '#cffafe',
    skyBottomHex: '#f8fafc',
    groundHex: '#cbd5e1',
    accentHex: '#38bdf8',
    summary: 'Bright tiled bathroom with frosted shower glass, towel rack, shampoo/soap & mirror vanity',
  },
};

function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) std.map.dispose();
        m.dispose();
      }
    }
  });
}

function makeCanvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildDiningChair(): THREE.Group {
  const chair = new THREE.Group();
  chair.name = 'life_dining_chair';
  // Aligned precisely with PoseController seated hips height (seat top y = 0.45, z = -0.055)
  chair.position.set(0, 0, -0.055);

  const woodMat = new THREE.MeshStandardMaterial({
    color: '#8b5e3c',
    roughness: 0.52,
    metalness: 0.08,
  });
  const cushionMat = new THREE.MeshStandardMaterial({
    color: '#fdf2f8',
    roughness: 0.82,
    metalness: 0.02,
  });

  // Seat base + plush cushion (top at y = 0.45)
  const seatFrame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.036, 0.44), woodMat);
  seatFrame.position.set(0, 0.415, 0);
  chair.add(seatFrame);

  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.032, 0.4), cushionMat);
  cushion.position.set(0, 0.436, 0.01);
  chair.add(cushion);

  // 4 tapered wooden legs
  const legGeo = new THREE.CylinderGeometry(0.018, 0.013, 0.415, 10);
  for (const lx of [-0.19, 0.19]) {
    for (const lz of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, 0.207, lz);
      chair.add(leg);
    }
  }

  // Backrest posts & curved horizontal slats behind character (-Z)
  for (const bx of [-0.19, 0.19]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.52, 10), woodMat);
    post.position.set(bx, 0.68, -0.20);
    post.rotation.x = -0.06;
    chair.add(post);
  }
  for (const by of [0.62, 0.76, 0.89]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.055, 0.022), woodMat);
    slat.position.set(0, by, -0.215);
    chair.add(slat);
  }

  return chair;
}

/**
 * Builds a custom AI-designed 3D Chair calibrated precisely to PoseController seated height
 * (seatTopY = 0.45, z = -0.055) with 6 rich styles!
 */
export function buildAiGeneratedChair(cfg: ActiveAiChair): THREE.Group {
  const chair = new THREE.Group();
  chair.name = `life_ai_chair_${cfg.chairStyle}`;
  chair.position.set(0, 0, -0.055);

  const frameMat = new THREE.MeshStandardMaterial({
    color: cfg.frameHex || '#8b5e3c',
    roughness: cfg.chairStyle === 'velvet_armchair' || cfg.chairStyle === 'princess_throne' ? 0.25 : 0.48,
    metalness: cfg.chairStyle === 'velvet_armchair' || cfg.chairStyle === 'princess_throne' ? 0.78 : 0.2,
  });
  const cushionMat = new THREE.MeshStandardMaterial({
    color: cfg.cushionHex || '#fdf2f8',
    roughness: 0.82,
    metalness: 0.04,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: cfg.accentHex || '#f472b6',
    emissive: cfg.chairStyle === 'gaming_chair' ? cfg.accentHex || '#e879f9' : '#000000',
    emissiveIntensity: cfg.chairStyle === 'gaming_chair' ? 0.9 : 0,
    roughness: 0.35,
  });

  if (cfg.chairStyle === 'gaming_chair') {
    // 5-star caster wheelbase + gas lift cylinder
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.34, 12), frameMat);
    stem.position.y = 0.22;
    chair.add(stem);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.025, 0.28), frameMat);
      spoke.position.set(Math.sin(a) * 0.14, 0.055, Math.cos(a) * 0.14);
      spoke.rotation.y = a;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.022, 10), frameMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(Math.sin(a) * 0.26, 0.024, Math.cos(a) * 0.26);
      chair.add(spoke, wheel);
    }
    // Contoured seat cushion + side bolsters (top y = 0.45)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.065, 0.46), cushionMat);
    seat.position.set(0, 0.418, 0.01);
    chair.add(seat);
    for (const sx of [-0.24, 0.24]) {
      const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.44), accentMat);
      bolster.position.set(sx, 0.44, 0.01);
      const armPost = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.22, 0.035), frameMat);
      armPost.position.set(sx * 1.12, 0.51, -0.02);
      const armPad = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.026, 0.26), frameMat);
      armPad.position.set(sx * 1.12, 0.625, 0.02);
      chair.add(bolster, armPost, armPad);
    }
    // High racing backrest + glowing RGB accent rails + headrest pillow
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.72, 0.07), cushionMat);
    back.position.set(0, 0.80, -0.22);
    back.rotation.x = -0.08;
    const headPillow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.06), accentMat);
    headPillow.position.set(0, 1.04, -0.18);
    const lumbar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.055), accentMat);
    lumbar.position.set(0, 0.55, -0.17);
    chair.add(back, headPillow, lumbar);
    return chair;
  }

  if (cfg.chairStyle === 'velvet_armchair') {
    // Chic curved plush velvet lounge armchair with gold legs!
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.085, 24), cushionMat);
    seat.position.set(0, 0.408, 0.01);
    chair.add(seat);
    const backShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.28, 0.48, 24, 1, false, Math.PI * 0.55, Math.PI * 0.9),
      cushionMat
    );
    backShell.position.set(0, 0.66, -0.02);
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.275, 0.012, 8, 28),
      frameMat
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.set(0, 0.365, 0.01);
    chair.add(backShell, trim);
    for (const [lx, lz] of [
      [-0.18, -0.16],
      [0.18, -0.16],
      [-0.18, 0.18],
      [0.18, 0.18],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.01, 0.38, 10), frameMat);
      leg.position.set(lx, 0.19, lz);
      chair.add(leg);
    }
    return chair;
  }

  if (cfg.chairStyle === 'princess_throne') {
    // Ornate tall velvet & gold Idol Throne Chair!
    const seatFrame = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.05, 0.46), frameMat);
    seatFrame.position.set(0, 0.40, 0);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.048, 0.42), cushionMat);
    cushion.position.set(0, 0.432, 0.01);
    chair.add(seatFrame, cushion);
    for (const lx of [-0.21, 0.21]) {
      for (const lz of [-0.19, 0.19]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.40, 12), frameMat);
        leg.position.set(lx, 0.20, lz);
        chair.add(leg);
      }
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.86, 12), frameMat);
      post.position.set(lx, 0.83, -0.21);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), accentMat);
      finial.position.set(lx, 1.28, -0.21);
      chair.add(post, finial);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.055), cushionMat);
    back.position.set(0, 0.82, -0.215);
    const crownCrest = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.14, 5), frameMat);
    crownCrest.position.set(0, 1.24, -0.215);
    chair.add(back, crownCrest);
    return chair;
  }

  if (cfg.chairStyle === 'cafe_bistro') {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.036, 24), cushionMat);
    seat.position.set(0, 0.432, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.012, 8, 24), frameMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.425, 0);
    chair.add(seat, rim);
    for (const [lx, lz] of [
      [-0.16, -0.15],
      [0.16, -0.15],
      [-0.16, 0.15],
      [0.16, 0.15],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.01, 0.42, 10), frameMat);
      leg.position.set(lx, 0.21, lz);
      chair.add(leg);
    }
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.20, 0.015, 10, 24, Math.PI),
      frameMat
    );
    hoop.position.set(0, 0.72, -0.21);
    const innerHoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.01, 8, 20, Math.PI),
      accentMat
    );
    innerHoop.position.set(0, 0.68, -0.21);
    for (const bx of [-0.19, 0.19]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.30, 8), frameMat);
      post.position.set(bx, 0.58, -0.21);
      chair.add(post);
    }
    chair.add(hoop, innerHoop);
    return chair;
  }

  // wooden_dining or school_chair
  const seatFrame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.034, 0.44), frameMat);
  seatFrame.position.set(0, 0.415, 0);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.032, 0.40), cushionMat);
  cushion.position.set(0, 0.436, 0.01);
  chair.add(seatFrame, cushion);
  for (const lx of [-0.19, 0.19]) {
    for (const lz of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.013, 0.415, 10), frameMat);
      leg.position.set(lx, 0.207, lz);
      chair.add(leg);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.50, 10), frameMat);
    post.position.set(lx, 0.67, -0.20);
    post.rotation.x = -0.05;
    chair.add(post);
  }
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.22, 0.024), cushionMat);
  backPanel.position.set(0, 0.78, -0.215);
  chair.add(backPanel);
  return chair;
}

function buildFoodDish(foodVisual: FoodVisualId, accentHex: string): THREE.Group {
  const dish = new THREE.Group();
  const ceramicWhite = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.25 });
  const ceramicDark = new THREE.MeshStandardMaterial({ color: '#1e1b2e', roughness: 0.3 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.35 });

  if (foodVisual === 'ramen') {
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.068, 0.075, 24),
      ceramicDark
    );
    bowl.position.y = 0.038;
    dish.add(bowl);

    const broth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.01, 24),
      new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.18 })
    );
    broth.position.y = 0.064;
    dish.add(broth);

    const noodles = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.65 })
    );
    noodles.scale.set(1, 0.35, 1);
    noodles.position.y = 0.066;
    dish.add(noodles);

    // Narutomaki + egg + nori
    const naruto = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.008, 16),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.4 })
    );
    naruto.position.set(-0.04, 0.076, 0.02);
    dish.add(naruto);

    const egg = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 12, 10),
      new THREE.MeshStandardMaterial({ color: '#fef9c3', roughness: 0.3 })
    );
    egg.scale.set(1.1, 0.45, 0.85);
    egg.position.set(0.04, 0.074, 0.015);
    dish.add(egg);

    const yolk = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 10, 10),
      new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.25 })
    );
    yolk.scale.set(1, 0.5, 1);
    yolk.position.set(0.04, 0.08, 0.015);
    dish.add(yolk);

    const nori = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.055, 0.004),
      new THREE.MeshStandardMaterial({ color: '#14261c', roughness: 0.7 })
    );
    nori.position.set(0, 0.088, -0.068);
    nori.rotation.x = 0.28;
    dish.add(nori);
  } else if (foodVisual === 'cake') {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.012, 24), ceramicWhite);
    plate.position.y = 0.006;
    dish.add(plate);

    const spongeMat = new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.75 });
    const creamMat = new THREE.MeshStandardMaterial({ color: '#fffbfb', roughness: 0.55 });
    const berryMat = new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.28 });

    const cakeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.068, 3), spongeMat);
    cakeBase.position.set(0, 0.046, 0);
    dish.add(cakeBase);

    const frosting = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.016, 3), creamMat);
    frosting.position.set(0, 0.084, 0);
    dish.add(frosting);

    const strawberry = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.032, 12), berryMat);
    strawberry.position.set(0, 0.106, 0);
    dish.add(strawberry);
  } else if (foodVisual === 'sushi') {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.022, 0.13),
      new THREE.MeshStandardMaterial({ color: '#c49a6c', roughness: 0.55 })
    );
    board.position.y = 0.011;
    dish.add(board);

    const riceMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    const toppings = ['#fb7185', '#f97316', '#fde047', '#ef4444'];
    toppings.forEach((col, i) => {
      const x = -0.075 + i * 0.05;
      const rice = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.022, 0.052), riceMat);
      rice.position.set(x, 0.033, 0);
      dish.add(rice);
      const fish = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.011, 0.062),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.25 })
      );
      fish.position.set(x, 0.048, 0);
      dish.add(fish);
    });
  } else if (foodVisual === 'pancakes') {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.095, 0.012, 24), ceramicWhite);
    plate.position.y = 0.006;
    dish.add(plate);
    const cakeMat = new THREE.MeshStandardMaterial({ color: '#d99142', roughness: 0.62 });
    for (let i = 0; i < 3; i++) {
      const layer = new THREE.Mesh(new THREE.CylinderGeometry(0.075 - i * 0.004, 0.078 - i * 0.004, 0.022, 20), cakeMat);
      layer.position.y = 0.022 + i * 0.022;
      dish.add(layer);
    }
    const butter = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.012, 0.03),
      new THREE.MeshStandardMaterial({ color: '#fef08a', roughness: 0.25 })
    );
    butter.position.y = 0.084;
    dish.add(butter);
  } else if (foodVisual === 'ice_cream') {
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#e0f2fe',
      transparent: true,
      opacity: 0.55,
      roughness: 0.12,
    });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.032, 0.11, 18), glassMat);
    cup.position.y = 0.062;
    dish.add(cup);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.01, 16), glassMat);
    base.position.y = 0.005;
    dish.add(base);
    const scoop1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 16, 14),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.5 })
    );
    scoop1.position.set(0, 0.125, 0);
    dish.add(scoop1);
    const scoop2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 14, 12),
      new THREE.MeshStandardMaterial({ color: '#fef9c3', roughness: 0.45 })
    );
    scoop2.position.set(0.012, 0.158, 0);
    dish.add(scoop2);
    const cherry = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 10, 10),
      new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.2 })
    );
    cherry.position.set(0.012, 0.19, 0);
    dish.add(cherry);
  } else if (foodVisual === 'burger') {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.012, 24), ceramicWhite);
    plate.position.y = 0.006;
    dish.add(plate);
    const bunMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.65 });
    const botBun = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.056, 0.02, 18), bunMat);
    botBun.position.y = 0.022;
    const patty = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.018, 18),
      new THREE.MeshStandardMaterial({ color: '#5c2d16', roughness: 0.75 })
    );
    patty.position.y = 0.04;
    const lettuce = new THREE.Mesh(
      new THREE.CylinderGeometry(0.064, 0.062, 0.009, 18),
      new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.5 })
    );
    lettuce.position.y = 0.053;
    const topBun = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      bunMat
    );
    topBun.scale.set(1, 0.65, 1);
    topBun.position.y = 0.058;
    dish.add(botBun, patty, lettuce, topBun);
  } else if (foodVisual === 'bento') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.048, 0.15), ceramicDark);
    box.position.y = 0.024;
    dish.add(box);
    const rice = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.042, 0.128),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })
    );
    rice.position.set(-0.048, 0.032, 0);
    const umeboshi = new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 10, 10),
      new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.3 })
    );
    umeboshi.position.set(-0.048, 0.055, 0);
    const tamago = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.036, 0.055),
      new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 })
    );
    tamago.position.set(0.048, 0.032, -0.032);
    const salmon = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.034, 0.055),
      new THREE.MeshStandardMaterial({ color: '#fb923c', roughness: 0.4 })
    );
    salmon.position.set(0.048, 0.032, 0.032);
    dish.add(rice, umeboshi, tamago, salmon);
  } else {
    // Curry, Pasta, or Tea Sweets stylized plate
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.105, 0.015, 24), ceramicWhite);
    plate.position.y = 0.008;
    dish.add(plate);
    const mainColor =
      foodVisual === 'curry' ? '#92400e' : foodVisual === 'pasta' ? '#f59e0b' : '#bbf7d0';
    const sauceColor =
      foodVisual === 'curry' ? '#ffffff' : foodVisual === 'pasta' ? '#dc2626' : '#f472b6';
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.082, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: mainColor, roughness: 0.45 })
    );
    mound.scale.set(1.05, 0.55, 0.9);
    mound.position.set(-0.01, 0.016, 0);
    const garnish = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 14, 10),
      new THREE.MeshStandardMaterial({ color: sauceColor, roughness: 0.4 })
    );
    garnish.scale.set(1, 0.5, 1);
    garnish.position.set(0.035, 0.032, 0.01);
    const accentDot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), accentMat);
    accentDot.position.set(0.035, 0.056, 0.01);
    dish.add(mound, garnish, accentDot);
  }

  return dish;
}

function buildKitchenCounter(): THREE.Group {
  const counter = new THREE.Group();
  counter.name = 'life_kitchen_counter';
  counter.position.set(-1.32, 0, -0.78);
  counter.rotation.y = 0.48;

  const cabMat = new THREE.MeshStandardMaterial({ color: '#e7e5e4', roughness: 0.55 });
  const topMat = new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.42 });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.25, metalness: 0.78 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.35, metalness: 0.45 });

  // Lower cabinet + warm butcher-block counter (height 0.86m)
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.82, 0.56), cabMat);
  body.position.y = 0.41;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), topMat);
  top.position.y = 0.845;
  counter.add(body, top);

  // Stovetop burner + frying pan
  const stove = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.38), darkMat);
  stove.position.set(-0.3, 0.88, 0);
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.035, 18), darkMat);
  pan.position.set(-0.3, 0.908, 0);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.016, 0.024), darkMat);
  handle.position.set(-0.15, 0.918, 0.05);
  handle.rotation.y = -0.35;
  counter.add(stove, pan, handle);

  // Stainless electric kettle
  const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.17, 16), metalMat);
  kettle.position.set(0.15, 0.955, -0.08);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.018, 16), darkMat);
  lid.position.set(0.15, 1.045, -0.08);
  counter.add(kettle, lid);

  // Cute pastel toaster
  const toaster = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.13, 0.12),
    new THREE.MeshStandardMaterial({ color: '#fecdd3', roughness: 0.32, metalness: 0.25 })
  );
  toaster.position.set(0.38, 0.935, 0.06);
  counter.add(toaster);

  // Stacked ceramic plates + wooden cutting board
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.075, 0.012, 18),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 })
    );
    p.position.set(0.12, 0.876 + i * 0.014, 0.15);
    counter.add(p);
  }

  return counter;
}

function buildDiningDiorama(dining: ActiveDiningScene): {
  group: THREE.Group;
  steamNodes: THREE.Object3D[];
} {
  const root = new THREE.Group();
  root.name = 'life_dining_diorama';
  const steamNodes: THREE.Object3D[] = [];

  // 1. Real wooden dining chair right underneath seated avatar
  root.add(buildDiningChair());

  // 2. Full wooden dining table right in front of her (z = 0.56, tabletop y = 0.72)
  const table = new THREE.Group();
  table.position.set(0, 0, 0.56);
  const woodMat = new THREE.MeshStandardMaterial({ color: '#9a6b44', roughness: 0.48 });
  const runnerMat = new THREE.MeshStandardMaterial({
    color: dining.accentHex || '#f472b6',
    roughness: 0.75,
  });

  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.042, 0.64), woodMat);
  tableTop.position.y = 0.70;
  table.add(tableTop);

  const runner = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.006, 0.65), runnerMat);
  runner.position.y = 0.724;
  table.add(runner);

  const legGeo = new THREE.BoxGeometry(0.048, 0.68, 0.048);
  for (const lx of [-0.52, 0.52]) {
    for (const lz of [-0.26, 0.26]) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, 0.34, lz);
      table.add(leg);
    }
  }

  // Placemat right in front of her
  const matMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.004, 0.28),
    new THREE.MeshStandardMaterial({ color: '#fef9c3', roughness: 0.85 })
  );
  matMesh.position.set(0, 0.724, -0.14);
  table.add(matMesh);

  // Main generated 3D food dish
  const dish = buildFoodDish(dining.foodVisual, dining.accentHex);
  dish.position.set(0, 0.726, -0.14);
  table.add(dish);

  // Animated chopsticks / utensil pair resting neatly on right side of placemat
  const chopsticksGroup = new THREE.Group();
  chopsticksGroup.position.set(-0.14, 0.736, -0.17);
  const stickMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.45 });
  for (const dz of [-0.008, 0.008]) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0034, 0.2, 8), stickMat);
    stick.rotation.z = Math.PI / 2;
    stick.position.set(0, 0, dz);
    chopsticksGroup.add(stick);
  }
  const biteTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.55 })
  );
  biteTip.position.set(0.088, 0, 0);
  biteTip.visible = false;
  chopsticksGroup.add(biteTip);
  chopsticksGroup.userData.eatUtensil = {
    baseX: chopsticksGroup.position.x,
    baseY: chopsticksGroup.position.y,
    baseZ: chopsticksGroup.position.z,
    biteMesh: biteTip,
  };
  table.add(chopsticksGroup);
  steamNodes.push(chopsticksGroup);

  // Animated steaming teacup / drink mug (matches handheld teacup 1:1 with handle!)
  const mugGroup = new THREE.Group();
  mugGroup.position.set(0.22, 0.76, -0.16);
  const mugMat = new THREE.MeshStandardMaterial({ color: '#fdf2f8', roughness: 0.22 });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.031, 0.078, 18), mugMat);
  const teaLiquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.005, 18),
    new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.15 })
  );
  teaLiquid.position.y = 0.032;
  const mugHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.02, 0.0048, 8, 16),
    new THREE.MeshStandardMaterial({ color: dining.accentHex || '#f472b6', roughness: 0.28 })
  );
  mugHandle.position.set(0.036, 0, 0);
  mugGroup.add(mug, teaLiquid, mugHandle);
  mugGroup.userData.drinkMug = {
    baseX: mugGroup.position.x,
    baseY: mugGroup.position.y,
    baseZ: mugGroup.position.z,
  };
  table.add(mugGroup);
  steamNodes.push(mugGroup);

  // Ceramic teapot (body + lid knob + spout + handle) + spice shakers on table
  const potGroup = new THREE.Group();
  potGroup.position.set(-0.34, 0.775, 0.08);
  const potMat = new THREE.MeshStandardMaterial({ color: dining.accentHex || '#c084fc', roughness: 0.3 });
  const potBody = new THREE.Mesh(new THREE.SphereGeometry(0.064, 16, 14), potMat);
  potBody.scale.set(1, 0.82, 1);
  const potLid = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 10), potMat);
  potLid.position.set(0, 0.056, 0);
  const potSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.014, 0.065, 10), potMat);
  potSpout.rotation.z = -0.85;
  potSpout.position.set(0.064, 0.018, 0);
  const potHandle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 14), potMat);
  potHandle.position.set(-0.064, 0.006, 0);
  potGroup.add(potBody, potLid, potSpout, potHandle);
  table.add(potGroup);

  for (const [sx, col] of [
    [0.36, '#f8fafc'],
    [0.42, '#27272a'],
  ] as [number, string][]) {
    const shaker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.02, 0.062, 12),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 })
    );
    shaker.position.set(sx, 0.752, 0.09);
    table.add(shaker);
  }

  // Animated rising steam wisps above food & teacup
  const steamMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.28,
  });
  for (let i = 0; i < 4; i++) {
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), steamMat);
    const isCup = i === 3;
    wisp.position.set(
      isCup ? 0.24 : (i - 1) * 0.032,
      0.84 + i * 0.03,
      isCup ? -0.15 : -0.14
    );
    wisp.userData.baseY = wisp.position.y;
    wisp.userData.phase = i * 1.4;
    table.add(wisp);
    steamNodes.push(wisp);
  }

  root.add(table);

  if (dining.withKitchenCounter) {
    root.add(buildKitchenCounter());
  }

  return { group: root, steamNodes };
}

function buildHobbyDiorama(hobby: ActiveHobbyScene): {
  group: THREE.Group;
  animatedNodes: THREE.Object3D[];
} {
  const root = new THREE.Group();
  root.name = `life_hobby_${hobby.hobbyKind}`;
  const animatedNodes: THREE.Object3D[] = [];
  const accent = hobby.accentHex || '#c084fc';
  const woodMat = new THREE.MeshStandardMaterial({ color: '#9a6b44', roughness: 0.5 });

  if (hobby.hobbyKind === 'painting') {
    const easel = new THREE.Group();
    easel.position.set(0.68, 0, 0.22);
    easel.rotation.y = -0.58;

    // 3 wooden A-frame easel legs
    for (const [lx, rz] of [
      [-0.24, -0.12],
      [0.24, 0.12],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.58, 0.032), woodMat);
      leg.position.set(lx, 0.78, 0);
      leg.rotation.z = rz;
      easel.add(leg);
    }
    const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.56, 0.032), woodMat);
    backLeg.position.set(0, 0.76, -0.28);
    backLeg.rotation.x = 0.26;
    easel.add(backLeg);

    const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.032, 0.075), woodMat);
    ledge.position.set(0, 0.88, 0.045);
    easel.add(ledge);

    // Procedurally painted anime sunset artwork on canvas!
    const artTex = makeCanvasTexture(256, 320, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 320);
      g.addColorStop(0, '#312e81');
      g.addColorStop(0.55, accent);
      g.addColorStop(1, '#fde68a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 320);
      ctx.fillStyle = '#fffbeb';
      ctx.beginPath();
      ctx.arc(160, 120, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.moveTo(0, 240);
      ctx.lineTo(80, 175);
      ctx.lineTo(155, 225);
      ctx.lineTo(220, 165);
      ctx.lineTo(256, 230);
      ctx.lineTo(256, 320);
      ctx.lineTo(0, 320);
      ctx.fill();
    });
    const canvasMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.64, 0.025),
      new THREE.MeshStandardMaterial({ map: artTex || undefined, color: '#ffffff', roughness: 0.6 })
    );
    canvasMesh.position.set(0, 1.22, 0.032);
    canvasMesh.rotation.x = -0.08;
    easel.add(canvasMesh);

    // Side stool with palette & paint jars
    const pal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.012, 16),
      new THREE.MeshStandardMaterial({ color: '#e7d5b8', roughness: 0.55 })
    );
    pal.position.set(-0.22, 0.905, 0.06);
    easel.add(pal);
    root.add(easel);
  } else if (hobby.hobbyKind === 'music_keyboard') {
    const stand = new THREE.Group();
    stand.position.set(0, 0, 0.52);
    const blackMetal = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.35, metalness: 0.65 });

    // X-stand legs
    for (const dir of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.92, 0.032), blackMetal);
      bar.position.set(0, 0.38, 0);
      bar.rotation.z = dir * 0.68;
      stand.add(bar);
    }

    // Synth body + keys
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.075, 0.32), blackMetal);
    body.position.set(0, 0.74, 0);
    const whiteKeys = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.024, 0.13),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.22 })
    );
    whiteKeys.position.set(0, 0.784, -0.07);
    const ledStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.014, 0.022),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.4 })
    );
    ledStrip.position.set(0, 0.785, 0.08);
    stand.add(body, whiteKeys, ledStrip);

    // Floating animated musical note spheres
    for (let i = 0; i < 4; i++) {
      const note = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.026, 0),
        new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.2 })
      );
      note.position.set(-0.32 + i * 0.22, 0.96 + (i % 2) * 0.08, 0.05);
      note.userData.baseY = note.position.y;
      note.userData.phase = i * 1.1;
      stand.add(note);
      animatedNodes.push(note);
    }
    root.add(stand);
  } else if (hobby.hobbyKind === 'gaming') {
    const desk = new THREE.Group();
    desk.position.set(0, 0, 0.56);
    const darkMat = new THREE.MeshStandardMaterial({ color: '#11111e', roughness: 0.35, metalness: 0.5 });
    const rgbMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.35,
    });

    const top = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.04, 0.62), darkMat);
    top.position.y = 0.72;
    desk.add(top);
    for (const lx of [-0.56, 0.56]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.72, 0.52), darkMat);
      leg.position.set(lx, 0.36, 0);
      desk.add(leg);
    }

    // Glowing ultrawide monitor facing her (-Z)
    const screenTex = makeCanvasTexture(256, 128, (ctx) => {
      ctx.fillStyle = '#09091a';
      ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, 240, 112);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(28, 82, 42, 24);
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(178, 56, 22, 0, Math.PI * 2);
      ctx.fill();
    });
    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.34, 0.025),
      new THREE.MeshStandardMaterial({
        map: screenTex || undefined,
        emissive: accent,
        emissiveIntensity: 0.35,
      })
    );
    monitor.position.set(0, 0.99, 0.14);
    const mStand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.14, 10), darkMat);
    mStand.position.set(0, 0.79, 0.15);

    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.016, 0.12), rgbMat);
    keyboard.position.set(-0.04, 0.748, -0.09);

    const pcTower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.38, 0.34), darkMat);
    pcTower.position.set(0.47, 0.93, 0.05);
    const pcGlow = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.32, 0.28), rgbMat);
    pcGlow.position.set(0.378, 0.93, 0.05);

    desk.add(monitor, mStand, keyboard, pcTower, pcGlow);
    root.add(desk);
  } else if (hobby.hobbyKind === 'baking') {
    const island = buildKitchenCounter();
    island.position.set(0, 0, 0.62);
    island.rotation.y = 0;
    // Add mixing bowl & fresh pastry tray
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.065, 0.085, 18),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.3 })
    );
    bowl.position.set(-0.04, 0.915, -0.08);
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.014, 0.18),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.25, metalness: 0.7 })
    );
    tray.position.set(0.28, 0.88, -0.06);
    for (let i = 0; i < 4; i++) {
      const cupcake = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.018, 0.032, 12),
        new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? '#f472b6' : '#fde68a', roughness: 0.5 })
      );
      cupcake.position.set(0.22 + (i % 2) * 0.11, 0.902, -0.1 + Math.floor(i / 2) * 0.08);
      island.add(cupcake);
    }
    island.add(bowl, tray);
    root.add(island);
  } else if (hobby.hobbyKind === 'yoga') {
    const mat = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.012, 1.72),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.88 })
    );
    mat.position.set(0, 0.008, 0.08);
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.21, 14),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', transparent: true, opacity: 0.78 })
    );
    bottle.position.set(0.48, 0.105, 0.28);
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.07, 14),
      new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#fbbf24', emissiveIntensity: 0.45 })
    );
    candle.position.set(-0.48, 0.035, 0.32);
    root.add(mat, bottle, candle);
  } else if (hobby.hobbyKind === 'photography') {
    const tripod = new THREE.Group();
    tripod.position.set(0.66, 0, 0.38);
    tripod.rotation.y = -0.7;
    const darkMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.35, metalness: 0.6 });
    for (const [rx, rz] of [
      [0.2, 0.18],
      [-0.2, 0.18],
      [0, -0.24],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.008, 1.15, 8), darkMat);
      leg.position.y = 0.56;
      leg.rotation.set(rx, 0, rz);
      tripod.add(leg);
    }
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.08), darkMat);
    camBody.position.y = 1.15;
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.038, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 0.4, metalness: 0.85 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 1.15, 0.06);
    tripod.add(camBody, lens);
    root.add(tripod);
  } else if (hobby.hobbyKind === 'studying') {
    // Authentic Japanese School / College Desk + Wooden School Chair + Pen & Paper Studying!
    const chair = buildDiningChair();
    chair.name = 'life_school_chair';
    root.add(chair);

    const desk = new THREE.Group();
    desk.position.set(0, 0, 0.54);
    const deskWood = new THREE.MeshStandardMaterial({ color: '#c89d6c', roughness: 0.48 });
    const steelMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.35, metalness: 0.65 });

    // Classic school desk top + under-desk cubby shelf + tubular steel legs
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.032, 0.56), deskWood);
    top.position.y = 0.72;
    const cubby = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.09, 0.44), steelMat);
    cubby.position.y = 0.655;
    desk.add(top, cubby);

    for (const lx of [-0.43, 0.43]) {
      for (const lz of [-0.23, 0.23]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.71, 10), steelMat);
        leg.position.set(lx, 0.355, lz);
        desk.add(leg);
      }
      const sideBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.46, 8), steelMat);
      sideBar.rotation.x = Math.PI / 2;
      sideBar.position.set(lx, 0.14, 0);
      desk.add(sideBar);
    }

    // Open Lined Paper Notebook with handwritten study notes & math/diagram sketches!
    const paperTex = makeCanvasTexture(512, 320, (ctx) => {
      ctx.fillStyle = '#fffef7';
      ctx.fillRect(0, 0, 512, 320);
      // Center spine crease
      ctx.fillStyle = 'rgba(15,23,42,0.14)';
      ctx.fillRect(253, 0, 6, 320);
      // Blue horizontal notebook lines
      ctx.strokeStyle = 'rgba(59,130,246,0.28)';
      ctx.lineWidth = 1.5;
      for (let y = 34; y < 305; y += 22) {
        ctx.beginPath();
        ctx.moveTo(16, y);
        ctx.lineTo(244, y);
        ctx.moveTo(268, y);
        ctx.lineTo(496, y);
        ctx.stroke();
      }
      // Red margin lines
      ctx.strokeStyle = 'rgba(244,63,94,0.35)';
      ctx.beginPath();
      ctx.moveTo(42, 0);
      ctx.lineTo(42, 320);
      ctx.moveTo(294, 0);
      ctx.lineTo(294, 320);
      ctx.stroke();
      // Handwritten pen strokes & underlined header
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.4;
      for (let row = 0; row < 8; row++) {
        const y = 48 + row * 22;
        ctx.beginPath();
        ctx.moveTo(52, y);
        for (let x = 58; x < 215 - (row % 3) * 24; x += 10) {
          ctx.lineTo(x, y + Math.sin(x * 0.4 + row) * 3.5);
        }
        ctx.stroke();
      }
      // Highlighted formula box on right page
      ctx.fillStyle = 'rgba(250,204,21,0.32)';
      ctx.fillRect(306, 44, 150, 22);
      ctx.strokeStyle = '#1d4ed8';
      ctx.strokeRect(310, 96, 130, 84);
      ctx.beginPath();
      ctx.moveTo(320, 168);
      ctx.quadraticCurveTo(375, 102, 430, 126);
      ctx.stroke();
    });

    const notebook = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.014, 0.25),
      new THREE.MeshStandardMaterial({ map: paperTex || undefined, color: '#ffffff', roughness: 0.85 })
    );
    notebook.position.set(-0.04, 0.743, -0.08);
    notebook.rotation.y = 0.04;
    desk.add(notebook);

    // Animated Ballpoint Pen actively writing across the notebook paper!
    const penGroup = new THREE.Group();
    penGroup.position.set(0.05, 0.79, -0.07);
    const penBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0055, 0.145, 10),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.3, metalness: 0.35 })
    );
    const penTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.0055, 0.022, 10),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.8, roughness: 0.2 })
    );
    penTip.rotation.x = Math.PI;
    penTip.position.y = -0.083;
    penGroup.add(penBarrel, penTip);
    penGroup.rotation.set(0.35, 0.2, -0.45);
    penGroup.userData.writeMotion = {
      baseX: penGroup.position.x,
      baseZ: penGroup.position.z,
      baseY: penGroup.position.y,
    };
    desk.add(penGroup);
    animatedNodes.push(penGroup);

    // Standing open textbook + pencil case + eraser + highlighter
    const textbookCover = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.024, 0.17),
      new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.6 })
    );
    textbookCover.position.set(-0.31, 0.748, 0.09);
    textbookCover.rotation.y = -0.22;

    const textbook2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.022, 0.16),
      new THREE.MeshStandardMaterial({ color: '#be185d', roughness: 0.6 })
    );
    textbook2.position.set(-0.30, 0.771, 0.09);
    textbook2.rotation.y = -0.14;

    const pencilCase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.19, 12),
      new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.65 })
    );
    pencilCase.rotation.z = Math.PI / 2;
    pencilCase.rotation.y = 0.2;
    pencilCase.position.set(0.29, 0.764, 0.08);

    const eraser = new THREE.Mesh(
      new THREE.BoxGeometry(0.044, 0.014, 0.022),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.7 })
    );
    eraser.position.set(0.22, 0.743, -0.09);

    const highlighter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.35 })
    );
    highlighter.rotation.z = Math.PI / 2;
    highlighter.rotation.y = -0.35;
    highlighter.position.set(0.26, 0.743, -0.03);

    // Classic leather Japanese student bag hanging on side hook of desk!
    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.28, 0.34),
      new THREE.MeshStandardMaterial({ color: '#3b2314', roughness: 0.55 })
    );
    bag.position.set(0.51, 0.50, 0.0);

    desk.add(textbookCover, textbook2, pencilCase, eraser, highlighter, bag);
    root.add(desk);
  } else if (hobby.hobbyKind === 'showering') {
    // 100% SFW Anime Censored Shower Booth:
    // 1. Frosted opaque-gradient shower glass door covering torso & lower body (y = 0 .. 1.32)
    // 2. Fluffy dense anime steam clouds & iridescent soap bubbles
    // 3. Overhead rainfall showerhead with falling water streams + shampoo, conditioner, soap & towel rack!
    const chromeMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.88, roughness: 0.16 });

    // Frosted glass texture with soft steamy droplets & tasteful SFW blur band
    const frostTex = makeCanvasTexture(512, 512, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0.0, 'rgba(240,249,255,0.65)');
      g.addColorStop(0.18, 'rgba(224,242,254,0.94)');
      g.addColorStop(0.85, 'rgba(241,245,249,0.97)');
      g.addColorStop(1.0, 'rgba(226,232,240,0.98)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
      // Soft misty condensation droplets
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 95; i++) {
        const dx = (i * 137) % 500 + 6;
        const dy = (i * 89) % 490 + 10;
        ctx.beginPath();
        ctx.arc(dx, dy, 2 + (i % 5), 0, Math.PI * 2);
        ctx.fill();
      }
      // Subtle frosted diagonal sheen
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.moveTo(0, 120);
      ctx.lineTo(180, 0);
      ctx.lineTo(260, 0);
      ctx.lineTo(0, 200);
      ctx.fill();
    });

    // Front Frosted-Glass Censorship Panel (stands at z = 0.48, height 1.24m so face/hair stay cute & visible above!)
    const censorFrame = new THREE.Group();
    censorFrame.position.set(0, 0, 0.48);
    const glassMat = new THREE.MeshStandardMaterial({
      map: frostTex || undefined,
      color: '#f0f9ff',
      roughness: 0.35,
      metalness: 0.08,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
    });
    const censorGlass = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.26, 0.024), glassMat);
    censorGlass.position.y = 0.63;
    censorFrame.add(censorGlass);

    // Chrome top rail & side posts of shower enclosure
    const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.22, 12), chromeMat);
    topRail.rotation.z = Math.PI / 2;
    topRail.position.y = 1.27;
    censorFrame.add(topRail);
    for (const sx of [-0.59, 0.59]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.05, 12), chromeMat);
      post.position.set(sx, 1.025, 0);
      censorFrame.add(post);
    }
    root.add(censorFrame);

    // Overhead Chrome Rainfall Showerhead + Animated Falling Water Streams
    const showerPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.18, 12), chromeMat);
    showerPipe.position.set(0, 1.09, -0.42);
    const showerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 10), chromeMat);
    showerArm.rotation.x = Math.PI / 2;
    showerArm.position.set(0, 2.16, -0.2);
    const showerHead = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.028, 20), chromeMat);
    showerHead.position.set(0, 2.13, 0.01);
    root.add(showerPipe, showerArm, showerHead);

    const waterMat = new THREE.MeshBasicMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.45,
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.55, 6), waterMat);
      drop.position.set(Math.cos(a) * 0.08, 1.82 - (i % 3) * 0.12, 0.01 + Math.sin(a) * 0.08);
      drop.userData.waterFall = { baseY: 1.88, phase: i * 0.7 };
      root.add(drop);
      animatedNodes.push(drop);
    }

    // Fluffy Anime Steam Cloud Censorship Band + Floating Soap Bubbles
    const steamMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.72,
    });
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.14 + (i % 3) * 0.04, 14, 12), steamMat);
      puff.position.set(-0.46 + i * 0.115, 1.24 + (i % 2) * 0.06, 0.42 + (i % 3) * 0.03);
      puff.userData.baseY = puff.position.y;
      puff.userData.phase = i * 0.85;
      root.add(puff);
      animatedNodes.push(puff);
    }

    const bubbleMat = new THREE.MeshStandardMaterial({
      color: '#e0f2fe',
      emissive: '#fbcfe8',
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.58,
      roughness: 0.05,
      metalness: 0.2,
    });
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.025 + (i % 3) * 0.012, 12, 10), bubbleMat);
      b.position.set(-0.48 + i * 0.14, 1.48 + (i % 3) * 0.14, 0.32 + (i % 2) * 0.16);
      b.userData.baseY = b.position.y;
      b.userData.phase = i * 1.15;
      root.add(b);
      animatedNodes.push(b);
    }

    // Shower Caddy Shelf with Shampoo Bottle, Conditioner, Body Soap Pump, Bar Soap & Rubber Duck!
    const caddy = new THREE.Group();
    caddy.position.set(0.76, 1.06, 0.12);
    caddy.rotation.y = -0.35;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.024, 0.18), chromeMat);
    caddy.add(shelf);

    // Pink Shampoo Pump Bottle
    const shampoo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.036, 0.17, 14),
      new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.25 })
    );
    shampoo.position.set(-0.15, 0.095, 0);
    const shampooPump = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8), chromeMat);
    shampooPump.position.set(-0.15, 0.195, 0);

    // Lavender Conditioner Bottle
    const cond = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.034, 0.155, 14),
      new THREE.MeshStandardMaterial({ color: '#c084fc', roughness: 0.25 })
    );
    cond.position.set(-0.05, 0.088, 0);

    // Mint Body Soap Pump
    const bodySoap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.038, 0.14, 14),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.25 })
    );
    bodySoap.position.set(0.05, 0.08, 0);

    // Bar Soap on Dish + Cute Yellow Rubber Duck
    const barSoap = new THREE.Mesh(
      new THREE.BoxGeometry(0.068, 0.024, 0.044),
      new THREE.MeshStandardMaterial({ color: '#fef9c3', roughness: 0.5 })
    );
    barSoap.position.set(0.155, 0.024, 0.02);

    const duckBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 12, 10),
      new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.35 })
    );
    duckBody.position.set(0.16, 0.042, -0.045);
    const duckHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 10, 10),
      new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.35 })
    );
    duckHead.position.set(0.16, 0.072, -0.035);
    caddy.add(shampoo, shampooPump, cond, bodySoap, barSoap, duckBody, duckHead);
    root.add(caddy);

    // Warm Bath Towel Hanging on Side Rail
    const towelBar = new THREE.Group();
    towelBar.position.set(-0.78, 1.08, 0.18);
    towelBar.rotation.y = 0.42;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 10), chromeMat);
    bar.rotation.z = Math.PI / 2;
    const drapedTowel = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.56, 0.038),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.9 })
    );
    drapedTowel.position.set(0, -0.28, 0);
    towelBar.add(bar, drapedTowel);
    root.add(towelBar);
  } else if (hobby.hobbyKind === 'towel_dry' || hobby.hobbyKind === 'brushing_teeth') {
    // Cozy Bathroom Mirror Vanity Sink with Toothbrush, Toothpaste, Rinse Cup, Towels & Hairdryer!
    const vanity = new THREE.Group();
    vanity.position.set(0, 0, 0.58);
    const cabMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });
    const counterMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.2, metalness: 0.1 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.18, metalness: 0.85 });

    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.74, 0.48), cabMat);
    cabinet.position.y = 0.37;
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.04, 0.52), counterMat);
    counterTop.position.y = 0.76;
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.15, 0.09, 22),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15 })
    );
    basin.position.set(0, 0.755, -0.02);
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.14, 10), chromeMat);
    faucet.position.set(0, 0.85, 0.16);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 10), chromeMat);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(0, 0.90, 0.11);
    vanity.add(cabinet, counterTop, basin, faucet, spout);

    // Soap Dispenser + Rinse Cup + Toothpaste Tube
    const soapPump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.034, 0.12, 14),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.25 })
    );
    soapPump.position.set(-0.34, 0.84, 0.06);

    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.03, 0.088, 16),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.3 })
    );
    cup.position.set(0.28, 0.824, 0.04);

    const toothpaste = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.022, 0.13, 12),
      new THREE.MeshStandardMaterial({ color: '#22d3ee', roughness: 0.3 })
    );
    toothpaste.rotation.z = Math.PI / 2;
    toothpaste.rotation.y = 0.28;
    toothpaste.position.set(0.39, 0.798, -0.08);
    vanity.add(soapPump, cup, toothpaste);

    // Folded Fluffy Towel Stack on Left of Counter
    ['#fdf2f8', '#dbeafe'].forEach((col, i) => {
      const towel = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.048, 0.20),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.92 })
      );
      towel.position.set(-0.42, 0.805 + i * 0.05, -0.06);
      vanity.add(towel);
    });

    if (hobby.hobbyKind === 'brushing_teeth') {
      // Animated 3D Toothbrush gently brushing side-to-side with minty sparkle foam!
      const brushGroup = new THREE.Group();
      brushGroup.position.set(0.06, 1.33, -0.34);
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.014, 0.014),
        new THREE.MeshStandardMaterial({ color: accent, roughness: 0.28 })
      );
      const bristles = new THREE.Mesh(
        new THREE.BoxGeometry(0.032, 0.018, 0.016),
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 })
      );
      bristles.position.set(-0.068, 0.012, 0);
      const mintFoam = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 10, 10),
        new THREE.MeshStandardMaterial({ color: '#a5f3fc', emissive: '#67e8f9', emissiveIntensity: 0.45 })
      );
      mintFoam.position.set(-0.072, 0.024, 0);
      brushGroup.add(handle, bristles, mintFoam);
      brushGroup.rotation.y = -0.35;
      brushGroup.userData.brushMotion = {
        baseX: brushGroup.position.x,
        baseY: brushGroup.position.y,
      };
      vanity.add(brushGroup);
      animatedNodes.push(brushGroup);
    } else {
      // Hairdryer resting on counter for towel-dry refresh
      const dryerBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.026, 0.14, 14),
        new THREE.MeshStandardMaterial({ color: '#f472b6', roughness: 0.25, metalness: 0.2 })
      );
      dryerBody.rotation.z = Math.PI / 2;
      dryerBody.position.set(0.38, 0.83, -0.02);
      vanity.add(dryerBody);
    }

    root.add(vanity);
  } else {
    // Reading Manga or Scrapbook Journaling cozy desk
    const desk = new THREE.Group();
    desk.position.set(0, 0, 0.55);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.04, 0.58), woodMat);
    top.position.y = 0.71;
    desk.add(top);
    for (const lx of [-0.5, 0.5]) {
      for (const lz of [-0.23, 0.23]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.7, 0.042), woodMat);
        leg.position.set(lx, 0.35, lz);
        desk.add(leg);
      }
    }
    // Open book / scrapbook
    const pageMat = new THREE.MeshStandardMaterial({ color: '#fffbeb', roughness: 0.8 });
    const coverMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });
    const leftPage = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.21), pageMat);
    leftPage.position.set(-0.078, 0.742, -0.06);
    leftPage.rotation.z = -0.08;
    const rightPage = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.21), pageMat);
    rightPage.position.set(0.078, 0.742, -0.06);
    rightPage.rotation.z = 0.08;
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.008, 0.22), coverMat);
    cover.position.set(0, 0.734, -0.06);
    desk.add(leftPage, rightPage, cover);

    // Warm desk lamp
    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.02, 16),
      new THREE.MeshStandardMaterial({ color: '#d97706', metalness: 0.7, roughness: 0.3 })
    );
    lampBase.position.set(-0.36, 0.74, 0.08);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.28, 8), lampBase.material);
    lampStem.position.set(-0.36, 0.88, 0.08);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.11, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#fbbf24', emissiveIntensity: 0.85, side: THREE.DoubleSide })
    );
    shade.position.set(-0.32, 1.01, 0.04);
    shade.rotation.z = -0.35;
    desk.add(lampBase, lampStem, shade);

    // Book stack on right
    ['#f472b6', '#60a5fa', '#a78bfa'].forEach((c, idx) => {
      const bk = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.028, 0.23),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.65 })
      );
      bk.position.set(0.36, 0.744 + idx * 0.029, 0.06);
      bk.rotation.y = idx * 0.14;
      desk.add(bk);
    });
    root.add(desk);
  }

  return { group: root, animatedNodes };
}

function buildDestinationDiorama(
  dest: ActiveDestinationScene,
  transparentOverlay = false
): {
  group: THREE.Group;
  animatedNodes: THREE.Object3D[];
} {
  const root = new THREE.Group();
  root.name = `life_destination_${dest.destinationKind}`;
  const animatedNodes: THREE.Object3D[] = [];

  if (dest.destinationKind === 'none') return { group: root, animatedNodes };

  // In Full Studio mode, render the 360° procedural sky dome + ground floor.
  // In Desktop Roam overlay mode, skip opaque background spheres/floors so the user's desktop stays transparent!
  if (!transparentOverlay) {
    // 1. 360° Procedural Destination Sky Dome (works 100% offline with zero API!)
    const skyTex = makeCanvasTexture(1024, 512, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, dest.skyTopHex || '#1e1b4b');
    grad.addColorStop(0.55, dest.skyBottomHex || '#f472b6');
    grad.addColorStop(0.58, dest.groundHex || '#334155');
    grad.addColorStop(1, dest.groundHex || '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    if (dest.destinationKind === 'tropical_beach') {
      // Bright sun + fluffy clouds + turquoise ocean horizon band
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(760, 120, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      for (const [cx, cy, r] of [
        [200, 110, 42],
        [240, 105, 50],
        [520, 95, 38],
        [560, 92, 46],
      ]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(0, 265, 1024, 72);
    } else if (dest.destinationKind === 'shopping_mall') {
      // Bright glass skylight arches & glowing storefront windows
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 4;
      for (let x = 0; x < 1024; x += 96) {
        ctx.strokeRect(x + 12, 160, 72, 115);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, 20, 1024, 48);
    } else if (dest.destinationKind === 'amusement_park' || dest.destinationKind === 'mountain_onsen') {
      // Twinkling stars
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 120; i++) {
        const sx = (i * 197) % 1024;
        const sy = (i * 83) % 210;
        ctx.fillRect(sx, sy, 2, 2);
      }
    } else if (dest.destinationKind === 'highschool_classroom') {
      // Bright sunlit anime classroom wall + blue sky windows + pink sakura trees outside!
      ctx.fillStyle = '#fef9ef';
      ctx.fillRect(0, 0, 1024, 290);
      for (let wx = 40; wx < 980; wx += 180) {
        const winGrad = ctx.createLinearGradient(0, 50, 0, 230);
        winGrad.addColorStop(0, '#38bdf8');
        winGrad.addColorStop(1, '#e0f2fe');
        ctx.fillStyle = winGrad;
        ctx.fillRect(wx, 50, 132, 165);
        // Sakura blossoms peeking outside window
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.arc(wx + 35, 195, 28, 0, Math.PI * 2);
        ctx.arc(wx + 95, 185, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 4;
        ctx.strokeRect(wx, 50, 132, 165);
      }
      ctx.fillStyle = '#d6b892';
      ctx.fillRect(0, 250, 1024, 48);
    } else if (dest.destinationKind === 'college_campus') {
      // Warm university library / lecture hall with arched windows & wood paneling
      ctx.fillStyle = '#2d241e';
      ctx.fillRect(0, 0, 1024, 295);
      for (let wx = 60; wx < 960; wx += 220) {
        const wg = ctx.createLinearGradient(0, 40, 0, 225);
        wg.addColorStop(0, '#60a5fa');
        wg.addColorStop(1, '#fef3c7');
        ctx.fillStyle = wg;
        ctx.fillRect(wx, 48, 120, 175);
        ctx.strokeStyle = '#a16207';
        ctx.lineWidth = 5;
        ctx.strokeRect(wx, 48, 120, 175);
      }
    } else if (dest.destinationKind === 'bathroom_spa') {
      // Bright pastel ceramic tile walls + warm spa glow!
      ctx.fillStyle = '#f0f9ff';
      ctx.fillRect(0, 0, 1024, 512);
      ctx.strokeStyle = 'rgba(148,163,184,0.28)';
      ctx.lineWidth = 2;
      for (let x = 0; x < 1024; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 340);
        ctx.stroke();
      }
      for (let y = 0; y < 340; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1024, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(0, 250, 1024, 24);
    }
  });

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(22, 32, 20),
    new THREE.MeshBasicMaterial({
      map: skyTex || undefined,
      color: '#ffffff',
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  root.add(skyDome);

  // 2. Destination Ground Plane (y = -0.002 so avatar feet sit cleanly on top)
  const groundMat = new THREE.MeshStandardMaterial({
    color: dest.groundHex || '#475569',
    roughness: dest.destinationKind === 'shopping_mall' ? 0.18 : 0.85,
    metalness: dest.destinationKind === 'shopping_mall' ? 0.15 : 0.02,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  root.add(ground);
  }

  // 3. Signature 3D Foreground Scenery Props per Destination!
  if (dest.destinationKind === 'tropical_beach') {
    if (!transparentOverlay) {
      // Shimmering turquoise ocean band behind beach
      const ocean = new THREE.Mesh(
        new THREE.PlaneGeometry(24, 10),
        new THREE.MeshStandardMaterial({
          color: '#06b6d4',
          emissive: '#0891b2',
          emissiveIntensity: 0.22,
          roughness: 0.15,
          metalness: 0.35,
        })
      );
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.set(0, 0.006, -6.5);
      root.add(ocean);
    }

    // Striped Beach Umbrella + Palm Trees
    const umbrella = new THREE.Group();
    umbrella.position.set(-1.35, 0, -0.75);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 2.25, 10),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.5 })
    );
    pole.position.y = 1.12;
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 0.36, 12),
      new THREE.MeshStandardMaterial({ color: '#f43f5e', roughness: 0.6, side: THREE.DoubleSide })
    );
    canopy.position.y = 2.18;
    umbrella.add(pole, canopy);
    root.add(umbrella);

    // Swaying Palm Tree on right
    const palm = new THREE.Group();
    palm.position.set(1.65, 0, -1.65);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.14, 2.8, 10),
      new THREE.MeshStandardMaterial({ color: '#854d0e', roughness: 0.85 })
    );
    trunk.position.y = 1.4;
    trunk.rotation.z = -0.12;
    palm.add(trunk);
    const frondMat = new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.65, side: THREE.DoubleSide });
    const crown = new THREE.Group();
    crown.position.set(0.18, 2.75, 0);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.35, 5), frondMat);
      frond.scale.set(1, 1, 0.18);
      const a = (i / 6) * Math.PI * 2;
      frond.rotation.y = a;
      frond.rotation.z = 1.18;
      frond.position.set(Math.cos(a) * 0.52, -0.05, Math.sin(a) * 0.52);
      crown.add(frond);
    }
    crown.userData.swayRot = true;
    palm.add(crown);
    animatedNodes.push(crown);
    root.add(palm);
  } else if (dest.destinationKind === 'shopping_mall') {
    const metalMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.85, roughness: 0.2 });
    // Two boutique clothing racks with colorful hanging outfits
    for (const side of [-1, 1]) {
      const rack = new THREE.Group();
      rack.position.set(side * 1.45, 0, -0.95);
      rack.rotation.y = -side * 0.35;
      for (const px of [-0.52, 0.52]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.48, 10), metalMat);
        post.position.set(px, 0.74, 0);
        rack.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.08, 10), metalMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.y = 1.46;
      rack.add(bar);
      ['#f472b6', '#a78bfa', '#38bdf8', '#fde047', '#fb7185'].forEach((col, i) => {
        const dress = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.62, 6),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 })
        );
        dress.scale.set(0.35, 1, 1.2);
        dress.position.set(-0.36 + i * 0.18, 1.12, 0);
        rack.add(dress);
      });
      root.add(rack);
    }

    // Colorful designer shopping bags near her feet!
    [
      { x: 0.78, z: 0.18, col: '#f472b6', ry: -0.4 },
      { x: 0.96, z: 0.04, col: '#c084fc', ry: 0.25 },
      { x: -0.82, z: 0.14, col: '#38bdf8', ry: 0.5 },
    ].forEach((b) => {
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.30, 0.12),
        new THREE.MeshStandardMaterial({ color: b.col, roughness: 0.4 })
      );
      bag.position.set(b.x, 0.15, b.z);
      bag.rotation.y = b.ry;
      root.add(bag);
    });
  } else if (dest.destinationKind === 'vacation_cafe') {
    // Striped cafe awning + glowing hanging bistro string lights
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.08, 1.1),
      new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.65 })
    );
    awning.position.set(0, 2.45, -1.65);
    awning.rotation.x = 0.28;
    root.add(awning);

    for (let i = -4; i <= 4; i++) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.036, 10, 10),
        new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#fbbf24', emissiveIntensity: 1.6 })
      );
      bulb.position.set(i * 0.44, 2.25 - Math.cos(i * 0.4) * 0.08, -1.25);
      root.add(bulb);
    }
  } else if (dest.destinationKind === 'mountain_onsen') {
    // Steaming turquoise mineral pool behind wooden deck + glowing paper lanterns
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 32),
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#0891b2',
        emissiveIntensity: 0.32,
        roughness: 0.12,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.012, -2.5);
    root.add(pool);

    for (const lx of [-1.4, 1.4]) {
      const lantern = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.28, 12),
        new THREE.MeshStandardMaterial({ color: '#fef3c7', emissive: '#f59e0b', emissiveIntensity: 1.25 })
      );
      lantern.position.set(lx, 0.65, -1.35);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.035, 0.55, 8),
        new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.8 })
      );
      post.position.set(lx, 0.275, -1.35);
      root.add(lantern, post);
    }
  } else if (dest.destinationKind === 'amusement_park') {
    // Slowly rotating glowing Ferris wheel in background!
    const wheel = new THREE.Group();
    wheel.position.set(0, 2.4, -4.6);
    const rimMat = new THREE.MeshStandardMaterial({
      color: '#f472b6',
      emissive: '#ec4899',
      emissiveIntensity: 1.15,
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.04, 10, 36), rimMat);
    wheel.add(rim);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.5, 6), rimMat);
      spoke.rotation.z = a;
      wheel.add(spoke);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.2, 0.16),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? '#38bdf8' : '#fde047',
          emissive: i % 2 === 0 ? '#0284c7' : '#eab308',
          emissiveIntensity: 0.65,
        })
      );
      cabin.position.set(Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0);
      wheel.add(cabin);
    }
    wheel.userData.spinZ = true;
    animatedNodes.push(wheel);
    root.add(wheel);
  } else if (dest.destinationKind === 'home_kitchen') {
    root.add(buildKitchenCounter());
    const rightCounter = buildKitchenCounter();
    rightCounter.position.set(1.38, 0, -0.82);
    rightCounter.rotation.y = -0.45;
    root.add(rightCounter);
  } else if (dest.destinationKind === 'highschool_classroom') {
    // Classic Green Classroom Chalkboard with chalk math & Japanese study notes + clock behind her!
    const boardTex = makeCanvasTexture(512, 256, (ctx) => {
      ctx.fillStyle = '#1b4332';
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = 'rgba(255,255,255,0.78)';
      ctx.fillStyle = 'rgba(255,255,255,0.86)';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('Today: Exam Review  ✎', 32, 52);
      ctx.font = '20px monospace';
      ctx.fillText('f(x) = x² + 2x + 1 = (x + 1)²', 36, 108);
      ctx.fillText('E = mc²   ·   sin²θ + cos²θ = 1', 36, 148);
      ctx.fillStyle = 'rgba(251,207,232,0.88)';
      ctx.fillText('頑張ろう!  (Do your best!)', 36, 202);
      // Little chalk coordinate graph
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(350, 210);
      ctx.lineTo(470, 210);
      ctx.moveTo(370, 225);
      ctx.lineTo(370, 95);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(372, 198);
      ctx.quadraticCurveTo(415, 110, 462, 128);
      ctx.stroke();
    });

    const boardGroup = new THREE.Group();
    boardGroup.position.set(0, 1.55, -2.05);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#9a6b44', roughness: 0.55 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.15, 1.48, 0.06), frameMat);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.98, 1.32),
      new THREE.MeshStandardMaterial({ map: boardTex || undefined, roughness: 0.85 })
    );
    board.position.z = 0.035;
    const chalkTray = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.04, 0.1), frameMat);
    chalkTray.position.set(0, -0.74, 0.06);
    boardGroup.add(frame, board, chalkTray);

    // Classroom round wall clock above chalkboard
    const clock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.04, 24),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 })
    );
    clock.rotation.x = Math.PI / 2;
    clock.position.set(0, 0.98, 0.02);
    boardGroup.add(clock);
    root.add(boardGroup);

    // Neighboring student desks on left & right sides
    const deskWood = new THREE.MeshStandardMaterial({ color: '#c89d6c', roughness: 0.5 });
    const steelMat = new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.6, roughness: 0.35 });
    for (const side of [-1.45, 1.45]) {
      const sideDesk = new THREE.Group();
      sideDesk.position.set(side, 0, -0.45);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.52), deskWood);
      top.position.y = 0.72;
      sideDesk.add(top);
      for (const lx of [-0.36, 0.36]) {
        for (const lz of [-0.2, 0.2]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.71, 8), steelMat);
          leg.position.set(lx, 0.355, lz);
          sideDesk.add(leg);
        }
      }
      root.add(sideDesk);
    }
  } else if (dest.destinationKind === 'college_campus') {
    // Tall University Library Bookshelves flanking behind her + warm globe study lamps!
    const shelfMat = new THREE.MeshStandardMaterial({ color: '#5c3d28', roughness: 0.55 });
    const bookColors = ['#1d4ed8', '#be185d', '#047857', '#b45309', '#6d28d9', '#334155'];
    for (const side of [-1.55, 1.55]) {
      const shelf = new THREE.Group();
      shelf.position.set(side, 0, -1.75);
      shelf.rotation.y = -side * 0.18;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.35, 0.36), shelfMat);
      frame.position.y = 1.175;
      shelf.add(frame);
      for (let row = 0; row < 4; row++) {
        const y = 0.42 + row * 0.48;
        for (let b = 0; b < 7; b++) {
          const bk = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.32 + (b % 2) * 0.05, 0.24),
            new THREE.MeshStandardMaterial({
              color: bookColors[(row * 3 + b) % bookColors.length],
              roughness: 0.65,
            })
          );
          bk.position.set(-0.48 + b * 0.16, y, 0.08);
          shelf.add(bk);
        }
      }
      root.add(shelf);
    }
  }

  return { group: root, animatedNodes };
}

/**
 * Manages live 3D Dining Tables + Chairs + Kitchen + Food, Hobby Stations, and Travel/Vacation Dioramas.
 */
export class LifePropsController {
  private root: THREE.Group;
  private animatedNodes: THREE.Object3D[] = [];
  private signature = '';

  constructor(scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.name = 'ZetaLifePropsRoot';
    scene.add(this.root);
  }

  public sync(
    lifeScene: ActiveLifeScene | null | undefined,
    visible: boolean,
    transparentOverlay = false,
    isSeated = false,
    fallbackAccentHex = '#f472b6'
  ): void {
    this.root.visible = visible;
    const nextSig =
      visible && (lifeScene || isSeated)
        ? `${transparentOverlay ? 'roam' : 'studio'}::${isSeated ? 'sit' : 'stand'}::${fallbackAccentHex}::${JSON.stringify(lifeScene || {})}`
        : 'empty';
    if (nextSig === this.signature) return;
    this.signature = nextSig;

    // Clear previous 3D props cleanly
    while (this.root.children.length > 0) {
      const child = this.root.children[0];
      this.root.remove(child);
      disposeTree(child);
    }
    this.animatedNodes = [];

    if (!visible) return;
    if (!lifeScene && !isSeated) return;

    if (lifeScene?.destination && lifeScene.destination.destinationKind !== 'none') {
      const built = buildDestinationDiorama(lifeScene.destination, transparentOverlay);
      this.root.add(built.group);
      this.animatedNodes.push(...built.animatedNodes);
    }

    const hasEmbeddedChair =
      Boolean(lifeScene?.dining) || lifeScene?.hobby?.hobbyKind === 'studying';

    // Render AI-generated custom 3D Chair whenever sitting or perched!
    // If LM Studio is still generating her custom chair, render an instant matching velvet chair so she NEVER floats in mid-air!
    if (isSeated && lifeScene?.chair) {
      this.root.add(buildAiGeneratedChair(lifeScene.chair));
    } else if (isSeated && !hasEmbeddedChair) {
      this.root.add(
        buildAiGeneratedChair({
          chairStyle: 'velvet_armchair',
          chairName: 'Cozy Perch Chair',
          frameHex: '#a16207',
          cushionHex: '#3b0764',
          accentHex: fallbackAccentHex,
          reason: 'Cozy chair while perched',
        })
      );
    }

    if (lifeScene?.dining) {
      const built = buildDiningDiorama(lifeScene.dining);
      // If a custom AI chair is rendered above, remove the default wooden dining chair so they don't overlap!
      if (isSeated && lifeScene.chair) {
        const defChair = built.group.getObjectByName('life_dining_chair');
        if (defChair) built.group.remove(defChair);
      }
      this.root.add(built.group);
      this.animatedNodes.push(...built.steamNodes);
    } else if (lifeScene?.hobby) {
      const built = buildHobbyDiorama(lifeScene.hobby);
      if (hasEmbeddedChair && isSeated && lifeScene.chair) {
        const defChair = built.group.getObjectByName('life_school_chair');
        if (defChair) built.group.remove(defChair);
      }
      this.root.add(built.group);
      this.animatedNodes.push(...built.animatedNodes);
    }
  }

  /**
   * Anchors 3D activity props cleanly around the avatar's live position in Desktop Roam mode
   * (or resets to stage origin in Full Studio mode).
   */
  public followPosition(pos: THREE.Vector3 | null): void {
    if (!pos) {
      this.root.position.set(0, 0, 0);
      return;
    }
    this.root.position.set(pos.x, pos.y, pos.z);
  }

  public update(elapsed: number): void {
    if (!this.root.visible || this.animatedNodes.length === 0) return;
    for (const node of this.animatedNodes) {
      if (node.userData.spinZ) {
        node.rotation.z = elapsed * 0.22;
      } else if (node.userData.swayRot) {
        node.rotation.z = Math.sin(elapsed * 1.4) * 0.05;
      } else if (node.userData.writeMotion) {
        const wm = node.userData.writeMotion as { baseX: number; baseY: number; baseZ: number };
        // Natural pen-and-paper writing motion across lined notebook!
        node.position.x = wm.baseX + Math.sin(elapsed * 3.8) * 0.045;
        node.position.z = wm.baseZ + Math.cos(elapsed * 1.3) * 0.028;
        node.position.y = wm.baseY + Math.abs(Math.sin(elapsed * 7.6)) * 0.008;
        node.rotation.z = -0.45 + Math.sin(elapsed * 6.2) * 0.08;
      } else if (node.userData.brushMotion) {
        const bm = node.userData.brushMotion as { baseX: number; baseY: number };
        // Cheerful side-to-side toothbrushing motion!
        node.position.x = bm.baseX + Math.sin(elapsed * 9.5) * 0.024;
        node.position.y = bm.baseY + Math.cos(elapsed * 4.5) * 0.008;
      } else if (node.userData.eatUtensil) {
        const eu = node.userData.eatUtensil as {
          baseX: number;
          baseY: number;
          baseZ: number;
          biteMesh: THREE.Mesh;
        };
        const df = getDiningAnimationFrame(elapsed);
        // Frame-exact handoff: hide resting chopsticks on table the exact instant she grips them!
        node.visible = !df.chopsticksInHand;
        eu.biteMesh.visible = false;
      } else if (node.userData.drinkMug) {
        const df = getDiningAnimationFrame(elapsed);
        // Frame-exact handoff: hide resting teacup on table the exact instant she grips it!
        node.visible = !df.mugInHand;
      } else if (node.userData.waterFall) {
        const wf = node.userData.waterFall as { baseY: number; phase: number };
        const cycle = ((elapsed * 1.8 + wf.phase) % 1);
        node.position.y = wf.baseY - cycle * 0.52;
      } else if (typeof node.userData.baseY === 'number') {
        const phase = Number(node.userData.phase || 0);
        node.position.y = node.userData.baseY + Math.sin(elapsed * 2.2 + phase) * 0.032;
      }
    }
  }

  public dispose(): void {
    while (this.root.children.length > 0) {
      const child = this.root.children[0];
      this.root.remove(child);
      disposeTree(child);
    }
    this.root.parent?.remove(this.root);
    this.animatedNodes = [];
  }
}
