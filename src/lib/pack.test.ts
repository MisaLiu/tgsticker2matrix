import { describe, expect, it } from 'vitest';
import {
  EVENT_SIZE_BUDGET,
  buildPackContent,
  contentBytes,
  mergePackRooms,
  mergeUserPack,
  pruneStaleSubscriptions,
  TYPE_PACK_ROOMS_STABLE,
  TYPE_ROOM_PACK_STABLE,
} from './pack.js';

const meta = {
  display_name: 'Test Pack',
  attribution: 'Converted from Telegram',
  usage: ['sticker'],
};

function manyImages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    shortcode: `sticker_${i + 1}`,
    entry: {
      url: `mxc://example.org/${'a'.repeat(43)}${i}`,
      body: '😂',
      info: { w: 512, h: 512, mimetype: 'image/webp', size: 12345 },
    },
  }));
}

describe('buildPackContent', () => {
  it('builds content within the size budget', () => {
    const { content, dropped } = buildPackContent({ meta, images: manyImages(10) });
    expect(Object.keys(content.images)).toHaveLength(10);
    expect(dropped).toEqual([]);
    expect(contentBytes(content)).toBeLessThanOrEqual(EVENT_SIZE_BUDGET);
    expect(content.pack).toEqual(meta);
  });

  it('drops entries that overflow the 65 KB budget', () => {
    const { content, dropped } = buildPackContent({ meta, images: manyImages(600) });
    expect(contentBytes(content)).toBeLessThanOrEqual(EVENT_SIZE_BUDGET);
    expect(dropped.length).toBeGreaterThan(0);
    expect(Object.keys(content.images).length + dropped.length).toBe(600);
    // kept images preserve their order prefix
    expect(Object.keys(content.images)[0]).toBe('sticker_1');
  });

  it('handles an empty image list', () => {
    const { content, dropped } = buildPackContent({ meta, images: [] });
    expect(content.images).toEqual({});
    expect(dropped).toEqual([]);
  });
});

describe('mergeUserPack', () => {
  it('creates a new pack when existing content is missing', () => {
    const incoming = buildPackContent({ meta, images: manyImages(2) }).content;
    const merged = mergeUserPack(undefined, incoming);
    expect(Object.keys(merged.images)).toHaveLength(2);
    expect(merged.pack?.display_name).toBe('Test Pack');
  });

  it('lets incoming images win and keeps unrelated ones', () => {
    const existing = {
      pack: { display_name: 'Saved', unknownKey: 1 },
      images: {
        mine: { url: 'mxc://a/1' },
        joy: { url: 'mxc://old/joy' },
      },
      extra: 'preserved',
    };
    const incoming = buildPackContent({ meta, images: manyImages(1) }).content;
    incoming.images['joy'] = { url: 'mxc://new/joy' };
    const merged = mergeUserPack(existing, incoming) as unknown as Record<string, unknown>;

    expect(merged.extra).toBe('preserved');
    expect((merged.images as Record<string, unknown>).mine).toBeDefined();
    expect((merged.images as Record<string, { url: string }>).joy!.url).toBe('mxc://new/joy');
    expect(Object.keys(merged.images as object)).toHaveLength(3);
  });

  it('is robust against malformed existing content', () => {
    const incoming = buildPackContent({ meta, images: manyImages(1) }).content;
    const merged = mergeUserPack('garbage', incoming);
    expect(Object.keys(merged.images)).toHaveLength(1);
  });
});

describe('mergePackRooms', () => {
  it('adds subscriptions without clobbering existing entries', () => {
    const existing = {
      rooms: {
        '!other:example.org': { '': {} },
      },
      custom: true,
    };
    const merged = mergePackRooms(existing, [
      { roomId: '!packs:example.org', stateKey: 'telegram_foo' },
      { roomId: '!packs:example.org', stateKey: '' },
      { roomId: '!other:example.org', stateKey: '' },
    ]);
    expect(merged.custom).toBe(true);
    const rooms = merged.rooms as Record<string, Record<string, unknown>>;
    expect(rooms['!packs:example.org']).toEqual({ telegram_foo: {}, '': {} });
    expect(rooms['!other:example.org']).toEqual({ '': {} });
  });

  it('repairs malformed room entries', () => {
    const merged = mergePackRooms({ rooms: { '!r:server': null } }, [
      { roomId: '!r:server', stateKey: 'x' },
    ]);
    const rooms = merged.rooms as Record<string, unknown>;
    expect(rooms['!r:server']).toEqual({ x: {} });
  });

  it('works from scratch', () => {
    const merged = mergePackRooms(undefined, [
      { roomId: '!r:server', stateKey: 'k' },
    ]);
    expect(merged.rooms).toEqual({ '!r:server': { k: {} } });
  });
});

describe('pruneStaleSubscriptions', () => {
  const joined = ['!alive:example.org'];

  it('drops rooms the user is no longer a member of', () => {
    const existing = {
      rooms: {
        '!alive:example.org': { telegram_ok: {} },
        '!deleted:example.org': { telegram_dead: {} },
        '!left:example.org': { '': {} },
      },
      custom: 'keep-me',
    };
    const { content, removed } = pruneStaleSubscriptions(existing, joined);
    expect(removed).toBe(2);
    expect(content.rooms).toEqual({ '!alive:example.org': { telegram_ok: {} } });
    expect(content.custom).toBe('keep-me');
    expect(existing.rooms).toHaveProperty('!deleted:example.org'); // input untouched
  });

  it('reports zero removals when everything is still joined', () => {
    const existing = { rooms: { '!alive:example.org': { '': {} } } };
    const { content, removed } = pruneStaleSubscriptions(existing, joined);
    expect(removed).toBe(0);
    expect(content.rooms).toEqual(existing.rooms);
  });

  it('tolerates malformed shapes without throwing', () => {
    expect(pruneStaleSubscriptions(null, joined)).toEqual({ content: null, removed: 0 });
    expect(pruneStaleSubscriptions('x', joined)).toEqual({ content: 'x', removed: 0 });
    const noRooms = pruneStaleSubscriptions({ other: 1 }, joined);
    expect(noRooms.removed).toBe(0);
    expect(noRooms.content).toEqual({ other: 1 });
    const badRooms = pruneStaleSubscriptions({ rooms: '!not-an-object' }, joined);
    expect(badRooms.removed).toBe(0);
  });

  it('empties the rooms map but keeps it present when all are stale', () => {
    const { content, removed } = pruneStaleSubscriptions(
      { rooms: { '!gone:example.org': { a: {} } } },
      joined,
    );
    expect(removed).toBe(1);
    expect(content.rooms).toEqual({});
  });
});

describe('event type constants', () => {
  it('matches the Matrix spec', () => {
    expect(TYPE_ROOM_PACK_STABLE).toBe('m.room.image_pack');
    expect(TYPE_PACK_ROOMS_STABLE).toBe('m.image_pack.rooms');
  });
});
