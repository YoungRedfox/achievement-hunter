// Serwer pośredniczący (Cloudflare Worker): trzyma klucz Steam Web API, żeby użytkownik wklejał tylko link do profilu.
// Przepuszcza wyłącznie odczyty z białej listy, dokleja klucz i nigdy go nie zwraca.

export interface Env {
  STEAM_KEY: string;
  /** Cloudflare Rate Limiting — limit zapytań na jeden adres IP */
  LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
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
