import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AiProvider } from '../shared/guide-core';
import type { AchSummary, GameDetail, Guide, Lang, OwnedGame, Profile } from '../shared/types';
import { AppError } from './errors';

export interface StoreData {
  version: 1;
  lang: Lang;
  aiProvider: AiProvider;
  /** pusty = domyślny model dostawcy */
  aiModel: string;
  profile: Profile | null;
  games: { fetchedAt: number; list: OwnedGame[] } | null;
  summaries: Record<string, AchSummary>;
  /** pełne listy osiągnięć otwieranych gier — kolejne otwarcie nie pobiera ich od nowa */
  details: Record<string, GameDetail>;
  guides: Record<string, Guide>;
}

type SecretName = 'steamKey' | 'aiKey';

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

// Zapis przez plik tymczasowy — przerwany zapis nie zniszczy danych
function writeAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function writeJson(file: string, data: unknown) {
  writeAtomic(file, JSON.stringify(data));
}

// Cały zapis aplikacji szyfrowany przez Windows (DPAPI): odczytasz go tylko na tym koncie Windows
function readEncrypted<T>(file: string): T | null {
  try {
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(file))) as T;
  } catch {
    return null;
  }
}

export class Store {
  data: StoreData;
  private file: string;
  private secretsFile: string;
  private secrets: Partial<Record<SecretName, string>>;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir = app.getPath('userData')) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'data.bin');
    const legacy = path.join(dir, 'data.json');
    this.secretsFile = path.join(dir, 'secrets.json');
    const defaults: StoreData = {
      version: 1,
      lang: app.getLocale().toLowerCase().startsWith('pl') ? 'pl' : 'en',
      aiProvider: 'gemini',
      aiModel: '',
      profile: null,
      games: null,
      summaries: {},
      details: {},
      guides: {},
    };
    // Starszy, nieszyfrowany plik przenosimy do zaszyfrowanego i usuwamy
    const saved = readEncrypted<Partial<StoreData>>(this.file) ?? readJson<Partial<StoreData>>(legacy) ?? {};
    this.data = { ...defaults, ...saved };
    if (fs.existsSync(legacy)) {
      this.flush();
      fs.rmSync(legacy, { force: true });
    }
    this.secrets = readJson(this.secretsFile) ?? {};
  }

  save() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!safeStorage.isEncryptionAvailable()) return; // bez szyfrowania nie zapisujemy nic na dysk
    writeAtomic(this.file, safeStorage.encryptString(JSON.stringify(this.data)));
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
    this.data.details = {};
    this.data.guides = {};
    this.flush();
  }

  resetAccount() {
    this.data.profile = null;
    this.setSecret('steamKey', null);
    this.clearCache();
  }
}
