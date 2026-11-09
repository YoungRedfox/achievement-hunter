import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ErrorCode, Library as LibraryData, ScanProgress, Settings } from '../shared/types';
import { Connect } from './components/Connect';
import { GameView } from './components/GameView';
import { Library, type Filter } from './components/Library';
import { SettingsView } from './components/SettingsView';
import { UpdateBar } from './components/UpdateBar';
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
  const [installed, setInstalled] = useState<{ appid: number; name: string }[]>([]);

  const t = useMemo(() => makeT(settings?.lang ?? 'en'), [settings?.lang]);
  // Atrybut lang wybiera właściwe kroje dla chińskiego, japońskiego i koreańskiego
  useEffect(() => {
    document.documentElement.lang = settings?.lang ?? 'en';
  }, [settings?.lang]);

  useEffect(() => {
    api.getSettings().then((r) => r.ok && setSettings(r.data));
    const onHash = () => {
      setRoute(parseHash(location.hash));
      document.querySelector('.main')?.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    // Po zakończeniu pobierania czytamy bibliotekę z zapisu (lokalnie) — pewniej niż same zdarzenia
    const offProgress = api.onScanProgress((p) => {
      setScan(p);
      if (!p.running && !p.error) api.getLibrary(false).then((r) => r.ok && setLib(r.data));
    });
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
    if (r.ok && refresh) {
      void api.startScan(true);
      api.installedGames().then(setInstalled);
    }
  }, []);

  const connected = !!settings?.profile;
  useEffect(() => {
    if (!connected) return;
    void loadLibrary(false);
    api.installedGames().then(setInstalled);
  }, [connected, loadLibrary]);

  if (!settings) return <div className="boot" />;

  const ctx = { lang: settings.lang, t };

  if (!settings.profile) {
    return (
      <LangContext.Provider value={ctx}>
        <Connect
          lang={settings.lang}
          onLang={(lang) => api.updateSettings({ lang }).then((r) => r.ok && setSettings(r.data))}
          demo={settings.demo}
          needsKey={!settings.proxyAvailable}
          onConnected={(profile) => setSettings({ ...settings, profile })}
        />
      </LangContext.Provider>
    );
  }

  const p = settings.profile;
  const byId = new Map(lib?.games.map((g) => [g.appid, g]) ?? []);
  // Zainstalowane: najpierw ostatnio grane, nazwa z biblioteki (ładniejsza niż z manifestu)
  const installedList = installed
    .map((i) => ({ ...i, game: byId.get(i.appid) }))
    .map((i) => ({ ...i, name: i.game?.name || i.name || `App ${i.appid}` }))
    .sort((a, b) => (b.game?.lastPlayed ?? 0) - (a.game?.lastPlayed ?? 0) || a.name.localeCompare(b.name));

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
            <button className={route.name === 'library' ? 'on' : ''} onClick={() => go({ name: 'library' })}>
              <Icon.Library /> {t('nav.library')}
            </button>
            <button className={route.name === 'settings' ? 'on' : ''} onClick={() => go({ name: 'settings' })}>
              <Icon.Settings /> {t('nav.settings')}
            </button>
          </nav>

          {installedList.length > 0 && (
            <div className="installed">
              <p className="installed-head small-caps">
                {t('nav.installed')} <span className="mono">{installedList.length}</span>
              </p>
              <ul>
                {installedList.map((g) => {
                  const s = g.game?.summary;
                  const pctv = s && s.total > 0 ? Math.floor((s.achieved / s.total) * 100) : null;
                  return (
                    <li key={g.appid}>
                      <button
                        className={route.name === 'game' && route.appid === g.appid ? 'on' : ''}
                        onClick={() => go({ name: 'game', appid: g.appid })}
                        title={g.name}
                      >
                        <span className="installed-name">{g.name}</span>
                        {pctv !== null && <span className={`installed-pct mono ${pctv === 100 ? 'gold' : ''}`}>{pctv}%</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="sidebar-foot">
            <UpdateBar />
            {(scan.running || scan.error) && (
              <div className={`scan ${scan.running ? 'running' : ''}`}>
                {scan.running && (
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
                )}
                {scan.error && !scan.running && (
                  <>
                    <p className="scan-error">{t(errorKey(scan.error))}</p>
                    <button className="scan-btn" onClick={() => api.startScan(false)}>
                      {t('common.retry')}
                    </button>
                  </>
                )}
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
