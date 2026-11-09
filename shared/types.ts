// Typy wspólne dla procesu głównego, preloadu i interfejsu

export type { Lang } from './langs';
import type { Lang } from './langs';

export interface Profile {
  steamid: string;
  name: string;
  avatar: string;
  profileUrl: string;
}

export interface OwnedGame {
  appid: number;
  name: string;
  playtimeMinutes: number;
  /** unix, sekundy; 0 = nigdy */
  lastPlayed: number;
  hasStats: boolean;
}

export interface AchSummary {
  total: number;
  achieved: number;
  fetchedAt: number;
}

export type Platform = 'steam' | 'xbox';

export interface LibraryGame extends OwnedGame {
  summary?: AchSummary;
  platform: Platform;
  /** unikalny klucz w bibliotece: "steam:620", "xbox:1777860928" */
  key: string;
  /** Xbox: identyfikator tytułu i okładka z Xbox Live */
  titleId?: string;
  image?: string;
  /** Xbox 360 — szczegóły osiągnięć jeszcze nieobsługiwane */
  legacy?: boolean;
}

export interface XboxAccount {
  gamertag: string;
  avatar: string;
}

export interface Achievement {
  apiname: string;
  name: string;
  description: string;
  hidden: boolean;
  icon: string;
  iconGray: string;
  achieved: boolean;
  unlockTime: number;
  /** procent graczy, którzy je mają; null gdy Steam nie podał */
  percent: number | null;
}

export interface GameDetail {
  appid: number;
  name: string;
  achievements: Achievement[];
  fetchedAt: number;
  lang: Lang;
  /** ustawione, gdy pokazujemy zapisane dane, bo świeżych nie dało się pobrać */
  stale?: ErrorCode;
}

export interface Library {
  games: LibraryGame[];
  fetchedAt: number;
  stale?: ErrorCode;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'very_hard';
export type Confidence = 'high' | 'medium' | 'low';

export interface GuideSource {
  title: string;
  url: string;
}

export interface Guide {
  summary: string;
  steps: string[];
  tips: string[];
  missable: boolean;
  difficulty: Difficulty;
  estimatedMinutes: number | null;
  confidence: Confidence;
  sources: GuideSource[];
  generatedAt: number;
  model: string;
}

export interface Settings {
  lang: Lang;
  hasSteamKey: boolean;
  /** własny klucz AI gracza (trzymany tylko lokalnie) */
  hasAiKey: boolean;
  aiProvider: 'gemini' | 'openai';
  aiModel: string;
  profile: Profile | null;
  demo: boolean;
  /** czy działa nasz serwer z kluczem — wtedy użytkownik wkleja tylko link */
  proxyAvailable: boolean;
  xbox: XboxAccount | null;
}

export interface SettingsPatch {
  lang?: Lang;
  steamKey?: string | null;
  aiKey?: string | null;
  aiProvider?: 'gemini' | 'openai';
  aiModel?: string;
}

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_KEY'
  | 'PROFILE_NOT_FOUND'
  | 'PRIVATE_PROFILE'
  | 'PRIVATE_GAMES'
  | 'NO_STATS'
  | 'RATE_LIMIT'
  | 'DAILY_LIMIT'
  | 'SERVICE_DOWN'
  | 'NETWORK'
  | 'NOT_CONNECTED'
  | 'NO_AI_KEY'
  | 'AI_INVALID_KEY'
  | 'AI_LIMIT'
  | 'AI_BUSY'
  | 'AI_ERROR'
  | 'XBOX_INVALID_KEY'
  | 'XBOX_LIMIT'
  | 'XBOX_ERROR'
  | 'XBOX_NOT_CONNECTED'
  | 'XBOX_LEGACY'
  | 'UNKNOWN';

export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message?: string };

export interface ScanProgress {
  done: number;
  total: number;
  running: boolean;
  error?: ErrorCode;
}

export interface UpdateStatus {
  state: 'idle' | 'available' | 'downloading' | 'installing' | 'error';
  version?: string;
  percent?: number;
}

export interface UpdateCheck {
  result: 'latest' | 'available' | 'error';
  current: string;
  latest: string;
}

export interface WhatsNew {
  /** pokazać okno po starcie */
  show: boolean;
  /** wersja sprzed aktualizacji (null = nieznana) */
  from: string | null;
  current: string;
}

export interface Api {
  getSettings(): Promise<Result<Settings>>;
  updateSettings(patch: SettingsPatch): Promise<Result<Settings>>;
  connect(profileInput: string, steamKey?: string): Promise<Result<Profile>>;
  disconnect(): Promise<Result<null>>;
  getLibrary(refresh: boolean): Promise<Result<Library>>;
  startScan(force: boolean): Promise<Result<null>>;
  getGame(appid: number, refresh: boolean): Promise<Result<GameDetail>>;
  getGuide(appid: number, apiname: string, refresh: boolean): Promise<Result<Guide>>;
  clearCache(): Promise<Result<null>>;
  openExternal(url: string): Promise<void>;
  onScanProgress(cb: (p: ScanProgress) => void): () => void;
  onSummary(cb: (appid: number, s: AchSummary) => void): () => void;
  getUpdateStatus(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<void>;
  checkForUpdates(): Promise<UpdateCheck>;
  whatsNew(): Promise<WhatsNew>;
  whatsNewSeen(): Promise<void>;
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void;
  appVersion(): Promise<string>;
  installedGames(): Promise<{ appid: number; name: string }[]>;
  connectXbox(key: string): Promise<Result<XboxAccount>>;
  disconnectXbox(): Promise<Result<null>>;
  getXboxGame(titleId: string, refresh: boolean): Promise<Result<GameDetail>>;
  getXboxGuide(titleId: string, achId: string, refresh: boolean): Promise<Result<Guide>>;
}
