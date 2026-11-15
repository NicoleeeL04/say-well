import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dentalSuggestions,relativeToothPosition} from '../body-painter/dental-regions.js';
const location={jaw:'unspecified',side:'unspecified',area:'unspecified',tooth:0,includesGum:false};
const suggest=patch=>dentalSuggestions({involved:true,locations:[{...location,...patch}]});
test('upper-left back symptoms select only the candidate quadrant',()=>{const r=suggest({jaw:'upper',side:'left',area:'back'});assert.deepEqual(r.selections.map(s=>s.tooth),[24,25,26,27]);assert.equal(r.uncertain,true);});
test('exact FDI tooth with gum does not mark neighboring teeth',()=>{assert.deepEqual(suggest({tooth:46,includesGum:true}).selections,[{tooth:46,includesGum:true}]);});
test('unknown dental location does not select every tooth',()=>{assert.deepEqual(suggest({}).selections,[]);});
test('wisdom tooth never marks a substitute molar',()=>{for(const p of [{tooth:48},{area:'wisdom',jaw:'lower',side:'left'}]){const r=suggest(p);assert.deepEqual(r.selections,[]);assert.equal(r.unsupported,true);}});
test('correction recomputes candidates on the new side only',()=>{assert.ok(suggest({jaw:'lower',side:'right',area:'back'}).selections.every(s=>s.tooth>=44));assert.ok(suggest({jaw:'lower',side:'left',area:'back'}).selections.every(s=>s.tooth>=34&&s.tooth<=37));});

const ordinalText='Since yesterday, my upper left second-to-last tooth and the gum around it have been painful, swollen, and inflamed.';
const ordinalDental={involved:true,locations:[{...location,jaw:'upper',side:'left',area:'back',includesGum:true}]};
test('second-to-last immediately previews only one tooth, explicitly unconfirmed',()=>{
  const r=dentalSuggestions(ordinalDental,{text:ordinalText});
  assert.deepEqual(r.selections,[{tooth:26,includesGum:true}]);
  assert.equal(r.needsCount,true);assert.equal(r.uncertain,true);
});
test('excluding wisdom teeth marks one tooth and its adjacent gum',()=>{
  const r=dentalSuggestions(ordinalDental,{text:ordinalText,countFrom:'model'});
  assert.deepEqual(r.selections,[{tooth:26,includesGum:true}]);assert.equal(r.uncertain,false);
});
test('including a wisdom tooth changes the single selection, not its scope',()=>{
  const r=dentalSuggestions(ordinalDental,{text:ordinalText,countFrom:'wisdom'});
  assert.deepEqual(r.selections,[{tooth:27,includesGum:true}]);
});
test('an explicit counting reference needs no repeated question',()=>{
  for(const [words,tooth] of [['excluding wisdom teeth',26],['including my wisdom tooth',27]]){
    const r=dentalSuggestions(ordinalDental,{text:ordinalText+' '+words});
    assert.deepEqual(r.selections,[{tooth,includesGum:true}]);assert.equal(r.needsCount,false);
  }
});
test('relative descriptions work across English variants and Chinese',()=>{
  for(const text of ['second-last tooth','second to last tooth','second tooth from the back',
    'tooth second from the back','second from the back tooth','second from last tooth','penultimate tooth','last but one tooth','倒数第二颗牙']){
    assert.equal(relativeToothPosition(text).rank,2,text);
  }
});
test('negated, conflicting or unlocalized ordinals never paint a quadrant',()=>{
  for(const text of ['not the second-to-last tooth','last tooth, not the second-to-last tooth']){
    const r=dentalSuggestions(ordinalDental,{text,countFrom:'model'});
    assert.deepEqual(r.selections,[]);assert.equal(r.needsManual,true);
  }
  const r=dentalSuggestions({involved:true,locations:[{...location,area:'back'}]},{text:ordinalText,countFrom:'model'});
  assert.deepEqual(r.selections,[]);assert.equal(r.needsManual,true);
});
test('last tooth including wisdom teeth never substitutes a displayed tooth',()=>{
  const r=dentalSuggestions(ordinalDental,{text:'My last tooth hurts.',countFrom:'wisdom'});
  assert.deepEqual(r.selections,[]);assert.equal(r.unsupported,true);
});
test('reference choice keeps quadrant, tooth-only scope and ordinal corrections',()=>{
  const dental={involved:true,locations:[{...location,jaw:'lower',side:'right',area:'back'}]};
  assert.deepEqual(dentalSuggestions(dental,{text:'My second-to-last tooth hurts.',countFrom:'model'}).selections,[{tooth:46,includesGum:false}]);
  assert.deepEqual(dentalSuggestions(dental,{text:'My third-to-last tooth hurts.',countFrom:'model'}).selections,[{tooth:45,includesGum:false}]);
});

test('an unconfirmed tooth-only preview never adds gum or expands the quadrant',()=>{
  const dental={involved:true,locations:[{...location,jaw:'upper',side:'left',area:'back'}]};
  const r=dentalSuggestions(dental,{text:'My second-to-last upper left tooth hurts.'});
  assert.deepEqual(r.selections,[{tooth:26,includesGum:false}]);assert.equal(r.uncertain,true);
});
test('confirming the displayed reference resolves the provisional status',()=>{
  const before=dentalSuggestions(ordinalDental,{text:ordinalText});
  const after=dentalSuggestions(ordinalDental,{text:ordinalText,countFrom:'model'});
  assert.deepEqual(before.selections,after.selections);
  assert.equal(before.needsCount,true);assert.equal(after.needsCount,false);assert.equal(after.uncertain,false);
});
