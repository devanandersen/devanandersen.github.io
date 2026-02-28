import { useEffect, useRef, useState } from 'preact/hooks';
import './Game.css';

// ─── Sprite sheet constants ────────────────────────────────────────────────
// Sheet layout: 6 cols × 3 rows, 226 × 261 px per frame
const FRAME_W    = 226;
const FRAME_H    = 261;
const COLS       = 6;
const RUN_FRAMES = [0, 1, 2, 3, 4, 5];  // row 0
const JUMP_FRAME = 9;                    // row 1, col 3
const DEAD_FRAME = 11;                   // row 1, col 5

// On-screen display size (maintains 226:261 aspect ratio)
const CHAR_H        = 96;
const CHAR_W        = Math.round(CHAR_H * FRAME_W / FRAME_H); // ≈ 83 px
const CHAR_FOOT_OFF = 10; // empty px below feet in sprite frame

// ─── Background removal (green-screen keying) ─────────────────────────────
// Sprite sheet is flattened onto solid green. Any pixel where green
// dominates red and blue is zeroed out.
function processSprite(img) {
  const oc  = document.createElement('canvas');
  oc.width  = img.naturalWidth;
  oc.height = img.naturalHeight;
  const ox  = oc.getContext('2d', { willReadFrequently: true });
  ox.drawImage(img, 0, 0);
  const id  = ox.getImageData(0, 0, oc.width, oc.height);
  const d   = id.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (g > 100 && g > r + 40 && g > b + 40) {
      d[i + 3] = 0;
    }
  }

  ox.putImageData(id, 0, 0);
  return oc;
}

// Draws one frame from the processed sprite canvas at target position / size
function drawSprite(ctx, spriteCanvas, frameIdx, dx, dy, dw, dh) {
  const col = frameIdx % COLS;
  const row = Math.floor(frameIdx / COLS);
  ctx.drawImage(
    spriteCanvas,
    col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H,
    dx, dy, dw, dh,
  );
}

// ─── Physics / speed ──────────────────────────────────────────────────────
const GRAVITY     = 0.62;
const JUMP_FORCE  = -15;
const INIT_SPEED  = 5;
const MAX_SPEED   = 22;
const SCORE_RATE  = 0.009;
const SPEED_RATE  = 0.014;

// ─── Obstacle spacing ─────────────────────────────────────────────────────
const MIN_GAP_PX  = 420;
const MAX_GAP_PX  = 950;

// ─── Animation ────────────────────────────────────────────────────────────
const ANIM_FPS    = 10;

// ─── Ground ───────────────────────────────────────────────────────────────
const GROUND_RATIO = 0.76;

// ─────────────────────────────────────────────────────────────────────────
//  City obstacle bitmaps
//  palette indices: 0 = transparent, 1+ = palette[index - 1]
// ─────────────────────────────────────────────────────────────────────────
const OBSTACLE_DEFS = [
  // Type 0 — street lamp
  // 1=pole  2=lamp
  {
    scale: 7,
    palette: ['#5c5c80', '#fce060'],
    rows: [
      [0,0,2,2,0],
      [0,0,2,2,0],
      [0,1,1,0,0],
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,1,1,1,0],
      [0,1,1,1,0],
    ],
  },
  // Type 1 — fire hydrant
  // 1=body
  {
    scale: 8,
    palette: ['#b82a18'],
    rows: [
      [0,1,1,1,0],
      [1,1,1,1,1],
      [0,1,1,1,0],
      [0,1,1,1,0],
      [0,1,1,1,0],
      [1,1,1,1,1],
      [1,1,1,1,1],
    ],
  },
  // Type 2 — trash can
  // 1=body  2=lid
  {
    scale: 7,
    palette: ['#4a4a5a', '#6a6a7a'],
    rows: [
      [0,2,2,2,0],
      [2,2,2,2,2],
      [1,1,1,1,1],
      [1,1,1,1,1],
      [1,1,1,1,1],
      [1,1,1,1,1],
      [1,1,1,1,1],
      [1,1,1,1,1],
      [0,1,1,1,0],
    ],
  },
];

function getObstacleSize(type) {
  const d = OBSTACLE_DEFS[type];
  return { w: d.rows[0].length * d.scale, h: d.rows.length * d.scale };
}

