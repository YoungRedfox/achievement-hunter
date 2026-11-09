import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '../shared/types';

// Aktualizacje: sprawdzamy przy starcie i co 6 h. Gracz klika jeden przycisk —
// pobieramy instalator, a po pobraniu aplikacja sama się zamyka, instaluje nową wersję i uruchamia ponownie.
const CHECK_EVERY = 6 * 3600_000;

let status: UpdateStatus = { state: 'idle' };
let notify: (s: UpdateStatus) => void = () => {};

function set(s: UpdateStatus) {
  status = s;
  notify(s);
}

export function getUpdateStatus() {
  return status;
}

export function setupUpdates(send: (s: UpdateStatus) => void, enabled: boolean, demo: boolean) {
  notify = send;
  if (demo) {
    // Tryb demo: udajemy dostępną aktualizację, żeby zobaczyć pasek
    setTimeout(() => set({ state: 'available', version: '0.2.0' }), 1500);
    return;
  }
  if (!enabled) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => set({ state: 'available', version: info.version }));
  autoUpdater.on('download-progress', (p) => set({ ...status, state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'installing', version: info.version });
    // Chwila na pokazanie "Instaluję…", potem instalacja i ponowne uruchomienie
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
  });
  autoUpdater.on('error', (e) => {
    console.warn('update error', e?.message);
    // Błąd w trakcie pobierania pokazujemy; cichy błąd sprawdzania (np. brak sieci) — nie
    if (status.state === 'downloading') set({ ...status, state: 'error' });
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, 5_000);
  setInterval(check, CHECK_EVERY);
}

export async function downloadUpdate(demo: boolean) {
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
