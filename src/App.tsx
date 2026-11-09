import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ErrorCode, Library as LibraryData, ScanProgress, Settings } from '../shared/types';
import { Connect } from './components/Connect';
import { GameView } from './components/GameView';
import { Library, type Filter } from './components/Library';
import { SettingsView } from './components/SettingsView';
import { Icon, Mark } from './components/ui';
import { LangContext, errorKey, makeT } from './i18n';
import { api } from './lib';

type Route = { name: 'library' } | { name: 'game'; appid: number } | { name: 'settings' };

function parseHash(h: string): Route {
  const m = h.match(/^#\/game\/(\d+)/);
  if (m) return { name: 'game', appid: Number(m[1]) };
  if (h.startsWith('#/settings')) return { name: 'settings' };
  return { name: 'library' };
}
const go = (r: Route) => {
  location.hash = r.name === 'game' ? `#/game/${r.appid}` : r.name === 'settings' ? '#/settings' : '#/';
};

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  const [lib, setLib] = useState<LibraryData | null>(null);
  const [libError, setLibError] = useState<ErrorCode | null>(null);
  const [scan, setScan] = useState<ScanProgress>({ done: 0, total: 0, running: false });
  // Domyślnie wszystkie gry — gracz sam wybiera, którą sprawdzić
  const [filter, setFilter] = useState<Filter>('all');

  const t = useMemo(() => makeT(settings?.lang ?? 'pl'), [settings?.lang]);

  useEffect(() => {
    api.getSettings().then((r) => r.ok && setSettings(r.data));
    const onHash = () => {
      setRoute(parseHash(location.hash));
      document.querySelector('.main')?.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    const offProgress = api.onScanProgress(setScan);
    // Wynik każdej sprawdzonej gry od razu trafia na jej kartę
    const offSummary = api.onSummary((appid, s) =>
      setLib((prev) => prev && { ...prev, games: prev.games.map((g) => (g.appid === appid ? { ...g, summary: s } : g)) }),
    );
    return () => {
      window.removeEventListener('hashchange', onHash);
      offProgress();
      offSummary();
    };
  }, []);

  const loadLibrary = useCallback(async (refresh: boolean) => {
    setLibError(null);
    const r = await api.getLibrary(refresh);
    if (r.ok) setLib(r.data);
    else setLibError(r.code);
  }, []);

  const connected = !!settings?.profile;
  useEffect(() => {
    if (connected) void loadLibrary(false);
  }, [connected, loadLibrary]);

  if (!settings) return <div className="boot" />;

  const ctx = { lang: settings.lang, t };

  if (!settings.profile) {
    return (
      <LangContext.Provider value={ctx}>
        <Connect
          demo={settings.demo}
          needsKey={!settings.proxyAvailable}
          onConnected={(profile) => setSettings({ ...settings, profile })}
        />
      </LangContext.Provider>
    );
  }

  const p = settings.profile;
  const withStats = lib?.games.filter((g) => g.hasStats) ?? [];
  const checked = withStats.filter((g) => g.summary).length;
  const rest = withStats.length - checked;

  function checkRest() {
    const minutes = Math.max(1, Math.round(rest / 150));
    if (confirm(t('scan.confirm', { n: rest, m: minutes }))) void api.startScan(false);
  }

  return (
    <LangContext.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <div className="drag-strip" />
          <div className="brand">
            <Mark />
            <span>{t('app.name')}</span>
          </div>
          <nav>
            <button className={route.name !== 'settings' ? 'on' : ''} onClick={() => go({ name: 'library' })}>
              <Icon.Library /> {t('nav.library')}
            </button>
            <button className={route.name === 'settings' ? 'on' : ''} onClick={() => go({ name: 'settings' })}>
              <Icon.Settings /> {t('nav.settings')}
            </button>
          </nav>

          <div className="sidebar-foot">
            {lib && withStats.length > 0 && (
              <div className={`scan ${scan.running ? 'running' : ''}`}>
                {scan.running ? (
                  <>
                    <div className="scan-text">
                      <span>{t('scan.running')}</span>
                      <span className="mono">
                        {scan.done}/{scan.total}
                      </span>
                    </div>
                    <div className="bar thin">
                      <i style={{ width: `${scan.total ? (scan.done / scan.total) * 100 : 0}%` }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="scan-text">
                      <span>{rest > 0 ? t('scan.checked', { n: checked, total: withStats.length }) : t('scan.allDone')}</span>
                    </div>
                    <div className="bar thin">
                      <i style={{ width: `${(checked / withStats.length) * 100}%` }} />
                    </div>
                    {rest > 0 && (
                      <button className="scan-btn" onClick={checkRest}>
                        {t('scan.rest')} <span className="mono dim">{rest}</span>
                      </button>
                    )}
                  </>
                )}
                {scan.error && !scan.running && <p className="scan-error">{t(errorKey(scan.error))}</p>}
              </div>
            )}
            <button className="me" onClick={() => go({ name: 'settings' })}>
              {p.avatar ? <img src={p.avatar} alt="" /> : <div className="avatar-fallback">{p.name.slice(0, 1)}</div>}
              <span>{p.name}</span>
              {settings.demo && <span className="demo-tag">demo</span>}
            </button>
          </div>
        </aside>

        <main className="main">
          <div className="drag-strip" />
          {route.name === 'settings' ? (
            <SettingsView
              settings={settings}
              onChange={(s) => {
                const langChanged = s.lang !== settings.lang;
                setSettings(s);
                if (langChanged) void loadLibrary(false);
              }}
              onDisconnect={() => {
                setLib(null);
                setSettings({ ...settings, profile: null, hasSteamKey: false });
                go({ name: 'library' });
              }}
            />
          ) : route.name === 'game' ? (
            <GameView
              key={route.appid}
              appid={route.appid}
              game={lib?.games.find((g) => g.appid === route.appid)}
              onBack={() => history.back()}
              onSettings={() => go({ name: 'settings' })}
            />
          ) : libError ? (
            <div className="page">
              <div className="notice">
                <p>{t(errorKey(libError))}</p>
                <button className="ghost" onClick={() => loadLibrary(true)}>
                  {t('common.retry')}
                </button>
              </div>
            </div>
          ) : lib ? (
            <Library
              lib={lib}
              filter={filter}
              setFilter={setFilter}
              onRefresh={() => loadLibrary(true)}
              onOpen={(appid) => go({ name: 'game', appid })}
            />
          ) : (
            <div className="page">
              <div className="grid">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="card skeleton-card" />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </LangContext.Provider>
  );
}
