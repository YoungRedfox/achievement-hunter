import { useEffect, useState } from 'react';
import type { UpdateCheck } from '../../shared/types';
import { useT } from '../i18n';
import { api } from '../lib';
import { Icon, Mark, Spinner } from './ui';
import { WhatsNew } from './WhatsNew';

const REPO = 'https://github.com/YoungRedfox/achievement-hunter';
const doc = (file: string) => `${REPO}/blob/main/${file}`;

/** Ustawienia → O aplikacji: wersja, sprawdzanie aktualizacji i wszystkie linki prawne w jednym miejscu. */
export function About() {
  const t = useT();
  const [version, setVersion] = useState('');
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    api.appVersion().then(setVersion);
  }, []);

  async function runCheck() {
    setChecking(true);
    setCheck(await api.checkForUpdates());
    setChecking(false);
  }

  const links: [string, string][] = [
    [t('about.source'), REPO],
    [t('about.releases'), 'https://github.com/YoungRedfox/achievement-hunter-releases/releases'],
    [t('about.issues'), `${REPO}/issues`],
    [t('about.privacy'), doc('PRIVACY.md')],
    [t('about.terms'), doc('TERMS.md')],
    [t('about.license'), doc('LICENSE')],
    [t('about.thirdParty'), doc('THIRD_PARTY_NOTICES.md')],
    [t('about.steamTerms'), 'https://steamcommunity.com/dev/apiterms'],
  ];

  return (
    <section className="setting about">
      <div className="setting-label">
        <h2>{t('about.title')}</h2>
      </div>
      <div className="setting-body">
        <div className="about-card">
          <Mark size={34} />
          <div>
            <p className="strong">{t('app.name')}</p>
            <p className="mono dim">{t('about.version', { v: version })}</p>
          </div>
          <button className="ghost" onClick={() => setShowNotes(true)}>
            {t('about.whatsNew')}
          </button>
          <button className="ghost" onClick={runCheck} disabled={checking}>
            {checking ? <Spinner /> : <Icon.Refresh />} {t('about.check')}
          </button>
        </div>
        {check && !checking && (
          <p className={`save-note ${check.result === 'error' ? 'err' : ''}`}>
            {check.result === 'latest'
              ? t('about.latest')
              : check.result === 'available'
                ? t('about.available', { v: check.latest })
                : t('about.checkError')}
          </p>
        )}

        <ul className="about-links">
          {links.map(([label, url]) => (
            <li key={url}>
              <button className="link" onClick={() => api.openExternal(url)}>
                {label} <Icon.External />
              </button>
            </li>
          ))}
        </ul>

        <p className="about-notice">{t('about.notice')}</p>
        {showNotes && version && <WhatsNew from={null} current={version} onClose={() => setShowNotes(false)} />}
      </div>
    </section>
  );
}
