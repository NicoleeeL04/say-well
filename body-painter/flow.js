import {dentalSuggestions,relativeToothPosition} from './dental-regions.js?v=tooth-preview-1';
import {activeModel,dental,setDentalReadOnly,notifyModelVisibility,selectModel} from './model-switcher.js';
import {FIELDS,escapeHTML} from './symptoms.js';
import {regionLabel,regionText} from './regions.js';
import {loadHistory,createRecord,saveRecord,thumbnail,recordAreas} from './history.js';
import {redFlag} from './redflags.js';
import {loadProfile,profileRows,PROFILE_KEY} from './profile.js';

const $ = id => document.getElementById(id);
let messages = [], regions = [], painted = null, ai = false, busy = false, step = 1, valid = false;
let manualDrawing = false, mapKey = null, mapJob = 0, score = 0, historyId = null, saved = true;
let lastUserBubble = null, interpretationFailed = false;
const details = Object.fromEntries(Object.keys(FIELDS).map(key => [key, '']));
const translations = [];
let dentalReport = {involved:false, locations:[]}, dentalKey = null, dentalManual = false, dentalJob = 0;
let dentalCountFrom = null, dentalCountContext = null;

// ---------- notices ----------
const notice = text => {
  const element = $('notice');
  $(step === 1 ? 'chat-notice-slot' : 'review-notice-slot').append(element);
  element.textContent = text;
  element.hidden = !text;
  element.dataset.tone = /copied|downloaded|Manual mode is on|Saved|updated|Shared/i.test(text) ? 'success' : 'info';
};

// ---------- dental ----------
function currentDentalSuggestion() {
  const text = $('review-english').value;
  const query = relativeToothPosition(text);
  const context = JSON.stringify({locations:dentalReport.locations, query});
  if (context !== dentalCountContext) { dentalCountFrom = null; dentalCountContext = context; }
  return dentalSuggestions(dentalReport, {text, countFrom:dentalCountFrom});
}
function updateDentalCountQuestion(suggestion) {
  $('dental-count-question').hidden = step !== 2 || dentalManual || !(suggestion.needsCount || dentalCountFrom);
  for (const [id, reference] of [['count-from-model','model'], ['count-from-wisdom','wisdom']]) {
    const shown = dentalCountFrom || relativeToothPosition($('review-english').value).reference || 'model';
    $(id).setAttribute('aria-pressed', String(shown === reference));
  }
}
document.addEventListener('modelchange', () => { updateDentalCountQuestion(currentDentalSuggestion()); renderFacts(); });
document.addEventListener('dentalchange', event => {
  if (event.detail?.source !== 'automatic') {
    dentalManual = true;
    $('dental-count-question').hidden = true;
    $('dental-status').textContent = '';
  }
  changed();
  renderFacts();
});
async function syncDental(force = false) {
  if (step === 1) return;
  const suggestion = currentDentalSuggestion();
  updateDentalCountQuestion(suggestion);
  const key = JSON.stringify({report:dentalReport, query:relativeToothPosition($('review-english').value), countFrom:dentalCountFrom}), job = ++dentalJob;
  if (!dentalReport.involved && !dental()) return;
  for (let attempt = 0; !$('dental-model').contentWindow?.modelReady && attempt < 200; attempt++) {
    $('dental-status').textContent = 'Loading the dental model…';
    await new Promise(resolve => setTimeout(resolve, 100));
    if (job !== dentalJob || step === 1) return;
  }
  if (!$('dental-model').contentWindow?.modelReady) { $('dental-status').textContent = 'The dental model could not load. Your description is still available.'; return; }
  setDentalReadOnly(false);
  if (!force && key === dentalKey) { $('dental-status').textContent = ''; return; }
  $('apply-dental').hidden = suggestion.needsCount || suggestion.needsManual || !suggestion.selections.length;
  if (!force && dentalManual) { $('dental-status').textContent = 'Your own selection is kept.'; return; }
  dental().markTeeth(suggestion.selections);
  dentalKey = key; dentalManual = false;
  updateDentalCountQuestion(suggestion);
  $('dental-status').textContent = suggestion.needsCount ? 'Counted without wisdom teeth. Check the tooth.'
    : suggestion.needsManual ? 'Tap the tooth that hurts.'
    : suggestion.unsupported ? 'Wisdom teeth aren’t shown; your description keeps the detail.'
    : suggestion.selections.length ? suggestion.uncertain ? 'Suggested area. Tap the exact tooth.' : 'Check the marked tooth. Left and right are your own sides.'
    : dentalReport.involved ? 'Tap the tooth that hurts.' : '';
  renderFacts();
}
$('apply-dental').onclick = () => void syncDental(true);
for (const [id, reference] of [['count-from-model','model'], ['count-from-wisdom','wisdom']]) {
  $(id).onclick = () => { if (step !== 2) return; dentalCountFrom = reference; dentalManual = false; void syncDental(true); };
}

