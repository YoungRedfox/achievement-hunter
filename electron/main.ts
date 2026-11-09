import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ErrorCode, GameDetail, Library, ScanProgress, Settings, SettingsPatch } from '../shared/types';
import { demoGuide, demoProvider } from './demo';
import { AppError, sleep, toResult } from './errors';
import { AI_PROVIDERS, DEFAULT_MODELS, GuideError, generateGuide } from '../shared/guide-core';
import type { SteamKey } from './provider';
import { proxyGuide, proxyUrl, steamProvider } from './steam';
import { isLang } from '../shared/langs';
import { installedGames } from './steam-local';
import { Store } from './store';
import { checkForUpdates, downloadUpdate, getUpdateStatus, setupUpdates } from './updates';

// Przełączniki deweloperskie (demo, zrzuty) nie działają w zainstalowanej aplikacji
const dev = !app.isPackaged;
const isDemo = dev && process.env.AH_DEMO === '1';
const provider = isDemo ? demoProvider : steamProvider;
// Lista gier odświeża się sama raz na dobę; osiągnięcia gry tylko gdy w nią grałeś od ostatniego pobrania
const LIBRARY_TTL = 24 * 3600_000;
// Błędy, przy których lepiej pokazać zapisane dane niż pusty ekran
const SOFT: ErrorCode[] = ['DAILY_LIMIT', 'NETWORK', 'RATE_LIMIT', 'SERVICE_DOWN'];
const softCode = (e: unknown): ErrorCode | null => (e instanceof AppError && SOFT.includes(e.code) ? e.code : null);

let win: BrowserWindow | null = null;
let store: Store;

if (isDemo) app.setPath('userData', path.join(app.getPath('temp'), 'achievement-hunter-demo'));
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

