export default function ScoreHud({ hiRef, scoreRef }) {
  return (
    <div class="score-hud">
      <div ref={hiRef}    class="score-hi">HI 00000</div>
      <div ref={scoreRef} class="score-current">00000</div>
    </div>
  );
}
