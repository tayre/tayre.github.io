import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalGameRepository, LIBRARY_KEY, LEGACY_KEY, identifyGame, validGame } from './storage.js';
import { newGame } from './engine.js';

function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
function scoredGame(away = 'Blue Jays', home = 'Yankees') {
  const game = identifyGame(newGame(away, home));
  game.events.push({ kind: 'plate', code: 'HR', hit: true, moves: [{ from: 'batter', to: 4 }] });
  return game;
}

test('legacy game migrates with its plays and keeps its recovery copy', async () => {
  const storage = memoryStorage(), game = newGame();
  game.events = scoredGame().events;
  const original = JSON.stringify(game);
  storage.setItem(LEGACY_KEY, original);
  const repository = await new LocalGameRepository(storage).initialize();
  assert.deepEqual((await repository.getActiveGame()).events, game.events);
  assert.equal((await repository.listGames()).length, 1);
  assert.equal(storage.getItem(LEGACY_KEY), original);
  assert.ok(storage.getItem(LIBRARY_KEY));
});

test('starting and resuming games preserves every game across reloads', async () => {
  const storage = memoryStorage(), repository = await new LocalGameRepository(storage).initialize();
  const first = scoredGame(), second = scoredGame('Dodgers', 'Mets');
  first.finished = true;
  await repository.saveGame(first); await repository.saveGame(second); await repository.setActiveGame(first.id);
  const reloaded = await new LocalGameRepository(storage).initialize();
  assert.equal((await reloaded.listGames()).length, 2);
  assert.equal((await reloaded.getActiveGame()).id, first.id);
  assert.equal((await reloaded.getActiveGame()).finished, true);
  assert.deepEqual((await reloaded.getGame(second.id)).events, second.events);
});

test('saving the same game updates it without duplicating it', async () => {
  const repository = await new LocalGameRepository(memoryStorage()).initialize();
  const game = scoredGame();
  await repository.saveGame(game); game.events = []; await repository.saveGame(game);
  assert.equal((await repository.listGames()).length, 1);
  assert.equal((await repository.getActiveGame()).events.length, 0);
});

test('favourite team defaults to Jays and survives changes', async () => {
  const storage = memoryStorage(), repository = await new LocalGameRepository(storage).initialize();
  assert.equal((await repository.getPreferences()).favoriteTeam, 141);
  await repository.setPreferences({ favoriteTeam: 119 });
  const reloaded = await new LocalGameRepository(storage).initialize();
  assert.equal((await reloaded.getPreferences()).favoriteTeam, 119);
});

test('export includes all games, stable IDs, preferences, and replayable events', async () => {
  const repository = await new LocalGameRepository(memoryStorage()).initialize();
  const game = scoredGame(); await repository.saveGame(game);
  const exported = await repository.exportAll();
  assert.equal(exported.version, 2); assert.equal(exported.games[0].id, game.id);
  assert.ok(validGame(exported.games[0])); assert.equal(exported.preferences.favoriteTeam, 141);
  const restoredStorage = memoryStorage(); restoredStorage.setItem(LIBRARY_KEY, JSON.stringify(exported));
  const restored = await new LocalGameRepository(restoredStorage).initialize();
  assert.deepEqual((await restored.getActiveGame()).events, game.events);
});

test('quota failures preserve the last saved library', async () => {
  const storage = memoryStorage(), repository = await new LocalGameRepository(storage).initialize();
  const game = scoredGame(); await repository.saveGame(game);
  const before = storage.getItem(LIBRARY_KEY);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(repository.saveGame(scoredGame('Mets', 'Dodgers')));
  assert.equal(storage.getItem(LIBRARY_KEY), before);
  assert.equal((await repository.listGames()).length, 1);
});

test('corrupt saves are not overwritten and remain available for recovery', async () => {
  const storage = memoryStorage(); storage.setItem(LIBRARY_KEY, '{broken');
  const repository = await new LocalGameRepository(storage).initialize();
  assert.ok(repository.readError);
  await assert.rejects(repository.saveGame(scoredGame()));
  assert.equal(await repository.recoveryData(), '{broken');
});

test('invalid event histories are rejected', () => {
  const game = scoredGame();
  game.events.push({ kind: 'plate', code: '1B', moves: [{ from: '2', to: 3 }] });
  assert.equal(validGame(game), false);
});
