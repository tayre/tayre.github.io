"use strict";

const $ = (id) => document.getElementById(id);
const ui = {
  dun: document.querySelector(".dun"),
  dunTitle: $("dun-title"),
  button: $("connect-button"),
  buttonLabel: $("button-label"),
  status: $("connection-status"),
  elapsed: $("elapsed"),
  progress: $("progress"),
  progressFill: $("progress-fill"),
  footer: $("footer-status"),
  loop: $("loop"),
  volume: $("volume"),
  volumeValue: $("volume-value"),
  mute: $("mute-button"),
  canvas: $("waveform"),
  counter: $("hit-counter"),
};

const RECORDING_URL = "assets/dialup.mp3";
const SYNTH_DURATION = 27;
const LOOP_PAUSE = 6;
const ISP = "Handshake Internet Services";
const PAGE_TITLE = document.title;

let audioContext;
let masterGain;
let analyser;
let waveData;
let dialupBuffer;
let source;
let state = "idle";
let startedAt = 0;
let connectedAt = 0;
let muted = false;
let runToken = 0;
let stateTimer;
let animationFrame;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Fetch the recording right away so the first click starts quickly. Opening index.html
// straight from disk blocks fetch(); resolving to null switches on the synthesized fallback.
const recordingBytes = fetch(RECORDING_URL)
  .then((response) =>
    response.ok
      ? response.arrayBuffer()
      : Promise.reject(new Error(`HTTP ${response.status}`)),
  )
  .catch((error) => {
    console.warn("Recording unavailable, using the synthesized modem instead:", error);
    return null;
  });

async function loadDialup(context) {
  const bytes = await recordingBytes;
  if (bytes) {
    try {
      return await context.decodeAudioData(bytes.slice(0));
    } catch (error) {
      console.warn("Could not decode the recording, using the synthesized modem instead:", error);
    }
  }
  return synthesizeDialup(context);
}

// Fallback only: a telephone-band approximation of the handshake, generated locally.
function synthesizeDialup(context) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(rate * SYNTH_DURATION), rate);
  const samples = buffer.getChannelData(0);
  const tau = Math.PI * 2;
  const sin = (frequency, t) => Math.sin(tau * frequency * t);
  const envelope = (t, start, end, fade = 0.008) =>
    Math.max(0, Math.min(1, (t - start) / fade, (end - t) / fade));
  const digits = "18005561998";
  const dtmf = {
    0: [941, 1336],
    1: [697, 1209],
    5: [770, 1336],
    6: [770, 1477],
    8: [852, 1336],
    9: [852, 1477],
  };
  let seed = 1998;
  let previousNoise = 0;
  let lowNoise = 0;
  let carrierPhase = 0;
  let symbol = 0;
  let symbolPhase = 0;

  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = seed / 2147483648;
    lowNoise += 0.32 * (noise - lowNoise);
    const phoneNoise = lowNoise - previousNoise;
    previousNoise += 0.09 * (lowNoise - previousNoise);
    let value = 0;

    if (t < 0.07) {
      value = noise * 0.25 * Math.exp(-t * 110);
    } else if (t < 1.72) {
      value = (sin(350, t) + sin(440, t)) * 0.19 * envelope(t, 0.12, 1.72);
    } else if (t >= 1.85 && t < 4) {
      const digitIndex = Math.floor((t - 1.85) / 0.185);
      const localTime = (t - 1.85) % 0.185;
      if (digitIndex < digits.length) {
        const frequencies = dtmf[digits[digitIndex]];
        value =
          (sin(frequencies[0], t) + sin(frequencies[1], t)) *
          0.22 *
          envelope(localTime, 0, 0.12, 0.004);
      }
    } else if (t >= 4.2 && t < 7.65) {
      const ringTime = (t - 4.2) % 2.4;
      value =
        (sin(440, t) + sin(480, t)) * 0.18 * envelope(ringTime, 0, 1.45, 0.015);
    } else if (t >= 7.8 && t < 10.6) {
      const localTime = t - 7.8;
      const phaseReversal = Math.floor(localTime / 0.45) % 2 === 0 ? 1 : -1;
      value =
        sin(2100, localTime) *
        phaseReversal *
        (0.24 + 0.045 * sin(15, localTime)) *
        envelope(t, 7.8, 10.6);
    } else if (t >= 10.75 && t < 13.1) {
      const localTime = t - 10.75;
      const burst = localTime % 0.62;
      const frequency = Math.floor(localTime / 0.31) % 2 ? 1650 : 1850;
      carrierPhase += (tau * frequency) / rate;
      value =
        (Math.sin(carrierPhase) * 0.2 +
          sin(980, t) * 0.07 +
          phoneNoise * 0.12) *
        envelope(burst, 0, 0.52) *
        envelope(t, 10.75, 13.1);
    } else if (t >= 13.1 && t < 16.8) {
      const localTime = t - 13.1;
      const sweep = localTime % 1.15;
      carrierPhase += (tau * (1250 + 1150 * Math.min(sweep / 0.36, 1))) / rate;
      const flutter = 0.65 + 0.35 * sin(55, localTime);
      value =
        (Math.sin(carrierPhase) * 0.22 * flutter +
          sin(1800, t) * 0.08 +
          phoneNoise * 0.21) *
        envelope(t, 13.1, 16.8);
    } else if (t >= 16.95 && t < 21.6) {
      const nextSymbol = Math.floor((t - 16.95) * 1200);
      if (nextSymbol !== symbol) {
        symbol = nextSymbol;
        symbolPhase = (((seed >>> 12) % 4) * Math.PI) / 2;
      }
      const carrier = Math.sin(tau * 1800 * t + symbolPhase);
      const chatter = 0.7 + 0.3 * sin(23, t);
      value =
        (carrier * 0.2 * chatter + phoneNoise * 0.43 + sin(2400, t) * 0.05) *
        envelope(t, 16.95, 21.6, 0.02);
    } else if (t >= 21.75 && t < 26.5) {
      const localTime = t - 21.75;
      const symbolRate = localTime < 2 ? 600 : 2400;
      const nextSymbol = Math.floor(localTime * symbolRate);
      if (nextSymbol !== symbol) {
        symbol = nextSymbol;
        symbolPhase = (((seed >>> 10) % 8) * Math.PI) / 4;
      }
      const level = localTime < 2 ? 0.26 : 0.19;
      value =
        (Math.sin(tau * 1700 * t + symbolPhase) * level + phoneNoise * 0.54) *
        envelope(t, 21.75, 26.5, 0.025);
    }

    if (t > 0.1 && t < 26.5) value += phoneNoise * 0.013;
    samples[i] = Math.tanh(value * 1.45) * 0.72;
  }
  return buffer;
}