function openSafe(url: string) {
  // Tylko http(s) — nic, co mogłoby uruchomić program lokalnie
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function send(channel: string, ...args: unknown[]) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

const proxyAvailable = () => isDemo || !!proxyUrl();

/** Klucz do zapytań: własny użytkownika albo null = nasz serwer. */
function steamKey(): SteamKey {
  if (!store.data.profile) throw new AppError('NOT_CONNECTED');
  if (isDemo) return null;
  const own = store.getSecret('steamKey');
  if (!own && !proxyAvailable()) throw new AppError('INVALID_KEY');
  return own;
}

function settings(): Settings {
  return {
    lang: store.data.lang,
    hasSteamKey: !!store.getSecret('steamKey'),
    hasAiKey: !!store.getSecret('aiKey'),
    aiProvider: store.data.aiProvider,
    aiModel: store.data.aiModel || DEFAULT_MODELS[store.data.aiProvider],
    profile: store.data.profile,
    demo: isDemo,
    proxyAvailable: proxyAvailable(),
  };
}

function library(stale?: ErrorCode): Library {
  const g = store.data.games;
  return {
    games: (g?.list ?? []).map((x) => ({ ...x, summary: store.data.summaries[x.appid] })),
    fetchedAt: g?.fetchedAt ?? 0,
    stale,
  };
}

function setSummary(detail: GameDetail) {
  const summary = {
    total: detail.achievements.length,
    achieved: detail.achievements.filter((a) => a.achieved).length,
    fetchedAt: detail.fetchedAt,
  };
  store.data.summaries[detail.appid] = summary;
  send('scan:summary', detail.appid, summary);
}

// ---- postęp wszystkich gier od razu, paczkami po 100 (300 gier = 3 zapytania) ----

const BATCH = 100;
const PROGRESS_TTL = 12 * 3600_000;
let syncing = false;

async function syncProgress(force: boolean) {
  if (syncing || !store.data.profile) return;
  const key = steamKey();
  const steamid = store.data.profile.steamid;
  const now = Date.now();
  // Tylko to, co trzeba: brak danych, stare dane albo gra była grana od ostatniego pobrania
  const todo = (store.data.games?.list ?? [])
    .filter((g) => {
      if (!g.hasStats) return false;
      const s = store.data.summaries[g.appid];
      return force || !s || now - s.fetchedAt > PROGRESS_TTL || g.lastPlayed * 1000 > s.fetchedAt;
    })
    .sort((a, b) => b.lastPlayed - a.lastPlayed);
  if (todo.length === 0) return;

  syncing = true;
  const progress: ScanProgress = { done: 0, total: todo.length, running: true };
  send('scan:progress', progress);
  try {
    for (let i = 0; i < todo.length && !progress.error; ) {
      const chunk = todo.slice(i, i + BATCH);
      try {
        const results = await provider.progress(chunk.map((g) => g.appid), steamid, key);
        const fetchedAt = Date.now();
        for (const r of results) {
          const summary = { total: r.total, achieved: r.achieved, fetchedAt };
          store.data.summaries[r.appid] = summary;
          send('scan:summary', r.appid, summary);
        }
        store.save();
        i += chunk.length;
        progress.done = Math.min(i, todo.length);
        send('scan:progress', progress);
      } catch (e) {
        if (e instanceof AppError && e.code === 'RATE_LIMIT') {
          await sleep(15_000);
          continue;
        }
        progress.error = softCode(e) ?? (e instanceof AppError ? e.code : 'UNKNOWN');
      }
    }
  } finally {
    syncing = false;
    send('scan:progress', { ...progress, running: false });
    store.flush();
  }
}

async function loadDetail(appid: number, refresh: boolean): Promise<GameDetail> {
  const cached = store.data.details[appid];
  const game = store.data.games?.list.find((g) => g.appid === appid);
  const lang = store.data.lang;
  // Pobieramy tylko gdy trzeba: brak zapisu, inny język albo grałeś od ostatniego pobrania
  const outdated = !cached || cached.lang !== lang || (!!game && game.lastPlayed * 1000 > cached.fetchedAt);
  if (cached && !refresh && !outdated) return cached;

  try {
    const detail = await provider.gameDetail(appid, game?.name ?? `App ${appid}`, store.data.profile!.steamid, steamKey(), lang);
    store.data.details[appid] = detail;
    setSummary(detail);
    store.save();
    return detail;
  } catch (e) {
    const code = softCode(e);
    if (cached && code) return { ...cached, stale: code };
    throw e;
  }
}

function registerIpc() {
  ipcMain.handle('settings:get', () => toResult(async () => settings()));

  ipcMain.handle('settings:update', (_e, patch: SettingsPatch) =>
    toResult(async () => {
      if (isLang(patch.lang)) store.data.lang = patch.lang;
      if (patch.aiProvider && AI_PROVIDERS.includes(patch.aiProvider) && patch.aiProvider !== store.data.aiProvider) {
        // Inny dostawca = inny klucz i inny model
        store.data.aiProvider = patch.aiProvider;
        store.data.aiModel = '';
        store.setSecret('aiKey', null);
      }
      if (patch.aiModel !== undefined) {
        const m = patch.aiModel.trim();
        store.data.aiModel = m === DEFAULT_MODELS[store.data.aiProvider] ? '' : m;
      }
      // Klucz AI zostaje wyłącznie na tym komputerze (zaszyfrowany), nigdy nie idzie na nasz serwer
      if (patch.aiKey !== undefined) store.setSecret('aiKey', patch.aiKey?.trim() || null);
      if (patch.steamKey !== undefined) {
        const profile = store.data.profile;
        if (!profile) throw new AppError('NOT_CONNECTED');
        const key = patch.steamKey?.trim() || null;
        if (!key && !proxyAvailable()) throw new AppError('INVALID_KEY');
        // Nowy klucz sprawdzamy na istniejącym profilu, zanim go zapiszemy
        if (key) await provider.resolveProfile(profile.steamid, key);
        store.setSecret('steamKey', key);
      }
      store.flush();
      return settings();
    }),
  );

  ipcMain.handle('account:connect', (_e, input: string, rawKey?: string) =>
    toResult(async () => {
      const key = rawKey?.trim() || null;
      if (!key && !proxyAvailable()) throw new AppError('INVALID_KEY');
      const profile = await provider.resolveProfile(input, key);
      // Lista gier od razu — tu wychodzi ukryte "Szczegóły gry"
      const list = await provider.ownedGames(profile.steamid, key);
      if (store.data.profile?.steamid !== profile.steamid) store.clearCache();
      store.data.profile = profile;
      store.data.games = { fetchedAt: Date.now(), list };
      if (!isDemo) store.setSecret('steamKey', key);
      store.flush();
      return profile;
    }),
  );

  ipcMain.handle('account:disconnect', () =>
    toResult(async () => {
      store.resetAccount();
      return null;
    }),
  );

  ipcMain.handle('library:get', (_e, refresh: boolean) =>
    toResult(async () => {
      const g = store.data.games;
      const sync = () => setTimeout(() => syncProgress(false).catch((e) => console.error('sync failed', e)), 300);
      if (!refresh && g && Date.now() - g.fetchedAt < LIBRARY_TTL) {
        sync();
        return library();
      }
      try {
        const list = await provider.ownedGames(store.data.profile!.steamid, steamKey());
        store.data.games = { fetchedAt: Date.now(), list };
        store.save();
        sync();
        return library();
      } catch (e) {
        const code = softCode(e);
        if (g && code) return library(code);
        throw e;
      }
    }),
  );

  ipcMain.handle('library:scan', (_e, force: boolean) =>
    toResult(async () => {
      syncProgress(force).catch((e) => console.error('sync failed', e));
      return null;
    }),
  );

  ipcMain.handle('game:get', (_e, appid: number, refresh: boolean) => toResult(() => loadDetail(appid, refresh)));

  ipcMain.handle('guide:get', (_e, appid: number, apiname: string, refresh: boolean) =>
    toResult(async () => {
      const lang = store.data.lang;
      const cacheKey = `${appid}:${apiname}:${lang}`;
      const cached = store.data.guides[cacheKey];
      if (cached && !refresh) return cached;
      if (isDemo) {
        await new Promise((r) => setTimeout(r, 1200));
        return demoGuide(lang);
      }
      const ownKey = store.getSecret('aiKey');
      let guide;
      if (ownKey) {
        // Własny klucz: prosto do dostawcy AI, z pominięciem naszego serwera
        const detail = await loadDetail(appid, false);
        const a = detail.achievements.find((x) => x.apiname === apiname);
        if (!a) throw new AppError('INVALID_INPUT');
        const provider = store.data.aiProvider;
        try {
          guide = await generateGuide(provider, ownKey, store.data.aiModel || DEFAULT_MODELS[provider], {
            appid,
            gameName: detail.name,
            name: a.name,
            description: a.description,
            percent: a.percent,
            lang,
          });
        } catch (e) {
          if (e instanceof GuideError) throw new AppError(e.code, e.message);
          throw e;
        }
      } else if (proxyAvailable()) {
        guide = await proxyGuide(appid, apiname, lang);
      } else {
        throw new AppError('NO_AI_KEY');
      }
      store.data.guides[cacheKey] = guide;
      store.flush();
      return guide;
    }),
  );

  ipcMain.handle('cache:clear', () =>
    toResult(async () => {
      const profile = store.data.profile;
      store.clearCache();
      store.data.profile = profile;
      store.flush();
      return null;
    }),
  );

  ipcMain.handle('open:external', (_e, url: string) => openSafe(url));
  ipcMain.handle('app:version', () => app.getVersion());
  // Demo: kilka gier z listy demo udaje zainstalowane
  ipcMain.handle('installed:get', () =>
    isDemo ? [1145360, 367520, 413150, 504230].map((appid) => ({ appid, name: '' })) : installedGames().catch(() => []),
  );
  ipcMain.handle('update:status', () => getUpdateStatus());
  ipcMain.handle('update:download', () => downloadUpdate().catch((e) => console.warn(e)));
  ipcMain.handle('update:check', () => checkForUpdates());
}

function createWindow() {
  const devUrl = dev ? process.env.VITE_DEV_SERVER_URL : undefined;
  const shot = dev ? process.env.AH_SHOT : undefined;
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    backgroundColor: '#0c0d0f',
    title: 'Achievement Hunter',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c0d0f', symbolColor: '#a39e95', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      // Bez narzędzi deweloperskich w wersji dla ludzi
      devTools: dev,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    // Zrzut wymaga widocznego okna (ukryte daje UnknownVizError) — stawiamy je poza ekranem
    if (shot) {
      win?.setPosition(-20000, -20000);
      win?.showInactive();
    } else win?.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openSafe(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const own = devUrl ? url.startsWith(devUrl) : url.startsWith('file://');
    if (!own) {
      e.preventDefault();
      openSafe(url);
    }
  });

  const hash = (dev && process.env.AH_SHOT_HASH) || '';
  if (devUrl) void win.loadURL(devUrl + hash);
  else void win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: hash.replace(/^#/, '') });

  // Zrzut ekranu dla weryfikacji wyglądu (tylko gdy ustawione AH_SHOT=ścieżka.png)
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          // AH_SHOT_SCROLL=1: zrzut dolnej części strony (np. Ustawienia → O aplikacji)
          if (process.env.AH_SHOT_SCROLL) {
            await win!.webContents.executeJavaScript("document.querySelector('.main')?.scrollTo(0, 1e6)");
            await new Promise((r) => setTimeout(r, 400));
          }
          const img = await win!.webContents.capturePage();
          fs.writeFileSync(shot, img.toPNG());
        } catch (e) {
          console.error('capture failed', e);
        }
        app.exit(0);
      }, Number(process.env.AH_SHOT_DELAY ?? 3500));
    });
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // Aplikacja nie potrzebuje kamery, mikrofonu, powiadomień itd. — odmawiamy wszystkiego
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  store = new Store();
  // Demo do zrzutów ekranu: od razu "połączony" profil
  // Demo: język z AH_DEMO_LANG — do zrzutów ekranu w innych językach
  if (isDemo && isLang(process.env.AH_DEMO_LANG)) store.data.lang = process.env.AH_DEMO_LANG;
  if (isDemo && process.env.AH_DEMO_CONNECTED === '1' && !store.data.profile) {
    store.data.profile = await demoProvider.resolveProfile('', null);
    store.data.games = { fetchedAt: Date.now(), list: await demoProvider.ownedGames('', null) };
    store.flush();
  }
  registerIpc();
  createWindow();
  // Aktualizacje tylko w zainstalowanej wersji (w dev nie ma czego aktualizować)
  setupUpdates((s) => send('update:status', s), !dev, isDemo && process.env.AH_DEMO_UPDATE === '1');
});

app.on('before-quit', () => store?.flush());
app.on('window-all-closed', () => app.quit());
