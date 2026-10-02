import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildFluffyZip, type FluffyImage } from './fluffy-archive.js';

const images: FluffyImage[] = [
  { shortcode: 'testpack_joy', mime: 'image/webp', bytes: new Uint8Array([1, 2, 3]) },
  { shortcode: 'testpack_tada', mime: 'image/gif', bytes: new Uint8Array([4, 5]) },
];

describe('buildFluffyZip', () => {
  it('produces a flat archive: root-level shortcode.ext entries, images only', () => {
    const files = unzipSync(buildFluffyZip(images));
    expect(Object.keys(files).sort()).toEqual(['testpack_joy.webp', 'testpack_tada.gif']);
    // FluffyChat imports EVERY file — a manifest would become a junk emote.
    expect(files['pack.json']).toBeUndefined();
    expect(files['testpack_joy.webp']).toEqual(new Uint8Array([1, 2, 3]));
    expect(files['testpack_tada.gif']).toEqual(new Uint8Array([4, 5]));
  });

  it('rejects grammar-violating shortcodes (would break FluffyChat naming)', () => {
    expect(() =>
      buildFluffyZip([{ shortcode: 'bad code', mime: 'image/webp', bytes: new Uint8Array(1) }]),
    ).toThrow(/shortcode/);
  });

  it('rejects duplicate entry names', () => {
    expect(() =>
      buildFluffyZip([
        { shortcode: 'a', mime: 'image/webp', bytes: new Uint8Array(1) },
        { shortcode: 'a', mime: 'image/webp', bytes: new Uint8Array(2) },
      ]),
    ).toThrow(/重复/);
  });

  it('maps unknown mimetypes to .bin rather than dropping them', () => {
    const files = unzipSync(
      buildFluffyZip([{ shortcode: 'x', mime: 'application/thing', bytes: new Uint8Array(7) }]),
    );
    expect(Object.keys(files)).toEqual(['x.bin']);
  });
});
