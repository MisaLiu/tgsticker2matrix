/**
 * Credential persistence for the connect step. All writes go through here so
 * the remember-flag, the values and the clear path can't drift apart.
 */

export const STORAGE_KEYS = {
  remember: 'tg2mx:remember',
  tgToken: 'tg2mx:tg-token',
  hs: 'tg2mx:hs',
  access: 'tg2mx:token',
  /** Room id of the auto-created "Telegram Sticker Packs" room. */
  packsRoom: 'tg2mx:packs-room',
} as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CredentialValues {
  tgToken: string;
  hs: string;
  access: string;
}

export function loadRemember(storage: StorageLike): boolean {
  try {
    const flag = storage.getItem(STORAGE_KEYS.remember);
    if (flag !== null) return flag === '1';
    // Migration: builds before the dedicated flag derived "remember" from the
    // mere presence of a saved bot token.
    return storage.getItem(STORAGE_KEYS.tgToken) !== null;
  } catch {
    return false;
  }
}

export function setRemember(storage: StorageLike, value: boolean): void {
  try {
    if (value) {
      storage.setItem(STORAGE_KEYS.remember, '1');
    } else {
      storage.removeItem(STORAGE_KEYS.remember);
      // Drop the legacy "remember" source too, otherwise loadRemember's
      // migration fallback would resurrect the flag on the next load.
      storage.removeItem(STORAGE_KEYS.tgToken);
    }
  } catch {
    // storage unavailable
  }
}

export function loadCredentials(storage: StorageLike): CredentialValues {
  const read = (key: string): string => {
    try {
      return storage.getItem(key) ?? '';
    } catch {
      return '';
    }
  };
  return {
    tgToken: read(STORAGE_KEYS.tgToken),
    hs: read(STORAGE_KEYS.hs),
    access: read(STORAGE_KEYS.access),
  };
}

/**
 * Persist the current values: non-empty fields are written, emptied fields are
 * removed. Safe to call on every keystroke while remember is enabled —
 * independent of whether the user ticked the box before or after typing, and
 * independent of Matrix connectivity.
 */
export function saveCredentials(storage: StorageLike, values: CredentialValues): void {
  const write = (key: string, value: string): void => {
    try {
      if (value === '') storage.removeItem(key);
      else storage.setItem(key, value);
    } catch {
      // storage unavailable
    }
  };
  write(STORAGE_KEYS.tgToken, values.tgToken);
  write(STORAGE_KEYS.hs, values.hs);
  write(STORAGE_KEYS.access, values.access);
}

export function clearCredentials(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEYS.remember);
    storage.removeItem(STORAGE_KEYS.tgToken);
    storage.removeItem(STORAGE_KEYS.hs);
    storage.removeItem(STORAGE_KEYS.access);
    // Account-bound cache: a different account must not inherit the old room.
    storage.removeItem(STORAGE_KEYS.packsRoom);
  } catch {
    // storage unavailable
  }
}

let browserStorage: StorageLike | null = null;

function appStorage(): StorageLike | null {
  if (browserStorage !== null) return browserStorage;
  try {
    browserStorage = globalThis.localStorage as StorageLike;
  } catch {
    browserStorage = null;
  }
  return browserStorage;
}

export function loadAppState(): { remember: boolean; values: CredentialValues } {
  const storage = appStorage();
  if (!storage) return { remember: false, values: { tgToken: '', hs: '', access: '' } };
  const remember = loadRemember(storage);
  return { remember, values: loadCredentials(storage) };
}

export function persistRemember(value: boolean): void {
  const storage = appStorage();
  if (storage) setRemember(storage, value);
}

export function persistCredentials(values: CredentialValues): void {
  const storage = appStorage();
  if (storage) saveCredentials(storage, values);
}

export function clearAppState(): void {
  const storage = appStorage();
  if (storage) clearCredentials(storage);
}
