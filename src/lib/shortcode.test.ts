import { describe, expect, it } from 'vitest';
import {
  assignShortcodes,
  firstKnownEmoji,
  isValidShortcode,
  prefixShortcodes,
  slugifyShortcode,
} from './shortcode.js';

describe('isValidShortcode', () => {
  it('accepts the MSC2545 grammar', () => {
    expect(isValidShortcode('joy')).toBe(true);
    expect(isValidShortcode('sticker_1')).toBe(true);
    expect(isValidShortcode('a-b_c9')).toBe(true);
  });

  it('rejects empty, overlong and non-grammar values', () => {
    expect(isValidShortcode('')).toBe(false);
    expect(isValidShortcode('has space')).toBe(false);
    expect(isValidShortcode('emoji:😂')).toBe(false);
    expect(isValidShortcode('a'.repeat(101))).toBe(false);
    expect(isValidShortcode('a'.repeat(100))).toBe(true);
  });
});

describe('slugifyShortcode', () => {
  it('keeps gemoji names as-is', () => {
    expect(slugifyShortcode('face_with_tears_of_joy')).toBe('face_with_tears_of_joy');
  });

  it('strips disallowed characters', () => {
    expect(slugifyShortcode('日本語')).toBe('__');
    expect(slugifyShortcode('a b/c:d')).toBe('a_b_c_d');
  });
});

describe('firstKnownEmoji', () => {
  it('finds single and multi-codepoint emoji', () => {
    expect(firstKnownEmoji('😂')).toBe('😂');
    expect(firstKnownEmoji('x🎉y')).toBe('🎉');
    expect(firstKnownEmoji('')).toBeUndefined();
    expect(firstKnownEmoji('abc')).toBeUndefined();
  });

  it('finds the first emoji in a sequence', () => {
    expect(firstKnownEmoji('👍👎')).toBe('👍');
  });
});

describe('assignShortcodes', () => {
  it('maps emojis to gemoji names', () => {
    expect(assignShortcodes(['😂', '🎉'])).toEqual(['joy', 'tada']);
  });

  it('uses only the first emoji of a multi-emoji annotation', () => {
    expect(assignShortcodes(['😂🎉'])).toEqual(['joy']);
  });

  it('deduplicates collisions with numeric suffixes', () => {
    expect(assignShortcodes(['😂', '😂', '😂'])).toEqual(['joy', 'joy_2', 'joy_3']);
  });

  it('falls back to sticker_<n> for missing or unknown emoji', () => {
    expect(assignShortcodes([undefined, '', 'notanemoji'])).toEqual([
      'sticker_1',
      'sticker_2',
      'sticker_3',
    ]);
    expect(assignShortcodes(['😂', undefined])).toEqual(['joy', 'sticker_2']);
  });

  it('always produces grammar-valid shortcodes', () => {
    const codes = assignShortcodes(['😂', '日本語', '🎉🎉', '', '❤️']);
    for (const code of codes) expect(isValidShortcode(code)).toBe(true);
  });

  it('caps shortcode length at 100 bytes', () => {
    const codes = assignShortcodes(['😂']);
    expect(codes[0]!.length).toBeLessThanOrEqual(100);
  });
});

describe('prefixShortcodes', () => {
  it('prefixes with the lowercase pack id joined by an underscore', () => {
    expect(prefixShortcodes('TestPack', ['joy', 'tada'])).toEqual([
      'testpack_joy',
      'testpack_tada',
    ]);
    expect(prefixShortcodes('my_pack_123', ['joy'])).toEqual(['my_pack_123_joy']);
  });

  it('preserves within-pack uniqueness', () => {
    const prefixed = prefixShortcodes('Pack', ['joy', 'joy_2', 'joy_3']);
    expect(new Set(prefixed).size).toBe(3);
    expect(prefixed).toEqual(['pack_joy', 'pack_joy_2', 'pack_joy_3']);
  });

  it('sanitizes and never exceeds the 100-char grammar limit', () => {
    const longPrefix = 'P'.repeat(80);
    const result = prefixShortcodes(longPrefix, ['a'.repeat(100)]);
    expect(result[0]!.length).toBeLessThanOrEqual(100);
    expect(isValidShortcode(result[0]!)).toBe(true);
    expect(result[0]!.startsWith('p'.repeat(80))).toBe(true);
  });

  it('sanitizes disallowed characters in the pack id', () => {
    const [prefixed] = prefixShortcodes('Weird Pack/名', ['joy']);
    expect(prefixed).toBe('weird_pack___joy');
    expect(isValidShortcode(prefixed!)).toBe(true);
  });

  it('returns codes unchanged when the pack id is empty after sanitizing', () => {
    expect(prefixShortcodes('', ['joy'])).toEqual(['joy']);
  });
});
