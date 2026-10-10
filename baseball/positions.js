// Coordinates are percentages of the 400 × 340 field, viewed from home plate.
export const POSITIONS = [
  { number: 1, name: 'Pitcher', short: 'P', x: 50, y: 57 },
  { number: 2, name: 'Catcher', short: 'C', x: 50, y: 87 },
  { number: 3, name: 'First base', short: '1B', x: 79, y: 62 },
  { number: 4, name: 'Second base', short: '2B', x: 69, y: 40 },
  { number: 5, name: 'Third base', short: '3B', x: 21, y: 62 },
  { number: 6, name: 'Shortstop', short: 'SS', x: 31, y: 40 },
  { number: 7, name: 'Left field', short: 'LF', x: 18, y: 19 },
  { number: 8, name: 'Center field', short: 'CF', x: 50, y: 12 },
  { number: 9, name: 'Right field', short: 'RF', x: 82, y: 19 }
];

export function selectFielder(selection, number, mode) {
  if (!POSITIONS.some(p => p.number === number)) return selection;
  if (mode === 'fly' || mode === 'error') return [number];
  // Repeated taps on the same fielder are usually accidental.
  return selection.at(-1) === number ? selection : [...selection, number].slice(0, 9);
}

export function fieldingNotation(selection, mode) {
  if (!selection.length) return '';
  if (mode === 'fly') return `F${selection[0]}`;
  if (mode === 'error') return `E${selection[0]}`;
  const sequence = selection.join('-');
  if (mode === 'double') return `${sequence}${selection.length === 1 ? 'U' : ''} DP`;
  return selection.length === 1 ? `${sequence}U` : sequence;
}

export function fieldingDescription(selection) {
  return selection.map(n => POSITIONS.find(p => p.number === n)?.name).filter(Boolean).join(' → ');
}

export function fieldArtwork() {
  return `<svg viewBox="0 0 400 340" aria-hidden="true" class="picker-art">
    <path d="M200 316 24 140 Q-2 0 200 0 Q402 0 376 140Z" fill="#e2e4d6"/>
    <path d="M200 302 51 153 Q27 28 200 28 Q373 28 349 153Z" fill="#d5dbc9"/>
    <path d="M200 302 82 184 Q70 86 200 82 Q330 86 318 184Z" fill="#e7dcca"/>
    <path d="M200 283 107 190 200 97 293 190Z" fill="#c4ccb3"/>
    <path d="M28 130 200 302 372 130" fill="none" stroke="#fffef5" stroke-width="2"/>
    <path d="M200 283 107 190 200 97 293 190Z" fill="none" stroke="#fffef5" stroke-width="1.5"/>
    <circle cx="200" cy="194" r="15" fill="#e7dcca"/>
    <path d="M194 194h12" stroke="#fffef5" stroke-width="3"/>
    <g fill="#fffef5"><path d="m293 184 6 6-6 6-6-6Z"/><path d="m200 91 6 6-6 6-6-6Z"/><path d="m107 184 6 6-6 6-6-6Z"/><path d="M194 283h12v6l-6 5-6-5Z"/></g>
  </svg>`;
}
