const startButton = document.querySelector('#start-button');
const startLabel = document.querySelector('#start-label');
const inputSelect = document.querySelector('#audio-input');
const tunerView = document.querySelector('.tuner-view');
const meter = document.querySelector('#meter');
const noteElement = document.querySelector('#note');
const octaveElement = document.querySelector('#octave');
const directionElement = document.querySelector('#direction');
const centsElement = document.querySelector('#cents');
const frequencyElement = document.querySelector('#frequency');
const stateElement = document.querySelector('#listen-state');
const permissionElement = document.querySelector('#permission-note');
const autoButton = document.querySelector('#auto-button');
const chordButton = document.querySelector('#chord-button');
const stringButtons = [...document.querySelectorAll('.string-note')];

const BUFFER_SIZE = 8192;
const analysisBuffer = new Float32Array(BUFFER_SIZE);

// chord mode: fold the spectrum into 12 pitch classes, index 0 = A
const NOTE_CLASS_NAMES = ['A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯'];
const CHROMA_LOW_MIDI = 52; // E3: below this the FFT can't separate semitones
const CHROMA_HIGH_MIDI = 88; // E5
// upper octaves are mostly harmonics of lower notes; downweight them so
// bleed can't cross the sounding threshold on its own
const OCTAVE_WEIGHTS = [1, 0.75, 0.5, 0.5];
const FIRST_OCTAVE_TOP = 63;
// a class sitting a fifth above a strong class is usually that class's 3rd
// harmonic; discount it unless it has its own fundamental-region energy
const FIFTH_DISCOUNT = 0.4;
const LOW_SUPPORT_RATIO = 0.25;
const SOUNDING_THRESHOLD = 0.45;
const SILENCE_PEAK = 1e-8;
// getByteFrequencyData is dB-scaled (-100..-30 dB → 0..255); convert back to power
const POWER_TABLE = Float32Array.from({ length: 256 }, (_, byte) => 10 ** ((-100 + (byte / 255) * 70) / 10));
const chroma = new Float32Array(12);
const chromaRaw = new Float32Array(12);
const chromaFirstOctave = new Float32Array(12);
let chordMode = false;
let spectrumBytes = null;
let spectrumBinWidth = 0;
const UPDATE_INTERVAL = 70;
let audioContext;
let analyser;
let stream;
let animationFrame;
let lastUpdate = 0;
let selectedTarget = null;
let frequencyHistory = [];
let lockedNote = null;
let inTuneStreak = 0;
let offStreak = 0;
const LOCK_AFTER = 5;
const UNLOCK_AFTER = 3;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function setDirection(state, title, detail, accessibleTitle = title) {
  tunerView.classList.remove('too-low', 'too-high', 'in-tune', 'locked');
  if (state) tunerView.classList.add(state);
  directionElement.textContent = title;
  directionElement.setAttribute('aria-label', accessibleTitle);
  centsElement.textContent = detail;
}

function engageLock(target, stringIndex) {
  lockedNote = { name: target.name, octave: target.octave, frequency: target.frequency, stringIndex: stringIndex ?? null };
  inTuneStreak = 0;
  offStreak = 0;
  if (lockedNote.stringIndex !== null) stringButtons[lockedNote.stringIndex].classList.add('tuned');
}

function releaseLock(dropTuned = false) {
  if (dropTuned && lockedNote && lockedNote.stringIndex !== null) stringButtons[lockedNote.stringIndex].classList.remove('tuned');
  lockedNote = null;
  inTuneStreak = 0;
  offStreak = 0;
}

function enterChordMode() {
  if (chordMode) return;
  chordMode = true;
  releaseLock();
  selectedTarget = null;
  frequencyHistory = [];
  stringButtons.forEach(button => button.classList.remove('active', 'detected'));
  autoButton.classList.remove('active');
  autoButton.setAttribute('aria-pressed', 'false');
  chordButton?.classList.add('active');
  chordButton?.setAttribute('aria-pressed', 'true');
  tunerView.classList.add('chord-mode');
  setWaiting();
}

function exitChordMode() {
  if (!chordMode) return;
  chordMode = false;
  chordButton?.classList.remove('active');
  chordButton?.setAttribute('aria-pressed', 'false');
  tunerView.classList.remove('chord-mode');
  chroma.fill(0);
  window.tunerVisualizer?.setState({ chordMode: false, chroma });
}

