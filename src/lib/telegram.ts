/**
 * Telegram client: sticker set metadata + file downloads.
 *
 * The browser talks only to same-origin endpoints (`/sticker-set`, `/file`)
 * served by the bundled Worker, which relays to api.telegram.org — this
 * sidesteps Telegram's missing CORS headers on file downloads. The user's bot
 * token travels per request in the X-Telegram-Token header and is stored
 * nowhere server-side (relay mode).
 */

export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgSticker {
  file_id: string;
  file_unique_id: string;
  type: 'regular' | 'mask' | 'custom_emoji';
  width: number;
  height: number;
  is_animated: boolean;
  is_video: boolean;
  emoji?: string;
  thumbnail?: TgPhotoSize;
  file_size?: number;
}

export interface TgStickerSet {
  name: string;
  title: string;
  sticker_type: 'regular' | 'mask' | 'custom_emoji';
  thumbnail?: TgPhotoSize;
  stickers: TgSticker[];
}

export type StickerKind = 'static' | 'animated' | 'video';

export class TelegramError extends Error {}

const PACK_REF =
  /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me|telegram\.org)\/addstickers\/([A-Za-z0-9_]+)/i;
const BARE_NAME = /^[A-Za-z0-9_]+$/;

const TOKEN_HEADER = 'X-Telegram-Token';

/** GET a same-origin API endpoint with the bot token header. */
async function apiGet(path: string, token: string, query: URLSearchParams): Promise<Response> {
  try {
    return await fetch(`${path}?${query.toString()}`, {
      headers: { [TOKEN_HEADER]: token },
    });
  } catch {
    throw new TelegramError('无法连接服务器 API（网络错误）');
  }
}

/** Probe the bundled API's /health endpoint. Throws TelegramError on failure. */
export async function testApi(): Promise<void> {
  let response: Response;
  try {
    response = await fetch('/health');
  } catch {
    throw new TelegramError('无法连接服务器 API（网络错误）');
  }
  if (!response.ok) throw new TelegramError(`服务器返回 HTTP ${response.status}`);
  const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
  if (!body?.ok) throw new TelegramError('服务器响应异常（确认部署的是 tgsticker2matrix？）');
}

async function expectBotJson<T>(response: Response): Promise<T> {
  let body: { ok: boolean; result?: T; description?: string };
  try {
    body = await response.json();
  } catch {
    throw new TelegramError(`服务器返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  if (!body.ok || body.result === undefined) {
    throw botError(response.status, body.description);
  }
  return body.result;
}

function botError(status: number, description?: string): TelegramError {
  const desc = description ?? `HTTP ${status}`;
  if (status === 401 || desc.includes('Unauthorized')) {
    return new TelegramError('Bot token 无效，请检查后重试');
  }
  if (desc.includes('not found')) {
    return new TelegramError('贴纸包不存在，请检查名称是否正确（区分大小写）');
  }
  if (desc.startsWith('参数不合法')) return new TelegramError(desc);
  return new TelegramError(`Telegram API 错误：${desc}`);
}

/** Extract the case-sensitive sticker set name from a t.me link or bare name. */
export function parsePackRef(input: string): string {
  const trimmed = input.trim();
  const linked = trimmed.match(PACK_REF);
  if (linked?.[1]) return linked[1];
  if (BARE_NAME.test(trimmed)) return trimmed;
  throw new TelegramError('无法识别的贴纸包链接，请粘贴 https://t.me/addstickers/名称 或短名');
}

export function stickerKind(sticker: TgSticker): StickerKind {
  if (sticker.is_video) return 'video';
  if (sticker.is_animated) return 'animated';
  return 'static';
}

export async function getStickerSet(token: string, name: string): Promise<TgStickerSet> {
  const response = await apiGet('/sticker-set', token, new URLSearchParams({ name }));
  const set = await expectBotJson<TgStickerSet>(response);
  if (set.sticker_type !== 'regular') {
    throw new TelegramError(
      `暂不支持 ${set.sticker_type} 类型的贴纸包（仅支持普通贴纸包 regular）`,
    );
  }
  if (!Array.isArray(set.stickers) || set.stickers.length === 0) {
    throw new TelegramError('这个贴纸包是空的');
  }
  return set;
}

/**
 * Download a file by its file_id via the same-origin /file endpoint —
 * the Worker performs getFile + the file download itself and streams back
 * either the bytes (200) or a Telegram-shaped JSON error.
 */
export async function downloadByFileId(token: string, fileId: string): Promise<Blob> {
  const response = await apiGet('/file', token, new URLSearchParams({ file_id: fileId }));
  const contentType = response.headers.get('content-type') ?? '';
  if (response.ok && !contentType.includes('application/json')) {
    return response.blob();
  }
  const body = (await response.json().catch(() => null)) as { description?: string } | null;
  throw botError(response.status, body?.description);
}

/**
 * Run tasks with bounded concurrency. Resolves with per-item results in input
 * order; rejects never — failures are captured as `error`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<{ value?: R; error?: unknown }[]> {
  const results: { value?: R; error?: unknown }[] = Array.from(
    { length: items.length },
    () => ({}),
  );
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index]!;
      try {
        results[index] = { value: await task(item, index) };
      } catch (error) {
        results[index] = { error };
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

export interface DownloadedSticker {
  sticker: TgSticker;
  kind: StickerKind;
  /** Original file bytes: webp (static), gzip lottie (animated) or webm (video). */
  blob: Blob;
  /** Static preview image for animated/video stickers (when Telegram provides one). */
  thumb?: Blob;
}

export interface DownloadProgress {
  current: number;
  total: number;
  detail: string;
}

/**
 * Download every sticker of a set (bounded concurrency), plus static
 * thumbnails for animated/video stickers. Failures are collected, not thrown.
 */
export async function downloadStickerSet(
  token: string,
  set: TgStickerSet,
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ stickers: DownloadedSticker[]; errors: { index: number; message: string }[] }> {
  const total = set.stickers.length;
  let done = 0;

  const results = await mapWithConcurrency(set.stickers, 4, async (sticker) => {
    try {
      const blob = await downloadByFileId(token, sticker.file_id);
      const kind = stickerKind(sticker);
      let thumb: Blob | undefined;
      if (kind !== 'static' && sticker.thumbnail) {
        try {
          thumb = await downloadByFileId(token, sticker.thumbnail.file_id);
        } catch {
          thumb = undefined; // fallback unavailable; conversion failure will surface later
        }
      }
      return { sticker, kind, blob, thumb } satisfies DownloadedSticker;
    } finally {
      done += 1;
      onProgress?.({ current: done, total, detail: sticker.emoji ?? '' });
    }
  });

  const stickers: DownloadedSticker[] = [];
  const errors: { index: number; message: string }[] = [];
  results.forEach((result, index) => {
    if (result.value) stickers.push(result.value);
    else {
      const err = result.error;
      errors.push({
        index,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { stickers, errors };
}
