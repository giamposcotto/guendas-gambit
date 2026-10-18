/* Verifica delle lezioni e dei moduli "insegnante". */
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const C = require('../js/coach.js');

let problems = 0;

console.log('=== VERIFICA LEZIONI ===\n');
for (const lesson of C.LESSONS) {
  const board = new E.Board(lesson.fen);
  const legal = board.generateLegalMoves();
  const legalUci = legal.map((m) => E.moveToUci(m));

  // mossa migliore secondo il motore
  const an = AI.analyzePosition(board, { depth: 6, timeMs: 2500 });
  const bestSan = an.bestMove ? board.moveToSan(an.bestMove) : '-';
  const bestUci = an.bestMove ? E.moveToUci(an.bestMove) : '-';

  let verdict = 'OK  ';
  const notes = [];

  if (lesson.type === 'mate1') {
    const mv = E.uciToMove(board, lesson.solution[0]);
    if (!mv) { verdict = 'FAIL'; notes.push('mossa soluzione non legale!'); }
    else {
      board.makeMove(mv);
      const over = board.isGameOver();
      if (!(over.over && over.reason === 'scacco matto')) { verdict = 'FAIL'; notes.push('la soluzione non dà matto'); }
      board.undoMove();
    }
  } else if (lesson.type === 'promotion') {
    if (lesson.solution.length) { verdict = 'FAIL'; notes.push('lezione promozione non deve avere soluzione'); }
  } else {
    let mv = 0;
    for (const u of lesson.solution) { mv = E.uciToMove(board, u); if (mv) break; }
    if (!mv) { verdict = 'FAIL'; notes.push('nessuna soluzione legale: ' + lesson.solution.join('/')); }
    else {
      const sanSol = board.moveToSan(mv);
      // confronto: quanto perde rispetto alla mossa migliore?
      const clone = new E.Board(lesson.fen);
      clone.makeMove(mv);
      const after = AI.analyzePosition(clone, { depth: 4, timeMs: 1200 });
      const evalAfter = -after.score;
      const matchesEngine = E.moveToUci(mv) === bestUci;
      notes.push(`soluzione ${sanSol} (${evalAfter > 0 ? '+' : ''}${(evalAfter / 100).toFixed(2)}), motore ${bestSan} ${matchesEngine ? '' : '(diversa)'}`);
      const topSan = board.moveToSan(mv);
      if (!matchesEngine) {
        // verifica che la soluzione sia comunque quasi ottimale
        const loss = an.score - evalAfter;
        if (loss > 60) { verdict = 'WARN'; notes.push(`perde ${(loss / 100).toFixed(2)} rispetto al motore`); }
      }
    }
  }

  console.log(`${verdict} ${lesson.id.padEnd(3)} ${lesson.level.padEnd(11)} ${lesson.title}`);
  console.log(`        FEN: ${lesson.fen}`);
  console.log(`        eval ${(an.score / 100).toFixed(2)}${an.mateIn ? ` matto in ${an.mateIn}` : ''} | ${notes.join(' ')}`);
  if (verdict === 'FAIL') problems++;
}

/* ---- verifica delle continuazioni guidate ---- */
console.log('\n=== VERIFICA CONTINUAZIONI ===\n');
for (const lesson of C.LESSONS) {
  if (!lesson.line) continue;
  const b = new E.Board(lesson.fen);
  const mosse = [];
  let ok = true;
  for (const u of lesson.line) {
    const mv = E.uciToMove(b, u);
    if (!mv) { ok = false; mosse.push('ILLEGALE(' + u + ')'); break; }
    mosse.push(b.moveToSan(mv));
    b.makeMove(mv);
  }
  const over = b.isGameOver();
  const matto = over.over && over.reason === 'scacco matto';
  let resa = matto;
  let nota = matto ? '(matto)' : '';
  if (!matto && ok) {
    /* le combinazioni che non finiscono a matto devono almeno lasciare un netto vantaggio */
    const dopo = AI.analyzePosition(b, { depth: 5, timeMs: 1500 });
    const vantaggio = over.over ? -99999 : -dopo.score;
    resa = vantaggio >= 200;
    nota = over.over ? '=> ' + over.reason
      : `=> ${vantaggio > 0 ? '+' : ''}${(vantaggio / 100).toFixed(2)} ${resa ? '(vantaggio decisivo)' : '(vantaggio insufficiente)'}`;
  }
  const primoOk = lesson.line.length && lesson.solution.some((s) => s.slice(0, 4) === lesson.line[0].slice(0, 4));
  if (!resa || !ok) problems++;
  if (!primoOk) { problems++; console.log(`FAIL ${lesson.id} la prima mossa della linea non è fra le soluzioni`); }
  console.log(`${resa && ok ? 'OK  ' : 'FAIL'} ${lesson.id.padEnd(3)} ${mosse.join(' ')} ${nota}`);
}

/* ---- test dei moduli del coach ---- */
console.log('\n=== VERIFICA MODULO COACH ===\n');
function check(cond, msg) { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) problems++; }

{
  const b = new E.Board();
  const a = C.analyze(b);
  check(a.tips.length > 0, `analisi posizione iniziale: ${a.tips.length} consigli`);
  check(a.phase === 'apertura', `fase riconosciuta: ${a.phase}`);
  check(a.hanging.mine.length === 0 && a.hanging.theirs.length === 0, 'nessun pezzo in presa nella posizione iniziale');
  const d = C.describeMove(b, E.uciToMove(b, 'e2e4'));
  check(d.san === 'e4' && d.sentence.length > 10, `descrive 1.e4: "${d.sentence}"`);
}

{
  const b = new E.Board('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const d = C.describeMove(b, E.uciToMove(b, 'a1a8'));
  check(d.mate === true && /matto/i.test(d.sentence), `descrive il matto: "${d.sentence}"`);
}

{
  const b = new E.Board('r3k3/pp3ppp/2n5/1B6/3P4/8/PPP2PPP/R5K1 w - - 0 1');
  const pins = C.findPins(b);
  check(pins.length === 1 && E.sqToAlg(pins[0].pinned) === 'c6', `inchiodatura trovata in c6 (${pins.length})`);
}

{
  const b = new E.Board('4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1');
  const h = C.hangingPieces(b);
  check(h.black.some((x) => x.square === 'd5' && x.free), `donna nera in d5 non difesa rilevata (${h.black.map(x => x.square + ':' + x.piece).join(',')})`);
}

{
  const b = new E.Board();
  const opening = C.detectOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
  check(opening === 'Giuoco Piano', `apertura riconosciuta: ${opening}`);
}

{
  const q1 = C.quality(0, true, false, false);
  const q2 = C.quality(500, false, false, false);
  const q3 = C.quality(100, false, true, false);
  check(q1.cls === 'best' && q2.cls === 'blunder', `etichette qualità: ${q1.label} / ${q2.label}`);
  check(q3.symbol === '??', `matto mancato segnalato: ${q3.label}`);
}

console.log(problems === 0 ? '\nVERIFICA COMPLETATA SENZA ERRORI' : `\n${problems} PROBLEMI TROVATI`);
process.exit(0);
