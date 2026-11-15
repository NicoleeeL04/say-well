import {loadHistory, deleteRecord, clearHistory, formatWhen, sampleHistory, recordAreas, filterRecords,
  monthOfYearCounts, seasonCounts, areaCounts, patternInsights, seasonOf, titleCase, MONTHS} from './history.js';
import {escapeHTML} from './symptoms.js';

const $ = id => document.getElementById(id);
const demo = new URLSearchParams(location.search).has('demo');
let all = demo ? sampleHistory() : loadHistory();
const filters = {area: ''};
const plural = (n, word) => `${n} ${n === 1 ? word : word.endsWith('y') ? word.slice(0, -1) + 'ies' : word + 's'}`;
const monthName = i => new Date(2000, i, 1).toLocaleString(undefined, {month: 'long'});

$('demo-banner').hidden = !demo;

// ---- tooltip shared by both charts ----
function tip(target, text) {
  const show = () => {
    const t = $('tooltip'), r = target.getBoundingClientRect();
    t.textContent = text; t.hidden = false;
    t.style.left = `${Math.min(innerWidth - t.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - t.offsetWidth / 2))}px`;
    t.style.top = `${Math.max(8, r.top - t.offsetHeight - 8)}px`;
  };
  const hide = () => { $('tooltip').hidden = true; };
  target.addEventListener('pointerenter', show); target.addEventListener('pointerleave', hide);
  target.addEventListener('focus', show); target.addEventListener('blur', hide);
}

function renderStats(records) {
  $('stat-total').textContent = records.length;
  const top = areaCounts(records)[0];
  $('stat-area').textContent = top ? top.area : '—';
  const seasons = seasonCounts(records).sort((a, b) => b.count - a.count);
  $('stat-season').textContent = seasons[0]?.count ? seasons[0].label : '—';
}

function renderInsights(records) {
  const insights = patternInsights(records);
  $('stat-patterns').textContent = insights.length;
  const list = $('insight-list');
  list.replaceChildren(...insights.map(i => {
    const li = document.createElement('li'); li.className = 'insight';
    const tag = document.createElement('span'); tag.className = 'insight-tag'; tag.textContent = i.kind === 'seasonal' ? i.season : 'Recurring';
    const p = document.createElement('p');
    p.textContent = i.kind === 'seasonal'
      ? `${titleCase(i.area)} · ${i.seasonCount} of ${i.count} entries`
      : `${titleCase(i.area)} · ${i.count} entries over ${i.months} months`;
    li.append(tag, p); return li;
  }));
  if (!insights.length) {
    const li = document.createElement('li'); li.className = 'insight-none';
    li.textContent = 'No patterns yet.';
    list.append(li);
  }
}

function renderMonths(records) {
  const counts = monthOfYearCounts(records), max = Math.max(1, ...counts);
  const chart = $('month-chart');
  chart.replaceChildren(...counts.map((count, i) => {
    const col = document.createElement('div'); col.className = 'month-col'; col.tabIndex = 0;
    col.setAttribute('aria-label', `${monthName(i)}: ${plural(count, 'entry')}`);
    const value = document.createElement('span'); value.className = 'bar-value'; value.textContent = count === max && count ? count : '';
    const bar = document.createElement('div'); bar.className = `bar${count ? '' : ' zero'}`; bar.style.height = `${count / max * 82}%`;
    col.append(value, bar); tip(col, `${monthName(i)} · ${plural(count, 'entry')}`);
    return col;
  }));
  chart.setAttribute('aria-label', `Entries by month: ${counts.map((c, i) => `${MONTHS[i]} ${c}`).join(', ')}`);
  let labels = chart.nextElementSibling;
  if (!labels?.classList.contains('month-labels')) { labels = document.createElement('div'); labels.className = 'month-labels'; chart.after(labels); }
  labels.replaceChildren(...MONTHS.map(m => Object.assign(document.createElement('span'), {textContent: m[0] + m.slice(1)})));
  const seasons = seasonCounts(records), top = Math.max(...seasons.map(s => s.count));
  $('season-row').replaceChildren(...seasons.map(s => {
    const d = document.createElement('div'); d.className = `season${s.count && s.count === top ? ' top' : ''}`;
    d.innerHTML = `<b>${s.count}</b><span>${s.label}</span>`;
    d.setAttribute('aria-label', `${s.label}, ${plural(s.count, 'entry')}, ${s.range}`); return d;
  }));
  $('month-table').innerHTML = `<caption>Entries by month</caption><tr><th>Month</th><th>Entries</th></tr>${counts.map((c, i) => `<tr><td>${monthName(i)}</td><td>${c}</td></tr>`).join('')}`;
}

function renderAreas(records) {
  const rows = areaCounts(records), max = Math.max(1, ...rows.map(r => r.count));
  $('area-chart').replaceChildren(...rows.map(({area, count}) => {
    const li = document.createElement('li'); li.className = `area-row${filters.area === area ? ' active' : ''}`;
    const b = document.createElement('button'); b.type = 'button';
    b.setAttribute('aria-pressed', String(filters.area === area));
    b.innerHTML = `<span class="area-name">${escapeHTML(area)}</span><span class="area-track"><span class="area-fill" style="display:block;width:${count / max * 100}%"></span></span><span class="area-count">${count}</span>`;
    b.onclick = () => { filters.area = filters.area === area ? '' : area; render(); };
    b.setAttribute('aria-label', `${titleCase(area)}, ${plural(count, 'entry')}. ${filters.area === area ? 'Show all areas' : 'Filter by this area'}`);
    tip(b, `${titleCase(area)} · ${plural(count, 'entry')}${filters.area === area ? ' · click to show all' : ' · click to filter'}`);
    li.append(b); return li;
  }));
  if (!rows.length) $('area-chart').innerHTML = '<li class="insight-none">No body areas marked in these entries.</li>';
}

