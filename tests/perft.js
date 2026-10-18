/* Test di correttezza del motore con perft (conteggio nodi). */
const E = require('../js/engine.js');
const { Board } = E;

function perft(board, depth) {
  if (depth === 0) return 1;
  const moves = board.generateMoves(false);
  let nodes = 0;
  const us = board.turn;
  for (const m of moves) {
    board.makeMove(m);
    if (!board.inCheck(us)) nodes += perft(board, depth - 1);
    board.undoMove();
  }
  return nodes;
}

const tests = [
  ['startpos', E.START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['pos6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]]
];

let failures = 0;
for (const [name, fen, expected] of tests) {
  for (let d = 1; d <= expected.length; d++) {
    const b = new Board(fen);
    const t0 = Date.now();
    const got = perft(b, d);
    const ms = Date.now() - t0;
    const ok = got === expected[d - 1];
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} depth ${d}: ${got} (atteso ${expected[d - 1]}) ${ms}ms`);
  }
}

/* verifica hashing incrementale */
function hashCheck() {
  const b = new Board();
  let bad = 0;
  for (let i = 0; i < 400; i++) {
    const moves = b.generateLegalMoves();
    if (!moves.length) break;
    const m = moves[Math.floor(Math.random() * moves.length)];
    b.makeMove(m);
    const inc = b.key();
    const full = b.computeHash();
    if (inc !== full) { bad++; console.log('HASH MISMATCH', b.fen()); }
  }
  console.log(bad === 0 ? 'OK   hash incrementale' : `FAIL hash incrementale (${bad})`);
  if (bad) failures++;
}

/* verifica SAN / round-trip FEN */
function sanCheck() {
  const b = new Board();
  const seq = [];
  for (let i = 0; i < 60; i++) {
    const moves = b.generateLegalMoves();
    if (!moves.length) break;
    const m = moves[Math.floor(Math.random() * moves.length)];
    seq.push(b.moveToSan(m));
    const before = b.fen();
    b.makeMove(m);
    const clone = new Board(b.fen());
    if (clone.fen() !== b.fen()) { console.log('FEN MISMATCH'); failures++; }
    b.undoMove();
    if (b.fen() !== before) { console.log('UNDO MISMATCH', before, b.fen()); failures++; }
    b.makeMove(m);
  }
  console.log('OK   round-trip FEN/undo - partita:', seq.join(' '));
}

hashCheck();
sanCheck();
console.log(failures === 0 ? '\nTUTTI I TEST SUPERATI' : `\n${failures} TEST FALLITI`);
process.exit(failures === 0 ? 0 : 1);
