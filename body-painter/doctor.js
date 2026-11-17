import {loadHistory, attachDoctor} from './history.js';
import {doctorPoints} from './doctor-view.js';
import {renderRecent, entryTitle, shortDate} from './sidebar.js';

const $ = id => document.getElementById(id);
const notice = text => { $('notice').textContent = text; $('notice').hidden = !text; };
let ai = false, busy = false, reply = null;

// ---- language to translate into ----
const LANGUAGES = [['zh', 'Chinese (Simplified)', '中文'], ['zh-TW', 'Chinese (Traditional)', '繁體中文'], ['es', 'Spanish', 'Español'], ['ko', 'Korean', '한국어'], ['ja', 'Japanese', '日本語'],
  ['vi', 'Vietnamese', 'Tiếng Việt'], ['tl', 'Tagalog', 'Tagalog'], ['ar', 'Arabic', 'العربية'], ['fa', 'Persian', 'فارسی'], ['hi', 'Hindi', 'हिन्दी'], ['ru', 'Russian', 'Русский'],
  ['pt', 'Portuguese', 'Português'], ['fr', 'French', 'Français'], ['de', 'German', 'Deutsch'], ['th', 'Thai', 'ไทย'], ['id', 'Indonesian', 'Bahasa Indonesia'], ['en', 'English', 'English (simplify)']];
const LANG_KEY = 'saywell.language.v1';
function preferredLanguage() {
  let code = '';
  try { code = localStorage.getItem(LANG_KEY) || ''; } catch {}
  // An English browser usually still means the patient wants their own language; Chinese is the most common here.
  if (!code && !/^en\b/i.test(navigator.language || '')) code = navigator.language;
  code ||= 'zh';
  const lower = code.toLowerCase();
  if (/^zh-(tw|hk|hant)/.test(lower)) return 'zh-TW';
  return LANGUAGES.find(([c]) => c === lower.split('-')[0])?.[0] || 'zh';
}
$('language').replaceChildren(...LANGUAGES.map(([code, name, native]) => new Option(native === name ? name : `${native} · ${name}`, code)));
$('language').value = preferredLanguage();
$('language').onchange = () => { try { localStorage.setItem(LANG_KEY, $('language').value); } catch {} };
const languageName = () => LANGUAGES.find(([c]) => c === $('language').value)[1];

// ---- voice typing (English) ----
const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
let recognizer = null, listening = false;
if (Recognition) {
  $('listen').hidden = false;
  $('listen').onclick = () => listening ? recognizer.stop() : start();
}
function start() {
  recognizer = new Recognition();
  Object.assign(recognizer, {lang:'en-US', continuous:true, interimResults:true});
  const base = $('doctor-text').value.trim();
  let finalText = '';
  recognizer.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalText += r[0].transcript.trim() + ' '; else interim += r[0].transcript;
    }
    $('doctor-text').value = [base, finalText + interim].filter(Boolean).join(base ? '\n' : '').trim();
    update();
  };
  recognizer.onerror = event => notice(event.error === 'not-allowed' ? 'Microphone access was blocked. You can type instead.' : 'Recording stopped. You can type instead.');
  recognizer.onend = () => setListening(false);
  recognizer.start();
  setListening(true);
}
function setListening(on) {
  listening = on;
  $('listen').setAttribute('aria-pressed', String(on));
  $('listen').classList.toggle('recording', on);
  $('listen-label').textContent = on ? 'Stop' : 'Record';
  $('listen-status').hidden = !on;
  $('listen-status').textContent = on ? 'Listening… speak or hold the phone near the doctor.' : '';
}

// ---- translate ----
function update() { $('translate').disabled = busy || !ai || !$('doctor-text').value.trim(); renderSaveRow(); }
$('doctor-text').addEventListener('input', update);
$('translate').onclick = async () => {
  if (busy) return;
  if (!$('consent').checked) { notice('Tick “Use AI to translate” first.'); $('consent').focus(); return; }
  if (listening) recognizer.stop();
  busy = true; update(); notice('');
  $('thinking').hidden = false;
  try {
    const response = await fetch('/api/doctor', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:$('doctor-text').value.trim(), language:languageName()}), signal:AbortSignal.timeout(65000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Translation is unavailable right now.');
    reply = {...data, text:$('doctor-text').value.trim(), language:languageName()};
    showReply();
  } catch (error) {
    notice(error.name === 'TimeoutError' ? 'That took too long. Try again.' : error.message);
  } finally {
    busy = false; $('thinking').hidden = true; update();
  }
};
function showReply() {
  $('result').className = '';
  $('result').replaceChildren(doctorPoints(reply));
  renderSaveRow();
}

// ---- save with a pain log entry ----
function renderSaveRow() {
  const records = loadHistory();
  const has = Boolean($('doctor-text').value.trim());
  $('save-row').hidden = !has || !records.length;
  if (!records.length) return;
  const wanted = decodeURIComponent(location.hash.slice(1)) || $('attach').value;
  $('attach').replaceChildren(...records.slice(0, 20).map(r => new Option(`${entryTitle(r)} · ${shortDate(r.savedAt)}`, r.id)));
  $('attach').value = records.some(r => r.id === wanted) ? wanted : records[0].id;
}
$('save').onclick = () => {
  const text = $('doctor-text').value.trim();
  if (!text) return;
  const doctor = reply && reply.text === text ? reply : {text, language:languageName()};
  try {
    attachDoctor($('attach').value, doctor);
    notice('Saved with that pain log entry.');
  } catch (error) { notice(error.message || 'Couldn’t save.'); }
};

renderRecent();
renderSaveRow();
try {
  const response = await fetch('/api/config', {signal:AbortSignal.timeout(5000)});
  if (response.ok) ai = (await response.json()).ai === true;
} catch {}
$('consent-row').hidden = !ai;
$('manual-note').hidden = ai;
$('translate').hidden = !ai;
update();
