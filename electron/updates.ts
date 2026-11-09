import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateCheck, UpdateStatus } from '../shared/types';

// Aktualizacje: przy starcie, co 10 min w tle i przy powrocie do okna (najwyżej raz na 3 min).
// Sprawdzenie to jeden mały plik latest.yml z GitHuba — nie zużywa limitów Steam ani naszego serwera.
const CHECK_EVERY = 10 * 60_000;
const FOCUS_GAP = 3 * 60_000;

let status: UpdateStatus = { state: 'idle' };
let notify: (s: UpdateStatus) => void = () => {};
let enabled = false;
let demo = false;
let lastCheck = 0;

function set(s: UpdateStatus) {
  status = s;
  notify(s);
}

export function getUpdateStatus() {
  return status;
}

export function setupUpdates(send: (s: UpdateStatus) => void, isEnabled: boolean, isDemo: boolean) {
  notify = send;
  enabled = isEnabled;
  demo = isDemo;
  if (demo) {
    // Tryb demo: udajemy dostępną aktualizację, żeby zobaczyć pasek
    setTimeout(() => set({ state: 'available', version: '0.5.0' }), 1500);
    return;
  }
  if (!enabled) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => {
    if (status.state === 'idle' || status.state === 'error') set({ state: 'available', version: info.version });
  });
  autoUpdater.on('download-progress', (p) => set({ ...status, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'installing', version: info.version });
    // Chwila na pokazanie "Instaluję…", potem instalacja i ponowne uruchomienie
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
  });
  autoUpdater.on('error', (e) => {
    console.warn('update error', e?.message);
    if (status.state === 'downloading') set({ ...status, state: 'error' });
  });

  setTimeout(() => void checkForUpdates(), 5_000);
  setInterval(() => void checkForUpdates(), CHECK_EVERY);
  app.on('browser-window-focus', () => {
    if (Date.now() - lastCheck > FOCUS_GAP) void checkForUpdates();
  });
}

/** Sprawdzenie na żądanie (przycisk w Ustawieniach) albo z harmonogramu. */
export async function checkForUpdates(): Promise<UpdateCheck> {
  const current = app.getVersion();
  if (demo) return { result: 'available', current, latest: '0.5.0' };
  if (!enabled) return { result: 'latest', current, latest: current };
  lastCheck = Date.now();
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version ?? current;
    return { result: r?.isUpdateAvailable ? 'available' : 'latest', current, latest };
  } catch (e) {
    console.warn('update check failed', e instanceof Error ? e.message : e);
    return { result: 'error', current, latest: current };
  }
}

export async function downloadUpdate() {
  if (status.state !== 'available' && status.state !== 'error') return;
  if (demo) {
    for (let p = 0; p <= 100; p += 20) {
      set({ ...status, state: 'downloading', percent: p });
      await new Promise((r) => setTimeout(r, 400));
    }
    set({ ...status, state: 'installing' });
    return;
  }
  set({ ...status, state: 'downloading', percent: 0 });
  await autoUpdater.downloadUpdate();
}
