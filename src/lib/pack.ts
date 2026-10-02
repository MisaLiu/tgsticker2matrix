/**
 * MSC2545 image pack content building, size guarding and merge helpers.
 * Stable types: m.room.image_pack / m.image_pack.rooms
 * Unstable twins: im.ponies.room_emotes / im.ponies.emote_rooms
 * Personal pack (de-facto): im.ponies.user_emotes
 */

export const TYPE_USER_PACK = 'im.ponies.user_emotes';
export const TYPE_ROOM_PACK_STABLE = 'm.room.image_pack';
export const TYPE_ROOM_PACK_UNSTABLE = 'im.ponies.room_emotes';
export const TYPE_PACK_ROOMS_STABLE = 'm.image_pack.rooms';
export const TYPE_PACK_ROOMS_UNSTABLE = 'im.ponies.emote_rooms';

/** Matrix event size hard limit. */
export const EVENT_SIZE_LIMIT = 65536;
/** Stay a little under the hard limit to absorb server-side metadata. */
export const EVENT_SIZE_BUDGET = 65000;

export interface ImageInfo {
  w?: number;
  h?: number;
  mimetype?: string;
  size?: number;
}

export interface PackImageEntry {
  url: string;
  body?: string;
  info?: ImageInfo;
}

export interface PackMeta {
  display_name?: string;
  avatar_url?: string;
  attribution?: string;
  usage?: string[];
}

export interface PackContent {
  pack?: PackMeta;
  images: Record<string, PackImageEntry>;
}

const encoder = new TextEncoder();

export function contentBytes(content: unknown): number {
  return encoder.encode(JSON.stringify(content)).length;
}

export interface BuildResult {
  content: PackContent;
  /** Shortcodes that did not fit into the event size budget. */
  dropped: string[];
}

/**
 * Build pack content from image entries, dropping entries (in order) that no
 * longer fit into the 65 KB event size budget.
 */
export function buildPackContent(options: {
  meta: PackMeta;
  images: { shortcode: string; entry: PackImageEntry }[];
}): BuildResult {
  const images: Record<string, PackImageEntry> = {};
  const dropped: string[] = [];

  for (const { shortcode, entry } of options.images) {
    images[shortcode] = entry;
    const fits =
      contentBytes({ pack: options.meta, images }) <= EVENT_SIZE_BUDGET;
    if (fits) continue;
    delete images[shortcode];
    dropped.push(shortcode);
  }

  return {
    content: { pack: options.meta, images },
    dropped,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge an incoming pack into existing account-data pack content
 * (im.ponies.user_emotes). Incoming images win on shortcode collisions;
 * unrelated images and unknown keys are preserved.
 */
export function mergeUserPack(existing: unknown, incoming: PackContent): PackContent {
  const base: Record<string, unknown> = isRecord(existing) ? { ...existing } : {};
  const existingImages = isRecord(base.images) ? base.images : {};
  const existingPack = isRecord(base.pack) ? base.pack : {};
  const meta = incoming.pack ?? {};
  return {
    ...base,
    pack: {
      ...existingPack,
      ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined)),
    },
    images: { ...existingImages, ...incoming.images },
  } as PackContent;
}

export interface PackSubscription {
  roomId: string;
  stateKey: string;
}

/**
 * Merge subscriptions into m.image_pack.rooms / im.ponies.emote_rooms
 * account-data content: { rooms: { "!room": { "<stateKey>": {} } } }.
 * Tolerates malformed shapes and unknown keys.
 */
export function mergePackRooms(
  existing: unknown,
  subscriptions: PackSubscription[],
): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(existing) ? { ...existing } : {};
  const rooms: Record<string, unknown> = isRecord(base.rooms) ? { ...base.rooms } : {};

  for (const sub of subscriptions) {
    const roomEntryRaw = rooms[sub.roomId];
    const roomEntry: Record<string, unknown> = isRecord(roomEntryRaw) ? { ...roomEntryRaw } : {};
    const innerRaw = roomEntry[sub.stateKey];
    roomEntry[sub.stateKey] = isRecord(innerRaw) ? { ...innerRaw } : {};
    rooms[sub.roomId] = roomEntry;
  }

  return { ...base, rooms };
}

/**
 * Drop subscription entries that point at rooms the user is no longer a
 * member of (deleted rooms, left rooms, stale test imports). Entries for
 * joined rooms and every unknown top-level key are preserved untouched.
 * Returns the pruned content and how many room references were removed —
 * callers should skip the write when `removed === 0`.
 */
export function pruneStaleSubscriptions(
  existing: unknown,
  joinedRooms: string[],
): { content: Record<string, unknown>; removed: number } {
  if (!isRecord(existing)) return { content: existing as Record<string, unknown>, removed: 0 };
  const base: Record<string, unknown> = { ...existing };
  if (!isRecord(base.rooms)) return { content: base, removed: 0 };

  const joined = new Set(joinedRooms);
  const rooms: Record<string, unknown> = { ...base.rooms };
  let removed = 0;
  for (const roomId of Object.keys(rooms)) {
    if (joined.has(roomId)) continue;
    delete rooms[roomId];
    removed += 1;
  }
  return { content: { ...base, rooms }, removed };
}
