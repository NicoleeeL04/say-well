import test from 'node:test';
import assert from 'node:assert/strict';
import {HISTORY_KEY, loadHistory, createRecord, saveRecord, deleteRecord, clearHistory} from '../body-painter/history.js';

function memoryStorage(limit = Infinity) {
  const data = new Map();
  return {
    getItem: k => data.has(k) ? data.get(k) : null,
    setItem: (k, v) => {
      if (v.length > limit) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
      data.set(k, String(v));
    },
    removeItem: k => data.delete(k),
  };
}

test('saves newest first and keeps records local to the given storage', () => {
  const storage = memoryStorage();
  saveRecord(createRecord({statement: 'Old', locations: ['My left knee'], now: new Date('2026-01-01T10:00:00Z')}), storage);
  saveRecord(createRecord({statement: 'New', locations: [], now: new Date('2026-02-01T10:00:00Z')}), storage);
  const records = loadHistory(storage);
  assert.deepEqual(records.map(r => r.statement), ['New', 'Old']);
  assert.deepEqual(records[1].locations, ['My left knee']);
});

test('saving the same id updates rather than duplicates', () => {
  const storage = memoryStorage();
  const first = createRecord({statement: 'Draft', locations: []});
  saveRecord(first, storage);
  saveRecord(createRecord({id: first.id, statement: 'Final', locations: ['Head']}), storage);
  const records = loadHistory(storage);
  assert.equal(records.length, 1);
  assert.equal(records[0].statement, 'Final');
});

test('delete and clear', () => {
  const storage = memoryStorage();
  const a = createRecord({statement: 'A', locations: []});
  const b = createRecord({statement: 'B', locations: []});
  saveRecord(a, storage); saveRecord(b, storage);
  assert.deepEqual(deleteRecord(a.id, storage).map(r => r.id), [b.id]);
  clearHistory(storage);
  assert.equal(storage.getItem(HISTORY_KEY), null);
  assert.deepEqual(loadHistory(storage), []);
});

test('ignores corrupt storage and rejects non-image data', () => {
  const storage = memoryStorage();
  storage.setItem(HISTORY_KEY, '{not json');
  assert.deepEqual(loadHistory(storage), []);
  assert.equal(createRecord({statement: 'x', locations: [], image: 'javascript:alert(1)'}).image, '');
});

test('when storage is full, drops old pictures but keeps the words', () => {
  const big = 'data:image/jpeg;base64,' + 'A'.repeat(3000);
  const storage = memoryStorage(5000);
  saveRecord(createRecord({statement: 'Old', locations: ['Back'], image: big, now: new Date('2026-01-01')}), storage);
  saveRecord(createRecord({statement: 'New', locations: ['Head'], image: big, now: new Date('2026-02-01')}), storage);
  const [newest, oldest] = loadHistory(storage);
  assert.equal(newest.image, big);
  assert.equal(oldest.image, '');
  assert.equal(oldest.statement, 'Old');
});

import {sampleHistory, patternInsights, monthOfYearCounts, seasonCounts, areaCounts, recordAreas, filterRecords} from '../body-painter/history.js';

test('sample history reveals seasonal patterns by area', () => {
  const records = sampleHistory();
  const insights = patternInsights(records);
  assert.deepEqual(insights.map(i => [i.area, i.season]), [['head', 'Spring'], ['knee', 'Winter']]);
  assert.equal(monthOfYearCounts(records).reduce((a, b) => a + b), records.length);
  assert.equal(seasonCounts(records).reduce((a, s) => a + s.count, 0), records.length);
  assert.deepEqual(areaCounts(records).slice(0, 2).map(a => a.area), ['head', 'knee']);
});

test('areas are inferred from labels on records saved without them', () => {
  assert.deepEqual(recordAreas({locations: ['My left knee', 'Tooth 36 (lower left first molar)', 'lower back (back)']}), ['knee', 'teeth & gums', 'lower back']);
});

test('filters by area, words in any language, and time period', () => {
  const records = sampleHistory();
  assert.equal(filterRecords(records, {area: 'knee'}).length, 4);
  assert.equal(filterRecords(records, {query: '膝盖'}).length, 4);
  assert.equal(filterRecords(records, {sinceDays: 90, now: new Date('2026-11-14')}).length, 3);
});

test('no insight from fewer than three entries', () => {
  assert.deepEqual(patternInsights(sampleHistory().slice(0, 2)), []);
});
