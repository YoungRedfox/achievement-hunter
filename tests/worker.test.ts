import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/src/index.ts';

const ctx = { waitUntil() {} };
const env = { STEAM_KEY: 'SECRETKEY' };
const SID = '76561197960435530';

function mockSteam(status: number, body: string) {
  const calls: string[] = [];
  globalThis.fetch = (async (u: string) => {
    calls.push(String(u));
    return new Response(body, { status });
  }) as typeof fetch;
  return calls;
}

const get = (path: string) => worker.fetch(new Request(`https://w.dev${path}`), env, ctx);

test('adds the key and passes the body through', async () => {
  const calls = mockSteam(200, '{"response":{"game_count":1}}');
  const res = await get(`/steam/IPlayerService/GetOwnedGames/v1/?steamid=${SID}&include_appinfo=1`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"response":{"game_count":1}}');
  assert.match(calls[0], /key=SECRETKEY/);
});

test('rejects paths and params outside the whitelist', async () => {
  mockSteam(200, '{}');
  assert.equal((await get('/steam/ISteamApps/GetAppList/v2/')).status, 404);
  assert.equal((await get(`/steam/IPlayerService/GetOwnedGames/v1/?steamid=${SID}&key=x`)).status, 400);
  assert.equal((await get('/steam/IPlayerService/GetOwnedGames/v1/?steamid=123')).status, 400);
});

test('maps Steam 429 to DAILY_LIMIT', async () => {
  mockSteam(429, 'Too Many Requests');
  const res = await get(`/steam/ISteamUserStats/GetPlayerAchievements/v1/?steamid=${SID}&appid=620`);
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'DAILY_LIMIT' });
});

test('our rejected key is a service outage, private profile is passed through', async () => {
  mockSteam(403, '<html>Forbidden</html>');
  assert.equal((await get(`/steam/IPlayerService/GetOwnedGames/v1/?steamid=${SID}`)).status, 503);
  mockSteam(403, '{"playerstats":{"error":"Profile is not public","success":false}}');
  const res = await get(`/steam/ISteamUserStats/GetPlayerAchievements/v1/?steamid=${SID}&appid=620`);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /not public/);
});

test('blocks browser origins and per-IP floods', async () => {
  mockSteam(200, '{}');
  const browser = new Request(`https://w.dev/steam/ISteamUser/ResolveVanityURL/v1/?vanityurl=abc`, { headers: { origin: 'https://evil.example' } });
  assert.equal((await worker.fetch(browser, env, ctx)).status, 403);
  const limited = { ...env, LIMITER: { limit: async () => ({ success: false }) } };
  const res = await worker.fetch(new Request(`https://w.dev/steam/ISteamUser/ResolveVanityURL/v1/?vanityurl=abc`), limited, ctx);
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'TOO_FAST' });
});

test('never leaks the key in responses', async () => {
  mockSteam(200, '{"ok":1}');
  const res = await get(`/steam/ISteamUser/ResolveVanityURL/v1/?vanityurl=robinwalker`);
  assert.doesNotMatch(await res.text(), /SECRETKEY/);
});

test('progress batches many games into one Steam call and returns counts only', async () => {
  const calls = mockSteam(
    200,
    JSON.stringify({ response: { games: [{ appid: 440, total_achievements: 520, achievements: [{ name: 'a' }, { name: 'b' }] }, { appid: 400, total_achievements: 15 }] } }),
  );
  const res = await get(`/progress?steamid=${SID}&appids=440,400`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { games: [{ appid: 440, total: 520, achieved: 2 }, { appid: 400, total: 15, achieved: 0 }] });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /appids%5B1%5D=400/);
  assert.equal((await get(`/progress?steamid=${SID}&appids=${Array.from({ length: 101 }, (_, i) => i + 1).join(',')}`)).status, 400);
});
