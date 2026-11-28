import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { ProceduralAccessoryId } from '../types/studio';

export const PROCEDURAL_ACCESSORY_META: Record<
  ProceduralAccessoryId,
  { label: string; emoji: string; bone: 'head' | 'neck' | 'chest' }
> = {
  cat_ears: { label: 'Cat Ears', emoji: '🐱', bone: 'head' },
  halo: { label: 'Idol Halo', emoji: '😇', bone: 'head' },
  ribbon_bow: { label: 'Hair Ribbon', emoji: '🎀', bone: 'head' },
  cyber_visor: { label: 'Cyber Visor', emoji: '🕶️', bone: 'head' },
  choker: { label: 'Choker', emoji: '💎', bone: 'neck' },
  fairy_wings: { label: 'Cyber Wings', emoji: '🦋', bone: 'chest' },
  idol_crown: { label: 'Mini Tiara', emoji: '👑', bone: 'head' },
  spa_towel: { label: 'Bath Towel', emoji: '🧖‍♀️', bone: 'head' },
};

export const PROCEDURAL_ACCESSORY_ORDER: ProceduralAccessoryId[] = [
  'cat_ears',
  'halo',
  'ribbon_bow',
  'cyber_visor',
  'choker',
  'fairy_wings',
  'idol_crown',
  'spa_towel',
];

const ACCESSORY_GROUP_TAG = '__zeta_procedural_accessory__';

function disposeObjectTree(root: THREE.Object3D): void {
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

function clearExistingAccessories(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj.userData?.[ACCESSORY_GROUP_TAG]) {
      toRemove.push(obj);
    }
  });
  for (const node of toRemove) {
    node.parent?.remove(node);
    disposeObjectTree(node);
  }
}

