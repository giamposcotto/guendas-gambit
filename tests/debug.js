const E = require('../js/engine.js');
const AI = require('../js/ai.js');

/* 1) partita self-play di debug */
const b = new E.Board();
const sans = [];
for (let i = 0; i < 60; i++) {
  const res = AI.chooseMove(b, 7);
  if (!res) break;
  sans.push(b.moveToSan(res.move));
  b.makeMove(res.move);
}
const val = [0, 100, 320, 330, 500, 900, 0];
function mat(color) {
  let s = 0;
  for (let x = 0; x < 128; x++) { if (x & 0x88) continue; const p = b.squares[x]; if (p && (p >> 3) === color) s += val[p & 7]; }
  return s;
}
console.log('partita:', sans.join(' '));
console.log('materiale bianco', mat(0), 'nero', mat(1));

/* 2) posizione di matto in 2 corretta */
const b2 = new E.Board('r5k1/5ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1');
const a = AI.analyzePosition(b2, { depth: 6, timeMs: 3000 });
console.log('analisi matto2: mateIn =', a.mateIn, 'score =', a.score, 'mossa =', a.bestMove ? b2.moveToSan(a.bestMove) : null, 'pv =', a.pv.map(m => b2.moveToSan(m)));
