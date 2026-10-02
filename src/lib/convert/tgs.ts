/**
 * Telegram animated stickers (.tgs): gzip-compressed Lottie JSON rendered to
 * GIF via lottie-web (canvas renderer) + gifenc, in the browser.
 */
import lottie from 'lottie-web/build/player/lottie_light_canvas.js';
import { encodeGif, type RgbaFrame } from './gif.js';

export interface ConvertedGif {
  bytes: Uint8Array;
  mime: 'image/gif';
  width: number;
  height: number;
}

export interface ConvertOptions {
  /** Output square size in pixels (default 384). */
  size?: number;
  /** Target GIF frame rate (default 20). */
  fps?: number;
}

export const DEFAULT_SIZE = 384;
export const DEFAULT_FPS = 20;
export const MAX_DURATION_SECONDS = 3.5;
export const MAX_FRAMES = 90;

/** Decompress a .tgs payload and parse the Lottie animation JSON. */
export async function parseTgs(bytes: Uint8Array): Promise<Record<string, unknown>> {
  let text: string;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } catch (cause) {
    throw new Error('TGS 解压失败（不是有效的 gzip Lottie 文件）', { cause });
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    throw new Error('TGS JSON 解析失败', { cause });
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('TGS 内容不是 Lottie 动画对象');
  }
  return data as Record<string, unknown>;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

export interface RenderedFrames {
  frames: RgbaFrame[];
  width: number;
  height: number;
  fps: number;
}

/**
 * Render a Lottie animation to RGBA frames. Returns null when the animation
 * renders blank (e.g. unsupported fonts/assets) so callers can fall back to
 * Telegram's static thumbnail.
 */
export async function renderLottieFrames(
  animationData: Record<string, unknown>,
  options: ConvertOptions = {},
): Promise<RenderedFrames | null> {
  const size = options.size ?? DEFAULT_SIZE;
  const targetFps = options.fps ?? DEFAULT_FPS;

  // Size the container to the animation's intrinsic dimensions. Without this
  // the fixed-position div shrink-wraps to the canvas's default 300×150, and
  // lottie's canvas renderer (preserveAspectRatio 'xMidYMid meet') letterboxes
  // the comp into that ~2:1 box — the downstream stretch to a square then
  // squeezes the visible content horizontally.
  const compW = typeof animationData.w === 'number' && animationData.w > 0 ? animationData.w : 512;
  const compH = typeof animationData.h === 'number' && animationData.h > 0 ? animationData.h : 512;

  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:${compW}px;height:${compH}px;pointer-events:none;`;
  document.body.appendChild(container);

  let animation: ReturnType<typeof lottie.loadAnimation> | undefined;
  try {
    // lottie mutates animationData; clone so callers can reuse the parsed JSON.
    animation = lottie.loadAnimation({
      container,
      renderer: 'canvas',
      loop: false,
      autoplay: false,
      animationData: JSON.parse(JSON.stringify(animationData)) as unknown as object,
      rendererSettings: { clearCanvas: true, progressiveLoad: true },
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Lottie 加载超时')), 8000);
      animation!.addEventListener('DOMLoaded', () => {
        clearTimeout(timer);
        resolve();
      });
      animation!.addEventListener('data_failed', () => {
        clearTimeout(timer);
        reject(new Error('Lottie 数据加载失败'));
      });
      animation!.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Lottie 渲染错误'));
      });
    });

    const frameRate = animation.frameRate > 0 ? animation.frameRate : 60;
    const duration = Math.min(animation.totalFrames / frameRate, MAX_DURATION_SECONDS);
    if (!(duration > 0)) return null;

    const frameCount = Math.max(2, Math.min(MAX_FRAMES, Math.round(duration * targetFps)));
    const actualFps = frameCount / duration;

    const source = container.querySelector('canvas');
    if (!source) return null;

    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const frames: RgbaFrame[] = [];
    for (let i = 0; i < frameCount; i++) {
      const progress = frameCount === 1 ? 0 : i / (frameCount - 1);
      const frameFloat = progress * Math.max(0, animation.totalFrames - 1);
      animation.goToAndStop(frameFloat, true);
      // Let the canvas renderer paint before we read pixels.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      ctx.clearRect(0, 0, size, size);
      const srcW = source.width;
      const srcH = source.height;
      if (srcW === 0 || srcH === 0) continue;
      // Aspect-fit (uniform scale, centered) instead of stretching to fill —
      // never distorts content regardless of the source canvas's aspect.
      const scale = Math.min(size / srcW, size / srcH);
      const drawW = Math.round(srcW * scale);
      const drawH = Math.round(srcH * scale);
      ctx.drawImage(
        source,
        0, 0, srcW, srcH,
        Math.round((size - drawW) / 2), Math.round((size - drawH) / 2),
        drawW, drawH,
      );
      frames.push({ data: ctx.getImageData(0, 0, size, size).data });
      if (i % 4 === 0) await yieldToBrowser();
    }

    if (frames.length === 0 || !hasVisiblePixels(frames)) return null;
    return { frames, width: size, height: size, fps: Math.min(actualFps, targetFps) };
  } finally {
    animation?.destroy();
    container.remove();
  }
}

/** Full pipeline: .tgs bytes → GIF bytes. Null when conversion is not possible. */
export async function tgsToGif(
  bytes: Uint8Array,
  options: ConvertOptions = {},
): Promise<ConvertedGif | null> {
  try {
    const animationData = await parseTgs(bytes);
    const rendered = await renderLottieFrames(animationData, options);
    if (!rendered) return null;
    const gif = encodeGif(rendered.frames, {
      width: rendered.width,
      height: rendered.height,
      fps: rendered.fps,
    });
    return { bytes: gif, mime: 'image/gif', width: rendered.width, height: rendered.height };
  } catch {
    return null;
  }
}
