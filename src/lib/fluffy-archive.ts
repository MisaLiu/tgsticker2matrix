/**
 * FluffyChat flat zip builder.
 *
 * FluffyChat's importer (settings_emotes/import_archive_dialog.dart) walks
 * EVERY file in the archive and registers it as an emote keyed by
 * basename-without-extension — there is no manifest to consult. Therefore:
 *   - flat root-level entries only (`<shortcode>.<ext>`),
 *   - images only (a pack.json would become a junk emote),
 *   - no metadata of any kind.
 */
import { zipSync } from 'fflate';
import { extensionFor } from './sable-archive.js';

const SHORTCODE_OK = /^[a-zA-Z0-9_-]{1,100}$/;

export interface FluffyImage {
  shortcode: string;
  mime: string;
  bytes: Uint8Array;
}

export function buildFluffyZip(images: FluffyImage[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const image of images) {
    if (!SHORTCODE_OK.test(image.shortcode)) {
      throw new Error(`shortcode 不符合规范: ${image.shortcode}`);
    }
    const name = `${image.shortcode}.${extensionFor(image.mime)}`;
    if (entries[name]) throw new Error(`重复的 zip 条目: ${name}`);
    entries[name] = image.bytes;
  }
  return zipSync(entries, { level: 0 });
}
