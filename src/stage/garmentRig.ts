import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { GarmentStyleId } from '../types/studio';

export const GARMENT_STYLE_ORDER: GarmentStyleId[] = [
  'default',
  'cozy_hoodie_pants',
  'summer_sundress',
  'streetwear_jacket_shorts',
  'sporty_tee_leggings',
  'kimono_yukata',
  'evening_gown',
  'cozy_pajamas',
  'school_blazer',
  'trench_coat_pants',
  'bath_wrap',
  'beach_swimsuit',
];

export const GARMENT_STYLE_META: Record<
  GarmentStyleId,
  {
    label: string;
    emoji: string;
    summary: string;
    hidesNativeClothes: boolean;
  }
> = {
  default: {
    label: 'Native VRM Outfit',
    emoji: '✨',
    summary: 'Uses the avatar model’s built-in clothing mesh with custom colors & fabric patterns.',
    hidesNativeClothes: false,
  },
  cozy_hoodie_pants: {
    label: 'Oversized Hoodie & Joggers',
    emoji: '🧥',
    summary: 'Plush pullover hoodie with hood & drawstrings paired with tapered jogger pants.',
    hidesNativeClothes: true,
  },
  summer_sundress: {
    label: 'Summer Sundress',
    emoji: '👗',
    summary: 'Breezy sleeveless strappy sundress with waist ribbon and flared midi skirt.',
    hidesNativeClothes: true,
  },
  streetwear_jacket_shorts: {
    label: 'Streetwear Jacket & Shorts',
    emoji: '🩳',
    summary: 'Open-front cropped bomber jacket over inner tee with belted casual shorts.',
    hidesNativeClothes: true,
  },
  sporty_tee_leggings: {
    label: 'Short-Sleeve Tee & Leggings',
    emoji: '🏃‍♀️',
    summary: 'Athletic short-sleeve t-shirt paired with sleek full-length sport leggings.',
    hidesNativeClothes: true,
  },
  kimono_yukata: {
    label: 'Kimono / Yukata',
    emoji: '👘',
    summary: 'Traditional wrap kimono with wide obi sash, back bow, and draping furisode sleeves.',
    hidesNativeClothes: true,
  },
  evening_gown: {
    label: 'Evening Gown',
    emoji: '💃',
    summary: 'Off-shoulder sweetheart bodice with flowing layered floor-length idol gown.',
    hidesNativeClothes: true,
  },
  cozy_pajamas: {
    label: 'Cozy Pajama Set',
    emoji: '🌙',
    summary: 'Soft collared button-front pajama shirt and comfy full-length lounge pants.',
    hidesNativeClothes: true,
  },
  school_blazer: {
    label: 'School Blazer & Pleated Skirt',
    emoji: '🎓',
    summary: 'Tailored academy blazer with crisp collar, ribbon tie, pleated skirt & knee socks.',
    hidesNativeClothes: true,
  },
  trench_coat_pants: {
    label: 'Trench Coat & Trousers',
    emoji: '🧥',
    summary: 'Double-breasted belted trench coat layered over slim tailored long trousers.',
    hidesNativeClothes: true,
  },
  bath_wrap: {
    label: 'Fluffy Bath Towel Wrap',
    emoji: '🧖‍♀️',
    summary: 'Wholesome full-coverage fluffy spa bath towel wrap with chest knot for bath & shower care.',
    hidesNativeClothes: true,
  },
  beach_swimsuit: {
    label: 'Beach Resort Swimsuit',
    emoji: '🩱',
    summary: 'Stylish anime one-piece resort swimsuit with halter straps & sheer beach pareo wrap.',
    hidesNativeClothes: true,
  },
};

const GARMENT_TAG = '__zeta_procedural_garment__';
const textureLoader = new THREE.TextureLoader();
const garmentTexCache = new Map<string, THREE.Texture>();

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

function clearExistingGarments(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj.userData?.[GARMENT_TAG]) {
      toRemove.push(obj);
    }
  });
  for (const node of toRemove) {
    node.parent?.remove(node);
    disposeTree(node);
  }
}

function makeFabricMaterial(
  colorHex: string,
  options?: {
    textureDataUrl?: string | null;
    roughness?: number;
    metalness?: number;
    doubleSide?: boolean;
    repeatX?: number;
    repeatY?: number;
  }
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: options?.textureDataUrl ? '#ffffff' : colorHex,
    roughness: options?.roughness ?? 0.72,
    metalness: options?.metalness ?? 0.04,
    side: options?.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });

  const url = options?.textureDataUrl;
  if (url) {
    const key = `${url.slice(0, 80)}_${options?.repeatX ?? 2}_${options?.repeatY ?? 2}`;
    const cached = garmentTexCache.get(key);
    if (cached) {
      mat.map = cached;
      mat.needsUpdate = true;
    } else {
      textureLoader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(options?.repeatX ?? 2, options?.repeatY ?? 2);
        tex.needsUpdate = true;
        garmentTexCache.set(key, tex);
        mat.map = tex;
        mat.needsUpdate = true;
      });
    }
  }

  return mat;
}

