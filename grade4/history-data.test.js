import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_FACTS } from './history-data.js';

test('Canadian history has twelve distinct questions and answers with four unambiguous choices', () => {
  assert.equal(HISTORY_FACTS.length, 12);
  for (const field of ['id', 'question', 'answer']) {
    assert.equal(new Set(HISTORY_FACTS.map((fact) => fact[field])).size, HISTORY_FACTS.length, field);
  }
  for (const fact of HISTORY_FACTS) {
    assert.match(fact.id, /^hist-[a-z]+(?:-[a-z]+)*$/);
    assert.equal(fact.topic, 'history', fact.id);
    for (const field of ['question', 'answer', 'hint', 'explanation']) {
      assert.equal(typeof fact[field], 'string', `${fact.id}.${field}`);
      assert.ok(fact[field].trim(), `${fact.id}.${field}`);
    }
    assert.equal(fact.choices.length, 4, fact.id);
    assert.ok(fact.choices.every((choice) => typeof choice === 'string' && choice.trim()), fact.id);
    assert.equal(new Set(fact.choices.map((choice) => choice.toLocaleLowerCase())).size, 4, fact.id);
    assert.equal(fact.choices.filter((choice) => choice === fact.answer).length, 1, fact.id);
    assert.notEqual(fact.hint, fact.explanation, fact.id);
  }
});

test('Canadian history uses named HTTPS Government of Canada or Parks Canada sources', () => {
  const allowedHosts = new Set(['www.canada.ca', 'parks.canada.ca']);
  for (const fact of HISTORY_FACTS) {
    assert.ok(fact.source.title.trim(), fact.id);
    const url = new URL(fact.source.url);
    assert.equal(url.protocol, 'https:', fact.id);
    assert.ok(allowedHosts.has(url.hostname), fact.id);
    assert.ok(url.pathname.length > 1, fact.id);
  }
});

test('key Canadian history answers and contextual dates stay correctly paired', () => {
  const expected = {
    'hist-first-peoples': 'First Nations and Inuit peoples',
    'hist-confederation': '1867',
    'hist-first-four-provinces': 'New Brunswick',
    'hist-canada-day': 'July 1',
    'hist-name-canada': 'A village or settlement',
    'hist-fur-trade': 'Beaver',
    'hist-champlain': 'Samuel de Champlain',
    'hist-railway': '1885',
    'hist-maple-leaf-flag': '1965',
    'hist-nunavut': 'Nunavut',
    'hist-newfoundland': '1949',
    'hist-charter': 'People’s rights and freedoms',
  };
  const byId = new Map(HISTORY_FACTS.map((fact) => [fact.id, fact]));
  for (const [id, answer] of Object.entries(expected)) assert.equal(byId.get(id)?.answer, answer, id);
  for (const province of ['Ontario', 'Quebec', 'Nova Scotia', 'New Brunswick']) {
    assert.ok(byId.get('hist-first-four-provinces').explanation.includes(province), province);
  }
  assert.match(byId.get('hist-champlain').question, /1608/);
  assert.match(byId.get('hist-nunavut').question, /April 1, 1999/);
  assert.match(byId.get('hist-charter').explanation, /1982/);
});
