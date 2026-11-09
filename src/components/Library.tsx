import { memo, useMemo, useState } from 'react';
import type { Library as LibraryData, LibraryGame, Platform } from '../../shared/types';
import { errorKey, useLang, useT } from '../i18n';
import { fmtDate, pct } from '../lib';
import { Icon, PlatformBadge, SteamArt } from './ui';

export type Filter = 'progress' | 'untouched' | 'perfect' | 'all';
type Sort = 'closest' | 'remaining' | 'recent' | 'playtime' | 'name';
type PlatformFilter = 'any' | Platform;

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

// Ta sama gra na Steam i Xbox ma różne zapisy nazwy (™, ®, dwukropki) — porównujemy uproszczoną formę
const normName = (n: string) =>
  n
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/\b(pc|windows|edition|game of the year|goty)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');

export function Library({
  lib,
  onOpen,
  onRefresh,
  onConnectXbox,
  xboxConnected,
  filter,
  setFilter,
}: {
  lib: LibraryData;
  onOpen: (game: LibraryGame) => void;
  onRefresh: () => void;
  onConnectXbox: () => void;
  xboxConnected: boolean;
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [platform, setPlatform] = useState<PlatformFilter>('any');
  const [sort, setSort] = useState<Sort>('recent');
  const [q, setQ] = useState('');

  // Na jakich platformach jest każda gra (po nazwie) — karta pokazuje wszystkie
  const platformsByName = useMemo(() => {
    const m = new Map<string, Set<Platform>>();
    for (const g of lib.games) {
      const k = normName(g.name);
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(g.platform);
    }
    return m;
  }, [lib.games]);

  const platformCounts = useMemo(
    () => ({
      any: lib.games.length,
      steam: lib.games.filter((g) => g.platform === 'steam').length,
      xbox: lib.games.filter((g) => g.platform === 'xbox').length,
    }),
    [lib.games],
  );

  const games = useMemo(() => (platform === 'any' ? lib.games : lib.games.filter((g) => g.platform === platform)), [lib.games, platform]);

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

      {lib.stale && (
        <p className="stale">
          {t(errorKey(lib.stale))} {t('stale.saved', { d: fmtDate(lib.fetchedAt, lang) })}
        </p>
      )}

      <div className="platforms" role="tablist" aria-label={t('platform.label')}>
        {(['any', 'steam', 'xbox'] as const).map((p) =>
          p === 'xbox' && !xboxConnected ? (
            <button key={p} className="platform-tab add" onClick={onConnectXbox}>
              <PlatformBadge platform="xbox" /> {t('xbox.connect')}
            </button>
          ) : (
            <button
              key={p}
              role="tab"
              aria-selected={platform === p}
              className={`platform-tab ${platform === p ? 'on' : ''} ${p}`}
              onClick={() => setPlatform(p)}
            >
              {p === 'any' ? t('platform.all') : <PlatformBadge platform={p} />}
              <span className="count">{platformCounts[p]}</span>
            </button>
          ),
        )}
      </div>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {(['all', 'progress', 'untouched', 'perfect'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
              {t(`filter.${f}`)}
              <span className="count">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <span className="saved-at">{t('library.saved', { d: fmtDate(lib.fetchedAt, lang) })}</span>
          <button className="icon-btn" title={t('library.refresh')} onClick={onRefresh}>
            <Icon.Refresh />
          </button>
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
            <GameCard key={g.key} game={g} onOpen={onOpen} platforms={platformsByName.get(normName(g.name))} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Okładka Xbox jest kwadratowa — na kartę 460×215 kładziemy ją na rozmytym tle z niej samej. */
function XboxArt({ image, alt }: { image?: string; alt: string }) {
  if (!image)
    return (
      <div className="art-fallback">
        <span>{alt}</span>
      </div>
    );
  return (
    <div className="xbox-art">
      <img className="xbox-art-bg" src={image} alt="" loading="lazy" draggable={false} />
      <img className="xbox-art-fg" src={image} alt={alt} loading="lazy" draggable={false} />
    </div>
  );
}

const GameCard = memo(function GameCard({
  game,
  onOpen,
  platforms,
}: {
  game: LibraryGame;
  onOpen: (g: LibraryGame) => void;
  platforms?: Set<Platform>;
}) {
  const t = useT();
  const s = game.summary;
  const p = pct(game);
  const perfect = !!s && s.total > 0 && s.achieved === s.total;
  // Pierwsza plakietka = platforma tej karty, potem pozostałe, na których ta gra też jest
  const badges = [game.platform, ...[...(platforms ?? [])].filter((x) => x !== game.platform)];
  return (
    <button className={`card ${perfect ? 'perfect' : ''}`} onClick={() => onOpen(game)}>
      <div className="card-art">
        {game.platform === 'xbox' ? <XboxArt image={game.image} alt={game.name} /> : <SteamArt appid={game.appid} file="header.jpg" alt={game.name} />}
        <div className="card-platforms" title={badges.length > 1 ? t('platform.alsoOn') : undefined}>
          {badges.map((b, i) => (
            <PlatformBadge key={b} platform={b} dim={i > 0} />
          ))}
        </div>
        {perfect && <span className="badge-perfect">100%</span>}
      </div>
      <div className="card-body">
        <h3 title={game.name}>{game.name}</h3>
        {!game.hasStats || (s && s.total === 0) ? (
          <p className="card-meta dim">{t('library.noAch')}</p>
        ) : !s ? (
          <p className="card-meta dim">{t('library.unchecked')}</p>
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
