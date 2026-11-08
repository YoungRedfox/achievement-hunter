import type { Achievement, Guide, Lang } from '../shared/types';
import { AppError } from './errors';

// Poradnik generuje OpenAI (Responses API) z wyszukiwaniem w sieci — kroki mają opierać się na źródłach
const ENDPOINT = 'https://api.openai.com/v1/responses';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'steps', 'tips', 'missable', 'difficulty', 'estimatedMinutes', 'confidence', 'sources'],
  properties: {
    summary: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    tips: { type: 'array', items: { type: 'string' } },
    missable: { type: 'boolean' },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'very_hard'] },
    estimatedMinutes: { type: ['integer', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url'],
        properties: { title: { type: 'string' }, url: { type: 'string' } },
      },
    },
  },
} as const;

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
  ].join('\n');
}

function extractText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type === 'output_text') return c.text;
      if (c.type === 'refusal') throw new AppError('OPENAI_ERROR', c.refusal);
    }
  }
  throw new AppError('OPENAI_ERROR', 'Pusta odpowiedź modelu');
}

async function call(apiKey: string, body: object) {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new AppError('NETWORK');
  }
  const data: any = await res.json().catch(() => null);
  if (res.status === 401) throw new AppError('OPENAI_INVALID_KEY');
  if (res.status === 429) {
    throw new AppError(data?.error?.code === 'insufficient_quota' ? 'OPENAI_QUOTA' : 'RATE_LIMIT');
  }
  if (!res.ok) throw new AppError('OPENAI_ERROR', data?.error?.message ?? `HTTP ${res.status}`);
  return data;
}

export async function generateGuide(opts: {
  apiKey: string;
  model: string;
  lang: Lang;
  appid: number;
  gameName: string;
  achievement: Achievement;
}): Promise<Guide> {
  const a = opts.achievement;
  const user = [
    `Game: ${opts.gameName} (Steam appid ${opts.appid})`,
    `Achievement: ${a.name}`,
    `Official description: ${a.description || '(hidden achievement — no description)'}`,
    `Global unlock rate: ${a.percent === null ? 'unknown' : `${a.percent.toFixed(1)}%`}`,
  ].join('\n');

  const base = {
    model: opts.model,
    instructions: instructions(opts.lang),
    input: user,
    text: { format: { type: 'json_schema', name: 'achievement_guide', strict: true, schema } },
  };

  let data: any;
  try {
    data = await call(opts.apiKey, { ...base, tools: [{ type: 'web_search' }] });
  } catch (e) {
    // Część modeli/kont nie ma narzędzia wyszukiwania — wtedy próba bez niego
    if (e instanceof AppError && e.code === 'OPENAI_ERROR' && /tool|web_search/i.test(e.message)) {
      data = await call(opts.apiKey, base);
    } else throw e;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(extractText(data));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('OPENAI_ERROR', 'Nieczytelna odpowiedź modelu');
  }

  return {
    summary: String(parsed.summary ?? ''),
    steps: (parsed.steps ?? []).map(String),
    tips: (parsed.tips ?? []).map(String),
    missable: !!parsed.missable,
    difficulty: parsed.difficulty ?? 'medium',
    estimatedMinutes: typeof parsed.estimatedMinutes === 'number' ? parsed.estimatedMinutes : null,
    confidence: parsed.confidence ?? 'low',
    // tylko http(s) — link z modelu idzie potem do shell.openExternal
    sources: (parsed.sources ?? []).filter((s: any) => /^https?:\/\//i.test(s?.url ?? '')),
    generatedAt: Date.now(),
    model: opts.model,
  };
}
