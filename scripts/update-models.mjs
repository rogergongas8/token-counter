// Regenerates data/models.json, the static price pages (prices/*.html) and sitemap.xml
// from OpenRouter's public model list. Run with: node scripts/update-models.mjs
// No dependencies; needs Node 18+.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://token-counter-bice.vercel.app';
const SOURCE = 'https://openrouter.ai/api/v1/models';
const MIN_MODELS = 100; // safety: refuse to overwrite the site with a broken/partial response

const PROVIDER_NAMES = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', 'meta-llama': 'Meta Llama', meta: 'Meta',
  mistralai: 'Mistral', deepseek: 'DeepSeek', 'x-ai': 'xAI', qwen: 'Qwen', cohere: 'Cohere',
  nvidia: 'NVIDIA', 'z-ai': 'Z.ai', moonshotai: 'Moonshot AI', minimax: 'MiniMax', perplexity: 'Perplexity',
  amazon: 'Amazon', microsoft: 'Microsoft', tencent: 'Tencent', xiaomi: 'Xiaomi', liquid: 'Liquid',
  'bytedance-seed': 'ByteDance Seed', 'aion-labs': 'Aion Labs', openrouter: 'OpenRouter',
};
const providerName = (slug) => PROVIDER_NAMES[slug] || slug.replace(/(^|-)(\w)/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase());

const res = await fetch(SOURCE, { headers: { 'user-agent': 'token-counter-site-updater' } });
if (!res.ok) throw new Error('OpenRouter responded ' + res.status);
const { data } = await res.json();
if (!Array.isArray(data) || data.length < MIN_MODELS) throw new Error('Unexpected response: ' + (data && data.length));

const perMillion = (s) => {
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e6) / 1e6 : null;
};

const models = data
  .filter((m) => m.architecture && (m.architecture.output_modalities || []).includes('text'))
  // skip routing aliases ("~provider/...") and variants such as ":free" or ":batch" that duplicate a base model
  .filter((m) => !String(m.id).startsWith('~') && !String(m.id).includes(':'))
  .map((m) => ({
    id: m.id,
    name: String(m.name || m.id).replace(/^[^:]+:\s*/, ''),
    provider: m.id.split('/')[0],
    ctx: m.context_length || (m.top_provider && m.top_provider.context_length) || null,
    maxOut: (m.top_provider && m.top_provider.max_completion_tokens) || null,
    inP: perMillion(m.pricing && m.pricing.prompt),
    outP: perMillion(m.pricing && m.pricing.completion),
    cacheRead: perMillion(m.pricing && m.pricing.input_cache_read),
    img: (m.architecture.input_modalities || []).includes('image'),
    created: m.created || 0,
  }))
  .filter((m) => m.inP !== null && m.outP !== null && !(m.inP === 0 && m.outP === 0))
  .sort((a, b) => a.provider.localeCompare(b.provider) || b.created - a.created);

// If nothing changed since the last run, leave every file untouched (no commit, no redeploy).
try {
  const previous = JSON.parse(readFileSync(join(ROOT, 'data/models.json'), 'utf8'));
  if (JSON.stringify(previous.models) === JSON.stringify(models)) {
    console.log('No changes in models or prices (' + models.length + ' models checked).');
    process.exit(0);
  }
} catch { /* first run: no previous file */ }

const generatedAt = new Date().toISOString();
mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data/models.json'), JSON.stringify({ generatedAt, source: SOURCE, count: models.length, models }));

// ---------- static pages ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtP = (n) => '$' + parseFloat(n >= 1 ? n.toFixed(2) : n.toPrecision(3));
const fmtCtx = (n) => (!n ? '—' : n >= 1e6 ? parseFloat((n / 1e6).toFixed(1)) + 'M' : Math.round(n / 1000) + 'K');
const d = new Date(generatedAt);
const dateLabel = d.toISOString().slice(0, 10);
const monthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const byProvider = new Map();
for (const m of models) { if (!byProvider.has(m.provider)) byProvider.set(m.provider, []); byProvider.get(m.provider).push(m); }
const bigProviders = [...byProvider.entries()].filter(([, v]) => v.length >= 4).sort((a, b) => b[1].length - a[1].length);

function table(rows) {
  return '<div class="tablewrap"><table class="prices"><thead><tr><th>Model</th><th>Context</th><th>Input $/1M</th><th>Output $/1M</th><th>Cached input $/1M</th><th>Images in</th></tr></thead><tbody>' +
    rows.map((m) => '<tr><td>' + esc(m.name) + '<span class="mid">' + esc(m.id) + '</span></td><td>' + fmtCtx(m.ctx) + '</td><td>' + fmtP(m.inP) + '</td><td>' + fmtP(m.outP) + '</td><td>' + (m.cacheRead ? fmtP(m.cacheRead) : '—') + '</td><td>' + (m.img ? 'Yes' : '—') + '</td></tr>').join('') +
    '</tbody></table></div>';
}