function buildAccessoryGroup(
  id: ProceduralAccessoryId,
  accentHex: string,
  vrm?: VRM | null
): THREE.Group {
  const group = new THREE.Group();
  group.name = `ProceduralAccessory_${id}`;
  group.userData[ACCESSORY_GROUP_TAG] = true;

  const primaryColor = new THREE.Color(accentHex || '#c084fc');
  const darkBase = new THREE.Color('#161324');
  const isVrm0 = vrm?.meta?.metaVersion === '0';
  const fwdSign = isVrm0 ? -1 : 1;

  if (id === 'cat_ears') {
    const outerMat = new THREE.MeshStandardMaterial({
      color: darkBase.clone().lerp(primaryColor, 0.35),
      roughness: 0.48,
      metalness: 0.15,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: primaryColor.clone().lerp(new THREE.Color('#fda4af'), 0.5),
      roughness: 0.4,
      emissive: primaryColor,
      emissiveIntensity: 0.18,
    });
    const bandMat = new THREE.MeshStandardMaterial({
      color: darkBase,
      roughness: 0.35,
      metalness: 0.5,
    });

    // Sleek headband nestled cleanly along the top-back crown of the head (behind bangs/forehead)
    // with radius closely fitting the skull so it NEVER slices horizontally through front bangs!
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.0055, 10, 32, Math.PI * 0.72), bandMat);
    band.position.set(0, 0.185, -0.018);
    band.rotation.x = 0.22;
    band.rotation.z = Math.PI * 0.14;
    group.add(band);

    for (const side of [-1, 1]) {
      const earPivot = new THREE.Group();
      // Natural ear positioning on top of skull/crown behind frontal bangs
      earPivot.position.set(side * 0.088, 0.208, -0.012);
      earPivot.rotation.z = -side * 0.28;
      earPivot.rotation.y = side * 0.12;
      earPivot.rotation.x = 0.08;

      const outerEar = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.088, 4), outerMat);
      outerEar.scale.set(1.0, 1.0, 0.48);
      outerEar.rotation.y = Math.PI / 4;
      earPivot.add(outerEar);

      const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.056, 4), innerMat);
      innerEar.scale.set(1.0, 1.0, 0.35);
      innerEar.position.set(0, -0.006, 0.011);
      innerEar.rotation.y = Math.PI / 4;
      earPivot.add(innerEar);

      group.add(earPivot);
    }
  } else if (id === 'halo') {
    const haloMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.6,
      transparent: true,
      opacity: 0.92,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.009, 14, 48), haloMat);
    ring.rotation.x = Math.PI / 2 - 0.14;
    ring.position.set(0, 0.295, -0.02);
    group.add(ring);

    const innerSpark = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.003, 8, 36),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })
    );
    innerSpark.rotation.x = ring.rotation.x;
    innerSpark.position.copy(ring.position);
    group.add(innerSpark);
  } else if (id === 'ribbon_bow') {
    const bowMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.45,
      metalness: 0.15,
    });
    const pivot = new THREE.Group();
    pivot.position.set(0.128, 0.188, 0.025);
    pivot.rotation.z = -0.35;
    pivot.rotation.y = 0.25;

    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), bowMat);
    pivot.add(knot);

    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.068, 8), bowMat);
      loop.scale.set(1.0, 1.0, 0.42);
      loop.position.set(side * 0.036, 0.005, 0);
      loop.rotation.z = side * (Math.PI / 2 - 0.18);
      pivot.add(loop);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.065, 0.005), bowMat);
      tail.position.set(side * 0.018, -0.036, -0.004);
      tail.rotation.z = side * 0.28;
      pivot.add(tail);
    }
    group.add(pivot);
  } else if (id === 'cyber_visor') {
    const glassMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.65,
      roughness: 0.1,
      metalness: 0.85,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#11111e',
      roughness: 0.25,
      metalness: 0.9,
    });

    // Sleek anime cyber visor fitted flush across the brow/forehead (zero floating forward gap):
    const visorGeo = new THREE.CylinderGeometry(
      0.074,
      0.072,
      0.022,
      28,
      1,
      true,
      -Math.PI * 0.32,
      Math.PI * 0.64
    );
    const visor = new THREE.Mesh(visorGeo, glassMat);
    visor.position.set(0, 0.036, 0.002 * fwdSign);
    if (fwdSign < 0) {
      visor.rotation.y = Math.PI;
    }
    group.add(visor);

    const browBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.004, 28, 1, true, -Math.PI * 0.33, Math.PI * 0.66),
      frameMat
    );
    browBar.position.set(0, 0.047, 0.002 * fwdSign);
    if (fwdSign < 0) {
      browBar.rotation.y = Math.PI;
    }
    group.add(browBar);

    // Sleek side temples hugging the skull back toward ears
    for (const side of [-1, 1]) {
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.005, 0.055), frameMat);
      temple.position.set(side * 0.072, 0.044, -0.022 * fwdSign);
      group.add(temple);
    }
  } else if (id === 'choker') {
    const strapMat = new THREE.MeshStandardMaterial({
      color: '#12101c',
      roughness: 0.45,
      metalness: 0.3,
    });
    const gemMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.7,
    });
    // Snug anime neck fit (+0.004m clearance, radius 0.042m instead of oversized 0.056m)
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.0052, 10, 32), strapMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.02, 0.003);
    group.add(collar);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), gemMat);
    gem.position.set(0, 0.014, 0.046);
    group.add(gem);
  } else if (id === 'fairy_wings') {
    const backZ = -fwdSign;
    const wingMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      metalness: 0.2,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const upperShape = new THREE.Shape();
    upperShape.moveTo(0, 0);
    upperShape.bezierCurveTo(0.08, 0.14, 0.24, 0.18, 0.26, 0.07);
    upperShape.bezierCurveTo(0.24, -0.02, 0.12, -0.04, 0, -0.02);

    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(0, -0.015);
    lowerShape.bezierCurveTo(0.08, -0.03, 0.16, -0.08, 0.13, -0.11);
    lowerShape.bezierCurveTo(0.08, -0.11, 0.03, -0.05, 0, -0.025);

    const upperGeo = new THREE.ShapeGeometry(upperShape, 12);
    const lowerGeo = new THREE.ShapeGeometry(lowerShape, 10);

    for (const side of [-1, 1]) {
      const wingPivot = new THREE.Group();
      // Mounted safely behind the upper back / scapulae (never clipping shoulders or arms)
      wingPivot.position.set(side * 0.038, 0.04, 0.075 * backZ);
      wingPivot.rotation.y = -side * 0.42;
      wingPivot.rotation.x = -0.10 * fwdSign;
      wingPivot.scale.x = side;

      const upperMesh = new THREE.Mesh(upperGeo, wingMat);
      const lowerMesh = new THREE.Mesh(lowerGeo, wingMat);
      // No stray rods or cylinders jutting out behind neck/shoulder!
      wingPivot.add(upperMesh, lowerMesh);
      group.add(wingPivot);
    }
  } else if (id === 'idol_crown') {
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#fde68a',
      emissive: '#f59e0b',
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.88,
    });
    const gemMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      emissive: primaryColor,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.6,
    });

    const crownPivot = new THREE.Group();
    crownPivot.position.set(0.035, 0.215, 0.025);
    crownPivot.rotation.z = -0.18;
    crownPivot.rotation.x = 0.12;

    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.006, 10, 28), goldMat);
    baseRing.rotation.x = Math.PI / 2;
    crownPivot.add(baseRing);

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.011, i === 0 ? 0.044 : 0.032, 4),
        goldMat
      );
      spike.position.set(Math.sin(angle) * 0.044, 0.018, Math.cos(angle) * 0.044);
      crownPivot.add(spike);
    }

    const centerGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), gemMat);
    centerGem.position.set(0, 0.022, 0.046);
    crownPivot.add(centerGem);

    group.add(crownPivot);
  } else if (id === 'spa_towel') {
    // Iconic folded anime bath / onsen towel resting neatly on top of her head!
    const towelMat = new THREE.MeshStandardMaterial({
      color: '#fdf2f8',
      roughness: 0.92,
      metalness: 0.0,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      roughness: 0.85,
    });
    const towelPivot = new THREE.Group();
    towelPivot.position.set(0, 0.222, 0.005);
    towelPivot.rotation.z = -0.05;

    const foldBottom = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.024, 0.115), towelMat);
    const foldTop = new THREE.Mesh(new THREE.BoxGeometry(0.138, 0.022, 0.108), towelMat);
    foldTop.position.y = 0.021;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.146, 0.008, 0.024), stripeMat);
    stripe.position.set(0, 0.016, 0.044);

    towelPivot.add(foldBottom, foldTop, stripe);
    group.add(towelPivot);
  }

  return group;
}

