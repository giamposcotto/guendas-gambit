/* Test del motore di ricerca e dei livelli. */
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

let fails = 0;
function check(cond, msg) { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fails++; }

/* --- matto in 1 --- */
{
  const b = new E.Board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const r = AI.chooseMove(b, 7);
  const san = b.moveToSan(r.move);
  check(san === 'Ra8#', `matto in 1 trovato al livello Esperto (giocata: ${san})`);

  const r1 = AI.chooseMove(b, 0);
  check(!!r1, `livello Principiante produce una mossa valida (${b.moveToSan(r1.move)})`);
}

/* --- non perde materiale in apertura --- */
{
  const b = new E.Board();
  let lost = 0;
  for (let i = 0; i < 40; i++) {
    const res = AI.chooseMove(b, 7);
    if (!res) break;
    b.makeMove(res.move);
  }
  const mat = (board, color) => {
    const v = [0, 100, 320, 330, 500, 900, 0];
    let s = 0;
    for (let x = 0; x < 128; x++) {
      if (x & 0x88) continue;
      const p = board.squares[x];
      if (p && (p >> 3) === color) s += v[p & 7];
    }
    return s;
  };
  const diff = mat(b, E.WHITE) - mat(b, E.BLACK);
  check(Math.abs(diff) <= 350, `partita vs se stesso equilibrata dopo 40 mosse (delta materiale ${diff})`);
}

/* --- tempi e profondita' --- */
for (const lv of [0, 3, 5, 7]) {
  const b = new E.Board('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
  const t0 = Date.now();
  const r = AI.chooseMove(b, lv);
  const ms = Date.now() - t0;
  console.log(`     livello ${AI.LEVELS[lv].name}: ${b.moveToSan(r.move)} in ${ms}ms (prof. ${r.depth}, ${r.nodes} nodi)`);
}

/* --- matto in 2 --- */
{
  const b = new E.Board('r5k1/5ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1');
  const a = AI.analyzePosition(b, { depth: 6, timeMs: 3000 });
  check(a.mateIn === 2, `matto in 2 riconosciuto (mateIn = ${a.mateIn}, eval ${a.score})`);
}

/* --- non regala pezzi: rimane in vantaggio --- */
{
  const b = new E.Board('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  const r = AI.chooseMove(b, 5);
  console.log('     risposta a 1.e4:', b.moveToSan(r.move), 'eval', r.score);
}

console.log(fails === 0 ? '\nTUTTI I TEST AI SUPERATI' : `\n${fails} TEST FALLITI`);
process.exit(fails ? 1 : 0);
