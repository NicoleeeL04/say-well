import {loadHistory, deleteRecord, clearHistory, formatWhen, sampleHistory, recordAreas, areaCounts, patternInsights, titleCase} from './history.js';
import {escapeHTML} from './symptoms.js';
import {doctorPoints} from './doctor-view.js';

const $ = id => document.getElementById(id);
const demo = new URLSearchParams(location.search).has('demo');
let all = demo ? sampleHistory() : loadHistory();
let range = 'year', focus = '';
const DAY = 864e5;
const PAIN = ['#F6C38E','#F4B484','#F3A47B','#F29573','#F0866C','#EE7766','#E8604F','#DB4B3E','#C93A33','#B52B2B'];
const painColor = score => score ? PAIN[score - 1] : '#8FA0B3';
const short = iso => new Date(iso).toLocaleDateString(undefined, {month:'short', day:'numeric'});
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

$('demo-banner').hidden = !demo;

// Approximate spots on a front-facing figure (viewer's left = the person's right).
const SPOTS = {
  head:[[100,34]], face:[[100,44]], neck:[[100,72]], 'teeth & gums':[[100,52]],
  shoulder:[[62,92],[138,92]], chest:[[100,118]], abdomen:[[100,168]], 'upper abdomen':[[100,150]], 'lower abdomen':[[100,188]],
  back:[[100,140]], 'upper back':[[100,120]], 'lower back':[[100,190]],
  arm:[[46,150],[154,150]], 'upper arm':[[48,130],[152,130]], elbow:[[44,168],[156,168]], forearm:[[40,196],[160,196]],
  wrist:[[38,224],[162,224]], hand:[[36,244],[164,244]], hip:[[78,222],[122,222]],
  leg:[[82,300],[118,300]], thigh:[[82,272],[118,272]], knee:[[82,330],[118,330]], calf:[[82,370],[118,370]], ankle:[[82,408],[118,408]], foot:[[80,428],[120,428]],
};
const FIGURE = `<path d="M100 10a24 24 0 1 1 0 48a24 24 0 1 1 0-48zM90 58h20v16H90zM66 76h68q14 0 16 14l16 150q2 12-8 12t-12-10L136 132v100q0 8-4 12l-4 182q0 14-12 14t-12-14l-4-150-4 150q0 14-12 14t-12-14l-4-182q-4-4-4-12V132L44 242q-2 10-12 10t-8-12L40 90q2-14 16-14z"/>`;
function sideOf(record, area) {
  const label = record.locations.find(l => l.toLowerCase().includes(area.split(' ').at(-1))) || '';
  return /\bboth\b/i.test(label) ? 'both' : /\bleft\b/i.test(label) ? 'left' : /\bright\b/i.test(label) ? 'right' : 'both';
}
function renderHeat(records) {
  const counts = new Map();
  for (const r of records) for (const area of recordAreas(r)) {
    const spots = SPOTS[area]; if (!spots) continue;
    const side = spots.length === 1 ? 'mid' : sideOf(r, area);
    const chosen = spots.length === 1 ? [spots[0]] : side === 'right' ? [spots[0]] : side === 'left' ? [spots[1]] : spots;
    for (const [x, y] of chosen) { const key = `${x},${y}`; counts.set(key, (counts.get(key) || 0) + 1); }
  }
  const max = Math.max(1, ...counts.values());
  const glows = [...counts].map(([key, n]) => {
    const [x, y] = key.split(',').map(Number), r = 10 + 18 * n / max;
    return `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="url(#heat)" opacity="${(.55 + .45 * n / max).toFixed(2)}"/>`;
  }).join('');
  const summary = areaCounts(records).map(a => `${a.area} ${a.count}`).join(', ');
  $('heat-figure').innerHTML = `<svg viewBox="0 0 200 450" role="img" aria-label="Body heat map: ${escapeHTML(summary)}"><defs><radialGradient id="heat"><stop offset="0" stop-color="#FF7A55" stop-opacity=".95"/><stop offset=".55" stop-color="#FF7A55" stop-opacity=".35"/><stop offset="1" stop-color="#FF7A55" stop-opacity="0"/></radialGradient></defs><g class="figure">${FIGURE}</g>${glows}</svg>`;
  $('heat-legend').replaceChildren(...areaCounts(records).slice(0, 5).map(({area, count}) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(focus === area));
    b.innerHTML = `<span>${escapeHTML(titleCase(area))}</span><b>${count}×</b>`;
    b.onclick = () => { focus = area; render(); };
    li.append(b); return li;
  }));
}

