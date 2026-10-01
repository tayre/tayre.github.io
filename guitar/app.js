(() => {
  'use strict';
  const { CHORDS, FAMILIES, QUALITIES, NATURAL, tones, strings, majorScale } = Chordbook;
  const $ = id => document.getElementById(id);
  let selected;
  let audioRequest = 0;
  let playTimer;
  const idleAudioText = 'Use the play buttons to hear the notes. The sound is a reference tone, rather than a guitar recording.';
  let pentatonicBox = 'first';
  const pentatonicPositions = {
    first: [[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]],
    next: [[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]]
  };
  const pentatonicPitches = { 9: 'A', 0: 'C', 2: 'D', 4: 'E', 7: 'G' };
  const scaleNote = (string, fret) => ({ string, fret, midi: Chordbook.TUNING[string] + fret, name: pentatonicPitches[(Chordbook.TUNING[string] + fret) % 12] });
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
  function pentatonicNotes() {
    return pentatonicPositions.first.flatMap((frets, string) => {
      const positions = pentatonicBox === 'connected' ? [...new Set([...frets, ...pentatonicPositions.next[string]])] : frets;
      return positions.map(fret => scaleNote(string, fret));
    });
  }
  function phraseNotes() {
    return (pentatonicBox === 'first' ? [[3, 5], [3, 7], [4, 5], [3, 7], [3, 5], [2, 7]] : [[3, 5], [3, 7], [3, 9], [4, 8], [4, 10]])
      .map(([string, fret]) => scaleNote(string, fret));
  }
  function renderPentatonic() {
    const connected = pentatonicBox === 'connected';
    document.querySelectorAll('[data-box]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.box === pentatonicBox)));
    $('next-box-key').hidden = !connected;
    const board = $('pentatonic-fretboard');
    board.classList.toggle('connected', connected);
    const cells = [node('span', 'fretboard-label', 'fret')];
    for (let fret = 5; fret <= 10; fret++) cells.push(node('span', 'fretboard-fret', fret));
    for (let string = 5; string >= 0; string--) {
      cells.push(node('span', 'fretboard-string', `${Chordbook.STRINGS[string]} · ${6 - string}`));
      for (let fret = 5; fret <= 10; fret++) {
        const first = pentatonicPositions.first[string].includes(fret);
        const next = pentatonicPositions.next[string].includes(fret);
        const cell = node('span', `fretboard-cell${fret <= 8 ? ' first-position' : ''}${connected && fret >= 7 ? ' next-position' : ''}`);
        if (first || (connected && next)) {
          const note = scaleNote(string, fret);
          const button = node('button', `fretboard-note${note.name === 'A' ? ' is-root' : ''}${!first ? ' added-note' : ''}`, note.name);
          button.type = 'button';
          button.dataset.string = 6 - string; button.dataset.fret = fret;
          button.setAttribute('aria-label', `String ${6 - string} (${Chordbook.STRINGS[string]}), fret ${fret}: ${note.name}${note.name === 'A' ? ', root' : ''}${connected && first && next ? ', shared by both boxes' : !first ? ', in the next box' : ''}`);
          button.addEventListener('click', () => playNotes([note.midi], 0, `${note.name} on string ${6 - string}, fret ${fret}${note.name === 'A' ? ': the root of A minor.' : '.'}`, button));
          cell.append(button);
        }
        cells.push(cell);
      }
    }
    board.replaceChildren(...cells);
    $('box-title').textContent = connected ? 'Use the notes the boxes share' : 'Start at the fifth fret';
    $('box-copy').textContent = connected
      ? 'The next box covers frets 7–10. It uses the same five note names, with some higher pitches. The outlined notes are new places to play; the overlap gives you a way to move between positions.'
      : 'This pattern covers frets 5–8. Each string has two notes. Guitarists call a pattern like this a “box” because it fits into a small stretch of the neck.';
    const steps = connected ? [
      'Play C at fret 5 on the G string, then D at fret 7. That D belongs to both boxes.',
      'Slide from D at fret 7 to E at fret 9 on the same string. Move your hand with the slide.',
      'Play G at fret 8 on the B string, then A at fret 10. You’ve reached a root in the next position.'
    ] : [
      'Start with A at fret 5 on the low E string. Play fret 5, then fret 8.',
      'Work upwards through the strings, playing the lower fret first. Come back down in reverse.',
      'Use your index for fret 5, ring finger for fret 7 and pinky for fret 8. Notice where the A notes repeat.'
    ];
    $('box-steps').replaceChildren(...steps.map(text => node('li', '', text)));
    $('pentatonic-phrase').replaceChildren(...phraseNotes().map(note => {
      const tag = node('span', `phrase-note${note.name === 'A' ? ' root-note' : ''}`);
      tag.append(node('strong', '', note.name), node('small', '', `${Chordbook.STRINGS[note.string]}${note.string === 5 ? ' (high)' : note.string === 0 ? ' (low)' : ''} · ${note.fret}`));
      return tag;
    }));
    $('phrase-copy').textContent = connected ? 'Each label gives the string and fret. Slide between D and E; finish on A. The playback plays separate reference tones, so try the slide on your guitar.' : 'Each label gives the string and fret. Go up three notes, come back down, then finish on A. Leave a pause before you repeat it.';
    $('play-pentatonic').textContent = connected ? 'Hear both positions, low to high' : 'Hear the first box, low to high';
  }
  document.querySelectorAll('[data-box]').forEach(button => button.addEventListener('click', () => {
    clearPlayback(); pentatonicBox = button.dataset.box; renderPentatonic();
    $('audio-status').textContent = idleAudioText;
  }));
  $('play-pentatonic').addEventListener('click', event => {
    const notes = [...new Set(pentatonicNotes().map(note => note.midi))].sort((a, b) => a - b);
    playNotes(notes, 0.3, 'Playing A minor pentatonic from low to high.', event.currentTarget);
  });
  $('play-phrase').addEventListener('click', event => playNotes(phraseNotes().map(note => note.midi), 0.45, 'Playing the A minor pentatonic phrase.', event.currentTarget));
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
  window.addEventListener('hashchange', () => selectChord(location.hash.slice(1), false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPlayback(); });
  selectChord(location.hash.slice(1) || 'C', false);
  renderPentatonic();
})();
