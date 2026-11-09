import { useEffect, type ReactNode } from 'react';
import { useLang, useT } from '../i18n';
import { api } from '../lib';
import { Mark } from './ui';

// Notatki wydań wbudowane w aplikację w czasie budowania:
// docs/release-notes/<wersja>.md = angielski (też na GitHub), <wersja>.<język>.md = tłumaczenie
const files = import.meta.glob('../../docs/release-notes/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const NOTES: { version: string; lang: string; text: string }[] = Object.entries(files)
  .map(([file, text]) => {
    const m = file.match(/(\d+\.\d+\.\d+)(?:\.([A-Za-z-]+))?\.md$/);
    return { version: m?.[1] ?? '', lang: m?.[2] ?? 'en', text };
  })
  .filter((n) => n.version);

function cmp(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Notatki od wersji „from” (bez niej) do „current”, w języku gracza; brak tłumaczenia = angielski. */
export function notesBetween(from: string | null, current: string, lang: string) {
  const versions = [...new Set(NOTES.map((n) => n.version))]
    .filter((v) => cmp(v, current) <= 0 && (from ? cmp(v, from) > 0 : v === current))
    .sort((a, b) => cmp(b, a));
  return versions.map((version) => {
    const own = NOTES.find((n) => n.version === version && n.lang === lang);
    const en = NOTES.find((n) => n.version === version && n.lang === 'en');
    return { version, text: (own ?? en)!.text };
  });
}

// Mały renderer markdownu: nagłówki, listy, **pogrubienie**, [linki](url). Tekst idzie przez React — bez wstrzykiwania HTML.
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\((https?:\/\/[^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else {
      const url = m[3];
      out.push(
        <button key={m.index} className="link" onClick={() => api.openExternal(url)}>
          {m[2]}
        </button>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>);
    if (list.length)
      blocks.push(
        <ul key={blocks.length}>
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
    para = [];
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith('## ') || line.startsWith('### ')) {
      flush();
      blocks.push(<h3 key={blocks.length}>{inline(line.replace(/^#+\s/, ''))}</h3>);
    } else if (line.startsWith('- ')) {
      if (para.length) flush();
      list.push(line.slice(2));
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return <>{blocks}</>;
}

export function WhatsNew({ from, current, onClose }: { from: string | null; current: string; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const notes = notesBetween(from, current, lang);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal whats-new" role="dialog" aria-modal="true" aria-labelledby="wn-title">
        <header>
          <Mark size={28} />
          <div>
            <p className="eyebrow">{t('whatsNew.eyebrow')}</p>
            <h2 id="wn-title" className="display">
              {t('whatsNew.title', { v: current })}
            </h2>
          </div>
        </header>
        <div className="modal-body">
          {notes.length === 0 ? (
            <p>{t('whatsNew.empty')}</p>
          ) : (
            notes.map((n) => (
              <section key={n.version}>
                {notes.length > 1 && <p className="wn-version mono">v{n.version}</p>}
                <Markdown text={n.text} />
              </section>
            ))
          )}
        </div>
        <footer>
          <button className="primary" autoFocus onClick={onClose}>
            {t('whatsNew.ok')}
          </button>
        </footer>
      </div>
    </div>
  );
}
