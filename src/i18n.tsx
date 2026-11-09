import { createContext, useContext } from 'react';
import { DEFAULT_LANG, type Lang } from '../shared/langs';
import type { ErrorCode } from '../shared/types';
import { de } from './locales/de';
import { en, type Dict, type Key } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { pl } from './locales/pl';
import { ptBR } from './locales/pt-BR';
import { ru } from './locales/ru';
import { zhCN } from './locales/zh-CN';

const dicts: Record<Lang, Dict> = { en, pl, de, fr, es, 'pt-BR': ptBR, ru, 'zh-CN': zhCN, ja, ko };

export type T = (key: Key, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): T {
  const dict = dicts[lang] ?? en;
  return (key, vars) => {
    // Brak tłumaczenia = angielski, nigdy surowy klucz
    let s = dict[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

export const LangContext = createContext<{ lang: Lang; t: T }>({ lang: DEFAULT_LANG, t: makeT(DEFAULT_LANG) });
export const useT = () => useContext(LangContext).t;
export const useLang = () => useContext(LangContext).lang;
export const errorKey = (code: ErrorCode) => `error.${code}` as Key;
