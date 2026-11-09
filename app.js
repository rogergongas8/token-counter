// Token Counter: everything runs in the browser. No text is sent anywhere.

// Core models with prices copied from each provider's own pricing page on 2026-11-09 (USD per 1M tokens, standard tier).
// Sources: https://platform.claude.com/docs/en/about-claude/pricing
//          https://developers.openai.com/api/docs/pricing
const MODELS = [
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', inP: 10, outP: 50 },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', inP: 4, outP: 20 },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', inP: 2, outP: 10 },
  {
    id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', inP: 0.1, outP: 0.5,
    longThreshold: 100000, longInP: 0.5, longOutP: 2.5,
    note: 'Haiku 5.5 is priced higher for prompts over 100,000 tokens; that tier is applied automatically.'
  },
  { id: 'gpt-6-astra', name: 'OpenAI gpt-6-astra', inP: 10, outP: 50 },
  {
    id: 'gpt-6.1-sol', name: 'OpenAI gpt-6.1-sol', inP: 2, outP: 10,
    note: 'OpenAI lists promotional pricing for this model until 2026-11-30. Check the pricing page.'
  },
  { id: 'gpt-6.1-terra', name: 'OpenAI gpt-6.1-terra', inP: 1, outP: 5 },
  { id: 'gpt-6-luna', name: 'OpenAI gpt-6-luna', inP: 0.1, outP: 0.5 },
];
const CUSTOM = { id: 'custom', name: 'Custom prices', inP: 1, outP: 3 };

// Catalog of many more models, refreshed daily into data/models.json (see scripts/update-models.mjs).
let catalog = null; // { generatedAt, models: [...] }

const PROVIDER_NAMES = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', 'meta-llama': 'Meta Llama', meta: 'Meta',
  mistralai: 'Mistral', deepseek: 'DeepSeek', 'x-ai': 'xAI', qwen: 'Qwen', cohere: 'Cohere',
  nvidia: 'NVIDIA', 'z-ai': 'Z.ai', moonshotai: 'Moonshot AI', minimax: 'MiniMax', perplexity: 'Perplexity',
  amazon: 'Amazon', microsoft: 'Microsoft', tencent: 'Tencent', xiaomi: 'Xiaomi',
};
const providerName = (s) => PROVIDER_NAMES[s] || s.replace(/(^|-)(\w)/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase());

const $ = (id) => document.getElementById(id);
const el = {
  text: $('text'), chars: $('chars'), words: $('words'),
  t200: $('t200'), t100: $('t100'), tclaude: $('tclaude'),
  status: $('status'), viz: $('viz'), vizNote: $('vizNote'),
  model: $('model'), inTok: $('inTok'), outTok: $('outTok'), reqs: $('reqs'),
  pIn: $('pIn'), pOut: $('pOut'), priceNote: $('priceNote'),
  costReq: $('costReq'), costMonth: $('costMonth'), costYear: $('costYear'),
  catNote: $('catNote'), q: $('q'), prov: $('prov'), minCtx: $('minCtx'), needImg: $('needImg'), sort: $('sort'),
  cmpBody: $('cmpBody'), cmpCount: $('cmpCount'), more: $('more'),
};

