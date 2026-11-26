import type { AccessoryAttachTarget } from '../types/studio';

export function detectAssetFormat(
  fileName: string
): 'xwear' | 'xavatar' | 'vrm' | 'glb' | 'vroidcustomitem' {
  const lower = fileName.toLowerCase().trim();
  if (lower.endsWith('.xwear')) return 'xwear';
  if (lower.endsWith('.xavatar')) return 'xavatar';
  if (lower.endsWith('.vrm')) return 'vrm';
  if (lower.endsWith('.vroidcustomitem')) return 'vroidcustomitem';
  return 'glb';
}

export function inferAccessoryAttachTarget(fileName: string): AccessoryAttachTarget {
  const lower = fileName.toLowerCase();
  // 1. Head / Face accessories
  if (
    /glass|glasses|sunglass|spectacle|monocle|eyewear|goggle|hat|cap|beret|tiara|crown|horn|ear|headband|hairpin|ribbon|bow|pin|hair|wig|mask|blindfold|head/i.test(
      lower
    )
  ) {
    return 'head';
  }
  // 2. Neck
  if (/choker|tie|necktie|scarf|necklace|collar|neck/i.test(lower)) {
    return 'neck';
  }
  // 3. Chest / Back
  if (/wing|wings|cape|backpack|bag|badge|brooch|chest|breast/i.test(lower)) {
    return 'chest';
  }
  // 4. Hips / Waist
  if (/belt|tail|tails|waist|hip|hips/i.test(lower)) {
    return 'hips';
  }
  // 5. Hands / Held Props
  if (/shield|left_?hand/i.test(lower)) {
    return 'leftHand';
  }
  if (/mic|wand|sword|staff|umbrella|phone|cup|mug|right_?hand|hand|prop/i.test(lower)) {
    return 'rightHand';
  }
  // 6. Outfits / Clothing / Full wearable items
  if (
    /outfit|dress|costume|coat|jacket|hoodie|shirt|skirt|pants|suit|uniform|shoes|boots|swimsuit|underwear|kimono|hood|sweater/i.test(
      lower
    )
  ) {
    return 'auto_fit';
  }
  return 'head';
}

function isGlbHeader(bytes: Uint8Array, offset = 0): number | null {
  if (offset + 12 > bytes.byteLength) return null;
  if (
    bytes[offset] === 0x67 &&
    bytes[offset + 1] === 0x6c &&
    bytes[offset + 2] === 0x54 &&
    bytes[offset + 3] === 0x46
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 12);
    const version = view.getUint32(4, true);
    const totalLength = view.getUint32(8, true);
    if (version === 2 && totalLength > 20) {
      return totalLength;
    }
  }
  return null;
}

function scanForEmbeddedGlb(rawBuffer: ArrayBuffer): ArrayBuffer | null {
  const bytes = new Uint8Array(rawBuffer);
  if (bytes.byteLength < 24) return null;

  const directLen = isGlbHeader(bytes, 0);
  if (directLen !== null) {
    return directLen <= rawBuffer.byteLength ? rawBuffer.slice(0, directLen) : rawBuffer;
  }

  let bestSlice: ArrayBuffer | null = null;
  for (let i = 1; i <= bytes.byteLength - 12; i++) {
    if (
      bytes[i] === 0x67 &&
      bytes[i + 1] === 0x6c &&
      bytes[i + 2] === 0x54 &&
      bytes[i + 3] === 0x46
    ) {
      const len = isGlbHeader(bytes, i);
      if (len !== null) {
        const sliceEnd = Math.min(bytes.byteLength, i + len);
        const slice = rawBuffer.slice(i, sliceEnd);
        if (!bestSlice || slice.byteLength > bestSlice.byteLength) {
          bestSlice = slice;
        }
      }
    }
  }
  return bestSlice;
}

async function inflateDeflateRaw(compressed: Uint8Array): Promise<ArrayBuffer> {
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const stream = new Blob([copy]).stream().pipeThrough(
    new DecompressionStream('deflate-raw')
  );
  return new Response(stream).arrayBuffer();
}

async function gunzipBuffer(rawBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([rawBuffer]).stream().pipeThrough(
    new DecompressionStream('gzip')
  );
  return new Response(stream).arrayBuffer();
}

function bufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function guessImageMime(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

export interface ZipEntry {
  name: string;
  data: ArrayBuffer;
}

export async function parseZipEntries(rawBuffer: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(rawBuffer);
  const view = new DataView(rawBuffer);
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];

  // Locate End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  const minEocd = Math.max(0, bytes.byteLength - 65557);
  for (let i = bytes.byteLength - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const cdOffset = view.getUint32(eocdOffset + 16, true);
    let ptr = cdOffset;
    for (let idx = 0; idx < totalEntries && ptr + 46 <= bytes.byteLength; idx++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const method = view.getUint16(ptr + 10, true);
      const compSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localHeaderOffset = view.getUint32(ptr + 42, true);
      const rawName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
      const normName = rawName.split(/[\\/]+/).join('/');
      ptr += 46 + nameLen + extraLen + commentLen;

      if (normName.endsWith('/') || localHeaderOffset + 30 > bytes.byteLength) continue;
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;

      const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
      const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const dataEnd = dataStart + compSize;
      if (dataEnd > bytes.byteLength) continue;

      try {
        if (method === 0) {
          entries.push({ name: normName, data: rawBuffer.slice(dataStart, dataEnd) });
        } else if (method === 8) {
          const inflated = await inflateDeflateRaw(bytes.subarray(dataStart, dataEnd));
          entries.push({ name: normName, data: inflated });
        }
      } catch {
        // Skip entry on decompression error
      }
    }
    return entries;
  }

  // Fallback: walk local file headers sequentially
  let offset = 0;
  while (offset + 30 <= bytes.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const rawName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const normName = rawName.split(/[\\/]+/).join('/');
    const dataStart = offset + 30 + nameLen + extraLen;
    if ((flags & 0x08) !== 0 && compSize === 0) break;
    const dataEnd = dataStart + compSize;
    if (dataEnd > bytes.byteLength) break;

    if (!normName.endsWith('/')) {
      try {
        if (method === 0) {
          entries.push({ name: normName, data: rawBuffer.slice(dataStart, dataEnd) });
        } else if (method === 8) {
          const inflated = await inflateDeflateRaw(bytes.subarray(dataStart, dataEnd));
          entries.push({ name: normName, data: inflated });
        }
      } catch {
        // skip
      }
    }
    offset = dataEnd;
  }

  return entries;
}

// Binary layout decoder for VRoid / XWear native mesh format
interface ParsedXWearMesh {
  meshName: string;
  vertexCount: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  submeshes: Array<{ topology: number; indexCount: number; indices: Uint32Array }>;
}

function parseXWearBinaryMesh(meshBuf: ArrayBuffer): ParsedXWearMesh {
  const bytes = new Uint8Array(meshBuf);
  const view = new DataView(meshBuf);
  let offset = 0;

  // Header: version (4B uint32), nameLen (1B), name, vertexCount (4B uint32)
  offset += 4;
  const nameLen = bytes[offset++];
  const meshName = new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + nameLen));
  offset += nameLen;
  const vertexCount = view.getUint32(offset, true);
  offset += 4;

  // Positions (float32 x 3)
  const posCount = view.getUint32(offset, true);
  offset += 4;
  const positions = new Float32Array(posCount * 3);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < posCount; i++) {
    // Coordinate conversion from Unity (Left-Handed) to glTF 2.0 (Right-Handed): invert X
    const x = -view.getFloat32(offset, true);
    const y = view.getFloat32(offset + 4, true);
    const z = view.getFloat32(offset + 8, true);
    offset += 12;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // Normals (float32 x 3)
  const normCount = view.getUint32(offset, true);
  offset += 4;
  const normals = new Float32Array(normCount * 3);
  for (let i = 0; i < normCount; i++) {
    normals[i * 3] = -view.getFloat32(offset, true);
    normals[i * 3 + 1] = view.getFloat32(offset + 4, true);
    normals[i * 3 + 2] = view.getFloat32(offset + 8, true);
    offset += 12;
  }

  // Tangents (float32 x 4) — skip
  const tangCount = view.getUint32(offset, true);
  offset += 4 + tangCount * 16;

  // UV0 (float32 x 2)
  offset += 4; // UV tag
  const uvCount = view.getUint32(offset, true);
  offset += 4;
  const uvs = new Float32Array(uvCount * 2);
  for (let i = 0; i < uvCount; i++) {
    uvs[i * 2] = view.getFloat32(offset, true);
    uvs[i * 2 + 1] = 1.0 - view.getFloat32(offset + 4, true); // Flip V for glTF UV space
    offset += 8;
  }

  // UV1..UV3
  for (let u = 1; u <= 3; u++) {
    const uCount = view.getUint32(offset, true);
    offset += 4 + uCount * 8;
  }

  // Bone weights (32 bytes per vertex)
  const bwCount = view.getUint32(offset, true);
  offset += 4 + bwCount * 32;

  // Bind poses (64 bytes per matrix)
  const bpCount = view.getUint32(offset, true);
  offset += 4 + bpCount * 64;

  // Submeshes
  const submeshCount = view.getUint32(offset, true);
  offset += 4;
  const submeshes: Array<{ topology: number; indexCount: number; indices: Uint32Array }> = [];

  for (let s = 0; s < submeshCount; s++) {
    const topology = view.getUint32(offset, true);
    offset += 4;
    const indexCount = view.getUint32(offset, true);
    offset += 4;
    const indices = new Uint32Array(indexCount);
    // Winding order inverted because X was negated (mirroring)
    for (let i = 0; i < indexCount; i += 3) {
      indices[i] = view.getUint32(offset + i * 4, true);
      indices[i + 1] = view.getUint32(offset + (i + 2) * 4, true);
      indices[i + 2] = view.getUint32(offset + (i + 1) * 4, true);
    }
    offset += indexCount * 4;
    submeshes.push({ topology, indexCount, indices });
  }

  return {
    meshName,
    vertexCount,
    positions,
    normals,
    uvs,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    submeshes,
  };
}

