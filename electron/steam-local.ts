import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Zainstalowane gry Steam na tym komputerze — tylko odczyt plików Steam, nic nie idzie do sieci.
// Ścieżka Steam z rejestru → libraryfolders.vdf (wszystkie dyski z grami) → appmanifest_*.acf.

export interface InstalledGame {
  appid: number;
  name: string;
}

// Narzędzia, które Steam instaluje obok gier — to nie są gry
const NOT_GAMES = new Set([228980, 1070560, 1391110, 1493710, 1628350, 1826330, 2180100]);
const NOT_GAME_NAME = /redistributable|steamworks|proton|steam linux runtime|steamvr/i;

function steamPathFromRegistry(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err) return resolve(null);
      const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
      resolve(m ? path.normalize(m[1].trim()) : null);
    });
  });
}

const field = (text: string, key: string) => text.match(new RegExp(`"${key}"\\s+"([^"]*)"`, 'i'))?.[1];

async function libraryFolders(steamPath: string): Promise<string[]> {
  const folders = new Set([path.normalize(steamPath)]);
  try {
    const vdf = await fs.readFile(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) folders.add(path.normalize(m[1].replace(/\\\\/g, '\\')));
  } catch {
    // brak pliku = tylko główna biblioteka
  }
  return [...folders];
}

export async function installedGames(): Promise<InstalledGame[]> {
  if (process.platform !== 'win32') return [];
  const candidates = [await steamPathFromRegistry(), 'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'].filter(Boolean) as string[];
  let steamPath: string | null = null;
  for (const c of candidates) {
    try {
      await fs.access(path.join(c, 'steamapps'));
      steamPath = c;
      break;
    } catch {
      // następny kandydat
    }
  }
  if (!steamPath) return [];

  const games = new Map<number, InstalledGame>();
  for (const lib of await libraryFolders(steamPath)) {
    const dir = path.join(lib, 'steamapps');
    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter((f) => /^appmanifest_\d+\.acf$/.test(f));
    } catch {
      continue; // odłączony dysk
    }
    for (const f of files) {
      try {
        const acf = await fs.readFile(path.join(dir, f), 'utf8');
        const appid = Number(field(acf, 'appid'));
        const name = field(acf, 'name') ?? '';
        const flags = Number(field(acf, 'StateFlags') ?? 0);
        // StateFlags & 4 = w pełni zainstalowana
        if (!appid || !(flags & 4) || NOT_GAMES.has(appid) || NOT_GAME_NAME.test(name)) continue;
        games.set(appid, { appid, name });
      } catch {
        // uszkodzony manifest pomijamy
      }
    }
  }
  return [...games.values()];
}
