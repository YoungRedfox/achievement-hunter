import { useState } from 'react';
import type { Lang, Settings } from '../../shared/types';
import { errorKey, useT } from '../i18n';
import { api } from '../lib';
import { Spinner } from './ui';

export function SettingsView({
  settings,
  onChange,
  onDisconnect,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onDisconnect: () => void;
}) {
  const t = useT();
  const [steamKey, setSteamKey] = useState('');
  const [openAiKey, setOpenAiKey] = useState('');
  const [model, setModel] = useState(settings.openAiModel);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ section: string; text: string; error?: boolean } | null>(null);

  async function save(section: string, patch: Parameters<typeof api.updateSettings>[0]) {
    setBusy(section);
    setMsg(null);
    const r = await api.updateSettings(patch);
    setBusy(null);
    if (r.ok) {
      onChange(r.data);
      setMsg({ section, text: t('settings.saved') });
      return true;
    }
    setMsg({ section, text: t(errorKey(r.code)), error: true });
    return false;
  }

  const note = (section: string) =>
    msg?.section === section && <span className={`save-note ${msg.error ? 'err' : ''}`}>{msg.text}</span>;

  const p = settings.profile;

  return (
    <div className="page settings">
      <header className="page-head">
        <h1 className="display">{t('settings.title')}</h1>
      </header>

      <section className="setting">
        <div className="setting-label">
          <h2>{t('settings.account')}</h2>
        </div>
        <div className="setting-body">
          {p && (
            <div className="profile-card">
              {p.avatar ? <img src={p.avatar} alt="" /> : <div className="avatar-fallback">{p.name.slice(0, 1)}</div>}
              <div>
                <p className="strong">{p.name}</p>
                <button className="link mono small" onClick={() => api.openExternal(p.profileUrl)}>
                  {p.steamid} ↗
                </button>
              </div>
              <button
                className="ghost danger"
                onClick={async () => {
                  if (!confirm(t('settings.disconnect.confirm'))) return;
                  await api.disconnect();
                  onDisconnect();
                }}
              >
                {t('settings.disconnect')}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>{t('settings.steamKey')}</h2>
          <p>{t('settings.steamKey.hint')}</p>
        </div>
        <div className="setting-body">
          <div className="input-row">
            <input
              className="mono"
              type="password"
              value={steamKey}
              onChange={(e) => setSteamKey(e.target.value)}
              placeholder={settings.hasSteamKey ? '•••••••••••••••• ' + t('settings.keySet') : t('settings.keyMissing')}
            />
            <button
              className="ghost"
              disabled={!steamKey.trim() || busy === 'steam'}
              onClick={async () => (await save('steam', { steamKey })) && setSteamKey('')}
            >
              {busy === 'steam' ? <Spinner /> : t('settings.save')}
            </button>
          </div>
          {note('steam')}
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>{t('settings.openai')}</h2>
          <p>{t('settings.openai.hint')}</p>
          <button className="link" onClick={() => api.openExternal('https://platform.openai.com/api-keys')}>
            {t('settings.openai.getKey')} ↗
          </button>
        </div>
        <div className="setting-body">
          <div className="input-row">
            <input
              className="mono"
              type="password"
              value={openAiKey}
              onChange={(e) => setOpenAiKey(e.target.value)}
              placeholder={settings.hasOpenAiKey ? '•••••••••••••••• ' + t('settings.keySet') : 'sk-…'}
            />
            <button
              className="ghost"
              disabled={!openAiKey.trim() || busy === 'openai'}
              onClick={async () => (await save('openai', { openAiKey })) && setOpenAiKey('')}
            >
              {busy === 'openai' ? <Spinner /> : t('settings.save')}
            </button>
          </div>
          <label className="inline-field">
            <span>{t('settings.openai.model')}</span>
            <input
              className="mono"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => model !== settings.openAiModel && save('openai', { openAiModel: model })}
            />
          </label>
          {settings.hasOpenAiKey && (
            <button className="link danger" onClick={() => save('openai', { openAiKey: null })}>
              {t('settings.openai.remove')}
            </button>
          )}
          {note('openai')}
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>{t('settings.lang')}</h2>
          <p>{t('settings.lang.hint')}</p>
        </div>
        <div className="setting-body">
          <div className="tabs">
            {(['pl', 'en'] as Lang[]).map((l) => (
              <button key={l} className={settings.lang === l ? 'on' : ''} onClick={() => save('lang', { lang: l })}>
                {l === 'pl' ? 'Polski' : 'English'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>{t('settings.data')}</h2>
          <p>{t('settings.clearCache.hint')}</p>
        </div>
        <div className="setting-body">
          <button
            className="ghost"
            onClick={async () => {
              await api.clearCache();
              setMsg({ section: 'data', text: t('settings.saved') });
            }}
          >
            {t('settings.clearCache')}
          </button>
          {note('data')}
        </div>
      </section>
    </div>
  );
}