function page({ path, title, h1, intro, body }) {
  const url = SITE + '/' + path;
  const depth = path.split('/').length - 1;
  const up = '../'.repeat(depth);
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + '</title>\n<meta name="description" content="' + esc(intro) + '">\n<meta name="color-scheme" content="light dark">\n' +
    '<link rel="canonical" href="' + url + '">\n<link rel="stylesheet" href="' + up + 'style.css">\n</head>\n<body>\n' +
    '<header class="wrap"><nav class="nav"><a href="' + up + '">Token counter</a> · <a href="' + up + 'prices/">All model prices</a></nav><h1>' + esc(h1) + '</h1><p class="lede">' + esc(intro) + '</p></header>\n<main class="wrap">\n' + body + '\n</main>\n' +
    '<footer class="wrap muted small"><p>Data: model list and prices from <a href="https://openrouter.ai/models" rel="noopener">OpenRouter</a>, refreshed automatically (last update ' + dateLabel + '). These are the prices OpenRouter lists, which can differ from a provider\'s own price list, and they exclude caching tiers, discounts and regional uplifts. Check the provider before budgeting. Independent site, not affiliated with any provider.</p></footer>\n</body>\n</html>\n';
}

const note = '<p class="muted small">Prices are USD per 1 million tokens. Updated ' + dateLabel + '. Want a number for your own prompt? Use the <a href="__UP__">token counter and cost calculator</a>.</p>';
const providerLinks = '<p class="chips">' + bigProviders.map(([slug, v]) => '<a href="' + slug + '.html">' + esc(providerName(slug)) + ' (' + v.length + ')</a>').join(' ') + '</p>';

mkdirSync(join(ROOT, 'prices'), { recursive: true });

// index: all models, cheapest-to-priciest per provider is not useful; keep grouped by provider
const indexBody = providerLinks + note.replace('__UP__', '../') +
  '<input id="filter" class="filter" type="search" placeholder="Filter models, e.g. gpt, claude, llama…" aria-label="Filter models">' +
  bigProviders.map(([slug, v]) => '<section class="card prov" data-provider="' + esc(slug) + '"><h2>' + esc(providerName(slug)) + ' models <a class="small" href="' + slug + '.html">page</a></h2>' + table(v) + '</section>').join('\n') +
  '<script>const f=document.getElementById("filter");f.addEventListener("input",()=>{const q=f.value.trim().toLowerCase();document.querySelectorAll(".prices tbody tr").forEach(r=>{r.style.display=!q||r.textContent.toLowerCase().includes(q)?"":"none"});document.querySelectorAll(".prov").forEach(s=>{s.style.display=[...s.querySelectorAll("tbody tr")].some(r=>r.style.display!=="none")?"":"none"})});</script>';
writeFileSync(join(ROOT, 'prices/index.html'), page({
  path: 'prices/index.html',
  title: 'AI Model API Pricing Comparison: Cost per 1M Tokens (' + monthLabel + ')',
  h1: 'AI model API pricing comparison',
  intro: 'Input and output price per 1 million tokens, context window and image support for ' + models.length + ' language models from ' + byProvider.size + ' providers. Updated ' + dateLabel + '.',
  body: indexBody,
}));

for (const [slug, v] of bigProviders) {
  const name = providerName(slug);
  const cheapest = [...v].sort((a, b) => a.inP + a.outP - (b.inP + b.outP))[0];
  const body = providerLinks + note.replace('__UP__', '../') +
    '<section class="card"><h2>' + esc(name) + ' API pricing per 1M tokens</h2>' + table(v) + '</section>' +
    '<section class="card"><h2>Quick facts</h2><ul><li>' + v.length + ' ' + esc(name) + ' models listed.</li><li>Lowest combined input+output price: <strong>' + esc(cheapest.name) + '</strong> at ' + fmtP(cheapest.inP) + ' input and ' + fmtP(cheapest.outP) + ' output per 1M tokens.</li><li>Prices change often; this page is regenerated automatically every day.</li></ul></section>';
  writeFileSync(join(ROOT, 'prices/' + slug + '.html'), page({
    path: 'prices/' + slug + '.html',
    title: name + ' API Pricing: Cost per 1M Tokens for All Models (' + monthLabel + ')',
    h1: name + ' API pricing',
    intro: 'Input and output price per 1 million tokens for ' + v.length + ' ' + name + ' models, with context window sizes. Updated ' + dateLabel + '.',
    body,
  }));
}

// sitemap
const urls = ['', 'prices/', ...bigProviders.map(([s]) => 'prices/' + s + '.html')];
writeFileSync(join(ROOT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => '  <url><loc>' + SITE + '/' + u + '</loc><lastmod>' + dateLabel + '</lastmod></url>').join('\n') + '\n</urlset>\n');

console.log('models:', models.length, '| providers:', byProvider.size, '| pages:', bigProviders.length + 1, '| updated:', dateLabel);
