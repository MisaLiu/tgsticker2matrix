import { useEffect, useRef, useState } from 'preact/hooks';
import type { MatrixClient } from '../lib/matrix';
import {
  downloadBytes,
  runImport,
  type RunConfig,
  type RunProgress,
  type RunStage,
  type RunResult,
} from '../lib/pipeline';
import { t, useLocale, type I18nKey } from '../i18n';
import type { OptionsState } from './OptionsStep';
import type { PackData } from './PreviewStep';

interface Props {
  pack: PackData;
  options: OptionsState;
  tgToken: string;
  matrix: MatrixClient | null;
  onRestart: (keepPack: boolean) => void;
}

type Phase = 'running' | 'success' | 'error';

const STAGE_LABELS: Record<RunStage, I18nKey> = {
  convert: 'stage.convert',
  zip: 'stage.zip',
  upload: 'stage.upload',
  write: 'stage.write',
  done: 'run.done', // terminal pseudo-stage, never listed
};

export function RunStep(props: Props) {
  useLocale();
  const [phase, setPhase] = useState<Phase>('running');
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const startedRef = useRef(false);

  const activeStages: RunStage[] = ['convert'];
  if (props.options.targets.zip || props.options.targets.fluffy) activeStages.push('zip');
  if (props.options.targets.user || props.options.targets.room) {
    activeStages.push('upload', 'write');
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const config: RunConfig = {
      telegramToken: props.tgToken,
      matrix: props.matrix,
      targets: props.options.targets,
      convertAnimated: props.options.convertAnimated,
      roomMode: props.options.roomMode,
    };

    let cancelled = false;
    setPhase('running');
    setError(null);
    setResult(null);
    setProgress(null);

    runImport(props.pack.set, props.pack.stickers, config, (p) => {
      if (!cancelled) setProgress(p);
    })
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setPhase('success');
        if (res.zip) {
          downloadBytes(res.zip.bytes, res.zip.filename, 'application/zip');
        }
        if (res.fluffyZip) {
          downloadBytes(res.fluffyZip.bytes, res.fluffyZip.filename, 'application/zip');
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const retry = (): void => {
    startedRef.current = false;
    setRetryToken((n) => n + 1);
  };

  const stageState = (stage: RunStage): 'pending' | 'active' | 'done' => {
    if (phase === 'success') return 'done';
    if (!progress) return 'pending';
    const activeIndex = activeStages.indexOf(progress.stage);
    const stageIndex = activeStages.indexOf(stage);
    if (stageIndex < 0) return 'pending';
    if (stageIndex < activeIndex) return 'done';
    if (stageIndex === activeIndex) return 'active';
    return 'pending';
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : progress
        ? 0
        : null;

  return (
    <div class="card">
      <h2>{t('run.title')}</h2>
      <p class="sub">
        {props.pack.set.title} — {t('run.count', { n: props.pack.stickers.length })}
      </p>

      {phase === 'running' && (
        <>
          <div class="progress">
            <div style={`width:${percent ?? 0}%`} />
          </div>
          {progress && (
            <div class="small" style="margin-top:8px">
              {progress.detail ?? ''}
              {progress.total > 0 ? ` — ${progress.current}/${progress.total}` : ''}
            </div>
          )}
        </>
      )}

      <ul class="stage-list">
        {activeStages.map((stage) => {
          const state = stageState(stage);
          return (
            <li class={state === 'done' ? 'done' : state === 'active' ? 'active' : ''}>
              <span class="icon">{state === 'done' ? '✓' : state === 'active' ? '…' : '·'}</span>
              {t(STAGE_LABELS[stage])}
            </li>
          );
        })}
        {phase === 'error' && (
          <li class="failed">
            <span class="icon">✕</span>
            {t('run.failed')}
          </li>
        )}
      </ul>

      {phase === 'error' && (
        <>
          <div class="error-box">{error}</div>
          <div class="row" style="margin-top:12px">
            <button type="button" class="primary" onClick={retry}>
              {t('run.retry')}
            </button>
            <button type="button" onClick={() => props.onRestart(true)}>
              {t('run.backToEdit')}
            </button>
          </div>
        </>
      )}

      {phase === 'success' && result && (
        <div class="summary">
          <div class="status ok">{t('run.done')}</div>
          <ul>
            {result.zip && (
              <li>
                {t('run.sableZipReady', { file: result.zip.filename })}
                <button
                  type="button"
                  style="margin-left:10px"
                  onClick={() =>
                    downloadBytes(result.zip!.bytes, result.zip!.filename, 'application/zip')
                  }
                >
                  {t('run.redownload')}
                </button>
              </li>
            )}
            {result.fluffyZip && (
              <li>
                {t('run.fluffyZipReady', { file: result.fluffyZip.filename })}
                <button
                  type="button"
                  style="margin-left:10px"
                  onClick={() =>
                    downloadBytes(
                      result.fluffyZip!.bytes,
                      result.fluffyZip!.filename,
                      'application/zip',
                    )
                  }
                >
                  {t('run.redownload')}
                </button>
              </li>
            )}
            {result.userImported && <li>{t('run.userImported')}</li>}
            {result.room && (
              <li>
                {t('run.roomWritten', { name: result.room.displayName })}
                <span class="small"> （{result.room.roomId} · {result.room.stateKey}）</span>
              </li>
            )}
          </ul>

          {(result.degraded > 0 || result.skipped > 0 || result.droppedShortcodes.length > 0) && (
            <div class="warnings">
              {result.degraded > 0 && <div>{t('run.warnDegraded', { n: result.degraded })}</div>}
              {result.skipped > 0 && <div>{t('run.warnSkipped', { n: result.skipped })}</div>}
              {result.droppedShortcodes.length > 0 && (
                <div>
                  {t('run.warnDropped', { n: result.droppedShortcodes.length })}
                  {result.droppedShortcodes.slice(0, 10).join(t('run.listSep'))}
                  {result.droppedShortcodes.length > 10 ? ' …' : ''}
                </div>
              )}
            </div>
          )}

          <div class="field" style="margin-top:16px">
            <div class="small">
              {result.room || result.userImported ? (
                t('run.howToMatrix', {
                  name: result.room?.displayName ?? props.pack.set.title,
                })
              ) : (
                <>
                  {result.zip && <>{t('run.howToSable')}</>}
                  {result.fluffyZip && <>{t('run.howToFluffy')}</>}
                </>
              )}
            </div>
          </div>

          <div class="row" style="margin-top:14px">
            <button type="button" class="primary" onClick={() => props.onRestart(false)}>
              {t('run.again')}
            </button>
            <button type="button" onClick={() => props.onRestart(true)}>
              {t('run.rerun')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
