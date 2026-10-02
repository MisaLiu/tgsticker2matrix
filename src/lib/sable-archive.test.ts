import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_VERSION,
  MANIFEST_NAME,
  avatarEntryName,
  buildSableZip,
  entryName,
  extensionFor,
  parseSableManifest,
  type ZipPack,
} from './sable-archive.js';

const samplePack: ZipPack = {
  displayName: 'Telegram Cats',
  attribution: 'Converted from Telegram t.me/addstickers/Cats',
  usage: ['emoticon', 'sticker'],
  avatar: { mime: 'image/webp', bytes: new Uint8Array([1, 2, 3]) },
  images: [
    {
      shortcode: 'joy',
      body: '😂',
      mime: 'image/webp',
      bytes: new Uint8Array([9, 9, 9]),
      width: 512,
      height: 512,
    },
    {
      shortcode: 'tada',
      body: '🎉',
      mime: 'image/gif',
      bytes: new Uint8Array([7, 7, 7, 7]),
      width: 384,
      height: 384,
    },
  ],
};

describe('extensionFor', () => {
  it('mirrors Sable Next EXTENSION_BY_MIME', () => {
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('image/gif')).toBe('gif');
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/apng')).toBe('apng');
    expect(extensionFor('IMAGE/WEBP')).toBe('webp');
    expect(extensionFor(null)).toBe('bin');
    expect(extensionFor('application/octet-stream')).toBe('bin');
  });
});

describe('entry names', () => {
  it('matches Sable Next naming', () => {
    expect(entryName(0, 'joy', 'image/webp')).toBe('images/0-joy.webp');
    expect(entryName(1, 'tada', 'image/gif')).toBe('images/1-tada.gif');
    expect(avatarEntryName(0, 'image/webp')).toBe('avatars/0.webp');
  });
});

describe('buildSableZip', () => {
  it('produces an archive Sable Next can parse', () => {
    const zip = buildSableZip(samplePack);
    const files = unzipSync(zip);

    expect(Object.keys(files).sort()).toEqual([
      'avatars/0.webp',
      'images/0-joy.webp',
      'images/0-tada.gif',
      MANIFEST_NAME,
    ]);

    const manifest = parseSableManifest(strFromU8(files[MANIFEST_NAME]!));
    expect(manifest).toHaveLength(1);
    const pack = manifest[0]!;
    expect(pack.pack.display_name).toBe('Telegram Cats');
    expect(pack.pack.avatar_file).toBe('avatars/0.webp');
    expect(pack.pack.usage).toEqual(['emoticon', 'sticker']);
    expect(pack.pack.attribution).toContain('t.me/addstickers/Cats');

    expect(pack.images.joy).toEqual({
      file: 'images/0-joy.webp',
      body: '😂',
      info: { w: 512, h: 512, mimetype: 'image/webp', size: 3 },
    });
    expect(pack.images.tada?.file).toBe('images/0-tada.gif');
    expect(pack.images.tada?.info?.mimetype).toBe('image/gif');
  });

  it('references the manifest at the archive root (Sable requires pack.json)', () => {
    const files = unzipSync(buildSableZip(samplePack));
    expect(files[MANIFEST_NAME]).toBeDefined();
    const parsed = JSON.parse(strFromU8(files[MANIFEST_NAME]!)) as { version: number };
    expect(parsed.version).toBe(ARCHIVE_VERSION);
  });

  it('omits the avatar when absent', () => {
    const files = unzipSync(buildSableZip({ ...samplePack, avatar: undefined }));
    const manifest = parseSableManifest(strFromU8(files[MANIFEST_NAME]!));
    expect(manifest[0]!.pack.avatar_file).toBeUndefined();
    expect(Object.keys(files).sort()).toEqual([
      'images/0-joy.webp',
      'images/0-tada.gif',
      MANIFEST_NAME,
    ]);
  });

  it('writes no identity fields when displayName/attribution are absent (de-identified export)', () => {
    const zip = buildSableZip({ ...samplePack, displayName: undefined, attribution: undefined });
    const files = unzipSync(zip);
    const raw = JSON.parse(strFromU8(files[MANIFEST_NAME]!)) as {
      packs: { pack: Record<string, unknown> }[];
    };
    expect(raw.packs[0]!.pack).not.toHaveProperty('display_name');
    expect(raw.packs[0]!.pack).not.toHaveProperty('attribution');
    expect(raw.packs[0]!.pack.usage).toEqual(['emoticon', 'sticker']);

    const manifest = parseSableManifest(strFromU8(files[MANIFEST_NAME]!));
    expect(manifest[0]!.pack.display_name).toBeUndefined();
    expect(manifest[0]!.pack.attribution).toBeUndefined();
  });

  it('treats an empty displayName as absent as well', () => {
    const zip = buildSableZip({ ...samplePack, displayName: '' });
    const files = unzipSync(zip);
    const raw = JSON.parse(strFromU8(files[MANIFEST_NAME]!)) as {
      packs: { pack: Record<string, unknown> }[];
    };
    expect(raw.packs[0]!.pack).not.toHaveProperty('display_name');
  });

  it('rejects grammar-violating shortcodes', () => {
    expect(() =>
      buildSableZip({
        ...samplePack,
        images: [{ shortcode: 'bad code!', mime: 'image/webp', bytes: new Uint8Array(1) }],
      }),
    ).toThrow(/shortcode/);
  });
});

describe('parseSableManifest', () => {
  it('rejects wrong versions and shapes', () => {
    expect(() => parseSableManifest(JSON.stringify({ version: 2, packs: [] }))).toThrow(
      /Unsupported archive version/,
    );
    expect(() => parseSableManifest(JSON.stringify({ version: 1 }))).toThrow(/no packs/);
    expect(() => parseSableManifest('[]')).toThrow(/not an object/);
  });
});
