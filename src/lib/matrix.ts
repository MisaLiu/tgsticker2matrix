/**
 * Minimal Matrix Client-Server API client (fetch-based, no SDK).
 * Only the endpoints this app needs: discovery, whoami, media upload,
 * account data and room state.
 */

export class MatrixError extends Error {
  constructor(
    message: string,
    public readonly errcode?: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'MatrixError';
  }
}

const stripClientSuffix = (url: string): string =>
  url.replace(/\/_matrix\/client(?:\/v\d+(?:\/.*)?)?$/, '').replace(/\/+$/, '');

/** Resolve user input (https URL, bare domain or @user:domain) to a base URL. */
export async function resolveHomeserver(input: string): Promise<string> {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (trimmed === '') throw new MatrixError('请填写 homeserver 地址');

  if (trimmed.startsWith('@')) {
    const colon = trimmed.indexOf(':');
    const server = colon >= 0 ? trimmed.slice(colon + 1) : '';
    if (!server) throw new MatrixError('Matrix ID 格式不正确，应形如 @user:example.org');
    return wellKnownOrFallback(server);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return stripClientSuffix(trimmed);
  }

  return wellKnownOrFallback(trimmed);
}

async function wellKnownOrFallback(server: string): Promise<string> {
  const fallback = `https://${server}`;
  try {
    const response = await fetch(`${fallback}/.well-known/matrix/client`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data: unknown = await response.json();
      const base =
        typeof data === 'object' && data !== null
          ? (data as { 'm.homeserver'?: { base_url?: unknown } })['m.homeserver']?.base_url
          : undefined;
      if (typeof base === 'string' && base.startsWith('http')) {
        return stripClientSuffix(base);
      }
    }
  } catch {
    // fall through to the domain itself
  }
  return fallback;
}

interface ApiErrorBody {
  errcode?: string;
  error?: string;
}

function humanizeMatrixError(errcode: string | undefined, error: string | undefined, status: number): string {
  if (status === 403 || errcode === 'M_FORBIDDEN') {
    return '没有权限（homeserver 拒绝了该操作），请检查账号权限或选择其他房间';
  }
  if (errcode === 'M_UNKNOWN_TOKEN' || errcode === 'M_MISSING_TOKEN') {
    return 'access token 无效或已过期';
  }
  if (errcode === 'M_NOT_FOUND') return '资源不存在';
  return error ?? `${errcode ?? 'M_UNKNOWN'}（HTTP ${status}）`;
}

export class MatrixClient {
  private constructor(
    public readonly baseUrl: string,
    public readonly accessToken: string,
    public readonly userId: string,
  ) {}

