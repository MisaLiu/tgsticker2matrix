import { describe, expect, it } from 'vitest';
import zhCN, { type I18nKey } from './zh-CN.js';
import en from './en.js';
import { detectLocale, getLocale, setLocale, subscribeLocale, t } from './index.js';

describe('dictionary integrity', () => {
  it('en covers exactly the zh-CN keys (type-level too, this guards runtime)', () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('has no empty translations', () => {
    for (const [key, value] of Object.entries({ ...zhCN, ...en })) {
      expect(value, key).not.toBe('');
    }
  });
});

describe('detectLocale', () => {
  it('prefers a valid stored locale', () => {
    expect(detectLocale('en', ['zh-CN'])).toBe('en');
    expect(detectLocale('zh-CN', ['en-US'])).toBe('zh-CN');
  });

  it('falls back to the browser language', () => {
    expect(detectLocale(null, ['zh-TW', 'en'])).toBe('zh-CN');
    expect(detectLocale(null, ['en-GB'])).toBe('en');
    expect(detectLocale('bogus', ['zh-CN'])).toBe('zh-CN');
    expect(detectLocale(null, [])).toBe('en');
    expect(detectLocale(null, undefined)).toBe('en');
  });
});

describe('t()', () => {
  it('interpolates {name} placeholders', () => {
    setLocale('en');
    expect(t('connect.connected', { user: '@me:example.org' })).toBe('Connected: @me:example.org');
    expect(t('run.warnSkipped', { n: 3 })).toBe('3 sticker(s) skipped (download or conversion failed)');
    setLocale('zh-CN');
    expect(t('run.warnSkipped', { n: 3 })).toBe('3 张贴纸被跳过（无法下载或转换）');
  });

  it('leaves unknown placeholders untouched', () => {
    setLocale('en');
    expect(t('run.count', { other: 1 })).toBe('{n} stickers');
  });

  it('falls back to the key itself for unknown keys', () => {
    expect(t('does.not.exist' as I18nKey)).toBe('does.not.exist');
  });
});

describe('setLocale / subscribeLocale', () => {
  it('notifies subscribers and round-trips through getLocale', () => {
    const original = getLocale();
    const other = original === 'en' ? 'zh-CN' : 'en';
    let notified = 0;
    const unsubscribe = subscribeLocale(() => {
      notified += 1;
    });
    setLocale(other);
    expect(notified).toBe(1);
    expect(getLocale()).toBe(other);
    setLocale(original);
    expect(notified).toBe(2);
    expect(getLocale()).toBe(original);
    unsubscribe();
    setLocale(other);
    expect(notified).toBe(2); // unsubscribed
    setLocale(original);
  });

  it('is a no-op when setting the same locale', () => {
    let notified = 0;
    const unsubscribe = subscribeLocale(() => {
      notified += 1;
    });
    setLocale(getLocale());
    expect(notified).toBe(0);
    unsubscribe();
  });
});
