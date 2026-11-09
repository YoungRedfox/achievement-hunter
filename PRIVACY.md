# Privacy Policy

_Last updated: 9 November 2026_

Achievement Hunter ("the app") is a free, open-source Windows app by YoungRedfox. This policy explains what data the app and its server handle. Short version: your data stays on your PC, and our server doesn't keep anything about you.

## Who is responsible

YoungRedfox, developer of Achievement Hunter.
Contact: [open an issue on GitHub](https://github.com/YoungRedfox/achievement-hunter/issues) (mark it "privacy" if you'd rather we reply without discussing details in public).

## Data stored on your computer

The app saves, **only on your PC** and encrypted with Windows (DPAPI):

- the Steam profile you connected (SteamID, name, avatar link);
- your game list, achievement progress and generated guides (cache);
- optional keys you entered yourself (Steam Web API key, AI key) and your settings.

You can delete all of it at any time: *Settings → Disconnect profile* or *Clear cache*, or uninstall the app.

The app also reads Steam's local files (`libraryfolders.vdf`, `appmanifest_*.acf`) to show which games are installed. This information is never sent anywhere.

## Data sent over the internet

| Where | What is sent | Why |
|---|---|---|
| Achievement Hunter server (Cloudflare Workers) | your **public SteamID** and game IDs | to read your public Steam data with our Steam Web API key |
| Achievement Hunter server | game ID, achievement ID, language | to create a guide |
| Steam / Valve (`api.steampowered.com`, Steam CDN) | game and achievement IDs, image requests | achievement names, icons, game artwork |
| Google (Gemini API), via our server | game name and achievement name and description | to write the guide text |
| GitHub | a request for the latest version file | update checks |

Every request also exposes your IP address to the service that receives it, as with any internet connection.

**Our server does not store personal data.** It keeps no request logs and no accounts. It briefly uses your IP address in memory to enforce per-minute rate limits, then forgets it. Finished guides are stored for up to 120 days keyed only by game, achievement and language, with no link to any player.

**With your own keys** (Settings), requests go directly to Steam and/or the AI provider you chose (Google or OpenAI), and our server is not involved. Their own privacy policies then apply.

## Third parties

- Cloudflare, Inc. hosts the server: <https://www.cloudflare.com/privacypolicy/>
- Valve Corporation (Steam): <https://store.steampowered.com/privacy_agreement/>
- Google (Gemini API): <https://policies.google.com/privacy>
- OpenAI (only if you add your own OpenAI key): <https://openai.com/policies/privacy-policy>
- GitHub, Inc. (downloads and updates): <https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement>

## Legal basis and your rights (EU/EEA)

We process the little data described above to provide the service you asked for (Art. 6(1)(b) GDPR) and to keep the service secure and available (Art. 6(1)(f) GDPR). Because we don't store personal data on the server, there is usually nothing for us to access, correct or delete, but you can still contact us with any request. You can also complain to your data protection authority (in Poland: the President of the Personal Data Protection Office, UODO).

## Children

The app is meant for Steam users. Steam requires users to be at least 13 years old (or older where local law requires).

## Changes

We'll update this page when the app's data handling changes. The date at the top shows the latest version; the full history is in the [repository](https://github.com/YoungRedfox/achievement-hunter/commits/main/PRIVACY.md).
