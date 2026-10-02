import { describe, expect, it } from 'vitest';
import {
  TELEGRAM_API_ORIGIN,
  buildFileUrl,
  buildGetFileUrl,
  buildStickerSetUrl,
  encodeFilePath,
  isValidFileId,
  isValidSetName,
  isValidToken,
} from './telegram-url.js';

const VALID_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const VALID_FILE_ID = 'CAACAgIAAxkBAAIBQ2Qexample1-abc_ABC';

describe('validators', () => {
  it('accepts real-shaped bot tokens', () => {
    expect(isValidToken(VALID_TOKEN)).toBe(true);
    expect(isValidToken('5043884045:AAGO13ulyvSj85UU2Yf2XoyaPuqwyMDljY')).toBe(true);
  });

  it('rejects malformed tokens', () => {
    expect(isValidToken('')).toBe(false);
    expect(isValidToken('not-a-token')).toBe(false);
    expect(isValidToken('123:short')).toBe(false);
    expect(isValidToken(`${VALID_TOKEN}/../../evil`)).toBe(false);
    expect(isValidToken(`${VALID_TOKEN}?x=1`)).toBe(false);
    expect(isValidToken('123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw extra')).toBe(false);
  });

  it('accepts set names from t.me links', () => {
    expect(isValidSetName('Cats')).toBe(true);
    expect(isValidSetName('some_pack_123')).toBe(true);
  });

  it('rejects injection attempts in set names', () => {
    expect(isValidSetName('')).toBe(false);
    expect(isValidSetName('a b')).toBe(false);
    expect(isValidSetName('a/b')).toBe(false);
    expect(isValidSetName('bot1:x')).toBe(false);
    expect(isValidSetName('a'.repeat(65))).toBe(false);
    expect(isValidSetName('名前')).toBe(false);
  });

  it('validates file ids', () => {
    expect(isValidFileId(VALID_FILE_ID)).toBe(true);
    expect(isValidFileId('')).toBe(false);
    expect(isValidFileId('a/b')).toBe(false);
    expect(isValidFileId('a'.repeat(1025))).toBe(false);
  });
});

describe('encodeFilePath', () => {
  it('encodes normal Telegram file paths', () => {
    expect(encodeFilePath('stickers/file_51.webp')).toBe('stickers/file_51.webp');
    expect(encodeFilePath('thumbnails/file_1234.jpg')).toBe('thumbnails/file_1234.jpg');
    expect(encodeFilePath('animations/file_9.tgs')).toBe('animations/file_9.tgs');
    expect(encodeFilePath('file_123_4.mp4')).toBe('file_123_4.mp4');
  });

  it('rejects traversal and absolute paths', () => {
    expect(encodeFilePath('')).toBeNull();
    expect(encodeFilePath('/etc/passwd')).toBeNull();
    expect(encodeFilePath('../secret')).toBeNull();
    expect(encodeFilePath('a/../../b')).toBeNull();
    expect(encodeFilePath('a/./b')).toBeNull();
    expect(encodeFilePath('a//b')).toBeNull();
  });

  it('rejects out-of-charset segments', () => {
    expect(encodeFilePath('a b/c')).toBeNull();
    expect(encodeFilePath('a?b/c')).toBeNull();
    expect(encodeFilePath('a#b')).toBeNull();
  });

  it('rejects segments outside the strict charset instead of encoding them', () => {
    expect(encodeFilePath('a+b')).toBeNull();
    expect(encodeFilePath('a&b')).toBeNull();
    expect(encodeFilePath('a=b')).toBeNull();
  });
});

describe('URL builders', () => {
  it('builds getStickerSet URLs against the hardcoded origin', () => {
    const url = buildStickerSetUrl(VALID_TOKEN, 'Test_Pack');
    expect(url).toBe(
      `${TELEGRAM_API_ORIGIN}/bot${VALID_TOKEN}/getStickerSet?name=Test_Pack`,
    );
    expect(url.startsWith('https://api.telegram.org/')).toBe(true);
  });

  it('builds getFile URLs with a query-encoded file_id', () => {
    const url = buildGetFileUrl(VALID_TOKEN, 'CAAC+id/needs-encoding');
    // '+' and '/' get percent-encoded by URLSearchParams
    expect(url).toContain('/getFile?file_id=CAAC%2Bid%2Fneeds-encoding');
    expect(url.startsWith(`${TELEGRAM_API_ORIGIN}/bot`)).toBe(true);
  });

  it('builds file download URLs only from validated paths', () => {
    expect(buildFileUrl(VALID_TOKEN, 'stickers/file_51.webp')).toBe(
      `${TELEGRAM_API_ORIGIN}/file/bot${VALID_TOKEN}/stickers/file_51.webp`,
    );
    expect(buildFileUrl(VALID_TOKEN, '../../etc/passwd')).toBeNull();
    expect(buildFileUrl(VALID_TOKEN, 'a b.webp')).toBeNull();
  });
});
