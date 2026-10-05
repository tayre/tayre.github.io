(() => {
  'use strict';
  const { CHORDS, FAMILIES, QUALITIES, NATURAL, tones, strings, majorScale } = Chordbook;
  const $ = id => document.getElementById(id);
  let selected;
  let audioRequest = 0;
  let playTimer;
  const idleAudioText = 'Use the play buttons to hear the notes. The sound is a reference tone, rather than a guitar recording.';
  const { SHAPES, nextShape, note: scaleNote, notes: scaleNotes, phrase: scalePhrase, WALK, NECK_SHAPES, neckNotes, NECK_PHRASE } = ChordbookScales;
  let scaleShape = null;
  let connectShapes = false;
  let activeLesson = 'chords';
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
      $(activeLesson === 'pentatonic' ? 'scale-audio-status' : 'audio-status').textContent = label;
      trigger?.classList.add('is-playing');
      playTimer = setTimeout(() => trigger?.classList.remove('is-playing'), ((notes.length - 1) * spacing + 1.75) * 1000);
    } catch (error) {
      if (request === audioRequest) $(activeLesson === 'pentatonic' ? 'scale-audio-status' : 'audio-status').textContent = error.message || 'Sound is unavailable. You can still explore every chord.';
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
    $('theory-heading').textContent = `${selected.id} uses ${chordTones.map(tone => tone.name).join(', ')}`;
    $('theory-description').textContent = quality.description;
    const scale = majorScale(selected.root);
    $('scale-heading').textContent = `Start with the ${selected.root} major scale`;
    $('scale-notes').replaceChildren(...scale.map((name, index) => {
      const tone = chordTones.find(item => Number(item.degree) === index + 1);
      const tag = node('span', `scale-note${tone ? ` tone-${tone.index} in-chord` : ''}`);
      tag.append(node('small', '', index + 1), node('strong', '', name));
      if (tone) tag.dataset.toneIndex = tone.index;
      return tag;
    }));
    $('scale-caption').textContent = selected.quality === 'major' ? `Choose notes 1, 3 and 5. The coloured notes become ${selected.id}.`
      : selected.quality === 'minor' ? `Choose 1, 3 and 5, then lower note 3: ${scale[2]} → ${chordTones[1].name}.`
      : selected.quality === 'dominant7' ? `Choose 1, 3, 5 and 7, then lower note 7: ${scale[6]} → ${chordTones[3].name}.`
      : selected.quality === 'major7' ? `Choose notes 1, 3, 5 and 7. All four come straight from this scale.`
      : `Choose 1, ${selected.quality === 'sus2' ? '2' : '4'} and 5. Leave out note 3 (${scale[2]}).`;
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
    $('distance-title').textContent = `Count the frets above ${selected.root}`;
    $('distance-copy').textContent = `Imagine starting on ${selected.root} on any string. Each box is one fret higher. The coloured boxes are the notes in ${selected.id}; 0 is your starting note.`;
    $('interval-rail').replaceChildren(...Array.from({ length: 13 }, (_, step) => {
      const tone = chordTones.find(item => item.semitones === step);
      const pitch = (NATURAL[selected.root] + step) % 12;
      const name = tone?.name || (step === 12 ? selected.root : ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch]);
      const tick = node('span', `interval-tick${tone ? ` tone-${tone.index} in-chord` : ''}`);
      tick.append(node('small', '', step), node('strong', '', name));
      tick.setAttribute('aria-label', `${step} frets above ${selected.root}: ${name}${step === 12 ? ', octave' : ''}`);
      if (tone) { tick.dataset.toneIndex = tone.index; tick.setAttribute('aria-label', `${step} semitones: ${tone.name}, ${tone.role}`); }
      return tick;
    }));
    const note = selected.quality === 'major'
      ? `“Third” and “fifth” mean the third and fifth notes of the scale, counted from ${selected.root}. The numbers count scale notes, while the fret diagram counts semitones. Those are two different ways to measure the distance.`
      : selected.quality === 'minor'
        ? `The third of ${selected.root} major is ${scale[2]}. Lower it one fret to ${chordTones[1].name}. The ♭3 in the formula means “lower the third,” even when the note’s name has no flat sign.`
        : selected.quality === 'dominant7'
          ? `The major-scale seventh is ${scale[6]}. Lower it one semitone to ${chordTones[3].name} for ♭7. A plain “7” chord means dominant seventh, not major seventh.`
          : selected.quality === 'major7'
            ? `${chordTones[3].name} is 11 semitones above ${selected.root}, just one below the octave. A major seventh (1 · 3 · 5 · 7) is different from a dominant seventh (1 · 3 · 5 · ♭7).`
            : `“Sus” is short for suspended. Use ${chordTones[1].name} in place of the third (${scale[2]}). Change it back to ${scale[2]} to hear ${selected.root} major.`;
    $('theory-note').textContent = note;
    const played = strings(selected).filter(string => string.tone);
    $('voicing-copy').textContent = `You play ${played.length} strings, but there are only ${chordTones.length} note names. Some strings play the same note at different pitches. Match the colours to the chord notes above.`;
    $('voicing-notes').replaceChildren(...played.map(string => {
      const tag = node('span', `voicing-note tone-${string.tone.index}`);
      tag.append(node('small', '', `string ${string.number}`), node('strong', '', string.tone.name));
      tag.dataset.toneIndex = string.tone.index;
      return tag;
    }));
    $('selection-status').textContent = `${selected.root} ${quality.name}. Notes ${chordTones.map(tone => tone.name).join(', ')}. Formula ${chordTones.map(tone => tone.degree).join(', ')}.`;
  }
  function selectChord(id, updateURL = true) {
    selected = CHORDS.find(chord => chord.id === id) || CHORDS[0];
    clearPlayback();
    $('audio-status').textContent = idleAudioText;
    renderChoices(); renderDiagram(); renderTheory();
    if (updateURL) {
      try { history.replaceState(null, '', `#${selected.id}`); } catch { /* Sandboxed/file previews can still function. */ }
    }
  }
  function setHash(hash) {
    try { history.replaceState(null, '', `#${hash}`); } catch { /* File previews still work. */ }
  }
  function scaleHash() { return `pentatonic-${scaleShape === null ? 'all' : scaleShape + 1}${connectShapes && scaleShape !== null ? '-connect' : ''}`; }
  function showLesson(lesson, updateURL = true) {
    clearPlayback();
    window.ChordbookSolo?.stop();
    activeLesson = lesson;
    $('audio-status').textContent = idleAudioText;
    $('scale-audio-status').textContent = 'The buttons play reference tones so you can check the notes on your guitar.';
    document.querySelectorAll('.lesson-tabs [role="tab"]').forEach(tab => {
      const active = tab.id === `${lesson}-tab`;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !active;
    });
    if (updateURL) setHash(lesson === 'solo' ? 'solo' : lesson === 'pentatonic' ? scaleHash() : selected.id);
  }
  document.querySelectorAll('.lesson-tabs [role="tab"]').forEach(tab => {
    tab.addEventListener('click', () => showLesson(tab.id.replace('-tab', '')));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const lessons = ['chords', 'pentatonic', 'solo'];
      const lesson = event.key === 'Home' ? lessons[0] : event.key === 'End' ? lessons.at(-1) : lessons[(lessons.indexOf(activeLesson) + (event.key === 'ArrowRight' ? 1 : 2)) % lessons.length];
      showLesson(lesson);
      $(`${lesson}-tab`).focus();
    });
  });
  function selectScaleShape(index) {
    clearPlayback(); scaleShape = index; renderPentatonic(); setHash(scaleHash());
    const scroll = $('pentatonic-fretboard').parentElement;
    const target = index === null ? 0 : (SHAPES[index].min - 5) * 55;
    scroll.scrollLeft = target;
  }
  function renderShapeChoices() {
    const focused = document.activeElement?.dataset.scaleShape;
    const choices = [{ number: 'all', min: 5, max: 20 }, ...SHAPES];
    $('scale-shapes').replaceChildren(...choices.map(shape => {
      const index = shape.number === 'all' ? null : shape.number - 1;
      const button = node('button', 'scale-shape-button');
      button.type = 'button'; button.dataset.scaleShape = shape.number;
      button.setAttribute('aria-pressed', String(index === scaleShape));
      button.setAttribute('aria-label', index === null ? 'Show all shapes equally' : `Highlight shape ${shape.number}, frets ${shape.min} to ${shape.max}`);
      button.append(node('strong', '', index === null ? 'All shapes' : `Shape ${shape.number}`), node('small', '', `frets ${shape.min}–${shape.max}`));
      button.addEventListener('click', () => selectScaleShape(index));
      return button;
    }));
    if (focused) document.querySelector(`[data-scale-shape="${focused}"]`)?.focus({ preventScroll: true });
  }
  function currentScalePhrase() { return scaleShape === null ? NECK_PHRASE : scalePhrase(scaleShape, connectShapes); }
  function renderPentatonic() {
    renderShapeChoices();
    const all = scaleShape === null;
    const shape = all ? null : SHAPES[scaleShape];
    const next = all ? null : nextShape(scaleShape);
    const min = 5, max = 20;
    $('connect-shapes').checked = connectShapes && !all;
    $('connect-shapes').disabled = all;
    $('connect-label').textContent = all ? 'Choose a shape to highlight its neighbour' : `Highlight shape ${next.number}${scaleShape === 4 ? ' again' : ''} too`;
    $('next-box-key').hidden = all || !connectShapes;
    $('scale-board-title').textContent = 'All five shapes · one fretboard · frets 5–20';
    const board = $('pentatonic-fretboard');
    const scroll = board.parentElement.scrollLeft;
    board.style.setProperty('--fret-count', max - min + 1);
    board.setAttribute('aria-label', 'All five A minor pentatonic shapes and the octave repeat, frets 5 to 20. Highlighting a shape keeps every note visible.');
    const cells = [];
    const place = (element, row, column) => {
      element.style.gridRow = row; element.style.gridColumn = column;
      cells.push(element); return element;
    };
    place(node('span', 'fretboard-label sticky-string-label', 'fret'), 1, 1);
    for (let fret = min; fret <= max; fret++) place(node('span', 'fretboard-fret', fret), 1, fret - min + 2);
    NECK_SHAPES.forEach((region, index) => {
      const active = all || index === scaleShape || (connectShapes && index === scaleShape + 1);
      place(node('span', 'neck-band-label sticky-string-label', index === 5 ? '1↑' : index + 1), index + 2, 1);
      const band = node('button', `neck-shape-band neck-shape-${index % 5}${active ? ' is-highlighted' : ''}${index === 5 ? ' octave-band' : ''}`, index === 5 ? 'Shape 1 ↑' : `Shape ${index + 1}`);
      band.type = 'button';
      band.setAttribute('aria-label', `Highlight shape ${region.number}${index === 5 ? ', octave repeat' : ''}, frets ${region.min} to ${region.max}`);
      // Clicking the octave repeat focuses the connection that reaches it.
      band.addEventListener('click', () => { if (index === 5) connectShapes = true; selectScaleShape(index === 5 ? 4 : index); });
      place(band, index + 2, `${region.min - min + 2} / span ${region.max - region.min + 1}`);
    });
    const positions = new Map(neckNotes().map(note => [`${note.string}:${note.fret}`, note]));
    for (let string = 5; string >= 0; string--) {
      const row = 8 + 5 - string;
      place(node('span', 'fretboard-string sticky-string-label', `${Chordbook.STRINGS[string]} · ${6 - string}`), row, 1);
      for (let fret = min; fret <= max; fret++) {
        const note = positions.get(`${string}:${fret}`);
        const current = !all && note?.shapes.includes(scaleShape);
        const inNext = !all && connectShapes && note?.shapes.includes(scaleShape + 1);
        const shared = note && (all ? note.shapes.length > 1 : current && (connectShapes ? inNext : note.shapes.length > 1));
        const cell = node('span', `fretboard-cell${current ? ' first-position' : ''}${inNext ? ' next-position' : ''}`);
        if (note) {
          const memberNames = note.shapes.map(index => index === 5 ? '1↑' : index + 1);
          const button = node('button', `fretboard-note${note.name === 'A' ? ' is-root' : ''}${!all && !current && !inNext ? ' context-note' : ''}${inNext && !current ? ' added-note' : ''}${shared ? ' shared-note' : ''}`, note.name);
          button.type = 'button'; button.dataset.note = note.name;
          button.dataset.string = note.number; button.dataset.fret = fret;
          button.dataset.shapes = memberNames.join(',');
          button.setAttribute('aria-label', `String ${note.number} (${note.tuning}), fret ${fret}: ${note.name}${note.name === 'A' ? ', root' : ''}. Shapes ${memberNames.join(' and ')}${note.shapes.length > 1 ? ', shared note' : ''}.`);
          button.addEventListener('click', () => playNotes([note.midi], 0, `${note.name} on string ${note.number}, fret ${fret}${note.name === 'A' ? ': the root of A minor.' : '.'}`, button));
          cell.append(button, node('small', `note-membership${!all && !current && !inNext ? ' context-note' : ''}`, memberNames.join(' · ')));
        }
        place(cell, row, fret - min + 2);
      }
    }
    board.replaceChildren(...cells);
    board.parentElement.scrollLeft = scroll;
    $('box-title').textContent = all ? 'Trace a line through the shapes' : connectShapes ? `Connect shape ${shape.number} to ${next.number}` : `Get to know shape ${shape.number}`;
    $('box-copy').textContent = all ? 'Every scale note stays on the same fretboard. Ringed notes belong to two shapes: use them to move between positions. Start by following the B string from fret 5 upwards. The phrase below carries that line to a high A.' : connectShapes ? (scaleShape === 4
      ? 'Shape 1 comes back at frets 17–20. It is the same pattern you learned at fret 5, moved up 12 frets. Use the shared G on the D string at fret 17 to reach A at fret 19.'
      : 'The ringed notes belong to both highlighted shapes. Outlined notes are in the next shape. The other notes remain visible so you can keep following the scale along the neck.') : shape.tip;
    const phrase = currentScalePhrase();
    const steps = all ? [
      'Find A on each string. The red notes give you places to pause as you move up the neck.',
      'Follow the B string: E at 5, G at 8, A at 10, C at 13, D at 15, E at 17, G at 20. Finish on high-E fret 17 for A.',
      'Highlight a shape and its neighbour to practise one connection. Choose All shapes to see the whole map again.'
    ] : connectShapes ? [
      'Find one ringed note on each string. Notice the two shape numbers below it.',
      `Play the phrase below: ${phrase.map(note => note.name).join(' → ')}. Move your hand when you reach a note outside the selected shape.`,
      `Finish on A and leave a pause. Then try a short answer starting in shape ${next.number}.`
    ] : [
      'Find and play each red A in the highlighted shape.',
      'Play its two notes on each string, from low E to high E. Come back down in reverse.',
      'Try the short phrase below, then highlight the neighbouring shape to keep moving up the neck.'
    ];
    $('box-steps').replaceChildren(...steps.map(text => node('li', '', text)));
    $('phrase-title').textContent = all ? 'A phrase along the neck' : connectShapes ? 'A phrase across the two shapes' : 'A phrase within this shape';
    $('pentatonic-phrase').replaceChildren(...phrase.map(note => {
      const tag = node('span', `phrase-note${note.name === 'A' ? ' root-note' : ''}`);
      tag.append(node('strong', '', note.name), node('small', '', `${note.tuning}${note.string === 5 ? ' (high)' : note.string === 0 ? ' (low)' : ''} · ${note.fret}`));
      return tag;
    }));
    $('phrase-copy').textContent = all ? 'Move your hand along the B string, then finish on A on the high E string. The labels give the string and fret. Leave a pause before repeating.' : connectShapes ? 'Each label gives the string and fret. Try sliding between notes on the same string to carry the phrase into the next shape. Playback uses separate reference tones.' : 'Each label gives the string and fret. Start on A, explore two nearby notes, and come back to A. Leave a pause before repeating.';
    $('play-pentatonic').textContent = all ? 'Hear the whole neck, low to high' : connectShapes ? 'Hear the highlighted shapes, low to high' : 'Hear the highlighted shape, low to high';
    $('scale-audio-status').textContent = 'The buttons play reference tones so you can check the notes on your guitar.';
  }
  $('connect-shapes').addEventListener('change', () => {
    clearPlayback(); connectShapes = $('connect-shapes').checked; renderPentatonic(); setHash(scaleHash());
  });
  $('play-pentatonic').addEventListener('click', event => {
    const played = scaleShape === null ? neckNotes() : scaleNotes(scaleShape, connectShapes);
    const notes = [...new Set(played.map(note => note.midi))].sort((a, b) => a - b);
    playNotes(notes, 0.3, `Playing A minor pentatonic, ${scaleShape === null ? 'across the whole neck' : `shape ${scaleShape + 1}${connectShapes ? ' and its neighbour' : ''}`}, from low to high.`, event.currentTarget);
  });
  $('play-phrase').addEventListener('click', event => playNotes(currentScalePhrase().map(note => note.midi), 0.45, 'Playing the A minor pentatonic phrase.', event.currentTarget));
  $('string-walk-notes').replaceChildren(...WALK.map(note => {
    const button = node('button', `walk-note${note.name === 'A' ? ' root-note' : ''}`);
    button.type = 'button'; button.setAttribute('aria-label', `Hear ${note.name}, B string, fret ${note.fret}`);
    button.append(node('small', '', `fret ${note.fret}`), node('strong', '', note.name));
    button.addEventListener('click', () => playNotes([note.midi], 0, `${note.name} on the B string, fret ${note.fret}.`, button));
    return button;
  }));
  $('play-walk').addEventListener('click', event => playNotes(WALK.map(note => note.midi), 0.4, 'Playing E, G, A, C, D, E along the B string.', event.currentTarget));
  document.querySelectorAll('[data-compare]').forEach(button => button.addEventListener('click', () => {
    const minor = button.dataset.compare === 'minor';
    playNotes([48, minor ? 51 : 52, 55], 0.045, `Playing C ${minor ? 'minor: C, E♭, G.' : 'major: C, E, G.'}`, button);
  }));
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
  function restoreHash() {
    const hash = location.hash.slice(1);
    if (hash === 'lessons') return;
    if (hash === 'solo') { showLesson('solo', false); return; }
    const scale = /^pentatonic(?:-(all|[1-5]))?(-connect)?$/.exec(hash);
    if (scale) {
      scaleShape = !scale[1] || scale[1] === 'all' ? null : Number(scale[1]) - 1;
      connectShapes = scaleShape !== null && Boolean(scale[2]);
      renderPentatonic(); showLesson('pentatonic', false);
    } else {
      selectChord(hash || 'C', false); showLesson('chords', false);
    }
  }
  window.addEventListener('hashchange', restoreHash);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPlayback(); });
  selectChord('C', false);
  renderPentatonic();
  restoreHash();
})();
