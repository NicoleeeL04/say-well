import {test} from 'node:test';
import assert from 'node:assert/strict';
import {redFlag} from '../body-painter/redflags.js';
import {loadProfile, saveProfile, profileRows} from '../body-painter/profile.js';

const id = (...t) => redFlag(...t)?.id ?? null;
test('emergency combinations are caught in Chinese, English and Spanish', () => {
  assert.equal(id('胸口很闷很疼，喘不过气，左边胳膊也有点麻'), 'chest');
  assert.equal(id('I have chest pain and shortness of breath'), 'chest');
  assert.equal(id('dolor de pecho y no puedo respirar'), 'chest');
  assert.equal(id('早上起来半边脸麻，说话不清'), 'stroke');
  assert.equal(id('This is the worst headache of my life'), 'headache');
  assert.equal(id('吃了花生以后喉咙发紧'), 'allergy');
  assert.equal(id('发烧，脖子很僵'), 'meningitis');
  assert.equal(id('I fainted in class'), 'collapse');
});
test('self-harm is offered 988 first, even alongside other signs', () => {
  const flag = redFlag('我不想活了，胸口也疼，喘不过气');
  assert.equal(flag.id, 'self-harm'); assert.equal(flag.call, '988');
});
test('ordinary symptoms do not raise an alarm', () => {
  for (const t of ['昨天练完腿，右膝盖外侧一抽一抽地疼', 'My chest feels a bit sore after push-ups', 'I have a headache and a stuffy nose', '牙疼，喝冰水更疼', 'My throat is sore', 'I have a fever since yesterday', ''])
    assert.equal(id(t), null, t);
});
test('the English translation can trigger a warning the original wording missed', () => {
  assert.equal(id('Me duele mucho', 'Chest pain and I cannot catch my breath'), 'chest');
});

function memory() { const m = new Map(); return {getItem:k => m.get(k) ?? null, setItem:(k, v) => m.set(k, v)}; }
test('medical card round-trips and never puts insurance on the note', () => {
  const s = memory();
  saveProfile({allergies:' Penicillin (rash) ', medications:'Cetirizine', conditions:'', insurance:'SHIP 123'}, s);
  const p = loadProfile(s);
  assert.equal(p.allergies, 'Penicillin (rash)');
  assert.deepEqual(profileRows(p), [['Allergies', 'Penicillin (rash)'], ['Medications', 'Cetirizine']]);
  assert.deepEqual(profileRows({...p, include:false}), []);
});
test('a broken saved card loads as empty', () => {
  const s = memory(); s.setItem('saywell.profile.v1', '{oops');
  assert.deepEqual(profileRows(loadProfile(s)), []);
});

test('a blocked nose is not an emergency', () => {
  assert.equal(id('I can’t breathe through my nose, stuffy for 3 days'.replace('’', "'")), null);
  assert.equal(id('鼻塞，晚上睡觉有点喘不过气'), null);
});

import {createRecord, saveRecord, attachDoctor, loadHistory} from '../body-painter/history.js';
test('a doctor reply is attached to an entry and survives re-saving it', () => {
  const s = memory();
  const r = createRecord({statement:'Knee pain', locations:['Right knee']});
  saveRecord(r, s);
  attachDoctor(r.id, {text:'Ice it. Come back in 2 weeks.', translation:'冰敷。两周后复诊。', medications:[{name:' ', instructions:'x'}], follow_up:'两周后', labels:{title:'医生说了什么'}}, s);
  const saved = loadHistory(s)[0];
  assert.equal(saved.doctor.follow_up, '两周后');
  assert.deepEqual(saved.doctor.medications, []);
  const again = createRecord({id:r.id, statement:'Knee pain, worse', locations:['Right knee'], doctor:saved.doctor});
  saveRecord(again, s);
  assert.equal(loadHistory(s)[0].doctor.text, 'Ice it. Come back in 2 weeks.');
  assert.throws(() => attachDoctor('missing', {text:'x'}, s));
});
