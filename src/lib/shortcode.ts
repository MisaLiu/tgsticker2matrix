import { emojiToName } from 'gemoji';

export const MAX_SHORTCODE_LENGTH = 100;

const DISALLOWED = /[^a-zA-Z0-9_-]/g;

/** MSC2545 shortcode grammar: [a-zA-Z0-9-_]+, <= 100 bytes. */
export function isValidShortcode(code: string): boolean {
  if (code.length === 0 || code.length > MAX_SHORTCODE_LENGTH) return false;
  return !DISALLOWED.test(code);
}

export function slugifyShortcode(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(DISALLOWED, '_')
    .replace(/_{3,}/g, '__');
  if (slug.length === 0) return '';
  return slug.slice(0, MAX_SHORTCODE_LENGTH);
}

/** Find the first known emoji (possibly a multi-codepoint sequence) in a string. */
export function firstKnownEmoji(text: string): string | undefined {
  const cps = [...text];
  for (let i = 0; i < cps.length; i++) {
    const max = Math.min(8, cps.length - i);
    for (let len = max; len >= 1; len--) {
      const candidate = cps.slice(i, i + len).join('');
      if (candidate in emojiToName) return candidate;
      const stripped = candidate.replace(/\uFE0F/g, '');
      if (stripped !== candidate && stripped in emojiToName) return stripped;
    }
  }
  return undefined;
}

function uniqueShortcode(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let n = 2; n < 100000; n++) {
    const suffix = `_${n}`;
    const padded = base.slice(0, MAX_SHORTCODE_LENGTH - suffix.length) + suffix;
    if (!taken.has(padded)) {
      taken.add(padded);
      return padded;
    }
  }
  const fallback = `sticker_${taken.size + 1}`;
  taken.add(fallback);
  return fallback;
}

/**
 * Prefix every shortcode with the lowercase Telegram pack id
 * (`t.me/addstickers/<id>` → `<id>_<shortcode>`), truncating the base so the
 * result always satisfies the MSC2545 grammar and the 100-char limit.
 * A uniform prefix preserves within-pack uniqueness.
 */
export function prefixShortcodes(packId: string, codes: string[]): string[] {
  const prefix = packId
    .toLowerCase()
    .replace(DISALLOWED, '_')
    .slice(0, MAX_SHORTCODE_LENGTH - 2);
  if (prefix === '') return codes;
  const budget = MAX_SHORTCODE_LENGTH - prefix.length - 1;
  return codes.map((code) => `${prefix}_${code.slice(0, budget)}`);
}

/**
 * Assign a unique ASCII shortcode to each sticker from its Telegram emoji
 * annotation. Falls back to `sticker_<index>` when the emoji is missing or
 * unknown to gemoji.
 */
export function assignShortcodes(emojis: (string | undefined | null)[]): string[] {
  const taken = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < emojis.length; i++) {
    const raw = emojis[i] ?? '';
    const emoji = firstKnownEmoji(raw);
    const name = emoji !== undefined ? emojiToName[emoji] : undefined;
    let base = name !== undefined ? slugifyShortcode(name) : '';
    if (base === '') base = `sticker_${i + 1}`;
    out.push(uniqueShortcode(base, taken));
  }
  return out;
}
