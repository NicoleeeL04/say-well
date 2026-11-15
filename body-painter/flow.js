import {dentalSuggestions,relativeToothPosition} from './dental-regions.js?v=tooth-preview-1';
import {activeModel,dental,setDentalReadOnly,notifyModelVisibility,selectModel} from './model-switcher.js';
import {FIELDS,statementFor,escapeHTML} from './symptoms.js';
import {REGIONS,regionLabel,regionText} from './regions.js';
import {loadHistory,createRecord,saveRecord,thumbnail} from './history.js';
const $ = id => document.getElementById(id);
let messages = [], regions = [], ai = false, busy = false, step = 1, valid = false;
let reviewVersion = 0, summaryVersion = -1, manualDrawing = false, mapKey = null, mapJob = 0;
let lastUserBubble = null, interpretationFailed = false;
const details = Object.fromEntries(Object.keys(FIELDS).map(key => [key, '']));
const translations = [];
let dentalReport={involved:false,locations:[]}, dentalKey=null, dentalManual=false, dentalJob=0;
let dentalCountFrom=null, dentalCountContext=null;

function currentDentalSuggestion(){
  const text=$('review-english').value;
  const query=relativeToothPosition(text);
  const context=JSON.stringify({locations:dentalReport.locations,query});
  if(context!==dentalCountContext){dentalCountFrom=null;dentalCountContext=context;}
  return dentalSuggestions(dentalReport,{text,countFrom:dentalCountFrom});
}
function updateDentalCountQuestion(suggestion){
  $('dental-count-question').hidden=step!==2||dentalManual||!(suggestion.needsCount||dentalCountFrom);
  for(const [id,reference] of [['count-from-model','model'],['count-from-wisdom','wisdom']]){
    const displayedReference=dentalCountFrom||relativeToothPosition($('review-english').value).reference||'model';
    $(id).setAttribute('aria-pressed',String(displayedReference===reference));
  }
}

const notice = text => {
  const element=$('notice');
  $(step===1?'chat-notice-slot':step===2?'review-notice-slot':'summary-notice-slot').append(element);
  element.textContent=text;
  element.hidden=!text;
  element.dataset.tone=/copied|downloaded|Manual mode is on|Saved to your history/i.test(text)?'success':'info';
};
function refreshReviewCopy(){
  const final=step===3;
  $('body-map-help').textContent='Illustrative model. Review all markings.';
  $('dental-map-help').textContent='Illustrative model. Wisdom teeth are not shown.';
  for(const id of ['map-status','dental-status']){
    const el=$(id);
    if(final){
      if(!el.dataset.reviewCopy)el.dataset.reviewCopy=el.textContent;
      if(id==='map-status')el.textContent='Reviewed markings';
      else{const suggestion=currentDentalSuggestion();el.textContent=!dentalManual&&suggestion.needsManual?'Tooth not identified. The description is kept.':!dentalManual&&suggestion.needsCount?'Suggested tooth, counted without wisdom teeth.':suggestion.unsupported?'Wisdom teeth are not shown; the symptom remains in your description.':suggestion.uncertain&&!dentalManual?'Suggested area; confirm which tooth hurts.':'Reviewed selections';}
    }else if(el.dataset.reviewCopy){el.textContent=el.dataset.reviewCopy;delete el.dataset.reviewCopy;}
  }
}

function locationLabels(){
  const body = regions.map(regionText);
  const candidate = !dentalManual && currentDentalSuggestion().uncertain;
  const teeth = (dental()?.getState().selections || []).map(s => `${candidate ? 'Candidate tooth' : 'Tooth'} ${s.tooth} (${s.label})${s.includesGum ? ' and adjacent gum' : ''}`);
  return [...body,...teeth];
}
function updateModelCaption(){
  const isDental = activeModel() === 'dental';
  $('body-location-fields').hidden=isDental;
  $('apply-marks').hidden=isDental;
  $('map-title').textContent = isDental ? 'Dental map' : 'Body map';
  updateDentalCountQuestion(currentDentalSuggestion());
  refreshReviewCopy();
}
document.addEventListener('modelchange',updateModelCaption);
document.addEventListener('dentalchange',event=>{
  if(event.detail?.source!=='automatic'){
    dentalManual=true;
    $('dental-count-question').hidden=true;
    $('dental-status').textContent='Your selection. Check the tooth and gum.';
  }
  invalidate();
});

