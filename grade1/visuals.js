/** Local diagrams: number and colour carry meaning, never decoration alone. */
export const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const svg = (content, className = '') => `<svg class="${className}" viewBox="0 0 240 180" aria-hidden="true" focusable="false">${content}</svg>`;

export function numberFrames(number) {
  return Array.from({ length: Math.ceil(number / 10) }, (_, frame) => `<span class="ten-frame">${Array.from({ length: 10 }, (_, dot) => `<i class="dot${frame * 10 + dot < number ? ' filled' : ''}"></i>`).join('')}</span>`).join('');
}

export function arithmeticFrame({ first, second, operation }) {
  return `<div class="ten-frame sum-frame">${Array.from({ length: 10 }, (_, index) => {
    const filled = index < (operation === 'subtract' ? first : first + second);
    const removed = operation === 'subtract' && index >= first - second && index < first;
    const gold = operation !== 'subtract' && index >= first && filled;
    return `<i class="dot${filled ? ' filled' : ''}${gold ? ' gold' : ''}${removed ? ' removed' : ''}">${removed ? '<span>×</span>' : ''}</i>`;
  }).join('')}</div><div class="dot-key">${operation === 'subtract' ? '<span>× = taken away</span>' : `<span><i></i>${first} dots</span><span><i class="gold"></i>${second} dots</span>`}</div>`;
}

function shapePicture(shape) {
  const paths = {
    circle: '<circle cx="120" cy="90" r="70"/>',
    triangle: '<path d="M120 17 207 160H33Z"/>',
    square: '<rect x="50" y="20" width="140" height="140" rx="1"/>',
    rectangle: '<rect x="20" y="40" width="200" height="100" rx="1"/>',
    oval: '<ellipse cx="120" cy="90" rx="103" ry="65"/>',
    hexagon: '<path d="m75 17 90 0 45 73-45 73H75L30 90Z"/>',
  };
  return svg(`<g fill="#f6d85b" stroke="#4c465d" stroke-width="5" stroke-linejoin="round">${paths[shape] || ''}</g>`, 'shape-picture');
}

function objectPicture(object) {
  const paths = {
    wig: '<path fill="#a67650" stroke="#694b35" stroke-width="4" d="M43 152V73C43 0 197 0 197 73v79l-30-16V77c-16 6-31-5-44-23-8 22-26 32-46 29v56z"/><path d="M64 55v69m25-89-6 24m76-22 14 43m8-22v64" stroke="#d7ae80" stroke-width="7" stroke-linecap="round"/>',
    mop: '<path d="m137 14-24 103" stroke="#ad784f" stroke-width="13" stroke-linecap="round"/><path d="M88 112h51l23 49H63z" fill="#e7eff0" stroke="#587779" stroke-width="4"/><path d="m98 119-14 34m24-32-6 34m17-34 5 34m4-32 14 32" stroke="#91b4b8" stroke-width="6"/>',
    top: '<path d="M115 28h10v40h-10z" fill="#71568a"/><ellipse cx="120" cy="78" rx="71" ry="25" fill="#f6d85b" stroke="#71568a" stroke-width="4"/><path d="M49 78q71 53 142 0l-71 79z" fill="#c3aee4" stroke="#71568a" stroke-width="4"/>',
    rug: '<path d="m32 43 164 15 16 83L48 127z" fill="#dbac8d" stroke="#986642" stroke-width="4"/><path d="m52 62 128 11 10 49-125-12z" fill="#f6d85b" stroke="#986642" stroke-width="4"/><path d="m19 42 12 1m-9 15 13 1m-10 15 12 1m-9 15 12 1m-10 15 15 1m-10 15 14 1m148-66 14 1m-12 15 15 1m-12 15 15 1m-12 15 15 1m-12 15 15 1m-12 15 15 1" stroke="#986642" stroke-width="4"/>',
  };
  return svg(paths[object] || '', 'object-picture');
}

