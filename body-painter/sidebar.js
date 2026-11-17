// Recent pain log entries in the sidebar of the secondary pages.
import {loadHistory, recordAreas, titleCase} from './history.js';
export const entryTitle = r => titleCase(recordAreas(r)[0] || r.locations[0] || 'Description');
export const shortDate = iso => new Date(iso).toLocaleDateString(undefined, {month:'short', day:'numeric'});
export function renderRecent(list = document.getElementById('recent')) {
  const records = loadHistory();
  list.replaceChildren(...records.slice(0, 6).map(r => {
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), {href:`history.html#${encodeURIComponent(r.id)}`});
    a.append(Object.assign(document.createElement('span'), {className:'r-title', textContent:entryTitle(r)}),
      Object.assign(document.createElement('span'), {className:'r-date', textContent:shortDate(r.savedAt)}));
    li.append(a);
    return li;
  }));
  list.closest('nav').hidden = !records.length;
  return records;
}