async function syncDental(force=false) {
  if(step===1)return;
  const suggestion=currentDentalSuggestion();
  updateDentalCountQuestion(suggestion);
  const key=JSON.stringify({report:dentalReport,query:relativeToothPosition($('review-english').value),countFrom:dentalCountFrom}),job=++dentalJob;
  $('confirmed').disabled=dentalReport.involved&&!$('dental-model').contentWindow?.modelReady;
  if(!dentalReport.involved&&!dental())return;
  for(let attempt=0;!$('dental-model').contentWindow?.modelReady&&attempt<200;attempt++) {
    $('dental-status').textContent='Loading the dental model…';
    await new Promise(resolve=>setTimeout(resolve,100));
    if(job!==dentalJob||step===1)return;
  }
  $('confirmed').disabled=false;
  if(!$('dental-model').contentWindow?.modelReady){$('dental-status').textContent='The dental model could not load. Your English account is still available. Please reload to try again.';return;}
  setDentalReadOnly(step===3);
  if(!force&&key===dentalKey)return;
  $('apply-dental').hidden=step===3||suggestion.needsCount||suggestion.needsManual;
  if(!force&&dentalManual){$('dental-status').textContent='Description changed. Your manual selections are kept.';return;}
  dental().markTeeth(suggestion.selections);
  dentalKey=key;dentalManual=false;
  updateDentalCountQuestion(suggestion);
  $('dental-status').textContent=suggestion.needsCount
    ? 'Preview: one tooth, counted without wisdom teeth. Check the location.'
    :suggestion.needsManual
    ? 'Tooth not identified. Select it on the model.'
    :suggestion.unsupported
    ? 'Wisdom teeth are not shown; the symptom remains in your description.'
    :suggestion.selections.length
      ?suggestion.uncertain?'Suggested area, not a confirmed tooth. Select the tooth that hurts.':'Check the selected tooth. Left and right are your own sides.'
      :dentalReport.involved?'Select the tooth that hurts.':'No teeth selected.';
}
$('apply-dental').onclick=()=>void syncDental(true);
for(const [id,reference] of [['count-from-model','model'],['count-from-wisdom','wisdom']]){
  $(id).onclick=()=>{
    if(step!==2)return;
    dentalCountFrom=reference;
    dentalManual=false;
    void syncDental(true);
  };
}