/**
 * Creates a tapered tube aligned cleanly along a bone segment from `startFrac` to `endFrac`
 * of the vector from `bone` to `childBone` (works identically on VRM 0.x & VRM 1.0!).
 */
function createBoneSegmentTube(params: {
  bone: THREE.Object3D;
  childBone: THREE.Object3D | null;
  fallbackDir: THREE.Vector3;
  fallbackLen: number;
  startFrac: number;
  endFrac: number;
  radiusStart: number;
  radiusEnd: number;
  mat: THREE.Material;
  radialSegments?: number;
  openEnded?: boolean;
}): THREE.Mesh {
  const {
    childBone,
    fallbackDir,
    fallbackLen,
    startFrac,
    endFrac,
    radiusStart,
    radiusEnd,
    mat,
    radialSegments = 16,
    openEnded = false,
  } = params;

  const segVec =
    childBone && childBone.position.lengthSq() > 1e-5
      ? childBone.position.clone()
      : fallbackDir.clone().normalize().multiplyScalar(fallbackLen);

  const totalLen = segVec.length();
  const dir = segVec.clone().normalize();
  const segLen = Math.max(0.02, totalLen * Math.max(0.05, endFrac - startFrac));
  const midDist = totalLen * ((startFrac + endFrac) * 0.5);

  // CylinderGeometry: radiusTop is at +Y, radiusBottom is at -Y
  const geo = new THREE.CylinderGeometry(
    radiusEnd,
    radiusStart,
    segLen,
    radialSegments,
    1,
    openEnded
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(dir).multiplyScalar(midDist);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  return mesh;
}

function attachGroup(parent: THREE.Object3D | null, name: string): THREE.Group | null {
  if (!parent) return null;
  const g = new THREE.Group();
  g.name = name;
  g.userData[GARMENT_TAG] = true;
  parent.add(g);
  return g;
}

function addLegPants(params: {
  vrm: VRM;
  mat: THREE.Material;
  cuffMat?: THREE.Material;
  stripeMat?: THREE.Material;
  endFracLower?: number; // 0.96 = full length, 0 = shorts only
  shortsOnly?: boolean;
  looseFactor?: number;
  fwdSign: number;
}): void {
  const {
    vrm,
    mat,
    cuffMat,
    stripeMat,
    endFracLower = 0.95,
    shortsOnly = false,
    looseFactor = 1.0,
  } = params;
  const h = vrm.humanoid;
  if (!h) return;

  const sides: Array<{
    upper: VRMHumanBoneName;
    lower: VRMHumanBoneName;
    foot: VRMHumanBoneName;
    sign: number;
  }> = [
    { upper: 'leftUpperLeg', lower: 'leftLowerLeg', foot: 'leftFoot', sign: 1 },
    { upper: 'rightUpperLeg', lower: 'rightLowerLeg', foot: 'rightFoot', sign: -1 },
  ];

  for (const s of sides) {
    const up = h.getRawBoneNode(s.upper);
    const low = h.getRawBoneNode(s.lower);
    const ft = h.getRawBoneNode(s.foot);

    const upGroup = attachGroup(up, `GarmentLegUp_${s.upper}`);
    if (upGroup && up) {
      const tube = createBoneSegmentTube({
        bone: up,
        childBone: low,
        fallbackDir: new THREE.Vector3(0, -1, 0),
        fallbackLen: 0.38,
        startFrac: -0.06,
        endFrac: shortsOnly ? 0.42 : 1.04,
        radiusStart: 0.088 * looseFactor,
        radiusEnd: (shortsOnly ? 0.078 : 0.062) * looseFactor,
        mat,
      });
      upGroup.add(tube);

      if (shortsOnly && cuffMat) {
        const hem = createBoneSegmentTube({
          bone: up,
          childBone: low,
          fallbackDir: new THREE.Vector3(0, -1, 0),
          fallbackLen: 0.38,
          startFrac: 0.37,
          endFrac: 0.44,
          radiusStart: 0.081 * looseFactor,
          radiusEnd: 0.081 * looseFactor,
          mat: cuffMat,
        });
        upGroup.add(hem);
      }

      if (stripeMat && !shortsOnly) {
        const stripe = createBoneSegmentTube({
          bone: up,
          childBone: low,
          fallbackDir: new THREE.Vector3(0, -1, 0),
          fallbackLen: 0.38,
          startFrac: 0.04,
          endFrac: 0.98,
          radiusStart: 0.012,
          radiusEnd: 0.01,
          mat: stripeMat,
          radialSegments: 6,
        });
        stripe.position.x += s.sign * 0.068 * looseFactor;
        upGroup.add(stripe);
      }
    }

    if (!shortsOnly && low) {
      const lowGroup = attachGroup(low, `GarmentLegLow_${s.lower}`);
      if (lowGroup) {
        const shin = createBoneSegmentTube({
          bone: low,
          childBone: ft,
          fallbackDir: new THREE.Vector3(0, -1, 0),
          fallbackLen: 0.38,
          startFrac: -0.05,
          endFrac: endFracLower,
          radiusStart: 0.062 * looseFactor,
          radiusEnd: 0.046 * looseFactor,
          mat,
        });
        lowGroup.add(shin);

        if (cuffMat) {
          const cuff = createBoneSegmentTube({
            bone: low,
            childBone: ft,
            fallbackDir: new THREE.Vector3(0, -1, 0),
            fallbackLen: 0.38,
            startFrac: Math.max(0.75, endFracLower - 0.1),
            endFrac: endFracLower + 0.02,
            radiusStart: 0.049 * looseFactor,
            radiusEnd: 0.046 * looseFactor,
            mat: cuffMat,
          });
          lowGroup.add(cuff);
        }
      }
    }
  }
}

function addArmSleeves(params: {
  vrm: VRM;
  mat: THREE.Material;
  cuffMat?: THREE.Material;
  mode: 'short' | 'full' | 'cap' | 'kimono' | 'gloves';
  looseFactor?: number;
}): void {
  const { vrm, mat, cuffMat, mode, looseFactor = 1.0 } = params;
  const h = vrm.humanoid;
  if (!h) return;
  const isVrm0 = vrm.meta?.metaVersion === '0';

  const sides: Array<{
    upper: VRMHumanBoneName;
    lower: VRMHumanBoneName;
    hand: VRMHumanBoneName;
    side: 1 | -1;
  }> = [
    { upper: 'leftUpperArm', lower: 'leftLowerArm', hand: 'leftHand', side: 1 },
    { upper: 'rightUpperArm', lower: 'rightLowerArm', hand: 'rightHand', side: -1 },
  ];

  for (const s of sides) {
    const up = h.getRawBoneNode(s.upper);
    const low = h.getRawBoneNode(s.lower);
    const hand = h.getRawBoneNode(s.hand);
    const fallbackX = (s.side === 1) !== isVrm0 ? 1 : -1;

    if (mode !== 'gloves' && up) {
      const upG = attachGroup(up, `GarmentArmUp_${s.upper}`);
      if (upG) {
        const endFrac = mode === 'cap' ? 0.28 : mode === 'short' ? 0.54 : 1.05;
        const tube = createBoneSegmentTube({
          bone: up,
          childBone: low,
          fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
          fallbackLen: 0.24,
          startFrac: -0.08,
          endFrac,
          radiusStart: 0.056 * looseFactor,
          radiusEnd: (mode === 'kimono' ? 0.074 : 0.048) * looseFactor,
          mat,
        });
        upG.add(tube);

        // Shoulder cap sphere to smoothly round shoulder joint
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.055 * looseFactor, 12, 10),
          mat
        );
        upG.add(cap);

        if ((mode === 'short' || mode === 'cap') && cuffMat) {
          const trim = createBoneSegmentTube({
            bone: up,
            childBone: low,
            fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
            fallbackLen: 0.24,
            startFrac: Math.max(0.18, endFrac - 0.1),
            endFrac: endFrac + 0.02,
            radiusStart: 0.051 * looseFactor,
            radiusEnd: 0.051 * looseFactor,
            mat: cuffMat,
          });
          upG.add(trim);
        }
      }
    }

    if ((mode === 'full' || mode === 'kimono' || mode === 'gloves') && low) {
      const lowG = attachGroup(low, `GarmentArmLow_${s.lower}`);
      if (lowG) {
        const tube = createBoneSegmentTube({
          bone: low,
          childBone: hand,
          fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
          fallbackLen: 0.22,
          startFrac: mode === 'gloves' ? 0.22 : -0.05,
          endFrac: mode === 'kimono' ? 0.88 : 0.96,
          radiusStart: (mode === 'gloves' ? 0.038 : 0.048) * looseFactor,
          radiusEnd: (mode === 'kimono' ? 0.095 : 0.042) * looseFactor,
          mat,
          openEnded: mode === 'kimono',
        });
        lowG.add(tube);

        if (mode === 'kimono') {
          // Iconic wide draping kimono sleeve panel hanging gracefully beneath the forearm
          const drape = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.24, 0.055),
            mat
          );
          drape.position.set(fallbackX * 0.11, -0.11, 0);
          lowG.add(drape);
        }

        if (cuffMat && mode !== 'kimono') {
          const cuff = createBoneSegmentTube({
            bone: low,
            childBone: hand,
            fallbackDir: new THREE.Vector3(fallbackX, 0, 0),
            fallbackLen: 0.22,
            startFrac: 0.84,
            endFrac: 0.99,
            radiusStart: 0.045 * looseFactor,
            radiusEnd: 0.041 * looseFactor,
            mat: cuffMat,
          });
          lowG.add(cuff);
        }
      }
    }
  }
}

