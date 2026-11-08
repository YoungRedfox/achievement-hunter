// Czysty moduł bez importów — testowany bezpośrednio przez node --test

export type ProfileRef = { kind: 'steamid'; value: string } | { kind: 'vanity'; value: string };

const STEAMID = /^7656\d{13}$/;
const VANITY = /^[A-Za-z0-9_-]{2,32}$/;

/** Rozpoznaje link do profilu, SteamID64 albo samą nazwę z /id/. */
export function parseProfileInput(raw: string): ProfileRef | null {
  const input = raw.trim();
  if (!input) return null;
  if (STEAMID.test(input)) return { kind: 'steamid', value: input };

  const withProto = /^https?:\/\//i.test(input) ? input : /steamcommunity\.com/i.test(input) ? `https://${input}` : null;
  if (withProto) {
    let url: URL;
    try {
      url = new URL(withProto);
    } catch {
      return null;
    }
    if (!/(^|\.)steamcommunity\.com$/i.test(url.hostname)) return null;
    const [section, id] = url.pathname.split('/').filter(Boolean);
    if (section === 'profiles' && id && STEAMID.test(id)) return { kind: 'steamid', value: id };
    if (section === 'id' && id && VANITY.test(id)) return { kind: 'vanity', value: id };
    return null;
  }

  if (VANITY.test(input)) return { kind: 'vanity', value: input };
  return null;
}

/** Klucz Steam Web API to 32 znaki szesnastkowe. */
export function isSteamKey(key: string): boolean {
  return /^[0-9A-Fa-f]{32}$/.test(key.trim());
}
