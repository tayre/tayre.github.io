(function createSpectrumVisualizer() {
  const canvas = document.querySelector('#spectrum-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'high-performance' });
  if (!gl) {
    canvas.classList.add('webgl-fallback');
    return;
  }

  const MIN_FREQUENCY = 72;
  const MAX_FREQUENCY = 680;
  const LOG_MIN = Math.log2(MIN_FREQUENCY / 440);
  const LOG_RANGE = Math.log2(MAX_FREQUENCY / MIN_FREQUENCY);
  const STRINGS = [
    { name: 'E', octave: 2, frequency: 82.4069 },
    { name: 'A', octave: 2, frequency: 110 },
    { name: 'D', octave: 3, frequency: 146.8324 },
    { name: 'G', octave: 3, frequency: 195.9977 },
    { name: 'B', octave: 3, frequency: 246.9417 },
    { name: 'E', octave: 4, frequency: 329.6276 },
  ];
  const frequencyToUnit = frequency => (Math.log2(frequency / 440) - LOG_MIN) / LOG_RANGE;
  const stringUnits = STRINGS.map(string => frequencyToUnit(string.frequency));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const labelHost = document.querySelector('.spectrum-labels');
  const labels = STRINGS.map((string, index) => {
    const label = document.createElement('span');
    label.style.bottom = `${(stringUnits[index] * 100).toFixed(2)}%`;
    label.innerHTML = `<b>${string.name}<sub>${string.octave}</sub></b><i>${string.frequency.toFixed(string.frequency < 100 ? 1 : 0)} Hz</i>`;
    labelHost?.append(label);
    return label;
  });

  const vertexShaderSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
      vUv = aPosition * 0.5 + 0.5;
    }
  `;
  // highp: mediump log/pow math visibly bands the semitone grid on mobile GPUs
  const fragmentShaderSource = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uSpectrum;
    uniform sampler2D uChroma;
    uniform float uChord;
    uniform float uFreqSpan;
    uniform float uLogMin;
    uniform float uLogRange;
    uniform float uStrings[6];
    uniform float uActiveIndex;
    uniform float uActiveY;
    uniform float uCursorY;
    uniform float uCursorAlive;
    uniform float uTune;
    uniform float uLock;
    uniform float uPulse;
    uniform float uLevel;

    void main() {
      float logF = uLogMin + vUv.y * uLogRange;
      float freq = 440.0 * pow(2.0, logF);
      float magnitude = pow(texture2D(uSpectrum, vec2(freq / uFreqSpan, 0.5)).r, 1.45);
      float dx = abs(vUv.x - 0.5);
      vec3 low = vec3(0.47, 0.84, 0.90);
      vec3 high = vec3(1.0, 0.47, 0.36);
      vec3 tuned = vec3(0.71, 0.95, 0.42);
      vec3 color = vec3(0.0);

      float semitoneDistance = abs(fract(logF * 12.0 + 0.5) - 0.5);
      color += vec3(0.40, 0.47, 0.42) * (1.0 - smoothstep(0.0, 0.018, semitoneDistance)) * 0.10;

      // chord mode: every octave of a sounding pitch class lights its semitone line
      float pitchClass = mod(floor(logF * 12.0 + 0.5), 12.0);
      float chromaValue = texture2D(uChroma, vec2((pitchClass + 0.5) / 12.0, 0.5)).r;
      float classLine = 1.0 - smoothstep(0.0, 0.03, semitoneDistance);
      float classGlow = 1.0 - smoothstep(0.0, 0.18, semitoneDistance);
      color += mix(low, tuned, chromaValue) * (classLine * 0.85 + classGlow * 0.20) * chromaValue * uChord;

      float envelope = magnitude * (0.40 + uLevel * 0.12);
      float body = 1.0 - smoothstep(0.0, envelope + 1e-4, dx);
      float core = 1.0 - smoothstep(0.0, envelope * 0.22 + 1e-4, dx);
      float bloomScale = magnitude * (1.0 - 0.6 * uChord);
      color += mix(vec3(0.30, 0.60, 0.65), vec3(0.44, 0.70, 0.33), uLock) * body * body * bloomScale * 1.15;
      color += vec3(0.82, 0.93, 0.88) * core * bloomScale * 0.45;

      for (int i = 0; i < 6; i += 1) {
        float dy = abs(vUv.y - uStrings[i]);
        float line = exp(-dy * dy * 120000.0);
        float glow = exp(-dy * dy * 9000.0);
        float active = 1.0 - min(abs(float(i) - uActiveIndex), 1.0);
        vec3 lineColor = mix(vec3(0.40, 0.47, 0.42), mix(vec3(0.66, 0.72, 0.64), tuned, uLock), active);
        color += lineColor * (line + glow * 0.22) * mix(0.30, 0.90 + uLock * 0.5, active) * (1.0 - 0.7 * uChord);
      }

      float cursorDistance = abs(vUv.y - uCursorY);
      float needle = exp(-cursorDistance * cursorDistance * 160000.0) + exp(-cursorDistance * cursorDistance * 11000.0) * 0.30;
      vec3 needleColor = uTune < -0.5 ? low : (uTune > 0.5 ? high : tuned);
      color += needleColor * needle * uCursorAlive * (0.90 + uLock * 0.7);

      if (uActiveY > -0.5 && uPulse > 0.0 && uPulse < 1.0) {
        float targetDistance = abs(vUv.y - uActiveY);
        float ring = exp(-pow((targetDistance - uPulse * 0.20) * 70.0, 2.0)) * (1.0 - uPulse);
        color += tuned * ring * 0.9;
      }

      float alpha = clamp(max(color.r, max(color.g, color.b)), 0.0, 1.0);
      gl_FragColor = vec4(min(color, vec3(1.0)), alpha);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {};
  for (const name of ['uSpectrum', 'uChroma', 'uChord', 'uFreqSpan', 'uLogMin', 'uLogRange', 'uStrings', 'uActiveIndex', 'uActiveY', 'uCursorY', 'uCursorAlive', 'uTune', 'uLock', 'uPulse', 'uLevel']) {
    uniforms[name] = gl.getUniformLocation(program, name === 'uStrings' ? 'uStrings[0]' : name);
  }
  gl.uniform1f(uniforms.uLogMin, LOG_MIN);
  gl.uniform1f(uniforms.uLogRange, LOG_RANGE);
  gl.uniform1fv(uniforms.uStrings, stringUnits);
  gl.uniform1i(uniforms.uSpectrum, 0);
  gl.uniform1i(uniforms.uChroma, 1);
  gl.uniform1f(uniforms.uFreqSpan, 1);
  gl.uniform1f(uniforms.uChord, 0);

  // NPOT-width textures: WebGL1 requires CLAMP_TO_EDGE and no mipmaps,
  // and LUMINANCE rows aren't 4-byte aligned
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  function createDataTexture(unit, width, filter) {
    gl.activeTexture(unit);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array(width));
    return texture;
  }
  createDataTexture(gl.TEXTURE0, 1, gl.LINEAR);
  // NEAREST so one class's brightness never bleeds into its neighbours
  createDataTexture(gl.TEXTURE1, 12, gl.NEAREST);
  gl.activeTexture(gl.TEXTURE0);

  const state = { level: 0, cursorFrequency: 0, tune: 0, activeString: null, listening: false, locked: false, chordMode: false };
  const chromaTarget = new Float32Array(12);
  const chromaCurrent = new Float32Array(12);
  const chromaBytes = new Uint8Array(12);
  let chromaMoving = false;
  let chordAmount = 0;
  let analyserSource = null;
  let spectrumBins = null;
  let binCount = 1;
  let smoothLevel = 0;
  let cursorY = 0.5;
  let cursorAlive = 0;
  let lockAmount = 0;
  let pulse = 1;
  let wasLocked = false;
  let lastTime = 0;
  let pixelWidth = 0;
  let pixelHeight = 0;
  let frameHandle = null;

  function shouldAnimate() {
    return Boolean(analyserSource)
      || pulse < 1
      || Math.abs(lockAmount - (state.locked ? 1 : 0)) > 0.002
      || Math.abs(chordAmount - (state.chordMode ? 1 : 0)) > 0.002
      || chromaMoving
      || cursorAlive > 0.01
      || Math.abs(smoothLevel - state.level) > 0.002;
  }

  function render(time) {
    const delta = Math.min(50, time - lastTime);
    lastTime = time;
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      gl.viewport(0, 0, pixelWidth, pixelHeight);
    }

    if (analyserSource) {
      analyserSource.getByteFrequencyData(spectrumBins);
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, binCount, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, spectrumBins.subarray(0, binCount));
    }

    chromaMoving = false;
    for (let i = 0; i < 12; i += 1) {
      const difference = chromaTarget[i] - chromaCurrent[i];
      if (Math.abs(difference) > 0.004) chromaMoving = true;
      chromaCurrent[i] += difference * 0.25;
      chromaBytes[i] = chromaCurrent[i] * 255;
    }
    if (chromaMoving || chordAmount > 0.002) {
      gl.activeTexture(gl.TEXTURE1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 12, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, chromaBytes);
      gl.activeTexture(gl.TEXTURE0);
    }
    chordAmount += ((state.chordMode ? 1 : 0) - chordAmount) * 0.12;

    smoothLevel += (state.level - smoothLevel) * 0.15;
    const active = state.activeString;
    const activeY = active === null ? -1 : stringUnits[active];
    const cursorTarget = state.locked && active !== null
      ? activeY
      : (state.cursorFrequency > 0 ? Math.max(0, Math.min(1, frequencyToUnit(state.cursorFrequency))) : cursorY);
    const aliveTarget = state.cursorFrequency > 0 || state.locked ? 1 : 0;
    cursorAlive += (aliveTarget - cursorAlive) * (aliveTarget ? 0.3 : 0.05);
    cursorY = cursorAlive < 0.03 ? cursorTarget : cursorY + (cursorTarget - cursorY) * 0.22;

    if (state.locked && !wasLocked && !reducedMotion) pulse = 0;
    wasLocked = state.locked;
    pulse = Math.min(1, pulse + delta / 900);
    lockAmount += ((state.locked ? 1 : 0) - lockAmount) * 0.1;

    labels.forEach((label, index) => {
      label.classList.toggle('active', index === active);
      label.classList.toggle('locked', index === active && state.locked);
    });

    gl.uniform1f(uniforms.uActiveIndex, active === null ? -1 : active);
    gl.uniform1f(uniforms.uActiveY, activeY);
    gl.uniform1f(uniforms.uCursorY, cursorY);
    gl.uniform1f(uniforms.uCursorAlive, cursorAlive);
    gl.uniform1f(uniforms.uTune, state.tune);
    gl.uniform1f(uniforms.uLock, lockAmount);
    gl.uniform1f(uniforms.uPulse, pulse);
    gl.uniform1f(uniforms.uLevel, smoothLevel);
    gl.uniform1f(uniforms.uChord, chordAmount);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function loop(time) {
    frameHandle = null;
    render(time);
    if (shouldAnimate()) frameHandle = requestAnimationFrame(loop);
  }

  // the loop parks itself when nothing moves; every input kicks it awake
  function kick() {
    if (frameHandle === null) {
      lastTime = performance.now();
      frameHandle = requestAnimationFrame(loop);
    }
  }

  const observer = new ResizeObserver(entries => {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = entries[entries.length - 1].contentRect;
    pixelWidth = Math.max(1, Math.round(rect.width * scale));
    pixelHeight = Math.max(1, Math.round(rect.height * scale));
    kick();
  });
  observer.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  window.tunerVisualizer = {
    setSource(analyser, rate) {
      analyserSource = analyser || null;
      if (!analyserSource) {
        gl.activeTexture(gl.TEXTURE0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
        gl.uniform1f(uniforms.uFreqSpan, 1);
        chromaTarget.fill(0);
        kick();
        return;
      }
      const binWidth = rate / (analyserSource.frequencyBinCount * 2);
      binCount = Math.min(analyserSource.frequencyBinCount, Math.ceil((MAX_FREQUENCY * 1.05) / binWidth));
      spectrumBins = new Uint8Array(analyserSource.frequencyBinCount);
      gl.uniform1f(uniforms.uFreqSpan, binCount * binWidth);
      kick();
    },
    setState(nextState) {
      const { chroma, ...rest } = nextState;
      if (chroma) chromaTarget.set(chroma);
      Object.assign(state, rest);
      kick();
    },
  };
  kick();
})();
