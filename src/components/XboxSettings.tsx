import { useState } from 'react';
import type { Settings } from '../../shared/types';
import { errorKey, useT } from '../i18n';
import { api } from '../lib';
import { PlatformBadge, Spinner } from './ui';

/** Ustawienia → Xbox: trzy kroki do połączenia (klucz OpenXBL gracza zostaje tylko na tym komputerze). */
export function XboxSettings({ settings, onChange }: { settings: Settings; onChange: () => void }) {
  const t = useT();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const x = settings.xbox;

  async function connect() {
    setBusy(true);
    setError(null);
    const r = await api.connectXbox(key);
    setBusy(false);
    if (!r.ok) return setError(t(errorKey(r.code)));
    setKey('');
    onChange();
  }

  return (
    <section className="setting" id="xbox">
      <div className="setting-label">
        <h2>
          <PlatformBadge platform="xbox" />
        </h2>
        <p>{t('xbox.hint')}</p>
      </div>
      <div className="setting-body">
        {x ? (
          <div className="profile-card">
            {x.avatar ? <img src={x.avatar} alt="" /> : <div className="avatar-fallback">{x.gamertag.slice(0, 1)}</div>}
            <p className="strong">{t('xbox.connected', { g: x.gamertag })}</p>
            <button
              className="ghost danger"
              onClick={async () => {
                await api.disconnectXbox();
                onChange();
              }}
            >
              {t('xbox.disconnect')}
            </button>
          </div>
        ) : (
          <>
            <ol className="xbox-steps">
              <li>
                {t('xbox.step1')}{' '}
                <button className="link" onClick={() => api.openExternal('https://xbl.io/')}>
                  {t('xbox.open')} ↗
                </button>
              </li>
              <li>{t('xbox.step2')}</li>
              <li>{t('xbox.step3')}</li>
            </ol>
            <div className="input-row">
              <input
                className="mono"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t('xbox.keyPlaceholder')}
                spellCheck={false}
              />
              <button className="primary small" disabled={key.trim().length < 20 || busy} onClick={connect}>
                {busy ? <Spinner /> : t('xbox.connect')}
              </button>
            </div>
            {error && <p className="save-note err">{error}</p>}
          </>
        )}
        <p className="about-notice">{t('xbox.note')}</p>
      </div>
    </section>
  );
}
