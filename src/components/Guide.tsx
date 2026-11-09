import { useEffect, useState } from 'react';
import type { Achievement, ErrorCode, Guide as GuideData } from '../../shared/types';
import { errorKey, useT } from '../i18n';
import { api, formatMinutes, searchLinks } from '../lib';
import { Icon } from './ui';

export function Guide({
  appid,
  xboxTitleId,
  gameName,
  achievement,
  onSettings,
}: {
  appid: number;
  xboxTitleId?: string;
  gameName: string;
  achievement: Achievement;
  onSettings: () => void;
}) {
  const t = useT();
  const [guide, setGuide] = useState<GuideData | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [loading, setLoading] = useState(true);
  const links = searchLinks(gameName, achievement.name, appid, !!xboxTitleId);

  async function load(refresh: boolean) {
    setLoading(true);
    setError(null);
    const r = xboxTitleId
      ? await api.getXboxGuide(xboxTitleId, achievement.apiname, refresh)
      : await api.getGuide(appid, achievement.apiname, refresh);
    setLoading(false);
    if (r.ok) setGuide(r.data);
    else setError(r.code);
  }

  useEffect(() => {
    void load(false);
  }, [appid, achievement.apiname]);

  const linkRow = (
    <div className="guide-links">
      <span className="small-caps dim">{t('guide.more')}</span>
      <button className="chip" onClick={() => api.openExternal(links.steam)}>
        {xboxTitleId ? 'TrueAchievements' : t('guide.steamGuides')} <Icon.External />
      </button>
      <button className="chip" onClick={() => api.openExternal(links.youtube)}>
        {t('guide.youtube')} <Icon.External />
      </button>
      <button className="chip" onClick={() => api.openExternal(links.web)}>
        {t('guide.web')} <Icon.External />
      </button>
    </div>
  );

  return (
    <div className="guide">
      {loading ? (
        <div className="guide-loading">
          <span className="scanline" />
          <p>{t('guide.loading')}</p>
        </div>
      ) : error === 'NO_AI_KEY' ? (
        <div className="guide-nokey">
          <div>
            <p className="strong">{t('guide.noKey.title')}</p>
            <p className="dim">{t('guide.noKey.body')}</p>
          </div>
          <button className="ghost" onClick={onSettings}>
            {t('guide.noKey.cta')}
          </button>
        </div>
      ) : error === 'AI_LIMIT' ? (
        // Darmowy limit na dziś — można poczekać do jutra albo dodać własny klucz
        <div className="guide-nokey">
          <div>
            <p className="strong">{t('error.AI_LIMIT')}</p>
            <p className="dim">{t('guide.limit.body')}</p>
          </div>
          <button className="ghost" onClick={onSettings}>
            {t('guide.noKey.cta')}
          </button>
        </div>
      ) : error ? (
        <div className="guide-nokey">
          <p>{t(errorKey(error))}</p>
          <button className="ghost" onClick={() => load(true)}>
            {t('common.retry')}
          </button>
        </div>
      ) : guide ? (
        <>
          <div className="guide-head">
            <p className="guide-summary">{guide.summary}</p>
            <div className="tags">
              <span className={`tag d-${guide.difficulty}`}>{t(`difficulty.${guide.difficulty}`)}</span>
              {guide.estimatedMinutes !== null && <span className="tag">{t('guide.time', { t: formatMinutes(guide.estimatedMinutes) })}</span>}
              {guide.missable && (
                <span className="tag warn">
                  <Icon.Warn /> {t('guide.missable')}
                </span>
              )}
              <span className={`tag c-${guide.confidence}`}>{t(`confidence.${guide.confidence}`)}</span>
            </div>
          </div>

          <div className="guide-cols">
            <section>
              <h4 className="small-caps">{t('guide.steps')}</h4>
              <ol className="steps">
                {guide.steps.map((s, i) => (
                  <li key={i}>
                    <span className="step-n mono">{String(i + 1).padStart(2, '0')}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </section>
            {(guide.tips.length > 0 || guide.sources.length > 0) && (
              <aside>
                {guide.tips.length > 0 && (
                  <>
                    <h4 className="small-caps">{t('guide.tips')}</h4>
                    <ul className="tips">
                      {guide.tips.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                {guide.sources.length > 0 && (
                  <>
                    <h4 className="small-caps">{t('guide.sources')}</h4>
                    <ul className="sources">
                      {guide.sources.slice(0, 5).map((s, i) => (
                        <li key={i}>
                          <button className="link" onClick={() => api.openExternal(s.url)} title={s.url}>
                            {s.title || new URL(s.url).hostname}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </aside>
            )}
          </div>
          <p className="guide-foot">
            <span>{t('guide.ai')}</span>
            <button className="link" onClick={() => load(true)}>
              <Icon.Refresh /> {t('guide.regenerate')}
            </button>
          </p>
        </>
      ) : null}
      {!loading && linkRow}
    </div>
  );
}
