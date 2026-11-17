// Personal symptom history, kept only in this browser's localStorage.
// Nothing here is sent to the server.
export const HISTORY_KEY = 'saywell.history.v1';
export const HISTORY_LIMIT = 200;

const browserStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

export function loadHistory(storage = browserStorage()) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecord).sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : [];
  } catch { return []; }
}

function isRecord(r) {
  return r && typeof r.id === 'string' && typeof r.savedAt === 'string' && typeof r.statement === 'string' && Array.isArray(r.locations);
}

function write(storage, records) {
  if (!storage) throw Error('Saving is not available in this browser.');
  storage.setItem(HISTORY_KEY, JSON.stringify(records));
}

export function createRecord({id, statement, locations, areas, originals, model, image, score, now = new Date()}) {
  const pain = Math.round(Number(score));
  return {
    id: id || `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: now.toISOString(),
    statement: String(statement || '').trim(),
    locations: (locations || []).map(String),
    areas: [...new Set((areas || []).map(a => String(a).toLowerCase()))],
    originals: (originals || []).map(o => ({original: String(o.original || ''), english: String(o.english || '')})),
    model: model === 'dental' ? 'dental' : 'body',
    image: typeof image === 'string' && image.startsWith('data:image/') ? image : '',
    score: pain >= 1 && pain <= 10 ? pain : null,
  };
}

// Saving the same id again replaces that entry (one entry per session).
export function saveRecord(record, storage = browserStorage()) {
  let records = [record, ...loadHistory(storage).filter(r => r.id !== record.id)].slice(0, HISTORY_LIMIT);
  for (;;) {
    try { write(storage, records); return records; }
    catch (error) {
      // Storage full: drop pictures from the oldest entries first, keep the words.
      const withImage = records.findLastIndex(r => r.image && r.id !== record.id);
      if (!/quota/i.test(error.name + error.message) || withImage < 0) throw error;
      records = records.map((r, i) => i === withImage ? {...r, image: ''} : r);
    }
  }
}

export function deleteRecord(id, storage = browserStorage()) {
  const records = loadHistory(storage).filter(r => r.id !== id);
  write(storage, records);
  return records;
}

export function clearHistory(storage = browserStorage()) {
  storage?.removeItem(HISTORY_KEY);
  return [];
}

export function formatWhen(iso, locale) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale, {dateStyle: 'medium', timeStyle: 'short'});
}

export async function thumbnail(dataURL, width = 360) {
  if (!dataURL) return '';
  try {
    const img = new Image();
    img.src = dataURL;
    await img.decode();
    const scale = Math.min(1, width / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch { return ''; }
}

// ---------- Pattern analysis (pure functions, no storage) ----------
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Northern-hemisphere meteorological seasons.
export const SEASONS = [
  {key:'spring', label:'Spring', range:'Mar–May', months:[2,3,4]},
  {key:'summer', label:'Summer', range:'Jun–Aug', months:[5,6,7]},
  {key:'autumn', label:'Autumn', range:'Sep–Nov', months:[8,9,10]},
  {key:'winter', label:'Winter', range:'Dec–Feb', months:[11,0,1]},
];
const AREA_WORDS = ['upper abdomen','lower abdomen','upper back','lower back','upper arm','head','face','neck','chest','abdomen','back','shoulder','forearm','elbow','wrist','hand','hip','thigh','knee','calf','ankle','foot','arm','leg'];

export const seasonOf = date => SEASONS.find(s => s.months.includes(date.getMonth()));
export const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);

// Areas are stored on new records; older ones are inferred from their location labels.
export function recordAreas(record) {
  if (Array.isArray(record.areas) && record.areas.length) return [...new Set(record.areas)];
  const found = new Set();
  for (const label of record.locations || []) {
    const text = label.toLowerCase();
    if (/\btooth\b|\bteeth\b|\bgum\b/.test(text)) { found.add('teeth & gums'); continue; }
    const word = AREA_WORDS.find(w => new RegExp(`\\b${w}\\b`).test(text));
    if (word) found.add(word);
  }
  return [...found];
}

export function filterRecords(records, {area = '', query = '', sinceDays = 0, now = new Date()} = {}) {
  const q = query.trim().toLowerCase();
  const since = sinceDays ? now.getTime() - sinceDays * 864e5 : -Infinity;
  return records.filter(r =>
    (!area || recordAreas(r).includes(area)) &&
    new Date(r.savedAt).getTime() >= since &&
    (!q || [r.statement, ...r.locations, ...r.originals.flatMap(o => [o.original, o.english])].some(t => t.toLowerCase().includes(q))));
}

export function monthOfYearCounts(records) {
  const counts = Array(12).fill(0);
  for (const r of records) counts[new Date(r.savedAt).getMonth()]++;
  return counts;
}

export function seasonCounts(records) {
  return SEASONS.map(s => ({...s, count: records.filter(r => seasonOf(new Date(r.savedAt)) === s).length}));
}

export function areaCounts(records) {
  const counts = new Map();
  for (const r of records) for (const a of recordAreas(r)) counts.set(a, (counts.get(a) || 0) + 1);
  return [...counts].map(([area, count]) => ({area, count})).sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
}

// Plain-language observations. Never a diagnosis: only "when" and "how often".
export function patternInsights(records) {
  const out = [];
  for (const {area, count} of areaCounts(records)) {
    if (count < 3) continue;
    const mine = records.filter(r => recordAreas(r).includes(area));
    const top = seasonCounts(mine).sort((a, b) => b.count - a.count)[0];
    const months = new Set(mine.map(r => { const d = new Date(r.savedAt); return `${d.getFullYear()}-${d.getMonth()}`; }));
    if (top.count / count >= 0.6) {
      out.push({kind:'seasonal', area, count, season: top.label, range: top.range, seasonCount: top.count,
        text: `${titleCase(area)}: ${top.count} of ${count} entries were in ${top.label.toLowerCase()} (${top.range}). This may be a seasonal pattern worth mentioning.`});
    } else if (months.size >= 3) {
      out.push({kind:'recurring', area, count, months: months.size,
        text: `${titleCase(area)}: logged ${count} times across ${months.size} different months. It keeps coming back rather than happening once.`});
    }
  }
  return out;
}

// Sample data for demos and screenshots. Never written to storage.
export function sampleHistory() {
  const items = [
    ['2026-11-03T09:20', ['My left knee'], ['knee'], 'My left knee aches, worse in the morning and when I climb stairs.', '我的左膝盖疼，早上和爬楼梯的时候更严重。'],
    ['2026-10-08T14:05', ['My lower back'], ['lower back'], 'Dull ache in my lower back after a week of midterms at my desk.', '期中考试坐了一周，腰一直隐隐作痛。'],
    ['2026-09-20T19:40', ['Tooth 36 (lower left first molar)'], ['teeth & gums'], 'My lower left back tooth hurts when I drink something cold.', '左下面的后牙喝冷的就疼。'],
    ['2026-04-18T08:10', ['Both sides of my head'], ['head'], 'Headache with a stuffy nose and itchy eyes since this morning.', '从早上开始头疼、鼻塞、眼睛痒。'],
    ['2026-03-09T11:30', ['Both sides of my head', 'My neck'], ['head', 'neck'], 'Sore throat and a headache, sneezing a lot whenever I am outside.', '嗓子疼、头疼，在外面一直打喷嚏。'],
    ['2026-02-02T10:45', ['My left knee'], ['knee'], 'My left knee hurts again and feels stiff in the cold mornings.', '左膝盖又疼了，天冷的早上特别僵。'],
    ['2026-01-14T16:20', ['My left knee', 'My lower back'], ['knee', 'lower back'], 'My left knee is painful after walking across campus, and my lower back is sore from my backpack.', '在学校走了一圈左膝盖就疼，背书包腰也酸。'],
    ['2025-12-11T09:00', ['My left knee'], ['knee'], 'Sharp pain on the inside of my left knee when the weather turns cold.', '天一冷左膝盖内侧就刺痛。'],
    ['2025-05-06T13:15', ['Both sides of my head'], ['head'], 'Pounding headache and itchy, watery eyes on high-pollen days.', '花粉多的时候头一跳一跳地疼，眼睛又痒又流泪。'],
    ['2025-04-22T18:30', ['Both sides of my head'], ['head'], 'Pressing headache on both sides, with sneezing and watery eyes.', '我两边头都胀痛，打喷嚏，眼睛流泪。'],
  ];
  const scores = [6, 4, 7, 5, 4, 5, 6, 7, 6, 5];
  return items.map(([when, locations, areas, statement, original], i) =>
    createRecord({id:`sample-${i}`, statement, locations, areas, score: scores[i], originals:[{original, english:statement}], now:new Date(when)}));
}
