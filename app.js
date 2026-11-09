// Token Counter: everything runs in the browser. No text is sent anywhere.

// Prices in USD per 1M tokens, standard tier, as listed on 2026-11-09.
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
  { id: 'custom', name: 'Custom prices', inP: 1, outP: 3 },
];

const $ = (id) => document.getElementById(id);
const el = {
  text: $('text'), chars: $('chars'), words: $('words'),
  t200: $('t200'), t100: $('t100'), tclaude: $('tclaude'),
  status: $('status'), viz: $('viz'), vizNote: $('vizNote'),
  model: $('model'), inTok: $('inTok'), outTok: $('outTok'), reqs: $('reqs'),
  pIn: $('pIn'), pOut: $('pOut'), priceNote: $('priceNote'),
  costReq: $('costReq'), costMonth: $('costMonth'), costYear: $('costYear'),
};

const fmtInt = (n) => Number(n).toLocaleString('en-US');
const fmtUsd = (n) => {
  if (!isFinite(n)) return '$0';
  if (n === 0) return '$0';
  if (n < 0.01) return '$' + n.toPrecision(2);
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
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
    el.viz.innerHTML = o200k.tokens(t).map((s) => '<span>' + escapeHtml(s) + '</span>').join('');
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

// ---- cost calculator ----
function populateModels() {
  el.model.innerHTML = MODELS.map((m) => '<option value="' + m.id + '">' + m.name + '</option>').join('');
  el.model.value = 'claude-sonnet-5-5';
  applyModel();
}
function currentModel() { return MODELS.find((m) => m.id === el.model.value) || MODELS[0]; }
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
}
el.model.addEventListener('change', applyModel);
['inTok', 'outTok', 'reqs', 'pIn', 'pOut'].forEach((k) => el[k].addEventListener('input', recalc));
$('useText').addEventListener('click', () => {
  if (lastCount200) { el.inTok.value = lastCount200; recalc(); }
  else el.status.textContent = 'Paste some text first.';
});

populateModels();
update();
// Start fetching tokenizers when the browser is idle, so the first count feels instant.
(window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => loadTokenizers());
