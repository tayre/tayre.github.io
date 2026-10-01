(() => {
  'use strict';
  const { CHORDS, FAMILIES, QUALITIES, NATURAL, tones, strings, majorScale } = Chordbook;
  const $ = id => document.getElementById(id);
  let selected;
  let audioRequest = 0;
  let playTimer;
  const node = (tag, className, text = '') => {
    const result = document.createElement(tag);
    result.className = className;
    result.textContent = text;
    return result;
  };
  function svgNode(tag, attributes, text) {
    const result = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) result.setAttribute(name, value);
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function clearPlayback() {
    audioRequest++;
    clearTimeout(playTimer);
    ChordbookAudio.stop();
    document.querySelectorAll('.is-playing').forEach(el => el.classList.remove('is-playing'));
  }
  async function playNotes(notes, spacing, label, trigger) {
    clearPlayback();
    const request = audioRequest;
    try {
      const playing = await ChordbookAudio.play(notes, spacing);
      if (!playing || request !== audioRequest) return;
      $('audio-status').textContent = label;
      trigger?.classList.add('is-playing');
      playTimer = setTimeout(() => trigger?.classList.remove('is-playing'), ((notes.length - 1) * spacing + 1.75) * 1000);
    } catch (error) {
      if (request === audioRequest) $('audio-status').textContent = error.message || 'Sound is unavailable. You can still explore every chord.';
    }
  }
  function highlightTone(index) {
    document.querySelectorAll('[data-tone-index]').forEach(el => el.classList.toggle('tone-selected', Number(el.dataset.toneIndex) === index));
    document.querySelectorAll('.ingredient').forEach(el => el.setAttribute('aria-pressed', String(Number(el.dataset.toneIndex) === index)));
  }
  function renderChoices() {
    const family = QUALITIES[selected.quality].family;
    const focused = document.activeElement;
    const focusFamily = focused?.dataset.family;
    const focusChord = focused?.dataset.libraryChord;
    $('families').replaceChildren(...FAMILIES.map(item => {
      const button = node('button', 'family-button', item.name);
      button.type = 'button'; button.dataset.family = item.id;
      button.setAttribute('aria-pressed', String(item.id === family));
      button.addEventListener('click', () => {
        if (item.id !== family) selectChord(CHORDS.find(chord => QUALITIES[chord.quality].family === item.id).id);
      });
      return button;
    }));
    $('chord-list').replaceChildren(...CHORDS.filter(chord => QUALITIES[chord.quality].family === family).map(chord => {
      const button = node('button', 'chord-button');
      button.type = 'button'; button.dataset.libraryChord = chord.id;
      button.setAttribute('aria-label', `${chord.root} ${QUALITIES[chord.quality].name}`);
      button.setAttribute('aria-pressed', String(chord.id === selected.id));
      button.append(node('strong', '', chord.id), node('span', '', chord.barre ? 'Barre shape' : 'Open shape'));
      button.addEventListener('click', () => selectChord(chord.id));
      return button;
    }));
    if (focusFamily) document.querySelector(`[data-family="${focusFamily}"]`)?.focus({ preventScroll: true });
    else if (focusChord) document.querySelector(`[data-library-chord="${focusChord}"]`)?.focus({ preventScroll: true });
  }
  function renderDiagram() {
    const played = strings(selected);
    const svg = svgNode('svg', { viewBox: '0 0 320 300', role: 'img', 'aria-labelledby': 'diagram-title diagram-description' });
    svg.append(svgNode('title', { id: 'diagram-title' }, `${selected.id} guitar chord, frets 1 through 5`));
    const description = played.map(string => `String ${string.number} (${string.tuning}): ${string.fret === null ? 'do not play' : string.fret === 0 ? `open, ${string.tone.name}` : `fret ${string.fret}, finger ${string.finger}, ${string.tone.name}`}`).join('. ');
    svg.append(svgNode('desc', { id: 'diagram-description' }, description + (selected.barre ? `. Barre with finger 1 at fret ${selected.barre.fret}.` : '.')));
    const x = index => 55 + index * 42;
    const y = fret => 42 + (fret - 0.5) * 43;
    for (let fret = 0; fret <= 5; fret++) {
      svg.append(svgNode('line', { x1: x(0), x2: x(5), y1: 42 + fret * 43, y2: 42 + fret * 43, class: fret === 0 ? 'nut' : 'fret' }));
      if (fret > 0) svg.append(svgNode('text', { x: 24, y: y(fret) + 5, class: 'fret-label' }, fret));
    }
    for (let index = 0; index < 6; index++) {
      svg.append(svgNode('line', { x1: x(index), x2: x(index), y1: 42, y2: 257, class: 'guitar-string', 'stroke-width': 2.1 - index * 0.22 }));
      svg.append(svgNode('text', { x: x(index), y: 282, class: 'tuning-label' }, Chordbook.STRINGS[index]));
    }
    if (selected.barre) {
      const { fret, from, to } = selected.barre;
      svg.append(svgNode('line', { x1: x(from), x2: x(to), y1: y(fret), y2: y(fret), class: 'barre' }));
    }
    played.forEach((string, index) => {
      if (string.fret === null) svg.append(svgNode('text', { x: x(index), y: 25, class: 'mute-label' }, '×'));
      else if (string.fret === 0) svg.append(svgNode('circle', { cx: x(index), cy: 19, r: 6, class: `open-marker tone-${string.tone.index}`, 'data-tone-index': string.tone.index }));
      else {
        const group = svgNode('g', { class: `finger tone-${string.tone.index}`, 'data-tone-index': string.tone.index });
        group.append(svgNode('circle', { cx: x(index), cy: y(string.fret), r: 12 }), svgNode('text', { x: x(index), y: y(string.fret) + 5 }, string.finger));
        svg.append(group);
      }
    });
    $('diagram').replaceChildren(svg);
    $('string-buttons').replaceChildren(...played.map(string => {
      const button = node('button', string.tone ? `string-button tone-${string.tone.index}` : 'string-button muted');
      button.type = 'button'; button.disabled = string.fret === null;
      button.append(node('span', '', string.number), node('strong', '', string.tone?.name || '×'));
      if (string.tone) {
        button.dataset.toneIndex = string.tone.index;
        button.setAttribute('aria-label', `Play string ${string.number}, ${string.tone.name}, ${string.tone.role.toLowerCase()}, ${string.fret === 0 ? 'open' : `fret ${string.fret}`}`);
        button.addEventListener('click', () => {
          highlightTone(string.tone.index);
          playNotes([string.midi], 0, `String ${string.number}: ${string.tone.name}, the ${string.tone.role.toLowerCase()}.`, button);
        });
      } else button.setAttribute('aria-label', `String ${string.number}: do not play`);
      return button;
    }));
  }
  function renderTheory() {
    const quality = QUALITIES[selected.quality];
    const chordTones = tones(selected);
    $('shape-kind').textContent = `${selected.root} ${quality.name}`;
    $('chord-symbol').textContent = selected.id;
    $('shape-tag').textContent = selected.id === 'F' ? 'SMALL BARRE' : selected.barre ? 'BARRE CHORD' : 'OPEN POSITION';
    $('shape-tip').textContent = selected.tip;
    $('theory-heading').textContent = chordTones.length === 3 ? 'Three notes. One chord.' : 'One more note. A new colour.';
    $('theory-description').textContent = quality.description;
    $('ingredients').classList.toggle('four-tones', chordTones.length === 4);
    $('ingredients').style.setProperty('--tone-count', chordTones.length);
    $('ingredients').replaceChildren(...chordTones.map(tone => {
      const button = node('button', `ingredient tone-${tone.index}`);
      button.type = 'button'; button.dataset.toneIndex = tone.index;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `Hear ${tone.name}: ${tone.role.toLowerCase()}, ${tone.semitones} semitones above ${selected.root}`);
      button.append(node('span', 'degree', tone.degree), node('strong', 'ingredient-note', tone.name), node('span', 'ingredient-role', tone.role), node('span', 'semitones', `${tone.semitones} semitones`));
      button.addEventListener('click', () => {
        highlightTone(tone.index);
        playNotes([48 + NATURAL[selected.root] + tone.semitones], 0, `${tone.name}: ${tone.role.toLowerCase()}, ${tone.semitones} semitones above ${selected.root}.`, button);
      });
      return button;
    }));
    $('interval-rail').replaceChildren(...Array.from({ length: 13 }, (_, step) => {
      const tone = chordTones.find(item => item.semitones === step);
      const tick = node('span', `interval-tick${tone ? ` tone-${tone.index} in-chord` : ''}`, step);
      if (tone) { tick.dataset.toneIndex = tone.index; tick.setAttribute('aria-label', `${step} semitones: ${tone.name}, ${tone.role}`); }
      return tick;
    }));
    const scale = majorScale(selected.root);
    const note = selected.quality === 'major'
      ? `The ${selected.root} major scale is ${scale.join(' · ')}. Take notes 1, 3 and 5: ${chordTones.map(tone => tone.name).join(', ')}. That’s your chord.`
      : selected.quality === 'minor'
        ? `The third of ${selected.root} major is ${scale[2]}. Lower it one fret to ${chordTones[1].name}. The ♭3 in the formula means “lower the third,” even when the note’s name has no flat sign.`
        : selected.quality === 'dominant7'
          ? `The major-scale seventh is ${scale[6]}. Lower it one semitone to ${chordTones[3].name} for ♭7. A plain “7” chord means dominant seventh, not major seventh.`
          : selected.quality === 'major7'
            ? `${chordTones[3].name} is 11 semitones above ${selected.root}, just one below the octave. A major seventh (1 · 3 · 5 · 7) is different from a dominant seventh (1 · 3 · 5 · ♭7).`
            : `“Sus” means suspended: the ${selected.quality === 'sus2' ? 'second' : 'fourth'} replaces the third, ${scale[2]}. Put ${scale[2]} back to turn this into ${selected.root} major.`;
    $('theory-note').textContent = note;
    const played = strings(selected).filter(string => string.tone);
    $('voicing-copy').textContent = `This shape plays ${played.length} strings, but only ${chordTones.length} different note names. The repeated notes, often in different octaves, make the chord fuller.`;
    $('voicing-notes').replaceChildren(...played.map(string => {
      const tag = node('span', `voicing-note tone-${string.tone.index}`, string.tone.name);
      tag.dataset.toneIndex = string.tone.index;
      return tag;
    }));
    $('selection-status').textContent = `${selected.root} ${quality.name}. Notes ${chordTones.map(tone => tone.name).join(', ')}. Formula ${chordTones.map(tone => tone.degree).join(', ')}.`;
  }
  function selectChord(id, updateURL = true) {
    selected = CHORDS.find(chord => chord.id === id) || CHORDS[0];
    clearPlayback();
    $('audio-status').textContent = 'Sound is synthesized on your device. Nothing plays until you ask.';
    renderChoices(); renderDiagram(); renderTheory();
    if (updateURL) {
      try { history.replaceState(null, '', `#${selected.id}`); } catch { /* Sandboxed/file previews can still function. */ }
    }
  }
  $('strum').addEventListener('click', event => {
    highlightTone(-1);
    playNotes(strings(selected).filter(string => string.midi !== null).map(string => string.midi), 0.045, `Playing ${selected.id}, from the lowest sounding string to the highest.`, event.currentTarget);
  });
  $('pick').addEventListener('click', event => {
    highlightTone(-1);
    playNotes(strings(selected).filter(string => string.midi !== null).map(string => string.midi), 0.4, `Picking the strings of ${selected.id}, low to high.`, event.currentTarget);
  });
  document.querySelectorAll('.progression button').forEach(button => button.addEventListener('click', () => {
    selectChord(button.dataset.chord);
    $('explorer').focus({ preventScroll: true });
    $('explorer').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }));
  window.addEventListener('hashchange', () => selectChord(location.hash.slice(1), false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPlayback(); });
  selectChord(location.hash.slice(1) || 'C', false);
})();