// ---------- body painter ----------
function painterRoot() { return $('painter').contentDocument?.getElementById('skin-paint'); }
function painter() { return painterRoot()?.skinPaint; }
let paintTimer = 0;
function readPainted() {
  clearTimeout(paintTimer);
  paintTimer = setTimeout(() => {
    try { painted = painter()?.paintedRegions?.() ?? painted; } catch {}
    renderFacts();
  }, 250);
}
function bindPainter() {
  const root = painterRoot();
  if (!root || root.dataset.flowBound) return;
  root.dataset.flowBound = 'true';
  const frame = $('painter'), main = root.ownerDocument.querySelector('main');
  const size = () => { if (main.getBoundingClientRect().width) frame.style.height = Math.ceil(main.getBoundingClientRect().height + 8) + 'px'; };
  new ResizeObserver(size).observe(main);
  size();
  root.addEventListener('paintchange', event => {
    if (event.detail.source !== 'automatic') manualDrawing = true;
    changed();
    readPainted();
  });
  root.addEventListener('skinpaint-ready', () => { if (step !== 1) void syncMap(); });
}
$('painter').addEventListener('load', bindPainter);
bindPainter();
async function syncMap() {
  if (step === 1) return;
  const key = JSON.stringify(regions), job = ++mapJob;
  for (let attempt = 0; !painter() && attempt < 150; attempt++) {
    if (painterRoot()?.dataset.error) break;
    $('map-status').textContent = 'Loading the body model…';
    await new Promise(resolve => setTimeout(resolve, 100));
    if (job !== mapJob || step === 1) return;
    bindPainter();
  }
  const api = painter();
  if (!api) { $('map-status').textContent = 'The body model didn’t load. Your description still works; reload to try again.'; return; }
  $('map-status').textContent = '';
  api.setReadOnly(false);
  if (key === mapKey || manualDrawing) return;
  const result = api.markRegions(regions);
  mapKey = key;
  manualDrawing = false;
  if (result.missing.length) $('map-status').textContent = `Couldn’t mark ${result.missing.map(regionText).join(', ')}. Paint it yourself.`;
  readPainted();
}

// ---------- locations, facts, live card ----------
const sentence = text => text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
function bodyLocations() { return (painted ?? regions).map(r => sentence(regionText(r))); }
function teethLocations() {
  const candidate = !dentalManual && currentDentalSuggestion().uncertain;
  return (dental()?.getState().selections || []).map(s => `${candidate ? 'Possibly tooth' : 'Tooth'} ${s.tooth} (${s.label})${s.includesGum ? ' and gum' : ''}`);
}
function locationLabels() { return [...bodyLocations(), ...teethLocations()]; }
function bodyAreas() {
  return [...(painted ?? regions).map(r => regionLabel(r.region)), ...((dental()?.getState().selections || []).length ? ['teeth & gums'] : [])];
}
let lastFacts = {};
function renderFacts() {
  const rows = [
    ['Location', locationLabels().join(' · ') || 'Paint it on the model'],
    ['Pain', score ? `${score} / 10${details.symptom ? ', ' + details.symptom : ''}` : details.symptom || ''],
    ['Started', details.onset],
    ['Pattern', details.pattern],
    ['Worse or better with', details.triggers],
    ['Also noticed', details.associated],
  ].filter(([, value]) => value && value.trim());
  const card = profileRows(loadProfile());
  const fromCard = new Set(card.map(([key]) => key));
  rows.push(...card);
  const profile = loadProfile();
  $('card-link').replaceChildren(card.length ? 'From my medical card · ' : (profile.include ? 'Add allergies and medicines once: ' : 'Medical card is off · '),
    Object.assign(document.createElement('a'), {href:'card.html', textContent:card.length || !profile.include ? 'Edit' : 'My medical card', target:'_blank'}));
  $('facts').replaceChildren(...rows.map(([key, value]) => {
    const row = document.createElement('div');
    row.className = fromCard.has(key) ? 'fact from-card' : 'fact';
    if (step === 2 && !fromCard.has(key) && lastFacts[key] !== undefined && lastFacts[key] !== value) {
      row.classList.add('just-updated');
      setTimeout(() => row.classList.remove('just-updated'), 1800);
    }
    row.append(Object.assign(document.createElement('dt'), {textContent:key}), Object.assign(document.createElement('dd'), {textContent:value}));
    return row;
  }));
  lastFacts = Object.fromEntries(rows);
}
function renderUnderstood() {
  const items = [
    ['Symptom', details.symptom],
    ['Where', [...regions.map(r => sentence(regionText(r))), ...(dentalReport.involved ? ['Teeth or gums'] : [])].join(', ')],
    ['Started', details.onset],
    ['Pattern', details.pattern],
    ['Worse or better with', details.triggers],
    ['Also noticed', details.associated],
  ];
  $('understood-list').replaceChildren(...items.map(([key, value]) => {
    const li = document.createElement('li');
    li.className = value ? 'known' : 'unknown';
    li.append(Object.assign(document.createElement('span'), {className:'u-key', textContent:key}),
      Object.assign(document.createElement('span'), {className:'u-value', textContent:value || 'Not yet'}));
    return li;
  }));
}
function renderOriginal() {
  $('original').textContent = translations.map(item => `${item.original}${item.english ? '\n→ ' + item.english : ''}`).join('\n\n');
}