function addTorsoCore(params: {
  vrm: VRM;
  topMat: THREE.Material;
  waistMat: THREE.Material;
  scaleX?: number;
  scaleZ?: number;
  coverHips?: boolean;
  hipsMat?: THREE.Material;
}): { chestGroup: THREE.Group | null; spineGroup: THREE.Group | null; hipsGroup: THREE.Group | null } {
  const {
    vrm,
    topMat,
    waistMat,
    scaleX = 1.0,
    scaleZ = 1.0,
    coverHips = true,
    hipsMat,
  } = params;
  const h = vrm.humanoid;
  if (!h) return { chestGroup: null, spineGroup: null, hipsGroup: null };

  const hips = h.getRawBoneNode('hips');
  const spine = h.getRawBoneNode('spine');
  const chest = h.getRawBoneNode('upperChest') || h.getRawBoneNode('chest') || spine;

  const hipsGroup = attachGroup(hips, 'GarmentHips');
  const spineGroup = attachGroup(spine, 'GarmentSpine');
  const chestGroup = attachGroup(chest, 'GarmentChest');

  if (chestGroup) {
    // Upper torso bodice smoothly encapsulating chest & shoulders
    const bodice = new THREE.Mesh(
      new THREE.CylinderGeometry(0.126 * scaleX, 0.108 * scaleX, 0.22, 20),
      topMat
    );
    bodice.scale.set(1.08, 1, 0.78 * scaleZ);
    bodice.position.set(0, 0.07, 0);
    chestGroup.add(bodice);

    // Rounded collarbone / upper-chest transition
    const yoke = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 * scaleX, 18, 12),
      topMat
    );
    yoke.scale.set(1.12, 0.56, 0.76 * scaleZ);
    yoke.position.set(0, 0.165, 0);
    chestGroup.add(yoke);
  }

  if (spineGroup) {
    const mid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.112 * scaleX, 0.118 * scaleX, 0.17, 20),
      waistMat
    );
    mid.scale.set(1.06, 1, 0.8 * scaleZ);
    mid.position.set(0, 0.04, 0);
    spineGroup.add(mid);
  }

  if (hipsGroup && coverHips) {
    // Full-coverage pelvis / hip brief shell so hiding native skirt NEVER leaves gaps
    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.122 * scaleX, 0.132 * scaleX, 0.15, 20),
      hipsMat || waistMat
    );
    pelvis.scale.set(1.08, 1, 0.86 * scaleZ);
    pelvis.position.set(0, -0.025, 0);
    hipsGroup.add(pelvis);

    const hipCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.125 * scaleX, 18, 12),
      hipsMat || waistMat
    );
    hipCap.scale.set(1.08, 0.55, 0.85 * scaleZ);
    hipCap.position.set(0, -0.075, 0);
    hipsGroup.add(hipCap);
  }

  return { chestGroup, spineGroup, hipsGroup };
}

