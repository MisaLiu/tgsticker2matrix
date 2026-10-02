import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEYS,
  clearCredentials,
  loadCredentials,
  loadRemember,
  saveCredentials,
  setRemember,
  type StorageLike,
} from './credentials.js';

function fakeStorage(): StorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

describe('remember flag', () => {
  it('round-trips independently of credential values', () => {
    const storage = fakeStorage();
    expect(loadRemember(storage)).toBe(false);
    setRemember(storage, true);
    expect(loadRemember(storage)).toBe(true);
    // Saving credentials must not flip the flag off.
    saveCredentials(storage, { tgToken: 'x', hs: '', access: '' });
    expect(loadRemember(storage)).toBe(true);
    setRemember(storage, false);
    expect(loadRemember(storage)).toBe(false);
    expect(storage.dump()).toEqual({});
  });
});

describe('saveCredentials', () => {
  it('writes all non-empty fields regardless of order (the reported bug)', () => {
    const storage = fakeStorage();
    // User ticks the box first (flag on), then types the token.
    setRemember(storage, true);
    saveCredentials(storage, { tgToken: '', hs: '', access: '' });
    saveCredentials(storage, { tgToken: '123:AA_token', hs: '', access: '' });
    expect(loadCredentials(storage).tgToken).toBe('123:AA_token');
    expect(loadRemember(storage)).toBe(true);

    // Later the Matrix fields arrive — persisted even without a connection.
    saveCredentials(storage, {
      tgToken: '123:AA_token',
      hs: 'https://hs.example.org',
      access: 'syt_abc',
    });
    expect(loadCredentials(storage)).toEqual({
      tgToken: '123:AA_token',
      hs: 'https://hs.example.org',
      access: 'syt_abc',
    });
  });

  it('persists when values were typed before the box was ticked', () => {
    const storage = fakeStorage();
    saveCredentials(storage, { tgToken: 'typed-first', hs: 'h', access: 'a' });
    setRemember(storage, true);
    expect(loadCredentials(storage)).toEqual({ tgToken: 'typed-first', hs: 'h', access: 'a' });
    expect(loadRemember(storage)).toBe(true);
  });

  it('removes fields that were emptied', () => {
    const storage = fakeStorage();
    saveCredentials(storage, { tgToken: 't', hs: 'h', access: 'a' });
    saveCredentials(storage, { tgToken: '', hs: 'h', access: '' });
    expect(loadCredentials(storage)).toEqual({ tgToken: '', hs: 'h', access: '' });
    expect(storage.dump()[STORAGE_KEYS.tgToken]).toBeUndefined();
  });
});

describe('clearCredentials', () => {
  it('wipes the flag and every value', () => {
    const storage = fakeStorage();
    setRemember(storage, true);
    saveCredentials(storage, { tgToken: 't', hs: 'h', access: 'a' });
    clearCredentials(storage);
    expect(storage.dump()).toEqual({});
    expect(loadRemember(storage)).toBe(false);
    expect(loadCredentials(storage)).toEqual({ tgToken: '', hs: '', access: '' });
  });
});
