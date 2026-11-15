import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statementFor,escapeHTML} from '../body-painter/symptoms.js';
test('does not invent missing onset, severity or laterality',()=>{
 const text=statementFor({symptom:'aching pain'},[{region:'knee',side:'unspecified'}]);
 assert.equal(text,'I am experiencing aching pain in knee.');
 assert.ok(!text.includes('left'));assert.ok(!text.includes('intensity'));
});
test('retains negation and patient-reported uncertainty',()=>{
 const text=statementFor({symptom:'possibly a burning sensation',associated:'no nausea'},[{region:'hand',side:'right'}]);
 assert.match(text,/possibly/);assert.match(text,/my right hand/);assert.match(text,/no nausea/);
});
test('export escapes HTML from symptom text',()=>{
 assert.equal(escapeHTML('<script>"x" & \'y\'</script>'),'&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
});
