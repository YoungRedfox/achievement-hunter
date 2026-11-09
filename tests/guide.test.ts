import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/src/index.ts';
import { parseGuideJson } from '../shared/guide-core.ts';

const geminiReply = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: '```json\n{"summary":"S","steps":["a","b"],"tips":[],"missable":false,"difficulty":"easy","estimatedMinutes":5,"confidence":"high","sources":[]}\n```',
          },
        ],
      },
      groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/g', title: 'Guide' } }] },
    },
  ],
};

function fakeSteamAndAi(ai: () => Response) {
  const sent: string[] = [];
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    const url = String(u);
    if (url.includes('GetGameAchievements')) {
      return Response.json({
        response: { achievements: [{ internal_name: 'ACH_1', localized_name: 'Pobudka', localized_desc: 'Opis', player_percent_unlocked: '74.0' }] },
      });
    }
    if (url.includes('appdetails')) return Response.json({ '620': { data: { name: 'Portal 2' } } });
    sent.push(String(init?.body));
    return ai();
  }) as typeof fetch;
  return sent;
}

function setup() {
  const store = new Map<string, string>();
  const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => void store.set(k, v) };
  const waits: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p) };
  const env = { STEAM_KEY: 'S', GUIDES: kv, GEMINI_KEY: 'G' };
  return { store, waits, ctx, env };
}

test('guide uses Steam data, not client data, and caches per achievement', async () => {
  const { store, waits, ctx, env } = setup();
  const sent = fakeSteamAndAi(() => Response.json(geminiReply));
  const res = await worker.fetch(new Request('https://w.dev/guide?appid=620&apiname=ACH_1&lang=pl&name=FAKE'), env, ctx);
  assert.equal(res.status, 200);
  const g = await res.json();
  assert.equal(g.summary, 'S');
  assert.equal(g.sources[0].url, 'https://example.com/g');
  assert.match(sent[0], /Pobudka/);
  assert.match(sent[0], /Portal 2/);
  assert.doesNotMatch(sent[0], /FAKE/);
  await Promise.all(waits);
  assert.ok(store.has('g:620:ACH_1:pl'));

  // drugi raz z pamięci serwera — AI nie jest wołane
  const again = await worker.fetch(new Request('https://w.dev/guide?appid=620&apiname=ACH_1&lang=pl'), env, ctx);
  assert.equal(again.status, 200);
  assert.equal(sent.length, 1);
});

test('guide maps AI quota to AI_LIMIT and rejects unknown achievements', async () => {
  const { ctx, env } = setup();
  fakeSteamAndAi(() => Response.json({ error: { message: 'quota' } }, { status: 429 }));
  const lim = await worker.fetch(new Request('https://w.dev/guide?appid=620&apiname=ACH_1&lang=pl'), env, ctx);
  assert.equal(lim.status, 429);
  assert.equal((await lim.json()).error, 'AI_LIMIT');
  const missing = await worker.fetch(new Request('https://w.dev/guide?appid=620&apiname=NOPE&lang=pl'), env, ctx);
  assert.equal(missing.status, 404);
  const bad = await worker.fetch(new Request('https://w.dev/guide?appid=x&apiname=ACH_1&lang=pl'), env, ctx);
  assert.equal(bad.status, 400);
});

test('parses JSON wrapped in prose or fences', () => {
  assert.deepEqual(parseGuideJson('Oto wynik:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseGuideJson('brak'));
});

test('guide-text keys the cache by the full content and validates input', async () => {
  const { store, waits, ctx, env } = setup();
  const sent = fakeSteamAndAi(() => Response.json(geminiReply));
  const base = 'https://w.dev/guide-text?platform=xbox&id=1777860928&game=Halo&lang=en';
  const ok = await worker.fetch(new Request(`${base}&name=Legend&desc=Finish%20on%20Legendary`), env, ctx);
  assert.equal(ok.status, 200);
  await Promise.all(waits);
  // inna treść = inny wpis, nie nadpisuje pierwszego
  await worker.fetch(new Request(`${base}&name=Legend&desc=FAKE`), env, ctx);
  await Promise.all(waits);
  assert.equal([...store.keys()].filter((k) => k.startsWith('gt:')).length, 2);
  assert.match(sent[0], /Halo \(Xbox\)/);
  assert.equal((await worker.fetch(new Request(`${base}&name=${'x'.repeat(200)}`), env, ctx)).status, 400);
  assert.equal((await worker.fetch(new Request('https://w.dev/guide-text?platform=psn&id=1&game=a&name=b&lang=en'), env, ctx)).status, 400);
});