/**
 * Attaches procedural 3D accessories directly to the VRM's humanoid bones so they follow
 * head tilts, posture changes, breathing, and emotes with zero lag.
 */
export function syncProceduralAccessoriesToVrm(params: {
  vrm: VRM | null;
  avatarRoot: THREE.Object3D;
  accessories: ProceduralAccessoryId[];
  accentHex?: string;
}): void {
  const { vrm, avatarRoot, accessories, accentHex = '#c084fc' } = params;

  clearExistingAccessories(avatarRoot);
  if (!vrm || !vrm.humanoid || !accessories || accessories.length === 0) return;

  // Measure normalized bone orientation: raw head bones in some VRM models carry baked local rotations,
  // so attach into an identity-aligned anchor beneath the raw humanoid bone.
  const getBoneParent = (bone: 'head' | 'neck' | 'chest'): THREE.Object3D | null => {
    if (bone === 'chest') {
      return (
        vrm.humanoid.getNormalizedBoneNode('upperChest') ||
        vrm.humanoid.getRawBoneNode('upperChest') ||
        vrm.humanoid.getNormalizedBoneNode('chest') ||
        vrm.humanoid.getRawBoneNode('chest') ||
        vrm.humanoid.getRawBoneNode('spine')
      );
    }
    return vrm.humanoid.getNormalizedBoneNode(bone) || vrm.humanoid.getRawBoneNode(bone);
  };

  const uniqueIds = Array.from(new Set(accessories));
  for (const id of uniqueIds) {
    const meta = PROCEDURAL_ACCESSORY_META[id];
    if (!meta) continue;
    const boneNode = getBoneParent(meta.bone);
    if (!boneNode) continue;

    const anchor = new THREE.Group();
    anchor.name = `AccessoryAnchor_${id}`;
    anchor.userData[ACCESSORY_GROUP_TAG] = true;

    const meshGroup = buildAccessoryGroup(id, accentHex, vrm);
    anchor.add(meshGroup);
    boneNode.add(anchor);
  }
}
