import { useState } from 'preact/hooks';
import { MatrixClient, resolveHomeserver } from '../lib/matrix';
import { testApi, TelegramError } from '../lib/telegram';
import { t, useLocale } from '../i18n';

interface Props {
  tgToken: string;
  onTgToken: (value: string) => void;
  hsInput: string;
  onHsInput: (value: string) => void;
  accessToken: string;
  onAccessToken: (value: string) => void;
  matrix: MatrixClient | null;
  onMatrix: (client: MatrixClient | null) => void;
  remember: boolean;
  onRemember: (value: boolean) => void;
}

export function ConnectStep(props: Props) {
  useLocale();
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [apiTesting, setApiTesting] = useState(false);
  const [apiStatus, setApiStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const checkApi = async (): Promise<void> => {
    setApiTesting(true);
    setApiStatus(null);
    try {
      await testApi();
      setApiStatus({ ok: true, message: t('connect.apiOk') });
    } catch (error) {
      setApiStatus({
        ok: false,
        message: error instanceof TelegramError || error instanceof Error ? error.message : String(error),
      });
    } finally {
      setApiTesting(false);
    }
  };

  const connectMatrix = async (): Promise<void> => {
    setTesting(true);
    setTestError(null);
    try {
      const base = await resolveHomeserver(props.hsInput);
      const client = await MatrixClient.connect(base, props.accessToken);
      props.onMatrix(client);
    } catch (error) {
      props.onMatrix(null);
      setTestError(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  };

  const disconnect = (): void => {
    props.onMatrix(null);
    setTestError(null);
  };

  return (
    <div class="card">
      <h2>{t('connect.title')}</h2>
      <p class="sub">{t('connect.sub')}</p>

      <div class="field">
        <label for="tg-token">{t('connect.tgTokenLabel')}</label>
        <input
          id="tg-token"
          type="password"
          placeholder="123456789:AA..."
          value={props.tgToken}
          onInput={(e) => props.onTgToken((e.currentTarget as HTMLInputElement).value)}
        />
        <div class="hint">
          {t('connect.tgTokenHintA')}
          <code>@BotFather</code>
          {t('connect.tgTokenHintB')}
          <code>/newbot</code>
          {t('connect.tgTokenHintC')}
        </div>
        <div class="row" style="margin-top:8px">
          <button type="button" disabled={apiTesting} onClick={checkApi}>
            {apiTesting ? t('connect.apiTesting') : t('connect.apiTest')}
          </button>
          {apiStatus && (
            <span class={`status ${apiStatus.ok ? 'ok' : 'error'}`} style="margin-top:0">
              {apiStatus.message}
            </span>
          )}
        </div>
      </div>

      <hr class="divider" />

      <label class="checkbox">
        <input
          type="checkbox"
          checked={props.remember}
          onChange={(e) => props.onRemember((e.currentTarget as HTMLInputElement).checked)}
        />
        <span>
          <div class="title">{t('connect.rememberTitle')}</div>
          <div class="desc">
            {props.remember
              ? props.tgToken
                ? t('connect.rememberOn')
                : t('connect.rememberOnEmpty')
              : t('connect.rememberOff')}
          </div>
        </span>
      </label>

      <div class="field">
        <label for="hs">{t('connect.hsLabel')}</label>
        <input
          id="hs"
          type="text"
          placeholder={t('connect.hsPlaceholder')}
          value={props.hsInput}
          onInput={(e) => props.onHsInput((e.currentTarget as HTMLInputElement).value)}
        />
        <div class="hint">{t('connect.hsHint')}</div>
      </div>

      <div class="field">
        <label for="token">{t('connect.accessLabel')}</label>
        <input
          id="token"
          type="password"
          placeholder="syt_..."
          value={props.accessToken}
          onInput={(e) => props.onAccessToken((e.currentTarget as HTMLInputElement).value)}
        />
        <div class="hint">
          {t('connect.accessHintA')}
          <code> GET /_matrix/client/v3/login</code>
          {t('connect.accessHintB')}
        </div>
      </div>

      <div class="row">
        {props.matrix ? (
          <button type="button" onClick={disconnect}>
            {t('connect.disconnect', { user: props.matrix.userId, server: props.matrix.baseUrl })}
          </button>
        ) : (
          <button
            type="button"
            class="primary"
            disabled={testing || !props.hsInput.trim() || !props.accessToken.trim()}
            onClick={connectMatrix}
          >
            {testing ? t('connect.connecting') : t('connect.connectTest')}
          </button>
        )}
      </div>
      {!props.matrix && (
        <div class="matrix-import-hint" role="note">
          {t('connect.matrixImportHint')}
        </div>
      )}

      {props.matrix && (
        <div class="status ok">{t('connect.connected', { user: props.matrix.userId })}</div>
      )}
      {testError && <div class="status error">{testError}</div>}
    </div>
  );
}
