import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

function makeEnv(assetsFetch?: (request: Request) => Promise<Response>): {
  ASSETS: { fetch(request: Request): Promise<Response> };
} {
  return {
    ASSETS: { fetch: assetsFetch ?? (async () => new Response('asset', { status: 200 })) },
  };
}

function makeRequest(path: string, token?: string): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set('X-Telegram-Token', token);
  return new Request(`https://app.example${path}`, { headers });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /health', () => {
  it('answers ok with CORS', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

describe('static asset delegation', () => {
  it('delegates non-API GET paths to env.ASSETS (SPA fallback)', async () => {
    const assetsFetch = vi.fn(async () => new Response('<html>app</html>', { status: 200 }));
    const res = await worker.fetch(makeRequest('/some/deep/link'), makeEnv(assetsFetch));
    expect(assetsFetch).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<html>app</html>');
  });

  it('never reaches Telegram for asset paths', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await worker.fetch(makeRequest('/assets/index-abc.js'), makeEnv());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('CORS preflight and method handling', () => {
  it('answers OPTIONS with CORS headers', async () => {
    const res = await worker.fetch(
      new Request('https://app.example/file', { method: 'OPTIONS' }),
      makeEnv(),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('X-Telegram-Token');
  });

  it('rejects non-GET methods', async () => {
    const res = await worker.fetch(
      new Request('https://app.example/health', { method: 'POST' }),
      makeEnv(),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('GET /sticker-set', () => {
  it('rejects a missing token header before any upstream call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await worker.fetch(makeRequest('/sticker-set?name=Cats'));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = (await res.json()) as { ok: boolean; description: string };
    expect(body.ok).toBe(false);
    expect(body.description).toContain('X-Telegram-Token');
  });

  it('rejects invalid set names before any upstream call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await worker.fetch(
      makeRequest('/sticker-set?name=bad%20name', TOKEN),
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('builds the getStickerSet URL itself and relays the JSON with CORS', async () => {
    const upstreamBody = { ok: true, result: { name: 'Cats', stickers: [] } };
    const fetchSpy = vi.fn(async () => json(upstreamBody));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await worker.fetch(makeRequest('/sticker-set?name=Test_Pack', TOKEN));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const [upstreamUrl, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(upstreamUrl).toBe(
      `https://api.telegram.org/bot${TOKEN}/getStickerSet?name=Test_Pack`,
    );
    expect((init.signal as AbortSignal).aborted).toBe(false);
    expect(await res.json()).toEqual(upstreamBody);
  });

  it("relays Telegram's own error (401) with CORS intact", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ok: false, description: 'Unauthorized' }, 401)),
    );
    const res = await worker.fetch(makeRequest('/sticker-set?name=Cats', TOKEN));
    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = (await res.json()) as { description: string };
    expect(body.description).toBe('Unauthorized');
  });

  it('returns 502 when the upstream is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    const res = await worker.fetch(makeRequest('/sticker-set?name=Cats', TOKEN));
    expect(res.status).toBe(502);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('GET /file', () => {
  it('runs getFile then downloads, returning binary with CORS', async () => {
    const fileBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        json({ ok: true, result: { file_path: 'stickers/file_51.webp' } }),
      )
      .mockResolvedValueOnce(
        new Response(fileBytes, { headers: { 'Content-Type': 'image/webp' } }),
      );
    vi.stubGlobal('fetch', fetchSpy);

    const res = await worker.fetch(
      makeRequest('/file?file_id=CAACAgIAAxkBAAIBQ2Qexample1', TOKEN),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(fileBytes);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [firstUrl] = fetchSpy.mock.calls[0] as unknown as [string];
    const [secondUrl] = fetchSpy.mock.calls[1] as unknown as [string];
    expect(firstUrl).toBe(
      `https://api.telegram.org/bot${TOKEN}/getFile?file_id=CAACAgIAAxkBAAIBQ2Qexample1`,
    );
    expect(secondUrl).toBe(
      `https://api.telegram.org/file/bot${TOKEN}/stickers/file_51.webp`,
    );
  });

  it('rejects a file_id with invalid shape before any upstream call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await worker.fetch(makeRequest('/file?file_id=bad%20id', TOKEN));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("relays getFile's error response directly", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ok: false, description: 'Bad Request: wrong file id' }, 400)),
    );
    const res = await worker.fetch(makeRequest('/file?file_id=CAAC_x_y', TOKEN));
    expect(res.status).toBe(400);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = (await res.json()) as { description: string };
    expect(body.description).toContain('wrong file id');
  });

  it('502s when getFile omits file_path', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, result: {} })));
    const res = await worker.fetch(makeRequest('/file?file_id=CAAC_x_y', TOKEN));
    expect(res.status).toBe(502);
  });

  it('rejects a traversal file_path from upstream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ok: true, result: { file_path: '../../etc/passwd' } })),
    );
    const res = await worker.fetch(makeRequest('/file?file_id=CAAC_x_y', TOKEN));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { description: string };
    expect(body.description).toContain('不合法');
  });

  it('502s when the file download itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    // First call: getFile succeeds with a path; second: file 404 without JSON.
    const spy = vi
      .fn()
      .mockResolvedValueOnce(json({ ok: true, result: { file_path: 'stickers/file_1.webp' } }))
      .mockResolvedValueOnce(new Response('gone', { status: 404 }));
    vi.stubGlobal('fetch', spy);
    const res = await worker.fetch(makeRequest('/file?file_id=CAAC_x_y', TOKEN));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { description: string };
    expect(body.description).toContain('下载文件失败');
  });
});