function setupAudio() {
  if (audioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("Web Audio is not available.");
  audioContext = new AudioContextClass();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  waveData = new Uint8Array(analyser.fftSize);
  masterGain = audioContext.createGain();
  masterGain.gain.value = muted ? 0 : Number(ui.volume.value) / 100;
  analyser.connect(masterGain);
  masterGain.connect(audioContext.destination);
}

function setState(nextState) {
  state = nextState;
  ui.dun.dataset.state = state;
  if (state === "idle") {
    ui.status.textContent = "Disconnected.";
    ui.footer.textContent = "Disconnected";
    ui.dunTitle.textContent = "Connect To";
    ui.buttonLabel.textContent = "Connect";
  } else if (state === "connected") {
    ui.status.textContent = "Connected.";
    ui.footer.textContent = "Connected at 56,000 bps";
    ui.dunTitle.textContent = `Connected to ${ISP}`;
    ui.buttonLabel.textContent = "Disconnect";
  } else {
    ui.status.textContent = "Connecting…";
    ui.footer.textContent = "Connecting…";
    ui.dunTitle.textContent = `Connecting to ${ISP}…`;
    ui.buttonLabel.textContent = "Cancel";
  }
}

function setProgress(percent) {
  const value = Math.max(0, Math.min(100, percent));
  ui.progressFill.style.width = `${value}%`;
  ui.progress.setAttribute("aria-valuenow", String(Math.round(value)));
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

function updateConnection() {
  if (state === "idle" || !audioContext) return;
  const elapsed = audioContext.currentTime - startedAt;
  ui.elapsed.textContent = formatTime(elapsed);
  if (state === "connected") {
    if (ui.loop.checked) {
      const remaining = Math.max(
        0,
        Math.ceil(LOOP_PAUSE - (audioContext.currentTime - connectedAt)),
      );
      const message = `Connected. Redialing in ${remaining}s…`;
      if (ui.status.textContent !== message) ui.status.textContent = message;
      if (remaining === 0) {
        clearInterval(stateTimer);
        void connect();
      }
    }
    return;
  }
  setProgress((elapsed / dialupBuffer.duration) * 100);
}

async function connect() {
  const token = ++runToken;
  ui.button.disabled = true;
  try {
    setupAudio();
    await audioContext.resume();
    if (token !== runToken) return;
    if (!dialupBuffer) dialupBuffer = await loadDialup(audioContext);
    if (token !== runToken) return;
    if (source) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    source = audioContext.createBufferSource();
    source.buffer = dialupBuffer;
    source.connect(analyser);
    source.onended = () => {
      if (token !== runToken) return;
      source.disconnect();
      source = null;
      connectedAt = audioContext.currentTime;
      setState("connected");
      setProgress(100);
      document.title = `You're online! ${PAGE_TITLE}`;
      updateConnection();
      animate();
    };
    startedAt = audioContext.currentTime;
    setState("dialing");
    source.start();
    animate();
    document.title = `Connecting… ${PAGE_TITLE}`;
    updateConnection();
    clearInterval(stateTimer);
    stateTimer = setInterval(updateConnection, 100);
  } catch (error) {
    disconnect();
    ui.status.textContent = "Sound couldn't start. Please try connecting again.";
    console.error("Unable to start the modem:", error);
  } finally {
    ui.button.disabled = false;
  }
}

function disconnect() {
  runToken++;
  clearInterval(stateTimer);
  if (source) {
    source.onended = null;
    source.stop();
    source.disconnect();
    source = null;
  }
  setState("idle");
  setProgress(0);
  ui.elapsed.textContent = "00:00:00";
  document.title = PAGE_TITLE;
  animate();
}

function updateVolume() {
  const volume = Number(ui.volume.value);
  if (masterGain)
    masterGain.gain.setTargetAtTime(
      muted ? 0 : volume / 100,
      audioContext.currentTime,
      0.025,
    );
  ui.volumeValue.textContent = muted ? "0%" : `${volume}%`;
  const silent = muted || volume === 0;
  ui.mute.setAttribute("aria-pressed", String(silent));
  ui.mute.setAttribute("aria-label", silent ? "Unmute sound" : "Mute sound");
}

// A GeoCities-style counter of this browser's visits, starting at one.
function bumpCounter() {
  let visits = 1;
  try {
    const previous = Number(localStorage.getItem("handshake-visits"));
    if (Number.isSafeInteger(previous) && previous >= 0)
      visits = Math.min(previous + 1, 9999999);
    localStorage.setItem("handshake-visits", String(visits));
  } catch {
    $("counter-note").textContent = "This visit only — your browser isn’t saving the counter.";
  }
  const digits = String(visits).padStart(7, "0");
  ui.counter.setAttribute("aria-label", `${visits} ${visits === 1 ? "visit" : "visits"} from this browser`);
  ui.counter.replaceChildren(
    ...[...digits].map((digit) => {
      const span = document.createElement("span");
      span.textContent = digit;
      span.setAttribute("aria-hidden", "true");
      return span;
    }),
  );
}

// Use the visible ring directory as the source for Random, so every stop is listed.
const ringSites = [...document.querySelectorAll("[data-ring-site]")].map((link) => link.href);
function chooseRandomSite() {
  $("random-site").href = ringSites[Math.floor(Math.random() * ringSites.length)];
}
$("random-site").addEventListener("click", chooseRandomSite);
chooseRandomSite();

const drawing = ui.canvas.getContext("2d");
let width = 0;
let height = 0;

function sizeCanvas() {
  const rect = ui.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  ui.canvas.width = Math.round(width * ratio);
  ui.canvas.height = Math.round(height * ratio);
  drawing.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawWaveform();
}

// Sound Recorder style: black box, dim center line, bright green trace.
function drawWaveform() {
  drawing.fillStyle = "#000";
  drawing.fillRect(0, 0, width, height);
  const midpoint = height / 2;
  drawing.strokeStyle = "#005500";
  drawing.lineWidth = 1;
  drawing.beginPath();
  drawing.moveTo(0, midpoint + 0.5);
  drawing.lineTo(width, midpoint + 0.5);
  drawing.stroke();
  const hasSound = source && analyser && !reducedMotion.matches;
  if (hasSound) analyser.getByteTimeDomainData(waveData);
  drawing.strokeStyle = "#00ff00";
  drawing.lineWidth = 1.5;
  drawing.beginPath();
  for (let x = 0; x < width; x++) {
    const sample = hasSound
      ? (waveData[Math.floor((x / width) * waveData.length)] - 128) / 128
      : 0;
    const y = midpoint + sample * height * 0.48;
    if (x === 0) drawing.moveTo(x, y);
    else drawing.lineTo(x, y);
  }
  drawing.stroke();
}

function animate() {
  cancelAnimationFrame(animationFrame);
  drawWaveform();
  if (source && !reducedMotion.matches && !document.hidden) {
    animationFrame = requestAnimationFrame(animate);
  }
}

ui.button.addEventListener("click", () =>
  state === "idle" ? void connect() : disconnect(),
);
ui.volume.addEventListener("input", () => {
  muted = false;
  updateVolume();
});
ui.mute.addEventListener("click", () => {
  if (Number(ui.volume.value) === 0) {
    ui.volume.value = "70";
    muted = false;
  } else muted = !muted;
  updateVolume();
});
ui.loop.addEventListener("change", () => {
  if (state === "connected") {
    connectedAt = audioContext.currentTime;
    ui.status.textContent = "Connected.";
    updateConnection();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAnimationFrame(animationFrame);
  else {
    updateConnection();
    cancelAnimationFrame(animationFrame);
    animate();
  }
});
window.addEventListener("pagehide", disconnect);
reducedMotion.addEventListener("change", animate);
new ResizeObserver(sizeCanvas).observe(ui.canvas);
sizeCanvas();
animate();
updateVolume();
bumpCounter();
