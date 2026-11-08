import { memo, useMemo, useState } from 'react';
import type { LibraryGame } from '../../shared/types';
import { useT } from '../i18n';
import { pct } from '../lib';
import { Icon, SteamArt } from './ui';

export type Filter = 'progress' | 'untouched' | 'perfect' | 'all';
type Sort = 'closest' | 'remaining' | 'recent' | 'playtime' | 'name';

const inFilter = (g: LibraryGame, f: Filter) => {
  const s = g.summary;
  if (f === 'all') return true;
  if (!s || s.total === 0) return false;
  if (f === 'progress') return s.achieved > 0 && s.achieved < s.total;
  if (f === 'untouched') return s.achieved === 0;
  return s.achieved === s.total;
};

const sorters: Record<Sort, (a: LibraryGame, b: LibraryGame) => number> = {
  closest: (a, b) => pct(b) - pct(a) || a.name.localeCompare(b.name),
  remaining: (a, b) => left(a) - left(b) || a.name.localeCompare(b.name),
  recent: (a, b) => b.lastPlayed - a.lastPlayed,
  playtime: (a, b) => b.playtimeMinutes - a.playtimeMinutes,
  name: (a, b) => a.name.localeCompare(b.name),
};
function left(g: LibraryGame) {
  return g.summary ? g.summary.total - g.summary.achieved : Infinity;
}

export function Library({
  games,
  onOpen,
  filter,
  setFilter,
}: {
  games: LibraryGame[];
  onOpen: (appid: number) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const t = useT();
  const [sort, setSort] = useState<Sort>('closest');
  const [q, setQ] = useState('');

  const stats = useMemo(() => {
    const withAch = games.filter((g) => g.summary && g.summary.total > 0);
    return {
      games: games.length,
      withAch: withAch.length,
      perfect: withAch.filter((g) => g.summary!.achieved === g.summary!.total).length,
      unlocked: withAch.reduce((n, g) => n + g.summary!.achieved, 0),
    };
  }, [games]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { progress: 0, untouched: 0, perfect: 0, all: games.length };
    for (const g of games) for (const f of ['progress', 'untouched', 'perfect'] as const) if (inFilter(g, f)) c[f]++;
    return c;
  }, [games]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return games
      .filter((g) => inFilter(g, filter) && (!needle || g.name.toLowerCase().includes(needle)))
      .sort(sorters[sort]);
  }, [games, filter, sort, q]);

  return (
    <div className="page library">
      <header className="page-head">
        <div>
          <p className="eyebrow">{t('library.eyebrow')}</p>
          <h1 className="display">{t('library.title')}</h1>
        </div>
        <dl className="stats">
          <div>
            <dt>{t('library.stat.games')}</dt>
            <dd>{stats.games}</dd>
          </div>
          <div>
            <dt>{t('library.stat.withAch')}</dt>
            <dd>{stats.withAch}</dd>
          </div>
          <div>
            <dt>{t('library.stat.perfect')}</dt>
            <dd className="gold">{stats.perfect}</dd>
          </div>
          <div>
            <dt>{t('library.stat.unlocked')}</dt>
            <dd>{stats.unlocked.toLocaleString()}</dd>
          </div>
        </dl>
      </header>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {(['progress', 'untouched', 'perfect', 'all'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {t(`filter.${f}`)}
              <span className="count">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <label className="search">
            <Icon.Search />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder')} spellCheck={false} />
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="sort">
            {(Object.keys(sorters) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="empty">
          {q ? t('library.empty.search', { q }) : filter === 'progress' ? t('library.empty.progress') : t('library.empty')}
        </p>
      ) : (
        <div className="grid">
          {list.map((g) => (
            <GameCard key={g.appid} game={g} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

const GameCard = memo(function GameCard({ game, onOpen }: { game: LibraryGame; onOpen: (appid: number) => void }) {
  const t = useT();
  const s = game.summary;
  const p = pct(game);
  const perfect = !!s && s.total > 0 && s.achieved === s.total;
  return (
    <button className={`card ${perfect ? 'perfect' : ''}`} onClick={() => onOpen(game.appid)}>
      <div className="card-art">
        <SteamArt appid={game.appid} file="header.jpg" alt={game.name} />
        {perfect && <span className="badge-perfect">100%</span>}
      </div>
      <div className="card-body">
        <h3 title={game.name}>{game.name}</h3>
        {!game.hasStats || (s && s.total === 0) ? (
          <p className="card-meta dim">{t('library.noAch')}</p>
        ) : !s ? (
          <div className="card-meta">
            <span className="skeleton" style={{ width: 56 }} />
          </div>
        ) : (
          <>
            <p className="card-meta">
              <span className="mono">
                {s.achieved}
                <span className="dim"> / {s.total}</span>
              </span>
              <span className="mono dim">{Math.floor(p)}%</span>
            </p>
            <div className="bar">
              <i style={{ width: `${p}%` }} />
            </div>
          </>
        )}
      </div>
    </button>
  );
});
