const tabs = [...document.querySelectorAll('[data-model-tab]')];
const bodyPanel = document.getElementById('body-map-panel');
const dentalPanel = document.getElementById('dental-panel');
const dentalFrame = document.getElementById('dental-model');
let selectedModel = 'body';
let dentalReadOnly = false;
export const activeModel = () => selectedModel;
export const dental = () => dentalFrame.contentWindow?.dentalModel;
export function setDentalReadOnly(value) {
  dentalReadOnly = value;
  dental()?.setReadOnly(value);
}
export function notifyModelVisibility() {
  if (!dentalFrame.hasAttribute('src')) return;
  dentalFrame.contentWindow?.postMessage({
    type: 'volunteerthing:model-visibility',
    visible: !dentalPanel.closest('[hidden]') && !document.hidden,
  }, window.location.origin);
}
export function selectModel(model, focus = false) {
  selectedModel = model;
  const isDental = model === 'dental';
  bodyPanel.hidden = isDental;
  dentalPanel.hidden = !isDental;
  for (const tab of tabs) {
    const selected = tab.dataset.modelTab === model;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  // Keep both documents alive so switching never discards annotations.
  if (isDental && !dentalFrame.hasAttribute('src')) dentalFrame.src = dentalFrame.dataset.src;
  notifyModelVisibility();
  document.dispatchEvent(new Event('modelchange'));
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectModel(tab.dataset.modelTab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectModel(tabs[next].dataset.modelTab, true);
  });
}
dentalFrame.addEventListener('load', () => {
  const doc = dentalFrame.contentDocument;
  doc?.addEventListener('dentalchange', event => document.dispatchEvent(new CustomEvent('dentalchange',{detail:event.detail})));
  doc?.addEventListener('dental-ready', () => {setDentalReadOnly(dentalReadOnly);notifyModelVisibility();});
  setDentalReadOnly(dentalReadOnly);
  notifyModelVisibility();
});
document.addEventListener('visibilitychange', notifyModelVisibility);
