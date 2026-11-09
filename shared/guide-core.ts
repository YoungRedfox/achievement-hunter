// Generowanie poradnika — wspólne dla aplikacji (własny klucz gracza) i serwera (nasz klucz).
// Tylko fetch, bez Node i bez Electrona, żeby działało w obu miejscach.
import type { Guide, Lang } from './types';

export type AiProvider = 'gemini' | 'openai';
export const AI_PROVIDERS: AiProvider[] = ['gemini', 'openai'];
export const DEFAULT_MODELS: Record<AiProvider, string> = { gemini: 'gemini-2.5-flash', openai: 'gpt-5-mini' };

export interface GuideInput {
  appid: number;
  gameName: string;
  name: string;
  description: string;
  percent: number | null;
  lang: Lang;
}

export type GuideErrorCode = 'AI_INVALID_KEY' | 'AI_LIMIT' | 'AI_ERROR' | 'NETWORK';
// Bez skrótu "public code" w konstruktorze — Node (testy) uruchamia ten plik bez kompilacji
export class GuideError extends Error {
  code: GuideErrorCode;
  constructor(code: GuideErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const FIELDS = `{"summary": string, "steps": string[], "tips": string[], "missable": boolean, "difficulty": "easy"|"medium"|"hard"|"very_hard", "estimatedMinutes": integer|null, "confidence": "high"|"medium"|"low", "sources": [{"title": string, "url": string}]}`;

function instructions(lang: Lang) {
  const language = lang === 'pl' ? 'Polish' : 'English';
  return [
    'You are a meticulous achievement hunter writing a short, practical guide for one Steam achievement.',
    'Search the web for how players actually unlock it (Steam guides, wikis, TrueAchievements, forums).',
    `Write every text field in ${language}. Keep in-game names (items, places, bosses) as they appear in the game.`,
    'Steps: 3-8 concrete actions in order — where to go, what to do, prerequisites, settings, difficulty choice.',
    'Never invent locations, items or mechanics. If sources are thin or disagree, say so in the summary and set confidence to "low".',
    'missable = true only if the achievement can be permanently missed in a playthrough.',
    'estimatedMinutes = rough time for an average player from now, or null if unknowable.',
    'sources = only pages you actually used, with real URLs.',
    `Answer with ONLY a JSON object of this shape, no markdown: ${FIELDS}`,
  ].join('\n');
}

function userText(i: GuideInput) {
  return [
    `Game: ${i.gameName} (Steam appid ${i.appid})`,
    `Achievement: ${i.name}`,
    `Official description: ${i.description || '(hidden achievement — no description)'}`,
    `Global unlock rate: ${i.percent === null ? 'unknown' : `${i.percent.toFixed(1)}%`}`,
  ].join('\n');
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new GuideError('NETWORK');
  }
  const data: any = await res.json().catch(() => null);
  return { res, data };
}

// ---- Gemini (z wyszukiwaniem Google) ----

async function gemini(apiKey: string, model: string, input: GuideInput) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const { res, data } = await post(url, { 'x-goog-api-key': apiKey }, {
    systemInstruction: { parts: [{ text: instructions(input.lang) }] },
    contents: [{ role: 'user', parts: [{ text: userText(input) }] }],
    tools: [{ google_search: {} }],
  });
  const msg = data?.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 429) throw new GuideError('AI_LIMIT', msg);
  if (res.status === 401 || res.status === 403 || /API key/i.test(msg)) {
    if (!res.ok) throw new GuideError('AI_INVALID_KEY', msg);
  }
  if (!res.ok) throw new GuideError('AI_ERROR', msg);

  const cand = data?.candidates?.[0];
  const text: string = (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  // Źródła z wyszukiwania Google — pewniejsze niż te wypisane przez model
  const grounded = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c: any) => c.web)
    .filter((w: any) => w?.uri)
    .map((w: any) => ({ title: String(w.title ?? ''), url: String(w.uri) }));
  return { text, grounded };
}

// ---- OpenAI (Responses API z wyszukiwaniem) ----

function openAiText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type === 'output_text') return c.text;
      if (c.type === 'refusal') throw new GuideError('AI_ERROR', c.refusal);
    }
  }
  return '';
}

async function openai(apiKey: string, model: string, input: GuideInput) {
  const body = { model, instructions: instructions(input.lang), input: userText(input) };
  let { res, data } = await post('https://api.openai.com/v1/responses', { Authorization: `Bearer ${apiKey}` }, {
    ...body,
    tools: [{ type: 'web_search' }],
  });
  // Część kont/modeli nie ma wyszukiwania — wtedy próba bez niego
  if (res.status === 400 && /tool|web_search/i.test(data?.error?.message ?? '')) {
    ({ res, data } = await post('https://api.openai.com/v1/responses', { Authorization: `Bearer ${apiKey}` }, body));
  }
  if (res.status === 401) throw new GuideError('AI_INVALID_KEY');
  if (res.status === 429) throw new GuideError('AI_LIMIT', data?.error?.code);
  if (!res.ok) throw new GuideError('AI_ERROR', data?.error?.message ?? `HTTP ${res.status}`);
  return { text: openAiText(data), grounded: [] as { title: string; url: string }[] };
}

/** Wyciąga obiekt JSON z odpowiedzi — modele z wyszukiwaniem lubią dodać ```json albo zdanie wstępu. */
export function parseGuideJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new GuideError('AI_ERROR', 'Brak JSON w odpowiedzi');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new GuideError('AI_ERROR', 'Nieczytelny JSON w odpowiedzi');
  }
}

const DIFF = ['easy', 'medium', 'hard', 'very_hard'];
const CONF = ['high', 'medium', 'low'];
const httpOnly = (s: any) => typeof s?.url === 'string' && /^https?:\/\//i.test(s.url);

export async function generateGuide(provider: AiProvider, apiKey: string, model: string, input: GuideInput): Promise<Guide> {
  const { text, grounded } = provider === 'gemini' ? await gemini(apiKey, model, input) : await openai(apiKey, model, input);
  const p = parseGuideJson(text);
  const sources = [...grounded, ...(Array.isArray(p.sources) ? p.sources : [])].filter(httpOnly).slice(0, 6);
  return {
    summary: String(p.summary ?? '').slice(0, 1200),
    steps: (Array.isArray(p.steps) ? p.steps : []).map(String).slice(0, 12),
    tips: (Array.isArray(p.tips) ? p.tips : []).map(String).slice(0, 8),
    missable: !!p.missable,
    difficulty: DIFF.includes(p.difficulty) ? p.difficulty : 'medium',
    estimatedMinutes: Number.isInteger(p.estimatedMinutes) ? p.estimatedMinutes : null,
    confidence: CONF.includes(p.confidence) ? p.confidence : 'low',
    sources: sources.map((s: any) => ({ title: String(s.title ?? '').slice(0, 200), url: String(s.url) })),
    generatedAt: Date.now(),
    model,
  };
}
