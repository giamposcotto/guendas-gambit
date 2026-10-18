const E = require('../js/engine.js');
const AI = require('../js/ai.js');

const cands = [
  ['skewer re/torre', '4k2r/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'],
  ['scala', '8/8/4k3/8/8/8/8/RR4K1 w - - 0 1'],
  ['matto2 donna+t', '6k1/5ppp/8/8/8/8/5PPP/2R2RK1 w - - 0 1'],
  ['matto2 R+R', '6k1/5ppp/8/8/8/8/5PPP/R5KR w - - 0 1'],
  ['matto2 R+R b', '6k1/5pp1/7p/8/8/8/5PPP/R5KR w - - 0 1'],
  ['donna in 7a', 'r5k1/5ppp/8/8/8/8/5PPP/2R2RK1 w - - 0 1'],
  ['inchiostro+matto', 'r4rk1/ppp2ppp/8/3Q4/8/8/PPP2PPP/R4RK1 w - - 0 1'],
  ['scoperta', '3q1rk1/1p2bppp/8/3N4/8/8/5PPP/3R2K1 w - - 0 1'],
  ['scoperta2', '3q1rk1/1p3ppp/8/3N4/8/8/5PPP/3R2K1 w - - 0 1'],
  ['forchetta D', '6k1/5ppp/8/8/8/2n5/5PPP/3R2K1 w - - 0 1'],
  ['matto2 torre+donna', '5rk1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 1'],
  ['matto2 h7', '6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1'],
  ['matto affogato', '5rk1/6pp/8/3Q4/6N1/8/8/6K1 w - - 0 1'],
  ['pedone forchetta', '4k3/pp3ppp/2n1b3/8/3P4/5N2/PPP2PPP/3R2K1 w - - 0 1']
];

for (const [name, fen] of cands) {
  const b = new E.Board(fen);
  const a = AI.analyzePosition(b, { depth: 6, timeMs: 2500 });
  const pv = a.pv.map((m) => b.moveToSan(m)).join(' ');
  console.log(`${name.padEnd(20)} eval ${(a.score / 100).toFixed(2).padStart(7)} mateIn ${String(a.mateIn).padStart(4)}  best ${a.bestMove ? b.moveToSan(a.bestMove).padEnd(8) : '-'} pv: ${pv}`);
}