function setTarget(button) {
  exitChordMode();
  stringButtons.forEach(item => item.classList.toggle('active', item === button));
  autoButton.classList.toggle('active', !button);
  autoButton.setAttribute('aria-pressed', String(!button));
  selectedTarget = button ? {
    name: button.dataset.note,
    octave: Number(button.dataset.octave),
    frequency: Number(button.dataset.frequency),
    stringIndex: stringButtons.indexOf(button),
  } : null;
  frequencyHistory = [];
  releaseLock();
  setWaiting();
}

function setWaiting(message = stream ? 'Play one clear note' : 'Start the microphone to tune', level = 0) {
  if (chordMode) {
    noteElement.textContent = '·';
    octaveElement.textContent = '';
    frequencyElement.textContent = '— Hz';
    meter.style.setProperty('--needle-left', '50%');
    tunerView.style.setProperty('--level', level.toFixed(3));
    setDirection('', 'STRUM A CHORD', stream ? 'Every sounding pitch class lights up' : 'Start the microphone to begin');
    stringButtons.forEach(button => button.classList.remove('detected'));
    chroma.fill(0);
    window.tunerVisualizer?.setState({ level, cursorFrequency: 0, tune: 0, activeString: null, listening: Boolean(stream), locked: false, chordMode: true, chroma });
    return;
  }
  noteElement.textContent = selectedTarget?.name || '·';
  octaveElement.textContent = selectedTarget?.octave ?? '';
  frequencyElement.textContent = '— Hz';
  meter.style.setProperty('--needle-left', '50%');
  tunerView.style.setProperty('--level', level.toFixed(3));
  setDirection('', 'PLAY A STRING', message);
  stringButtons.forEach(button => button.classList.remove('detected'));
  window.tunerVisualizer?.setState({
    level,
    cursorFrequency: 0,
    tune: 0,
    activeString: selectedTarget?.stringIndex ?? null,
    listening: Boolean(stream),
    locked: false,
  });
}

function updateReadout(result) {
  const level = Math.min(1, result.rms * 12);
  tunerView.style.setProperty('--level', level.toFixed(3));

  if (!result.frequency || result.confidence < 0.72) {
    if (lockedNote) {
      stateElement.textContent = 'HOLDING';
      setDirection('locked', '✓', `${lockedNote.name}${lockedNote.octave} held · play the next string`, 'Locked in');
      window.tunerVisualizer?.setState({ level, cursorFrequency: 0, tune: 0, activeString: lockedNote.stringIndex, listening: true, locked: true });
      return;
    }
    stateElement.textContent = result.rms < 0.008 ? 'SIGNAL LOW' : 'FINDING NOTE';
    frequencyHistory = [];
    setWaiting('Play one clear note', level);
    return;
  }

  frequencyHistory.push(result.frequency);
  if (frequencyHistory.length > 5) frequencyHistory.shift();
  const stableFrequency = median(frequencyHistory);
  const detected = PitchTools.describeFrequency(stableFrequency);
  const target = selectedTarget || {
    name: detected.name,
    octave: detected.octave,
    frequency: detected.targetFrequency,
  };
  const cents = PitchTools.centsFromTarget(stableFrequency, target.frequency);
  const boundedCents = Math.max(-50, Math.min(50, cents));
  const inTune = Math.abs(cents) <= 5;
  const detectedStringIndex = stringButtons.findIndex(button => (
    button.dataset.note === detected.name && Number(button.dataset.octave) === detected.octave
  ));
  const activeString = selectedTarget?.stringIndex ?? (detectedStringIndex >= 0 ? detectedStringIndex : null);

  if (lockedNote) {
    const noteChanged = target.name !== lockedNote.name || target.octave !== lockedNote.octave;
    if (noteChanged || Math.abs(cents) > 10) {
      offStreak += 1;
      if (offStreak >= UNLOCK_AFTER) releaseLock(!noteChanged);
    } else {
      offStreak = 0;
    }
  }
  if (!lockedNote) {
    inTuneStreak = inTune ? inTuneStreak + 1 : 0;
    if (inTuneStreak >= LOCK_AFTER) engageLock(target, activeString);
  }

  noteElement.textContent = target.name;
  octaveElement.textContent = target.octave;
  frequencyElement.textContent = `${stableFrequency.toFixed(2)} Hz · ${Math.round(result.confidence * 100)}%`;
  meter.style.setProperty('--needle-left', `${50 + (boundedCents * 0.84)}%`);
  stateElement.textContent = selectedTarget ? `${target.name}${target.octave} SELECTED` : 'AUTO';

  if (lockedNote) {
    setDirection('locked', '✓', `${Math.abs(cents).toFixed(1)}¢ from pitch`, 'Locked in');
  } else if (inTune) {
    setDirection('in-tune', 'IN TUNE', `${Math.abs(cents).toFixed(1)}¢ from pitch`);
  } else if (cents < 0) {
    setDirection('too-low', 'TOO LOW', `Tune up ↑ · ${Math.abs(cents).toFixed(1)}¢`);
  } else {
    setDirection('too-high', 'TOO HIGH', `Tune down ↓ · ${Math.abs(cents).toFixed(1)}¢`);
  }

  stringButtons.forEach((button, index) => button.classList.toggle('detected', index === detectedStringIndex));
  window.tunerVisualizer?.setState({
    level,
    cursorFrequency: stableFrequency,
    tune: inTune || lockedNote ? 0 : (cents < 0 ? -1 : 1),
    activeString,
    listening: true,
    locked: Boolean(lockedNote),
  });
}

