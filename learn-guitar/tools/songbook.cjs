#!/usr/bin/env node
'use strict';

// Data in, static songbook out. No packages, network access, or code evaluation.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {compileSong} = require('../song-model.js');
const defaultRoot = path.resolve(__dirname, '..');
const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 16);
const json = value => JSON.stringify(value, null, 2) + '\n';
const fields = new Set(['schemaVersion','id','title','tempo','beatsPerBar','tuning','tuningLabel','capo','rawBars','sections','chordShapes','repeatSummary','accompaniment','tips','source','transcription']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;
const readJSON = file => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${file}: ${error.message}`); }
};

function validateSong(song) {
  const requireThat = (valid, message) => { if (!valid) throw new Error(`${song?.id || 'Song'}: ${message}`); };
  requireThat(isObject(song), 'Use one JSON song object.');
  requireThat(song.schemaVersion === 1, 'schemaVersion must be 1.');
  for (const key of Object.keys(song)) requireThat(fields.has(key), `Unknown field "${key}"; check the song format.`);
  for (const key of ['tuningLabel','repeatSummary','accompaniment']) {
    requireThat(song[key] === undefined || typeof song[key] === 'string', `${key} must be plain text.`);
  }
  requireThat(isObject(song.transcription), 'transcription metadata is required.');
  const review = song.transcription;
  requireThat(['from-photo','interpreted','user-specified'].includes(review.rhythm), 'Declare rhythm as from-photo, interpreted, or user-specified.');
  requireThat(['from-photo','suggested','none'].includes(review.chords), 'Declare chords as from-photo, suggested, or none.');
  requireThat(Array.isArray(review.unresolved) && review.unresolved.every(isText), 'transcription.unresolved must be an array of questions.');
  requireThat(review.unresolved.length === 0, `Resolve before import: ${review.unresolved.join(' / ')}`);
  requireThat(isObject(song.source) && isText(song.source.description), 'Describe the source and any transcription assumptions.');
  requireThat(song.source.image === undefined || /^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(song.source.image), 'source.image must be a local JPG, PNG, or WebP path under assets/. Use --photo to attach a photo.');
  requireThat(song.tips === undefined || (Array.isArray(song.tips) && song.tips.every(tip => Array.isArray(tip) && tip.length === 2 && tip.every(isText))), 'tips must contain [heading, body] pairs.');
  requireThat(song.sections === undefined || (Array.isArray(song.sections) && song.sections.every(section => isObject(section) && ['name','letter','caption','tip'].every(key => section[key] === undefined || typeof section[key] === 'string'))), 'sections must contain named bar ranges.');
  requireThat(song.chordShapes === undefined || (Array.isArray(song.chordShapes) && song.chordShapes.every(shape => Array.isArray(shape) && shape.length === 2 && isText(shape[0]))), 'chordShapes must contain [name, sixFrets] pairs.');
  const bars = compileSong(song);
  const hasChords = bars.some(bar => bar.chord) || Boolean(song.chordShapes?.length);
  requireThat(!hasChords || review.chords !== 'none', 'Declare where the chord suggestions/symbols came from.');
  requireThat(!hasChords || isText(song.accompaniment), 'Describe the accompaniment and any chord changes within a bar.');
  requireThat(review.chords !== 'suggested' || /suggest/i.test(song.accompaniment || ''), 'Label suggested accompaniment as suggested.');
  return bars;
}

function prepareSong(input) {
  const bars = validateSong(input);
  const song = JSON.parse(JSON.stringify(input));
  // Match pitches AND rhythm/ties. Similar phrases stay separate.
  const melodies = new Map();
  const repeats = [];
  bars.forEach((bar, index) => {
    const signature = JSON.stringify(bar.notes.map(note => [note.string,note.fret,note.duration,note.tied]));
    const original = melodies.get(signature);
    if (original) {
      song.rawBars[index][0] = original;
      repeats.push(`${index + 1} = ${original}`);
    } else melodies.set(signature, index + 1);
  });
  if (!song.repeatSummary) song.repeatSummary = repeats.join(' · ');
  compileSong(song);
  delete song.schemaVersion;
  delete song.transcription;
  return {song, bars, repeats};
}

function readLibrary(root) {
  const directory = path.join(root, 'songs/data');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(file => file.endsWith('.json')).sort().map(file => {
    const song = readJSON(path.join(directory, file));
    validateSong(song);
    if (file !== `${song.id}.json`) throw new Error(`${file}: filename must match song id ${song.id}.`);
    return song;
  });
}

function buildPlan(root, songs, extraFiles = new Map()) {
  if (!songs.length) throw new Error('Add at least one song in songs/data/.');
  const ids = new Set();
  const plan = new Map(extraFiles);
  const catalog = [];
  const sorted = [...songs].sort((a,b) => a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id, 'en'));
  for (const input of sorted) {
    const {song} = prepareSong(input);
    if (ids.has(song.id)) throw new Error(`Duplicate song id: ${song.id}`);
    ids.add(song.id);
    if (song.source?.image && !plan.has(song.source.image) && !fs.existsSync(path.join(root, song.source.image))) {
      throw new Error(`${song.id}: source image is missing. Import with --photo /path/to/photo.jpg.`);
    }
    const file = `songs/${song.id}.js`;
    const content = `// Generated from songs/data/${song.id}.json by tools/songbook.cjs.\n"use strict";\n\nwindow.GuitarSongbook.songs[${JSON.stringify(song.id)}] = ${JSON.stringify(song, null, 2)};\n`;
    plan.set(file, content);
    catalog.push({id:song.id, title:song.title, file:`${file}?v=${hash(content)}`});
  }
  const catalogContent = `// Generated from songs/data/*.json by tools/songbook.cjs.\n"use strict";\n\nwindow.GuitarSongbook = {\n  catalog: ${JSON.stringify(catalog, null, 2)},\n  songs: Object.create(null)\n};\n`;
  plan.set('songs/catalog.js', catalogContent);
  // A song edit refreshes its file and the catalog; a player edit refreshes its asset.
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  plan.set('index.html', html.replace(/(src|href)="(styles\.css|songs\/catalog\.js|song-model\.js|playback\.js|acoustic-guitar\.js|script\.js)(?:\?[^"\s]*)?"/g, (_, attribute, file) => {
    const content = plan.get(file) || fs.readFileSync(path.join(root, file));
    return `${attribute}="${file}?v=${hash(content)}"`;
  }));
  return plan;
}

