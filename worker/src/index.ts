/**
 * tgsticker2matrix worker: serves the SPA's static assets and the Telegram
 * CORS relay from a single origin.
 *
 * Routing (wrangler.jsonc `assets.run_worker_first`): the three API paths
 * below hit this script first; everything else is served from static assets
 * (SPA fallback → index.html).
 *
 * Endpoints:
 *   GET /health               → { ok: true }
 *   GET /sticker-set?name=…   → getStickerSet response (JSON, errors included)
 *   GET /file?file_id=…       → getFile + file download (binary stream)
 */
import {
  buildFileUrl,
  buildGetFileUrl,
  buildStickerSetUrl,
  isValidFileId,
  isValidSetName,
  isValidToken,
} from './telegram-url.js';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'X-Telegram-Token',
  'Access-Control-Max-Age': '86400',
};

const TOKEN_HEADER = 'x-telegram-token';
const UPSTREAM_TIMEOUT_MS = 20000;

/** Telegram-shaped error so the client's existing parser keeps working. */
function errorResponse(status: number, description: string): Response {
  return new Response(JSON.stringify({ ok: false, description }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Forward an upstream response body/status, replacing headers with CORS-safe ones. */
function relay(upstream: Response, contentType?: string | null): Response {
  const headers = new Headers(CORS_HEADERS);
  const type = contentType ?? upstream.headers.get('content-type');
  if (type) headers.set('Content-Type', type);
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function fetchUpstream(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch {
    return null;
  }
}

function readToken(request: Request): string | null {
  const token = request.headers.get(TOKEN_HEADER)?.trim() ?? '';
  return isValidToken(token) ? token : null;
}

async function handleStickerSet(request: Request, url: URL): Promise<Response> {
  const token = readToken(request);
  if (token === null) {
    return errorResponse(400, '参数不合法：缺少或格式错误的 X-Telegram-Token 请求头');
  }
  const name = url.searchParams.get('name') ?? '';
  if (!isValidSetName(name)) {
    return errorResponse(400, '参数不合法：name 必须匹配 [A-Za-z0-9_]{1,64}');
  }
  const upstream = await fetchUpstream(buildStickerSetUrl(token, name));
  if (upstream === null) {
    return errorResponse(502, '无法连接 api.telegram.org（上游网络错误或超时）');
  }
  return relay(upstream);
}

async function handleFile(request: Request, url: URL): Promise<Response> {
  const token = readToken(request);
  if (token === null) {
    return errorResponse(400, '参数不合法：缺少或格式错误的 X-Telegram-Token 请求头');
  }
  const fileId = url.searchParams.get('file_id') ?? '';
  if (!isValidFileId(fileId)) {
    return errorResponse(400, '参数不合法：file_id 格式错误');
  }

  // Step 1: resolve file_path.
  const meta = await fetchUpstream(buildGetFileUrl(token, fileId));
  if (meta === null) {
    return errorResponse(502, '无法连接 api.telegram.org（上游网络错误或超时）');
  }
  let filePath: string | null = null;
  if (meta.ok) {
    const body = (await meta.json().catch(() => null)) as
      | { ok?: boolean; result?: { file_path?: unknown } }
      | null;
    const path = body?.result?.file_path;
    if (body?.ok === true && typeof path === 'string' && path !== '') filePath = path;
  } else {
    // Pass Telegram's own getFile error through (JSON with CORS).
    return relay(meta);
  }
  if (filePath === null) {
    return errorResponse(502, 'getFile 未返回有效的 file_path');
  }

  // Step 2: download the file (URL built from the validated upstream path).
  const fileUrl = buildFileUrl(token, filePath);
  if (fileUrl === null) {
    return errorResponse(502, 'getFile 返回的 file_path 不合法');
  }
  const file = await fetchUpstream(fileUrl);
  if (file === null) {
    return errorResponse(502, '下载文件失败（上游网络错误或超时）');
  }
  if (!file.ok && file.headers.get('content-type')?.includes('application/json')) {
    return relay(file);
  }
  if (!file.ok) {
    return errorResponse(file.status, `下载文件失败（HTTP ${file.status}）`);
  }
  return relay(file);
}

export default {
  async fetch(request: Request, env?: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return errorResponse(405, '仅支持 GET');
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({ ok: true, service: 'tgsticker2matrix' });
    }
    if (url.pathname === '/sticker-set') return handleStickerSet(request, url);
    if (url.pathname === '/file') return handleFile(request, url);

    // Not an API route: hand over to static assets (SPA fallback included).
    if (!env?.ASSETS) return errorResponse(500, '静态资源绑定缺失（ASSETS）');
    return env.ASSETS.fetch(request);
  },
};
