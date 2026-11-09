import type { Achievement, GameDetail, Lang } from '../shared/types';
import { langInfo } from '../shared/langs';
import { AppError, sleep } from './errors';

// Xbox przez OpenXBL (xbl.io) — nieoficjalne API do Xbox Live.
// Każdy gracz używa WŁASNEGO klucza (regulamin OpenXBL zabrania dzielenia kluczy), więc zapytania idą
// prosto z aplikacji do OpenXBL, nie przez nasz serwer. Darmowy limit: 150 zapytań/h na klucz.
const API = 'https://xbl.io/api/v2';

export interface XboxProfile {
  xuid: string;
  gamertag: string;
  avatar: string;
}

export interface XboxGame {
  titleId: string;
  name: string;
  image: string;
  lastPlayed: number;
  /** Xbox 360 ma inny format osiągnięć — listę widać, szczegółów jeszcze nie */
  legacy: boolean;
  total: number;
  achieved: number;
  gamerscore: number;
  totalGamerscore: number;
}

async function call(path: string, key: string, lang: Lang = 'en'): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(API + path, {
        headers: {
          'X-Authorization': key,
          Accept: 'application/json',
          // Xbox Live zwraca nazwy osiągnięć w tym języku, jeśli gra je ma
          'Accept-Language': langInfo(lang).locale,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      if (attempt < 1) {
        await sleep(1000);
        continue;
      }
      throw new AppError('NETWORK');
    }
    if (res.status === 401 || res.status === 403) throw new AppError('XBOX_INVALID_KEY');
    if (res.status === 429) throw new AppError('XBOX_LIMIT');
    if (res.status >= 500 && attempt < 1) {
      await sleep(1500);
      continue;
    }
    if (!res.ok) throw new AppError('XBOX_ERROR', `HTTP ${res.status}`);
    return res.json().catch(() => {
      throw new AppError('XBOX_ERROR', 'bad json');
    });
  }
}

const setting = (settings: any[], id: string) => settings?.find((s: any) => s.id === id)?.value ?? '';

export async function xboxProfile(key: string): Promise<XboxProfile> {
  const body = await call('/account', key);
  const user = body?.profileUsers?.[0];
  if (!user?.id) throw new AppError('XBOX_ERROR', 'no profile');
  return {
    xuid: String(user.id),
    gamertag: setting(user.settings, 'Gamertag') || setting(user.settings, 'ModernGamertag'),
    avatar: setting(user.settings, 'GameDisplayPicRaw'),
  };
}

/** Wszystkie gry z postępem osiągnięć — jedno zapytanie dla całej historii. */
export async function xboxGames(key: string): Promise<XboxGame[]> {
  const body = await call('/achievements', key);
  const titles: any[] = body?.titles ?? [];
  return titles
    .filter((t) => (t.type ?? 'Game') === 'Game' && (t.achievement?.totalAchievements ?? 0) > 0)
    .map((t) => {
      const devices: string[] = t.devices ?? [];
      return {
        titleId: String(t.titleId),
        name: String(t.name ?? `Title ${t.titleId}`),
        image: String(t.displayImage ?? ''),
        lastPlayed: t.titleHistory?.lastTimePlayed ? Math.floor(Date.parse(t.titleHistory.lastTimePlayed) / 1000) : 0,
        legacy: t.achievement?.sourceVersion === 1 || (devices.length > 0 && devices.every((d) => d === 'Xbox360')),
        total: Number(t.achievement?.totalAchievements ?? 0),
        achieved: Number(t.achievement?.currentAchievements ?? 0),
        gamerscore: Number(t.achievement?.currentGamerscore ?? 0),
        totalGamerscore: Number(t.achievement?.totalGamerscore ?? 0),
      };
    });
}

const icon = (a: any) =>
  String((a.mediaAssets ?? []).find((m: any) => /icon|tile/i.test(m.type ?? m.name ?? ''))?.url ?? a.mediaAssets?.[0]?.url ?? '');

/** Osiągnięcia jednej gry — w tym samym kształcie co Steam, żeby widok gry był wspólny. */
export async function xboxGameDetail(key: string, xuid: string, game: XboxGame, lang: Lang): Promise<GameDetail> {
  const body = await call(`/achievements/player/${xuid}/title/${game.titleId}`, key, lang);
  const list: any[] = body?.achievements ?? [];
  const achievements: Achievement[] = list.map((a) => {
    const achieved = a.progressState === 'Achieved';
    const pct = Number(a.rarity?.currentPercentage);
    const unlocked = a.progression?.timeUnlocked ? Date.parse(a.progression.timeUnlocked) : 0;
    return {
      apiname: String(a.id),
      name: String(a.name ?? ''),
      // Xbox: opis przed zdobyciem bywa w lockedDescription, po zdobyciu w description
      description: String((achieved ? a.description : a.lockedDescription || a.description) ?? ''),
      hidden: a.isSecret === true,
      icon: icon(a),
      iconGray: icon(a),
      achieved,
      unlockTime: unlocked > 0 && new Date(unlocked).getUTCFullYear() > 2000 ? Math.floor(unlocked / 1000) : 0,
      percent: Number.isFinite(pct) ? pct : null,
    };
  });
  return { appid: 0, name: game.name, achievements, fetchedAt: Date.now(), lang };
}
