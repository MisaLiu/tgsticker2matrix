/**
 * Matrix pack intake: upload converted assets and publish personal or room
 * image packs. Matrix protocol details stay behind MatrixPackClient; this
 * module owns the pack policy and its observable outcomes.
 */
import { mapWithConcurrency } from './telegram.js';
import {
  buildPackContent,
  contentBytes,
  EVENT_SIZE_LIMIT,
  mergePackRooms,
  mergeUserPack,
  pruneStaleSubscriptions,
  TYPE_PACK_ROOMS_STABLE,
  TYPE_PACK_ROOMS_UNSTABLE,
  TYPE_ROOM_PACK_STABLE,
  TYPE_ROOM_PACK_UNSTABLE,
  TYPE_USER_PACK,
  type PackImageEntry,
} from './pack.js';
import type { StorageLike } from './credentials.js';
import { STORAGE_KEYS } from './credentials.js';

export const PACKS_ROOM_NAME = 'Telegram Sticker Packs';
export const PACKS_ROOM_ACCOUNT_DATA = 'com.tgsticker2matrix:packs_room';

export interface MatrixPackClient {
  readonly userId: string;
  uploadMedia(blob: Blob, filename: string): Promise<string>;
  getAccountData(type: string): Promise<unknown | null>;
  setAccountData(type: string, content: unknown): Promise<void>;
  sendState(roomId: string, type: string, stateKey: string, content: unknown): Promise<void>;
  createRoom(name: string): Promise<string>;
  joinedRooms(): Promise<string[]>;
}

export interface MatrixPackAsset {
  shortcode: string;
  body: string;
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
}

export interface MatrixPackAvatar {
  bytes: Uint8Array;
  mime: string;
}

export type MatrixRoomMode = { kind: 'create' } | { kind: 'existing'; roomId: string };

export interface MatrixPackImportProgress {
  stage: 'upload' | 'write';
  current: number;
  total: number;
  detail: string;
}

export interface MatrixPackImportOptions {
  client: MatrixPackClient;
  assets: MatrixPackAsset[];
  avatar: MatrixPackAvatar | null;
  setName: string;
  setTitle: string;
  attribution: string;
  targets: { user: boolean; room: boolean };
  roomMode: MatrixRoomMode;
  storage?: StorageLike | null;
  onProgress?: (progress: MatrixPackImportProgress) => void;
}

export interface MatrixPackImportResult {
  userImported?: boolean;
  room?: { roomId: string; stateKey: string; displayName: string };
  droppedShortcodes: string[];
}

type PacksRoomDirectory = Pick<
  MatrixPackClient,
  'joinedRooms' | 'getAccountData' | 'setAccountData' | 'createRoom'
>;

function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage as StorageLike;
  } catch {
    return null;
  }
}

/** Remove subscriptions that point to rooms the account no longer joins. */
export async function pruneStalePackSubscriptions(
  client: Pick<MatrixPackClient, 'joinedRooms' | 'getAccountData' | 'setAccountData'>,
): Promise<number> {
  const joined = await client.joinedRooms();
  let total = 0;
  for (const type of [TYPE_PACK_ROOMS_STABLE, TYPE_PACK_ROOMS_UNSTABLE]) {
    const existing = await client.getAccountData(type);
    const { content, removed } = pruneStaleSubscriptions(existing, joined);
    if (removed > 0) {
      await client.setAccountData(type, content);
      total += removed;
    }
  }
  return total;
}

function readLocalPacksRoom(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(STORAGE_KEYS.packsRoom) ?? null;
  } catch {
    return null;
  }
}

function writeLocalPacksRoom(storage: StorageLike | null, roomId: string): void {
  try {
    storage?.setItem(STORAGE_KEYS.packsRoom, roomId);
  } catch {
    // The account data reference remains authoritative when local storage fails.
  }
}