function writePlan(root, plan, check = false) {
  const changed = [];
  for (const [relative, content] of plan) {
    const target = path.join(root, relative);
    const bytes = Buffer.from(content);
    if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) continue;
    changed.push(relative);
  }
  if (check && changed.length) throw new Error(`Generated files are out of date: ${changed.join(', ')}. Run node learn-guitar/tools/songbook.cjs build.`);
  if (check) return changed;
  for (const relative of changed) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    const temporary = `${target}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, plan.get(relative));
      fs.renameSync(temporary, target);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  return changed;
}

function photoFile(song, filename) {
  const bytes = fs.readFileSync(filename);
  const extension = path.extname(filename).toLowerCase();
  const valid = (['.jpg','.jpeg'].includes(extension) && bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) ||
    (extension === '.png' && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (extension === '.webp' && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP');
  if (!valid) throw new Error('Use a JPG, PNG, or WebP photo with a matching file extension.');
  return [`assets/sheets/${song.id}-${hash(bytes)}${extension === '.jpeg' ? '.jpg' : extension}`, bytes];
}

function importSong(root, filename, {photo, replace = false} = {}) {
  const song = readJSON(filename);
  validateSong(song);
  const library = readLibrary(root);
  if (library.some(existing => existing.id === song.id) && !replace) throw new Error(`${song.id} already exists. Use --replace only to update that song, or choose a new id for another arrangement.`);
  const files = new Map();
  if (photo) {
    const [relative, bytes] = photoFile(song, photo);
    song.source.image = relative;
    files.set(relative, bytes);
  }
  files.set(`songs/data/${song.id}.json`, json(song));
  const plan = buildPlan(root, [...library.filter(existing => existing.id !== song.id), song], files);
  const changed = writePlan(root, plan);
  return {song, changed, ...prepareSong(song)};
}

const help = `Learn Guitar songbook\n\n  validate <song.json>                 Check a transcription without writing\n  import <song.json> [--photo <path>]  Add data/photo and rebuild the song menu\n                       [--replace]    Explicitly update an existing song\n  build [--check]                      Rebuild, or check for stale generated files\n\nRun from any directory: node /path/to/learn-guitar/tools/songbook.cjs <command>\nFormat and photo workflow: learn-guitar/README.md\n`;

function main(args) {
  const [command, ...rest] = args;
  if (!command || command === '--help') return console.log(help);
  if (command === 'build') {
    if (rest.some(arg => arg !== '--check') || rest.length > 1) throw new Error('Usage: build [--check]');
    const songs = readLibrary(defaultRoot);
    const changed = writePlan(defaultRoot, buildPlan(defaultRoot, songs), rest.includes('--check'));
    console.log(`PASS: ${songs.length} song(s); ${changed.length} generated file(s) updated.`);
  } else if (command === 'validate') {
    if (rest.length !== 1) throw new Error('Usage: validate <song.json>');
    const {song, bars, repeats} = prepareSong(readJSON(rest[0]));
    console.log(`PASS: ${song.title}, ${bars.length} bars. Exact repeats: ${repeats.join(' · ') || 'none'}.`);
  } else if (command === 'import') {
    if (!rest[0] || rest[0].startsWith('--')) throw new Error('Usage: import <song.json> [--photo <path>] [--replace]');
    const options = {};
    for (let i = 1; i < rest.length; i++) {
      if (rest[i] === '--replace' && !options.replace) options.replace = true;
      else if (rest[i] === '--photo' && !options.photo && rest[i+1] && !rest[i+1].startsWith('--')) options.photo = rest[++i];
      else throw new Error(`Unknown or incomplete option: ${rest[i]}`);
    }
    const {song, bars, repeats, changed} = importSong(defaultRoot, rest[0], options);
    console.log(`Imported ${song.title}: ${bars.length} bars, ${repeats.length} repeated melodies; ${changed.length} files updated.\nAfter publication: https://tayre.github.io/learn-guitar/?song=${song.id}`);
  } else throw new Error(`Unknown command: ${command}\n${help}`);
}

module.exports = {validateSong, prepareSong, readLibrary, buildPlan, writePlan, importSong};
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
