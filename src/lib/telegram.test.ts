import { describe, expect, it } from 'vitest';
import {
  parsePackRef,
  stickerKind,
  TelegramError,
  type TgSticker,
  mapWithConcurrency,
} from './telegram.js';

describe('parsePackRef', () => {
  it('parses t.me links', () => {
    expect(parsePackRef('https://t.me/addstickers/Cats')).toBe('Cats');
    expect(parsePackRef('http://t.me/addstickers/Cats')).toBe('Cats');
    expect(parsePackRef('https://www.t.me/addstickers/Cats')).toBe('Cats');
    expect(parsePackRef('https://t.me/addstickers/Cats\n')).toBe('Cats');
  });

  it('parses legacy domains and query strings', () => {
    expect(parsePackRef('https://telegram.me/addstickers/Cats')).toBe('Cats');
    expect(parsePackRef('https://t.me/addstickers/Cats?mode=te')).toBe('Cats');
  });

  it('parses bare set names (case sensitive)', () => {
    expect(parsePackRef('Cats')).toBe('Cats');
    expect(parsePackRef(' some_pack_123 ')).toBe('some_pack_123');
  });

  it('rejects everything else', () => {
    expect(() => parsePackRef('https://t.me/somechannel')).toThrow(TelegramError);
    expect(() => parsePackRef('a b')).toThrow(TelegramError);
    expect(() => parsePackRef('')).toThrow(TelegramError);
  });
});

describe('stickerKind', () => {
  const base: TgSticker = {
    file_id: 'x',
    file_unique_id: 'y',
    type: 'regular',
    width: 512,
    height: 512,
    is_animated: false,
    is_video: false,
  };

  it('classifies by animation flags', () => {
    expect(stickerKind(base)).toBe('static');
    expect(stickerKind({ ...base, is_animated: true })).toBe('animated');
    expect(stickerKind({ ...base, is_video: true })).toBe('video');
    expect(stickerKind({ ...base, is_video: true, is_animated: true })).toBe('video');
  });
});

describe('mapWithConcurrency', () => {
  it('preserves order and captures errors per item', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      if (n === 3) throw new Error('boom');
      return n * 2;
    });
    expect(results.map((r) => r.value)).toEqual([2, 4, undefined, 8, 10]);
    expect(results[2]!.error).toBeInstanceOf(Error);
    expect((results[2]!.error as Error).message).toBe('boom');
  });

  it('handles empty input', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
