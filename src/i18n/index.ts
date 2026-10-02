import { useEffect, useState } from 'preact/hooks';
import zhCN, { type I18nKey } from './zh-CN.js';
import en from './en.js';

export type { I18nKey };
export type Locale = 'zh-CN' | 'en';

const DICTS: Record<Locale, Record<I18nKey, string>> = { 'zh-CN': zhCN, en };
const LOCALE_KEY = 'tg2mx:locale';

export type TParams = Record<string, string | number>;

export function detectLocale(
  stored: string | null,
  browserLanguages: readonly string[] | undefined,
): Locale {
  if (stored === 'zh-CN' || stored === 'en') return stored;
  const first = (browserLanguages?.[0] ?? '').toLowerCase();
  return first.startsWith('zh') ? 'zh-CN' : 'en';
}

function readStoredLocale(): string | null {
  try {
    return globalThis.localStorage?.getItem(LOCALE_KEY) ?? null;
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

let current: Locale = detectLocale(readStoredLocale(), browserLanguages());
const listeners = new Set<() => void>();

function applyDocumentLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
applyDocumentLang();

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  try {
    globalThis.localStorage?.setItem(LOCALE_KEY, next);
  } catch {
    // storage unavailable — locale still applies for this session
  }
  applyDocumentLang();
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Translate a UI-layer key with optional `{name}` placeholders. */
export function t(key: I18nKey, params?: TParams): string {
  const raw = DICTS[current][key] ?? zhCN[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Subscribe the component to locale changes so it re-renders on switch. */
export function useLocale(): Locale {
  const [, bump] = useState(0);
  useEffect(() => subscribeLocale(() => bump((n) => n + 1)), []);
  return current;
}
