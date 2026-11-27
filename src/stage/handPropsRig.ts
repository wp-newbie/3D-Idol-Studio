import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { ActiveLifeScene, HobbyKindId } from '../types/studio';
import { getDiningAnimationFrame } from './naturalArmPose';

const HAND_PROP_TAG = '__zeta_activity_hand_prop__';

type HandPropMode = 'none' | 'dining' | HobbyKindId;

function disposeTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        m?.dispose();
      }
    }
  });
}

function clearExistingHandProps(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj.userData?.[HAND_PROP_TAG]) {
      toRemove.push(obj);
    }
  });
  for (const node of toRemove) {
    node.parent?.remove(node);
    disposeTree(node);
  }
}

/**
 * Detects the exact finger-outward local X sign (+1 or -1) for a hand bone on ANY VRM 0.x or VRM 1.0 rig
 * by checking where its finger bone sits relative to the wrist!
 * This guarantees chopsticks, teacups, toothbrushes, pens, brushes, books & cameras NEVER point backwards up the forearm.
 */
function detectHandFingerSign(vrm: VRM, side: 'right' | 'left'): 1 | -1 {
  const h = vrm.humanoid;
  if (h) {
    const fingerBone =
      h.getRawBoneNode(side === 'right' ? 'rightMiddleProximal' : 'leftMiddleProximal') ||
      h.getRawBoneNode(side === 'right' ? 'rightIndexProximal' : 'leftIndexProximal');
    if (fingerBone && Math.abs(fingerBone.position.x) > 0.001) {
      return fingerBone.position.x >= 0 ? 1 : -1;
    }
  }
  const isVrm0 = vrm.meta?.metaVersion === '0';
  if (side === 'right') return isVrm0 ? 1 : -1;
  return isVrm0 ? -1 : 1;
}

const _handWorldQ = new THREE.Quaternion();
const _charWorldQ = new THREE.Quaternion();
const _localAlignQ = new THREE.Quaternion();
const _tiltQ = new THREE.Quaternion();
const _tiltEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _pinchPos = new THREE.Vector3();
const _headPos = new THREE.Vector3();
const _headWorldQ = new THREE.Quaternion();
const _mouthWorldPos = new THREE.Vector3();
const _plateWorldPos = new THREE.Vector3();
const _aimTarget = new THREE.Vector3();
const _aimDirX = new THREE.Vector3();
const _aimDirY = new THREE.Vector3();
const _aimDirZ = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _aimBasisM = new THREE.Matrix4();
const _aimWorldQ = new THREE.Quaternion();