/**
 * Converts native VRoid / XWear zip contents into a self-contained glTF 2.0 / GLB ArrayBuffer.
 */
function buildGlbFromXWearEntries(entries: ZipEntry[]): {
  glbBuffer: ArrayBuffer;
  thumbnailDataUrl: string | null;
  inferredTarget?: AccessoryAttachTarget;
  name?: string;
} {
  let meshData: ArrayBuffer | null = null;
  let bodyRes: Record<string, unknown> | null = null;
  let xitem: Record<string, unknown> | null = null;
  const texturesMap = new Map<string, ArrayBuffer>();

  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (lower.startsWith('mesh/') && !meshData) {
      meshData = entry.data;
    } else if (lower.startsWith('body/xresources/') && !bodyRes) {
      try {
        const text = new TextDecoder('utf-8').decode(entry.data);
        bodyRes = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // ignore json parse error
      }
    } else if (lower.endsWith('xitem.json') && !xitem) {
      try {
        const text = new TextDecoder('utf-8').decode(entry.data);
        xitem = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // ignore json parse error
      }
    } else if (lower.startsWith('textures/')) {
      const filename = entry.name.split('/').pop() || '';
      const guid = filename.replace(/\.[^.]+$/, '');
      texturesMap.set(guid, entry.data);
    }
  }

  if (!meshData) {
    throw new Error('No 3D mesh found inside XWear archive.');
  }

  const parsedMesh = parseXWearBinaryMesh(meshData);

  // Inferred attach target from XResourceAccessoryRoot.DefaultParent
  let inferredTarget: AccessoryAttachTarget | undefined;
  let itemName: string | undefined;

  if (bodyRes) {
    if (typeof bodyRes.Name === 'string' && bodyRes.Name.trim()) {
      itemName = bodyRes.Name.trim();
    }
    if (Array.isArray(bodyRes.Components)) {
      for (const comp of bodyRes.Components) {
        if (typeof comp === 'object' && comp !== null) {
          const compRecord = comp as Record<string, unknown>;
          if (typeof compRecord.DefaultParent === 'number') {
            const dp = compRecord.DefaultParent;
            // Unity HumanoidBone enum mapping:
            // 10 = Head, 9 = Neck, 8/7 = Chest/Spine, 0 = Hips, 17 = LeftHand, 18 = RightHand
            if (dp === 10) inferredTarget = 'head';
            else if (dp === 9) inferredTarget = 'neck';
            else if (dp === 7 || dp === 8) inferredTarget = 'chest';
            else if (dp === 0) inferredTarget = 'hips';
            else if (dp === 17) inferredTarget = 'leftHand';
            else if (dp === 18) inferredTarget = 'rightHand';
          }
        }
      }
    }
  }

  // Thumbnail from textures if available
  let thumbnailDataUrl: string | null = null;
  const firstTexture = texturesMap.values().next().value as ArrayBuffer | undefined;
  if (firstTexture && firstTexture.byteLength > 0 && firstTexture.byteLength < 5 * 1024 * 1024) {
    thumbnailDataUrl = bufferToDataUrl(firstTexture, 'image/png');
  }

  // Material references
  const matGuidList: string[] = [];
  if (bodyRes && Array.isArray(bodyRes.Components)) {
    for (const comp of bodyRes.Components) {
      const c = comp as Record<string, unknown>;
      if (Array.isArray(c.RefMaterialGuids) && c.RefMaterialGuids.length > 0) {
        matGuidList.push(...(c.RefMaterialGuids as string[]));
        break;
      }
    }
  }

  const materialsMeta: Array<Record<string, unknown> | null> = [];
  if (xitem && Array.isArray(xitem.XResourceMaterials)) {
    for (const guid of matGuidList) {
      const found = (xitem.XResourceMaterials as Array<Record<string, unknown>>).find(
        (m) => m.Guid === guid
      );
      materialsMeta.push(found || null);
    }
  }

  // Build binary chunk views
  const binChunks: Uint8Array[] = [];
  let currentOffset = 0;
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];

  function addBufferData(
    typedArray: Float32Array | Uint32Array | Uint8Array,
    target?: number
  ): number {
    const uint8 =
      typedArray instanceof Uint8Array
        ? typedArray
        : new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);

    const pad = (4 - (currentOffset % 4)) % 4;
    if (pad > 0) {
      binChunks.push(new Uint8Array(pad));
      currentOffset += pad;
    }

    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: uint8.byteLength,
      ...(target ? { target } : {}),
    });

    binChunks.push(uint8);
    currentOffset += uint8.byteLength;
    return viewIndex;
  }

  // Positions view & accessor
  const posView = addBufferData(parsedMesh.positions, 34962 /* ARRAY_BUFFER */);
  const posAccessor = accessors.length;
  accessors.push({
    bufferView: posView,
    byteOffset: 0,
    componentType: 5126, // FLOAT
    count: parsedMesh.vertexCount,
    type: 'VEC3',
    max: parsedMesh.bounds.max,
    min: parsedMesh.bounds.min,
  });

  // Normals view & accessor
  const normView = addBufferData(parsedMesh.normals, 34962);
  const normAccessor = accessors.length;
  accessors.push({
    bufferView: normView,
    byteOffset: 0,
    componentType: 5126,
    count: parsedMesh.vertexCount,
    type: 'VEC3',
  });

  // UV view & accessor
  const uvView = addBufferData(parsedMesh.uvs, 34962);
  const uvAccessor = accessors.length;
  accessors.push({
    bufferView: uvView,
    byteOffset: 0,
    componentType: 5126,
    count: parsedMesh.vertexCount,
    type: 'VEC2',
  });

  // Indices views & accessors for each submesh
  const submeshAccessors: number[] = [];
  for (const sm of parsedMesh.submeshes) {
    const idxView = addBufferData(sm.indices, 34963 /* ELEMENT_ARRAY_BUFFER */);
    const accIdx = accessors.length;
    accessors.push({
      bufferView: idxView,
      byteOffset: 0,
      componentType: 5125, // UNSIGNED_INT
      count: sm.indexCount,
      type: 'SCALAR',
    });
    submeshAccessors.push(accIdx);
  }

  // Textures and images
  const images: Array<Record<string, unknown>> = [];
  const textures: Array<Record<string, unknown>> = [];
  const textureGuidToIndex = new Map<string, number>();

  for (const [guid, texData] of texturesMap.entries()) {
    const imgView = addBufferData(new Uint8Array(texData));
    const imgIndex = images.length;
    images.push({
      bufferView: imgView,
      mimeType: 'image/png',
    });
    const texIndex = textures.length;
    textures.push({
      sampler: 0,
      source: imgIndex,
    });
    textureGuidToIndex.set(guid, texIndex);
  }

  // Materials
  const gltfMaterials: Array<Record<string, unknown>> = [];
  for (let s = 0; s < parsedMesh.submeshes.length; s++) {
    const meta = materialsMeta[s];
    const mat: Record<string, unknown> = {
      name: (meta?.Name as string) || `Material_${s}`,
      pbrMetallicRoughness: {
        metallicFactor: 0.05,
        roughnessFactor: 0.65,
      },
      doubleSided: true,
    };

    if (meta && Array.isArray(meta.ShaderProperties)) {
      const props = meta.ShaderProperties as Array<Record<string, unknown>>;
      const colorProp = props.find((p) => p.PropertyName === '_Color');
      if (colorProp && typeof colorProp.Color === 'object' && colorProp.Color !== null) {
        const col = colorProp.Color as { r: number; g: number; b: number; a: number };
        (mat.pbrMetallicRoughness as Record<string, unknown>).baseColorFactor = [
          col.r,
          col.g,
          col.b,
          col.a,
        ];
        if (col.a < 0.98) {
          mat.alphaMode = 'BLEND';
        }
      }

      const texProp = props.find((p) => p.PropertyName === '_MainTex');
      if (texProp && typeof texProp.TextureGuid === 'string') {
        const texIndex = textureGuidToIndex.get(texProp.TextureGuid);
        if (texIndex !== undefined) {
          (mat.pbrMetallicRoughness as Record<string, unknown>).baseColorTexture = {
            index: texIndex,
          };
        }
      }
    }

    gltfMaterials.push(mat);
  }

  // Primitives
  const primitives = parsedMesh.submeshes.map((_, s) => ({
    attributes: {
      POSITION: posAccessor,
      NORMAL: normAccessor,
      TEXCOORD_0: uvAccessor,
    },
    indices: submeshAccessors[s],
    material: s < gltfMaterials.length ? s : 0,
  }));

  const gltfJson = {
    asset: { version: '2.0', generator: 'Zeta-XWear-Native-Converter' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0] }],
    nodes: [{ name: parsedMesh.meshName || 'Accessory', mesh: 0 }],
    meshes: [{ name: parsedMesh.meshName || 'AccessoryMesh', primitives }],
    materials:
      gltfMaterials.length > 0
        ? gltfMaterials
        : [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    ...(textures.length > 0
      ? {
          textures,
          images,
          samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
        }
      : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: currentOffset }],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonBuf = new TextEncoder().encode(jsonStr);
  const jsonPadding = (4 - (jsonBuf.byteLength % 4)) % 4;
  const jsonChunkLen = jsonBuf.byteLength + jsonPadding;

  let totalBinLen = 0;
  for (const c of binChunks) totalBinLen += c.byteLength;
  const binPadding = (4 - (totalBinLen % 4)) % 4;
  const binChunkLen = totalBinLen + binPadding;

  const totalLength = 12 + (8 + jsonChunkLen) + (8 + binChunkLen);
  const glbBytes = new Uint8Array(totalLength);
  const glbView = new DataView(glbBytes.buffer);

  // GLB Header
  glbView.setUint32(0, 0x46546c67, true); // "glTF"
  glbView.setUint32(4, 2, true);          // version 2
  glbView.setUint32(8, totalLength, true);

  // JSON Chunk
  let ptr = 12;
  glbView.setUint32(ptr, jsonChunkLen, true);
  ptr += 4;
  glbView.setUint32(ptr, 0x4e4f534a, true); // "JSON"
  ptr += 4;
  glbBytes.set(jsonBuf, ptr);
  ptr += jsonBuf.byteLength;
  for (let p = 0; p < jsonPadding; p++) {
    glbBytes[ptr++] = 0x20; // Space padding
  }

  // BIN Chunk
  glbView.setUint32(ptr, binChunkLen, true);
  ptr += 4;
  glbView.setUint32(ptr, 0x004e4942, true); // "BIN\0"
  ptr += 4;
  for (const c of binChunks) {
    glbBytes.set(c, ptr);
    ptr += c.byteLength;
  }
  for (let p = 0; p < binPadding; p++) {
    glbBytes[ptr++] = 0x00; // Zero padding
  }

  return {
    glbBuffer: glbBytes.buffer,
    thumbnailDataUrl,
    inferredTarget,
    name: itemName,
  };
}

