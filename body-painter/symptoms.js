export const REGIONS = ['head','neck','chest','abdomen','back','shoulder','arm','hand','hip','leg','knee','foot'];
export const FIELDS = {symptom:'What does it feel like?',onset:'When did it start?',severity:'How intense is it? (your words)',pattern:'Constant or comes and goes?',triggers:'What makes it better or worse?',associated:'Anything else you’ve noticed?'};
export function statementFor(details, regions) {
 const location=regions.map(r=>`${r.side==='unspecified'?'':r.side==='both'?'both sides of my ':`my ${r.side} `}${r.region}`).join(', ');
 const lines=[details.symptom?`I am experiencing ${details.symptom}${location?` in ${location}`:''}.`:location?`I have symptoms in ${location}.`:'I would like help describing my symptoms.'];
 for(const [key,prefix] of Object.entries({onset:'It started',severity:'The intensity is',pattern:'The pattern is',triggers:'What affects it',associated:'Other symptoms or details'}))if(details[key]?.trim())lines.push(`${prefix}: ${details[key].trim()}.`);
 return lines.join(' ');
}
export function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
