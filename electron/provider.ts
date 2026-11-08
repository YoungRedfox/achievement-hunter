import type { GameDetail, Lang, OwnedGame, Profile } from '../shared/types';

// Wspólny interfejs dla prawdziwego Steam i trybu demo
export interface Provider {
  resolveProfile(input: string, key: string): Promise<Profile>;
  ownedGames(steamid: string, key: string): Promise<OwnedGame[]>;
  achievementSummary(appid: number, steamid: string, key: string): Promise<{ total: number; achieved: number }>;
  gameDetail(appid: number, name: string, steamid: string, key: string, lang: Lang): Promise<GameDetail>;
}
