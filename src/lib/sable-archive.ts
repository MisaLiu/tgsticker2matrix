/**
 * Sable Next sticker pack archive builder.
 *
 * Format spec (from SableClient/sable-next src/lib/features/emotes/pack-archive.ts):
 *   pack.json                     { version: 1, packs: [ ... ] }
 *   images/0-<shortcode>.<ext>    image files (pack index 0 for a single pack)
 *   avatars/0.<ext>               optional pack avatar
 *
 * Import in Sable Next: 图片包编辑器 → Import .zip
 */
import { strToU8, zipSync } from 'fflate';

export const MANIFEST_NAME = 'pack.json';
export const ARCHIVE_VERSION = 1;

/** Mirrors Sable Next EXTENSION_BY_MIME. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/apng': 'apng',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

export function extensionFor(mime: string | null): string {
  return EXTENSION_BY_MIME[(mime ?? '').toLowerCase()] ?? 'bin';
}

export function entryName(packIndex: number, shortcode: string, mime: string | null): string {
  return `images/${String(packIndex)}-${shortcode}.${extensionFor(mime)}`;
}

export function avatarEntryName(packIndex: number, mime: string | null): string {
  return `avatars/${String(packIndex)}.${extensionFor(mime)}`;
}

export interface ZipImage {
  shortcode: string;
  /** Original emoji annotation, becomes the timeline `body`. */
  body?: string;
  mime: string;
  bytes: Uint8Array;
  width?: number;
  height?: number;
}

export interface ZipAvatar {
  mime: string;
  bytes: Uint8Array;
}

export interface ZipPack {
  /** Omitted from the manifest entirely when empty/undefined (no identifiers). */
  displayName?: string;
  attribution?: string;
  /** Pack-level usage, e.g. ['sticker']. */
  usage: string[];
  avatar?: ZipAvatar;
  images: ZipImage[];
}

interface ArchiveImageEntry {
  file: string;
  body?: string;
  usage?: string[];
  info?: { w?: number; h?: number; mimetype?: string; size?: number };
}

interface ArchivePack {
  pack: {
    display_name?: string;
    avatar_file?: string;
    attribution?: string;
    usage?: string[];
  };
  images: Record<string, ArchiveImageEntry>;
}

const SHORTCODE_OK = /^[a-zA-Z0-9_-]{1,100}$/;

/**
 * Build a Sable Next compatible .zip archive for a single pack.
 * Uses store (level 0) like Sable's own exporter — image bytes are already
 * compressed.
 */
export function buildSableZip(pack: ZipPack): Uint8Array {
  const packIndex = 0;
  const entries: Record<string, Uint8Array> = {};
  const images: Record<string, ArchiveImageEntry> = {};

  for (const image of pack.images) {
    if (!SHORTCODE_OK.test(image.shortcode)) {
      throw new Error(`shortcode 不符合规范: ${image.shortcode}`);
    }
    const file = entryName(packIndex, image.shortcode, image.mime);
    if (entries[file]) throw new Error(`重复的 zip 条目: ${file}`);
    entries[file] = image.bytes;
    const entry: ArchiveImageEntry = { file };
    if (image.body !== undefined && image.body !== '') entry.body = image.body;
    // Pack is sticker-only; per-image usage follows the pack (omitted).
    entry.info = {
      w: image.width,
      h: image.height,
      mimetype: image.mime,
      size: image.bytes.length,
    };
    images[image.shortcode] = entry;
  }

  const manifest: ArchivePack = {
    pack: {
      usage: pack.usage,
    },
    images,
  };
  // Only write identity fields the caller actually supplied — empty values
  // stay out of the archive entirely.
  if (pack.displayName !== undefined && pack.displayName !== '') {
    manifest.pack.display_name = pack.displayName;
  }
  if (pack.attribution !== undefined && pack.attribution !== '') {
    manifest.pack.attribution = pack.attribution;
  }
  if (pack.avatar) {
    const avatarFile = avatarEntryName(packIndex, pack.avatar.mime);
    entries[avatarFile] = pack.avatar.bytes;
    manifest.pack.avatar_file = avatarFile;
  }

  entries[MANIFEST_NAME] = strToU8(
    JSON.stringify({ version: ARCHIVE_VERSION, packs: [manifest] }, null, 2),
  );

  return zipSync(entries, { level: 0 });
}

/**
 * Parse-only validator used by tests: mirrors the constraints of Sable Next's
 * `parseManifest` (version check, packs array, per-image file requirement).
 */
export function parseSableManifest(text: string): ArchivePack[] {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The manifest is not an object');
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== ARCHIVE_VERSION) throw new Error('Unsupported archive version');
  if (!Array.isArray(record.packs)) throw new Error('The manifest lists no packs');

  return (record.packs as unknown[]).filter(
    (p): p is Record<string, unknown> => typeof p === 'object' && p !== null && !Array.isArray(p),
  ) as unknown as ArchivePack[];
}
