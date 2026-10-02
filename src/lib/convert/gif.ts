/**
 * GIF encoding via gifenc with a single global palette (consistent colors,
 * smaller files) and 1-bit transparency for sticker alpha channels.
 */
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface RgbaFrame {
  data: Uint8ClampedArray;
}

export const GIF_TRANSPARENT_THRESHOLD = 128;

function frameHasTransparency(frame: RgbaFrame): boolean {
  const { data } = frame;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < GIF_TRANSPARENT_THRESHOLD) return true;
  }
  return false;
}

/**
 * Build a representative pixel sample across all frames so the global palette
 * covers the whole animation (avoids per-frame flicker).
 */
function samplePixels(frames: RgbaFrame[], maxPixels: number): Uint8ClampedArray {
  const total = frames.reduce((sum, f) => sum + f.data.length / 4, 0);
  const stride = Math.max(1, Math.ceil(total / maxPixels));
  const out = new Uint8ClampedArray(Math.ceil(total / stride) * 4);
  let written = 0;
  let counter = 0;
  for (const frame of frames) {
    const data = frame.data;
    for (let px = 0; px < data.length; px += 4) {
      if (counter++ % stride !== 0) continue;
      out[written] = data[px]!;
      out[written + 1] = data[px + 1]!;
      out[written + 2] = data[px + 2]!;
      out[written + 3] = data[px + 3]!;
      written += 4;
    }
  }
  return out.subarray(0, written);
}

export interface EncodeGifOptions {
  width: number;
  height: number;
  fps: number;
  /** Loop forever (default true). */
  loop?: boolean;
}

export function encodeGif(frames: RgbaFrame[], options: EncodeGifOptions): Uint8Array {
  if (frames.length === 0) throw new Error('encodeGif: no frames');
  const { width, height, fps } = options;
  const delay = Math.max(20, Math.round(1000 / fps));

  const needsAlpha = frames.some(frameHasTransparency);
  const sample = samplePixels(frames, 60000);
  const palette = quantize(sample, needsAlpha ? 255 : 256, {
    format: 'rgba4444',
    oneBitAlpha: true,
    clearAlpha: false,
  });

  let transparentIndex = -1;
  if (needsAlpha) {
    const existing = palette.findIndex((entry) => entry.length > 3 && entry[3] === 0);
    if (existing >= 0) {
      transparentIndex = existing;
    } else {
      palette.push([0, 0, 0, 0]);
      transparentIndex = palette.length - 1;
    }
  }

  const gif = GIFEncoder();
  frames.forEach((frame, i) => {
    const index = applyPalette(frame.data, palette, 'rgba4444');
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      ...(transparentIndex >= 0
        ? { transparent: true, transparentIndex }
        : {}),
      ...(i === 0 ? { repeat: options.loop === false ? -1 : 0 } : {}),
      dispose: 2,
    });
  });
  gif.finish();
  return gif.bytes();
}