export interface ExtractedAssetResult {
  glbBuffer: ArrayBuffer;
  thumbnailDataUrl: string | null;
  inferredTarget?: AccessoryAttachTarget;
  name?: string;
  isTextureMod?: boolean;
  vroidMetadata?: {
    name: string;
    category: string;
    primaryTextureBuffer: ArrayBuffer;
    primaryTextureMime: string;
    primaryTextureDataUrl: string;
    allTextures: Array<{ name: string; buffer: ArrayBuffer; dataUrl: string }>;
  };
}

/**
 * Generates a valid, self-contained glTF 2.0 / GLB ArrayBuffer displaying
 * a garment / wearable costume card textured with the provided texture image.
 */
export function buildCostumeGlbFromTexture(
  textureBuffer: ArrayBuffer,
  mimeType = 'image/png',
  itemName = 'VRoidCustomItem'
): ArrayBuffer {
  // Degenerate zero-size anchor vertices (prevents rendering flat billboard rectangles in the 3D scene)
  const positions = new Float32Array([
    0.0, 0.0, 0.0,
    0.0, 0.0, 0.0,
    0.0, 0.0, 0.0,
    0.0, 0.0, 0.0,
  ]);
  const normals = new Float32Array([
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
  ]);
  const uvs = new Float32Array([
    0.0, 1.0,
    1.0, 1.0,
    0.0, 0.0,
    1.0, 0.0,
  ]);
  const indices = new Uint16Array([
    0, 1, 2,
    2, 1, 3,
  ]);

  const binChunks: Uint8Array[] = [];
  let currentOffset = 0;
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];

  function addData(arr: Float32Array | Uint16Array | Uint8Array, target?: number): number {
    const uint8 =
      arr instanceof Uint8Array
        ? arr
        : new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (currentOffset % 4)) % 4;
    if (pad > 0) {
      binChunks.push(new Uint8Array(pad));
      currentOffset += pad;
    }
    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: uint8.byteLength,
      ...(target ? { target } : {}),
    });
    binChunks.push(uint8);
    currentOffset += uint8.byteLength;
    return viewIndex;
  }

  // 1. Positions
  const posView = addData(positions, 34962);
  const posAccessor = accessors.length;
  accessors.push({
    bufferView: posView,
    byteOffset: 0,
    componentType: 5126, // FLOAT
    count: 4,
    type: 'VEC3',
    max: [0.0, 0.0, 0.0],
    min: [0.0, 0.0, 0.0],
  });

  // 2. Normals
  const normView = addData(normals, 34962);
  const normAccessor = accessors.length;
  accessors.push({
    bufferView: normView,
    byteOffset: 0,
    componentType: 5126,
    count: 4,
    type: 'VEC3',
  });

  // 3. UVs
  const uvView = addData(uvs, 34962);
  const uvAccessor = accessors.length;
  accessors.push({
    bufferView: uvView,
    byteOffset: 0,
    componentType: 5126,
    count: 4,
    type: 'VEC2',
  });

  // 4. Indices
  const idxView = addData(indices, 34963);
  const idxAccessor = accessors.length;
  accessors.push({
    bufferView: idxView,
    byteOffset: 0,
    componentType: 5123, // UNSIGNED_SHORT
    count: 6,
    type: 'SCALAR',
  });

  // 5. Image texture data
  const imgView = addData(new Uint8Array(textureBuffer));

  const gltfJson = {
    asset: { version: '2.0', generator: 'Zeta-VRoid-Custom-Item-Converter' },
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0] }],
    nodes: [{ name: itemName, mesh: 0 }],
    meshes: [
      {
        name: `${itemName}_Mesh`,
        primitives: [
          {
            attributes: {
              POSITION: posAccessor,
              NORMAL: normAccessor,
              TEXCOORD_0: uvAccessor,
            },
            indices: idxAccessor,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: `${itemName}_Material`,
        pbrMetallicRoughness: {
          metallicFactor: 0.05,
          roughnessFactor: 0.8,
          baseColorTexture: { index: 0 },
        },
        alphaMode: 'BLEND',
        doubleSided: true,
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    images: [{ bufferView: imgView, mimeType }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: currentOffset }],
  };

  const jsonStr = JSON.stringify(gltfJson);
  const jsonBuf = new TextEncoder().encode(jsonStr);
  const jsonPadding = (4 - (jsonBuf.byteLength % 4)) % 4;
  const jsonChunkLen = jsonBuf.byteLength + jsonPadding;

  let totalBinLen = 0;
  for (const c of binChunks) totalBinLen += c.byteLength;
  const binPadding = (4 - (totalBinLen % 4)) % 4;
  const binChunkLen = totalBinLen + binPadding;

  const totalLength = 12 + (8 + jsonChunkLen) + (8 + binChunkLen);
  const glbBytes = new Uint8Array(totalLength);
  const glbView = new DataView(glbBytes.buffer);

  // GLB Header
  glbView.setUint32(0, 0x46546c67, true); // "glTF"
  glbView.setUint32(4, 2, true);          // version 2
  glbView.setUint32(8, totalLength, true);

  // JSON Chunk
  let ptr = 12;
  glbView.setUint32(ptr, jsonChunkLen, true);
  ptr += 4;
  glbView.setUint32(ptr, 0x4e4f534a, true); // "JSON"
  ptr += 4;
  glbBytes.set(jsonBuf, ptr);
  ptr += jsonBuf.byteLength;
  for (let p = 0; p < jsonPadding; p++) {
    glbBytes[ptr++] = 0x20;
  }

  // BIN Chunk
  glbView.setUint32(ptr, binChunkLen, true);
  ptr += 4;
  glbView.setUint32(ptr, 0x004e4942, true); // "BIN\0"
  ptr += 4;
  for (const c of binChunks) {
    glbBytes.set(c, ptr);
    ptr += c.byteLength;
  }
  for (let p = 0; p < binPadding; p++) {
    glbBytes[ptr++] = 0x00;
  }

  return glbBytes.buffer;
}

/**
 * Parses VRoid Studio Custom Item packages (.vroidcustomitem), extracting metadata,
 * textures, thumbnail, and generating a 3D wearable costume GLB.
 */
export function parseVRoidCustomItemEntries(
  entries: ZipEntry[],
  fileName: string
): ExtractedAssetResult | null {
  let itemName: string | undefined;
  let category = 'Dress';
  let thumbnailDataUrl: string | null = null;

  // 1. Check for metadata JSON
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    if (lower.endsWith('meta.json') || lower.endsWith('.json')) {
      try {
        const text = new TextDecoder('utf-8').decode(entry.data);
        const meta = JSON.parse(text) as Record<string, unknown>;
        if (typeof meta.name === 'string' && meta.name.trim()) {
          itemName = meta.name.trim();
        } else if (typeof meta.title === 'string' && meta.title.trim()) {
          itemName = meta.title.trim();
        } else if (typeof meta.displayName === 'string' && meta.displayName.trim()) {
          itemName = meta.displayName.trim();
        }

        if (typeof meta.category === 'string' && meta.category.trim()) {
          category = meta.category.trim();
        } else if (typeof meta.itemCategory === 'string' && meta.itemCategory.trim()) {
          category = meta.itemCategory.trim();
        } else if (typeof meta.customItemType === 'string' && meta.customItemType.trim()) {
          category = meta.customItemType.trim();
        }
      } catch {
        // Ignore json parse error
      }
    }
  }

  // Fallback name from file name
  if (!itemName) {
    itemName = fileName
      .replace(/\.(vroidcustomitem|xwear|xavatar|vrm|glb|zip)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  }

  // Infer category from name if not explicit
  if (category === 'Dress' || !category) {
    const lowerName = (itemName + ' ' + fileName).toLowerCase();
    if (/dress|onepiece|gown/i.test(lowerName)) category = 'Dress';
    else if (/top|shirt|jacket|hoodie|coat|sweater|t-shirt/i.test(lowerName)) category = 'Tops';
    else if (/bottom|skirt|pants|trousers|shorts/i.test(lowerName)) category = 'Bottoms';
    else if (/shoe|boots|sneaker|footwear/i.test(lowerName)) category = 'Footwear';
    else if (/hair|bangs|ahoge/i.test(lowerName)) category = 'Hair';
    else if (/glass|eyewear|goggle|hat|accessory|ribbon|bow|tie/i.test(lowerName)) category = 'Accessories';
  }

  // 2. Extract thumbnails
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    const mime = guessImageMime(lower);
    if (mime && (lower.includes('thumb') || lower.includes('preview') || lower.includes('icon'))) {
      if (entry.data.byteLength > 0 && entry.data.byteLength < 5 * 1024 * 1024) {
        thumbnailDataUrl = bufferToDataUrl(entry.data, mime);
        break;
      }
    }
  }

  // 3. Extract all image textures
  const textures: Array<{ name: string; buffer: ArrayBuffer; dataUrl: string; mime: string; size: number }> = [];
  for (const entry of entries) {
    const lower = entry.name.toLowerCase();
    const mime = guessImageMime(lower);
    if (mime && entry.data.byteLength > 64) {
      const isThumb = lower.includes('thumb') || lower.includes('preview') || lower.includes('icon');
      if (!isThumb || textures.length === 0) {
        const dataUrl = bufferToDataUrl(entry.data, mime);
        textures.push({
          name: entry.name.split('/').pop() || 'texture.png',
          buffer: entry.data,
          dataUrl,
          mime,
          size: entry.data.byteLength,
        });
      }
    }
  }

  if (textures.length === 0) {
    return null;
  }

  // Primary texture: largest PNG/image by byte size
  textures.sort((a, b) => b.size - a.size);
  const primary = textures[0];

  if (!thumbnailDataUrl) {
    thumbnailDataUrl = primary.dataUrl;
  }

  // Build compliant glTF 2.0 / GLB costume package
  const glbBuffer = buildCostumeGlbFromTexture(primary.buffer, primary.mime, itemName);

  return {
    glbBuffer,
    thumbnailDataUrl,
    inferredTarget: inferAccessoryAttachTarget(itemName),
    name: itemName,
    isTextureMod: true,
    vroidMetadata: {
      name: itemName,
      category,
      primaryTextureBuffer: primary.buffer,
      primaryTextureMime: primary.mime,
      primaryTextureDataUrl: primary.dataUrl,
      allTextures: textures.map((t) => ({ name: t.name, buffer: t.buffer, dataUrl: t.dataUrl })),
    },
  };
}