function timeRange(records) {
  const now = Date.now();
  if (range === 'year') return [now - 365 * DAY, now + 8 * DAY];
  const first = Math.min(now - 90 * DAY, ...records.map(r => new Date(r.savedAt).getTime()));
  return [first - (now - first) * .03, now + (now - first) * .02];
}
function renderLanes(records) {
  const [start, end] = timeRange(records);
  const x = t => ((t - start) / (end - start) * 100).toFixed(2);
  const inRange = records.filter(r => { const t = new Date(r.savedAt).getTime(); return t >= start && t <= end; });
  const lanes = areaCounts(all).slice(0, 6);
  $('lanes').replaceChildren(...lanes.map(({area}) => {
    const mine = inRange.filter(r => recordAreas(r).includes(area));
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'lane';
    row.setAttribute('aria-pressed', String(focus === area));
    row.setAttribute('aria-label', `${titleCase(area)}: ${plural(mine.length, 'entry')} in this range. Show its entries.`);
    const dots = mine.map(r => {
      const size = 10 + (r.score || 5) * 1.6;
      return `<i style="left:${x(new Date(r.savedAt).getTime())}%;width:${size}px;height:${size}px;background:${painColor(r.score)}" title="${escapeHTML(short(r.savedAt))}${r.score ? ' · ' + r.score + '/10' : ''}"></i>`;
    }).join('');
    row.innerHTML = `<span class="lane-name"><b>${escapeHTML(titleCase(area))}</b><small>${plural(mine.length, 'time')}</small></span><span class="track"><span class="today" style="left:${x(Date.now())}%"></span>${dots}</span>`;
    row.onclick = () => { focus = area; render(); };
    return row;
  }));
  const ticks = [];
  const s = new Date(start), e = new Date(end);
  if (range === 'year') {
    for (let d = new Date(s.getFullYear(), s.getMonth() + 1, 1); d < e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1))
      ticks.push([d, d.getMonth() === 0 ? String(d.getFullYear()) : d.toLocaleDateString(undefined, {month:'short'})]);
  } else {
    const years = e.getFullYear() - s.getFullYear();
    for (let d = new Date(s.getFullYear(), s.getMonth() < 6 ? 6 : 12, 1); d < e; d = new Date(d.getFullYear(), d.getMonth() + (years > 3 ? 12 : 6), 1))
      ticks.push([d, d.getMonth() === 0 ? String(d.getFullYear()) : d.toLocaleDateString(undefined, {month:'short'})]);
  }
  $('ticks').innerHTML = ticks.map(([d, label], i) => `<span class="${i % 2 ? 'odd' : ''}" style="left:${x(d.getTime())}%">${escapeHTML(label)}</span>`).join('');
}

function renderPattern(records) {
  const insights = patternInsights(records);
  const mine = insights.find(i => i.area === focus) || insights[0];
  const entries = records.filter(r => recordAreas(r).includes(focus));
  let text;
  if (mine) text = mine.text;
  else if (entries.length >= 2) {
    const times = entries.map(r => new Date(r.savedAt).getTime()).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => (t - times[i]) / DAY).sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    const gap = median < 14 ? `${Math.round(median)} days` : median < 60 ? `${Math.round(median / 7)} weeks` : `${Math.round(median / 30)} months`;
    text = `${titleCase(focus)}: ${plural(entries.length, 'entry')}, usually about ${gap} apart. A pattern shows up after 3 entries.`;
  } else text = 'One entry so far. Patterns show up after 3 entries for the same area.';
  $('pattern-text').textContent = text;
}

function entryItem(r) {
  const li = document.createElement('li');
  li.className = 'entry';
  li.id = `entry-${r.id}`;
  const d = new Date(r.savedAt);
  li.innerHTML = `<div class="when"><small>${escapeHTML(d.toLocaleDateString(undefined, {month:'short'}))}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}</small><b>${d.getDate()}</b></div>
    <div class="what"><b>${escapeHTML(r.locations.join(' · ') || titleCase(recordAreas(r)[0] || 'Description'))}</b><p>${escapeHTML(r.statement || '')}</p></div>
    ${r.score ? `<span class="badge" style="background:${painColor(r.score)}">${r.score}</span>` : '<span></span>'}`;
  const more = document.createElement('details');
  more.innerHTML = `<summary>More</summary>`;
  const body = document.createElement('div');
  body.className = 'more';
  if (r.image) body.append(Object.assign(document.createElement('img'), {src:r.image, alt:`Markings saved ${formatWhen(r.savedAt)}`}));
  const text = document.createElement('div');
  text.append(Object.assign(document.createElement('p'), {className:'when-full', textContent:formatWhen(r.savedAt)}));
  if (r.originals.length) text.append(Object.assign(document.createElement('p'), {dir:'auto', className:'orig', textContent:r.originals.map(o => o.original).join('\n')}));
  if (r.doctor) {
    const box = Object.assign(document.createElement('section'), {className:'entry-doctor'});
    box.append(Object.assign(document.createElement('h4'), {textContent:'Doctor’s reply'}), Object.assign(document.createElement('p'), {className:'orig', textContent:r.doctor.text}));
    if (r.doctor.translation) box.append(doctorPoints(r.doctor));
    text.append(box);
  }
  if (!demo) {
    text.append(Object.assign(document.createElement('a'), {className:'text-button', href:`doctor.html#${encodeURIComponent(r.id)}`, textContent:r.doctor ? 'Update the doctor’s reply' : 'Add what the doctor said'}));
    const del = Object.assign(document.createElement('button'), {type:'button', className:'text-button danger', textContent:'Delete this entry'});
    del.onclick = () => { if (confirm(`Delete the entry from ${formatWhen(r.savedAt)}? This can’t be undone.`)) { all = deleteRecord(r.id); render(); renderRecent(); } };
    text.append(del);
  }
  body.append(text);
  more.append(body);
  li.append(more);
  return li;
}
function renderEntries(records) {
  const list = focus ? records.filter(r => recordAreas(r).includes(focus)) : records;
  $('entries-title').textContent = focus ? `${titleCase(focus)} · entries` : 'Entries';
  $('entries').replaceChildren(...list.map(entryItem));
  $('clear').hidden = demo;
}

