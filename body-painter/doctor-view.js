// Shows a translated doctor's reply as key points (used by the doctor page and the pain log).
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const LABELS = {title:'What the doctor said', medications:'Medicines', follow_up:'Follow-up', return_if:'Come back sooner if', other:'Other advice'};

export function doctorPoints(reply) {
  const labels = {...LABELS, ...Object.fromEntries(Object.entries(reply.labels || {}).filter(([, v]) => v))};
  const wrap = el('div', {className:'doctor-points'});
  if (reply.translation) wrap.append(el('p', {className:'doctor-translation', dir:'auto', textContent:reply.translation}));
  const point = (kind, title, body) => wrap.append(el('section', {className:`point ${kind}`}, el('h3', {dir:'auto', textContent:title}), body));
  if (reply.medications?.length) {
    const list = el('ul', {className:'meds'});
    for (const m of reply.medications) list.append(el('li', {dir:'auto'}, el('b', {textContent:m.name}), m.instructions ? ' — ' + m.instructions : ''));
    point('meds', labels.medications, list);
  }
  if (reply.follow_up) point('follow', labels.follow_up, el('p', {dir:'auto', textContent:reply.follow_up}));
  if (reply.return_if) point('warn', labels.return_if, el('p', {dir:'auto', textContent:reply.return_if}));
  if (reply.other) point('other', labels.other, el('p', {dir:'auto', textContent:reply.other}));
  return wrap;
}