function buildRightHandProp(
  mode: HandPropMode,
  accentHex: string,
  fingerSign: 1 | -1
): THREE.Group | null {
  const s = fingerSign;
  const g = new THREE.Group();
  g.name = `HandPropRight_${mode}`;
  g.userData[HAND_PROP_TAG] = true;
  g.userData.fingerSign = s;

  if (mode === 'dining') {
    // Authentic Japanese chopstick grip balance:
    // Held ~42% from the back end (0.085m behind the thumb/index webbing, 0.115m forward to the food bite tip!)
    // Wrapped in `chopstickSlideGroup` so the tip NEVER overshoots past her lips on any VRM proportion!
    g.userData.handRole = 'eat_chopsticks';
    g.position.set(s * 0.044, -0.014, 0.016);

    const slideGroup = new THREE.Group();
    slideGroup.userData.chopstickSlide = true;

    const woodMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.42 });
    const tipBandMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.35 });

    // Upper chopstick (pivots slightly when pinching food!)
    const upperGroup = new THREE.Group();
    upperGroup.position.set(0, 0.005, 0);
    upperGroup.userData.chopstickHalf = 'upper';
    const upperStick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0018, 0.0036, 0.2, 8),
      woodMat
    );
    upperStick.rotation.z = -Math.PI / 2;
    upperStick.position.set(0.015, 0, 0);
    const upperEnd = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0037, 0.0037, 0.022, 8),
      tipBandMat
    );
    upperEnd.rotation.z = -Math.PI / 2;
    upperEnd.position.set(-0.074, 0, 0);
    upperGroup.add(upperStick, upperEnd);

    // Lower chopstick (steady base resting on ring finger / thumb webbing)
    const lowerGroup = new THREE.Group();
    lowerGroup.position.set(0, -0.005, 0);
    lowerGroup.userData.chopstickHalf = 'lower';
    const lowerStick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0018, 0.0036, 0.2, 8),
      woodMat
    );
    lowerStick.rotation.z = -Math.PI / 2;
    lowerStick.position.set(0.015, 0, 0);
    const lowerEnd = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0037, 0.0037, 0.022, 8),
      tipBandMat
    );
    lowerEnd.rotation.z = -Math.PI / 2;
    lowerEnd.position.set(-0.074, 0, 0);
    lowerGroup.add(lowerStick, lowerEnd);

    const bite = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 12, 10),
      new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.45 })
    );
    bite.position.set(0.115, 0, 0);
    bite.userData.handRole = 'eat_bite';

    slideGroup.add(upperGroup, lowerGroup, bite);
    g.add(slideGroup);
    return g;
  }

  if (mode === 'studying' || mode === 'journaling') {
    // Real 3D Ballpoint Pen gripped cleanly in her right hand — pivot sits at her finger tripod pinch,
    // and updateActivityHandProps aims local +X directly onto the live writing spot on the open notebook!
    g.userData.handRole = 'study_pen';
    g.position.set(s * 0.045, -0.015, 0.014);

    const slideGroup = new THREE.Group();
    slideGroup.userData.penSlide = true;

    // Pen barrel extends along +X from back butt (-0.075) to writing tip (+0.078)
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0046, 0.0054, 0.132, 10),
      new THREE.MeshStandardMaterial({ color: accentHex || '#3b82f6', roughness: 0.28, metalness: 0.35 })
    );
    barrel.rotation.z = -Math.PI / 2;
    barrel.position.set(-0.008, 0, 0);

    const gripBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0054, 0.0052, 0.032, 10),
      new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.72 })
    );
    gripBand.rotation.z = -Math.PI / 2;
    gripBand.position.set(0.038, 0, 0);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.0046, 0.022, 10),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.85, roughness: 0.2 })
    );
    tip.rotation.z = -Math.PI / 2;
    tip.position.set(0.068, 0, 0);

    slideGroup.add(barrel, gripBand, tip);
    g.add(slideGroup);
    return g;
  }

  if (mode === 'brushing_teeth') {
    // Real 3D Toothbrush gripped snugly INSIDE her closed right palm & fingers!
    // Pivot sits at palm center; updateActivityHandProps aims local +X directly to her live 3D lips/teeth
    // with zero-overshoot clamping and bristles facing inward toward her teeth.
    g.userData.handRole = 'toothbrush';
    g.position.set(s * 0.044, -0.016, 0.014);

    const slideGroup = new THREE.Group();
    slideGroup.userData.toothbrushSlide = true;

    const handleMat = new THREE.MeshStandardMaterial({ color: accentHex || '#38bdf8', roughness: 0.22 });
    const gripMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
    const bristleMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.85 });
    const foamMat = new THREE.MeshStandardMaterial({
      color: '#cffafe',
      emissive: '#67e8f9',
      emissiveIntensity: 0.42,
      roughness: 0.35,
    });

    // Sleek toothbrush handle extending from x=-0.055 (butt behind fist) to x=+0.112 (head)
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.168, 0.011, 0.013), handleMat);
    handle.position.set(0.028, 0, 0);
    const rubberGrip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.0125, 0.0145), gripMat);
    rubberGrip.position.set(-0.005, 0, 0);

    // Brush head + bristles facing local +Z (oriented directly into her teeth!)
    const bristles = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.010, 0.014), bristleMat);
    bristles.position.set(0.102, 0, 0.011);

    // Cute bubbly mint toothpaste foam cluster right on the bristles
    const foam1 = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), foamMat);
    foam1.position.set(0.104, 0.002, 0.019);
    const foam2 = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 8), foamMat);
    foam2.position.set(0.094, -0.004, 0.017);
    const foam3 = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 8), foamMat);
    foam3.position.set(0.112, 0.005, 0.016);

    slideGroup.add(handle, rubberGrip, bristles, foam1, foam2, foam3);
    g.add(slideGroup);
    return g;
  }

  if (mode === 'gym_weights') {
    // Sleek Chrome & Matte-Black 3D Dumbbell gripped inside her right fist!
    const chrome = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.88, roughness: 0.18 });
    const plate = new THREE.MeshStandardMaterial({ color: accentHex || '#10b981', roughness: 0.38, metalness: 0.25 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.20, 12), chrome);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(s * 0.045, -0.014, 0.012);
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.032, 8), plate);
    p1.rotation.x = Math.PI / 2;
    p1.position.set(s * 0.045, -0.014, 0.092);
    const p2 = p1.clone();
    p2.position.z = -0.068;
    g.add(bar, p1, p2);
    return g;
  }

  if (mode === 'sports_tennis') {
    // Real 3D Tennis Racket gripped cleanly in her right hand!
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.012, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.75 })
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(s * 0.05, -0.01, 0.015);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.01, 0.12, 8),
      new THREE.MeshStandardMaterial({ color: accentHex || '#10b981', roughness: 0.3 })
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(s * 0.16, -0.01, 0.015);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.010, 10, 26),
      new THREE.MeshStandardMaterial({ color: accentHex || '#10b981', roughness: 0.3 })
    );
    rim.scale.set(1.22, 0.92, 1);
    rim.position.set(s * 0.34, -0.01, 0.015);
    const strings = new THREE.Mesh(
      new THREE.CircleGeometry(0.11, 18),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', wireframe: true, side: THREE.DoubleSide })
    );
    strings.scale.set(1.20, 0.90, 1);
    strings.position.set(s * 0.34, -0.01, 0.015);
    g.add(handle, shaft, rim, strings);
    return g;
  }

  if (mode === 'sports_basketball') {
    // Vibrant 3D Orange Basketball held/dribbled in her right hand!
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 18, 14),
      new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.62 })
    );
    ball.position.set(s * 0.075, -0.075, 0.045);
    const seam1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.106, 0.004, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#18181b' })
    );
    seam1.position.copy(ball.position);
    const seam2 = seam1.clone();
    seam2.rotation.y = Math.PI / 2;
    g.add(ball, seam1, seam2);
    return g;
  }

  if (mode === 'towel_dry') {
    const towel = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.038, 0.12),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.92 })
    );
    towel.position.set(s * 0.045, 0.02, 0.01);
    g.add(towel);
    return g;
  }

  if (mode === 'showering') {
    const foamMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#e0f2fe',
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.88,
      roughness: 0.4,
    });
    for (const [x, y, z, r] of [
      [0.04, 0.02, 0.01, 0.032],
      [0.065, 0.038, -0.01, 0.024],
      [0.02, 0.04, 0.025, 0.022],
    ]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), foamMat);
      puff.position.set(s * x, y, z);
      g.add(puff);
    }
    return g;
  }

  if (mode === 'painting') {
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.004, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: '#9a6b44', roughness: 0.5 })
    );
    stick.rotation.z = s * (-Math.PI / 2);
    stick.position.set(s * 0.075, 0.01, 0.02);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.011, 0.03, 8),
      new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.4 })
    );
    tip.rotation.z = s * (-Math.PI / 2);
    tip.position.set(s * 0.185, 0.01, 0.02);
    g.add(stick, tip);
    return g;
  }

  if (mode === 'baking') {
    const metalMat = new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      metalness: 0.85,
      roughness: 0.2,
    });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 8), metalMat);
    handle.position.set(s * 0.035, -0.04, 0.02);
    const whiskHead = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), metalMat);
    whiskHead.scale.set(0.75, 1.35, 0.75);
    whiskHead.position.set(s * 0.035, -0.14, 0.02);
    g.add(handle, whiskHead);
    return g;
  }

  if (mode === 'photography') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.075, 0.055),
      new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.35, metalness: 0.6 })
    );
    body.position.set(s * 0.05, 0.02, 0.03);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.026, 0.045, 14),
      new THREE.MeshStandardMaterial({
        color: '#38bdf8',
        emissive: '#38bdf8',
        emissiveIntensity: 0.35,
        metalness: 0.85,
      })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(s * 0.05, 0.02, 0.07);
    g.add(body, lens);
    return g;
  }

  return null;
}

