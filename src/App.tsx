import { useEffect, useState } from 'preact/hooks';
import type { MatrixClient } from './lib/matrix';
import {
  clearAppState,
  loadAppState,
  persistCredentials,
  persistRemember,
} from './lib/credentials';
import { getLocale, setLocale, t, useLocale, type I18nKey } from './i18n';
import { ConnectStep } from './steps/ConnectStep';
import { PreviewStep, type PackData } from './steps/PreviewStep';
import { OptionsStep, defaultOptions, optionsError, type OptionsState } from './steps/OptionsStep';
import { RunStep } from './steps/RunStep';

type Step = 'connect' | 'preview' | 'options' | 'run';

const STEP_ORDER: { key: Step; labelKey: I18nKey }[] = [
  { key: 'connect', labelKey: 'nav.connect' },
  { key: 'preview', labelKey: 'nav.preview' },
  { key: 'options', labelKey: 'nav.options' },
  { key: 'run', labelKey: 'nav.run' },
];

export function App() {
  useLocale();
  const [step, setStep] = useState<Step>('connect');
  const [initial] = useState(loadAppState);
  const [tgToken, setTgToken] = useState(initial.values.tgToken);
  const [hsInput, setHsInput] = useState(initial.values.hs);
  const [accessToken, setAccessToken] = useState(initial.values.access);
  const [remember, setRemember] = useState(initial.remember);
  const [matrix, setMatrix] = useState<MatrixClient | null>(null);
  const [pack, setPack] = useState<PackData | null>(null);
  const [options, setOptions] = useState<OptionsState>(defaultOptions);
  const [optionsMsg, setOptionsMsg] = useState<I18nKey | null>(null);

  // Single persistence path: while remember is on, every field change is
  // written immediately — independent of tick/type order and of whether the
  // Matrix connection was ever tested.
  useEffect(() => {
    if (remember) persistCredentials({ tgToken, hs: hsInput, access: accessToken });
  }, [remember, tgToken, hsInput, accessToken]);

  const handleRemember = (value: boolean): void => {
    setRemember(value);
    persistRemember(value);
    if (!value) clearAppState();
  };

  const goTo = (target: Step): void => {
    setOptionsMsg(null);
    setStep(target);
  };

  const tryOptionsNext = (): void => {
    const err = optionsError(options, matrix);
    if (err) {
      setOptionsMsg(err);
      return;
    }
    setOptionsMsg(null);
    setStep('run');
  };

  const restart = (keepPack: boolean): void => {
    if (!keepPack) setPack(null);
    setStep(keepPack ? 'options' : 'preview');
  };

  const currentIndex = STEP_ORDER.findIndex((s) => s.key === step);
  const locale = getLocale();

  return (
    <div class="app">
      <header class="header">
        <div class="header-top">
          <h1>tgsticker2matrix</h1>
          <div class="lang-switch" role="group" aria-label="Language">
            <button
              type="button"
              class={locale === 'zh-CN' ? 'active' : ''}
              aria-pressed={locale === 'zh-CN'}
              onClick={() => setLocale('zh-CN')}
            >
              中
            </button>
            <button
              type="button"
              class={locale === 'en' ? 'active' : ''}
              aria-pressed={locale === 'en'}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
        </div>
        <p>{t('app.tagline')}</p>
        <p>
            GitHub:&nbsp;
            <a
              href="https://github.com/MisaLiu/tgsticker2matrix"
              target="_blank"
            >https://github.com/MisaLiu/tgsticker2matrix</a>
          </p>
      </header>

      <nav class="steps">
        {STEP_ORDER.map((s, index) => (
          <span
            class={`step-dot${s.key === step ? ' active' : ''}${index < currentIndex ? ' done' : ''}`}
          >
            {index < currentIndex ? '✓' : index + 1}. {t(s.labelKey)}
          </span>
        ))}
      </nav>

      {step === 'connect' && (
        <ConnectStep
          tgToken={tgToken}
          onTgToken={setTgToken}
          hsInput={hsInput}
          onHsInput={setHsInput}
          accessToken={accessToken}
          onAccessToken={setAccessToken}
          matrix={matrix}
          onMatrix={setMatrix}
          remember={remember}
          onRemember={handleRemember}
        />
      )}

      {step === 'preview' && (
        <PreviewStep tgToken={tgToken} pack={pack} onPack={setPack} />
      )}

      {step === 'options' && (
        <>
          <OptionsStep matrix={matrix} options={options} onOptions={setOptions} />
          {optionsMsg && <div class="status error">{t(optionsMsg)}</div>}
        </>
      )}

      {step === 'run' && pack && (
        <RunStep
          pack={pack}
          options={options}
          tgToken={tgToken}
          matrix={matrix}
          onRestart={restart}
        />
      )}

      <footer class="footer">
        <div>
          {step !== 'connect' && step !== 'run' && (
            <button type="button" onClick={() => goTo(step === 'options' ? 'preview' : 'connect')}>
              {t('btn.back')}
            </button>
          )}
          {step === 'connect' && (
            <button
              type="button"
              class="primary"
              disabled={!tgToken.trim()}
              onClick={() => goTo('preview')}
            >
              {t('btn.next')}
            </button>
          )}
          {step === 'preview' && pack && (
            <button
              type="button"
              class="primary"
              style={step === 'preview' ? 'margin-left:8px' : ''}
              onClick={() => goTo('options')}
            >
              {t('btn.next')}
            </button>
          )}
          {step === 'options' && (
            <button type="button" class="primary" style="margin-left:8px" onClick={tryOptionsNext}>
              {t('btn.start')}
            </button>
          )}
        </div>
        <div class="small">
          {t('footer.savedNote')}
          <button
            type="button"
            style="margin-left:10px"
            onClick={() => {
              clearAppState();
              setRemember(false);
              setTgToken('');
              setHsInput('');
              setAccessToken('');
              setMatrix(null);
            }}
          >
            {t('btn.clearCreds')}
          </button>
        </div>
      </footer>
    </div>
  );
}