function entryCard(r) {
  const card = document.createElement('article'); card.className = 'card entry';
  const date = new Date(r.savedAt), when = formatWhen(r.savedAt);
  const media = r.image ? Object.assign(document.createElement('img'), {className: 'entry-thumb', src: r.image, alt: `Markings saved ${when}`}) : null;
  if (!media) card.classList.add('no-image');
  const body = document.createElement('div');
  const head = document.createElement('div'); head.className = 'entry-head';
  head.innerHTML = `<time datetime="${escapeHTML(r.savedAt)}">${escapeHTML(when)}</time><span class="entry-season">${seasonOf(date).label}</span>`;
  if (!demo) {
    const del = document.createElement('button'); del.type = 'button'; del.className = 'text-button danger'; del.textContent = 'Delete';
    del.setAttribute('aria-label', `Delete entry from ${when}`);
    del.onclick = () => { if (confirm(`Delete the entry from ${when}? This can’t be undone.`)) { all = deleteRecord(r.id); render(); } };
    head.append(del);
  }
  const areas = document.createElement('div'); areas.className = 'entry-areas';
  const names = recordAreas(r);
  areas.replaceChildren(...(names.length ? names : ['no specific area']).map(a => Object.assign(document.createElement('span'), {textContent: a})));
  const statement = Object.assign(document.createElement('p'), {className: 'entry-statement', textContent: r.statement || '(No statement)'});
  body.append(head, areas, statement);
  if (r.originals.length || r.locations.length) {
    const more = document.createElement('details');
    more.append(Object.assign(document.createElement('summary'), {textContent: 'Details'}));
    if (r.locations.length) more.append(Object.assign(document.createElement('p'), {className:'entry-locations', textContent:r.locations.join(' · ')}));
    if (r.originals.length) more.append(
      Object.assign(document.createElement('p'), {className: 'entry-original', dir: 'auto', textContent: r.originals.map(o => `${o.original}${o.english && o.english !== o.original ? '\nEnglish: ' + o.english : ''}`).join('\n\n')}));
    body.append(more);
  }
  card.append(...(media ? [media] : []), body);
  return card;
}

function renderTimeline(records) {
  const out = [];
  let current = '';
  for (const r of records) {
    const key = new Date(r.savedAt).toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
    if (key !== current) { current = key; out.push(Object.assign(document.createElement('h3'), {className: 'timeline-month', textContent: key})); }
    out.push(entryCard(r));
  }
  if (!records.length) out.push(Object.assign(document.createElement('p'), {className: 'insight-none', textContent: 'No entries match these filters.'}));
  $('timeline').replaceChildren(...out);
}

function render() {
  $('empty').hidden = all.length > 0;
  $('content').hidden = !all.length;
  if (!all.length) return;
  const areaOptions = areaCounts(all).map(a => a.area);
  if (filters.area && !areaOptions.includes(filters.area)) filters.area = '';
  const shown = filterRecords(all, filters);
  renderStats(shown); renderInsights(shown); renderMonths(shown); renderAreas(shown); renderTimeline(shown);
  $('clear').hidden = demo;
}

$('clear').onclick = () => { if (confirm('Delete all saved history from this browser? This can’t be undone.')) { all = clearHistory(); render(); } };
$('export').onclick = () => {
  const records = filterRecords(all, filters);
  const insights = patternInsights(records).map(i => `<li>${escapeHTML(i.text)}</li>`).join('');
  const entries = records.map(r => `<section><h3>${escapeHTML(formatWhen(r.savedAt))} · ${seasonOf(new Date(r.savedAt)).label}</h3><p><b>Areas:</b> ${escapeHTML(recordAreas(r).join(', ') || 'Not specified')}</p><p>${escapeHTML(r.statement)}</p>${r.image ? `<img alt="Saved markings" src="${r.image}">` : ''}${r.originals.length ? `<p dir="auto"><small>${escapeHTML(r.originals.map(o => o.original).join('\n'))}</small></p>` : ''}</section>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>My symptom history</title><style>body{font:16px/1.65 system-ui;max-width:860px;margin:40px auto;padding:24px;color:#242c3d}section{border-top:1px solid #e6e9ef;padding:14px 0}p{white-space:pre-wrap}img{width:180px;border-radius:8px}small{color:#697386}</style><h1>My symptom history</h1><small>Patient-reviewed communication aid · Not a diagnosis · ${plural(records.length, 'entry')}</small>${insights ? `<h2>Patterns noticed</h2><ul>${insights}</ul>` : ''}<h2>Entries</h2>${entries}</html>`;
  const url = URL.createObjectURL(new Blob([html], {type: 'text/html'}));
  Object.assign(document.createElement('a'), {href: url, download: 'my-symptom-history.html'}).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
addEventListener('storage', e => { if (!demo && e.key?.startsWith('saywell.history')) { all = loadHistory(); render(); } });
render();
