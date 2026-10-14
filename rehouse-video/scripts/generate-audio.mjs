// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.resolve(__dirname, '../public/audio');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const SAMPLE_RATE = 44100;

/**
 * Tạo buffer file WAV 16-bit PCM Stereo từ mảng float samples [-1.0, 1.0]
 * @param {Float32Array} leftSamples
 * @param {Float32Array} rightSamples
 * @returns {Buffer}
 */
function createWavBuffer(leftSamples, rightSamples) {
  const numSamples = leftSamples.length;
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;

  const buffer = Buffer.alloc(bufferSize);

  // RIFF Chunk
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(bufferSize - 8, 4);
  buffer.write('WAVE', 8);

  // fmt Subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);

  // data Subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Left channel
    const leftClamped = Math.max(-1, Math.min(1, leftSamples[i]));
    const leftInt16 = leftClamped < 0 ? leftClamped * 0x8000 : leftClamped * 0x7fff;
    buffer.writeInt16LE(Math.round(leftInt16), offset);
    offset += 2;

    // Right channel
    const rightClamped = Math.max(-1, Math.min(1, rightSamples[i]));
    const rightInt16 = rightClamped < 0 ? rightClamped * 0x8000 : rightClamped * 0x7fff;
    buffer.writeInt16LE(Math.round(rightInt16), offset);
    offset += 2;
  }

  return buffer;
}