function renderRecent() {
  const records = demo ? [] : loadHistory();
  $('recent').replaceChildren(...records.slice(0, 6).map(r => {
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), {href:`#${encodeURIComponent(r.id)}`});
    a.append(Object.assign(document.createElement('span'), {className:'r-title', textContent:titleCase(recordAreas(r)[0] || r.locations[0] || 'Description')}),
      Object.assign(document.createElement('span'), {className:'r-date', textContent:short(r.savedAt)}));
    li.append(a); return li;
  }));
  $('recent').closest('nav').hidden = !records.length;
}

function render() {
  $('empty').hidden = all.length > 0;
  $('content').hidden = !all.length;
  $('range').hidden = !all.length;
  if (!all.length) return;
  const areas = areaCounts(all).map(a => a.area);
  if (!areas.includes(focus)) focus = areas[0] || '';
  document.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
  renderHeat(all); renderLanes(all); renderPattern(all); renderEntries(all);
}
document.querySelectorAll('[data-range]').forEach(b => b.onclick = () => { range = b.dataset.range; render(); });

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const record = all.find(r => r.id === id);
  if (!record) return;
  focus = recordAreas(record)[0] || focus;
  const t = new Date(record.savedAt).getTime();
  if (t < Date.now() - 365 * DAY) range = 'all';
  render();
  const el = $(`entry-${record.id}`);
  if (el) { el.querySelector('details').open = true; el.scrollIntoView({block:'center'}); el.classList.add('flash'); }
}
addEventListener('hashchange', openFromHash);

$('clear').onclick = () => { if (confirm('Delete your whole pain log from this browser? This can’t be undone.')) { all = clearHistory(); render(); renderRecent(); } };
$('export').onclick = () => {
  const insights = patternInsights(all).map(i => `<li>${escapeHTML(i.text)}</li>`).join('');
  const entries = all.map(r => `<section><h3>${escapeHTML(formatWhen(r.savedAt))}${r.score ? ` · pain ${r.score}/10` : ''}</h3><p><b>Where:</b> ${escapeHTML(r.locations.join(', ') || recordAreas(r).join(', ') || 'Not specified')}</p><p>${escapeHTML(r.statement)}</p>${r.image ? `<img alt="Saved markings" src="${r.image}">` : ''}${r.originals.length ? `<p dir="auto"><small>${escapeHTML(r.originals.map(o => o.original).join('\n'))}</small></p>` : ''}${r.doctor ? `<p><b>Doctor said:</b> ${escapeHTML(r.doctor.text)}</p>${r.doctor.translation ? `<p dir="auto">${escapeHTML(r.doctor.translation)}</p>` : ''}` : ''}</section>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>My pain log</title><style>body{font:16px/1.65 system-ui;max-width:860px;margin:40px auto;padding:24px;color:#12181F}section{border-top:1px solid #e3e7e5;padding:14px 0}p{white-space:pre-wrap}img{width:180px;border-radius:12px;background:#E7ECEA}small{color:#5B6672}</style><h1>My pain log</h1><small>Patient-kept log · Not a diagnosis · ${plural(all.length, 'entry')}</small>${insights ? `<h2>Patterns</h2><ul>${insights}</ul>` : ''}<h2>Entries</h2>${entries}</html>`;
  const url = URL.createObjectURL(new Blob([html], {type:'text/html'}));
  Object.assign(document.createElement('a'), {href:url, download:'my-pain-log.html'}).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
addEventListener('storage', e => { if (!demo && e.key?.startsWith('saywell.history')) { all = loadHistory(); render(); renderRecent(); } });
renderRecent();
render();
openFromHash();
