(function exposePitchTools(root, factory) {
  const tools = factory();
  if (typeof module === 'object' && module.exports) module.exports = tools;
  root.PitchTools = tools;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPitchTools() {
  const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  let downsampled = new Float32Array(0);
  let difference = new Float32Array(0);
  let cumulative = new Float32Array(0);

  function ensureScratchSpace(sampleCount, tauCount) {
    if (downsampled.length < sampleCount) downsampled = new Float32Array(sampleCount);
    if (difference.length < tauCount) difference = new Float32Array(tauCount);
    if (cumulative.length < tauCount) cumulative = new Float32Array(tauCount);
  }

  function frequencyToMidi(value) {
    return 69 + (12 * Math.log2(value / 440));
  }

  function midiToFrequency(value) {
    return 440 * (2 ** ((value - 69) / 12));
  }

  function describeFrequency(value) {
    const exactMidi = frequencyToMidi(value);
    const midi = Math.round(exactMidi);
    return {
      midi,
      name: NOTE_NAMES[((midi % 12) + 12) % 12],
      octave: Math.floor(midi / 12) - 1,
      targetFrequency: midiToFrequency(midi),
      cents: (exactMidi - midi) * 100,
    };
  }

  function centsFromTarget(value, target) {
    return 1200 * Math.log2(value / target);
  }

  function detectPitch(samples, sampleRate, options = {}) {
    const minFrequency = options.minFrequency || 60;
    const maxFrequency = options.maxFrequency || 500;
    const threshold = options.threshold || 0.12;
    const minimumRms = options.minimumRms || 0.008;
    // Guitar fundamentals top out well below the Nyquist frequency. Reducing the
    // working sample rate preserves the same time window while cutting YIN's
    // O(samples × candidate periods) comparison count by roughly four.
    const downsampleFactor = Math.max(1, Math.floor(options.downsampleFactor ?? 2));
    const size = Math.floor(samples.length / downsampleFactor);
    const workingSampleRate = sampleRate / downsampleFactor;
    // Keep one candidate outside each requested edge so interpolation remains
    // accurate for notes close to the configured minimum and maximum.
    const minTau = Math.max(2, Math.floor(workingSampleRate / maxFrequency) - 1);
    const maxTau = Math.min(Math.ceil(workingSampleRate / minFrequency) + 1, Math.floor(size / 2));
    ensureScratchSpace(size, maxTau + 1);

    let workingSamples = samples;
    if (downsampleFactor > 1) {
      const scale = 1 / downsampleFactor;
      for (let i = 0; i < size; i += 1) {
        let sum = 0;
        const offset = i * downsampleFactor;
        for (let j = 0; j < downsampleFactor; j += 1) sum += samples[offset + j];
        downsampled[i] = sum * scale;
      }
      workingSamples = downsampled;
    }

    let mean = 0;
    for (let i = 0; i < size; i += 1) mean += workingSamples[i];
    mean /= size;

    let energy = 0;
    for (let i = 0; i < size; i += 1) {
      const centered = workingSamples[i] - mean;
      energy += centered * centered;
    }
    const rms = Math.sqrt(energy / size);
    if (rms < minimumRms) return { frequency: null, confidence: 0, rms };

    const windowSize = size - maxTau;

    for (let tau = 1; tau <= maxTau; tau += 1) {
      let sum = 0;
      for (let i = 0; i < windowSize; i += 1) {
        const delta = workingSamples[i] - workingSamples[i + tau];
        sum += delta * delta;
      }
      difference[tau] = sum;
    }

    cumulative[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= maxTau; tau += 1) {
      runningSum += difference[tau];
      cumulative[tau] = runningSum === 0 ? 1 : (difference[tau] * tau) / runningSum;
    }

    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
      if (cumulative[tau] < threshold) {
        while (tau + 1 <= maxTau && cumulative[tau + 1] < cumulative[tau]) tau += 1;
        tauEstimate = tau;
        break;
      }
    }

    if (tauEstimate < 0) {
      let bestValue = 1;
      for (let tau = minTau; tau <= maxTau; tau += 1) {
        if (cumulative[tau] < bestValue) {
          bestValue = cumulative[tau];
          tauEstimate = tau;
        }
      }
      if (tauEstimate < 0 || bestValue > 0.28) return { frequency: null, confidence: 0, rms };
    }

    const y1 = cumulative[tauEstimate];
    let adjustment = 0;
    // Parabolic interpolation needs a real sample on both sides. Reusing the
    // boundary sample biases pitches that sit exactly at the configured limits.
    if (tauEstimate > minTau && tauEstimate < maxTau) {
      const y0 = cumulative[tauEstimate - 1];
      const y2 = cumulative[tauEstimate + 1];
      const denominator = y0 - (2 * y1) + y2;
      adjustment = denominator === 0 ? 0 : 0.5 * (y0 - y2) / denominator;
    }
    const refinedTau = tauEstimate + Math.max(-1, Math.min(1, adjustment));
    const confidence = Math.max(0, Math.min(1, 1 - y1));

    const frequency = Math.max(minFrequency, Math.min(maxFrequency, workingSampleRate / refinedTau));
    return { frequency, confidence, rms };
  }

  return { NOTE_NAMES, frequencyToMidi, midiToFrequency, describeFrequency, centsFromTarget, detectPitch };
});