function plantPicture(part) {
  const selected = '#7b56ab';
  const colour = (name, otherwise) => part === name ? selected : otherwise;
  if (part === 'seed') return svg('<ellipse cx="113" cy="101" rx="38" ry="53" transform="rotate(28 113 101)" fill="#b78857" stroke="#795335" stroke-width="5"/><path d="M116 62q-35 42-5 73" fill="none" stroke="#e6c28c" stroke-width="7"/><path d="M131 56q7-35 32-28-2 29-28 31" fill="#80a462"/>', 'plant-picture');
  return svg(`<path d="M20 120h200" stroke="#bdad85" stroke-width="3"/><path d="M20 122h200v49H20z" fill="#ead7b7"/><g fill="none" stroke="${colour('roots', '#ab9778')}" stroke-width="${part === 'roots' ? 7 : 4}" stroke-linecap="round"><path d="M120 119v37m0-29-30 17m30-10 30 23m-30-19-6 26m14-24 25 0"/></g><path d="M120 118V45" stroke="${colour('stem', '#82a263')}" stroke-width="${part === 'stem' ? 10 : 7}"/><g fill="${colour('leaves', '#90b178')}" stroke="${part === 'leaves' ? selected : '#719454'}" stroke-width="3"><path d="M117 86Q76 85 76 57q36-2 41 29"/><path d="M123 105q41-2 41-32-37 0-41 32"/></g><g fill="${colour('flowers', '#dfa1ac')}"><ellipse cx="119" cy="22" rx="12" ry="18"/><ellipse cx="119" cy="53" rx="12" ry="18"/><ellipse cx="101" cy="38" rx="18" ry="12"/><ellipse cx="137" cy="38" rx="18" ry="12"/></g><circle cx="119" cy="38" r="12" fill="#f6d85b"/>`, 'plant-picture') + '<p class="visual-caption">Look at the purple part.</p>';
}

function habitatPicture(habitat) {
  const base = '<rect x="10" y="7" width="220" height="166" rx="24" fill="#cce8eb"/>';
  const scenes = {
    pond: '<path d="M10 103q100-36 220-6v53q0 23-24 23H34q-24 0-24-23z" fill="#abc48d"/><ellipse cx="116" cy="129" rx="80" ry="34" fill="#76b9cf"/><ellipse cx="72" cy="117" rx="16" ry="6" fill="#6c995e"/><text x="47" y="112" font-size="31">🐸</text><text x="133" y="150" font-size="36">🐟</text><path d="M198 127V70m8 57V83" stroke="#598050" stroke-width="5"/>',
    forest: '<path d="M10 127h220v23q0 23-24 23H34q-24 0-24-23z" fill="#a5bd83"/><g fill="#6d9566"><path d="m61 25-36 78h72z"/><path d="m145 15-38 83h76z"/><path d="m202 58-28 61h51z"/></g><path d="M61 97v52m84-57v54m57-31v34" stroke="#9c7755" stroke-width="10"/><text x="80" y="153" font-size="38">🐿️</text>',
    ocean: '<path d="M10 60q28-13 55 0t55 0 55 0 55 0v90q0 23-24 23H34q-24 0-24-23z" fill="#76b6d0"/><text x="37" y="111" font-size="44">🐠</text><text x="130" y="149" font-size="42">🐟</text><path d="M47 160q-10-16 0-28m141 28q10-24 0-36" fill="none" stroke="#568e82" stroke-width="6"/>',
    desert: '<circle cx="183" cy="44" r="22" fill="#f6d85b"/><path d="M10 109q53-53 105 0t115 0v41q0 23-24 23H34q-24 0-24-23z" fill="#e5bb78"/><path d="M10 140q60-34 122 0t98 0v10q0 23-24 23H34q-24 0-24-23z" fill="#edcc91"/><text x="86" y="144" font-size="58">🐪</text>',
  };
  return svg(base + (scenes[habitat] || ''), 'habitat-picture');
}