function drawObstacle(ctx, x, groundY, type) {
  const { rows, scale, palette } = OBSTACLE_DEFS[type];
  const totalH = rows.length * scale;
  const startY = groundY - totalH;
  rows.forEach((row, ri) => {
    row.forEach((colorIdx, ci) => {
      if (!colorIdx) return;
      ctx.fillStyle = palette[colorIdx - 1];
      ctx.fillRect(x + ci * scale, startY + ri * scale, scale, scale);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Building / skyline generation
// ─────────────────────────────────────────────────────────────────────────
function genBuildings(count, minW, maxW, minH, maxH) {
  const buildings = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    const bw     = minW + Math.floor(Math.random() * (maxW - minW + 1));
    const bh     = minH + Math.floor(Math.random() * (maxH - minH + 1));
    const floorH = 14, colW = 12;
    const floors = Math.floor(bh / floorH);
    const cols   = Math.floor(bw / colW);
    const windows = [];
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.3) windows.push({ f, c, lit: Math.random() > 0.25 });
      }
    }
    buildings.push({ x, bw, bh, floors, cols, floorH, colW, windows });
    x += bw + 3 + Math.floor(Math.random() * 10);
  }
  return { buildings, totalW: x };
}

// ─────────────────────────────────────────────────────────────────────────
//  Star field
// ─────────────────────────────────────────────────────────────────────────
function genStars(w, groundY) {
  return Array.from({ length: 180 }, () => ({
    x:  Math.random() * w,
    y:  Math.random() * groundY * 0.88,
    r:  Math.random() < 0.2 ? 1.4 : 0.8,
    a:  0.45 + Math.random() * 0.55,
    tw: 0.25 + Math.random() * 1.1,
    tp: Math.random() * Math.PI * 2,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
//  Draw helpers
// ─────────────────────────────────────────────────────────────────────────
function drawSky(ctx, w, groundY) {
  const g = ctx.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0,   '#0b0920');
  g.addColorStop(0.6, '#171232');
  g.addColorStop(1,   '#201a45');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, groundY);
}

function drawStars(ctx, stars, t) {
  stars.forEach(s => {
    const alpha = s.a * (0.65 + 0.35 * Math.sin(t * 0.001 * s.tw + s.tp));
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawLayer(ctx, layer, offset, groundY, alpha) {
  const { buildings, totalW } = layer;
  if (totalW === 0) return;
  ctx.globalAlpha = alpha;
  buildings.forEach(b => {
    for (let rep = -1; rep < 3; rep++) {
      const bx = b.x - (offset % totalW) + rep * totalW;
      if (bx > ctx.canvas.width + 200 || bx + b.bw < -200) continue;
      const by = groundY - b.bh;
      ctx.fillStyle = '#080717';
      ctx.fillRect(bx, by, b.bw, b.bh);
      b.windows.forEach(win => {
        if (!win.lit) return;
        const wx = bx + win.c * b.colW + 3;
        const wy = by + win.f * b.floorH + 3;
        ctx.fillStyle = '#f4c540';
        ctx.fillRect(wx, wy, 5, 7);
        ctx.fillStyle = 'rgba(244,197,64,0.12)';
        ctx.fillRect(wx - 2, wy - 2, 9, 11);
      });
    }
  });
  ctx.globalAlpha = 1;
}

function drawGround(ctx, w, groundY, canvasH, scrollOff) {
  ctx.fillStyle = '#100e24';
  ctx.fillRect(0, groundY, w, canvasH - groundY);
  ctx.fillStyle = '#5555aa';
  ctx.fillRect(0, groundY, w, 2);

  ctx.strokeStyle = 'rgba(80,80,160,0.35)';
  ctx.lineWidth = 1;
  for (let y = groundY + 18; y < canvasH; y += 22) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const spacing = 55;
  const startX  = -(scrollOff % spacing);
  for (let x = startX; x < w + spacing; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x, canvasH); ctx.stroke();
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Chiptune music
// ─────────────────────────────────────────────────────────────────────────
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

function scheduleMusic(ctx, timerRef, loopStart) {
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

// ─────────────────────────────────────────────────────────────────────────
//  Pixel gear icon
// ─────────────────────────────────────────────────────────────────────────
const GEAR_GRID = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [1,1,1,0,0,1,1,1],
  [1,1,0,0,0,0,1,1],
  [1,1,0,0,0,0,1,1],
  [1,1,1,0,0,1,1,1],
  [0,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,0,0],
];

function GearIcon({ size = 16, color = '#4848a0' }) {
  const px = size / 8;
  return (
    <svg width={size} height={size} style={{ display: 'block', imageRendering: 'pixelated' }}>
      {GEAR_GRID.flatMap((row, r) =>
        row.map((on, c) => on
          ? <rect key={`${r}-${c}`} x={c * px} y={r * px} width={px} height={px} fill={color} />
          : null
        )
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Main Game component
// ─────────────────────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef       = useRef(null);
  const gRef            = useRef(null);
  const rafRef          = useRef(null);
  const spriteCanvasRef = useRef(null);

  const scoreElRef = useRef(null);
  const hiElRef    = useRef(null);

  const [phase, setPhase] = useState('intro');
  const setPhaseRef = useRef(setPhase);
  useEffect(() => { setPhaseRef.current = setPhase; });

  const [music, setMusic]               = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const audioCtxRef   = useRef(null);
  const musicTimerRef = useRef(null);

  const PHYSICS_DEFAULTS = {
    gravity:   GRAVITY,
    jumpForce: JUMP_FORCE,
    initSpeed: INIT_SPEED,
    maxSpeed:  MAX_SPEED,
    speedRate: SPEED_RATE,
    minGap:    MIN_GAP_PX,
    maxGap:    MAX_GAP_PX,
  };
  const [physics, setPhysics] = useState(PHYSICS_DEFAULTS);
  const physicsRef = useRef(physics);
  useEffect(() => { physicsRef.current = physics; }, [physics]);

  useEffect(() => {
    if (!music) {
      clearTimeout(musicTimerRef.current);
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      return;
    }
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    scheduleMusic(ctx, musicTimerRef);
    return () => { clearTimeout(musicTimerRef.current); ctx.close(); };
  }, [music]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Load & process sprite ────────────────────────────────────────────
    const img   = new Image();
    img.onload  = () => { spriteCanvasRef.current = processSprite(img); };
    img.src     = '/runner-sprite.png';

    // ── Helpers ──────────────────────────────────────────────────────────
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      const g = gRef.current;
      if (g) {
        g.w    = canvas.width;
        g.h    = canvas.height;
        g.gndY = Math.floor(canvas.height * GROUND_RATIO);
        g.stars = genStars(g.w, g.gndY);
      }
    };

    const makeState = () => {
      const w    = canvas.width;
      const h    = canvas.height;
      const gndY = Math.floor(h * GROUND_RATIO);
      return {
        w, h, gndY,
        phase:   'intro',
        score:   0,
        hiScore: parseInt(localStorage.getItem('da_hi') || '0', 10),
        speed:   physicsRef.current.initSpeed,
        t:       0,

        char: {
          x:         110,
          y:         gndY - CHAR_H + CHAR_FOOT_OFF,
          vy:        0,
          grounded:  true,
          frame:     0,
          frameTick: 0,
          bounce:    0,
        },

        obs:     [],
        nextGap: 1400,

        gndOff:  0,
        farOff:  0,
        nearOff: 0,

        stars: genStars(w, gndY),
        far:   genBuildings(50, 30, 65, 45, 120),
        near:  genBuildings(35, 55, 110, 80, 210),

        lastDisplayScore: -1,
      };
    };

    resize();
    gRef.current = makeState();

    if (hiElRef.current) {
      hiElRef.current.textContent = `HI ${String(gRef.current.hiScore).padStart(5, '0')}`;
    }

    // ── Input ────────────────────────────────────────────────────────────
    const doAction = () => {
      const g = gRef.current;
      if (!g) return;

      if (g.phase === 'intro') {
        g.phase = 'playing';
        setPhaseRef.current('playing');

      } else if (g.phase === 'playing') {
        if (g.char.grounded) {
          g.char.vy       = physicsRef.current.jumpForce;
          g.char.grounded = false;
        }

      } else if (g.phase === 'gameover') {
        const hi         = g.hiScore;
        gRef.current     = makeState();
        gRef.current.hiScore = hi;
        gRef.current.phase   = 'playing';
        if (scoreElRef.current) scoreElRef.current.textContent = '00000';
        if (hiElRef.current)    hiElRef.current.textContent    = `HI ${String(hi).padStart(5, '0')}`;
        setPhaseRef.current('playing');
      }
    };

    const onKey = e => {
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        doAction();
      }
    };

    window.addEventListener('keydown', onKey);
    canvas.addEventListener('click', doAction);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); doAction(); }, { passive: false });
    window.addEventListener('resize', resize);

    // ── Game loop ────────────────────────────────────────────────────────
    let lastTs = 0;

    const loop = ts => {
      const dt  = Math.min(ts - lastTs, 50);
      lastTs    = ts;
      const g   = gRef.current;
      const ctx = canvas.getContext('2d');

      // ── UPDATE ─────────────────────────────────────────────────────────
      const playing = g.phase === 'playing';

      // Advance run animation (legs speed up with game speed, max 16 fps)
      const animFps = playing
        ? Math.min(16, ANIM_FPS * (g.speed / physicsRef.current.initSpeed))
        : ANIM_FPS;
      g.char.frameTick += dt;
      if (g.char.frameTick > 1000 / animFps) {
        if (g.phase !== 'gameover') {
          g.char.frame = (g.char.frame + 1) % RUN_FRAMES.length;
        }
        g.char.frameTick -= 1000 / animFps;
      }

      if (playing) {
        g.t     += dt;
        g.score += g.speed * dt * SCORE_RATE * 0.1;
        g.speed  = Math.min(physicsRef.current.maxSpeed, physicsRef.current.initSpeed + g.score * physicsRef.current.speedRate);

        g.gndOff  = (g.gndOff  + g.speed) % 55;
        g.farOff  += g.speed * 0.12;
        g.nearOff += g.speed * 0.38;

        // Physics
        const ch = g.char;
        ch.vy += physicsRef.current.gravity;
        ch.y  += ch.vy;
        const floor = g.gndY - CHAR_H + CHAR_FOOT_OFF;
        if (ch.y >= floor) {
          ch.y        = floor;
          ch.vy       = 0;
          ch.grounded = true;
        }
        ch.bounce = ch.grounded ? Math.sin(g.t * 0.012) * 2.5 : 0;

        // Spawn obstacles
        g.nextGap -= dt;
        if (g.nextGap <= 0) {
          const type = Math.floor(Math.random() * OBSTACLE_DEFS.length);
          const sz   = getObstacleSize(type);
          g.obs.push({ x: g.w + 60, type, ...sz });
          const px  = physicsRef.current.minGap + Math.random() * (physicsRef.current.maxGap - physicsRef.current.minGap);
          g.nextGap = (px / g.speed) * (1000 / 60);
        }

        g.obs.forEach(o => { o.x -= g.speed; });
        g.obs = g.obs.filter(o => o.x + o.w > -60);

        // Collision
        const cLeft   = ch.x + 12;
        const cRight  = ch.x + CHAR_W - 12;
        const cTop    = ch.y + 8;
        const cBottom = ch.y + CHAR_H - 4;

        for (const o of g.obs) {
          const oTop = g.gndY - o.h;
          if (
            cRight  > o.x + 4 &&
            cLeft   < o.x + o.w - 4 &&
            cBottom > oTop + 4 &&
            cTop    < g.gndY
          ) {
            g.phase   = 'gameover';
            const newHi = Math.max(g.hiScore, Math.floor(g.score));
            g.hiScore = newHi;
            localStorage.setItem('da_hi', newHi);
            if (hiElRef.current) {
              hiElRef.current.textContent = `HI ${String(newHi).padStart(5, '0')}`;
            }
            setPhaseRef.current('gameover');
            break;
          }
        }

        // DOM score update (avoids Preact re-render every frame)
        const dispScore = Math.floor(g.score);
        if (dispScore !== g.lastDisplayScore) {
          g.lastDisplayScore = dispScore;
          if (scoreElRef.current) {
            scoreElRef.current.textContent = String(dispScore).padStart(5, '0');
          }
        }
      }

      // ── RENDER ─────────────────────────────────────────────────────────
      const { w, h, gndY } = g;

      drawSky(ctx, w, gndY);
      drawStars(ctx, g.stars, g.t);
      drawLayer(ctx, g.far,  g.farOff,  gndY, 0.55);
      drawLayer(ctx, g.near, g.nearOff, gndY, 0.82);
      drawGround(ctx, w, gndY, h, g.gndOff);

      g.obs.forEach(o => drawObstacle(ctx, o.x, gndY, o.type));

      // Character — pick frame based on state
      const ch  = g.char;
      const spr = spriteCanvasRef.current;
      if (spr) {
        const frameIdx = g.phase === 'gameover'
          ? DEAD_FRAME
          : ch.grounded
            ? RUN_FRAMES[ch.frame]
            : JUMP_FRAME;

        if (g.phase === 'gameover') {
          ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(g.t * 0.007));
        }
        drawSprite(ctx, spr, frameIdx, ch.x, Math.round(ch.y + ch.bounce), CHAR_W, CHAR_H);
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', doAction);
    };
  }, []);

  const overlayStyle = { bottom: `${(1 - GROUND_RATIO) * 100}%` };

  return (
    <div class="game-root">

      <canvas ref={canvasRef} class="game-canvas" />

      {/* ── Score HUD ── */}
      <div class="score-hud">
        <div ref={hiElRef}    class="score-hi">HI 00000</div>
        <div ref={scoreElRef} class="score-current">00000</div>
      </div>

      {/* ── Intro overlay ── */}
      {phase === 'intro' && (
        <div class="overlay" style={overlayStyle}>
          <div class="overlay-title">DEVAN ANDERSEN</div>
          <div class="overlay-subtitle">SENIOR SOFTWARE ENGINEER</div>
          <div class="overlay-prompt">PRESS SPACE OR TAP TO START</div>
        </div>
      )}

      {/* ── Game-over overlay ── */}
      {phase === 'gameover' && (
        <div class="overlay" style={overlayStyle}>
          <div class="overlay-gameover-title">GAME OVER</div>
          <div class="overlay-gameover-prompt">PRESS SPACE OR TAP TO RETRY</div>
        </div>
      )}

      {/* ── Settings button ── */}
      <button
        class={`gear-btn${settingsOpen ? ' open' : ''}`}
        onClick={() => setSettingsOpen(o => !o)}
      >
        <GearIcon size={16} color="#9090e0" />
      </button>

      {/* ── Settings panel ── */}
      {settingsOpen && (
        <div class="settings-panel">
          <div class="settings-row">
            <span>MUSIC</span>
            <div class="settings-toggle-group">
              {['OFF', 'ON'].map(opt => (
                <button
                  key={opt}
                  class="settings-toggle-btn"
                  onClick={() => setMusic(opt === 'ON')}
                  style={{
                    background: (opt === 'ON') === music ? '#4848a0' : 'transparent',
                    color:      (opt === 'ON') === music ? '#ffffff' : '#4848a0',
                  }}
                >{opt}</button>
              ))}
            </div>
          </div>

          <div class="settings-divider" />

          {[
            { heading: 'MOVEMENT', sliders: [
              { label: 'GRAVITY', key: 'gravity',   min: 0.1,  max: 2,    step: 0.01,  parse: parseFloat },
              { label: 'JUMP',    key: 'jumpForce', min: -30,  max: -2,   step: 0.5,   parse: parseFloat },
            ]},
            { heading: 'SPEED', sliders: [
              { label: 'INIT',    key: 'initSpeed', min: 1,    max: 20,   step: 0.5,   parse: parseFloat },
              { label: 'MAX',     key: 'maxSpeed',  min: 5,    max: 50,   step: 1,     parse: parseFloat },
              { label: 'RATE',    key: 'speedRate', min: 0.001,max: 0.05, step: 0.001, parse: parseFloat },
            ]},
            { heading: 'OBSTACLES', sliders: [
              { label: 'MIN GAP', key: 'minGap',    min: 100,  max: 800,  step: 10,    parse: parseInt   },
              { label: 'MAX GAP', key: 'maxGap',    min: 400,  max: 1600, step: 10,    parse: parseInt   },
            ]},
          ].map(({ heading, sliders }) => (
            <div key={heading}>
              <div class="settings-section-heading">{heading}</div>
              <div class="settings-slider-grid">
                {sliders.map(({ label, key, min, max, step, parse }) => (
                  <div key={key} class="settings-slider-item">
                    <div class="settings-slider-label-row">
                      <span class="settings-slider-label">{label}</span>
                      <span class="settings-slider-value">{physics[key]}</span>
                    </div>
                    <input
                      class="settings-slider"
                      type="range"
                      min={min} max={max} step={step}
                      value={physics[key]}
                      onInput={e => setPhysics(p => ({ ...p, [key]: parse(e.target.value) }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div class="settings-divider" />

          <button class="settings-reset-btn" onClick={() => setPhysics(PHYSICS_DEFAULTS)}>
            RESET DEFAULTS
          </button>
        </div>
      )}

      {/* ── Social links ── */}
      <div class="social-links" style={{ top: `${GROUND_RATIO * 100 + 3}%` }}>
        {[
          { label: 'GITHUB',   href: 'https://github.com/devanandersen' },
          { label: 'LINKEDIN', href: 'https://www.linkedin.com/in/devan-a-68211b73/' },
          { label: 'TWITTER',  href: 'https://x.com/devandersen' },
        ].map(({ label, href }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" class="social-link">
            {label}
          </a>
        ))}
      </div>

    </div>
  );
}
