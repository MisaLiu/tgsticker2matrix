import { describe, expect, it, vi } from 'vitest';
import {
  importMatrixPacks,
  PACKS_ROOM_ACCOUNT_DATA,
  PACKS_ROOM_NAME,
  pruneStalePackSubscriptions,
  resolveOrCreatePacksRoom,
} from './matrix-pack.js';
import { STORAGE_KEYS, type StorageLike } from './credentials.js';
import { TYPE_PACK_ROOMS_STABLE, TYPE_PACK_ROOMS_UNSTABLE, TYPE_USER_PACK } from './pack.js';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & {
  dump(): Record<string, string>;
} {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

interface FakeClientOptions {
  joined?: string[] | 'error';
  accountData?: unknown | null | 'error';
}

function fakeClient(options: FakeClientOptions = {}) {
  const calls = {
    createRoom: [] as string[],
    joinedRooms: 0,
    getAccountData: [] as string[],
    setAccountData: [] as { type: string; content: unknown }[],
  };
  let roomCounter = 0;
  const client = {
    joinedRooms: async () => {
      calls.joinedRooms += 1;
      if (options.joined === 'error') throw new Error('network down');
      return options.joined ?? [];
    },
    getAccountData: async (type: string) => {
      calls.getAccountData.push(type);
      if (options.accountData === 'error') throw new Error('network down');
      return options.accountData ?? null;
    },
    setAccountData: async (type: string, content: unknown) => {
      calls.setAccountData.push({ type, content });
    },
    createRoom: async (name: string) => {
      calls.createRoom.push(name);
      roomCounter += 1;
      return `!room${roomCounter}:example.org`;
    },
  };
  return { client, calls };
}

const CACHED = { [STORAGE_KEYS.packsRoom]: '!cached:example.org' };

describe('resolveOrCreatePacksRoom', () => {
  it('reuses the local cache without touching account data (fast path)', async () => {
    const storage = fakeStorage(CACHED);
    const { client, calls } = fakeClient({ joined: ['!cached:example.org'] });

    const roomId = await resolveOrCreatePacksRoom(client, storage);

    expect(roomId).toBe('!cached:example.org');
    expect(calls.createRoom).toEqual([]);
    expect(calls.getAccountData).toEqual([]);
    expect(calls.joinedRooms).toBe(1);
  });

  it('falls back to account data across devices: reuses and backfills the local cache', async () => {
    const storage = fakeStorage(); // fresh browser / cleared storage
    const { client, calls } = fakeClient({
      joined: ['!remote:example.org'],
      accountData: { room_id: '!remote:example.org' },
    });

    const roomId = await resolveOrCreatePacksRoom(client, storage);

    expect(roomId).toBe('!remote:example.org');
    expect(calls.createRoom).toEqual([]);
    expect(calls.getAccountData).toEqual([PACKS_ROOM_ACCOUNT_DATA]);
    expect(storage.dump()[STORAGE_KEYS.packsRoom]).toBe('!remote:example.org');
    expect(calls.joinedRooms).toBe(1); // membership fetched once, reused
  });

  it('creates only on first-ever use and persists to both layers', async () => {
    const storage = fakeStorage();
    const { client, calls } = fakeClient({ accountData: null });

    const roomId = await resolveOrCreatePacksRoom(client, storage);

    expect(roomId).toBe('!room1:example.org');
    expect(calls.createRoom).toEqual([PACKS_ROOM_NAME]);
    expect(storage.dump()[STORAGE_KEYS.packsRoom]).toBe('!room1:example.org');
    expect(calls.setAccountData).toEqual([
      { type: PACKS_ROOM_ACCOUNT_DATA, content: { room_id: '!room1:example.org' } },
    ]);
  });

  it('recreates when the referenced room is confirmed gone (not a member)', async () => {
    const storage = fakeStorage(CACHED);
    const { client, calls } = fakeClient({
      joined: ['!somewhere-else:example.org'],
      accountData: { room_id: '!cached:example.org' },
    });

    const roomId = await resolveOrCreatePacksRoom(client, storage);

    expect(roomId).toBe('!room1:example.org');
    expect(calls.createRoom).toEqual([PACKS_ROOM_NAME]);
    expect(storage.dump()[STORAGE_KEYS.packsRoom]).toBe('!room1:example.org');
    expect(calls.setAccountData[0]?.content).toEqual({ room_id: '!room1:example.org' });
  });

  it('prefers a different account-data room over a stale local cache', async () => {
    const storage = fakeStorage(CACHED);
    const { client, calls } = fakeClient({
      joined: ['!other-device-room:example.org'],
      accountData: { room_id: '!other-device-room:example.org' },
    });

    const roomId = await resolveOrCreatePacksRoom(client, storage);

    expect(roomId).toBe('!other-device-room:example.org');
    expect(calls.createRoom).toEqual([]);
    expect(storage.dump()[STORAGE_KEYS.packsRoom]).toBe('!other-device-room:example.org');
  });

  it('aborts on membership network errors instead of creating a duplicate', async () => {
    const storage = fakeStorage(CACHED);
    const { client, calls } = fakeClient({ joined: 'error' });

    await expect(resolveOrCreatePacksRoom(client, storage)).rejects.toThrow('network down');
    expect(calls.createRoom).toEqual([]);
  });

  it('aborts on account-data network errors instead of creating a duplicate', async () => {
    const storage = fakeStorage();
    const { client, calls } = fakeClient({ accountData: 'error' });

    await expect(resolveOrCreatePacksRoom(client, storage)).rejects.toThrow('network down');
    expect(calls.createRoom).toEqual([]);
  });

  it('ignores malformed account data and treats it as missing', async () => {
    const storage = fakeStorage();
    const { client, calls } = fakeClient({ accountData: { unexpected: true } });

    const roomId = await resolveOrCreatePacksRoom(client, storage);

    expect(roomId).toBe('!room1:example.org');
    expect(calls.createRoom).toEqual([PACKS_ROOM_NAME]);
  });

  it('tolerates a missing storage layer (memory-only callers)', async () => {
    const { client, calls } = fakeClient({ accountData: { room_id: '!remote:example.org' }, joined: ['!remote:example.org'] });
    const roomId = await resolveOrCreatePacksRoom(client, null);
    expect(roomId).toBe('!remote:example.org');
    expect(calls.createRoom).toEqual([]);
  });

  it('does not fail the import when the account-data write fails (local cache holds)', async () => {
    const storage = fakeStorage();
    const { client, calls } = fakeClient({ accountData: null });
    vi.spyOn(client, 'setAccountData').mockRejectedValue(new Error('write denied'));

    const roomId = await resolveOrCreatePacksRoom(client, storage);

    expect(roomId).toBe('!room1:example.org');
    expect(storage.dump()[STORAGE_KEYS.packsRoom]).toBe('!room1:example.org');
    expect(calls.createRoom).toEqual([PACKS_ROOM_NAME]);
  });
});

function subscriptionClient(options: {
  joined?: string[] | 'error';
  data?: Record<string, unknown> | 'error';
}) {
  const writes: { type: string; content: unknown }[] = [];
  const reads: string[] = [];
  const client = {
    joinedRooms: async () => {
      if (options.joined === 'error') throw new Error('network down');
      return options.joined ?? [];
    },
    getAccountData: async (type: string) => {
      reads.push(type);
      if (options.data === 'error') throw new Error('network down');
      return options.data?.[type] ?? null;
    },
    setAccountData: async (type: string, content: unknown) => {
      writes.push({ type, content });
    },
  };
  return { client, writes, reads };
}

describe('pruneStalePackSubscriptions', () => {
  const alive = '!alive:example.org';
  const gone = '!deleted:example.org';

  const staleData = {
    [TYPE_PACK_ROOMS_STABLE]: {
      rooms: { [alive]: { ok: {} }, [gone]: { dead: {} } },
      keep: 1,
    },
    [TYPE_PACK_ROOMS_UNSTABLE]: {
      rooms: { [gone]: { dead: {} } },
    },
  };

  it('prunes both subscription types and reports the total removals', async () => {
    const { client, writes } = subscriptionClient({ joined: [alive], data: staleData });

    const removed = await pruneStalePackSubscriptions(client);

    expect(removed).toBe(2); // 1 stale room in stable + 1 in unstable
    expect(writes).toHaveLength(2);

    const stable = writes.find((w) => w.type === TYPE_PACK_ROOMS_STABLE)!;
    expect(stable.content).toEqual({
      rooms: { [alive]: { ok: {} } },
      keep: 1, // unknown top-level keys survive
    });
    const unstable = writes.find((w) => w.type === TYPE_PACK_ROOMS_UNSTABLE)!;
    expect(unstable.content).toEqual({ rooms: {} });
  });

  it('writes nothing when there is nothing stale', async () => {
    const { client, writes, reads } = subscriptionClient({
      joined: [alive],
      data: { [TYPE_PACK_ROOMS_STABLE]: { rooms: { [alive]: { ok: {} } } } },
    });

    const removed = await pruneStalePackSubscriptions(client);

    expect(removed).toBe(0);
    expect(writes).toEqual([]);
    expect(reads).toHaveLength(2); // both types are still inspected
  });

  it('aborts on membership network errors', async () => {
    const { client, writes } = subscriptionClient({ joined: 'error' });
    await expect(pruneStalePackSubscriptions(client)).rejects.toThrow('network down');
    expect(writes).toEqual([]);
  });

  it('aborts on account-data network errors', async () => {
    const { client, writes } = subscriptionClient({ joined: [alive], data: 'error' });
    await expect(pruneStalePackSubscriptions(client)).rejects.toThrow('network down');
    expect(writes).toEqual([]);
  });
});

describe('importMatrixPacks', () => {
  it('publishes a personal pack through the domain interface', async () => {
    const uploads: string[] = [];
    const writes: { type: string; content: unknown }[] = [];
    const progress: string[] = [];
    const client = {
      userId: '@tester:example.org',
      uploadMedia: async (_blob: Blob, filename: string) => {
        uploads.push(filename);
        return `mxc://example.org/${filename}`;
      },
      getAccountData: async () => null,
      setAccountData: async (type: string, content: unknown) => {
        writes.push({ type, content });
      },
      sendState: async () => undefined,
      createRoom: async () => '!packs:example.org',
      joinedRooms: async () => [],
    };

    const result = await importMatrixPacks({
      client,
      assets: [
        {
          shortcode: 'testpack_joy',
          body: '😂',
          bytes: new Uint8Array([1, 2, 3]),
          mime: 'image/webp',
          width: 512,
          height: 512,
        },
      ],
      avatar: null,
      setName: 'Cats',
      setTitle: 'Cats',
      attribution: 'Converted from Telegram',
      targets: { user: true, room: false },
      roomMode: { kind: 'create' },
      storage: fakeStorage(),
      onProgress: (event) => progress.push(`${event.stage}:${event.detail}`),
    });

    expect(result.userImported).toBe(true);
    expect(result.droppedShortcodes).toEqual([]);
    expect(uploads).toEqual(['testpack_joy.webp']);
    expect(progress).toEqual([
      'upload:testpack_joy',
      'write:个人贴纸包 (im.ponies.user_emotes)',
    ]);
    expect(writes).toHaveLength(1);
    const firstWrite = writes[0];
    if (!firstWrite) throw new Error('personal pack write was not recorded');
    expect(firstWrite.type).toBe(TYPE_USER_PACK);
    expect((firstWrite.content as { images: Record<string, unknown> }).images).toEqual({
      testpack_joy: {
        url: 'mxc://example.org/testpack_joy.webp',
        body: '😂',
        info: { w: 512, h: 512, mimetype: 'image/webp', size: 3 },
      },
    });
  });
});
