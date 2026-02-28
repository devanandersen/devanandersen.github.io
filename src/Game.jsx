import { useEffect, useRef, useState } from 'preact/hooks';

// ─── Sprite sheet constants ────────────────────────────────────────────────
// Sheet layout: 6 cols × 3 rows, 226 × 261 px per frame
const FRAME_W    = 226;
const FRAME_H    = 261;
const COLS       = 6;
const RUN_FRAMES = [0, 1, 2, 3, 4, 5];  // row 0
const JUMP_FRAME = 9;                    // row 1, col 3
const DEAD_FRAME = 11;                   // row 1, col 5

// On-screen display size (maintains 226:261 aspect ratio)
const CHAR_H = 96;
const CHAR_W = Math.round(CHAR_H * FRAME_W / FRAME_H); // ≈ 83 px

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
//  Cactus obstacle bitmaps
// ─────────────────────────────────────────────────────────────────────────
const CACTUS_DEFS = [
  // Type 0 — single medium
  {
    scale: 7,
    rows: [
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,1,1,1,0,0,0],
      [1,1,1,1,1,1,0],
      [1,1,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
    ],
  },
  // Type 1 — tall double-arm
  {
    scale: 7,
    rows: [
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,1,1,1,0,0,0],
      [1,1,1,1,1,1,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,1,1,0],
      [0,0,1,1,1,1,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
      [0,0,1,1,0,0,0],
    ],
  },
  // Type 2 — short & wide cluster
  {
    scale: 7,
    rows: [
      [0,1,1,0,0,1,1,0],
      [0,1,1,0,0,1,1,0],
      [1,1,1,1,1,1,1,0],
      [1,1,1,1,0,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,0,0,1,1,0],
      [0,1,1,0,0,1,1,0],
    ],
  },
];

function getCactusSize(type) {
  const d = CACTUS_DEFS[type];
  return { w: d.rows[0].length * d.scale, h: d.rows.length * d.scale };
}

