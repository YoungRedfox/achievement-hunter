import { app } from 'electron';
import { DEFAULT_PROXY_URL } from '../shared/config';
import { langInfo } from '../shared/langs';
import type { Achievement, Guide, Lang, OwnedGame, Profile } from '../shared/types';
import { AppError, sleep } from './errors';
import { isSteamKey, parseProfileInput } from './profile-input';
import type { Provider, SteamKey } from './provider';

// Oficjalne Steam Web API. Bez logowania: tylko publiczne dane.
// Zapytania wymagające klucza idą przez nasz serwer (server/) albo, jeśli użytkownik woli, z jego własnym kluczem.
const API = 'https://api.steampowered.com';
const ICONS = 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps';
const steamLang = (l: Lang) => langInfo(l).steam;

// Nadpisanie adresu tylko w wersji deweloperskiej — zainstalowana aplikacja zawsze mówi z naszym serwerem
export const proxyUrl = () => ((!app.isPackaged && process.env.AH_PROXY_URL) || DEFAULT_PROXY_URL).replace(/\/+$/, '');

interface Raw {
  status: number;
  body: any;
}

async function send(url: URL, viaProxy: boolean): Promise<Raw> {
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
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      // zły klucz albo limit Cloudflare = HTML zamiast JSON
    }

    if (viaProxy) {
      // Serwer sam ponawia i cache'uje — tu nie męczymy limitu powtórkami 429
      if (res.status === 429) throw new AppError(body?.error === 'TOO_FAST' ? 'RATE_LIMIT' : 'DAILY_LIMIT');
      if (res.status === 503) throw new AppError('SERVICE_DOWN');
      if (res.status >= 500 || (body === null && res.status !== 200)) {
        if (attempt < 1) {
          await sleep(1200);
          continue;
        }
        throw new AppError('SERVICE_DOWN', `proxy ${res.status}`);
      }
      return { status: res.status, body };
    }

    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    // Własny klucz: uparte 429 po powtórkach = wyczerpany dzienny limit tego klucza
    if (res.status === 429) throw new AppError('DAILY_LIMIT');
    if ((res.status === 401 || res.status === 403) && body === null) throw new AppError('INVALID_KEY');
    if (res.status >= 500) throw new AppError('NETWORK', `Steam ${res.status}`);
    return { status: res.status, body };
  }
}