function buildLeftHandProp(
  mode: HandPropMode,
  accentHex: string,
  fingerSign: 1 | -1
): THREE.Group | null {
  const s = fingerSign;
  const g = new THREE.Group();
  g.name = `HandPropLeft_${mode}`;
  g.userData[HAND_PROP_TAG] = true;
  g.userData.fingerSign = s;

  if (mode === 'dining') {
    // Real 3D Teacup Mug nestled cleanly INSIDE her curled left palm & fingers!
    // Pivot sits at palm center; updateActivityHandProps keeps the cup 100% LEVEL in world space
    // and tilts the top rim smoothly straight toward her lips (-Z) while sipping!
    g.userData.handRole = 'drink_mug';
    g.position.set(s * 0.05, -0.026, 0.014);

    const mug = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.031, 0.078, 18),
      new THREE.MeshStandardMaterial({ color: '#fdf2f8', roughness: 0.22 })
    );
    mug.position.set(0, 0.004, 0);
    const tea = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.005, 18),
      new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.15 })
    );
    tea.position.set(0, 0.036, 0);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.02, 0.0048, 8, 16),
      new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.28 })
    );
    // Handle sits on the outer (+X left) side of the teacup where her fingers wrap around it!
    handle.position.set(0.036, 0.004, 0);
    g.add(mug, tea, handle);
    return g;
  }

  if (mode === 'painting') {
    const pal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.095, 0.01, 18),
      new THREE.MeshStandardMaterial({ color: '#e7d5b8', roughness: 0.55 })
    );
    pal.position.set(s * 0.045, 0.02, 0.02);
    g.add(pal);
    ['#f43f5e', '#38bdf8', '#facc15', '#a855f7', '#22c55e'].forEach((col, i) => {
      const a = (i / 5) * Math.PI * 1.4 - 0.5;
      const dab = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 8, 8),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })
      );
      dab.scale.set(1, 0.45, 1);
      dab.position.set(s * 0.045 + Math.cos(a) * 0.055, 0.028, 0.02 + Math.sin(a) * 0.055);
      g.add(dab);
    });
    return g;
  }

  if (mode === 'reading') {
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.008, 0.16),
      new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.5 })
    );
    cover.position.set(s * 0.06, 0.025, 0.03);
    const pages = new THREE.Mesh(
      new THREE.BoxGeometry(0.205, 0.016, 0.15),
      new THREE.MeshStandardMaterial({ color: '#fffbeb', roughness: 0.85 })
    );
    pages.position.set(s * 0.06, 0.034, 0.03);
    g.add(cover, pages);
    return g;
  }

  if (mode === 'gym_weights') {
    // Matching Left-Hand 3D Dumbbell gripped inside her left fist!
    const chrome = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.88, roughness: 0.18 });
    const plate = new THREE.MeshStandardMaterial({ color: accentHex || '#10b981', roughness: 0.38, metalness: 0.25 });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.20, 12), chrome);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(s * 0.045, -0.014, 0.012);
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.032, 8), plate);
    p1.rotation.x = Math.PI / 2;
    p1.position.set(s * 0.045, -0.014, 0.092);
    const p2 = p1.clone();
    p2.position.z = -0.068;
    g.add(bar, p1, p2);
    return g;
  }

  if (mode === 'towel_dry') {
    const towel = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.038, 0.12),
      new THREE.MeshStandardMaterial({ color: '#fbcfe8', roughness: 0.92 })
    );
    towel.position.set(s * 0.045, 0.02, 0.01);
    g.add(towel);
    return g;
  }

  if (mode === 'showering') {
    const foamMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#e0f2fe',
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.88,
      roughness: 0.4,
    });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), foamMat);
    puff.position.set(s * 0.045, 0.02, 0.01);
    g.add(puff);
    return g;
  }

  return null;
}

