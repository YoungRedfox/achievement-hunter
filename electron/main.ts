import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ErrorCode, GameDetail, Library, ScanProgress, Settings, SettingsPatch } from '../shared/types';
import { demoGuide, demoProvider } from './demo';
import { AppError, sleep, toResult } from './errors';
import { generateGuide } from './guide';
import type { SteamKey } from './provider';
import { proxyUrl, steamProvider } from './steam';
import { DEFAULT_MODEL, Store } from './store';

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
    hasOpenAiKey: isDemo || !!store.getSecret('openAiKey'),
    openAiModel: store.data.openAiModel,
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

// ---- sprawdzanie wszystkich gier: tylko na wyraźne żądanie, bo zużywa dzienny limit ----

let scanning = false;

async function runScan(force: boolean) {
  if (scanning) return;
  const key = steamKey();
  const steamid = store.data.profile!.steamid;
  // Tylko gry jeszcze niesprawdzone (force = wszystkie); ostatnio grane najpierw
  const todo = (store.data.games?.list ?? [])
    .filter((g) => g.hasStats && (force || !store.data.summaries[g.appid]))
    .sort((a, b) => b.lastPlayed - a.lastPlayed);

  scanning = true;
  const progress: ScanProgress = { done: 0, total: todo.length, running: true };
  send('scan:progress', progress);
  let i = 0;
  const worker = async () => {
    while (i < todo.length && !progress.error) {
      const g = todo[i++];
      try {
        const s = await provider.achievementSummary(g.appid, steamid, key);
        const summary = { ...s, fetchedAt: Date.now() };
        store.data.summaries[g.appid] = summary;
        store.save();
        send('scan:summary', g.appid, summary);
      } catch (e) {
        if (e instanceof AppError && e.code === 'RATE_LIMIT') {
          // Serwer kazał zwolnić — odczekaj i spróbuj tej samej gry jeszcze raz
          i--;
          await sleep(15_000);
          continue;
        }
        // Limit dzienny albo awaria serwera: przerywamy, żeby nie palić zapytań na próżno
        const code = softCode(e) ?? (e instanceof AppError && e.code === 'PRIVATE_GAMES' ? e.code : null);
        if (code && code !== 'NETWORK') progress.error = code;
        else console.warn(`scan ${g.appid}:`, e instanceof Error ? e.message : e);
      }
      progress.done++;
      send('scan:progress', progress);
      // ~80 zapytań/min — poniżej limitu serwera na jedno IP
      await sleep(750);
    }
  };
  try {
    await worker();
  } finally {
    scanning = false;
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
      if (patch.lang) store.data.lang = patch.lang;
      if (patch.openAiModel !== undefined) store.data.openAiModel = patch.openAiModel.trim() || DEFAULT_MODEL;
      if (patch.openAiKey !== undefined) store.setSecret('openAiKey', patch.openAiKey?.trim() || null);
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
      if (!refresh && g && Date.now() - g.fetchedAt < LIBRARY_TTL) return library();
      try {
        const list = await provider.ownedGames(store.data.profile!.steamid, steamKey());
        store.data.games = { fetchedAt: Date.now(), list };
        store.save();
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
      runScan(force).catch((e) => console.error('scan failed', e));
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
      const apiKey = store.getSecret('openAiKey');
      if (!apiKey) throw new AppError('NO_OPENAI_KEY');
      const detail = await loadDetail(appid, false);
      const achievement = detail.achievements.find((a) => a.apiname === apiname);
      if (!achievement) throw new AppError('INVALID_INPUT');
      const guide = await generateGuide({ apiKey, model: store.data.openAiModel, lang, appid, gameName: detail.name, achievement });
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
  if (isDemo && process.env.AH_DEMO_CONNECTED === '1' && !store.data.profile) {
    store.data.profile = await demoProvider.resolveProfile('', null);
    store.data.games = { fetchedAt: Date.now(), list: await demoProvider.ownedGames('', null) };
    store.flush();
  }
  registerIpc();
  createWindow();
});

app.on('before-quit', () => store?.flush());
app.on('window-all-closed', () => app.quit());
