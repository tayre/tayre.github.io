import test from 'node:test';
import assert from 'node:assert/strict';
import { FACT_TOPICS, FACTS } from './facts-data.js';

test('the library has two topics with enough questions for a full round', () => {
  assert.deepEqual(FACT_TOPICS.map(({ id }) => id), ['geography', 'science']);
  let total = 0;
  for (const topic of FACT_TOPICS) {
    assert.ok(topic.name.trim());
    assert.ok(topic.description.trim());
    const count = FACTS.filter((fact) => fact.topic === topic.id).length;
    assert.ok(count >= 10, topic.id);
    total += count;
  }
  assert.equal(total, FACTS.length);
});

test('questions have stable unique IDs and four distinct choices with one answer', () => {
  assert.equal(new Set(FACTS.map(({ id }) => id)).size, FACTS.length);
  assert.equal(new Set(FACTS.map(({ question }) => question)).size, FACTS.length);
  for (const fact of FACTS) {
    assert.match(fact.id, /^(geo|sci)-[a-z]+(?:-[a-z]+)*$/);
    assert.ok(FACT_TOPICS.some(({ id }) => id === fact.topic), fact.id);
    for (const field of ['question', 'answer', 'hint', 'explanation']) {
      assert.equal(typeof fact[field], 'string', `${fact.id}.${field}`);
      assert.ok(fact[field].trim().length > 0, `${fact.id}.${field}`);
    }
    assert.equal(fact.choices.length, 4, fact.id);
    assert.ok(fact.choices.every((choice) => typeof choice === 'string' && choice.trim()), fact.id);
    assert.equal(new Set(fact.choices.map((choice) => choice.toLocaleLowerCase())).size, 4, fact.id);
    assert.equal(fact.choices.filter((choice) => choice === fact.answer).length, 1, fact.id);
    assert.notEqual(fact.hint, fact.explanation, fact.id);
  }
});

test('every teaching fact has a named HTTPS source from the verified source collection', () => {
  const hosts = new Set([
    'www.canada.ca', 'data.un.org', 'spaceplace.nasa.gov', 'www.nasa.gov',
    'www.usgs.gov', 'web.extension.illinois.edu', 'spacemath.gsfc.nasa.gov',
    'www.eia.gov', 'www.nidcd.nih.gov', 'www.nhlbi.nih.gov', 'www.nps.gov',
  ]);
  for (const fact of FACTS) {
    assert.ok(fact.source.title.trim(), fact.id);
    const url = new URL(fact.source.url);
    assert.equal(url.protocol, 'https:', fact.id);
    assert.ok(hosts.has(url.hostname), `${fact.id}: ${url.hostname}`);
    assert.ok(url.pathname.length > 1, fact.id);
  }
});

test('all ten Canadian provinces have exactly one correctly paired capital', () => {
  const provinces = [
    ['geo-alberta', 'Alberta', 'Edmonton'],
    ['geo-british-columbia', 'British Columbia', 'Victoria'],
    ['geo-manitoba', 'Manitoba', 'Winnipeg'],
    ['geo-new-brunswick', 'New Brunswick', 'Fredericton'],
    ['geo-newfoundland-and-labrador', 'Newfoundland and Labrador', 'St. John’s'],
    ['geo-nova-scotia', 'Nova Scotia', 'Halifax'],
    ['geo-ontario', 'Ontario', 'Toronto'],
    ['geo-prince-edward-island', 'Prince Edward Island', 'Charlottetown'],
    ['geo-quebec', 'Quebec', 'Quebec City'],
    ['geo-saskatchewan', 'Saskatchewan', 'Regina'],
  ];
  assert.equal(provinces.length, 10);
  const tagged = FACTS.filter((fact) => fact.region === 'canada-provinces');
  assert.equal(tagged.length, 10);
  assert.deepEqual(new Set(tagged.map((fact) => fact.id)), new Set(provinces.map(([id]) => id)));
  for (const [id, province, answer] of provinces) {
    const matches = FACTS.filter((fact) => fact.question === `What is the capital of ${province}?`);
    assert.equal(matches.length, 1, province);
    assert.equal(matches[0].id, id, province);
    assert.equal(matches[0].topic, 'geography', province);
    assert.equal(matches[0].region, 'canada-provinces', province);
    assert.equal(matches[0].answer, answer, province);
    assert.equal(matches[0].source.url, 'https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/discover-canada/read-online/canadas-regions.html', province);
  }
});

test('Canada’s national capital and the world capitals stay correctly paired', () => {
  const capitals = {
    'geo-canada': 'Ottawa',
    'geo-united-kingdom': 'London', 'geo-france': 'Paris', 'geo-japan': 'Tokyo',
    'geo-australia': 'Canberra', 'geo-italy': 'Rome', 'geo-spain': 'Madrid',
    'geo-egypt': 'Cairo', 'geo-india': 'New Delhi', 'geo-brazil': 'Brasilia',
    'geo-united-states': 'Washington, D.C.',
  };
  for (const [id, answer] of Object.entries(capitals)) {
    assert.equal(FACTS.find((fact) => fact.id === id)?.answer, answer, id);
  }
});