// ---------- pain score ----------
const PAIN = ['#F6C38E','#F4B484','#F3A47B','#F29573','#F0866C','#EE7766','#E8604F','#DB4B3E','#C93A33','#B52B2B'];
for (let n = 1; n <= 10; n++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.dataset.n = n;
  b.style.setProperty('--c', PAIN[n - 1]);
  b.setAttribute('aria-label', `${n} out of 10`);
  b.onclick = () => { score = score === n ? 0 : n; renderScore(); changed(); renderFacts(); };
  $('score').append(b);
}
function renderScore() {
  for (const b of $('score').children) {
    b.setAttribute('aria-checked', String(+b.dataset.n === score));
    b.classList.toggle('filled', +b.dataset.n <= score);
  }
  $('score-label').innerHTML = score ? `<b>${score}</b> / 10` : 'Tap to rate';
}
renderScore();

// ---------- steps ----------
function changed() { saved = false; }
function updateNavigation() { $('to-body').disabled = busy || !valid; }
function changeStep(next) {
  if (busy || next === 2 && !valid) return;
  step = next;
  document.body.dataset.step = String(next);
  notice('');
  for (const [id, visible] of Object.entries({conversation:next === 1, understood:next === 1, 'model-card':next === 2, details:next === 2})) $(id).hidden = !visible;
  $('page-title').textContent = next === 1 ? 'What’s bothering you?' : 'Where does it hurt?';
  $('page-sub').textContent = next === 1 ? 'Describe it in any language. I’ll ask one thing at a time.' : 'Paint on the model. Your note updates as you go.';
  $('steps').setAttribute('aria-label', `Step ${next} of 2`);
  $('steps').children[1].classList.toggle('on', next === 2);
  notifyModelVisibility();
  updateNavigation();
  if (next === 2) {
    renderOriginal(); renderFacts();
    updateDentalCountQuestion(currentDentalSuggestion());
    void syncMap(); void syncDental();
  }
  $('page-title').focus({preventScroll:true});
  window.scrollTo({top:0, behavior:'instant'});
}
$('to-body').onclick = () => changeStep(2);
document.querySelectorAll('[data-back]').forEach(button => button.onclick = () => changeStep(+button.dataset.back));
$('review-english').oninput = changed;

// Manual-mode inputs (AI off): the same fields the AI would fill.
for (const [key, label] of Object.entries(FIELDS)) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const input = document.createElement('input');
  input.id = `field-${key}`;
  input.maxLength = 800;
  input.oninput = () => { details[key] = input.value; changed(); renderFacts(); renderUnderstood(); };
  wrap.append(input);
  $('fields').append(wrap);
}

