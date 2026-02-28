const MUSIC_STEP = 60 / 140 / 2; // 8th note at 140 BPM

const MUSIC_MELODY = [
  523, 659, 784, 659, 523, 659, 587,   0,
  494, 587, 740, 587, 494, 587, 523,   0,
  523, 659, 784, 659, 523, 659, 880, 784,
  698, 659, 587, 523,   0,   0,   0,   0,
];

const MUSIC_BASS = [
  131,   0, 165,   0, 196,   0, 165,   0,
  123,   0, 147,   0, 185,   0, 147,   0,
  131,   0, 165,   0, 196,   0, 220,   0,
  175,   0, 131,   0, 196,   0, 131,   0,
];

function scheduleNote(ctx, freq, type, vol, t, dur) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.8);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export function scheduleMusic(ctx, timerRef, loopStart) {
  const dur = MUSIC_MELODY.length * MUSIC_STEP;
  const t   = loopStart ?? ctx.currentTime + 0.05;
  MUSIC_MELODY.forEach((f, i) => {
    if (f) scheduleNote(ctx, f, 'square',   0.06, t + i * MUSIC_STEP, MUSIC_STEP);
  });
  MUSIC_BASS.forEach((f, i) => {
    if (f) scheduleNote(ctx, f, 'triangle', 0.05, t + i * MUSIC_STEP, MUSIC_STEP * 1.9);
  });
  const ms = (t + dur - 0.4 - ctx.currentTime) * 1000;
  timerRef.current = setTimeout(
    () => { if (ctx.state === 'running') scheduleMusic(ctx, timerRef, t + dur); },
    Math.max(0, ms),
  );
}
