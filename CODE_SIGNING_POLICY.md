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
| Committers and reviewers | [YoungRedfox](https://github.com/YoungRedfox) (the only maintainer; outside contributions are reviewed before merging) |
| Approvers | [YoungRedfox](https://github.com/YoungRedfox) (approves every signing request manually) |

All team members use multi-factor authentication for GitHub and SignPath.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. The requests it does make (Steam data, guides, update checks) are listed in the [Privacy policy](PRIVACY.md).

### Summary

The app does not transfer personal data to any system unless the user asks for it.
Details: see the *Privacy* section in [README.md](README.md). In short:

- Steam profile data, keys and cached data stay on the user's computer, encrypted.
- The project server relays public Steam Web API requests (public SteamID) and generates guides from game/achievement IDs. It keeps no logs and no user data.
- With their own keys, users can bypass the project server entirely.
