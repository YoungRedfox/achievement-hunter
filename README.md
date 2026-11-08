# Achievement Hunter

Aplikacja na Windows: pokazuje, których osiągnięć Steam jeszcze nie masz, i podpowiada krok po kroku, jak je zdobyć.

- **Bez logowania do Steam.** Wklejasz link do profilu + własny, darmowy klucz Steam Web API.
- Klucze szyfrowane przez Windows (DPAPI, `safeStorage`), nie opuszczają komputera poza zapytaniami do Steam/OpenAI.
- Poradniki: OpenAI (Responses API + wyszukiwanie w sieci), zawsze z linkami do poradników Steam, YouTube i Google.
- Interfejs PL / EN.

## Wymagania użytkownika

1. Profil Steam publiczny, „Szczegóły gry” publiczne.
2. Klucz: https://steamcommunity.com/dev/apikey (domena: `localhost`).
3. Opcjonalnie klucz OpenAI do poradników w aplikacji.

## Praca nad kodem

```bash
npm install
npm run dev     # aplikacja z prawdziwym Steam
npm run demo    # przykładowe dane, bez klucza
npm test
npm run dist    # instalator: release/AchievementHunter-Setup-<wersja>.exe
```

Zrzut ekranu ekranu w trybie demo (po `npm run build`):

```bash
AH_DEMO=1 AH_DEMO_CONNECTED=1 AH_SHOT=shots/library.png node_modules/electron/dist/electron.exe .
```

## Budowa

| Katalog | Co |
|---|---|
| `electron/` | proces główny: Steam API (`steam.ts`), magazyn i szyfrowanie (`store.ts`), poradniki AI (`guide.ts`), tryb demo |
| `src/` | interfejs React |
| `shared/types.ts` | typy wspólne i kontrakt IPC |

## Przed publikacją

- Podpis kodu (certyfikat Authenticode) — bez niego Windows SmartScreen ostrzega przy instalacji.
- Automatyczne aktualizacje (electron-updater + GitHub Releases).
