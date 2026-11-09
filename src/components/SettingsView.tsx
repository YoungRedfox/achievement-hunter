import { useState } from 'react';
import type { Settings } from '../../shared/types';
import { LangSelect } from './LangSelect';
import { errorKey, useT } from '../i18n';
import { api } from '../lib';
import { Spinner } from './ui';

const AI_NAMES = { gemini: 'Google Gemini', openai: 'OpenAI' } as const;
const AI_KEY_PAGES = { gemini: 'https://aistudio.google.com/apikey', openai: 'https://platform.openai.com/api-keys' } as const;

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
  const [aiKey, setAiKey] = useState('');
  const [model, setModel] = useState('');
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
          <h2>{settings.proxyAvailable ? t('settings.steamKey.optional') : t('settings.steamKey')}</h2>
          <p>{settings.proxyAvailable && !settings.hasSteamKey ? t('settings.steamKey.optionalHint') : t('settings.steamKey.hint')}</p>
          <button className="link" onClick={() => api.openExternal('https://steamcommunity.com/dev/apikey')}>
            {t('connect.getKey')} ↗
          </button>
        </div>
        <div className="setting-body">
          <div className="input-row">
            <input
              className="mono"
              type="password"
              value={steamKey}
              onChange={(e) => setSteamKey(e.target.value)}
              placeholder={settings.hasSteamKey ? '•••••••••••••••• ' + t('settings.keySet') : 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'}
            />
            <button
              className="ghost"
              disabled={!steamKey.trim() || busy === 'steam'}
              onClick={async () => (await save('steam', { steamKey })) && setSteamKey('')}
            >
              {busy === 'steam' ? <Spinner /> : t('settings.save')}
            </button>
          </div>
          {settings.proxyAvailable && settings.hasSteamKey && (
            <button className="link danger" onClick={() => save('steam', { steamKey: null })}>
              {t('settings.steamKey.remove')}
            </button>
          )}
          {note('steam')}
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>{settings.proxyAvailable ? t('settings.ai.optional') : t('settings.ai')}</h2>
          <p>{settings.proxyAvailable ? t('settings.ai.hint') : t('settings.ai.hintNoServer')}</p>
          <button className="link" onClick={() => api.openExternal(AI_KEY_PAGES[settings.aiProvider])}>
            {t('settings.ai.getKey', { p: AI_NAMES[settings.aiProvider] })} ↗
          </button>
        </div>
        <div className="setting-body">
          <div className="tabs">
            {(['gemini', 'openai'] as const).map((p) => (
              <button
                key={p}
                className={settings.aiProvider === p ? 'on' : ''}
                onClick={() => {
                  if (p === settings.aiProvider) return;
                  if (settings.hasAiKey && !confirm(t('settings.ai.switch'))) return;
                  void save('ai', { aiProvider: p }).then((ok) => ok && setModel(''));
                }}
              >
                {AI_NAMES[p]}
              </button>
            ))}
          </div>
          <div className="input-row">
            <input
              className="mono"
              type="password"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              placeholder={settings.hasAiKey ? '•••••••••••••••• ' + t('settings.keySet') : settings.aiProvider === 'openai' ? 'sk-…' : 'AIza…'}
            />
            <button
              className="ghost"
              disabled={!aiKey.trim() || busy === 'ai'}
              onClick={async () => (await save('ai', { aiKey })) && setAiKey('')}
            >
              {busy === 'ai' ? <Spinner /> : t('settings.save')}
            </button>
          </div>
          <label className="inline-field">
            <span>{t('settings.openai.model')}</span>
            <input
              className="mono"
              value={model || settings.aiModel}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => model && model !== settings.aiModel && save('ai', { aiModel: model })}
            />
          </label>
          {settings.hasAiKey && (
            <button className="link danger" onClick={() => save('ai', { aiKey: null })}>
              {t('settings.openai.remove')}
            </button>
          )}
          {note('ai')}
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>{t('privacy.title')}</h2>
        </div>
        <div className="setting-body">
          <ul className="privacy">
            <li>{t('privacy.local')}</li>
            <li>{t('privacy.server')}</li>
            <li>{t('privacy.own')}</li>
          </ul>
        </div>
      </section>

      <section className="setting">
        <div className="setting-label">
          <h2>{t('settings.lang')}</h2>
          <p>{t('settings.lang.hint')}</p>
        </div>
        <div className="setting-body">
          <LangSelect value={settings.lang} onChange={(lang) => save('lang', { lang })} />
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
