import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { GameDetail, LibraryGame, ScanProgress, Settings, SettingsPatch } from '../shared/types';
import { demoGuide, demoProvider } from './demo';
import { AppError, toResult } from './errors';
import { generateGuide } from './guide';
import { steamProvider } from './steam';
import { DEFAULT_MODEL, Store } from './store';

const isDemo = process.env.AH_DEMO === '1';
const provider = isDemo ? demoProvider : steamProvider;
const LIBRARY_TTL = 6 * 3600_000;
const SUMMARY_TTL = 24 * 3600_000;
const DETAIL_TTL = 10 * 60_000;

let win: BrowserWindow | null = null;
let store: Store;
const details = new Map<number, GameDetail>();

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

function steamKey() {
  if (isDemo) return 'demo';
  const key = store.getSecret('steamKey');
  if (!key || !store.data.profile) throw new AppError('NOT_CONNECTED');
  return key;
}

function settings(): Settings {
  return {
    lang: store.data.lang,
    hasSteamKey: isDemo || !!store.getSecret('steamKey'),
    hasOpenAiKey: isDemo || !!store.getSecret('openAiKey'),
    openAiModel: store.data.openAiModel,
    profile: store.data.profile,
    demo: isDemo,
  };
}

function library(): LibraryGame[] {
  return (store.data.games?.list ?? []).map((g) => ({ ...g, summary: store.data.summaries[g.appid] }));
}

// ---- skanowanie osiągnięć całej biblioteki w tle ----

let scanning = false;

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

async function runScan(force: boolean) {
  if (scanning) return;
  const key = steamKey();
  const steamid = store.data.profile!.steamid;
  const now = Date.now();
  // Ostatnio grane najpierw — to te gry użytkownik chce zobaczyć od razu
  const todo = (store.data.games?.list ?? [])
    .filter((g) => {
      if (!g.hasStats) return false;
      const s = store.data.summaries[g.appid];
      return force || !s || now - s.fetchedAt > SUMMARY_TTL || g.lastPlayed * 1000 > s.fetchedAt;
    })
    .sort((a, b) => b.lastPlayed - a.lastPlayed);

  scanning = true;
  const progress: ScanProgress = { done: 0, total: todo.length, running: true };
  send('scan:progress', progress);
  try {
    await pool(todo, 4, async (g) => {
      try {
        const s = await provider.achievementSummary(g.appid, steamid, key);
        const summary = { ...s, fetchedAt: Date.now() };
        store.data.summaries[g.appid] = summary;
        store.save();
        send('scan:summary', g.appid, summary);
      } catch (e) {
        if (e instanceof AppError && (e.code === 'INVALID_KEY' || e.code === 'PRIVATE_GAMES')) throw e;
        console.warn(`scan ${g.appid}:`, e instanceof Error ? e.message : e);
      }
      progress.done++;
      send('scan:progress', progress);
    });
  } finally {
    scanning = false;
    send('scan:progress', { ...progress, running: false });
    store.flush();
  }
}

async function loadDetail(appid: number, refresh: boolean): Promise<GameDetail> {
  const cached = details.get(appid);
  if (cached && !refresh && Date.now() - cached.fetchedAt < DETAIL_TTL) return cached;
  const key = steamKey();
  const game = store.data.games?.list.find((g) => g.appid === appid);
  const detail = await provider.gameDetail(appid, game?.name ?? `App ${appid}`, store.data.profile!.steamid, key, store.data.lang);
  details.set(appid, detail);
  // Szczegóły są świeższe niż skan — poprawiamy licznik na karcie biblioteki
  const summary = {
    total: detail.achievements.length,
    achieved: detail.achievements.filter((a) => a.achieved).length,
    fetchedAt: Date.now(),
  };
  store.data.summaries[appid] = summary;
  store.save();
  send('scan:summary', appid, summary);
  return detail;
}

function registerIpc() {
  ipcMain.handle('settings:get', () => toResult(async () => settings()));

  ipcMain.handle('settings:update', (_e, patch: SettingsPatch) =>
    toResult(async () => {
      if (patch.lang && patch.lang !== store.data.lang) {
        store.data.lang = patch.lang;
        details.clear();
      }
      if (patch.openAiModel !== undefined) store.data.openAiModel = patch.openAiModel.trim() || DEFAULT_MODEL;
      if (patch.openAiKey !== undefined) store.setSecret('openAiKey', patch.openAiKey?.trim() || null);
      if (patch.steamKey !== undefined) {
        const profile = store.data.profile;
        if (!profile) throw new AppError('NOT_CONNECTED');
        // Nowy klucz sprawdzamy na istniejącym profilu, zanim go zapiszemy
        await provider.resolveProfile(profile.steamid, patch.steamKey.trim());
        store.setSecret('steamKey', patch.steamKey.trim());
      }
      store.flush();
      return settings();
    }),
  );

  ipcMain.handle('account:connect', (_e, input: string, key: string) =>
    toResult(async () => {
      const profile = await provider.resolveProfile(input, key.trim());
      // Lista gier od razu — tu wychodzi ukryte "Szczegóły gry"
      const list = await provider.ownedGames(profile.steamid, key.trim());
      if (store.data.profile?.steamid !== profile.steamid) store.clearCache();
      store.data.profile = profile;
      store.data.games = { fetchedAt: Date.now(), list };
      if (!isDemo) store.setSecret('steamKey', key.trim());
      store.flush();
      return profile;
    }),
  );

  ipcMain.handle('account:disconnect', () =>
    toResult(async () => {
      store.resetAccount();
      details.clear();
      return null;
    }),
  );

  ipcMain.handle('library:get', (_e, refresh: boolean) =>
    toResult(async () => {
      const key = steamKey();
      const g = store.data.games;
      if (refresh || !g || Date.now() - g.fetchedAt > LIBRARY_TTL) {
        try {
          const list = await provider.ownedGames(store.data.profile!.steamid, key);
          store.data.games = { fetchedAt: Date.now(), list };
          store.save();
        } catch (e) {
          // Bez sieci pokazujemy ostatnią znaną bibliotekę
          if (!(g && e instanceof AppError && e.code === 'NETWORK')) throw e;
        }
      }
      return library();
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
      details.clear();
      store.flush();
      return null;
    }),
  );

  ipcMain.handle('open:external', (_e, url: string) => openSafe(url));
}

function createWindow() {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const shot = process.env.AH_SHOT;
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
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    // Zrzut wymaga widocznego okna (ukryte daje UnknownVizError) — stawiamy je poza ekranem
    if (shot) win?.setPosition(-20000, -20000);
    if (shot) win?.showInactive();
    else win?.show();
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

  const hash = process.env.AH_SHOT_HASH ?? '';
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
  store = new Store();
  // Demo do zrzutów ekranu: od razu "połączony" profil
  if (isDemo && process.env.AH_DEMO_CONNECTED === '1' && !store.data.profile) {
    const profile = await demoProvider.resolveProfile('', '');
    store.data.profile = profile;
    store.data.games = { fetchedAt: Date.now(), list: await demoProvider.ownedGames('', '') };
  }
  registerIpc();
  createWindow();
});

app.on('before-quit', () => store?.flush());
app.on('window-all-closed', () => app.quit());
