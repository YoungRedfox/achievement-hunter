import type { Achievement, Guide, Lang } from '../shared/types';
import { AppError } from './errors';
import type { Provider } from './provider';

// AH_DEMO_LIMIT=1 udaje wyczerpany dzienny limit — do sprawdzenia komunikatu
const limit = () => {
  if (process.env.AH_DEMO_LIMIT === '1') throw new AppError('DAILY_LIMIT');
};

// Tryb demo (AH_DEMO=1): przykładowe dane do oglądania interfejsu bez klucza Steam
const GAMES: [number, string, number, number][] = [
  // appid, nazwa, minuty gry, liczba osiągnięć
  [1145360, 'Hades', 5230, 49],
  [367520, 'Hollow Knight', 3880, 63],
  [413150, 'Stardew Valley', 9120, 40],
  [620, 'Portal 2', 1210, 51],
  [504230, 'Celeste', 1960, 32],
  [646570, 'Slay the Spire', 7400, 46],
  [1086940, "Baldur's Gate 3", 11200, 54],
  [292030, 'The Witcher 3: Wild Hunt', 6400, 78],
  [588650, 'Dead Cells', 2100, 122],
  [105600, 'Terraria', 4300, 115],
  [1794680, 'Vampire Survivors', 2650, 204],
  [250900, 'The Binding of Isaac: Rebirth', 0, 276],
  [774361, 'Blasphemous', 0, 42],
  [391540, 'Undertale', 610, 0],
];

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const NAMES_PL = ['Pierwsza krew', 'Bez zadraśnięcia', 'Kolekcjoner', 'Nocny marek', 'Ostatni oddech', 'Mistrz ostrzy', 'Cicha stopa', 'Złota rączka', 'Nieugięty', 'Kartograf', 'Szybki jak wiatr', 'Pogromca', 'Na krawędzi', 'Skarbnik', 'Wieczny tułacz'];
const DESC_PL = ['Pokonaj bossa bez otrzymania obrażeń.', 'Zbierz wszystkie fragmenty mapy.', 'Ukończ rozdział w mniej niż 20 minut.', 'Odblokuj każdą broń.', 'Wygraj na najwyższym poziomie trudności.', 'Znajdź ukryte pomieszczenie w pierwszej krainie.'];

function achievementsFor(appid: number, count: number, playtime: number): Achievement[] {
  const r = rand(appid);
  const ratio = playtime === 0 ? 0 : appid === 504230 ? 1 : 0.25 + r() * 0.7;
  return Array.from({ length: count }, (_, i) => {
    const percent = Math.round((90 * Math.pow(r(), 1.8) + 0.3) * 10) / 10;
    const achieved = r() < ratio * (0.4 + percent / 100);
    return {
      apiname: `ACH_${i}`,
      name: `${NAMES_PL[i % NAMES_PL.length]}${i >= NAMES_PL.length ? ` ${Math.floor(i / NAMES_PL.length) + 1}` : ''}`,
      description: DESC_PL[i % DESC_PL.length],
      hidden: i % 11 === 7,
      icon: '',
      iconGray: '',
      achieved: ratio === 1 ? true : achieved,
      unlockTime: achieved ? 1_700_000_000 + i * 86_400 : 0,
      percent,
    };
  });
}

export const demoProvider: Provider = {
  async resolveProfile() {
    return { steamid: '76561190000000000', name: 'Lis', avatar: '', profileUrl: 'https://steamcommunity.com/' };
  },
  async ownedGames() {
    limit();
    return GAMES.map(([appid, name, playtimeMinutes, count], i) => ({
      appid,
      name,
      playtimeMinutes,
      lastPlayed: playtimeMinutes ? 1_730_000_000 - i * 400_000 : 0,
      hasStats: count > 0,
    }));
  },
  async achievementSummary(appid) {
    limit();
    await new Promise((r) => setTimeout(r, 120));
    const g = GAMES.find((x) => x[0] === appid)!;
    const list = achievementsFor(appid, g[3], g[2]);
    return { total: list.length, achieved: list.filter((a) => a.achieved).length };
  },
  async gameDetail(appid, name, _steamid, _key, lang) {
    limit();
    await new Promise((r) => setTimeout(r, 300));
    const g = GAMES.find((x) => x[0] === appid)!;
    return { appid, name, achievements: achievementsFor(appid, g[3], g[2]), fetchedAt: Date.now(), lang };
  },
};

export function demoGuide(lang: Lang): Guide {
  const pl = lang === 'pl';
  return {
    summary: pl
      ? 'Najprościej zdobyć je w drugiej krainie, zanim odblokujesz szybką podróż. Trzeba mieć ulepszony unik.'
      : 'Easiest in the second area, before fast travel unlocks. You need the upgraded dash.',
    steps: pl
      ? ['Wróć do Zapomnianego Rozdroża przez zachodnią bramę.', 'Kup ulepszenie uniku u kowala (800 geo).', 'Wejdź na arenę i walcz tylko na lewej platformie — boss nie sięga tam atakiem z góry.', 'Unikaj w stronę bossa przy szarży, nie od niego.', 'Po walce nie wychodź z menu — osiągnięcie pojawia się po napisie.']
      : ['Return to the Crossroads via the west gate.', 'Buy the dash upgrade from the smith (800 geo).', 'Fight only on the left platform.', 'Dash towards the boss on charge.', 'Wait for the banner after the fight.'],
    tips: pl ? ['Na niskim poziomie trudności też się liczy.', 'Zapisz grę przed areną — porażka nie kasuje postępu.'] : ['Counts on any difficulty.', 'Save before the arena.'],
    missable: false,
    difficulty: 'medium',
    estimatedMinutes: 40,
    confidence: 'medium',
    sources: [{ title: 'Steam Community Guide', url: 'https://steamcommunity.com/' }],
    generatedAt: Date.now(),
    model: 'demo',
  };
}