function updateChordReadout() {
  analyser.getFloatTimeDomainData(analysisBuffer);
  let sum = 0;
  for (let i = 0; i < analysisBuffer.length; i += 1) sum += analysisBuffer[i] * analysisBuffer[i];
  const rms = Math.sqrt(sum / analysisBuffer.length);
  const level = Math.min(1, rms * 12);
  tunerView.style.setProperty('--level', level.toFixed(3));

  analyser.getByteFrequencyData(spectrumBytes);
  chromaRaw.fill(0);
  chromaFirstOctave.fill(0);
  for (let midi = CHROMA_LOW_MIDI; midi <= CHROMA_HIGH_MIDI; midi += 1) {
    const noteFrequency = 440 * (2 ** ((midi - 69) / 12));
    // sum local-max bins within ±60 cents of this note, weighted by closeness;
    // the local-max gate rejects spectral-leakage shoulders from nearby peaks
    const lowBin = Math.max(1, Math.floor((noteFrequency * (2 ** (-60 / 1200))) / spectrumBinWidth));
    const highBin = Math.min(spectrumBytes.length - 2, Math.ceil((noteFrequency * (2 ** (60 / 1200))) / spectrumBinWidth));
    let energy = 0;
    for (let bin = lowBin; bin <= highBin; bin += 1) {
      const cents = Math.abs(1200 * Math.log2((bin * spectrumBinWidth) / noteFrequency));
      if (cents >= 60) continue;
      if (spectrumBytes[bin] < spectrumBytes[bin - 1] || spectrumBytes[bin] < spectrumBytes[bin + 1]) continue;
      energy += POWER_TABLE[spectrumBytes[bin]] * (1 - cents / 60);
    }
    const pitchClass = (midi + 3) % 12;
    chromaRaw[pitchClass] += energy * OCTAVE_WEIGHTS[Math.floor((midi - CHROMA_LOW_MIDI) / 12)];
    if (midi <= FIRST_OCTAVE_TOP) chromaFirstOctave[pitchClass] += energy;
  }

  let peak = 0;
  for (let i = 0; i < 12; i += 1) peak = Math.max(peak, chromaRaw[i]);
  if (peak >= SILENCE_PEAK) {
    for (let i = 0; i < 12; i += 1) {
      const normalized = chromaRaw[i] / peak;
      const hasFundamentalSupport = chromaFirstOctave[i] > LOW_SUPPORT_RATIO * chromaRaw[i];
      chroma[i] = hasFundamentalSupport ? normalized : Math.max(0, normalized - (FIFTH_DISCOUNT * chromaRaw[(i + 5) % 12]) / peak);
    }
  }
  if (peak < SILENCE_PEAK || rms < 0.008) {
    chroma.fill(0);
    stateElement.textContent = rms < 0.008 ? 'SIGNAL LOW' : 'LISTENING';
    noteElement.textContent = '·';
    octaveElement.textContent = '';
    frequencyElement.textContent = '— Hz';
    setDirection('', 'STRUM A CHORD', 'Play several strings together');
  } else {
    const sounding = [];
    let strongest = 0;
    for (let i = 0; i < 12; i += 1) {
      if (chroma[i] > SOUNDING_THRESHOLD) sounding.push(i);
      if (chroma[i] > chroma[strongest]) strongest = i;
    }
    sounding.sort((a, b) => ((a + 9) % 12) - ((b + 9) % 12));
    const strongestName = NOTE_CLASS_NAMES[strongest];
    noteElement.textContent = strongestName[0];
    octaveElement.textContent = strongestName.length > 1 ? '♯' : '';
    frequencyElement.textContent = '— Hz';
    stateElement.textContent = 'CHORD';
    setDirection('', sounding.map(index => NOTE_CLASS_NAMES[index]).join(' · '), `${sounding.length} pitch ${sounding.length === 1 ? 'class' : 'classes'} sounding`);
  }
  window.tunerVisualizer?.setState({ level, cursorFrequency: 0, tune: 0, activeString: null, listening: true, locked: false, chordMode: true, chroma });
}

