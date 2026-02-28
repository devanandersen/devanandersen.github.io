import { GROUND_RATIO } from './constants';

const overlayStyle = { bottom: `${(1 - GROUND_RATIO) * 100}%` };

export default function Overlay({ phase }) {
  if (phase !== 'intro' && phase !== 'gameover') return null;
  return (
    <div class="overlay" style={overlayStyle}>
      {phase === 'intro' && (<>
        <div class="overlay-title">DEVAN ANDERSEN</div>
        <div class="overlay-subtitle">SENIOR SOFTWARE ENGINEER</div>
        <div class="overlay-prompt">PRESS SPACE OR TAP TO START</div>
      </>)}
      {phase === 'gameover' && (<>
        <div class="overlay-gameover-title">GAME OVER</div>
        <div class="overlay-gameover-prompt">PRESS SPACE OR TAP TO RETRY</div>
      </>)}
    </div>
  );
}