const fmtInt = (n) => Number(n).toLocaleString('en-US');
const fmtUsd = (n) => {
  if (!isFinite(n)) return '$0';
  if (n === 0) return '$0';
  if (n < 0.01) return '$' + n.toPrecision(2);
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtP = (n) => '$' + parseFloat(n >= 1 ? n.toFixed(2) : n.toPrecision(3));
const fmtCtx = (n) => (!n ? '—' : n >= 1e6 ? parseFloat((n / 1e6).toFixed(1)) + 'M' : Math.round(n / 1000) + 'K');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- tokenizer loading (lazy, so the page paints instantly) ----
let o200k = null, cl100k = null, loading = null;
function loadTokenizers() {
  if (loading) return loading;
  if (el.text.value) el.status.textContent = 'Loading tokenizers…';
  loading = Promise.all([import('./js/o200k.js'), import('./js/cl100k.js')])
    .then(([a, b]) => { o200k = a; cl100k = b; el.status.textContent = ''; })
    .catch(() => { el.status.textContent = 'Could not load the tokenizers. Check your connection and reload.'; loading = null; });
  return loading;
}

// ---- counting ----
let lastCount200 = 0;
function wordsIn(t) {
  const m = t.trim().match(/\S+/g);
  return m ? m.length : 0;
}
const VIZ_LIMIT = 6000;
function update() {
  const t = el.text.value;
  el.chars.textContent = fmtInt([...t].length);
  el.words.textContent = fmtInt(wordsIn(t));
  if (!o200k || !cl100k) {
    if (t.length) loadTokenizers().then(update);
    return;
  }
  if (!t) {
    el.t200.textContent = '0'; el.t100.textContent = '0'; el.tclaude.textContent = '0';
    el.viz.textContent = ''; el.vizNote.textContent = ''; lastCount200 = 0;
    return;
  }
  const c200 = o200k.count(t);
  const c100 = cl100k.count(t);
  lastCount200 = c200;
  el.t200.textContent = fmtInt(c200);
  el.t100.textContent = fmtInt(c100);
  // Claude's tokenizer is not public. Estimate from a public tokenizer; real count can differ.
  el.tclaude.textContent = '~' + fmtInt(c200);
  if (t.length <= VIZ_LIMIT) {
    el.viz.innerHTML = o200k.tokens(t).map((s) => '<span>' + esc(s) + '</span>').join('');
    el.vizNote.textContent = '';
  } else {
    el.viz.textContent = '';
    el.vizNote.textContent = 'The token view is shown for texts up to ' + fmtInt(VIZ_LIMIT) + ' characters.';
  }
}
let timer;
el.text.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 150); });
$('clear').addEventListener('click', () => { el.text.value = ''; update(); el.text.focus(); });
$('sample').addEventListener('click', () => {
  el.text.value = 'Tokens are the pieces of text a language model reads. A short sentence like this one is usually around twenty tokens, while code, numbers, and non-English text often take more.';
  update();
});

// ---- model picker ----
function catalogModel(id) { return catalog && catalog.models.find((m) => m.id === id); }
function currentModel() {
  const v = el.model.value;
  if (v === 'custom') return CUSTOM;
  if (v.startsWith('or:')) {
    const m = catalogModel(v.slice(3));
    if (m) return { id: v, name: m.name, inP: m.inP, outP: m.outP, note: 'Price from the OpenRouter catalog (' + catalogDate() + '); it can differ from the provider\'s own list.' };
  }
  return MODELS.find((m) => m.id === v) || MODELS[0];
}
function catalogDate() { return catalog ? catalog.generatedAt.slice(0, 10) : ''; }
function populateModels(keep) {
  let html = '<optgroup label="Provider pricing pages (checked 2026-11-09)">' +
    MODELS.map((m) => '<option value="' + m.id + '">' + esc(m.name) + '</option>').join('') + '</optgroup>';
  if (catalog) {
    const groups = new Map();
    for (const m of catalog.models) { if (!groups.has(m.provider)) groups.set(m.provider, []); groups.get(m.provider).push(m); }
    const order = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    html += order.map(([p, list]) => '<optgroup label="' + esc(providerName(p)) + ' (catalog)">' +
      list.map((m) => '<option value="or:' + esc(m.id) + '">' + esc(m.name) + '</option>').join('') + '</optgroup>').join('');
  }
  html += '<optgroup label="Other"><option value="custom">Custom prices</option></optgroup>';
  el.model.innerHTML = html;
  el.model.value = keep && [...el.model.options].some((o) => o.value === keep) ? keep : 'claude-sonnet-5-5';
}
function applyModel() {
  const m = currentModel();
  el.pIn.value = m.inP;
  el.pOut.value = m.outP;
  el.priceNote.textContent = m.note || '';
  recalc();
}
function num(v) { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; }
function recalc() {
  const m = currentModel();
  const inTok = num(el.inTok.value), outTok = num(el.outTok.value), reqs = num(el.reqs.value);
  let pIn = num(el.pIn.value), pOut = num(el.pOut.value);
  // apply the long-prompt tier only while the price fields still match the model's default prices
  if (m.longThreshold && inTok > m.longThreshold && pIn === m.inP && pOut === m.outP) {
    pIn = m.longInP; pOut = m.longOutP;
  }
  const perReq = (inTok * pIn + outTok * pOut) / 1e6;
  el.costReq.textContent = fmtUsd(perReq);
  el.costMonth.textContent = fmtUsd(perReq * reqs);
  el.costYear.textContent = fmtUsd(perReq * reqs * 12);
  scheduleCompare();
}
el.model.addEventListener('change', applyModel);
['inTok', 'outTok', 'reqs'].forEach((k) => el[k].addEventListener('input', recalc));
['pIn', 'pOut'].forEach((k) => el[k].addEventListener('input', recalc));
$('useText').addEventListener('click', () => {
  if (lastCount200) { el.inTok.value = lastCount200; recalc(); }
  else el.status.textContent = 'Paste some text first.';
});

