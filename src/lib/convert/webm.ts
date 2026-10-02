/**
 * Telegram video stickers (.webm) → GIF, via <video> seeking + canvas
 * frame extraction + gifenc.
 */
import { encodeGif, type RgbaFrame } from './gif.js';
import { DEFAULT_FPS, DEFAULT_SIZE, MAX_FRAMES, type ConvertedGif, type ConvertOptions } from './tgs.js';

const SEEK_TIMEOUT_MS = 4000;
const METADATA_TIMEOUT_MS = 6000;

function waitForEvent(target: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('视频加载失败'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`等待 ${event} 超时`));
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      target.removeEventListener('error', onError);
    };
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

function hasVisiblePixels(frames: RgbaFrame[]): boolean {
  for (const frame of frames) {
    const data = frame.data;
    for (let i = 3; i < data.length; i += 64) {
      if (data[i]! > 8) return true;
    }
  }
  return false;
}

/** Full pipeline: .webm bytes → GIF bytes. Null when conversion is not possible. */
export async function webmToGif(
  blob: Blob,
  options: ConvertOptions = {},
): Promise<ConvertedGif | null> {
  const size = options.size ?? DEFAULT_SIZE;
  const targetFps = options.fps ?? DEFAULT_FPS;
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await waitForEvent(video, 'loadedmetadata', METADATA_TIMEOUT_MS);
    const durationRaw = video.duration;
    if (!Number.isFinite(durationRaw) || durationRaw <= 0) {
      // Duration is unknown (missing metadata) — give up and let the caller
      // fall back to Telegram's static thumbnail.
      return null;
    }
    const duration = Math.min(durationRaw, 3.5);
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    if (videoW === 0 || videoH === 0) return null;

    const frameCount = Math.max(2, Math.min(MAX_FRAMES, Math.round(duration * targetFps)));
    const actualFps = frameCount / duration;

    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const frames: RgbaFrame[] = [];
    for (let i = 0; i < frameCount; i++) {
      const time = (i / frameCount) * duration;
      const seeked = waitForEvent(video, 'seeked', SEEK_TIMEOUT_MS);
      video.currentTime = Math.min(time, Math.max(0, duration - 0.001));
      try {
        await seeked;
      } catch {
        break; // keep whatever frames we already have
      }

      // Fit the video into the square canvas, preserving aspect, centered.
      ctx.clearRect(0, 0, size, size);
      const scale = Math.min(size / videoW, size / videoH);
      const drawW = Math.round(videoW * scale);
      const drawH = Math.round(videoH * scale);
      const drawX = Math.round((size - drawW) / 2);
      const drawY = Math.round((size - drawH) / 2);
      ctx.drawImage(video, drawX, drawY, drawW, drawH);
      frames.push({ data: ctx.getImageData(0, 0, size, size).data });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (frames.length < 2 || !hasVisiblePixels(frames)) return null;
    const gif = encodeGif(frames, {
      width: size,
      height: size,
      fps: Math.min(actualFps, targetFps),
    });
    return { bytes: gif, mime: 'image/gif', width: size, height: size };
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}
