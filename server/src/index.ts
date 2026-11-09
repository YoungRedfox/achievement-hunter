// Serwer pośredniczący (Cloudflare Worker): trzyma klucz Steam Web API, żeby użytkownik wklejał tylko link do profilu.
// Przepuszcza wyłącznie odczyty z białej listy, dokleja klucz i nigdy go nie zwraca.
// Generuje też poradniki AI naszym kluczem i zapisuje je per osiągnięcie (bez żadnych danych o graczu).
import { isLang, langInfo } from '../../shared/langs.ts';
import { AI_PROVIDERS, DEFAULT_MODELS, GuideError, generateGuide, type AiProvider } from '../../shared/guide-core.ts';

type Limiter = { limit(opts: { key: string }): Promise<{ success: boolean }> };
interface Kv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  STEAM_KEY: string;
  /** Cloudflare Rate Limiting — limit zapytań na jeden adres IP */
  LIMITER?: Limiter;
  GUIDE_LIMITER?: Limiter;
  /** gotowe poradniki: klucz = gra + osiągnięcie + język */
  GUIDES?: Kv;
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  GEMINI_KEY?: string;
  OPENAI_KEY?: string;
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

// ścieżka Steam -> czas życia w pamięci podręcznej (s)
const ROUTES = new Map<string, number>([
  ['/ISteamUser/ResolveVanityURL/v1/', 86_400],
  ['/ISteamUser/GetPlayerSummaries/v2/', 3_600],
  ['/IPlayerService/GetOwnedGames/v1/', 1_800],
  ['/ISteamUserStats/GetPlayerAchievements/v1/', 300],
]);
const PARAMS = new Set(['vanityurl', 'steamids', 'steamid', 'appid', 'include_appinfo', 'include_played_free_games', 'l']);
const STEAMID = /^7656\d{13}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

