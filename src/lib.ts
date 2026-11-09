import { langInfo, type Lang } from '../shared/langs';
import type { Api, LibraryGame } from '../shared/types';

declare global {
  interface Window {
    api: Api;
  }
}

export const api = window.api;

// Nowsze gry mają grafiki tylko pod nową ścieżką CDN — próbujemy obu
const CDN = ['https://shared.akamai.steamstatic.com/store_item_assets/steam/apps', 'https://cdn.akamai.steamstatic.com/steam/apps'];
export const artUrls = (appid: number, file: 'header.jpg' | 'library_hero.jpg' | 'library_600x900.jpg') =>
  CDN.map((base) => `${base}/${appid}/${file}`);

export const pct = (g: Pick<LibraryGame, 'summary'>) =>
  g.summary && g.summary.total > 0 ? (g.summary.achieved / g.summary.total) * 100 : 0;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export function rarity(percent: number | null): Rarity | null {
  if (percent === null) return null;
  if (percent >= 50) return 'common';
  if (percent >= 20) return 'uncommon';
  if (percent >= 8) return 'rare';
  if (percent >= 2) return 'epic';
  return 'legendary';
}

export const hours = (min: number) => (min < 600 ? Math.round(min / 6) / 10 : Math.round(min / 60));

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.round((min / 60) * 2) / 2;
  return `${h} h`;
}

export function searchLinks(gameName: string, achName: string, appid: number, xbox = false) {
  const q = encodeURIComponent(`${gameName} ${achName} achievement`);
  return {
    // Xbox: największa baza poradników do osiągnięć Xbox to TrueAchievements
    steam: xbox
      ? `https://www.trueachievements.com/searchresults.aspx?search=${encodeURIComponent(`${gameName} ${achName}`)}`
      : `https://steamcommunity.com/app/${appid}/guides/?searchText=${encodeURIComponent(achName)}&browsefilter=trend`,
    youtube: `https://www.youtube.com/results?search_query=${q}`,
    web: `https://www.google.com/search?q=${q}`,
  };
}

export function fmtDate(ts: number, lang: Lang) {
  const d = new Date(ts);
  const loc = langInfo(lang).locale;
  const today = new Date().toDateString() === d.toDateString();
  // Dzisiejsze dane pokazujemy samą godziną — tak szybciej widać, że są świeże
  return today
    ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
}