function analyse(timestamp) {
  if (!analyser) return;
  animationFrame = requestAnimationFrame(analyse);
  if (timestamp - lastUpdate < UPDATE_INTERVAL) return;
  lastUpdate = timestamp;

  if (chordMode) {
    updateChordReadout();
    return;
  }

  analyser.getFloatTimeDomainData(analysisBuffer);
  updateReadout(PitchTools.detectPitch(analysisBuffer, audioContext.sampleRate, {
    minFrequency: 60,
    maxFrequency: 500,
    minimumRms: 0.008,
  }));
}

async function listInputs(activeDeviceId = '') {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(device => device.kind === 'audioinput');
  inputSelect.replaceChildren();
  inputs.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Audio input ${index + 1}`;
    option.selected = device.deviceId === activeDeviceId;
    inputSelect.append(option);
  });
  inputSelect.disabled = inputs.length < 2;
}

async function stopListening() {
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  analyser?.disconnect();
  analyser = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  if (audioContext && audioContext.state !== 'closed') await audioContext.close();
  audioContext = null;
  startButton.classList.remove('listening');
  startLabel.textContent = 'START TUNING';
  stateElement.textContent = 'READY';
  permissionElement.textContent = 'Audio stays on this device.';
  releaseLock();
  window.tunerVisualizer?.setSource(null);
  setWaiting();
}

async function startListening(deviceId = '') {
  if (!navigator.mediaDevices?.getUserMedia) {
    permissionElement.textContent = 'Microphone unavailable in this browser.';
    return;
  }

  if (stream) await stopListening();
  permissionElement.textContent = 'Requesting microphone…';

  try {
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };
    stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass({ latencyHint: 'interactive' });
    await audioContext.resume();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = BUFFER_SIZE;
    // smoothing applies only to frequency-domain reads (the spectrum);
    // the time-domain data the pitch detector uses is always raw
    analyser.smoothingTimeConstant = 0.7;
    spectrumBytes = new Uint8Array(analyser.frequencyBinCount);
    spectrumBinWidth = audioContext.sampleRate / analyser.fftSize;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    const activeDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId;
    await listInputs(activeDeviceId);
    startButton.classList.add('listening');
    startLabel.textContent = 'STOP TUNING';
    stateElement.textContent = 'LISTENING';
    permissionElement.textContent = 'Listening locally.';
    window.tunerVisualizer?.setSource(analyser, audioContext.sampleRate);
    window.tunerVisualizer?.setState({ listening: true });
    lastUpdate = 0;
    animationFrame = requestAnimationFrame(analyse);
  } catch (error) {
    await stopListening();
    if (error.name === 'NotAllowedError') {
      permissionElement.textContent = 'Microphone permission denied.';
    } else if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
      permissionElement.textContent = 'Audio input unavailable.';
    } else {
      permissionElement.textContent = 'Could not start the microphone.';
    }
  }
}

startButton.addEventListener('click', () => (stream ? stopListening() : startListening(inputSelect.value)));
inputSelect.addEventListener('change', () => startListening(inputSelect.value));
autoButton.addEventListener('click', () => setTarget(null));
chordButton?.addEventListener('click', enterChordMode);
stringButtons.forEach(button => button.addEventListener('click', () => setTarget(button)));
navigator.mediaDevices?.addEventListener?.('devicechange', () => listInputs(inputSelect.value));
window.addEventListener('pagehide', () => stream?.getTracks().forEach(track => track.stop()));
