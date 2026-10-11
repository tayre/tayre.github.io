export const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

// Diagrams are local and accessible: no image downloads needed to learn offline.
export function renderVisual(visual, icon = '✦') {
  if (!visual) return `<span class="lesson-icon" aria-hidden="true">${escapeHTML(icon)}</span>`;
  if (visual.type === 'fraction') {
    const bar = (n, d) => `<div class="fraction-model"><div class="fraction-bar" style="--parts:${d}" role="img" aria-label="${n} of ${d} equal parts shaded">${Array.from({ length: d }, (_, i) => `<i class="${i < n ? 'filled' : ''}"></i>`).join('')}</div><span>${n}<small>of</small>${d}</span></div>`;
    return `<div class="fraction-models">${bar(visual.numerator, visual.denominator)}${visual.compareDenominator ? bar(visual.compareNumerator, visual.compareDenominator) : ''}</div>`;
  }
  if (visual.type === 'groups') {
    return `<div class="equal-groups" role="img" aria-label="${visual.groups} equal groups of ${visual.each}">${Array.from({ length: visual.groups }, () => `<span class="equal-group">${'<i></i>'.repeat(visual.each)}</span>`).join('')}</div><p class="visual-caption">${visual.groups} equal groups · ${visual.groups * visual.each} altogether</p>`;
  }
  if (visual.type === 'clock') {
    const numbers = Array.from({ length: 12 }, (_, i) => { const n = i + 1, angle = n * Math.PI / 6; return `<text x="${100 + Math.sin(angle) * 70}" y="${106 - Math.cos(angle) * 70}">${n}</text>`; }).join('');
    return `<svg class="lesson-clock" viewBox="0 0 200 200" role="img" aria-label="Clock showing ${visual.hour}:${String(visual.minute).padStart(2, '0')}"><circle cx="100" cy="100" r="94" fill="#fffefa" stroke="currentColor" stroke-width="4"/>${numbers}<path d="M100 100V55" transform="rotate(${visual.hour * 30 + visual.minute / 2} 100 100)" stroke="#7763aa" stroke-width="8" stroke-linecap="round"/><path d="M100 100V34" transform="rotate(${visual.minute * 6} 100 100)" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="currentColor"/></svg>`;
  }
  if (visual.type === 'coins') {
    return `<div class="lesson-coins" role="img" aria-label="Canadian coins: ${visual.values.map((n) => `${n} cents`).join(', ')}">${visual.values.map((n) => `<span class="lesson-coin ${n >= 100 ? 'gold-coin' : ''}">${n >= 100 ? `$${n / 100}` : `${n}¢`}</span>`).join('')}</div><p class="visual-caption">Canadian money</p>`;
  }
  if (visual.type === 'foodchain') {
    return `<div class="food-chain" role="img" aria-label="${escapeHTML(visual.items.join(' then '))}">${visual.items.map((item) => `<span>${escapeHTML(item)}</span>`).join('<i aria-hidden="true">→</i>')}</div><p class="visual-caption">Follow the energy →</p>`;
  }
  return `<span class="lesson-icon" aria-hidden="true">${escapeHTML(icon)}</span>`;
}
