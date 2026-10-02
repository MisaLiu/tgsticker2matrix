import { afterEach, describe, expect, it, vi } from 'vitest';
import { MatrixClient, MatrixError, resolveHomeserver } from './matrix.js';

const BASE = 'https://hs.example.org';
const USER = '@tester:example.org';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function connectClient(): Promise<MatrixClient> {
  return MatrixClient.connect(BASE, 'syt_test_token');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveHomeserver', () => {
  it('passes through https URLs and strips client API suffixes', async () => {
    expect(await resolveHomeserver('https://hs.example.org/')).toBe('https://hs.example.org');
    expect(await resolveHomeserver('https://hs.example.org/_matrix/client/v3')).toBe(
      'https://hs.example.org',
    );
    expect(await resolveHomeserver('https://hs.example.org/_matrix/client/v3/')).toBe(
      'https://hs.example.org',
    );
  });

  it('extracts the server from a Matrix ID including ports', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ 'm.homeserver': { base_url: 'https://real.example.org' } })),
    );
    expect(await resolveHomeserver('@user:example.org')).toBe('https://real.example.org');
    expect(await resolveHomeserver('@user:example.org:8448')).toBe('https://real.example.org');
  });

  it('falls back to https://domain when well-known fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network');
      }),
    );
    expect(await resolveHomeserver('example.org')).toBe('https://example.org');
  });
});

describe('MatrixClient.connect', () => {
  it('validates the token via whoami', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes('/_matrix/client/versions')) return json({ versions: ['v1.1'] });
        if (url.includes('/account/whoami')) return json({ user_id: USER });
        return json({}, 404);
      }),
    );
    const client = await connectClient();
    expect(client.userId).toBe(USER);
    expect(client.baseUrl).toBe(BASE);
  });

  it('surfaces invalid tokens as MatrixError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url.includes('/_matrix/client/versions')) return json({ versions: ['v1.1'] });
        return json({ errcode: 'M_UNKNOWN_TOKEN', error: 'Unrecognized access token' }, 401);
      }),
    );
    await expect(connectClient()).rejects.toThrow(MatrixError);
  });
});

describe('createRoom power levels (MSC4289 / room v12)', () => {
  it('does NOT put the creator into power_level_content_override.users', async () => {
    const seen: { override?: Record<string, unknown> } = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/_matrix/client/versions')) return json({ versions: ['v1.1'] });
        if (url.includes('/account/whoami')) return json({ user_id: USER });
        if (url.endsWith('/createRoom')) {
          const body = JSON.parse(String(init?.body)) as {
            power_level_content_override?: Record<string, unknown>;
          };
          seen.override = body.power_level_content_override;
          return json({ room_id: '!packs:example.org' });
        }
        return json({}, 404);
      }),
    );

    const client = await connectClient();
    const roomId = await client.createRoom('Telegram Sticker Packs');
    expect(roomId).toBe('!packs:example.org');

    const override = seen.override;
    if (!override) throw new Error('createRoom was not called');

    // The regression: room v12 rejects creator entries in content.users,
    // and the server's own version-aware default must survive the overlay.
    expect(override).not.toHaveProperty('users');

    // Remaining override stays intact.
    expect(override.users_default).toBe(0);
    expect(override.state_default).toBe(50);
    expect(override.events_default).toBe(0);
    expect((override.events as Record<string, number>)['m.room.power_levels']).toBe(100);
    // Meaningless legacy key stays gone.
    expect(override).not.toHaveProperty('push_rules');
  });
});
