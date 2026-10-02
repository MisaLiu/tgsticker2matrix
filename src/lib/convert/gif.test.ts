import { describe, expect, it } from 'vitest';
import { encodeGif, type RgbaFrame } from './gif.js';

function solidFrame(size: number, rgba: [number, number, number, number]): RgbaFrame {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { data };
}

interface GifFrameInfo {
  width: number;
  height: number;
  delayMs: number;
  transparent: boolean;
}

interface GifInfo {
  header: string;
  frames: GifFrameInfo[];
  loop: number | null;
}

/** Minimal GIF structure walker: validates headers, frame count, GCE delays. */
function inspectGif(bytes: Uint8Array): GifInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = String.fromCharCode(...bytes.slice(0, 6));
  let offset = 6;
  view.getUint16(offset, true); // width
  view.getUint16(offset + 2, true); // height
  const packed = bytes[offset + 4]!;
  offset += 7;
  if (packed & 0x80) offset += 3 * 2 ** ((packed & 0x07) + 1);

  const frames: GifFrameInfo[] = [];
  let loop: number | null = null;
  let pending: { delayMs: number; transparent: boolean } | null = null;

  const skipSubBlocks = (): void => {
    for (;;) {
      const size = bytes[offset++]!;
      if (size === 0) return;
      offset += size;
    }
  };

  while (offset < bytes.length) {
    const b = bytes[offset++]!;
    if (b === 0x3b) break; // trailer
    if (b === 0x21) {
      const label = bytes[offset++]!;
      if (label === 0xf9) {
        const size = bytes[offset++]!;
        const flags = bytes[offset]!;
        const delayMs = view.getUint16(offset + 1, true) * 10;
        offset += size;
        if (bytes[offset++] !== 0) throw new Error('bad GCE terminator');
        pending = { delayMs, transparent: (flags & 0x01) !== 0 };
      } else if (label === 0xff) {
        const size = bytes[offset++]!;
        const name = String.fromCharCode(...bytes.slice(offset, offset + size - 1));
        offset += size;
        if (name.startsWith('NETSCAPE')) {
          const subSize = bytes[offset++]!;
          if (bytes[offset] === 1) loop = view.getUint16(offset + 1, true);
          offset += subSize;
        }
        skipSubBlocks();
      } else {
        skipSubBlocks();
      }
    } else if (b === 0x2c) {
      const width = view.getUint16(offset + 4, true);
      const height = view.getUint16(offset + 6, true);
      const imgPacked = bytes[offset + 8]!;
      offset += 9;
      if (imgPacked & 0x80) offset += 3 * 2 ** ((imgPacked & 0x07) + 1);
      offset += 1; // LZW minimum code size
      skipSubBlocks();
      frames.push({
        width,
        height,
        delayMs: pending?.delayMs ?? 0,
        transparent: pending?.transparent ?? false,
      });
      pending = null;
    } else {
      throw new Error(`unexpected GIF block 0x${b.toString(16)} at ${offset - 1}`);
    }
  }
  return { header, frames, loop };
}

describe('encodeGif', () => {
  it('encodes a structurally valid single-frame GIF', () => {
    const gif = encodeGif([solidFrame(8, [255, 0, 0, 255])], {
      width: 8,
      height: 8,
      fps: 10,
    });
    const info = inspectGif(gif);
    expect(info.header).toBe('GIF89a');
    expect(info.frames).toHaveLength(1);
    expect(info.frames[0]!.width).toBe(8);
    expect(info.frames[0]!.height).toBe(8);
    expect(info.frames[0]!.transparent).toBe(false);
    expect(info.loop).toBe(0); // forever
  });

  it('encodes multi-frame animations with the requested delay', () => {
    const gif = encodeGif([solidFrame(4, [255, 0, 0, 255]), solidFrame(4, [0, 0, 255, 255])], {
      width: 4,
      height: 4,
      fps: 20, // 50 ms
    });
    const info = inspectGif(gif);
    expect(info.frames).toHaveLength(2);
    expect(info.frames[0]!.delayMs).toBe(50);
    expect(info.frames[1]!.delayMs).toBe(50);
  });

  it('sets the transparency flag when frames contain alpha', () => {
    const gif = encodeGif(
      [solidFrame(4, [0, 0, 0, 0]), solidFrame(4, [0, 255, 0, 255])],
      { width: 4, height: 4, fps: 10 },
    );
    const info = inspectGif(gif);
    expect(info.frames).toHaveLength(2);
    expect(info.frames[0]!.transparent).toBe(true);
    expect(info.frames[1]!.transparent).toBe(true);
  });

  it('omits transparency for fully opaque frames', () => {
    const gif = encodeGif([solidFrame(4, [10, 20, 30, 255])], {
      width: 4,
      height: 4,
      fps: 10,
    });
    expect(inspectGif(gif).frames[0]!.transparent).toBe(false);
  });

  it('rejects empty frame lists', () => {
    expect(() => encodeGif([], { width: 4, height: 4, fps: 10 })).toThrow(/no frames/);
  });
});