// ---------- conversation ----------
function bubble(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.dir = 'auto';
  const author = Object.assign(document.createElement('span'), {className:'sr-only', textContent:role === 'user' ? 'You: ' : 'Say Well: '});
  const content = Object.assign(document.createElement('div'), {className:'message-content', textContent:text});
  div.append(author, content);
  $('messages').append(div);
  div.scrollIntoView({block:'nearest'});
  return div;
}
function showTranslation(text) {
  const disclosure = document.createElement('details');
  disclosure.className = 'message-translation';
  disclosure.append(Object.assign(document.createElement('summary'), {textContent:'English'}), Object.assign(document.createElement('p'), {dir:'ltr', textContent:text}));
  lastUserBubble?.append(disclosure);
}
// ---------- emergency warning signs (works without AI) ----------
let dismissedFlag = '';
function checkRedFlags(...extra) {
  const flag = redFlag(...translations.flatMap(t => [t.original, t.english]), $('review-english').value, ...extra);
  if (!flag || flag.id === dismissedFlag) return;
  $('urgent-title').textContent = flag.title;
  $('urgent-text').textContent = flag.message;
  $('urgent-call').href = `tel:${flag.call}`;
  $('urgent-call').textContent = flag.call === '988' ? 'Call or text 988' : 'Call 911';
  const wasHidden = $('urgent').hidden;
  $('urgent').hidden = false;
  if (wasHidden) $('urgent').scrollIntoView({block:'nearest', behavior:'smooth'});
}
$('urgent-dismiss').onclick = () => {
  dismissedFlag = redFlag(...translations.flatMap(t => [t.original, t.english]), $('review-english').value)?.id || '';
  $('urgent').hidden = true;
};
$('review-english').addEventListener('change', () => checkRedFlags());

function setBusy(value) {
  busy = value;
  for (const id of ['send', 'retry', 'use-manual', 'description', 'consent']) $(id).disabled = value;
  if (!value) $('send').disabled = !$('description').value.trim();
  $('messages').setAttribute('aria-busy', String(value));
  $('thinking').hidden = !value;
  updateNavigation();
}
async function interpret() {
  setBusy(true);
  $('retry').hidden = true;
  notice('');
  try {
    const response = await fetch('/api/interpret', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages}), signal:AbortSignal.timeout(65000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Translation is unavailable right now.');
    translations.at(-1).english = data.translation;
    showTranslation(data.translation);
    if (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(data.language || '') && !/^en/.test(data.language)) { try { localStorage.setItem('saywell.language.v1', data.language); } catch {} }
    $('review-english').value = data.statement;
    for (const key of Object.keys(FIELDS)) { details[key] = data.details[key] || ''; $(`field-${key}`).value = details[key]; }
    regions = data.regions;
    dentalReport = data.dental;
    selectModel(dentalReport.involved ? 'dental' : 'body');
    bubble('assistant', data.reply);
    messages.push({role:'assistant', content:data.reply});
    valid = Boolean(data.statement.trim());
    interpretationFailed = false;
    checkRedFlags(data.statement);
    renderUnderstood();
  } catch (error) {
    interpretationFailed = true;
    $('retry').hidden = false;
    notice(error.name === 'TimeoutError' ? 'That took too long. Retry, or continue without AI.' : error.message);
  } finally {
    setBusy(false);
  }
}
$('retry').onclick = () => { if (!busy) void interpret(); };
$('description').addEventListener('input', () => {
  const t = $('description');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 180) + 'px';
  $('send').disabled = busy || !t.value.trim();
});
$('description').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chat-form').requestSubmit(); }
});
$('chat-form').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const text = $('description').value.trim();
  if (!text) return;
  if (ai && !$('consent').checked) { notice('Tick “Use AI to translate” first, or continue without AI.'); $('consent').focus(); return; }
  if (messages.length >= 30) { notice('This conversation is full. Go to the next step.'); return; }
  messages.push({role:'user', content:text});
  translations.push({original:text, english:''});
  lastUserBubble = bubble('user', text);
  checkRedFlags();
  $('description').value = '';
  $('description').style.height = 'auto';
  $('send').disabled = true;
  changed();
  if (ai) await interpret();
  else {
    valid = true;
    bubble('assistant', 'Kept. Without AI I can’t translate, but on the next step you can mark the spot and write the English yourself.');
    updateNavigation();
  }
};

