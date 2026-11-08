import { useState, type FormEvent } from 'react';
import type { Profile } from '../../shared/types';
import { errorKey, useT } from '../i18n';
import { api } from '../lib';
import { Mark, Spinner } from './ui';

export function Connect({ onConnected, demo }: { onConnected: (p: Profile) => void; demo: boolean }) {
  const t = useT();
  const [profile, setProfile] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api.connect(profile, key);
    setBusy(false);
    if (r.ok) onConnected(r.data);
    else setError(t(errorKey(r.code)));
  }

  const ready = demo || (profile.trim().length > 1 && key.trim().length > 0);

  return (
    <div className="connect">
      <div className="drag-strip" />
      <section className="connect-copy">
        <div className="brand">
          <Mark size={26} />
          <span>{t('app.name')}</span>
        </div>
        <p className="eyebrow">{t('connect.eyebrow')}</p>
        <h1 className="display connect-title">{t('connect.title')}</h1>
        <p className="lead">{t('connect.lead')}</p>

        <div className="why">
          <h2>{t('connect.why.title')}</h2>
          <ol>
            <li>{t('connect.why.1')}</li>
            <li>{t('connect.why.2')}</li>
            <li>
              <span>
                {t('connect.why.3')}{' '}
                <button type="button" className="link" onClick={() => api.openExternal('https://steamcommunity.com/my/edit/settings')}>
                  {t('connect.privacy')} ↗
                </button>
              </span>
            </li>
          </ol>
        </div>
      </section>

      <form className="connect-form" onSubmit={submit}>
        <label className="field">
          <span className="field-num">01</span>
          <span className="field-label">{t('connect.step1')}</span>
          <input
            autoFocus
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="https://steamcommunity.com/id/…"
            spellCheck={false}
          />
          <span className="field-hint">{t('connect.step1.hint')}</span>
        </label>

        <label className="field">
          <span className="field-num">02</span>
          <span className="field-label">{t('connect.step2')}</span>
          <div className="input-row">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type={showKey ? 'text' : 'password'}
              placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              spellCheck={false}
              className="mono"
            />
            <button type="button" className="ghost small" onClick={() => setShowKey(!showKey)}>
              {showKey ? t('connect.hide') : t('connect.show')}
            </button>
          </div>
          <span className="field-hint">
            {t('connect.step2.hint')}{' '}
            <button type="button" className="link" onClick={() => api.openExternal('https://steamcommunity.com/dev/apikey')}>
              {t('connect.getKey')} ↗
            </button>
          </span>
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="primary" disabled={!ready || busy}>
          {busy ? (
            <>
              <Spinner /> {t('connect.working')}
            </>
          ) : (
            t('connect.submit')
          )}
        </button>
        {demo && <p className="field-hint center">{t('common.demo')}</p>}
      </form>
    </div>
  );
}
