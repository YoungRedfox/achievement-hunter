// Czysty moduł bez importów — testowany bezpośrednio przez node --test.

export type XboxFail = (code: 'XBOX_INVALID_KEY' | 'XBOX_LIMIT' | 'XBOX_ERROR', message?: string) => never;

/**
 * OpenXBL opakowuje odpowiedź Xbox Live w { content, code } — HTTP bywa 200 także przy błędzie,
 * a content bywa tekstem z JSON-em w środku. Zwracamy samą treść albo zgłaszamy właściwy błąd.
 */
export function unwrap(raw: any, fail: XboxFail): any {
  if (!raw || typeof raw !== 'object' || !('content' in raw)) return raw;
  let content = raw.content;
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch {
      // zwykły tekst — zostaje jako komunikat
    }
  }
  const code = Number(raw.code ?? 200);
  if (code === 401 || code === 403) fail('XBOX_INVALID_KEY');
  if (code === 429) fail('XBOX_LIMIT');
  if (code >= 400) fail('XBOX_ERROR', `code ${code}: ${JSON.stringify(content).slice(0, 200)}`);
  return content;
}