// -------------------------------------------------------------
// 1. GENERATE BGM: Modern Upbeat SaaS Synth (C - G - Am - F)
// 120 BPM, 46 seconds (đủ trọn vẹn 45s landscape video)
// -------------------------------------------------------------
function generateBgm() {
  const duration = 46.0;
  const totalSamples = Math.floor(SAMPLE_RATE * duration);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const bpm = 120;
  const beatSec = 60 / bpm; // 0.5s
  const beatSamples = Math.floor(SAMPLE_RATE * beatSec);
  const barSamples = beatSamples * 4; // 2.0s

  // Chords progression: C -> G -> Am -> F
  // Frequencies in Hz
  const chords = [
    { root: 65.41, notes: [261.63, 329.63, 392.00, 523.25] }, // C2, C4, E4, G4, C5
    { root: 49.00, notes: [246.94, 293.66, 392.00, 493.88] }, // G1, B3, D4, G4, B4
    { root: 55.00, notes: [220.00, 261.63, 329.63, 440.00] }, // A1, A3, C4, E4, A4
    { root: 43.65, notes: [174.61, 220.00, 261.63, 349.23] }, // F1, F3, A3, C4, F4
  ];

  // Random noise state for shaker / hihat
  let noiseSeed = 12345;
  function randomNoise() {
    noiseSeed = (noiseSeed * 9301 + 49297) % 233280;
    return noiseSeed / 233280 * 2 - 1;
  }

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SAMPLE_RATE;
    const barIndex = Math.floor(i / barSamples);
    const chordIndex = barIndex % chords.length;
    const chord = chords[chordIndex];
    const timeInBar = (i % barSamples) / SAMPLE_RATE;
    const beatProgress = (i % beatSamples) / beatSamples;
    const currentBeat = Math.floor((i % barSamples) / beatSamples);

    let sampleL = 0;
    let sampleR = 0;

    // --- A. Warm Synth Pad / Chords ---
    const padAttack = Math.min(1, timeInBar * 3);
    const padRelease = Math.min(1, (2.0 - timeInBar) * 4);
    const padEnv = padAttack * padRelease * 0.12;

    for (let n = 0; n < chord.notes.length; n++) {
      const freq = chord.notes[n];
      // Slight detune for lush stereo width
      const detuneL = 1.001;
      const detuneR = 0.999;
      const waveL = Math.sin(2 * Math.PI * freq * detuneL * t) + 0.3 * Math.sin(4 * Math.PI * freq * t);
      const waveR = Math.sin(2 * Math.PI * freq * detuneR * t) + 0.3 * Math.sin(4 * Math.PI * freq * t);
      sampleL += waveL * padEnv;
      sampleR += waveR * padEnv;
    }

    // --- B. Bouncy SaaS Sub-Bass (Groovy 8th rhythm) ---
    // Bass plays on beat 0, beat 1.5, beat 2.5, beat 3
    const isBassHit = (currentBeat === 0 && beatProgress < 0.8) ||
                      (currentBeat === 1 && beatProgress > 0.5) ||
                      (currentBeat === 2 && beatProgress > 0.5) ||
                      (currentBeat === 3 && beatProgress < 0.6);
    if (isBassHit) {
      const hitProgress = (beatProgress * 2) % 1;
      const bassEnv = Math.exp(-hitProgress * 6) * 0.22;
      const bassWave = Math.sin(2 * Math.PI * chord.root * t) +
                       0.5 * Math.sin(4 * Math.PI * chord.root * t) +
                       0.2 * Math.sin(6 * Math.PI * chord.root * t);
      sampleL += bassWave * bassEnv;
      sampleR += bassWave * bassEnv;
    }

    // --- C. Tech Arpeggio (Bright 16th notes) ---
    const note16th = Math.floor((timeInBar / 0.125) % chord.notes.length);
    const arpFreq = chord.notes[note16th] * 2; // one octave higher
    const arpTimeIn16th = (timeInBar % 0.125);
    const arpEnv = Math.exp(-arpTimeIn16th * 28) * 0.08;
    const arpWave = Math.sin(2 * Math.PI * arpFreq * t);
    // Pan arpeggio across stereo
    const panOffset = (note16th / chord.notes.length) * 0.6 + 0.2; // 0.2 to 0.8
    sampleL += arpWave * arpEnv * (1 - panOffset);
    sampleR += arpWave * arpEnv * panOffset;

    // --- D. Drums & Percussion ---
    // 1. Kick on beat 0 and beat 2
    if (currentBeat === 0 || currentBeat === 2) {
      const kickT = (i % beatSamples) / SAMPLE_RATE;
      if (kickT < 0.25) {
        const kickPitch = 50 + 90 * Math.exp(-kickT * 35);
        const kickEnv = Math.exp(-kickT * 18) * 0.28;
        const kickWave = Math.sin(2 * Math.PI * kickPitch * kickT);
        sampleL += kickWave * kickEnv;
        sampleR += kickWave * kickEnv;
      }
    }

    // 2. Crisp Clap/Snare on beat 1 and beat 3
    if (currentBeat === 1 || currentBeat === 3) {
      const snareT = (i % beatSamples) / SAMPLE_RATE;
      if (snareT < 0.18) {
        const snareEnv = Math.exp(-snareT * 25) * 0.15;
        const snareNoise = randomNoise();
        sampleL += snareNoise * snareEnv;
        sampleR += snareNoise * snareEnv;
      }
    }

    // 3. Shaker / Hi-hat on every 8th note off-beat
    const eightNoteTime = (i % (beatSamples / 2)) / SAMPLE_RATE;
    if (eightNoteTime < 0.06) {
      const hatEnv = Math.exp(-eightNoteTime * 60) * 0.045;
      const hatNoise = randomNoise();
      sampleL += hatNoise * hatEnv * 0.8;
      sampleR += hatNoise * hatEnv * 1.2;
    }

    // Master soft limit
    left[i] = Math.tanh(sampleL);
    right[i] = Math.tanh(sampleR);
  }

  fs.writeFileSync(path.join(outputDir, 'bgm.wav'), createWavBuffer(left, right));
  console.log('✅ Generated public/audio/bgm.wav (120 BPM SaaS Tech Track)');
}

// -------------------------------------------------------------
// 2. GENERATE WHOOSH SFX (Smooth camera scene transition)
// 0.55s, dynamic frequency sweep
// -------------------------------------------------------------
function generateWhoosh() {
  const duration = 0.55;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  let noise = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;
    // Bell curve amplitude envelope
    const env = Math.sin(Math.PI * t) ** 2.2 * 0.45;
    // Noise + moving resonance
    const whiteNoise = (Math.random() * 2 - 1);
    // Simple 1-pole lowpass filter with moving cutoff
    const cutoff = 0.04 + 0.3 * Math.sin(Math.PI * t);
    noise = noise + cutoff * (whiteNoise - noise);

    // Stereo panning from left (-1) to right (+1)
    const pan = t; // 0 to 1
    left[i] = noise * env * (1 - pan * 0.7);
    right[i] = noise * env * (0.3 + pan * 0.7);
  }

  fs.writeFileSync(path.join(outputDir, 'whoosh.wav'), createWavBuffer(left, right));
  console.log('✅ Generated public/audio/whoosh.wav (Scene transition SFX)');
}