function validParam(k: string, v: string) {
  if (!PARAMS.has(k) || v.length > 64) return false;
  if (k === 'steamid' || k === 'steamids') return STEAMID.test(v);
  if (k === 'appid') return /^\d{1,10}$/.test(v);
  if (k === 'vanityurl') return /^[A-Za-z0-9_-]{2,32}$/.test(v);
  return /^[a-z0-9]{1,16}$/i.test(v);
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'GET') return json({ error: 'METHOD' }, 405);
    // Aplikacja woła z procesu Node (bez nagłówka Origin). Strony WWW nie mogą korzystać z naszego klucza.
    if (req.headers.get('origin')) return json({ error: 'FORBIDDEN' }, 403);
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname === '/guide') return guide(url, req, env, ctx);
    if (url.pathname === '/progress') return progress(url, req, env);
    if (!url.pathname.startsWith('/steam/')) return json({ error: 'NOT_FOUND' }, 404);

    const path = url.pathname.slice('/steam'.length);
    const ttl = ROUTES.get(path);
    if (!ttl) return json({ error: 'NOT_FOUND' }, 404);

    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (params.some(([k, v]) => !validParam(k, v))) return json({ error: 'BAD_REQUEST' }, 400);
    if (!env.STEAM_KEY) return json({ error: 'SERVICE_DOWN' }, 503);

    // Jeden użytkownik nie może wypalić dziennego limitu wszystkim
    const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) return json({ error: 'TOO_FAST' }, 429);

    // Pamięć podręczna oszczędza dzienny limit klucza (działa na własnej domenie, na *.workers.dev nie)
    const query = new URLSearchParams(params).toString();
    const cacheKey = new Request(`https://cache.achievement-hunter${path}?${query}`);
    const cache = (globalThis as any).caches?.default as Cache | undefined;
    const hit = await cache?.match(cacheKey).catch(() => undefined);
    if (hit) return hit;

    const target = new URL(`https://api.steampowered.com${path}?${query}`);
    target.searchParams.set('key', env.STEAM_KEY);

    let res: Response;
    try {
      res = await fetch(target.toString());
    } catch {
      return json({ error: 'UPSTREAM' }, 502);
    }
    const body = await res.text();
    const isJson = body.trimStart().startsWith('{');

    // 429 od Steam = wyczerpany dzienny limit naszego klucza
    if (res.status === 429) return json({ error: 'DAILY_LIMIT' }, 429);
    // Steam odrzucił NASZ klucz — to awaria usługi, nie wina użytkownika
    if ((res.status === 401 || res.status === 403) && !isJson) return json({ error: 'SERVICE_DOWN' }, 503);
    if (res.status >= 500) return json({ error: 'UPSTREAM' }, 502);

    const out = new Response(body, {
      status: res.status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${ttl}` },
    });
    if (res.status === 200 && cache) ctx.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  },
};

// ---- poradniki AI ----

const GUIDE_TTL = 120 * 86_400; // poradnik żyje 120 dni, potem generuje się od nowa

async function guide(url: URL, req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const appid = url.searchParams.get('appid') ?? '';
  const apiname = url.searchParams.get('apiname') ?? '';
  const lang = url.searchParams.get('lang') ?? '';
  if (!/^\d{1,10}$/.test(appid) || !/^[\w.:-]{1,128}$/.test(apiname) || !isLang(lang)) {
    return json({ error: 'BAD_REQUEST' }, 400);
  }

  const cacheKey = `g:${appid}:${apiname}:${lang}`;
  const cached = await env.GUIDES?.get(cacheKey).catch(() => null);
  if (cached) return new Response(cached, { headers: { 'content-type': 'application/json; charset=utf-8' } });

  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.GUIDE_LIMITER && !(await env.GUIDE_LIMITER.limit({ key: ip })).success) return json({ error: 'TOO_FAST' }, 429);

  const provider = (AI_PROVIDERS.includes(env.AI_PROVIDER as AiProvider) ? env.AI_PROVIDER : 'gemini') as AiProvider;
  const apiKey = provider === 'gemini' ? env.GEMINI_KEY : env.OPENAI_KEY;
  if (!apiKey) return json({ error: 'SERVICE_DOWN' }, 503);

  // Nazwę i opis osiągnięcia bierzemy ze Steam, nie od klienta — nikt nie podrzuci fałszywego poradnika innym
  const language = langInfo(lang).steam;
  let ach: any;
  let gameName = `App ${appid}`;
  try {
    const [schema, store] = await Promise.all([
      fetch(`https://api.steampowered.com/IPlayerService/GetGameAchievements/v1/?appid=${appid}&language=${language}`).then((r) => r.json()) as Promise<any>,
      fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`)
        .then((r) => r.json())
        .catch(() => null) as Promise<any>,
    ]);
    ach = (schema?.response?.achievements ?? []).find((a: any) => a.internal_name === apiname);
    gameName = store?.[appid]?.data?.name ?? gameName;
  } catch {
    return json({ error: 'UPSTREAM' }, 502);
  }
  if (!ach) return json({ error: 'NOT_FOUND' }, 404);

  try {
    const pct = parseFloat(ach.player_percent_unlocked);
    const result = await generateGuide(provider, apiKey, env.AI_MODEL || DEFAULT_MODELS[provider], {
      appid: Number(appid),
      gameName,
      name: ach.localized_name || apiname,
      description: ach.localized_desc || '',
      percent: Number.isFinite(pct) ? pct : null,
      lang,
    });
    const body = JSON.stringify(result);
    if (env.GUIDES) ctx.waitUntil(env.GUIDES.put(cacheKey, body, { expirationTtl: GUIDE_TTL }).catch(() => undefined));
    return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8' } });
  } catch (e) {
    const code = e instanceof GuideError ? e.code : 'AI_ERROR';
    // Wyczerpany darmowy limit AI na dziś
    if (code === 'AI_BUSY') return json({ error: 'AI_BUSY' }, 503);
    if (code === 'AI_LIMIT') return json({ error: 'AI_LIMIT', detail: e instanceof Error ? e.message.slice(0, 300) : '' }, 429);
    // Nasz klucz AI odrzucony = awaria usługi, nie wina gracza
    if (code === 'AI_INVALID_KEY') return json({ error: 'SERVICE_DOWN' }, 503);
    // Krótki opis od dostawcy (bez klucza) — ułatwia diagnozę, gdy np. model zostanie wycofany
    const detail = e instanceof Error ? e.message.slice(0, 200) : '';
    return json({ error: 'AI_ERROR', detail }, 502);
  }
}

// ---- postęp osiągnięć wielu gier naraz ----
// Jedno zapytanie do Steam zamiast jednego na grę: 300 gier = 3 zapytania, a nie 300.

const MAX_APPIDS = 100;

async function progress(url: URL, req: Request, env: Env): Promise<Response> {
  const steamid = url.searchParams.get('steamid') ?? '';
  const appids = (url.searchParams.get('appids') ?? '').split(',').filter(Boolean);
  if (!STEAMID.test(steamid) || appids.length === 0 || appids.length > MAX_APPIDS || appids.some((a) => !/^\d{1,10}$/.test(a))) {
    return json({ error: 'BAD_REQUEST' }, 400);
  }
  if (!env.STEAM_KEY) return json({ error: 'SERVICE_DOWN' }, 503);
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) return json({ error: 'TOO_FAST' }, 429);

  // GetTopAchievementsForGames działa na klucz Web API (GetAchievementsProgress wymaga zalogowanego gracza)
  const target = new URL('https://api.steampowered.com/IPlayerService/GetTopAchievementsForGames/v1/');
  target.searchParams.set('key', env.STEAM_KEY);
  target.searchParams.set('steamid', steamid);
  target.searchParams.set('language', 'english');
  target.searchParams.set('max_achievements', '10000');
  appids.forEach((a, i) => target.searchParams.set(`appids[${i}]`, a));
  let res: Response;
  try {
    res = await fetch(target.toString());
  } catch {
    return json({ error: 'UPSTREAM' }, 502);
  }
  const body = await res.text();
  if (res.status === 429) return json({ error: 'DAILY_LIMIT' }, 429);
  if ((res.status === 401 || res.status === 403) && !body.trimStart().startsWith('{')) return json({ error: 'SERVICE_DOWN' }, 503);
  if (res.status >= 500 || !res.ok) return json({ error: 'UPSTREAM' }, 502);
  // Do aplikacji idą same liczby — listy osiągnięć (setki KB) nie są tu potrzebne
  let games: any[] = [];
  try {
    games = JSON.parse(body)?.response?.games ?? [];
  } catch {
    return json({ error: 'UPSTREAM' }, 502);
  }
  return json({
    games: games.map((g) => ({ appid: g.appid, total: g.total_achievements ?? 0, achieved: (g.achievements ?? []).length })),
  });
}