/**
 * Extracts a playable GLB/VRM ArrayBuffer (and optional embedded thumbnail/target metadata)
 * from .xwear, .xavatar, .glb, or .vrm containers.
 */
export async function extractPlayableGlbFromBuffer(
  rawBuffer: ArrayBuffer,
  fileName = 'asset'
): Promise<ExtractedAssetResult> {
  const bytes = new Uint8Array(rawBuffer);
  if (bytes.byteLength < 16) {
    throw new Error(`"${fileName}" is too small to be a valid 3D asset.`);
  }

  // 1. Direct GLB / VRM ("glTF")
  if (
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46
  ) {
    return {
      glbBuffer: rawBuffer,
      thumbnailDataUrl: null,
      inferredTarget: inferAccessoryAttachTarget(fileName),
    };
  }

  // 2. GZIP wrapper (0x1F 0x8B)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const gunzipped = await gunzipBuffer(rawBuffer);
    return extractPlayableGlbFromBuffer(gunzipped, fileName);
  }

  // 3. ZIP archive ("PK\x03\x04") — standard container for .xwear / .xavatar packages
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    const entries = await parseZipEntries(rawBuffer);

    // 3a. Check for native VRoid / XWear mesh entries
    const hasXWearMesh = entries.some((e) => e.name.toLowerCase().startsWith('mesh/'));
    if (hasXWearMesh) {
      try {
        const built = buildGlbFromXWearEntries(entries);
        return {
          glbBuffer: built.glbBuffer,
          thumbnailDataUrl: built.thumbnailDataUrl,
          inferredTarget: built.inferredTarget ?? inferAccessoryAttachTarget(fileName),
          name: built.name,
        };
      } catch (err) {
        console.warn(`[XWearParser] Native XWear build failed, falling back to embedded scan:`, err);
      }
    }

    // 3b. Search entries for embedded GLB or VRM
    let thumbnailDataUrl: string | null = null;
    let bestGlb: ArrayBuffer | null = null;

    for (const entry of entries) {
      const lowerName = entry.name.toLowerCase();
      const mime = guessImageMime(lowerName);
      if (mime && (!thumbnailDataUrl || /thumb|preview|icon/i.test(lowerName))) {
        if (entry.data.byteLength > 0 && entry.data.byteLength < 5 * 1024 * 1024) {
          thumbnailDataUrl = bufferToDataUrl(entry.data, mime);
        }
      }

      const candidate =
        lowerName.endsWith('.glb') || lowerName.endsWith('.vrm')
          ? scanForEmbeddedGlb(entry.data) ?? entry.data
          : scanForEmbeddedGlb(entry.data);

      if (candidate && (!bestGlb || candidate.byteLength > bestGlb.byteLength)) {
        bestGlb = candidate;
      }
    }

    if (bestGlb) {
      return {
        glbBuffer: bestGlb,
        thumbnailDataUrl,
        inferredTarget: inferAccessoryAttachTarget(fileName),
      };
    }

    // 3c. VRoid Studio Custom Item package (.vroidcustomitem) or Texture-based Wearable Costume
    const vroidItem = parseVRoidCustomItemEntries(entries, fileName);
    if (vroidItem) {
      return vroidItem;
    }
  }

  // 4. Raw container with embedded GLB v2 chunk
  const scanned = scanForEmbeddedGlb(rawBuffer);
  if (scanned) {
    return {
      glbBuffer: scanned,
      thumbnailDataUrl: null,
      inferredTarget: inferAccessoryAttachTarget(fileName),
    };
  }

  throw new Error(
    `Could not find a readable 3D mesh, glTF, or VRoid custom item inside "${fileName}". If this file was exported from VRoid Studio or Blender, ensure it is exported as a standard .vrm, .glb, .xwear, or .vroidcustomitem package.`
  );
}

