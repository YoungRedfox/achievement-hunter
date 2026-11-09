# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

Only official Windows installers of Achievement Hunter published at
https://github.com/YoungRedfox/achievement-hunter-releases/releases.

## How releases are built

- Every release is built from a tagged commit of this repository by GitHub Actions (`.github/workflows/build.yml`) on GitHub-hosted runners.
- No binaries are built or signed on personal machines.
- The release script (`scripts/release.mjs`) publishes exactly the artifacts produced by that workflow run.

## Team roles

| Role | Member |
|---|---|
| Author, committer, reviewer | [YoungRedfox](https://github.com/YoungRedfox) |
| Release approver | [YoungRedfox](https://github.com/YoungRedfox) |

All team members use multi-factor authentication for GitHub and SignPath.

## Privacy

The app does not transfer personal data to any system unless the user asks for it.
Details: see the *Privacy* section in [README.md](README.md). In short:

- Steam profile data, keys and cached data stay on the user's computer, encrypted.
- The project server relays public Steam Web API requests (public SteamID) and generates guides from game/achievement IDs. It keeps no logs and no user data.
- With their own keys, users can bypass the project server entirely.