  static async connect(baseUrl: string, accessToken: string): Promise<MatrixClient> {
    const base = stripClientSuffix(baseUrl);
    const token = accessToken.trim();
    if (token === '') throw new MatrixError('请填写 access token');

    // Sanity check: this should be a homeserver.
    try {
      const versions = await fetch(`${base}/_matrix/client/versions`);
      if (!versions.ok) {
        throw new MatrixError(
          `该地址不是可用的 Matrix homeserver（/_matrix/client/versions 返回 HTTP ${versions.status}）`,
        );
      }
    } catch (e) {
      if (e instanceof MatrixError) throw e;
      throw new MatrixError(
        '无法连接 homeserver（网络错误或 CORS 受限）。主流服务器（Synapse/Conduit 等）均可跨域访问',
      );
    }

    const response = await fetch(`${base}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody & { user_id?: string };
    if (!response.ok || !body.user_id) {
      throw new MatrixError(
        humanizeMatrixError(body.errcode, body.error, response.status),
        body.errcode,
        response.status,
      );
    }
    return new MatrixClient(base, token, body.user_id);
  }

  private async request(
    method: string,
    path: string,
    options: { body?: unknown; rawBody?: BodyInit; contentType?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.accessToken}` };
    let body: BodyInit | undefined;
    if (options.rawBody !== undefined) {
      body = options.rawBody;
      if (options.contentType) headers['Content-Type'] = options.contentType;
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { method, headers, body });
    } catch {
      throw new MatrixError('请求 homeserver 失败（网络错误）');
    }
    if (!response.ok) {
      const parsed = (await response.json().catch(() => ({}))) as ApiErrorBody;
      throw new MatrixError(
        humanizeMatrixError(parsed.errcode, parsed.error, response.status),
        parsed.errcode,
        response.status,
      );
    }
    return response;
  }

  /** Upload media, returns the mxc:// content URI. */
  async uploadMedia(blob: Blob, filename: string): Promise<string> {
    const response = await this.request(
      'POST',
      `/_matrix/media/v3/upload?filename=${encodeURIComponent(filename)}`,
      { rawBody: blob, contentType: blob.type || 'application/octet-stream' },
    );
    const data = (await response.json()) as { content_uri?: string };
    if (!data.content_uri) throw new MatrixError('上传成功但未返回 content_uri');
    return data.content_uri;
  }

  async getAccountData(type: string): Promise<unknown | null> {
    const path = `/_matrix/client/v3/user/${encodeURIComponent(this.userId)}/account_data/${encodeURIComponent(type)}`;
    try {
      const response = await this.request('GET', path);
      return (await response.json()) as unknown;
    } catch (error) {
      // "Never set" is a normal state — some servers omit the M_NOT_FOUND
      // errcode, so accept a bare 404 as well.
      if (
        error instanceof MatrixError &&
        (error.errcode === 'M_NOT_FOUND' || error.httpStatus === 404)
      ) {
        return null;
      }
      throw error;
    }
  }

  async setAccountData(type: string, content: unknown): Promise<void> {
    await this.request(
      'PUT',
      `/_matrix/client/v3/user/${encodeURIComponent(this.userId)}/account_data/${encodeURIComponent(type)}`,
      { body: content },
    );
  }

  async sendState(roomId: string, type: string, stateKey: string, content: unknown): Promise<void> {
    const path = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(type)}/${encodeURIComponent(stateKey)}`;
    await this.request('PUT', path, { body: content });
  }

  async createRoom(name: string): Promise<string> {
    const response = await this.request('POST', '/_matrix/client/v3/createRoom', {
      body: {
        name,
        visibility: 'private',
        preset: 'trusted_private_chat',
        initial_state: [],
        // Overlay onto the server's default power levels — do NOT set `users`:
        // on room v12+ (MSC4289) the creator must be absent from content.users
        // (their power is derived implicitly), while older room versions get
        // `{creator: 100}` from the server's own version-aware default.
        power_level_content_override: {
          users_default: 0,
          events: {
            'm.room.name': 50,
            'm.room.power_levels': 100,
            'm.room.history_visibility': 100,
            'm.room.canonical_alias': 50,
            'm.room.avatar': 50,
            'm.room.tombstone': 100,
            'm.room.server_acl': 100,
            'm.room.encryption': 100,
          },
          events_default: 0,
          state_default: 50,
          invite: 50,
          kick: 50,
          ban: 50,
          redact: 50,
        },
      },
    });
    const data = (await response.json()) as { room_id?: string };
    if (!data.room_id) throw new MatrixError('创建房间成功但未返回 room_id');
    return data.room_id;
  }

  async joinedRooms(): Promise<string[]> {
    const response = await this.request('GET', '/_matrix/client/v3/joined_rooms');
    const data = (await response.json()) as { joined_rooms?: string[] };
    return data.joined_rooms ?? [];
  }

  async roomName(roomId: string): Promise<string | null> {
    try {
      const response = await this.request(
        'GET',
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name`,
      );
      const data = (await response.json()) as { name?: string };
      return data.name ?? null;
    } catch {
      return null;
    }
  }
}
