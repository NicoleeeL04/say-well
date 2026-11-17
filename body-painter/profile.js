// "My medical card": kept only in this browser. Insurance is shown to the
// person but never added to doctor notes or shared images.
export const PROFILE_KEY = 'saywell.profile.v1';
export const PROFILE_FIELDS = {allergies:'Allergies', medications:'Medications', conditions:'Conditions', insurance:'Insurance'};
const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function cleanProfile(p = {}) {
  const out = {include: p.include !== false};
  for (const key of Object.keys(PROFILE_FIELDS)) out[key] = String(p[key] ?? '').trim().slice(0, 1000);
  return out;
}
export function loadProfile(storage = store()) {
  try { return cleanProfile(JSON.parse(storage?.getItem(PROFILE_KEY) || '{}')); } catch { return cleanProfile(); }
}
export function saveProfile(profile, storage = store()) {
  if (!storage) throw Error('Saving is not available in this browser.');
  const clean = cleanProfile(profile);
  storage.setItem(PROFILE_KEY, JSON.stringify(clean));
  return clean;
}
// Rows that go on the note for the doctor.
export function profileRows(profile) {
  if (!profile?.include) return [];
  return ['allergies', 'medications', 'conditions'].filter(k => profile[k]).map(k => [PROFILE_FIELDS[k], profile[k]]);
}
