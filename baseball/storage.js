import { derive, validateEvent } from './engine.js';

export const LIBRARY_KEY = 'fieldnotes-library-v2';
export const LEGACY_KEY = 'fieldnotes-game-v1';
const copy = value => JSON.parse(JSON.stringify(value));

export function validGame(game) {
  if (!game || game.version !== 1 || !Array.isArray(game.teams) || game.teams.length !== 2 || !game.teams.every(t => typeof t === 'string')) return false;
  if (!Array.isArray(game.lineups) || game.lineups.length !== 2 || !game.lineups.every(l => Array.isArray(l) && l.length === 9 && l.every(n => typeof n === 'string'))) return false;
  if (!Array.isArray(game.events) || game.events.length > 10000) return false;
  try {
    const replay = { ...game, events: [] };
    for (const event of game.events) {
      if (!['plate', 'runner'].includes(event.kind) || typeof event.code !== 'string' || !Array.isArray(event.moves) || validateEvent(derive(replay), event)) return false;
      replay.events.push(event);
    }
    return true;
  } catch { return false; }
}

export function identifyGame(game, now = new Date().toISOString()) {
  return { ...copy(game), id: game.id || `game-${globalThis.crypto.randomUUID()}`, createdAt: game.createdAt || now, updatedAt: now };
}

// Async repository boundary: the UI does not depend on localStorage. A future
// server adapter can implement the same methods using these stable game IDs.
export class LocalGameRepository {
  constructor(storage) {
    this.storage = storage;
    this.document = { version: 2, activeId: null, preferences: { favoriteTeam: 141 }, games: [] };
    this.readError = null;
  }

  async initialize() {
    try {
      const raw = this.storage.getItem(LIBRARY_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.version !== 2 || !Array.isArray(data.games) || !data.games.every(g => typeof g.id === 'string' && validGame(g)) || new Set(data.games.map(g => g.id)).size !== data.games.length) throw new Error('Invalid game library');
        this.document = data;
        this.document.preferences = { favoriteTeam: 141, ...data.preferences };
      } else {
        const legacy = this.storage.getItem(LEGACY_KEY);
        if (legacy) {
          const game = JSON.parse(legacy);
          if (!validGame(game)) throw new Error('Invalid saved game');
          const migrated = identifyGame(game);
          this.document.games = [migrated];
          this.document.activeId = migrated.id;
          this.storage.setItem(LIBRARY_KEY, JSON.stringify(this.document));
          // Keep the original save as a recovery copy.
        }
      }
    } catch (error) { this.readError = error; }
    return this;
  }

  async listGames() {
    return copy(this.document.games).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async getGame(id) { return copy(this.document.games.find(g => g.id === id) || null); }
  async getActiveGame() { return this.getGame(this.document.activeId); }
  async getPreferences() { return copy(this.document.preferences); }

  async saveGame(game) {
    const saved = identifyGame(game);
    const games = this.document.games.filter(g => g.id !== saved.id);
    games.push(saved);
    this.write({ ...this.document, games, activeId: saved.id });
    return copy(saved);
  }
  async setActiveGame(id) {
    if (!this.document.games.some(g => g.id === id)) throw new Error('Game not found');
    this.write({ ...this.document, activeId: id });
  }
  async setPreferences(patch) {
    this.write({ ...this.document, preferences: { ...this.document.preferences, ...patch } });
  }
  async exportAll() { return { ...copy(this.document), exportedAt: new Date().toISOString() }; }
  async recoveryData() {
    try { return this.storage.getItem(LIBRARY_KEY) || this.storage.getItem(LEGACY_KEY); }
    catch { return null; }
  }

  write(next) {
    if (this.readError) throw new Error('Saved data could not be read. Export a recovery copy from Settings.');
    // Replace the document only after the write succeeds; quota failures keep
    // the last durable library intact and leave the current game in UI memory.
    this.storage.setItem(LIBRARY_KEY, JSON.stringify(next));
    this.document = next;
  }
}
