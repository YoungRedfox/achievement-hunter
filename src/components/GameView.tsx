import { useEffect, useMemo, useState } from 'react';
import type { Achievement, ErrorCode, GameDetail, LibraryGame } from '../../shared/types';
import { errorKey, useLang, useT } from '../i18n';
import { api, fmtDate, hours, rarity } from '../lib';
import { Guide } from './Guide';
import { Icon, Ring, SteamArt } from './ui';

export function GameView({ appid, game, onBack, onSettings }: { appid: number; game?: LibraryGame; onBack: () => void; onSettings: () => void }) {
  const t = useT();
  const lang = useLang();
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [tab, setTab] = useState<'missing' | 'done'>('missing');
  const [open, setOpen] = useState<string | null>(null);

  async function load(refresh: boolean) {
    setError(null);
    setRefreshing(refresh);
    const r = await api.getGame(appid, refresh);
    setRefreshing(false);
    if (r.ok) setDetail(r.data);
    else if (refresh && detail) setDetail({ ...detail, stale: r.code });
    else setError(r.code);
  }

  useEffect(() => {
    setDetail(null);
    setOpen(null);
    void load(false);
  }, [appid]);

  const { missing, done } = useMemo(() => {
    const list = detail?.achievements ?? [];
    return {
      // Najpierw te, które ma najwięcej graczy — zwykle najłatwiejsze
      missing: list.filter((a) => !a.achieved).sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1)),
      done: list.filter((a) => a.achieved).sort((a, b) => b.unlockTime - a.unlockTime),
    };
  }, [detail]);

  const name = detail?.name ?? game?.name ?? '';
  const total = detail?.achievements.length ?? game?.summary?.total ?? 0;
  const achieved = detail ? done.length : (game?.summary?.achieved ?? 0);
  const p = total ? (achieved / total) * 100 : 0;
  const list = tab === 'missing' ? missing : done;

  return (
    <div className="page game">
      <div className="hero">
        <SteamArt appid={appid} file="library_hero.jpg" alt="" className="hero-art" />
        <div className="hero-shade" />
        <div className="hero-content">
          <button className="ghost back" onClick={onBack}>
            <Icon.Back /> {t('game.back')}
          </button>
          <div className="hero-row">
            <div>
              <h1 className="display hero-title">{name}</h1>
              <p className="hero-meta">
                {game && game.playtimeMinutes > 0 && <span>{t('game.playtime', { h: hours(game.playtimeMinutes) })}</span>}
                {total > 0 && <span>{t('game.left', { n: total - achieved })}</span>}
                <button className="link" onClick={() => api.openExternal(`https://store.steampowered.com/app/${appid}`)}>
                  {t('game.store')} ↗
                </button>
              </p>
            </div>
            {total > 0 && (
              <div className="hero-score">
                <Ring value={p} size={92} stroke={5}>
                  <strong className="mono">{Math.floor(p)}%</strong>
                </Ring>
                <p className="mono">
                  {achieved} <span className="dim">{t('game.of')}</span> {total}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="game-body">
        {error ? (
          <div className="notice">
            <p>{t(errorKey(error))}</p>
            <button className="ghost" onClick={() => load(true)}>
              {t('common.retry')}
            </button>
          </div>
        ) : !detail ? (
          <div className="rows">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="row skeleton-row" />
            ))}
          </div>
        ) : total === 0 ? (
          <p className="empty">{t('game.noAch')}</p>
        ) : (
          <>
            <div className="toolbar">
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'missing'} className={tab === 'missing' ? 'on' : ''} onClick={() => setTab('missing')}>
                  {t('game.tab.missing')}
                  <span className="count">{missing.length}</span>
                </button>
                <button role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>
                  {t('game.tab.done')}
                  <span className="count">{done.length}</span>
                </button>
              </div>
              <div className="toolbar-right">
                {tab === 'missing' && <span className="dim small-caps">{t('game.sort.hint')}</span>}
                <span className="saved-at">{t('game.saved', { d: fmtDate(detail.fetchedAt, lang) })}</span>
                <button className={`icon-btn ${refreshing ? 'spin' : ''}`} title={t('library.refresh')} onClick={() => load(true)} disabled={refreshing}>
                  <Icon.Refresh />
                </button>
              </div>
            </div>

            {detail.stale && (
              <p className="stale">
                {t(errorKey(detail.stale))} {t('stale.saved', { d: fmtDate(detail.fetchedAt, lang) })}
              </p>
            )}

            {list.length === 0 ? (
              <p className="empty">{tab === 'missing' ? t('game.allDone') : t('game.noneDone')}</p>
            ) : (
              <ol className="rows">
                {list.map((a) => (
                  <AchievementRow
                    key={a.apiname}
                    a={a}
                    open={open === a.apiname}
                    onToggle={() => setOpen(open === a.apiname ? null : a.apiname)}
                    appid={appid}
                    gameName={name}
                    onSettings={onSettings}
                  />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AchievementRow({
  a,
  open,
  onToggle,
  appid,
  gameName,
  onSettings,
}: {
  a: Achievement;
  open: boolean;
  onToggle: () => void;
  appid: number;
  gameName: string;
  onSettings: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [revealed, setRevealed] = useState(false);
  const r = rarity(a.percent);
  const icon = a.achieved ? a.icon : a.iconGray;
  const concealed = a.hidden && !a.achieved && !revealed;

  return (
    <li className={`row ${open ? 'open' : ''} ${a.achieved ? 'got' : ''}`}>
      <div className="row-main">
        <div className="ach-icon">{icon ? <img src={icon} alt="" loading="lazy" /> : a.achieved ? <Icon.Check /> : <Icon.Lock />}</div>
        <div className="ach-text">
          <h3>{a.name}</h3>
          {concealed ? (
            <p className="hidden-desc">
              <span className="blur">{a.description || '— — — — — — — —'}</span>
              <button className="link" onClick={() => setRevealed(true)}>
                <Icon.Eye /> {t('game.reveal')}
              </button>
            </p>
          ) : (
            <p>{a.description || t('game.hidden')}</p>
          )}
        </div>
        <div className="ach-side">
          {a.percent !== null && (
            <div className={`rarity r-${r}`}>
              <span className="mono">{a.percent < 10 ? a.percent.toFixed(1) : Math.round(a.percent)}%</span>
              <span className="rarity-label">{t(`rarity.${r!}`)}</span>
            </div>
          )}
          {a.achieved ? (
            <span className="unlocked mono dim">
              {t('game.unlocked', { d: new Date(a.unlockTime * 1000).toLocaleDateString(lang === 'pl' ? 'pl-PL' : 'en-GB') })}
            </span>
          ) : (
            <button className={`howto ${open ? 'on' : ''}`} onClick={onToggle} aria-expanded={open}>
              {t('game.howTo')} <Icon.Chevron />
            </button>
          )}
        </div>
      </div>
      {open && (
        <Guide appid={appid} gameName={gameName} achievement={a} onSettings={onSettings} />
      )}
    </li>
  );
}

