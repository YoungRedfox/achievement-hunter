import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AchSummary, Guide, Lang, OwnedGame, Profile } from '../shared/types';
import { AppError } from './errors';

export interface StoreData {
  version: 1;
  lang: Lang;
  openAiModel: string;
  profile: Profile | null;
  games: { fetchedAt: number; list: OwnedGame[] } | null;
  summaries: Record<string, AchSummary>;
  guides: Record<string, Guide>;
}

type SecretName = 'steamKey' | 'openAiKey';

export const DEFAULT_MODEL = 'gpt-5-mini';

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

// Zapis przez plik tymczasowy — przerwany zapis nie zniszczy danych
function writeJson(file: string, data: unknown) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export class Store {
  data: StoreData;
  private file: string;
  private secretsFile: string;
  private secrets: Partial<Record<SecretName, string>>;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir = app.getPath('userData')) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'data.json');
    this.secretsFile = path.join(dir, 'secrets.json');
    const defaults: StoreData = {
      version: 1,
      lang: app.getLocale().toLowerCase().startsWith('pl') ? 'pl' : 'en',
      openAiModel: DEFAULT_MODEL,
      profile: null,
      games: null,
      summaries: {},
      guides: {},
    };
    this.data = { ...defaults, ...(readJson<Partial<StoreData>>(this.file) ?? {}) };
    this.secrets = readJson(this.secretsFile) ?? {};
  }

  save() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    writeJson(this.file, this.data);
  }

  // Klucze szyfrowane przez Windows DPAPI — plik skopiowany na inny komputer jest bezużyteczny
  getSecret(name: SecretName): string | null {
    const v = this.secrets[name];
    if (!v) return null;
    try {
      return safeStorage.decryptString(Buffer.from(v, 'base64'));
    } catch {
      return null;
    }
  }

  setSecret(name: SecretName, value: string | null) {
    if (!value) {
      delete this.secrets[name];
    } else {
      if (!safeStorage.isEncryptionAvailable()) throw new AppError('UNKNOWN', 'Szyfrowanie systemowe niedostępne');
      this.secrets[name] = safeStorage.encryptString(value).toString('base64');
    }
    writeJson(this.secretsFile, this.secrets);
  }

  clearCache() {
    this.data.games = null;
    this.data.summaries = {};
    this.data.guides = {};
    this.flush();
  }

  resetAccount() {
    this.data.profile = null;
    this.setSecret('steamKey', null);
    this.clearCache();
  }
}