function drawCactus(ctx, x, groundY, type) {
  const { rows, scale } = CACTUS_DEFS[type];
  const totalH  = rows.length * scale;
  const startY  = groundY - totalH;

  rows.forEach((row, ri) => {
    row.forEach((filled, ci) => {
      if (!filled) return;
      const bx = x + ci * scale;
      const by = startY + ri * scale;

      const leftEdge  = ci === 0 || !row[ci - 1];
      const rightEdge = ci === row.length - 1 || !row[ci + 1];
      const topEdge   = ri === 0 || !rows[ri - 1][ci];

      ctx.fillStyle = '#267a3e';
      ctx.fillRect(bx, by, scale, scale);
      if (leftEdge)  { ctx.fillStyle = '#3db85e'; ctx.fillRect(bx, by, 2, scale); }
      if (rightEdge) { ctx.fillStyle = '#174d27'; ctx.fillRect(bx + scale - 2, by, 2, scale); }
      if (topEdge)   { ctx.fillStyle = '#4dce72'; ctx.fillRect(bx, by, scale, 2); }
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
        speed:   INIT_SPEED,
        t:       0,

        char: {
          x:         110,
          y:         gndY - CHAR_H,
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
          g.char.vy       = JUMP_FORCE;
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
        ? Math.min(16, ANIM_FPS * (g.speed / INIT_SPEED))
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
        g.speed  = Math.min(MAX_SPEED, INIT_SPEED + g.score * SPEED_RATE);

        g.gndOff  = (g.gndOff  + g.speed) % 55;
        g.farOff  += g.speed * 0.12;
        g.nearOff += g.speed * 0.38;

        // Physics
        const ch = g.char;
        ch.vy += GRAVITY;
        ch.y  += ch.vy;
        const floor = g.gndY - CHAR_H;
        if (ch.y >= floor) {
          ch.y        = floor;
          ch.vy       = 0;
          ch.grounded = true;
        }
        ch.bounce = ch.grounded ? Math.sin(g.t * 0.012) * 2.5 : 0;

        // Spawn obstacles
        g.nextGap -= dt;
        if (g.nextGap <= 0) {
          const type = Math.floor(Math.random() * CACTUS_DEFS.length);
          const sz   = getCactusSize(type);
          g.obs.push({ x: g.w + 60, type, ...sz });
          const px  = MIN_GAP_PX + Math.random() * (MAX_GAP_PX - MIN_GAP_PX);
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

      g.obs.forEach(o => drawCactus(ctx, o.x, gndY, o.type));

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

  // ── Styles ─────────────────────────────────────────────────────────────
  const pxFont = '"Press Start 2P", monospace';

  const overlayBase = {
    position:       'absolute',
    top:            0,
    left:           0,
    right:          0,
    bottom:         `${(1 - GROUND_RATIO) * 100}%`,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    fontFamily:     pxFont,
    color:          '#e0dfff',
    pointerEvents:  'none',
    userSelect:     'none',
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      <canvas ref={canvasRef} style={{ display: 'block' }} />

      {/* ── Score HUD ── */}
      <div style={{
        position:      'absolute',
        top:           18,
        right:         26,
        fontFamily:    pxFont,
        textAlign:     'right',
        lineHeight:    '1.9',
        pointerEvents: 'none',
        userSelect:    'none',
      }}>
        <div ref={hiElRef}    style={{ fontSize: 10, color: '#6060a0' }}>HI 00000</div>
        <div ref={scoreElRef} style={{ fontSize: 13, color: '#c8c8ee' }}>00000</div>
      </div>

      {/* ── Intro overlay ── */}
      {phase === 'intro' && (
        <div style={overlayBase}>
          <div style={{
            fontSize:      'clamp(18px, 3.5vw, 36px)',
            letterSpacing: '0.08em',
            marginBottom:  10,
            color:         '#ffffff',
            animation:     'fadeIn 0.6s ease both',
          }}>
            DEVAN ANDERSEN
          </div>
          <div style={{
            fontSize:      'clamp(8px, 1.2vw, 12px)',
            color:         '#7070b8',
            marginBottom:  60,
            letterSpacing: '0.15em',
            animation:     'fadeIn 0.8s ease 0.2s both',
          }}>
            SOFTWARE ENGINEER
          </div>
          <div style={{
            fontSize:  'clamp(7px, 1vw, 11px)',
            color:     '#4848a0',
            animation: 'blink 1.1s step-end infinite',
          }}>
            PRESS SPACE OR TAP TO START
          </div>
        </div>
      )}

      {/* ── Game-over overlay ── */}
      {phase === 'gameover' && (
        <div style={overlayBase}>
          <div style={{
            fontSize:      'clamp(16px, 3vw, 28px)',
            color:         '#ff5555',
            marginBottom:  22,
            letterSpacing: '0.05em',
          }}>
            GAME OVER
          </div>
          <div style={{
            fontSize:  'clamp(7px, 1vw, 11px)',
            color:     '#4848a0',
            marginTop: 36,
            animation: 'blink 1.1s step-end infinite',
          }}>
            PRESS SPACE OR TAP TO RETRY
          </div>
        </div>
      )}

      {/* ── Social links ── */}
      <div style={{
        position:        'absolute',
        top:             `${GROUND_RATIO * 100 + 3}%`,
        left:            '50%',
        transform:       'translateX(-50%)',
        fontFamily:      pxFont,
        fontSize:        9,
        display:         'flex',
        gap:             20,
        whiteSpace:      'nowrap',
        pointerEvents:   'auto',
      }}>
        {[
          { label: 'GITHUB',   href: 'https://github.com/devanandersen' },
          { label: 'LINKEDIN', href: 'https://www.linkedin.com/in/devan-a-68211b73/' },
          { label: 'TWITTER',  href: 'https://x.com/devandersen' },
        ].map(({ label, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color:          '#4848a0',
              textDecoration: 'none',
              transition:     'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#9090e0'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4848a0'; }}
          >
            {label}
          </a>
        ))}
      </div>

    </div>
  );
}
