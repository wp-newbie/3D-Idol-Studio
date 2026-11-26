import type {
  AccessoryAttachTarget,
  CustomBackdropKind,
  VaultAccessoryMeta,
  VaultModelMeta,
  VaultVrmaMeta,
} from '../types/studio';
import {
  detectAssetFormat,
  extractPlayableGlbFromBuffer,
  inferAccessoryAttachTarget,
} from '../stage/xwearParser';

const DB_NAME = 'zeta-idol-studio-model-vault';
const DB_VERSION = 4;
const MODELS_STORE = 'models';
const TEXTURES_STORE = 'textures';
const VRMA_STORE = 'vrma_animations';
const ENV_STORE = 'stage_environments';
const ACCESSORIES_STORE = 'accessories';

export const DEFAULT_ANIME_VRM_ID = 'default-anime-vrm-v1';
const DEFAULT_VRM_SOURCES = [
  './models/default-anime.vrm',
  'https://pixiv.github.io/three-vrm/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
  'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
];

interface StoredVaultRecord extends VaultModelMeta {
  buffer: ArrayBuffer;
}

export interface StoredTextureRecord {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
  createdAt: number;
}

interface StoredVrmaRecord extends VaultVrmaMeta {
  buffer: ArrayBuffer;
}

export interface StoredEnvironmentRecord {
  id: string;
  fileName: string;
  kind: CustomBackdropKind;
  mimeType: string;
  buffer: ArrayBuffer;
  sizeBytes: number;
  createdAt: number;
}

