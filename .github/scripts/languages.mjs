import { writeFileSync } from 'node:fs';

const USER = process.env.GH_USER ?? 'gutemberg-vercosa';
const OUTPUT = 'assets/languages.svg';
const MAX_LANGS = 8;

const COLORS = {
  'C#': '#178600', Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6',
  HTML: '#e34c26', CSS: '#663399', SCSS: '#c6538c', Java: '#b07219', Go: '#00ADD8',
  PHP: '#4F5D95', Ruby: '#701516', Shell: '#89e051', PowerShell: '#012456',
  PLpgSQL: '#336790', TSQL: '#e38c00', SQL: '#e38c00', Kotlin: '#A97BFF', Dart: '#00B4AB',
  Vue: '#41b883', Svelte: '#ff3e00', 'Jupyter Notebook': '#DA5B0B', Dockerfile: '#384d54',
};
const FALLBACK_COLOR = '#8b949e';

const PRIVATE_TOKEN = process.env.LANGS_TOKEN?.trim();
const token = PRIVATE_TOKEN || process.env.GITHUB_TOKEN;
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': USER };
if (token) headers.Authorization = `Bearer ${token}`;

const HINTS = {
  401: 'LANGS_TOKEN inválido ou expirado: gere o token de novo e atualize o secret.',
  403: 'Token sem permissão ou limite da API atingido: confira se o token tem acesso a "All repositories".',
  404: 'Repositório não encontrado para o token: confira se o token tem acesso a "All repositories".',
};

function fail(message) {
  console.log(`::error title=Falha ao calcular linguagens::${message}`);
  process.exit(1);
}

async function api(path) {
  let res;
  try {
    res = await fetch(`https://api.github.com${path}`, { headers });
  } catch (err) {
    fail(`Não foi possível chamar a API do GitHub (${err.cause?.message ?? err.message}).`);
  }
  if (!res.ok) fail(`${res.status} ${res.statusText} em ${path}. ${HINTS[res.status] ?? ''}`);
  return res.json();
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const reposPath = PRIVATE_TOKEN
  ? '/user/repos?affiliation=owner&visibility=all&per_page=100'
  : `/users/${USER}/repos?type=owner&per_page=100`;
const repos = (await api(reposPath))
  .filter((r) => !r.fork && r.name.toLowerCase() !== USER.toLowerCase());
const mode = PRIVATE_TOKEN ? 'públicos + privados (LANGS_TOKEN)' : 'somente públicos (LANGS_TOKEN não encontrado)';
console.log(`::notice title=Linguagens::Modo: ${mode}. Repositórios: ${repos.map((r) => r.name).join(', ') || 'nenhum'}`);

const totals = {};
for (const repo of repos) {
  const langs = await api(`/repos/${repo.full_name}/languages`);
  for (const [lang, bytes] of Object.entries(langs)) totals[lang] = (totals[lang] ?? 0) + bytes;
}

const sum = Object.values(totals).reduce((a, b) => a + b, 0);
let entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
if (entries.length > MAX_LANGS) {
  const rest = entries.slice(MAX_LANGS - 1).reduce((a, [, b]) => a + b, 0);
  entries = [...entries.slice(0, MAX_LANGS - 1), ['Outras', rest]];
}

const WIDTH = 520;
const style = '<style>.t{font:600 14px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;fill:#24292f}@media (prefers-color-scheme: dark){.t{fill:#e6edf3}}</style>';
let svg;

if (sum === 0) {
  svg = `<svg width="${WIDTH}" height="30" viewBox="0 0 ${WIDTH} 30" xmlns="http://www.w3.org/2000/svg">${style}<text class="t" x="${WIDTH / 2}" y="20" text-anchor="middle">Nenhum projeto ainda</text></svg>\n`;
} else {
  const COLS = 3;
  const colW = WIDTH / COLS;
  const rows = Math.ceil(entries.length / COLS);
  const height = 44 + (rows - 1) * 24 + 10;

  let x = 0;
  let bar = '';
  let legend = '';
  entries.forEach(([lang, bytes], i) => {
    const color = COLORS[lang] ?? FALLBACK_COLOR;
    const w = (bytes / sum) * WIDTH;
    bar += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="10" fill="${color}"/>`;
    x += w;
    const lx = (i % COLS) * colW;
    const ly = 44 + Math.floor(i / COLS) * 24;
    legend += `<circle cx="${lx + 6}" cy="${ly - 5}" r="5" fill="${color}"/><text class="t" x="${lx + 18}" y="${ly}">${escape(lang)} ${((bytes / sum) * 100).toFixed(1)}%</text>`;
  });

  svg = `<svg width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">${style}<clipPath id="r"><rect width="${WIDTH}" height="10" rx="5"/></clipPath><g clip-path="url(#r)" transform="translate(0,8)">${bar}</g>${legend}</svg>\n`;
}

writeFileSync(OUTPUT, svg);
console.log(`${repos.length} repositório(s), ${entries.length} linguagem(ns).`);
