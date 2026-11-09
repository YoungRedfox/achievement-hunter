import type { GameDetail, Lang, OwnedGame, Profile } from '../shared/types';

/** Własny klucz użytkownika albo null = przez nasz serwer pośredniczący. */
export type SteamKey = string | null;

// Wspólny interfejs dla prawdziwego Steam i trybu demo
export interface Provider {
  resolveProfile(input: string, key: SteamKey): Promise<Profile>;
  ownedGames(steamid: string, key: SteamKey): Promise<OwnedGame[]>;
  /** Postęp wielu gier jednym zapytaniem (do 100 naraz). */
  progress(appids: number[], steamid: string, key: SteamKey): Promise<{ appid: number; total: number; achieved: number }[]>;
  gameDetail(appid: number, name: string, steamid: string, key: SteamKey, lang: Lang): Promise<GameDetail>;
}