export interface SyncGarmentParams {
  vrm: VRM | null;
  avatarRoot: THREE.Object3D;
  garmentStyle?: GarmentStyleId;
  topHex?: string;
  topAccentHex?: string;
  bottomHex?: string;
  bottomAccentHex?: string;
  accessoryHex?: string;
  topTextureDataUrl?: string | null;
  bottomTextureDataUrl?: string | null;
}

/**
 * Mounts bone-tracked 3D garment silhouettes directly onto the VRM humanoid bones so the AI
 * character can wear hoodies, sundresses, evening gowns, streetwear jackets & shorts, kimono/yukata,
 * pajamas, athleisure tees & leggings, school blazers, or trench coats — moving 100% with her body!
 */
export function syncProceduralGarmentToVrm(params: SyncGarmentParams): void {
  const {
    vrm,
    avatarRoot,
    garmentStyle = 'default',
    topHex = '#f8fafc',
    topAccentHex = '#8b5cf6',
    bottomHex = '#1e1b4b',
    bottomAccentHex = '#a78bfa',
    accessoryHex = '#f472b6',
    topTextureDataUrl = null,
    bottomTextureDataUrl = null,
  } = params;

  clearExistingGarments(avatarRoot);
  if (!vrm?.humanoid || garmentStyle === 'default') return;

  const isVrm0 = vrm.meta?.metaVersion === '0';
  const fwdSign = isVrm0 ? -1 : 1;

  const topMat = makeFabricMaterial(topHex, {
    textureDataUrl: topTextureDataUrl,
    roughness: 0.72,
    doubleSide: true,
  });
  const topAccentMat = makeFabricMaterial(topAccentHex, { roughness: 0.55, doubleSide: true });
  const bottomMat = makeFabricMaterial(bottomHex, {
    textureDataUrl: bottomTextureDataUrl,
    roughness: 0.74,
    doubleSide: true,
  });
  const bottomAccentMat = makeFabricMaterial(bottomAccentHex, { roughness: 0.58, doubleSide: true });
  const accMat = makeFabricMaterial(accessoryHex, { roughness: 0.42, metalness: 0.2 });
  const whiteMat = makeFabricMaterial('#f8fafc', { roughness: 0.65 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    roughness: 0.25,
    metalness: 0.8,
  });

  if (garmentStyle === 'cozy_hoodie_pants') {
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat,
      waistMat: topMat,
      scaleX: 1.14,
      scaleZ: 1.16,
      hipsMat: bottomMat,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.18 });
    addLegPants({ vrm, mat: bottomMat, cuffMat: bottomAccentMat, looseFactor: 1.08, fwdSign });

    if (chestGroup) {
      // Plush 3D Hood resting behind her neck & shoulders
      const hood = new THREE.Mesh(
        new THREE.TorusGeometry(0.105, 0.045, 12, 24),
        topMat
      );
      hood.rotation.x = Math.PI * 0.44;
      hood.position.set(0, 0.19, -0.055 * fwdSign);
      chestGroup.add(hood);

      // Two cute dangling hoodie drawstrings in front
      for (const sx of [-0.032, 0.032]) {
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6), whiteMat);
        string.position.set(sx, 0.11, 0.115 * fwdSign);
        const aglet = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.018, 6), accMat);
        aglet.position.set(sx, 0.04, 0.115 * fwdSign);
        chestGroup.add(string, aglet);
      }
    }
    if (spineGroup) {
      // Front kangaroo pouch pocket + ribbed hoodie hem
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.105, 0.04), topAccentMat);
      pocket.position.set(0, 0.015, 0.105 * fwdSign);
      spineGroup.add(pocket);
    }
    if (hipsGroup) {
      const hoodieHem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.148, 0.15, 0.09, 20),
        topMat
      );
      hoodieHem.scale.set(1.08, 1, 0.92);
      hoodieHem.position.set(0, 0.035, 0);
      const ribBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.146, 0.028, 20),
        topAccentMat
      );
      ribBand.scale.set(1.08, 1, 0.92);
      ribBand.position.set(0, -0.015, 0);
      hipsGroup.add(hoodieHem, ribBand);
    }
  } else if (garmentStyle === 'summer_sundress') {
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat,
      waistMat: topMat,
      scaleX: 1.0,
      scaleZ: 1.0,
      hipsMat: topMat,
    });
    // Sleeveless / cute light ruffled cap sleeves leaving her bare arms cool & airy!
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'cap', looseFactor: 0.98 });

    if (chestGroup) {
      // Delicate shoulder straps + neckline trim
      for (const sx of [-0.075, 0.075]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.085), topAccentMat);
        strap.position.set(sx, 0.185, 0);
        chestGroup.add(strap);
      }
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.008, 8, 24), topAccentMat);
      trim.rotation.x = Math.PI / 2;
      trim.scale.set(1.08, 0.76, 1);
      trim.position.set(0, 0.148, 0);
      chestGroup.add(trim);
    }
    if (spineGroup) {
      // Waist ribbon sash + cute front bow
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.034, 22), accMat);
      belt.scale.set(1.06, 1, 0.82);
      belt.position.set(0, -0.01, 0);
      const bow = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), accMat);
      bow.scale.set(1.8, 0.9, 0.7);
      bow.position.set(0, -0.01, 0.106 * fwdSign);
      spineGroup.add(belt, bow);
    }
    if (hipsGroup) {
      // Flared midi sundress skirt with decorative bottom hem!
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.132, 0.34, 0.54, 28, 1, true),
        topMat
      );
      skirt.scale.set(1.05, 1, 0.92);
      skirt.position.set(0, -0.25, 0);
      skirt.userData.garmentSkirtSway = true;

      const hem = new THREE.Mesh(
        new THREE.TorusGeometry(0.335, 0.011, 8, 32),
        topAccentMat
      );
      hem.rotation.x = Math.PI / 2;
      hem.scale.set(1.05, 0.92, 1);
      hem.position.set(0, -0.52, 0);
      hipsGroup.add(skirt, hem);
    }
  } else if (garmentStyle === 'streetwear_jacket_shorts') {
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat: whiteMat,
      waistMat: whiteMat,
      scaleX: 1.02,
      scaleZ: 1.02,
      hipsMat: bottomMat,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.12 });
    addLegPants({
      vrm,
      mat: bottomMat,
      cuffMat: bottomAccentMat,
      shortsOnly: true,
      looseFactor: 1.05,
      fwdSign,
    });

    if (chestGroup) {
      // Open-front cropped bomber/denim jacket panels + collar
      for (const sx of [-0.072, 0.072]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.24, 0.19), topMat);
        panel.position.set(sx, 0.07, -0.005 * fwdSign);
        const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.23, 0.012), goldMat);
        zip.position.set(sx * 0.25, 0.07, 0.095 * fwdSign);
        chestGroup.add(panel, zip);
      }
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 10, 22), topAccentMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.19, -0.006 * fwdSign);
      chestGroup.add(collar);
    }
    if (spineGroup) {
      // Cropped jacket waist trim
      const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.132, 0.035, 20), topAccentMat);
      trim.scale.set(1.08, 1, 0.88);
      trim.position.set(0, 0.03, 0);
      spineGroup.add(trim);
    }
    if (hipsGroup) {
      // Leather belt + gold buckle on shorts
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.134, 0.03, 22), accMat);
      belt.scale.set(1.08, 1, 0.87);
      belt.position.set(0, 0.035, 0);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.032, 0.016), goldMat);
      buckle.position.set(0, 0.035, 0.12 * fwdSign);
      hipsGroup.add(belt, buckle);
    }
  } else if (garmentStyle === 'sporty_tee_leggings') {
    const { chestGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat,
      waistMat: topMat,
      scaleX: 1.01,
      scaleZ: 1.01,
      hipsMat: bottomMat,
    });
    // Real short-sleeve athletic tee leaving bare forearms!
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'short', looseFactor: 1.02 });
    addLegPants({
      vrm,
      mat: bottomMat,
      stripeMat: bottomAccentMat,
      looseFactor: 0.96,
      fwdSign,
    });

    if (chestGroup) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.01, 8, 20), topAccentMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.195, 0);
      // Chest racing stripe
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.032, 0.015), topAccentMat);
      stripe.position.set(0, 0.09, 0.095 * fwdSign);
      chestGroup.add(collar, stripe);
    }
    if (hipsGroup) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.13, 0.038, 20), bottomAccentMat);
      band.scale.set(1.08, 1, 0.86);
      band.position.set(0, 0.03, 0);
      hipsGroup.add(band);
    }
  } else if (garmentStyle === 'kimono_yukata') {
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat,
      waistMat: topMat,
      scaleX: 1.06,
      scaleZ: 1.06,
      hipsMat: topMat,
    });
    // Iconic draping furisode kimono sleeves!
    addArmSleeves({ vrm, mat: topMat, mode: 'kimono', looseFactor: 1.15 });

    if (chestGroup) {
      // Crisp white crossed V-neck kimono collar (juban)
      for (const side of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.2, 0.018), whiteMat);
        lapel.position.set(side * 0.032, 0.12, 0.098 * fwdSign);
        lapel.rotation.z = side * 0.42;
        chestGroup.add(lapel);
      }
    }
    if (spineGroup) {
      // Wide decorative Obi sash + woven obijime cord + traditional back obi bow!
      const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.138, 0.135, 22), accMat);
      obi.scale.set(1.08, 1, 0.88);
      obi.position.set(0, 0.01, 0);
      const cord = new THREE.Mesh(new THREE.TorusGeometry(0.138, 0.008, 8, 24), goldMat);
      cord.rotation.x = Math.PI / 2;
      cord.scale.set(1.08, 0.88, 1);
      cord.position.set(0, 0.01, 0);
      const backBow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.085), accMat);
      backBow.position.set(0, 0.02, -0.145 * fwdSign);
      spineGroup.add(obi, cord, backBow);
    }
    if (hipsGroup) {
      // Graceful ankle-length kimono wrap skirt
      const robeSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.138, 0.22, 0.74, 24, 1, true),
        bottomMat
      );
      robeSkirt.scale.set(1.08, 1, 0.9);
      robeSkirt.position.set(0, -0.35, 0);
      hipsGroup.add(robeSkirt);
    }
  } else if (garmentStyle === 'evening_gown') {
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat,
      waistMat: topMat,
      scaleX: 1.0,
      scaleZ: 1.0,
      hipsMat: bottomMat,
    });
    // Elegant bare shoulders + long opera gloves on forearms!
    addArmSleeves({ vrm, mat: accMat, cuffMat: goldMat, mode: 'gloves', looseFactor: 0.98 });

    if (chestGroup) {
      // Off-shoulder sheer/velvet draped ruffle shawl
      const shawl = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.024, 10, 26), topAccentMat);
      shawl.rotation.x = Math.PI / 2;
      shawl.scale.set(1.18, 0.72, 1);
      shawl.position.set(0, 0.14, 0);
      chestGroup.add(shawl);
    }
    if (spineGroup) {
      const corsage = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.124, 0.036, 22), goldMat);
      corsage.scale.set(1.06, 1, 0.84);
      corsage.position.set(0, -0.01, 0);
      spineGroup.add(corsage);
    }
    if (hipsGroup) {
      // Sweeping layered floor-length idol ballgown!
      const outerGown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.132, 0.44, 0.82, 32, 1, true),
        bottomMat
      );
      outerGown.scale.set(1.05, 1, 0.96);
      outerGown.position.set(0, -0.39, 0);
      outerGown.userData.garmentSkirtSway = true;

      const peplum = new THREE.Mesh(
        new THREE.CylinderGeometry(0.136, 0.25, 0.22, 26, 1, true),
        topAccentMat
      );
      peplum.scale.set(1.06, 1, 0.94);
      peplum.position.set(0, -0.1, 0);
      hipsGroup.add(outerGown, peplum);
    }
  } else if (garmentStyle === 'cozy_pajamas') {
    const { chestGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat,
      waistMat: topMat,
      scaleX: 1.08,
      scaleZ: 1.08,
      hipsMat: bottomMat,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: whiteMat, mode: 'full', looseFactor: 1.1 });
    addLegPants({ vrm, mat: bottomMat, cuffMat: whiteMat, looseFactor: 1.12, fwdSign });

    if (chestGroup) {
      // Cute notched sleepwear collar + button row + chest pocket
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.014, 8, 22), whiteMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(0, 0.185, 0);
      chestGroup.add(collar);
      for (let i = 0; i < 3; i++) {
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), whiteMat);
        btn.position.set(0, 0.13 - i * 0.055, 0.106 * fwdSign);
        chestGroup.add(btn);
      }
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.014), topAccentMat);
      pocket.position.set(0.055, 0.09, 0.098 * fwdSign);
      chestGroup.add(pocket);
    }
    if (hipsGroup) {
      const shirtHem = new THREE.Mesh(new THREE.CylinderGeometry(0.138, 0.145, 0.1, 20), topMat);
      shirtHem.scale.set(1.08, 1, 0.88);
      shirtHem.position.set(0, 0.025, 0);
      hipsGroup.add(shirtHem);
    }
  } else if (garmentStyle === 'school_blazer') {
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat,
      waistMat: topMat,
      scaleX: 1.06,
      scaleZ: 1.06,
      hipsMat: bottomMat,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.05 });

    if (chestGroup) {
      // Crisp white shirt V-front + tailored blazer lapels + school ribbon tie!
      const shirtV = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.15, 4), whiteMat);
      shirtV.rotation.x = Math.PI;
      shirtV.scale.set(1, 1, 0.35);
      shirtV.position.set(0, 0.135, 0.098 * fwdSign);
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.04, 0.02), accMat);
      ribbon.position.set(0, 0.145, 0.112 * fwdSign);
      const tieTail = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.012), accMat);
      tieTail.position.set(0, 0.095, 0.11 * fwdSign);
      chestGroup.add(shirtV, ribbon, tieTail);

      for (const sx of [-0.036, 0.036]) {
        const btn = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), goldMat);
        btn.position.set(sx, 0.02, 0.104 * fwdSign);
        chestGroup.add(btn);
      }
    }
    if (spineGroup) {
      const blazerBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.135, 0.08, 20), topMat);
      blazerBottom.scale.set(1.07, 1, 0.86);
      blazerBottom.position.set(0, -0.02, 0);
      spineGroup.add(blazerBottom);
    }
    if (hipsGroup) {
      // Tailored pleated academy skirt!
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.255, 0.34, 24, 1, true),
        bottomMat
      );
      skirt.scale.set(1.06, 1, 0.9);
      skirt.position.set(0, -0.15, 0);
      skirt.userData.garmentSkirtSway = true;
      hipsGroup.add(skirt);
    }
  } else if (garmentStyle === 'trench_coat_pants') {
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat,
      waistMat: topMat,
      scaleX: 1.12,
      scaleZ: 1.12,
      hipsMat: bottomMat,
    });
    addArmSleeves({ vrm, mat: topMat, cuffMat: topAccentMat, mode: 'full', looseFactor: 1.12 });
    addLegPants({ vrm, mat: bottomMat, looseFactor: 1.0, fwdSign });

    if (chestGroup) {
      // Wide trench coat lapels + double-breasted buttons
      for (const side of [-1, 1]) {
        const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.18, 0.024), topAccentMat);
        lapel.position.set(side * 0.048, 0.12, 0.108 * fwdSign);
        lapel.rotation.z = side * 0.28;
        chestGroup.add(lapel);
        for (let b = 0; b < 3; b++) {
          const btn = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), goldMat);
          btn.position.set(side * 0.036, 0.09 - b * 0.055, 0.116 * fwdSign);
          chestGroup.add(btn);
        }
      }
    }
    if (spineGroup) {
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.138, 0.14, 0.036, 22), accMat);
      belt.scale.set(1.08, 1, 0.9);
      belt.position.set(0, -0.005, 0);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.036, 0.016), goldMat);
      buckle.position.set(0, -0.005, 0.128 * fwdSign);
      spineGroup.add(belt, buckle);
    }
    if (hipsGroup) {
      // Flowing trench coat tail wrapping back & sides (open slit in front showing her trousers!)
      const coatTail = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.145,
          0.27,
          0.52,
          24,
          1,
          true,
          fwdSign > 0 ? Math.PI * 0.18 : -Math.PI * 0.82,
          Math.PI * 1.64
        ),
        topMat
      );
      coatTail.scale.set(1.08, 1, 0.92);
      coatTail.position.set(0, -0.24, 0);
      hipsGroup.add(coatTail);
    }
  } else if (garmentStyle === 'bath_wrap') {
    // Wholesome, SFW full-coverage fluffy terry-cloth bath towel wrap (chest to mid-thigh)
    const towelMat = makeFabricMaterial(topHex || '#fce7f3', {
      roughness: 0.92,
      metalness: 0.0,
      doubleSide: true,
    });
    const trimMat = makeFabricMaterial(topAccentHex || '#f9a8d4', {
      roughness: 0.88,
      doubleSide: true,
    });
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat: towelMat,
      waistMat: towelMat,
      scaleX: 1.07,
      scaleZ: 1.07,
      hipsMat: towelMat,
    });

    if (chestGroup) {
      // Soft gathered terry elastic band across upper chest + cute tucked towel knot
      const topBand = new THREE.Mesh(
        new THREE.TorusGeometry(0.132, 0.015, 10, 26),
        trimMat
      );
      topBand.rotation.x = Math.PI / 2;
      topBand.scale.set(1.08, 0.82, 1);
      topBand.position.set(0, 0.145, 0);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), trimMat);
      knot.scale.set(1.35, 0.9, 0.75);
      knot.position.set(0.035, 0.14, 0.112 * fwdSign);
      chestGroup.add(topBand, knot);
    }
    if (spineGroup) {
      // Subtle overlapping towel wrap seam down front
      const fold = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.22, 0.02), trimMat);
      fold.position.set(0.035, 0.02, 0.105 * fwdSign);
      spineGroup.add(fold);
    }
    if (hipsGroup) {
      // Snug towel wrap skirt reaching mid-thigh with soft terry hem border
      const towelSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.138, 0.185, 0.34, 24, 1, true),
        towelMat
      );
      towelSkirt.scale.set(1.08, 1, 0.9);
      towelSkirt.position.set(0, -0.15, 0);

      const bottomStripe = new THREE.Mesh(
        new THREE.TorusGeometry(0.182, 0.01, 8, 28),
        trimMat
      );
      bottomStripe.rotation.x = Math.PI / 2;
      bottomStripe.scale.set(1.08, 0.9, 1);
      bottomStripe.position.set(0, -0.31, 0);
      hipsGroup.add(towelSkirt, bottomStripe);
    }
  } else if (garmentStyle === 'beach_swimsuit') {
    // Stylish, tasteful SFW anime one-piece resort swimsuit with halter straps & sheer beach pareo wrap!
    const swimMat = makeFabricMaterial(topHex || '#06b6d4', {
      textureDataUrl: topTextureDataUrl,
      roughness: 0.38,
      metalness: 0.08,
      doubleSide: true,
    });
    const pareoMat = new THREE.MeshStandardMaterial({
      color: bottomHex || '#fef08a',
      roughness: 0.55,
      transparent: true,
      opacity: 0.84,
      side: THREE.DoubleSide,
    });
    const { chestGroup, spineGroup, hipsGroup } = addTorsoCore({
      vrm,
      topMat: swimMat,
      waistMat: swimMat,
      scaleX: 0.99,
      scaleZ: 0.99,
      hipsMat: swimMat,
    });

    if (chestGroup) {
      // Cute resort halter / shoulder straps + front chest ruffle trim
      for (const sx of [-0.068, 0.068]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.095, 0.075), topAccentMat);
        strap.position.set(sx, 0.185, 0);
        chestGroup.add(strap);
      }
      const ruffle = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.012, 8, 26), topAccentMat);
      ruffle.rotation.x = Math.PI / 2;
      ruffle.scale.set(1.08, 0.78, 1);
      ruffle.position.set(0, 0.145, 0);
      chestGroup.add(ruffle);
    }
    if (spineGroup) {
      // Cute side-tied beach ribbon belt
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.122, 0.026, 22), accMat);
      ribbon.scale.set(1.06, 1, 0.82);
      ribbon.position.set(0, -0.02, 0);
      const sideKnot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), accMat);
      sideKnot.scale.set(1.4, 0.9, 0.8);
      sideKnot.position.set(0.115, -0.02, 0.055 * fwdSign);
      spineGroup.add(ribbon, sideKnot);
    }
    if (hipsGroup) {
      // Flowy sheer resort pareo swim-skirt wrap around hips!
      const pareo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.132, 0.24, 0.28, 26, 1, true),
        pareoMat
      );
      pareo.scale.set(1.06, 1, 0.88);
      pareo.position.set(0, -0.12, 0);
      pareo.userData.garmentSkirtSway = true;
      hipsGroup.add(pareo);
    }
  }
}

/**
 * Subtle organic fabric hem sway for procedural dresses & skirts during movement/breathing.
 */
export function updateProceduralGarmentSway(
  avatarRoot: THREE.Object3D | null,
  elapsed: number
): void {
  if (!avatarRoot) return;
  avatarRoot.traverse((obj) => {
    if (obj.userData?.garmentSkirtSway) {
      obj.rotation.z = Math.sin(elapsed * 1.65) * 0.022;
      obj.rotation.x = Math.cos(elapsed * 1.25) * 0.014;
    }
  });
}