/** Reuse the account's shared packs room, creating it only after absence is confirmed. */
export async function resolveOrCreatePacksRoom(
  client: PacksRoomDirectory,
  storage: StorageLike | null,
): Promise<string> {
  let joined: string[] | null = null;
  const isMember = async (roomId: string): Promise<boolean> => {
    if (joined === null) joined = await client.joinedRooms();
    return joined.includes(roomId);
  };

  const local = readLocalPacksRoom(storage);
  if (local !== null && (await isMember(local))) return local;

  const remoteData = await client.getAccountData(PACKS_ROOM_ACCOUNT_DATA);
  let remote: string | null = null;
  if (typeof remoteData === 'object' && remoteData !== null) {
    const roomId = (remoteData as { room_id?: unknown }).room_id;
    if (typeof roomId === 'string' && roomId !== '') remote = roomId;
  }
  if (remote !== null && (await isMember(remote))) {
    writeLocalPacksRoom(storage, remote);
    return remote;
  }

  const roomId = await client.createRoom(PACKS_ROOM_NAME);
  writeLocalPacksRoom(storage, roomId);
  try {
    await client.setAccountData(PACKS_ROOM_ACCOUNT_DATA, { room_id: roomId });
  } catch {
    // Local storage prevents a duplicate in this browser; account data is best effort.
  }
  return roomId;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

class UploadCache {
  private map: Record<string, string>;

  constructor(
    private readonly storage: StorageLike | null,
    private readonly storageKey: string,
  ) {
    this.map = {};
    try {
      const raw = storage?.getItem(storageKey);
      if (raw) this.map = JSON.parse(raw) as Record<string, string>;
    } catch {
      this.map = {};
    }
  }

  static forUser(storage: StorageLike | null, userId: string): UploadCache {
    return new UploadCache(storage, `tg2mx:mxc-cache:v1:${userId}`);
  }

  async lookup(bytes: Uint8Array): Promise<string | null> {
    try {
      const key = await sha256Hex(bytes);
      const mxc = this.map[key];
      return mxc !== undefined && mxc.startsWith('mxc://') ? mxc : null;
    } catch {
      return null;
    }
  }

  async store(bytes: Uint8Array, mxc: string): Promise<void> {
    try {
      const key = await sha256Hex(bytes);
      this.map[key] = mxc;
      const keys = Object.keys(this.map);
      if (keys.length > 800) {
        for (const old of keys.slice(0, keys.length - 800)) delete this.map[old];
      }
      this.storage?.setItem(this.storageKey, JSON.stringify(this.map));
    } catch {
      // Quota or crypto failures make caching best effort.
    }
  }
}

function mimeExt(mime: string): string {
  switch (mime) {
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    default:
      return 'bin';
  }
}

function stateKeyFor(setName: string): string {
  return `telegram_${setName}`;
}

function emit(
  options: MatrixPackImportOptions,
  stage: MatrixPackImportProgress['stage'],
  current: number,
  total: number,
  detail: string,
): void {
  options.onProgress?.({ stage, current, total, detail });
}

/**
 * Upload and publish all selected Matrix targets. The interface is domain
 * shaped; request paths, cache keys, dual writes, and merge policy stay here.
 */
export async function importMatrixPacks(
  options: MatrixPackImportOptions,
): Promise<MatrixPackImportResult> {
  const { client, assets, avatar } = options;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const cache = UploadCache.forUser(storage, client.userId);
  const mxcByShortcode = new Map<string, string>();
  let avatarMxc: string | null = null;
  let done = 0;
  let cacheHits = 0;
  const totalUploads = assets.length + (avatar ? 1 : 0);

  const uploadOne = async (bytes: Uint8Array, mime: string, filename: string): Promise<string> => {
    const cached = await cache.lookup(bytes);
    if (cached) {
      cacheHits += 1;
      return cached;
    }
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const mxc = await client.uploadMedia(blob, filename);
    await cache.store(bytes, mxc);
    return mxc;
  };

  const results = await mapWithConcurrency(assets, 4, async (asset) => {
    try {
      return await uploadOne(asset.bytes, asset.mime, `${asset.shortcode}.${mimeExt(asset.mime)}`);
    } finally {
      done += 1;
      emit(
        options,
        'upload',
        done,
        totalUploads,
        `${asset.shortcode}${cacheHits > 0 ? `（命中缓存 ${cacheHits}）` : ''}`,
      );
    }
  });

  const failed: string[] = [];
  results.forEach((entry, index) => {
    const asset = assets[index]!;
    if (entry.value) mxcByShortcode.set(asset.shortcode, entry.value);
    else failed.push(asset.shortcode);
  });

  if (avatar) {
    try {
      avatarMxc = await uploadOne(avatar.bytes, avatar.mime, `pack-avatar.${mimeExt(avatar.mime)}`);
    } catch {
      avatarMxc = null;
    }
    done += 1;
    emit(options, 'upload', done, totalUploads, '头像');
  }

  if (failed.length > 0 && failed.length === assets.length) {
    throw new Error('所有贴纸上传失败，请检查 homeserver 连接与配额');
  }

  const uploadedAssets = assets.filter((asset) => mxcByShortcode.has(asset.shortcode));
  const imageEntries: { shortcode: string; entry: PackImageEntry }[] = uploadedAssets.map(
    (asset) => ({
      shortcode: asset.shortcode,
      entry: {
        url: mxcByShortcode.get(asset.shortcode)!,
        ...(asset.body === '' ? {} : { body: asset.body }),
        info: {
          w: asset.width,
          h: asset.height,
          mimetype: asset.mime,
          size: asset.bytes.length,
        },
      },
    }),
  );

  const result: MatrixPackImportResult = { droppedShortcodes: [] };
  const writeTotal = (options.targets.user ? 1 : 0) + (options.targets.room ? 4 : 0);
  let writeStep = 0;
  const reportWrite = (detail: string): void => {
    writeStep += 1;
    emit(options, 'write', writeStep, Math.max(writeTotal, writeStep), detail);
  };

  if (options.targets.user) {
    const existing = await client.getAccountData(TYPE_USER_PACK);
    const existingRecord =
      typeof existing === 'object' && existing !== null ? (existing as Record<string, unknown>) : {};
    const existingPack = (existingRecord.pack ?? {}) as Record<string, unknown>;
    const hasExistingImages = typeof existingRecord.images === 'object' && existingRecord.images !== null;
    const displayName =
      typeof existingPack.display_name === 'string' && existingPack.display_name !== ''
        ? existingPack.display_name
        : options.setTitle;
    const attribution =
      typeof existingPack.attribution === 'string' && existingPack.attribution !== ''
        ? existingPack.attribution
        : options.attribution;
    const built = buildPackContent({
      meta: {
        display_name: displayName,
        attribution,
        ...(avatarMxc ? { avatar_url: avatarMxc } : {}),
        usage: ['emoticon', 'sticker'],
      },
      images: imageEntries,
    });
    result.droppedShortcodes.push(...built.dropped);

    const merged = mergeUserPack(existing, built.content);
    if (hasExistingImages && typeof existingPack.display_name === 'string') {
      (merged.pack as Record<string, unknown>).display_name = existingPack.display_name;
    }
    if (hasExistingImages && typeof existingPack.attribution === 'string') {
      (merged.pack as Record<string, unknown>).attribution = existingPack.attribution;
    }
    if (contentBytes(merged) > EVENT_SIZE_LIMIT) {
      throw new Error('个人贴纸包合并后超出 Matrix 事件 65KB 上限，请改用房间贴纸包（可容纳约 400 张）');
    }
    await client.setAccountData(TYPE_USER_PACK, merged);
    result.userImported = true;
    reportWrite('个人贴纸包 (im.ponies.user_emotes)');
  }

  if (options.targets.room) {
    const pruned = await pruneStalePackSubscriptions(client);
    if (pruned > 0) reportWrite(`已清理失效订阅 ${pruned} 处`);

    const roomId =
      options.roomMode.kind === 'existing'
        ? options.roomMode.roomId
        : await resolveOrCreatePacksRoom(client, storage);
    const stateKey = stateKeyFor(options.setName);
    const built = buildPackContent({
      meta: {
        display_name: options.setTitle,
        attribution: options.attribution,
        ...(avatarMxc ? { avatar_url: avatarMxc } : {}),
        usage: ['emoticon', 'sticker'],
      },
      images: imageEntries,
    });
    result.droppedShortcodes.push(...built.dropped);

    if (contentBytes(built.content) > EVENT_SIZE_LIMIT) {
      throw new Error('贴纸包内容超过 Matrix 事件大小上限');
    }

    await client.sendState(roomId, TYPE_ROOM_PACK_STABLE, stateKey, built.content);
    reportWrite(`房间贴纸包 (${TYPE_ROOM_PACK_STABLE})`);
    await client.sendState(roomId, TYPE_ROOM_PACK_UNSTABLE, stateKey, built.content);
    reportWrite(`房间贴纸包 (${TYPE_ROOM_PACK_UNSTABLE})`);

    for (const type of [TYPE_PACK_ROOMS_STABLE, TYPE_PACK_ROOMS_UNSTABLE]) {
      const existing = await client.getAccountData(type);
      const merged = mergePackRooms(existing, [{ roomId, stateKey }]);
      await client.setAccountData(type, merged);
      reportWrite(`全局启用 (${type})`);
    }
    result.room = { roomId, stateKey, displayName: options.setTitle };
  }

  return result;
}