// ---------- note output: copy, images, share, download ----------
function noteText() {
  const rows = Object.entries(lastFacts).map(([k, v]) => `${k}: ${v}`).join('\n');
  return `${$('review-english').value.trim()}\n\n${rows}`.trim();
}
function wrapLines(ctx, text, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const test = line + word;
      if (ctx.measureText(test).width > width && line.trim()) { lines.push(line.trim()); line = word.trimStart(); }
      else line = test;
    }
    lines.push(line.trim());
  }
  return lines;
}
async function noteImage() {
  const W = 1080, pad = 80, canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  const font = 'system-ui,-apple-system,"Segoe UI",sans-serif';
  ctx.font = `500 46px ${font}`;
  const body = wrapLines(ctx, $('review-english').value.trim() || 'No description yet.', W - pad * 2);
  ctx.font = `600 34px ${font}`;
  const rowLines = Object.entries(lastFacts).map(([k, v]) => [k, wrapLines(ctx, v, W - pad * 2 - 320)]);
  const H = pad + 90 + body.length * 64 + 30 + rowLines.reduce((h, [, l]) => h + 30 + l.length * 46 + 10, 0) + 130;
  canvas.width = W; canvas.height = H;
  ctx.fillStyle = '#F5F7F6'; ctx.fillRect(0, 0, W, H);
  let y = pad;
  ctx.fillStyle = '#5B6672'; ctx.font = `500 30px ${font}`; ctx.fillText('For your doctor', pad, y + 20); y += 90;
  ctx.fillStyle = '#12181F'; ctx.font = `500 46px ${font}`;
  for (const line of body) { ctx.fillText(line, pad, y + 40); y += 64; }
  y += 30;
  for (const [key, lines] of rowLines) {
    ctx.fillStyle = 'rgba(18,24,31,0.12)'; ctx.fillRect(pad, y, W - pad * 2, 2); y += 30;
    ctx.fillStyle = '#5B6672'; ctx.font = `400 30px ${font}`; ctx.fillText(key, pad, y + 30);
    ctx.fillStyle = '#12181F'; ctx.font = `600 34px ${font}`;
    lines.forEach((line, i) => ctx.fillText(line, pad + 320, y + 30 + i * 46));
    y += lines.length * 46 + 10;
  }
  ctx.fillStyle = '#5B6672'; ctx.font = `400 26px ${font}`;
  ctx.fillText('Made with Say Well · Patient-reviewed · Not a diagnosis', pad, H - 50);
  return canvas.toDataURL('image/png');
}
async function modelImage() {
  const isDental = activeModel() === 'dental';
  const shot = isDental ? dental()?.snapshot() : painter()?.snapshot();
  if (!shot) return null;
  const img = new Image(); img.src = shot; await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#E7ECEA'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}
const toFile = async (url, name) => new File([await (await fetch(url)).blob()], name, {type:'image/png'});
function downloadURL(url, name) { Object.assign(document.createElement('a'), {href:url, download:name}).click(); }
$('share').onclick = async () => {
  const [note, model] = await Promise.all([noteImage(), modelImage().catch(() => null)]);
  const files = [await toFile(note, 'say-well-note.png'), ...(model ? [await toFile(model, 'say-well-body-map.png')] : [])];
  if (navigator.canShare?.({files})) {
    try { await navigator.share({files, title:'For my doctor'}); notice('Shared.'); return; }
    catch (error) { if (error.name === 'AbortError') return; }
  }
  downloadURL(note, 'say-well-note.png');
  if (model) setTimeout(() => downloadURL(model, 'say-well-body-map.png'), 300);
  notice('This browser can’t share files, so both images were downloaded.');
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(noteText()); notice('Copied.'); }
  catch { notice('Select the text and copy it manually.'); }
};
$('download').onclick = async () => {
  const model = await modelImage().catch(() => null);
  const isDental = activeModel() === 'dental';
  const original = translations.map(item => `${item.original}${item.english ? '\nEnglish: ' + item.english : ''}`).join('\n\n');
  const rows = Object.entries(lastFacts).map(([k, v]) => `<tr><th>${escapeHTML(k)}</th><td>${escapeHTML(v)}</td></tr>`).join('');
  const credit = isDental && model ? '<p><small>Dental anatomy: BodyParts3D / Anatomography © DBCLS, via OrganUI. Adapted. <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en">CC BY-SA 2.1 Japan</a>.</small></p>' : '';
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>For my doctor</title><style>body{font:18px/1.6 system-ui;max-width:900px;margin:40px auto;padding:24px;color:#12181F}article{display:flex;gap:32px;flex-wrap:wrap}div{flex:1 1 420px}p{white-space:pre-wrap}img{width:300px;border-radius:16px;background:#E7ECEA}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px 0;border-top:1px solid #e3e7e5;vertical-align:top}th{color:#5B6672;font-weight:400;width:40%}small{color:#5B6672}</style><small>For your doctor · Patient-reviewed communication aid · Not a diagnosis</small><article><div><p style="font-size:24px">${escapeHTML($('review-english').value)}</p><table>${rows}</table><h2>My original words</h2><p dir="auto">${escapeHTML(original)}</p></div>${model ? `<img alt="Marked ${isDental ? 'teeth' : 'body areas'}" src="${model}">` : ''}</article>${credit}</html>`;
  const url = URL.createObjectURL(new Blob([html], {type:'text/html'}));
  downloadURL(url, 'for-my-doctor.html');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Downloaded.');
};

// ---------- pain log ----------
function renderRecent() {
  const records = loadHistory();
  $('history-count').textContent = String(records.length);
  $('history-count').hidden = !records.length;
  $('recent').replaceChildren(...records.slice(0, 6).map(r => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `history.html#${encodeURIComponent(r.id)}`;
    a.dataset.leave = '';
    const area = recordAreas(r)[0] || r.locations[0] || 'Description';
    a.append(Object.assign(document.createElement('span'), {className:'r-title', textContent:sentence(area)}),
      Object.assign(document.createElement('span'), {className:'r-date', textContent:new Date(r.savedAt).toLocaleDateString(undefined, {month:'short', day:'numeric'})}));
    li.append(a);
    return li;
  }));
  $('recent').closest('nav').hidden = !records.length;
}
document.addEventListener('click', event => {
  const link = event.target.closest('[data-leave]');
  if (link && messages.length && !saved && !window.confirm('Leave this description? It isn’t saved to your pain log yet.')) event.preventDefault();
});
$('save-history').onclick = async () => {
  const isDental = activeModel() === 'dental';
  let image = '';
  try { image = await thumbnail(await modelImage()); } catch {}
  const record = createRecord({
    id:historyId, statement:$('review-english').value, locations:locationLabels(), areas:bodyAreas(),
    originals:translations, model:isDental ? 'dental' : 'body', image, score,
    doctor:loadHistory().find(r => r.id === historyId)?.doctor,
  });
  try {
    const updating = Boolean(historyId);
    saveRecord(record);
    historyId = record.id; saved = true;
    $('after-visit').href = `doctor.html#${encodeURIComponent(historyId)}`;
    renderRecent();
    notice(updating ? 'Pain log entry updated.' : 'Saved to your pain log on this device.');
  } catch {
    notice('Couldn’t save. Your browser may block storage, for example in private browsing.');
  }
};
renderRecent();
addEventListener('storage', event => {
  if (event.key?.startsWith('saywell.history')) renderRecent();
  if (event.key === PROFILE_KEY) renderFacts();
});
addEventListener('focus', () => { if (step === 2) renderFacts(); });

// ---------- mode ----------
function configureMode() {
  $('use-manual').hidden = !ai;
  $('consent-row').hidden = !ai;
  $('fields').hidden = ai;
  $('review-note').hidden = ai;
  $('privacy').textContent = ai ? '' : 'Translation is off. Your notes stay on this device.';
  $('privacy').hidden = ai;
}
$('use-manual').onclick = () => {
  if (busy) return;
  ai = false;
  if (interpretationFailed) {
    $('review-english').value = '';
    for (const key of Object.keys(details)) { details[key] = ''; $(`field-${key}`).value = ''; }
    regions = []; dentalReport = {involved:false, locations:[]};
    selectModel('body');
  }
  $('retry').hidden = true;
  valid = messages.some(message => message.role === 'user');
  configureMode();
  renderUnderstood();
  updateNavigation();
  notice('Manual mode is on. You can write the English yourself on the next step.');
};
renderUnderstood();
try {
  const response = await fetch('/api/config', {signal:AbortSignal.timeout(5000)});
  if (response.ok) ai = (await response.json()).ai === true;
} catch {}
configureMode();
setBusy(false);
