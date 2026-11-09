import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/types';
import { useT } from '../i18n';
import { api } from '../lib';
import { Spinner } from './ui';

/** Karta „Nowa wersja” w pasku bocznym: jeden przycisk pobiera i instaluje. */
export function UpdateBar() {
  const t = useT();
  const [s, setS] = useState<UpdateStatus>({ state: 'idle' });

  useEffect(() => {
    api.getUpdateStatus().then(setS);
    return api.onUpdateStatus(setS);
  }, []);

  if (s.state === 'idle') return null;

  return (
    <div className={`update ${s.state}`} role="status" aria-live="polite">
      <div className="update-head">
        <span className="update-dot" aria-hidden />
        <span className="update-title">{t('update.title')}</span>
        {s.version && <span className="mono dim">v{s.version}</span>}
      </div>

      {s.state === 'available' && (
        <>
          <p className="update-text">{t('update.text')}</p>
          <button className="update-btn" onClick={() => api.downloadUpdate()}>
            {t('update.button')}
          </button>
        </>
      )}

      {s.state === 'downloading' && (
        <>
          <p className="update-text">
            {t('update.downloading')} <span className="mono">{s.percent ?? 0}%</span>
          </p>
          <div className="bar thin">
            <i style={{ width: `${s.percent ?? 0}%` }} />
          </div>
        </>
      )}

      {s.state === 'installing' && (
        <p className="update-text">
          <Spinner /> {t('update.installing')}
        </p>
      )}

      {s.state === 'error' && (
        <>
          <p className="update-text err">{t('update.error')}</p>
          <button className="update-btn" onClick={() => api.downloadUpdate()}>
            {t('common.retry')}
          </button>
        </>
      )}
    </div>
  );
}