function calendarPicture({kind,position,label}) {
  if (kind === 'day') return `<div class="week-picture">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day,index) => `<span${position === index+1 ? ' class="today"' : ''}>${day}</span>`).join('')}</div><p class="visual-caption">7 days make a week. Then we start again.</p>`;
  return svg(`<rect x="50" y="18" width="140" height="147" rx="16" fill="#fffdf7" stroke="#a79bb7" stroke-width="3"/><path d="M66 18h108q16 0 16 16v28H50V34q0-16 16-16" fill="#ae99c9"/><path d="M82 9v25m76-25v25" stroke="#66566e" stroke-width="6" stroke-linecap="round"/><text x="120" y="50" text-anchor="middle" font-size="17" font-family="system-ui" font-weight="800" fill="#30283c">${escapeHTML(label.slice(0,3).toUpperCase())}</text><text x="120" y="87" text-anchor="middle" font-size="11" font-family="system-ui" font-weight="800" fill="#665c70">MONTH</text><text x="120" y="140" text-anchor="middle" font-size="51" font-family="system-ui" font-weight="850" fill="#59436f">${position}</text>`, 'calendar-picture');
}

function coinPicture(cents) {
  // Teaching drawings, not coin photographs; denominations remain prominent.
  const motifs = { 5: '🦫', 10: '⛵', 25: '🦌', 100: '🦆', 200: '🐻‍❄️' };
  const names = { 5: 'NICKEL', 10: 'DIME', 25: 'QUARTER', 100: 'LOONIE', 200: 'TOONIE' };
  const value = cents < 100 ? `${cents}¢` : `$${cents / 100}`;
  const fill = cents === 100 ? '#e9bf4c' : '#d5dade';
  // A loon silhouette avoids confusing a duck emoji with the loonie's bird.
  const motif = cents === 100 ? '<path d="M69 86q18-18 52-6l12-15q5-12 16-4l-4 6 12 5-14 2-7 17q-22 26-67 3l-13-8z" fill="#6b572b"/><path d="M63 102h99m-91 8h85" stroke="#927738" stroke-width="3"/>' : `<text x="120" y="102" text-anchor="middle" font-size="55">${motifs[cents]}</text>`;
  return svg(`<circle cx="120" cy="90" r="81" fill="${fill}" stroke="#72716b" stroke-width="4"/><circle cx="120" cy="90" r="72" fill="${cents === 200 ? '#e9bf4c' : fill}" stroke="#929082" stroke-width="2"/><text x="120" y="42" text-anchor="middle" fill="#44443e" font-size="14" font-family="system-ui" font-weight="800">${names[cents]}</text>${motif}<text x="120" y="144" text-anchor="middle" fill="#353831" font-size="31" font-family="system-ui" font-weight="850">${value}</text>`, 'coin-picture');
}

export function renderVisual(visual) {
  if (!visual) return '';
  if (visual.type === 'tenframe') return arithmeticFrame(visual);
  if (visual.type === 'shape') return shapePicture(visual.shape);
  if (visual.type === 'object') return objectPicture(visual.object);
  if (visual.type === 'calendar') return calendarPicture(visual);
  if (visual.type === 'plant') return plantPicture(visual.part);
  if (visual.type === 'habitat') return habitatPicture(visual.habitat);
  if (visual.type === 'coin') return `<div class="coins single-coin">${coinPicture(visual.cents)}</div>`;
  if (visual.type === 'coins') return `<div class="coins">${visual.coins.map(coinPicture).join('')}</div>`;
  if (visual.type === 'pattern') return `<div class="pattern-items">${visual.items.map(item => `<span>${escapeHTML(item)}</span>`).join('')}<span class="pattern-next">${escapeHTML(visual.next)}</span></div><p class="visual-caption">The next one is in the dotted box.</p>`;
  return '';
}