/** Zapytanie wymagające klucza: przez serwer albo z kluczem użytkownika. */
function keyed(path: string, params: Record<string, string | number>, key: SteamKey): Promise<Raw> {
  const proxy = proxyUrl();
  if (!key && !proxy) throw new AppError('INVALID_KEY');
  const url = key ? new URL(API + path) : new URL(`${proxy}/steam${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  if (key) url.searchParams.set('key', key);
  return send(url, !key);
}

/** Publiczne zapytanie bez klucza — nie zużywa żadnego limitu naszego klucza. */
function open(path: string, params: Record<string, string | number>): Promise<Raw> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return send(url, false);
}

/** Poradnik z naszego serwera — nasz klucz AI, wspólny zapis gotowych poradników. Wysyłamy tylko numer gry i osiągnięcia. */
export async function proxyGuide(appid: number, apiname: string, lang: Lang): Promise<Guide> {
  const proxy = proxyUrl();
  if (!proxy) throw new AppError('NO_AI_KEY');
  const url = new URL(`${proxy}/guide`);
  url.searchParams.set('appid', String(appid));
  url.searchParams.set('apiname', apiname);
  url.searchParams.set('lang', lang);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new AppError('NETWORK');
  }
  const body: any = await res.json().catch(() => null);
  if (res.ok && body?.steps) return body as Guide;
  if (res.status === 429) throw new AppError(body?.error === 'TOO_FAST' ? 'RATE_LIMIT' : 'AI_LIMIT');
  if (res.status === 503) throw new AppError(body?.error === 'AI_BUSY' ? 'AI_BUSY' : 'SERVICE_DOWN');
  throw new AppError('AI_ERROR', body?.error ?? `HTTP ${res.status}`);
}

function playerStatsError(body: any): AppError | null {
  const err: string | undefined = body?.playerstats?.error;
  if (!err) return null;
  if (/not public/i.test(err)) return new AppError('PRIVATE_GAMES', err);
  if (/no stats/i.test(err)) return new AppError('NO_STATS', err);
  return new AppError('UNKNOWN', err);
}

async function playerAchievements(appid: number, steamid: string, key: SteamKey, lang?: Lang) {
  const params: Record<string, string | number> = { appid, steamid };
  if (lang) params.l = steamLang(lang);
  const { body } = await keyed('/ISteamUserStats/GetPlayerAchievements/v1/', params, key);
  const err = playerStatsError(body);
  if (err) throw err;
  const list: any[] = body?.playerstats?.achievements ?? [];
  return list;
}

export const steamProvider: Provider = {
  async resolveProfile(input, key) {
    if (key !== null && !isSteamKey(key)) throw new AppError('INVALID_KEY');
    const ref = parseProfileInput(input);
    if (!ref) throw new AppError('INVALID_INPUT');

    let steamid = ref.value;
    if (ref.kind === 'vanity') {
      const { body } = await keyed('/ISteamUser/ResolveVanityURL/v1/', { vanityurl: ref.value }, key);
      if (body?.response?.success !== 1) throw new AppError('PROFILE_NOT_FOUND');
      steamid = body.response.steamid;
    }

    const { body } = await keyed('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamid }, key);
    const p = body?.response?.players?.[0];
    if (!p) throw new AppError('PROFILE_NOT_FOUND');
    // 3 = profil publiczny; inaczej Steam nie odda listy gier
    if (p.communityvisibilitystate !== 3) throw new AppError('PRIVATE_PROFILE');

    const profile: Profile = { steamid, name: p.personaname, avatar: p.avatarfull, profileUrl: p.profileurl };
    return profile;
  },

  async ownedGames(steamid, key) {
    const { body } = await keyed(
      '/IPlayerService/GetOwnedGames/v1/',
      { steamid, include_appinfo: 1, include_played_free_games: 1 },
      key,
    );
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

  async progress(appids, steamid, key) {
    // Własny klucz: wprost do Steam. Bez klucza: przez nasz serwer, który zwraca same liczby.
    if (key) {
      const url = new URL(`${API}/IPlayerService/GetTopAchievementsForGames/v1/`);
      url.searchParams.set('key', key);
      url.searchParams.set('steamid', steamid);
      url.searchParams.set('language', 'english');
      url.searchParams.set('max_achievements', '10000');
      appids.forEach((a, i) => url.searchParams.set(`appids[${i}]`, String(a)));
      const { body } = await send(url, false);
      return (body?.response?.games ?? []).map((g: any) => ({
        appid: g.appid,
        total: g.total_achievements ?? 0,
        achieved: (g.achievements ?? []).length,
      }));
    }
    const proxy = proxyUrl();
    if (!proxy) throw new AppError('INVALID_KEY');
    const url = new URL(`${proxy}/progress`);
    url.searchParams.set('steamid', steamid);
    url.searchParams.set('appids', appids.join(','));
    const { body } = await send(url, true);
    if (!Array.isArray(body?.games)) throw new AppError('SERVICE_DOWN');
    return body.games;
  },

  async gameDetail(appid, name, steamid, key, lang) {
    // Jedno zapytanie z kluczem (co zdobyte) + jedno publiczne (nazwy, ikony, procent graczy)
    const [player, schema] = await Promise.all([
      playerAchievements(appid, steamid, key, lang).catch((e) => {
        if (e instanceof AppError && e.code === 'NO_STATS') return [];
        throw e;
      }),
      open('/IPlayerService/GetGameAchievements/v1/', { appid, language: steamLang(lang) }).catch(() => null),
    ]);

    const schemaBy = new Map<string, any>((schema?.body?.response?.achievements ?? []).map((s: any) => [s.internal_name, s]));

    const achievements: Achievement[] = player.map((a: any) => {
      const s = schemaBy.get(a.apiname);
      const pct = parseFloat(s?.player_percent_unlocked);
      return {
        apiname: a.apiname,
        name: s?.localized_name || a.name || a.apiname,
        description: s?.localized_desc || a.description || '',
        hidden: s?.hidden === true,
        icon: s?.icon ? `${ICONS}/${appid}/${s.icon}` : '',
        iconGray: s?.icon_gray ? `${ICONS}/${appid}/${s.icon_gray}` : '',
        achieved: a.achieved === 1,
        unlockTime: a.unlocktime ?? 0,
        percent: Number.isFinite(pct) ? pct : null,
      };
    });

    return { appid, name, achievements, fetchedAt: Date.now(), lang };
  },
};
