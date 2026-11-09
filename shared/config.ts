// Adres serwera pośredniczącego (server/) po wdrożeniu na Cloudflare.
// Pusty = brak serwera: aplikacja poprosi użytkownika o własny klucz Steam.
// W dev można nadpisać zmienną AH_PROXY_URL.
export const DEFAULT_PROXY_URL = 'https://achievement-hunter-api.achievementhunter.workers.dev';