/**
 * Attaches real 3D handheld props directly to the VRM's rightHand and leftHand bones
 * with automatic VRM 0.x / VRM 1.0 finger-axis detection so chopsticks, teacups, pens,
 * toothbrushes, towels, paintbrushes, palettes, whisks & cameras always point naturally along her fingers!
 */
export function syncActivityHandPropsToVrm(params: {
  vrm: VRM | null;
  avatarRoot: THREE.Object3D;
  lifeScene?: ActiveLifeScene | null;
  accentHex?: string;
}): void {
  const { vrm, avatarRoot, lifeScene, accentHex = '#f472b6' } = params;
  clearExistingHandProps(avatarRoot);

  if (!vrm?.humanoid || !lifeScene) return;
  const mode: HandPropMode = lifeScene.dining
    ? 'dining'
    : lifeScene.hobby
    ? lifeScene.hobby.hobbyKind
    : 'none';
  if (mode === 'none') return;

  const rightHand =
    vrm.humanoid.getRawBoneNode('rightHand') ||
    vrm.humanoid.getNormalizedBoneNode('rightHand');
  const leftHand =
    vrm.humanoid.getRawBoneNode('leftHand') ||
    vrm.humanoid.getNormalizedBoneNode('leftHand');

  const resolvedAccent =
    lifeScene.dining?.accentHex || lifeScene.hobby?.accentHex || accentHex;

  if (rightHand) {
    const rSign = detectHandFingerSign(vrm, 'right');
    const rProp = buildRightHandProp(mode, resolvedAccent, rSign);
    if (rProp) rightHand.add(rProp);
  }
  if (leftHand) {
    const lSign = detectHandFingerSign(vrm, 'left');
    const lProp = buildLeftHandProp(mode, resolvedAccent, lSign);
    if (lProp) leftHand.add(lProp);
  }
}

