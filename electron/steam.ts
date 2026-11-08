import type { Achievement, Lang, OwnedGame, Profile } from '../shared/types';
import { AppError, sleep } from './errors';
import { isSteamKey, parseProfileInput } from './profile-input';
import type { Provider } from './provider';

// Oficjalne Steam Web API. Bez logowania: tylko publiczne dane + klucz użytkownika.
const API = 'https://api.steampowered.com';
const steamLang = (l: Lang) => (l === 'pl' ? 'polish' : 'english');

interface Raw {
  status: number;
  body: any;
}

async function request(path: string, params: Record<string, string | number>): Promise<Raw> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch {
      if (attempt < 2) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throw new AppError('NETWORK');
    }
    // Steam przy przeciążeniu rzuca 429/5xx — dwie próby z odstępem wystarczają
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      // zły klucz = strona HTML "Forbidden"
    }
    if (res.status === 429) throw new AppError('RATE_LIMIT');
    if ((res.status === 401 || res.status === 403) && body === null) throw new AppError('INVALID_KEY');
    if (res.status >= 500) throw new AppError('NETWORK', `Steam ${res.status}`);
    return { status: res.status, body };
  }
}

function playerStatsError(body: any): AppError | null {
  const err: string | undefined = body?.playerstats?.error;
  if (!err) return null;
  if (/not public/i.test(err)) return new AppError('PRIVATE_GAMES', err);
  if (/no stats/i.test(err)) return new AppError('NO_STATS', err);
  return new AppError('UNKNOWN', err);
}

async function playerAchievements(appid: number, steamid: string, key: string, lang?: Lang) {
  const params: Record<string, string | number> = { appid, steamid, key };
  if (lang) params.l = steamLang(lang);
  const { body } = await request('/ISteamUserStats/GetPlayerAchievements/v1/', params);
  const err = playerStatsError(body);
  if (err) throw err;
  const list: any[] = body?.playerstats?.achievements ?? [];
  return list;
}

export const steamProvider: Provider = {
  async resolveProfile(input, key) {
    if (!isSteamKey(key)) throw new AppError('INVALID_KEY');
    const ref = parseProfileInput(input);
    if (!ref) throw new AppError('INVALID_INPUT');

    let steamid = ref.value;
    if (ref.kind === 'vanity') {
      const { body } = await request('/ISteamUser/ResolveVanityURL/v1/', { key, vanityurl: ref.value });
      if (body?.response?.success !== 1) throw new AppError('PROFILE_NOT_FOUND');
      steamid = body.response.steamid;
    }

    const { body } = await request('/ISteamUser/GetPlayerSummaries/v2/', { key, steamids: steamid });
    const p = body?.response?.players?.[0];
    if (!p) throw new AppError('PROFILE_NOT_FOUND');
    // 3 = profil publiczny; inaczej Steam nie odda listy gier
    if (p.communityvisibilitystate !== 3) throw new AppError('PRIVATE_PROFILE');

    const profile: Profile = { steamid, name: p.personaname, avatar: p.avatarfull, profileUrl: p.profileurl };
    return profile;
  },

  async ownedGames(steamid, key) {
    const { body } = await request('/IPlayerService/GetOwnedGames/v1/', {
      key,
      steamid,
      include_appinfo: 1,
      include_played_free_games: 1,
    });
    const r = body?.response;
    // Ukryte "Szczegóły gry" = pusta odpowiedź bez game_count
    if (!r || typeof r.game_count !== 'number') throw new AppError('PRIVATE_GAMES');
    return (r.games ?? []).map(
      (g: any): OwnedGame => ({
        appid: g.appid,
        name: g.name ?? `App ${g.appid}`,
        playtimeMinutes: g.playtime_forever ?? 0,
        lastPlayed: g.rtime_last_played ?? 0,
        hasStats: g.has_community_visible_stats === true,
      }),
    );
  },

  async achievementSummary(appid, steamid, key) {
    try {
      const list = await playerAchievements(appid, steamid, key);
      return { total: list.length, achieved: list.filter((a) => a.achieved === 1).length };
    } catch (e) {
      if (e instanceof AppError && e.code === 'NO_STATS') return { total: 0, achieved: 0 };
      throw e;
    }
  },

  async gameDetail(appid, name, steamid, key, lang) {
    const [player, schema, global] = await Promise.all([
      playerAchievements(appid, steamid, key, lang).catch((e) => {
        if (e instanceof AppError && e.code === 'NO_STATS') return [];
        throw e;
      }),
      request('/ISteamUserStats/GetSchemaForGame/v2/', { key, appid, l: steamLang(lang) }),
      // procenty globalne nie wymagają klucza i bywają niedostępne — wtedy po prostu ich nie pokazujemy
      request('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appid }).catch(() => null),
    ]);

    const schemaList: any[] = schema.body?.game?.availableGameStats?.achievements ?? [];
    const schemaBy = new Map(schemaList.map((s) => [s.name, s]));
    const pctBy = new Map<string, number>(
      (global?.body?.achievementpercentages?.achievements ?? []).map((a: any) => [a.name, parseFloat(a.percent)]),
    );

    const achievements: Achievement[] = player.map((a: any) => {
      const s = schemaBy.get(a.apiname) ?? {};
      const pct = pctBy.get(a.apiname);
      return {
        apiname: a.apiname,
        name: s.displayName || a.name || a.apiname,
        description: s.description || a.description || '',
        hidden: s.hidden === 1,
        icon: s.icon ?? '',
        iconGray: s.icongray ?? s.icon ?? '',
        achieved: a.achieved === 1,
        unlockTime: a.unlocktime ?? 0,
        percent: Number.isFinite(pct) ? (pct as number) : null,
      };
    });

    return { appid, name: schema.body?.game?.gameName || name, achievements, fetchedAt: Date.now() };
  },
};