function painterRoot() { return $('painter').contentDocument?.getElementById('skin-paint'); }
function painter() { return painterRoot()?.skinPaint; }
function invalidate() {
  reviewVersion++;
  $('confirmed').checked = false;
  $('to-summary').disabled = true;
  updateNavigation();
}
function updateNavigation() {
  $('to-body').disabled = busy || !valid;
  document.querySelectorAll('.progress-nav button[data-step]').forEach(button => {
    const next = +button.dataset.step;
    button.disabled = busy || next === 2 && !valid || next === 3 && (!valid || !$('confirmed').checked);
    if (next === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
}
for (const [key, label] of Object.entries(FIELDS)) {
  const wrap = document.createElement('label');
  wrap.textContent = label;
  const input = document.createElement('input');
  input.id = `field-${key}`;
  input.maxLength = 800;
  input.placeholder = 'Not specified';
  input.oninput = () => { details[key] = input.value; invalidate(); };
  wrap.append(input);
  $('fields').append(wrap);
}
for (const region of REGIONS) {
  const option = document.createElement('option');
  option.value = region;
  option.textContent = regionLabel(region);
  $('region').append(option);
}
function bubble(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.dir = 'auto';
  const author=document.createElement('span');author.className='message-author';author.textContent=role==='user'?'You':'Say Well';author.dir='ltr';
  const content=document.createElement('div');content.className='message-content';content.textContent=text;
  div.append(author,content);
  $('messages').append(div);
  $('messages').scrollTop = $('messages').scrollHeight;
  return div;
}
function showTranslation(text) {
  const disclosure = document.createElement('details');
  disclosure.className = 'message-translation';
  disclosure.open = true;
  const label = document.createElement('summary');
  label.textContent = 'English translation';
  const content = document.createElement('p');
  content.dir = 'ltr';
  content.textContent = text;
  disclosure.append(label, content);
  lastUserBubble?.append(disclosure);
}
function renderRegions() {
  $('regions').replaceChildren();
  regions.forEach((region, index) => {
    const button = document.createElement('button');
    button.textContent = `${regionText(region)} ×`;
    button.setAttribute('aria-label', `Remove ${regionText(region)}`);
    button.onclick = () => {
      regions.splice(index, 1);
      renderRegions();
      void syncMap();
    };
    $('regions').append(button);
  });
  invalidate();
}
function bindPainter() {
  const root = painterRoot();
  if (!root || root.dataset.flowBound) return;
  root.dataset.flowBound = 'true';
  // Size the frame to its own content so expanded tools never create nested scroll.
  const frame=$('painter'),main=root.ownerDocument.querySelector('main');
  const size=()=>{if(!main.getBoundingClientRect().width)return;frame.style.height=Math.ceil(main.getBoundingClientRect().height+32)+'px';};
  new ResizeObserver(size).observe(main);
  size();
  root.addEventListener('paintchange', event => {
    if (event.detail.source !== 'automatic') {
      manualDrawing = true;
      invalidate();
    }
  });
  root.addEventListener('skinpaint-ready', () => {
    if (step !== 1) void syncMap();
  });
}
$('painter').addEventListener('load', bindPainter);
bindPainter();
async function syncMap(force = false) {
  if (step === 1) return;
  const key = JSON.stringify(regions);
  const job = ++mapJob;
  // A slow GLB load must not silently drop the first automatic annotation.
  for (let attempt = 0; !painter() && attempt < 150; attempt++) {
    if (painterRoot()?.dataset.error) break;
    $('map-status').textContent = 'Loading model…';
    await new Promise(resolve => setTimeout(resolve, 100));
    if (job !== mapJob || step === 1) return;
    bindPainter();
  }
  const api = painter();
  if (!api) {
    $('map-status').textContent = 'Body model unavailable. Your location labels and statement are still usable. Reload to try the model again.';
    return;
  }
  api.setReadOnly(step === 3);
  if (!force && key === mapKey) return;
  if (!force && manualDrawing) {
    $('map-status').textContent = 'Locations changed. Your drawing is kept; use “Replace drawing” to update it.';
    return;
  }
  const result = api.markRegions(regions);
  mapKey = key;
  manualDrawing = false;
  invalidate();
  $('map-status').textContent = result.missing.length
    ? `Could not mark ${result.missing.map(regionText).join(', ')}. Please paint those areas yourself.`
    : result.marked.length
      ? `${result.marked.length} area${result.marked.length === 1 ? '' : 's'} marked. Check the location.`
      : 'No areas marked.';
}
function changeStep(next) {
  if (busy || next !== 1 && !valid || next === 3 && !$('confirmed').checked) return;
  step = next;
  document.body.dataset.step=String(next);
  notice('');
  for (const [id, visible] of Object.entries({conversation:next === 1, details:next === 2, summary:next === 3, 'model-card':next !== 1, 'review-actions':next === 2})) $(id).hidden = !visible;
  $('page-title').textContent = ['', 'Describe your symptoms', 'Review your description', 'Your statement'][next];
  updateModelCaption();
  setDentalReadOnly(next === 3);
  notifyModelVisibility();
  updateNavigation();
  const dentalSuggestion=currentDentalSuggestion();
  updateDentalCountQuestion(dentalSuggestion);
  $('apply-dental').hidden=next===3||!dentalReport.involved||dentalSuggestion.needsCount||dentalSuggestion.needsManual;
  if (next !== 1) {void syncMap();void syncDental();}
  $('page-title').focus({preventScroll:true});
  $('page-title').scrollIntoView({block:'start',behavior:'instant'});
}
$('apply-marks').onclick = () => { void syncMap(true); };
$('add-region').onclick = () => {
  const region = {region:$('region').value, side:$('side').value, surface:$('surface').value};
  if (!regions.some(r => JSON.stringify(r) === JSON.stringify(region))) {
    regions.push(region);
    renderRegions();
    void syncMap();
  }
};
$('review-english').oninput = invalidate;
$('confirmed').onchange = () => {
  $('to-summary').disabled = !$('confirmed').checked;
  updateNavigation();
};
$('to-body').onclick = () => changeStep(2);
function showSummary() {
  if (!valid || !$('confirmed').checked) return;
  if (summaryVersion !== reviewVersion) {
    $('statement').value = $('review-english').value.trim() || statementFor(details, regions);
    summaryVersion = reviewVersion;
  }
  $('original').textContent = translations.map(item => `${item.original}${item.english ? '\nEnglish: '+item.english : '\n(Not translated)'}`).join('\n\n');
  $('summary-locations').textContent = locationLabels().join(' · ') || 'No specific location reported';
  changeStep(3);
}
$('to-summary').onclick = showSummary;
document.querySelectorAll('.progress-nav button[data-step]').forEach(button => button.onclick = () => +button.dataset.step === 3 ? showSummary() : changeStep(+button.dataset.step));
document.querySelectorAll('[data-back]').forEach(button => button.onclick = () => changeStep(+button.dataset.back));
function setBusy(value) {
  busy = value;
  $('send').disabled = value;
  $('retry').disabled = value;
  $('use-manual').disabled = value;
  $('description').disabled = value;
  $('consent').disabled = value;
  $('messages').setAttribute('aria-busy',String(value));
  $('send').textContent = value ? 'Translating…' : 'Send';
  $('thinking').hidden = !value;
  updateNavigation();
}
async function interpret() {
  setBusy(true);
  valid = false;
  invalidate();
  $('retry').hidden = true;
  notice('');
  try {
    const response = await fetch('/api/interpret', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages}), signal:AbortSignal.timeout(65000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Interpretation unavailable.');
    translations.at(-1).english = data.translation;
    showTranslation(data.translation);
    $('review-english').value = data.statement;
    for (const key of Object.keys(FIELDS)) {
      details[key] = data.details[key] || '';
      $(`field-${key}`).value = details[key];
    }
    regions = data.regions;
    dentalReport=data.dental;
    selectModel(dentalReport.involved?'dental':'body');
    renderRegions();
    bubble('assistant', data.reply);
    messages.push({role:'assistant', content:data.reply});
    valid = Boolean(data.statement.trim());
    interpretationFailed = false;
    $('to-body').textContent = data.ready ? 'Review description' : 'Review description';
    $('chat-progress').hidden = true;
  } catch (error) {
    interpretationFailed = true;
    $('retry').hidden = false;
    notice(error.name === 'TimeoutError' ? 'That took too long. Retry your last message, or continue without AI.' : error.message);
    $('chat-progress').textContent = 'Translation failed. Retry to continue.';
    $('chat-progress').hidden = false;
  } finally {
    setBusy(false);
    $('messages').scrollTop = $('messages').scrollHeight;
  }
}
$('retry').onclick = () => { if (!busy) void interpret(); };
$('chat-form').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const text = $('description').value.trim();
  if (!text) return;
  if (ai && !$('consent').checked) {
    notice('Choose “Use AI to help translate my words” above, or continue without AI.');
    $('consent').focus();
    return;
  }
  if (messages.length >= 30) { notice('This conversation is full. Please review your description.'); return; }
  messages.push({role:'user', content:text});
  translations.push({original:text, english:''});
  lastUserBubble = bubble('user', text);
  $('description').value = '';
  if (ai) await interpret();
  else {
    valid = true;
    invalidate();
    bubble('assistant', 'I’ve kept your words. Without AI, I can’t translate them, but you can mark the body and write an English description on the next step.');
    updateNavigation();
  }
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('statement').value); notice('Statement copied.'); }
  catch { notice('Select the statement and copy it manually.'); }
};
$('download').onclick = () => {
  const isDental = activeModel() === 'dental';
  const snapshot = isDental ? dental()?.snapshot() : painter()?.snapshot();
  const original = translations.map(item => `${item.original}\n${item.english ? 'English: '+item.english : '(Not translated)'}`).join('\n\n');
  const modelCredit = isDental && snapshot ? '<p><small>Dental anatomy: BodyParts3D / Anatomography © DBCLS, via OrganUI. Adapted geometry and materials. <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en">CC BY-SA 2.1 Japan</a>. The dental model image is shared under the same license.</small></p>' : '';
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>My symptom notes</title><style>body{font:17px/1.7 system-ui;max-width:900px;margin:40px auto;padding:24px;color:#294339}article{display:flex;gap:24px}p{white-space:pre-wrap}img{width:280px;object-fit:contain}small{color:#68776d}</style><h1>My symptom notes</h1><small>Patient-reviewed communication aid · Not a diagnosis</small><article><div><h2>My statement</h2><p>${escapeHTML($('statement').value)}</p><h2>Marked locations</h2><p>${escapeHTML(locationLabels().join(', ') || 'Not specified')}</p><h2>My original words & translations</h2><p dir="auto">${escapeHTML(original)}</p></div>${snapshot ? `<img alt="${isDental ? 'Patient-selected dental locations' : 'Patient-annotated body'}, current view" src="${snapshot}">` : '<p>Model image unavailable.</p>'}</article>${modelCredit}</html>`;
  const url = URL.createObjectURL(new Blob([html], {type:'text/html'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'my-symptom-notes.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('Notes downloaded, including your original words and their translations.');
};
// --- Personal history (this browser only; full view in history.html) ---
let historyId = null;
function historyCount() {
  const count = loadHistory().length;
  $('history-count').textContent = String(count);
  $('history-count').hidden = !count;
}
$('open-history').onclick = event => {
  if (messages.length && !historyId && !window.confirm('Open your history? Your current description hasn’t been saved and will be cleared.')) event.preventDefault();
};
$('save-history').onclick = async () => {
  const isDental = activeModel() === 'dental';
  let image = '';
  try { image = await thumbnail(isDental ? dental()?.snapshot() : painter()?.snapshot()); } catch {}
  const record = createRecord({
    id: historyId,
    statement: $('statement').value,
    locations: locationLabels(),
    areas: [...regions.map(r => regionLabel(r.region)), ...((dental()?.getState().selections || []).length ? ['teeth & gums'] : [])],
    originals: translations,
    model: isDental ? 'dental' : 'body',
    image,
  });
  try {
    const updating = Boolean(historyId);
    saveRecord(record);
    historyId = record.id;
    historyCount();
    notice(updating ? 'History entry updated.' : 'Saved to your history on this device.');
  } catch {
    notice('Couldn’t save to history. Your browser may block storage (for example in private browsing).');
  }
};
historyCount();

function configureMode() {
  $('use-manual').hidden = !ai;
  $('connection').textContent = ai ? 'AI translation' : 'Manual mode';
  $('consent-row').hidden = !ai;
  $('fields').hidden = ai;
  $('review-note').hidden = ai;
  $('review-note').textContent = 'Enter the description in English. Manual mode does not translate.';
  $('privacy').textContent = ai ? 'Unsaved notes clear on refresh.' : 'Manual mode does not translate. Unsaved notes clear on refresh.';
}
$('use-manual').onclick = () => {
  if (busy) return;
  ai = false;
  if (interpretationFailed) {
    // Do not pass a stale interpretation off as the translation of new input.
    $('review-english').value = '';
    for (const key of Object.keys(details)) { details[key] = ''; $(`field-${key}`).value = ''; }
    regions = [];
    dentalReport={involved:false,locations:[]};
    selectModel('body');
    renderRegions();
  }
  $('retry').hidden = true;
  valid = messages.some(message => message.role === 'user');
  configureMode();
  updateNavigation();
  notice('Manual mode is on. You can review and enter your own English description.');
};
try {
  const response = await fetch('/api/config', {signal:AbortSignal.timeout(5000)});
  if (response.ok) ai = (await response.json()).ai === true;
} catch {}
configureMode();
setBusy(false);