/**
 * Synchronizes handheld dining props (chopsticks + food bite + teacup) frame-for-frame
 * with the table props, arm motions, finger grips, and mouth opening/chewing/sipping!
 * - Teacup uses exact world-to-hand quaternion alignment so it stays 100% level & tilts cleanly toward her lips.
 * - Chopsticks dynamically aim straight from her right-hand finger pinch to the EXACT live 3D dish/lips target!
 */
export function updateActivityHandProps(
  avatarRoot: THREE.Object3D | null,
  lifeScene: ActiveLifeScene | null | undefined,
  elapsed: number,
  vrm?: VRM | null
): void {
  const isDining = Boolean(lifeScene?.dining);
  const isBrushing = !isDining && lifeScene?.hobby?.hobbyKind === 'brushing_teeth';
  const isStudying =
    !isDining &&
    (lifeScene?.hobby?.hobbyKind === 'studying' || lifeScene?.hobby?.hobbyKind === 'journaling');
  if (!avatarRoot || (!isDining && !isBrushing && !isStudying)) return;
  const df = isDining ? getDiningAnimationFrame(elapsed) : null;

  // Character-frame world transform (+X character left, +Y up, +Z forward)
  const frameObj = avatarRoot.parent || avatarRoot;
  frameObj.updateWorldMatrix(true, false);
  frameObj.getWorldQuaternion(_charWorldQ);

  // Exact live 3D mouth target (derived from real VRM head bone!) and plate target
  const headBone =
    vrm?.humanoid?.getRawBoneNode('head') ||
    vrm?.humanoid?.getNormalizedBoneNode('head') ||
    null;
  if (headBone) {
    headBone.updateWorldMatrix(true, false);
    headBone.getWorldPosition(_headPos);
    headBone.getWorldQuaternion(_headWorldQ);
    // In VRM/VRoid rigs, the head bone origin sits at the neck-skull joint (jawline),
    // so the mouth sits slightly ABOVE (+0.038m Y) and forward (+0.095m Z) in character frame!
    _mouthWorldPos.set(0, 0.038, 0.095).applyQuaternion(_charWorldQ).add(_headPos);
  } else {
    _mouthWorldPos.set(0, 1.04, 0.12).applyQuaternion(_charWorldQ).add(frameObj.position);
  }
  _plateWorldPos.set(0, 0.76, 0.42).applyQuaternion(_charWorldQ).add(frameObj.position);

  avatarRoot.traverse((obj) => {
    if (isStudying && obj.userData?.handRole === 'study_pen' && obj.parent) {
      obj.parent.updateWorldMatrix(true, false);
      obj.parent.getWorldQuaternion(_handWorldQ);
      obj.updateWorldMatrix(true, false);
      obj.getWorldPosition(_pinchPos);

      // Aim pen tip directly onto the open lined notebook page (desk z=0.50, notebook at (-0.02, 0.75, -0.08) -> world z=0.42)
      const writeX = -0.01 + Math.sin(elapsed * 3.8) * 0.048;
      const writeZ = 0.42 + Math.cos(elapsed * 1.3) * 0.026;
      const writeY = 0.752 + Math.abs(Math.sin(elapsed * 7.6)) * 0.004;
      _aimTarget.set(writeX, writeY, writeZ).applyQuaternion(_charWorldQ).add(frameObj.position);

      _aimDirX.copy(_aimTarget).sub(_pinchPos);
      const distToPaper = _aimDirX.length();
      if (distToPaper < 1e-4) {
        _aimDirX.set(0.2, -0.85, 0.48).applyQuaternion(_charWorldQ).normalize();
      } else {
        _aimDirX.multiplyScalar(1 / distToPaper);
      }
      _aimDirZ.crossVectors(_aimDirX, _worldUp);
      if (_aimDirZ.lengthSq() < 1e-5) {
        _aimDirZ.set(0, 0, 1).applyQuaternion(_charWorldQ);
      } else {
        _aimDirZ.normalize();
      }
      _aimDirY.crossVectors(_aimDirZ, _aimDirX).normalize();
      _aimBasisM.makeBasis(_aimDirX, _aimDirY, _aimDirZ);
      _aimWorldQ.setFromRotationMatrix(_aimBasisM);

      _localAlignQ.copy(_handWorldQ).invert().multiply(_aimWorldQ);
      obj.quaternion.copy(_localAlignQ);

      // Zero-overshoot clamping: pen tip touches cleanly ON TOP of the notebook paper without stabbing through the desk!
      const penSlideOffset = Math.min(0.015, Math.max(-0.04, distToPaper - 0.079));
      for (const child of obj.children) {
        if (child.userData?.penSlide) {
          child.position.x = penSlideOffset;
        }
      }
      return;
    }

    if (isBrushing && obj.userData?.handRole === 'toothbrush' && obj.parent) {
      obj.parent.updateWorldMatrix(true, false);
      obj.parent.getWorldQuaternion(_handWorldQ);
      obj.updateWorldMatrix(true, false);
      obj.getWorldPosition(_pinchPos);

      // Gentle side-to-side horizontal tooth-brushing target directly across her lips/teeth!
      const scrubX = Math.sin(elapsed * 8.8) * 0.016;
      const scrubY = Math.cos(elapsed * 4.4) * 0.004;
      _aimTarget
        .set(scrubX, scrubY, 0.008)
        .applyQuaternion(_charWorldQ)
        .add(_mouthWorldPos);

      _aimDirX.copy(_aimTarget).sub(_pinchPos);
      const distToMouth = _aimDirX.length();
      if (distToMouth < 1e-4) {
        _aimDirX.set(1, 0, -0.35).applyQuaternion(_charWorldQ).normalize();
      } else {
        _aimDirX.multiplyScalar(1 / distToMouth);
      }
      // Keep local +Y upright and local +Z (bristles) pointing straight inward toward her teeth!
      _aimDirZ.crossVectors(_aimDirX, _worldUp);
      if (_aimDirZ.lengthSq() < 1e-5) {
        _aimDirZ.set(0, 0, -1).applyQuaternion(_charWorldQ);
      } else {
        _aimDirZ.normalize();
      }
      // Ensure +Z (bristle side) faces INWARD (-characterForward) toward her teeth, not out toward camera
      const charBack = new THREE.Vector3(0, 0, -1).applyQuaternion(_charWorldQ);
      if (_aimDirZ.dot(charBack) < 0) {
        _aimDirZ.negate();
      }
      _aimDirY.crossVectors(_aimDirZ, _aimDirX).normalize();
      _aimBasisM.makeBasis(_aimDirX, _aimDirY, _aimDirZ);
      _aimWorldQ.setFromRotationMatrix(_aimBasisM);

      _localAlignQ.copy(_handWorldQ).invert().multiply(_aimWorldQ);
      obj.quaternion.copy(_localAlignQ);

      // Zero-overshoot clamping: bristles stop cleanly RIGHT AT her lips/teeth!
      const brushSlideOffset = Math.min(0.012, Math.max(-0.045, distToMouth - 0.112));
      for (const child of obj.children) {
        if (child.userData?.toothbrushSlide) {
          child.position.x = brushSlideOffset;
        }
      }
      return;
    }

    if (!df) return;
    if (obj.userData?.handRole === 'eat_chopsticks') {
      obj.visible = df.chopsticksInHand;
      if (obj.visible && obj.parent) {
        obj.parent.updateWorldMatrix(true, false);
        obj.parent.getWorldQuaternion(_handWorldQ);
        obj.updateWorldMatrix(true, false);
        obj.getWorldPosition(_pinchPos);

        // Aim chopstick tip (+X) directly from her finger pinch toward the plate (at pickup)
        // and smoothly up into the exact center of her lips (as eatLift -> 1)!
        _aimTarget.copy(_plateWorldPos).lerp(_mouthWorldPos, df.eatLift);
        _aimDirX.copy(_aimTarget).sub(_pinchPos);
        const distToTarget = _aimDirX.length();
        if (distToTarget < 1e-4) {
          _aimDirX.set(1, 0, -0.35).applyQuaternion(_charWorldQ).normalize();
        } else {
          _aimDirX.multiplyScalar(1 / distToTarget);
        }
        // Build clean orthonormal basis with local +Y upright so the 2 chopsticks stay stacked vertically
        _aimDirZ.crossVectors(_aimDirX, _worldUp);
        if (_aimDirZ.lengthSq() < 1e-5) {
          _aimDirZ.set(0, 0, 1);
        } else {
          _aimDirZ.normalize();
        }
        _aimDirY.crossVectors(_aimDirZ, _aimDirX).normalize();
        _aimBasisM.makeBasis(_aimDirX, _aimDirY, _aimDirZ);
        _aimWorldQ.setFromRotationMatrix(_aimBasisM);

        _localAlignQ.copy(_handWorldQ).invert().multiply(_aimWorldQ);
        obj.quaternion.copy(_localAlignQ);

        // Zero-overshoot guarantee: clamp the forward extension so the food bite stops
        // cleanly AT her lips/plate and NEVER shoots through her face past the far cheek!
        const pinchAngle = df.biteOnChopsticks ? -0.032 : 0.045;
        const slideOffset = Math.min(0, Math.max(-0.065, distToTarget - 0.122));
        for (const child of obj.children) {
          if (child.userData?.chopstickSlide) {
            child.position.x = slideOffset;
            for (const sub of child.children) {
              if (sub.userData?.chopstickHalf === 'upper') {
                sub.rotation.z = pinchAngle;
              } else if (sub.userData?.chopstickHalf === 'lower') {
                sub.rotation.z = 0.02;
              }
            }
          }
        }
      }
    } else if (obj.userData?.handRole === 'eat_bite') {
      obj.visible = df.biteOnChopsticks;
    } else if (obj.userData?.handRole === 'drink_mug') {
      obj.visible = df.mugInHand;
      if (obj.visible && obj.parent) {
        obj.parent.updateWorldMatrix(true, false);
        obj.parent.getWorldQuaternion(_handWorldQ);
        // Keep the teacup 100% LEVEL & UPRIGHT in world space as she lifts it,
        // then tilt the top rim smoothly straight toward her lips (-Z) during the sip!
        const sipPitchX = -df.mugTilt * 0.44;
        _tiltEuler.set(sipPitchX, 0, 0, 'YXZ');
        _tiltQ.setFromEuler(_tiltEuler);
        _localAlignQ.copy(_handWorldQ).invert().multiply(_charWorldQ).multiply(_tiltQ);
        obj.quaternion.copy(_localAlignQ);
      }
    }
  });
}
