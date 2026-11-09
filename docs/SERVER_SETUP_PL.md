# Uruchomienie Achievement Hunter — krok po kroku

## 1. Klucz Steam Web API (5 min)
1. Wejdź na https://steamcommunity.com/dev/apikey i zaloguj się na swoje konto Steam.
2. Domena: wpisz `achievement-hunter` (może być dowolna), zaznacz zgodę, kliknij **Zarejestruj**.
3. Skopiuj 32-znakowy klucz. Nikomu go nie wysyłaj.
   - Wymóg Steam: konto z wydanymi min. 5 USD i bez ograniczeń.

## 2. Konto Cloudflare (3 min, za darmo)
1. Załóż konto: https://dash.cloudflare.com/sign-up
2. Potwierdź e-mail.

## 3. Wdrożenie serwera (5 min)
W terminalu, w folderze `D:\Kod\achievement-hunter\server`:

```
npx wrangler login
```
Otworzy się przeglądarka — kliknij **Allow**.

```
npx wrangler secret put STEAM_KEY
```
Wklej klucz Steam z kroku 1 i Enter. (Jeśli zapyta o utworzenie workera — `y`.)

```
npx wrangler deploy
```
Na końcu wypisze adres, np. `https://achievement-hunter-api.TWOJA-NAZWA.workers.dev`.
Przy pierwszym wdrożeniu może poprosić o wybór nazwy subdomeny workers.dev — wpisz dowolną.

## 4. Sprawdzenie
Otwórz w przeglądarce `<adres>/health` — ma pokazać `{"ok":true}`.

## 5. Adres do aplikacji
Wpisz adres z kroku 3 w `shared/config.ts`:
```ts
export const DEFAULT_PROXY_URL = 'https://achievement-hunter-api.TWOJA-NAZWA.workers.dev';
```
i zbuduj instalator:
```
npm run dist
```
Gotowy plik: `release\AchievementHunter-Setup-<wersja>.exe`.

## Później (opcjonalnie)
- Własna domena w Cloudflare (np. api.twojadomena.pl) — włącza pamięć podręczną serwera i oszczędza dzienny limit.
- Panel zużycia: https://dash.cloudflare.com → Workers & Pages → achievement-hunter-api → Metrics.
