(function exposePitchTools(root, factory) {
  const tools = factory();
  if (typeof module === 'object' && module.exports) module.exports = tools;
  root.PitchTools = tools;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPitchTools() {
  const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

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
    const size = samples.length;

    let mean = 0;
    for (let i = 0; i < size; i += 1) mean += samples[i];
    mean /= size;

    let energy = 0;
    for (let i = 0; i < size; i += 1) {
      const centered = samples[i] - mean;
      energy += centered * centered;
    }
    const rms = Math.sqrt(energy / size);
    if (rms < minimumRms) return { frequency: null, confidence: 0, rms };

    const minTau = Math.max(2, Math.floor(sampleRate / maxFrequency));
    const maxTau = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(size / 2));
    const windowSize = size - maxTau;
    const difference = new Float64Array(maxTau + 1);
    const cumulative = new Float64Array(maxTau + 1);

    for (let tau = 1; tau <= maxTau; tau += 1) {
      let sum = 0;
      for (let i = 0; i < windowSize; i += 1) {
        const delta = samples[i] - samples[i + tau];
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

    const left = Math.max(minTau, tauEstimate - 1);
    const right = Math.min(maxTau, tauEstimate + 1);
    const y0 = cumulative[left];
    const y1 = cumulative[tauEstimate];
    const y2 = cumulative[right];
    const denominator = y0 - (2 * y1) + y2;
    const adjustment = denominator === 0 ? 0 : 0.5 * (y0 - y2) / denominator;
    const refinedTau = tauEstimate + Math.max(-1, Math.min(1, adjustment));
    const confidence = Math.max(0, Math.min(1, 1 - y1));

    return { frequency: sampleRate / refinedTau, confidence, rms };
  }

  return { NOTE_NAMES, frequencyToMidi, midiToFrequency, describeFrequency, centsFromTarget, detectPitch };
});
