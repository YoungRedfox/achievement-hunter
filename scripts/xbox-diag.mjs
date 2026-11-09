// Diagnostyka OpenXBL: pokazuje STRUKTURĘ odpowiedzi (nazwy pól, typy), bez klucza i bez danych osobowych.
// Użycie: node scripts/xbox-diag.mjs   (klucz wpisujesz niewidocznie)
import readline from 'node:readline';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) process.stdout.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

// Zamienia wartości na ich typ, żeby nic prywatnego nie trafiło na ekran
function shape(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? [`array(${v.length})`, shape(v[0], depth + 1)] : 'array(0)';
  if (v && typeof v === 'object') {
    if (depth > 5) return 'object';
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, depth + 1)]));
  }
  return typeof v;
}

const key = await askHidden('Wklej klucz OpenXBL (nie bedzie widoczny) i Enter: ');
const get = async (path) => {
  // Xbox odrzuca domyślne "Accept-Language: *" z Node — trzeba podać konkretny język
  const res = await fetch(`https://xbl.io/api/v2${path}`, {
    headers: { 'X-Authorization': key, Accept: 'application/json', 'Accept-Language': 'en-US' },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  console.log(`\n=== GET ${path} -> HTTP ${res.status}, code=${body?.code}`);
  let content = body?.content ?? body;
  // "content" bywa tekstem z JSON-em w środku — próbujemy go rozpakować
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
      console.log('(content byl tekstem z JSON-em)');
    } catch {
      console.log(`content (tekst): ${content.slice(0, 300)}`);
      return null;
    }
  }
  // Przy błędzie (code >= 400) treść to komunikat API, nie dane gracza — pokazujemy ją
  if (body?.code >= 400) {
    console.log('komunikat bledu:', JSON.stringify(content).slice(0, 500));
    return null;
  }
  console.log(JSON.stringify(shape(content), null, 1).slice(0, 3000));
  return content;
};

const acc = await get('/account');
const user = acc?.profileUsers?.[0];
if (user) console.log('settings ids:', (user.settings ?? []).map((s) => s.id).join(', '));

let titles = (await get('/achievements'))?.titles;
if (!titles) titles = (await get('/player/titleHistory'))?.titles;
if (!titles && user?.id) titles = (await get(`/achievements/player/${user.id}`))?.titles;
if (!titles && user?.id) titles = (await get(`/player/titleHistory/${user.id}`))?.titles;
const sample = (titles ?? []).find((t) => (t.achievement?.totalAchievements ?? 0) > 0 && !(t.devices ?? []).includes('Xbox360'));
if (user?.id && sample) {
  console.log(`\nprzykladowa gra: type=${sample.type} devices=${(sample.devices ?? []).join('/')} zdobyte=${sample.achievement?.currentAchievements}/${sample.achievement?.totalAchievements}`);
  // Trzy warianty adresu z dokumentacji OpenXBL — sprawdzamy, który zwraca listę osiągnięć
  for (const path of [
    `/achievements/player/${user.id}/title/${sample.titleId}`,
    `/achievements/player/${user.id}/${sample.titleId}`,
    `/achievements/title/${sample.titleId}`,
  ]) {
    const r = await get(path);
    if (r?.achievements) console.log(`>>> ${path.replace(user.id, 'XUID')}: osiagniec=${r.achievements.length}, totalRecords=${r.pagingInfo?.totalRecords}`);
  }
} else {
  console.log('\nbrak przykladowej gry z osiagnieciami');
}
console.log('\nGotowe. Skopiuj powyzszy wynik (nie zawiera klucza).');
