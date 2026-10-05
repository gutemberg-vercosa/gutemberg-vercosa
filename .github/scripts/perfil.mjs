// Gera as imagens dinâmicas do perfil a partir dos repositórios públicos:
// a barra de linguagens (assets/languages.svg) e um card por projeto (assets/projetos/<repo>.svg).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const USER = process.env.GH_USER ?? 'gutemberg-vercosa';
const MAX_LANGS = 8;

const COLORS = {
  'C#': '#178600', Python: '#14b8a6', JavaScript: '#f1e05a', TypeScript: '#3178c6',
  HTML: '#e34c26', CSS: '#663399', SCSS: '#c6538c', Java: '#b07219', Go: '#00ADD8',
  PHP: '#4F5D95', Ruby: '#701516', Shell: '#89e051', PowerShell: '#012456',
  PLpgSQL: '#336790', TSQL: '#e38c00', SQL: '#e38c00', Kotlin: '#A97BFF', Dart: '#00B4AB',
  Vue: '#41b883', Svelte: '#ff3e00', 'Jupyter Notebook': '#DA5B0B', Dockerfile: '#384d54',
};
const FALLBACK_COLOR = '#8b949e';
const FONT = "-apple-system,Segoe UI,Helvetica,Arial,sans-serif";

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': USER };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

function fail(message) {
  console.log(`::error title=Falha ao gerar imagens do perfil::${message}`);
  process.exit(1);
}

async function api(path) {
  let res;
  try {
    res = await fetch(`https://api.github.com${path}`, { headers });
  } catch (err) {
    fail(`Não foi possível chamar a API do GitHub (${err.cause?.message ?? err.message}).`);
  }
  if (!res.ok) fail(`${res.status} ${res.statusText} em ${path}.`);
  return res.json();
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const repos = (await api(`/users/${USER}/repos?type=owner&per_page=100`))
  .filter((r) => !r.fork && r.name.toLowerCase() !== USER.toLowerCase());
console.log(`::notice title=Perfil::Repositórios públicos: ${repos.map((r) => r.name).join(', ') || 'nenhum'}`);

// --- Linguagens ---------------------------------------------------------------

function languagesSvg(totals) {
  const WIDTH = 520;
  const style = `<style>.t{font:600 14px ${FONT};fill:#24292f}@media (prefers-color-scheme: dark){.t{fill:#e6edf3}}</style>`;
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  if (sum === 0) {
    return `<svg width="${WIDTH}" height="30" viewBox="0 0 ${WIDTH} 30" xmlns="http://www.w3.org/2000/svg">${style}<text class="t" x="${WIDTH / 2}" y="20" text-anchor="middle">Nenhum projeto ainda</text></svg>\n`;
  }

  let entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (entries.length > MAX_LANGS) {
    const rest = entries.slice(MAX_LANGS - 1).reduce((a, [, b]) => a + b, 0);
    entries = [...entries.slice(0, MAX_LANGS - 1), ['Outras', rest]];
  }

  const COLS = 3;
  const colW = WIDTH / COLS;
  const height = 44 + (Math.ceil(entries.length / COLS) - 1) * 24 + 10;
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
  return `<svg width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">${style}<clipPath id="r"><rect width="${WIDTH}" height="10" rx="5"/></clipPath><g clip-path="url(#r)" transform="translate(0,8)">${bar}</g>${legend}</svg>\n`;
}

const totals = {};
for (const repo of repos) {
  repo.languages = await api(`/repos/${repo.full_name}/languages`); // usado também nos cards
  for (const [lang, bytes] of Object.entries(repo.languages)) {
    totals[lang] = (totals[lang] ?? 0) + bytes;
  }
}
writeFileSync('assets/languages.svg', languagesSvg(totals));

// --- Cards dos projetos ----------------------------------------------------------
// Tamanho fixo para todos os cards ficarem iguais lado a lado, com as cores do tema tokyonight
// usado nos cards de estatísticas.

const CARD = { width: 400, height: 150, lineChars: 52, maxLines: 3 };

/** Quebra a descrição em linhas de até `lineChars` caracteres; o excedente vira reticências. */
function wrap(text) {
  const lines = [''];
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1;
    if (!lines[last]) lines[last] = word;
    else if (`${lines[last]} ${word}`.length <= CARD.lineChars) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  if (lines.length > CARD.maxLines) {
    lines.length = CARD.maxLines;
    lines[CARD.maxLines - 1] = `${lines[CARD.maxLines - 1].replace(/[\s,.;:]*\S*$/, '')}…`;
  }
  return lines;
}

function cardSvg(repo) {
  const description = wrap(repo.description ?? 'Sem descrição.')
    .map((line, i) => `<text class="d" x="25" y="${64 + i * 19}">${escape(line)}</text>`).join('');
  // As três linguagens com mais código no repositório, com a porcentagem de cada uma.
  const sum = Object.values(repo.languages).reduce((a, b) => a + b, 0);
  // Um único texto com trechos encadeados: o navegador posiciona cada linguagem logo após a anterior,
  // e o dx dá o mesmo espaço entre todas, qualquer que seja o tamanho do nome.
  const languages = `<text class="m" x="25" y="136">${Object.entries(repo.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang, bytes], i) => `<tspan class="p" dx="${i ? 16 : 0}" fill="${COLORS[lang] ?? FALLBACK_COLOR}">●</tspan>`
      + `<tspan dx="6">${escape(lang)} ${Math.round((bytes / sum) * 100)}%</tspan>`)
    .join('')}</text>`;
  const stars = `<g transform="translate(345,122)"><path class="i" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/><text class="m" x="22" y="14">${repo.stargazers_count}</text></g>`;

  return `<svg width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}" xmlns="http://www.w3.org/2000/svg">`
    + `<style>.n{font:600 18px ${FONT};fill:#70a5fd}.d{font:400 13px ${FONT};fill:#38bdae}.m{font:400 12px ${FONT};fill:#38bdae}.i{fill:#bf91f3}.p{font-size:20px}</style>`
    + `<rect width="${CARD.width}" height="${CARD.height}" rx="4.5" fill="#1a1b27"/>`
    + `<g transform="translate(25,22)"><path class="i" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></g>`
    + `<text class="n" x="50" y="38">${escape(repo.name)}</text>`
    + description + languages + stars
    + `</svg>\n`;
}

rmSync('assets/projetos', { recursive: true, force: true });
mkdirSync('assets/projetos', { recursive: true });
for (const repo of repos) writeFileSync(`assets/projetos/${repo.name}.svg`, cardSvg(repo));

console.log(`${repos.length} repositório(s), ${Object.keys(totals).length} linguagem(ns).`);