interface StoredAccessoryRecord extends VaultAccessoryMeta {
  buffer: ArrayBuffer;
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MODELS_STORE)) {
        db.createObjectStore(MODELS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TEXTURES_STORE)) {
        db.createObjectStore(TEXTURES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(VRMA_STORE)) {
        db.createObjectStore(VRMA_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ENV_STORE)) {
        db.createObjectStore(ENV_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ACCESSORIES_STORE)) {
        db.createObjectStore(ACCESSORIES_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveModelToVault(params: {
  id?: string;
  fileName: string;
  buffer: ArrayBuffer;
  thumbnailDataUrl?: string | null;
  isDefaultSample?: boolean;
}): Promise<VaultModelMeta> {
  const format = detectAssetFormat(params.fileName);
  const extracted = await extractPlayableGlbFromBuffer(params.buffer, params.fileName);
  const id =
    params.id || `mdl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const record: StoredVaultRecord = {
    id,
    fileName: params.fileName,
    format,
    sizeBytes: extracted.glbBuffer.byteLength,
    thumbnailDataUrl: params.thumbnailDataUrl ?? extracted.thumbnailDataUrl ?? null,
    isDefaultSample: Boolean(params.isDefaultSample),
    createdAt: Date.now(),
    buffer: extracted.glbBuffer,
  };

  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MODELS_STORE, 'readwrite');
    tx.objectStore(MODELS_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  const { buffer: _buf, ...meta } = record;
  return meta;
}

export async function listVaultModels(): Promise<VaultModelMeta[]> {
  const db = await openVaultDb();
  const records = await new Promise<StoredVaultRecord[]>((resolve, reject) => {
    const tx = db.transaction(MODELS_STORE, 'readonly');
    const req = tx.objectStore(MODELS_STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredVaultRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();

  return records
    .map(({ buffer: _buf, ...meta }) => meta)
    .sort((a, b) => {
      if (Boolean(a.isDefaultSample) !== Boolean(b.isDefaultSample)) {
        return a.isDefaultSample ? 1 : -1;
      }
      return b.createdAt - a.createdAt;
    });
}

export async function getVaultModelBuffer(
  id: string
): Promise<{ meta: VaultModelMeta; buffer: ArrayBuffer } | null> {
  const db = await openVaultDb();
  const record = await new Promise<StoredVaultRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(MODELS_STORE, 'readonly');
    const req = tx.objectStore(MODELS_STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredVaultRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();

  if (!record) return null;
  const { buffer, ...meta } = record;
  return { meta, buffer };
}

export async function ensureDefaultAnimeVrm(
  onStatus?: (msg: string) => void
): Promise<{ meta: VaultModelMeta; buffer: ArrayBuffer }> {
  const existing = await getVaultModelBuffer(DEFAULT_ANIME_VRM_ID);
  if (existing && existing.buffer.byteLength > 1024) {
    return existing;
  }

  let lastError: unknown = null;
  for (const url of DEFAULT_VRM_SOURCES) {
    try {
      onStatus?.(
        url.startsWith('./')
          ? 'Loading bundled Anime .VRM avatar...'
          : 'Downloading Anime .VRM sample into IndexedDB...'
      );
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 1024) {
        throw new Error('Fetched VRM file is unexpectedly small');
      }
      const meta = await saveModelToVault({
        id: DEFAULT_ANIME_VRM_ID,
        fileName: 'VRM1_Constraint_Twist_Sample.vrm',
        buffer,
        isDefaultSample: true,
      });
      return { meta, buffer };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Unable to load default Anime VRM avatar: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

export async function resolveAvatarBufferForSlot(
  modelVaultId: string | null,
  onStatus?: (msg: string) => void
): Promise<{ meta: VaultModelMeta; buffer: ArrayBuffer }> {
  if (modelVaultId) {
    const direct = await getVaultModelBuffer(modelVaultId);
    if (direct) return direct;
  }

  const allModels = await listVaultModels();
  const userUploaded = allModels.find((m) => !m.isDefaultSample);
  if (userUploaded) {
    const userBuf = await getVaultModelBuffer(userUploaded.id);
    if (userBuf) return userBuf;
  }

  return ensureDefaultAnimeVrm(onStatus);
}

export async function updateVaultModelThumbnail(
  id: string,
  thumbnailDataUrl: string
): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MODELS_STORE, 'readwrite');
    const store = tx.objectStore(MODELS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result as StoredVaultRecord | undefined;
      if (record) {
        record.thumbnailDataUrl = thumbnailDataUrl;
        store.put(record);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function deleteVaultModel(id: string): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MODELS_STORE, 'readwrite');
    tx.objectStore(MODELS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// === Custom Clothing .PNG Texture Vault ===

export async function saveTextureToVault(params: {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}): Promise<StoredTextureRecord> {
  const record: StoredTextureRecord = {
    id: `tex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: params.fileName,
    mimeType: params.mimeType,
    dataUrl: params.dataUrl,
    sizeBytes: params.sizeBytes,
    createdAt: Date.now(),
  };

  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TEXTURES_STORE, 'readwrite');
    tx.objectStore(TEXTURES_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  return record;
}

export async function getTextureFromVault(id: string): Promise<StoredTextureRecord | null> {
  const db = await openVaultDb();
  const record = await new Promise<StoredTextureRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(TEXTURES_STORE, 'readonly');
    const req = tx.objectStore(TEXTURES_STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredTextureRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record ?? null;
}

export async function deleteTextureFromVault(id: string): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TEXTURES_STORE, 'readwrite');
    tx.objectStore(TEXTURES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// === Custom .VRMA Animation Vault ===

export async function saveVrmaToVault(params: {
  fileName: string;
  buffer: ArrayBuffer;
}): Promise<VaultVrmaMeta> {
  const name = params.fileName.replace(/\.vrma$/i, '').replace(/[_-]+/g, ' ').trim() || 'Custom Emote';
  const record: StoredVrmaRecord = {
    id: `vrma-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    fileName: params.fileName,
    sizeBytes: params.buffer.byteLength,
    createdAt: Date.now(),
    buffer: params.buffer,
  };

  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VRMA_STORE, 'readwrite');
    tx.objectStore(VRMA_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  const { buffer: _buf, ...meta } = record;
  return meta;
}

export async function listVaultVrmas(): Promise<VaultVrmaMeta[]> {
  const db = await openVaultDb();
  const records = await new Promise<StoredVrmaRecord[]>((resolve, reject) => {
    const tx = db.transaction(VRMA_STORE, 'readonly');
    const req = tx.objectStore(VRMA_STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredVrmaRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return records
    .map(({ buffer: _buf, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getVrmaBuffer(
  id: string
): Promise<{ meta: VaultVrmaMeta; buffer: ArrayBuffer } | null> {
  const db = await openVaultDb();
  const record = await new Promise<StoredVrmaRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(VRMA_STORE, 'readonly');
    const req = tx.objectStore(VRMA_STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredVrmaRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!record) return null;
  const { buffer, ...meta } = record;
  return { meta, buffer };
}

export async function deleteVaultVrma(id: string): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VRMA_STORE, 'readwrite');
    tx.objectStore(VRMA_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// === Custom Stage Environment Vault (.hdr / .png / .glb) ===

export async function saveEnvironmentToVault(params: {
  fileName: string;
  kind: CustomBackdropKind;
  mimeType: string;
  buffer: ArrayBuffer;
}): Promise<StoredEnvironmentRecord> {
  const record: StoredEnvironmentRecord = {
    id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: params.fileName,
    kind: params.kind,
    mimeType: params.mimeType,
    buffer: params.buffer,
    sizeBytes: params.buffer.byteLength,
    createdAt: Date.now(),
  };

  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ENV_STORE, 'readwrite');
    tx.objectStore(ENV_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

export async function getEnvironmentFromVault(
  id: string
): Promise<StoredEnvironmentRecord | null> {
  const db = await openVaultDb();
  const record = await new Promise<StoredEnvironmentRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(ENV_STORE, 'readonly');
    const req = tx.objectStore(ENV_STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredEnvironmentRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return record ?? null;
}

export async function saveAccessoryToVault(params: {
  fileName: string;
  name?: string;
  buffer: ArrayBuffer;
  defaultTarget?: AccessoryAttachTarget;
}): Promise<VaultAccessoryMeta> {
  const format = detectAssetFormat(params.fileName);
  const extracted = await extractPlayableGlbFromBuffer(params.buffer, params.fileName);
  const cleanName =
    params.name?.trim() ||
    extracted.name?.trim() ||
    params.fileName
      .replace(/\.(xwear|xavatar|glb|vrm|vroidcustomitem)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim() ||
    'Custom Accessory';

  const defaultTarget =
    params.defaultTarget ??
    extracted.inferredTarget ??
    inferAccessoryAttachTarget(params.fileName);

  // VRoid custom items are textures, not props: keep the original package so the texture can be
  // re-applied later (the generated placeholder GLB is only a fallback).
  const storedBuffer = format === 'vroidcustomitem' ? params.buffer : extracted.glbBuffer;

  const record: StoredAccessoryRecord = {
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    fileName: params.fileName,
    format,
    defaultTarget,
    thumbnailDataUrl: extracted.thumbnailDataUrl,
    sizeBytes: storedBuffer.byteLength,
    createdAt: Date.now(),
    buffer: storedBuffer,
  };

  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ACCESSORIES_STORE, 'readwrite');
    tx.objectStore(ACCESSORIES_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();

  const { buffer: _buf, ...meta } = record;
  return meta;
}

export async function listVaultAccessories(): Promise<VaultAccessoryMeta[]> {
  const db = await openVaultDb();
  const records = await new Promise<StoredAccessoryRecord[]>((resolve, reject) => {
    const tx = db.transaction(ACCESSORIES_STORE, 'readonly');
    const req = tx.objectStore(ACCESSORIES_STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredAccessoryRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return records
    .map(({ buffer: _buf, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAccessoryBuffer(
  id: string
): Promise<{ meta: VaultAccessoryMeta; buffer: ArrayBuffer } | null> {
  const db = await openVaultDb();
  const record = await new Promise<StoredAccessoryRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(ACCESSORIES_STORE, 'readonly');
    const req = tx.objectStore(ACCESSORIES_STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredAccessoryRecord | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  if (!record) return null;
  const { buffer, ...meta } = record;
  return { meta, buffer };
}

export async function deleteVaultAccessory(id: string): Promise<void> {
  const db = await openVaultDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ACCESSORIES_STORE, 'readwrite');
    tx.objectStore(ACCESSORIES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Dexie-compatible Vault Database helper for IndexedDB `zeta-idol-studio-model-vault`.
 */
export const vaultDB = {
  models: {
    toArray: () => listVaultModels(),
    get: (id: string) => getVaultModelBuffer(id),
    delete: (id: string) => deleteVaultModel(id),
  },
  textures: {
    get: (id: string) => getTextureFromVault(id),
    delete: (id: string) => deleteTextureFromVault(id),
  },
  vrma: {
    toArray: () => listVaultVrmas(),
    delete: (id: string) => deleteVaultVrma(id),
  },
  environments: {
    get: (id: string) => getEnvironmentFromVault(id),
  },
  accessories: {
    toArray: () => listVaultAccessories(),
    get: (id: string) => getAccessoryBuffer(id),
    delete: (id: string) => deleteVaultAccessory(id),
  },
};