// ---- comparison table ----
const PAGE = 25;
let shown = PAGE;
let cmpTimer;
function scheduleCompare() { clearTimeout(cmpTimer); cmpTimer = setTimeout(() => { shown = PAGE; renderCompare(); }, 120); }

function compareSource() {
  if (catalog) return catalog.models;
  // fallback if the catalog could not be loaded: show the core models only
  return MODELS.map((m) => ({ id: m.id, name: m.name, provider: m.id.startsWith('claude') ? 'anthropic' : 'openai', ctx: null, inP: m.inP, outP: m.outP, img: false }));
}
function renderCompare() {
  const inTok = num(el.inTok.value), outTok = num(el.outTok.value), reqs = num(el.reqs.value);
  const q = el.q.value.trim().toLowerCase();
  const prov = el.prov.value;
  const minCtx = Number(el.minCtx.value) || 0;
  const needImg = el.needImg.checked;
  let hidden = 0;
  const rows = [];
  for (const m of compareSource()) {
    if (prov && m.provider !== prov) continue;
    if (q && !(m.name + ' ' + m.id).toLowerCase().includes(q)) continue;
    if (needImg && !m.img) continue;
    if (minCtx && (!m.ctx || m.ctx < minCtx)) continue;
    if (m.ctx && inTok > m.ctx) { hidden++; continue; } // prompt would not fit
    const perReq = (inTok * m.inP + outTok * m.outP) / 1e6;
    rows.push({ m, perReq });
  }
  const sort = el.sort.value;
  rows.sort((a, b) =>
    sort === 'new' ? (b.m.created || 0) - (a.m.created || 0) || a.perReq - b.perReq
    : sort === 'ctx' ? (b.m.ctx || 0) - (a.m.ctx || 0) || a.perReq - b.perReq
    : a.perReq - b.perReq || a.m.name.localeCompare(b.m.name));
  const slice = rows.slice(0, shown);
  el.cmpBody.innerHTML = slice.map(({ m, perReq }) =>
    '<tr><td>' + esc(m.name) + '<span class="mid">' + esc(providerName(m.provider)) + ' · ' + esc(m.id) + '</span></td><td>' + fmtCtx(m.ctx) + '</td><td>' + fmtP(m.inP) +
    '</td><td>' + fmtP(m.outP) + '</td><td>' + fmtUsd(perReq) + '</td><td>' + fmtUsd(perReq * reqs) + '</td></tr>').join('');
  el.cmpCount.textContent = rows.length
    ? 'Showing ' + slice.length + ' of ' + rows.length + ' models.' + (hidden ? ' ' + hidden + ' hidden because the input exceeds their context window.' : '')
    : 'No models match these filters.' + (hidden ? ' ' + hidden + ' hidden because the input exceeds their context window.' : '');
  el.more.style.display = rows.length > shown ? '' : 'none';
}
el.more.addEventListener('click', () => { shown += PAGE; renderCompare(); });
[el.q, el.prov, el.minCtx, el.needImg, el.sort].forEach((c) => c.addEventListener('input', scheduleCompare));

function fillProviderFilter() {
  const counts = new Map();
  for (const m of compareSource()) counts.set(m.provider, (counts.get(m.provider) || 0) + 1);
  const list = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  el.prov.innerHTML = '<option value="">All providers</option>' +
    list.map(([p, n]) => '<option value="' + esc(p) + '">' + esc(providerName(p)) + ' (' + n + ')</option>').join('');
}

// ---- load the catalog (dynamic) ----
function loadCatalog() {
  return fetch('data/models.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((j) => {
      if (!j || !Array.isArray(j.models) || !j.models.length) throw new Error('empty');
      catalog = j;
      el.catNote.textContent = 'Catalog of ' + fmtInt(j.models.length) + ' models, refreshed daily (last update ' + catalogDate() + ') from OpenRouter\'s public model list. Listed prices can differ from a provider\'s own price list.';
      const keep = el.model.value;
      populateModels(keep);
      fillProviderFilter();
      applyModel();
    })
    .catch(() => {
      el.catNote.textContent = 'The full model catalog could not be loaded, so only the core models are shown.';
      fillProviderFilter();
      renderCompare();
    });
}

populateModels();
applyModel();
update();
renderCompare();
loadCatalog();
// Start fetching tokenizers when the browser is idle, so the first count feels instant.
(window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => loadTokenizers());
