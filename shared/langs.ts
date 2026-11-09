// 10 najpopularniejszych języków na Steam (ankieta sprzętowa Steam) — kolejność = kolejność na liście wyboru.
// steam: kod języka w Steam Web API; locale: formatowanie dat; ai: nazwa języka dla modelu.

export const LANGS = [
  { code: 'en', name: 'English', steam: 'english', locale: 'en-GB', ai: 'English' },
  { code: 'zh-CN', name: '简体中文', steam: 'schinese', locale: 'zh-CN', ai: 'Simplified Chinese' },
  { code: 'ru', name: 'Русский', steam: 'russian', locale: 'ru-RU', ai: 'Russian' },
  { code: 'es', name: 'Español', steam: 'spanish', locale: 'es-ES', ai: 'Spanish' },
  { code: 'pt-BR', name: 'Português (Brasil)', steam: 'brazilian', locale: 'pt-BR', ai: 'Brazilian Portuguese' },
  { code: 'de', name: 'Deutsch', steam: 'german', locale: 'de-DE', ai: 'German' },
  { code: 'fr', name: 'Français', steam: 'french', locale: 'fr-FR', ai: 'French' },
  { code: 'ja', name: '日本語', steam: 'japanese', locale: 'ja-JP', ai: 'Japanese' },
  { code: 'ko', name: '한국어', steam: 'koreana', locale: 'ko-KR', ai: 'Korean' },
  { code: 'pl', name: 'Polski', steam: 'polish', locale: 'pl-PL', ai: 'Polish' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];
export const DEFAULT_LANG: Lang = 'en';

export const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);
export const langInfo = (code: Lang) => LANGS.find((l) => l.code === code) ?? LANGS[0];
