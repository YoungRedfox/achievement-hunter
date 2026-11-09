// Wydanie nowej wersji:  node scripts/release.mjs 0.2.0
// 1) podbija wersję i tworzy tag  2) GitHub Actions buduje instalator
// 3) pobiera gotowe pliki  4) publikuje je w publicznym repo — aplikacje graczy zobaczą aktualizację
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CODE_REPO = 'YoungRedfox/achievement-hunter';
const RELEASE_REPO = 'YoungRedfox/achievement-hunter-releases';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Użycie: node scripts/release.mjs <wersja>, np. 0.2.0');
  process.exit(1);
}
const tag = `v${version}`;
const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

if (out('git status --porcelain')) {
  console.error('Najpierw zacommituj zmiany.');
  process.exit(1);
}

console.log(`→ Wersja ${version}`);
sh(`npm version ${version} -m "Wydanie %s" --no-git-tag-version`);
sh('git add package.json package-lock.json');
sh(`git commit -m "Wydanie ${version}"`);
sh(`git tag ${tag}`);
sh(`git push origin main ${tag}`);

console.log('→ Czekam, aż GitHub Actions zacznie budować…');
let runId = '';
for (let i = 0; i < 30 && !runId; i++) {
  execSync('node -e "setTimeout(()=>{},5000)"');
  runId = out(`gh run list --repo ${CODE_REPO} --workflow build.yml --branch ${tag} --limit 1 --json databaseId --jq ".[0].databaseId"`);
}
if (!runId) throw new Error('Nie znalazłem uruchomienia budowy');

sh(`gh run watch ${runId} --repo ${CODE_REPO} --exit-status`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-release-'));
sh(`gh run download ${runId} --repo ${CODE_REPO} --name installer --dir "${dir}"`);
const files = fs.readdirSync(dir).map((f) => `"${path.join(dir, f)}"`).join(' ');

// Notatki: docs/release-notes/<wersja>.md jeśli istnieje, inaczej krótki angielski tekst
const notesSrc = path.join('docs', 'release-notes', `${version}.md`);
const notes = path.join(dir, 'NOTES.md');
fs.writeFileSync(
  notes,
  fs.existsSync(notesSrc)
    ? fs.readFileSync(notesSrc, 'utf8').trimEnd() + '

Already installed? Click **Download and update** in the sidebar.
'
    : 'A fresh update is here. If you already have Achievement Hunter, just click **Download and update** in the app.',
);
fs.renameSync(notes, path.join(os.tmpdir(), `ah-notes-${version}.md`));

console.log('→ Publikuję wydanie…');
sh(`gh release create ${tag} ${files} --repo ${RELEASE_REPO} --title "Achievement Hunter ${version}" --notes-file "${path.join(os.tmpdir(), `ah-notes-${version}.md`)}"`);
console.log(`✓ Gotowe: https://github.com/${RELEASE_REPO}/releases/tag/${tag}`);