interface GltfJsonLite {
  images?: Array<{ bufferView?: number; mimeType?: string }>;
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
}

/** Reads the first embedded image out of a GLB (used to recover textures from legacy vault entries). */
function readEmbeddedGlbImage(glb: ArrayBuffer): { buffer: ArrayBuffer; mime: string } | null {
  if (glb.byteLength < 20) return null;
  const view = new DataView(glb);
  if (view.getUint32(0, true) !== 0x46546c67) return null;
  let off = 12;
  let json: GltfJsonLite | null = null;
  let bin: Uint8Array | null = null;
  while (off + 8 <= glb.byteLength) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    const start = off + 8;
    if (start + len > glb.byteLength) break;
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, start, len))) as GltfJsonLite;
    } else if (type === 0x004e4942) {
      bin = new Uint8Array(glb, start, len);
    }
    off = start + len;
  }
  const img = json?.images?.[0];
  if (!json || !bin || !img || typeof img.bufferView !== 'number') return null;
  const bv = json.bufferViews?.[img.bufferView];
  if (!bv) return null;
  const begin = bv.byteOffset ?? 0;
  const bytes = bin.slice(begin, begin + bv.byteLength);
  return { buffer: bytes.buffer, mime: img.mimeType || 'image/png' };
}

export interface VroidTextureResult {
  buffer: ArrayBuffer;
  mime: string;
  dataUrl: string;
  category?: string;
}

/**
 * Gets the outfit texture out of a VRoid custom item, whether we are given the original
 * .vroidcustomitem package or the placeholder GLB older vault entries were saved as.
 */
export async function extractVroidTexture(
  buffer: ArrayBuffer,
  fileName: string
): Promise<VroidTextureResult | null> {
  try {
    const ex = await extractPlayableGlbFromBuffer(buffer, fileName);
    if (ex.vroidMetadata) {
      return {
        buffer: ex.vroidMetadata.primaryTextureBuffer,
        mime: ex.vroidMetadata.primaryTextureMime,
        dataUrl: ex.vroidMetadata.primaryTextureDataUrl,
        category: ex.vroidMetadata.category,
      };
    }
    const emb = readEmbeddedGlbImage(ex.glbBuffer);
    if (emb) return { ...emb, dataUrl: bufferToDataUrl(emb.buffer, emb.mime) };
  } catch (err) {
    console.warn('[XWearParser] extractVroidTexture failed:', err);
  }
  return null;
}
