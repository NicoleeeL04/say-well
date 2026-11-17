import {loadProfile, saveProfile, profileRows, PROFILE_FIELDS} from './profile.js';
import {renderRecent} from './sidebar.js';

const $ = id => document.getElementById(id);
const notice = text => { $('notice').textContent = text; $('notice').hidden = !text; };
const form = $('card-form');
const keys = Object.keys(PROFILE_FIELDS);

function current() { return {...Object.fromEntries(keys.map(k => [k, $(k).value])), include:$('include').checked}; }
function fill(p) { for (const k of keys) $(k).value = p[k]; $('include').checked = p.include; preview(); }
function preview() {
  const p = current();
  const rows = profileRows({...p, ...Object.fromEntries(keys.map(k => [k, p[k].trim()]))});
  $('preview').replaceChildren(...rows.map(([k, v]) => {
    const row = Object.assign(document.createElement('div'), {className:'fact from-card'});
    row.append(Object.assign(document.createElement('dt'), {textContent:k}), Object.assign(document.createElement('dd'), {textContent:v}));
    return row;
  }));
  $('preview-empty').hidden = rows.length > 0;
  $('preview-empty').textContent = p.include ? 'Nothing will be added yet.' : 'Turned off: nothing is added to your notes.';
}
form.addEventListener('input', preview);
form.onsubmit = event => {
  event.preventDefault();
  try { fill(saveProfile(current())); notice('Saved on this device.'); }
  catch { notice('Couldn’t save. Your browser may block storage, for example in private browsing.'); }
};
$('clear').onclick = () => {
  if (!confirm('Clear your medical card on this device?')) return;
  try { fill(saveProfile({})); notice('Card cleared.'); } catch {}
};
fill(loadProfile());
renderRecent();
