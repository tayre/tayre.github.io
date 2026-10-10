export const PLAYS = [
  { code: '1B', label: 'Single', base: 1, hit: true, tip: 'Check where each runner finished.' },
  { code: '2B', label: 'Double', base: 2, hit: true, tip: 'Check where each runner finished.' },
  { code: '3B', label: 'Triple', base: 3, hit: true, tip: 'Batter to third. Check the other runners.' },
  { code: 'HR', label: 'Home run', base: 4, hit: true, tip: 'Batter and runners score.' },
  { code: 'BB', label: 'Walk', base: 1, forced: true, tip: 'Only forced runners advance.' },
  { code: 'HBP', label: 'Hit by pitch', base: 1, forced: true, tip: 'Only forced runners advance.' },
  { code: 'K', label: 'Swinging K', base: 0, tip: 'Batter out swinging.' },
  { code: 'ꓘ', label: 'Looking K', base: 0, tip: 'Batter out on a called third strike.' },
  { code: '6-3', label: 'Groundout', base: 0, notation: true, picker: 'sequence', tip: 'Tap the fielders in order.' },
  { code: 'F8', label: 'Flyout', base: 0, notation: true, picker: 'fly', tip: 'Tap the fielder who caught it.' },
  { code: 'E6', label: 'Error', base: 1, error: true, notation: true, picker: 'error', tip: 'Tap the fielder charged with the error.' },
  { code: 'DP', label: 'Double play', base: 0, notation: true, picker: 'double', tip: 'Tap the fielders in order. Mark both outs below.' },
  { code: 'FC', label: 'Fielder’s choice', base: 1, notation: true, tip: 'Mark the retired runner Out.' },
  { code: 'OTHER', label: 'Other', base: 1, notation: true, tip: 'Enter a notation and set the outcomes.' }
];

export function newGame(away = 'Visitors', home = 'Home', lineups) {
  return { version: 1, teams: [away, home], lineups: lineups || [0, 1].map(() => Array.from({ length: 9 }, (_, i) => `Batter ${i + 1}`)), events: [], finished: false };
}

export function derive(game) {
  const s = { inning: 1, side: 0, outs: 0, bases: [null, null, null], next: [0, 0], runs: [[], []], hits: [0, 0], errors: [0, 0], appearances: [], log: [] };
  for (const event of game.events) {
    s.runs[s.side][s.inning - 1] ??= 0;
    const inning = s.inning, side = s.side;
    let batter;
    if (event.kind === 'plate') {
      batter = { id: s.appearances.length, side, inning, slot: s.next[side], code: event.code, maxBase: 0, scored: false, out: false };
      s.appearances.push(batter);
      s.next[side] = (s.next[side] + 1) % 9;
      if (event.hit) s.hits[side]++;
    }
    if (event.error) s.errors[1 - side]++;
    const nextBases = [null, null, null];
    for (const move of event.moves) {
      const runner = move.from === 'batter' ? batter : s.bases[Number(move.from) - 1];
      if (!runner) throw new Error('A runner is missing.');
      if (move.to === 0) { runner.out = true; s.outs++; runner.outNumber = s.outs; }
      else if (move.to === 4) {
        if (event.countRuns !== false) { runner.scored = true; runner.maxBase = 4; s.runs[side][inning - 1]++; }
      } else { runner.maxBase = Math.max(runner.maxBase, move.to); nextBases[move.to - 1] = runner; }
    }
    s.bases = nextBases;
    s.log.push({ ...event, inning, side, slot: batter?.slot });
    if (s.outs >= 3) {
      s.outs = 0; s.bases = [null, null, null];
      if (s.side === 1) s.inning++;
      s.side = 1 - s.side;
    }
  }
  return s;
}

export function suggestedMoves(s, play, kind = 'plate') {
  const moves = [];
  for (let base = 3; base >= 1; base--) {
    if (!s.bases[base - 1]) continue;
    let to = base;
    if (kind === 'plate' && play.hit) to = Math.min(4, base + play.base);
    if (kind === 'plate' && play.forced && s.bases.slice(0, base).every(Boolean)) to = base + 1;
    moves.push({ from: String(base), to });
  }
  if (kind === 'plate') moves.push({ from: 'batter', to: play.base });
  return moves;
}

export function validateEvent(s, event) {
  if (!event.code.trim()) return 'Add a notation for this play.';
  const expected = s.bases.flatMap((r, i) => r ? [String(i + 1)] : []);
  if (event.kind === 'plate') expected.push('batter');
  if (event.kind === 'runner' && !expected.length) return 'There are no runners on base.';
  if (event.moves.length !== expected.length || new Set(event.moves.map(m => m.from)).size !== expected.length || event.moves.some(m => !expected.includes(m.from))) return 'Record a destination for every runner.';
  if (event.moves.some(m => !Number.isInteger(m.to) || m.to < 0 || m.to > 4)) return 'Choose a valid destination.';
  if (event.moves.some(m => m.from !== 'batter' && m.to > 0 && m.to < Number(m.from))) return 'Runners cannot move backward. Undo the previous play to correct it.';
  const occupied = event.moves.filter(m => m.to > 0 && m.to < 4).map(m => m.to);
  if (new Set(occupied).size !== occupied.length) return 'Two runners cannot finish on the same base.';
  if (s.outs + event.moves.filter(m => m.to === 0).length > 3) return 'This play records more than three outs in the half-inning.';
  if (event.kind === 'runner' && event.moves.every(m => m.to === Number(m.from))) return 'Change at least one runner’s destination.';
  return '';
}
