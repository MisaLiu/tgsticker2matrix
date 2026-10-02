/**
 * Pure helpers for the proxy: strict parameter validation and Telegram URL
 * construction. The Worker never forwards a client-supplied URL — every
 * upstream URL is built here from validated parts against a hardcoded origin.
 */

export const TELEGRAM_API_ORIGIN = 'https://api.telegram.org';

/** Bot tokens look like `123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`. */
export const TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]{30,}$/;

/** Sticker set short names: `t.me/addstickers/<name>`, case-sensitive. */
export const SET_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

/** file_id values are URL-safe base64ish strings. */
export const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,1024}$/;

/** Path segments returned by getFile (e.g. `stickers/file_51.webp`). */
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;

export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function isValidSetName(name: string): boolean {
  return SET_NAME_PATTERN.test(name);
}

export function isValidFileId(fileId: string): boolean {
  return FILE_ID_PATTERN.test(fileId);
}

/**
 * Validate a file_path returned by getFile and encode it segment by segment.
 * Rejects traversal (`..`), absolute paths and anything outside the expected
 * charset — the value comes from upstream but is still treated as untrusted.
 */
export function encodeFilePath(filePath: string): string | null {
  if (filePath === '' || filePath.startsWith('/')) return null;
  const segments = filePath.split('/');
  const encoded: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return null;
    if (!PATH_SEGMENT_PATTERN.test(segment)) return null;
    encoded.push(encodeURIComponent(segment));
  }
  return encoded.join('/');
}

export function buildStickerSetUrl(token: string, name: string): string {
  const query = new URLSearchParams({ name });
  return `${TELEGRAM_API_ORIGIN}/bot${token}/getStickerSet?${query.toString()}`;
}

export function buildGetFileUrl(token: string, fileId: string): string {
  const query = new URLSearchParams({ file_id: fileId });
  return `${TELEGRAM_API_ORIGIN}/bot${token}/getFile?${query.toString()}`;
}

export function buildFileUrl(token: string, filePath: string): string | null {
  const encoded = encodeFilePath(filePath);
  if (encoded === null) return null;
  return `${TELEGRAM_API_ORIGIN}/file/bot${token}/${encoded}`;
}
