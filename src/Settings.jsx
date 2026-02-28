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

const SLIDER_GROUPS = [
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
];

export default function Settings({ settingsOpen, setSettingsOpen, music, setMusic, physics, setPhysics, physicsDefaults }) {
  return (<>
    <button
      class={`gear-btn${settingsOpen ? ' open' : ''}`}
      onClick={() => setSettingsOpen(o => !o)}
    >
      <GearIcon size={16} color="#9090e0" />
    </button>

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

        {SLIDER_GROUPS.map(({ heading, sliders }) => (
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

        <button class="settings-reset-btn" onClick={() => setPhysics(physicsDefaults)}>
          RESET DEFAULTS
        </button>
      </div>
    )}
  </>);
}