// -------------------------------------------------------------
// 3. GENERATE POP SFX (UI Card bounce / Notification pop)
// 0.12s, bouncy bubble frequency drop
// -------------------------------------------------------------
function generatePop() {
  const duration = 0.12;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Pitch drops quickly from 850Hz to 160Hz
    const freq = 160 + 690 * Math.exp(-t * 45);
    const env = Math.exp(-t * 35) * 0.5;
    const wave = Math.sin(2 * Math.PI * freq * t);

    left[i] = wave * env;
    right[i] = wave * env;
  }

  fs.writeFileSync(path.join(outputDir, 'pop.wav'), createWavBuffer(left, right));
  console.log('✅ Generated public/audio/pop.wav (Card pop SFX)');
}

// -------------------------------------------------------------
// 4. GENERATE QR-BEEP SFX (PayOS VietQR scan confirmation)
// 0.28s, 2 sharp tech beeps
// -------------------------------------------------------------
function generateQrBeep() {
  const duration = 0.28;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let wave = 0;
    // Beep 1: at t=0s to 0.06s (1760Hz)
    if (t < 0.06) {
      const env = Math.sin(Math.PI * (t / 0.06)) * 0.42;
      wave = Math.sin(2 * Math.PI * 1760 * t) * env;
    }
    // Beep 2: at t=0.08s to 0.20s (2349Hz, higher confirmation tone)
    else if (t >= 0.08 && t < 0.20) {
      const localT = t - 0.08;
      const env = Math.sin(Math.PI * (localT / 0.12)) * 0.48;
      wave = Math.sin(2 * Math.PI * 2349 * localT) * env;
    }

    left[i] = wave;
    right[i] = wave;
  }

  fs.writeFileSync(path.join(outputDir, 'qr-beep.wav'), createWavBuffer(left, right));
  console.log('✅ Generated public/audio/qr-beep.wav (QR scanner SFX)');
}

// -------------------------------------------------------------
// 5. GENERATE CASH-SUCCESS SFX (Webhook PayOS Paid Ding / Chime)
// 1.8s, Crystal Chime Major 9 chord with warm decay
// -------------------------------------------------------------
function generateCashSuccess() {
  const duration = 1.8;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // Arpeggiated C Major 9 chord: C6, E6, G6, B6, D7
  const notes = [
    { freq: 1046.50, delay: 0.00 },
    { freq: 1318.51, delay: 0.03 },
    { freq: 1567.98, delay: 0.06 },
    { freq: 1975.53, delay: 0.09 },
    { freq: 2349.32, delay: 0.12 },
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let sampleL = 0;
    let sampleR = 0;

    for (let n = 0; n < notes.length; n++) {
      const note = notes[n];
      if (t >= note.delay) {
        const localT = t - note.delay;
        // Harmonic bell decay
        const env = Math.exp(-localT * 3.2) * 0.16;
        // Bell timbre with partials
        const fundamental = Math.sin(2 * Math.PI * note.freq * localT);
        const partial = 0.4 * Math.sin(2 * Math.PI * note.freq * 2.76 * localT);
        const wave = (fundamental + partial) * env;

        // Stereo spreading for lush spatial sparkle
        const pan = (n / (notes.length - 1)); // 0 to 1
        sampleL += wave * (1 - pan * 0.5);
        sampleR += wave * (0.5 + pan * 0.5);
      }
    }

    left[i] = Math.tanh(sampleL);
    right[i] = Math.tanh(sampleR);
  }

  fs.writeFileSync(path.join(outputDir, 'cash-success.wav'), createWavBuffer(left, right));
  console.log('✅ Generated public/audio/cash-success.wav (Payment success chime SFX)');
}

// Run all generators
console.log('🎵 Synthesizing high-fidelity audio assets for ReHouse Video...');
generateBgm();
generateWhoosh();
generatePop();
generateQrBeep();
generateCashSuccess();
console.log('🎉 All audio assets generated successfully in rehouse-video/public/audio/');
