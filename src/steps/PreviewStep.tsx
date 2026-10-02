import { useEffect, useState } from 'preact/hooks';
import {
  downloadStickerSet,
  getStickerSet,
  parsePackRef,
  type DownloadedSticker,
  type TgStickerSet,
} from '../lib/telegram';
import { t, useLocale } from '../i18n';

export interface PackData {
  set: TgStickerSet;
  stickers: DownloadedSticker[];
  errors: { index: number; message: string }[];
}

interface Props {
  tgToken: string;
  pack: PackData | null;
  onPack: (pack: PackData | null) => void;
}

type Phase = 'idle' | 'loading' | 'ready' | 'error';

export function PreviewStep(props: Props) {
  useLocale();
  const [ref, setRef] = useState('');
  const [phase, setPhase] = useState<Phase>(props.pack ? 'ready' : 'idle');
  const [progress, setProgress] = useState<{ current: number; total: number; detail: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    if (!props.pack) return;
    const map = new Map<string, string>();
    for (const item of props.pack.stickers) {
      const blob = item.kind === 'static' ? item.blob : item.thumb;
      if (blob) map.set(item.sticker.file_unique_id, URL.createObjectURL(blob));
    }
    setPreviewUrls(map);
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
    };
  }, [props.pack]);

  const fetchPack = async (): Promise<void> => {
    const token = props.tgToken.trim();
    if (!token) {
      setError(t('preview.needToken'));
      setPhase('error');
      return;
    }
    setPhase('loading');
    setError(null);
    setWarning(null);
    setProgress(null);
    props.onPack(null);

    try {
      const name = parsePackRef(ref);
      setProgress({ current: 0, total: 0, detail: t('preview.readingInfo') });
      const set = await getStickerSet(token, name);
      const { stickers, errors } = await downloadStickerSet(token, set, (p) =>
        setProgress(p),
      );
      if (errors.length > 0) {
        setWarning(t('preview.downloadFailed', { n: errors.length }));
      }
      if (stickers.length === 0) {
        throw new Error(t('preview.noStickers'));
      }
      props.onPack({ set, stickers, errors });
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    } finally {
      setProgress(null);
    }
  };

  const pack = props.pack;
  const counts = pack
    ? {
        static: pack.stickers.filter((s) => s.kind === 'static').length,
        animated: pack.stickers.filter((s) => s.kind === 'animated').length,
        video: pack.stickers.filter((s) => s.kind === 'video').length,
      }
    : null;

  const previewUrl = (item: DownloadedSticker): string | null =>
    previewUrls.get(item.sticker.file_unique_id) ?? null;

  return (
    <div class="card">
      <h2>{t('preview.title')}</h2>
      <p class="sub">{t('preview.sub')}</p>

      <div class="field">
        <label for="pack-ref">{t('preview.refLabel')}</label>
        <div class="row">
          <input
            id="pack-ref"
            type="text"
            placeholder={t('preview.refPlaceholder')}
            value={ref}
            onInput={(e) => setRef((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && phase !== 'loading') void fetchPack();
            }}
          />
          <button
            type="button"
            class="primary"
            disabled={phase === 'loading' || !ref.trim()}
            onClick={fetchPack}
          >
            {phase === 'loading' ? t('preview.fetching') : t('preview.fetch')}
          </button>
        </div>
        {phase === 'loading' && progress && (
          <>
            <div class="hint" style="margin-top:10px">
              {progress.detail}
              {progress.total > 0 ? ` — ${progress.current}/${progress.total}` : ''}
            </div>
            {progress.total > 0 && (
              <div class="progress" style="margin-top:6px">
                <div style={`width:${Math.round((progress.current / progress.total) * 100)}%`} />
              </div>
            )}
          </>
        )}
      </div>

      {error && <div class="status error">{error}</div>}
      {warning && <div class="status info">{warning}</div>}

      {pack && phase === 'ready' && (
        <>
          <div class="meta-line">
            <span>
              <strong>{pack.set.title}</strong>
            </span>
            <span>
              {t('preview.countPrefix')}
              <strong>{pack.stickers.length}</strong>
              {t('preview.countSuffix')}
            </span>
            {counts && (
              <>
                <span>{t('preview.countStatic', { n: counts.static })}</span>
                <span>{t('preview.countAnimated', { n: counts.animated })}</span>
                <span>{t('preview.countVideo', { n: counts.video })}</span>
              </>
            )}
            {pack.errors.length > 0 && (
              <span style="color:var(--error)">
                {t('preview.countFailed', { n: pack.errors.length })}
              </span>
            )}
          </div>
          <div class="grid">
            {pack.stickers.map((item) => {
              const url = previewUrl(item);
              return (
                <div class="sticker-cell" title={item.sticker.emoji ?? ''}>
                  {url ? (
                    <img src={url} alt={item.sticker.emoji ?? ''} loading="lazy" />
                  ) : (
                    <span class="placeholder">🎞️</span>
                  )}
                  {item.kind === 'animated' && (
                    <span class="badge">{t('preview.badgeAnimated')}</span>
                  )}
                  {item.kind === 'video' && <span class="badge">{t('preview.badgeVideo')}</span>}
                  {item.sticker.emoji && <span class="emoji">{item.sticker.emoji}</span>}
                </div>
              );
            })}
          </div>
          {pack.errors.length > 0 && (
            <div class="warnings">
              {t('preview.downloadErrors')}
              <ul>
                {pack.errors.slice(0, 5).map((e) => (
                  <li>
                    #{e.index + 1}：{e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
