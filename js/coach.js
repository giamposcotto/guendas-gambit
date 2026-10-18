/* =========================================================================
 * coach.js - L'"Insegnante": spiegazioni in italiano, analisi della
 *            posizione, riconoscimento di tatticismi, libro di aperture
 *            e lezioni guidate con verifiche.
 * ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'), require('./ai.js'));
  } else {
    root.ChessCoach = factory(root.ChessEngine, root.ChessAI);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, AI) {
  'use strict';

  const { WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    mFrom, mTo, mPromo, mFlag, FLAG_EP, FLAG_CASTLE_K, FLAG_CASTLE_Q,
    colorOf, typeOf, sqToAlg, moveToUci } = E;

  const PIECE_IT = { 1: 'Pedone', 2: 'Cavallo', 3: 'Alfiere', 4: 'Torre', 5: 'Donna', 6: 'Re' };
  const PIECE_IT_ART = { 1: 'il pedone', 2: 'il cavallo', 3: "l'alfiere", 4: 'la torre', 5: 'la donna', 6: 'il re' };
  const VALUE = [0, 100, 320, 330, 500, 900, 20000];

  const KNIGHT_OFFS = [-33, -31, -18, -14, 14, 18, 31, 33];
  const BISHOP_OFFS = [-17, -15, 15, 17];
  const ROOK_OFFS = [-16, -1, 1, 16];
  const KING_OFFS = [-17, -16, -15, -1, 1, 15, 16, 17];

  const ok = (s) => s >= 0 && s < 128 && !(s & 0x88);

  /* ------------------------------------------------------- attacchi */
  function attacksFrom(board, sq) {
    const out = [];
    const arr = board.squares;
    const p = arr[sq];
    if (!p) return out;
    const t = p & 7, c = p >> 3;
    if (t === PAWN) {
      const dir = c === WHITE ? 16 : -16;
      if (ok(sq + dir - 1)) out.push(sq + dir - 1);
      if (ok(sq + dir + 1)) out.push(sq + dir + 1);
    } else if (t === KNIGHT || t === KING) {
      const offs = t === KNIGHT ? KNIGHT_OFFS : KING_OFFS;
      for (let i = 0; i < offs.length; i++) if (ok(sq + offs[i])) out.push(sq + offs[i]);
    } else {
      const offs = t === BISHOP ? BISHOP_OFFS : t === ROOK ? ROOK_OFFS : KING_OFFS;
      for (let i = 0; i < offs.length; i++) {
        const o = offs[i];
        let s = sq + o;
        while (ok(s)) {
          out.push(s);
          if (arr[s]) break;
          s += o;
        }
      }
    }
    return out;
  }

  function attackersOf(board, target, color) {
    const res = [];
    const arr = board.squares;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = arr[s];
      if (!p || (p >> 3) !== color) continue;
      if (attacksFrom(board, s).indexOf(target) >= 0) res.push(s);
    }
    return res;
  }

  /* --------------------------------------------------- pezzi in pericolo */
  function hangingPieces(board) {
    const arr = board.squares;
    const out = { white: [], black: [] };
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = arr[s];
      if (!p) continue;
      const t = p & 7;
      if (t === KING) continue;
      const c = p >> 3;
      const att = attackersOf(board, s, c ^ 1);
      if (!att.length) continue;
      const def = attackersOf(board, s, c);
      const victim = VALUE[t];
      let minAttacker = Infinity;
      for (let i = 0; i < att.length; i++) minAttacker = Math.min(minAttacker, VALUE[arr[att[i]] & 7]);
      if (def.length === 0 || minAttacker + 40 < victim) {
        out[c === WHITE ? 'white' : 'black'].push({
          square: sqToAlg(s), piece: t, value: victim,
          attackers: att.map(sqToAlg), defended: def.length > 0,
          free: def.length === 0
        });
      }
    }
    return out;
  }

  /* ------------------------------------------------------ inchiodature */
  function findPins(board) {
    const arr = board.squares;
    const pins = [];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = arr[s];
      if (!p) continue;
      const t = p & 7;
      if (t !== BISHOP && t !== ROOK && t !== QUEEN) continue;
      const c = p >> 3;
      const offs = t === BISHOP ? BISHOP_OFFS : t === ROOK ? ROOK_OFFS : KING_OFFS;
      for (let i = 0; i < offs.length; i++) {
        const o = offs[i];
        let x = s + o;
        let first = -1;
        while (ok(x)) {
          if (arr[x]) { first = x; break; }
          x += o;
        }
        if (first < 0) continue;
        const fp = arr[first];
        if ((fp >> 3) === c) continue;
        let y = first + o;
        while (ok(y)) {
          const back = arr[y];
          if (back) {
            if ((back >> 3) === (fp >> 3) && (back & 7) === KING) {
              pins.push({ pinned: first, piece: fp & 7, by: s, king: y, kind: 'assoluto', defenderColor: fp >> 3 });
            }
            break;
          }
          y += o;
        }
      }
    }
    return pins;
  }

  /* ------------------------------------------- pezzi attaccati da un pezzo */
  function attacksOfPieceAfter(board, from) {
    const arr = board.squares;
    const p = arr[from];
    const c = p >> 3;
    const targets = attacksFrom(board, from).filter((s) => arr[s] && (arr[s] >> 3) !== c);
    return targets.sort((a, b) => VALUE[arr[b] & 7] - VALUE[arr[a] & 7]);
  }

  /* ==================================================================
   * Descrizione di una mossa (in italiano)
   * ================================================================== */
  function describeMove(board, move) {
    const arr = board.squares;
    const from = mFrom(move), to = mTo(move);
    const flag = mFlag(move), promo = mPromo(move);
    const piece = arr[from];
    const t = piece & 7;
    const captured = flag === FLAG_EP ? PAWN : (arr[to] ? arr[to] & 7 : 0);
    const reasons = [];
    let san;
    try { san = board.moveToSan(move); } catch (err) { san = moveToUci(move); }

    if (flag === FLAG_CASTLE_K || flag === FLAG_CASTLE_Q) {
      reasons.push('mette il re al sicuro e collega le torri');
    } else {
      if (captured) reasons.push('cattura ' + PIECE_IT_ART[captured] + ' in ' + sqToAlg(to));
      if (promo) reasons.push('promuove il pedone a ' + PIECE_IT[promo].toLowerCase());
    }

    /* situazione dopo la mossa */
    board.makeMove(move);
    const opp = board.turn;
    const inCheck = board.inCheck(opp);
    const hasMoves = board.hasLegalMoves();
    const mate = inCheck && !hasMoves;

    if (mate) { reasons.length = 0; reasons.push('è scacco matto!'); }
    else if (inCheck) reasons.push('dà scacco al re');
    else if (!hasMoves) reasons.push('provoca lo stallo');

    if (!mate && flag !== FLAG_CASTLE_K && flag !== FLAG_CASTLE_Q && !captured) {
      const targets = attacksOfPieceAfter(board, to);
      if (targets.length >= 2 && VALUE[arr[targets[0]] & 7] >= 300 && VALUE[arr[targets[1]] & 7] >= 100) {
        reasons.push('attacca ' + descrTarget(board, targets[0]) + ' e ' + descrTarget(board, targets[1]) + ' (forchetta)');
      } else if (targets.length >= 1) {
        const v = VALUE[arr[targets[0]] & 7];
        if (v >= 300) reasons.push('minaccia ' + descrTarget(board, targets[0]));
      }
    }

    if (!captured && !promo && flag !== FLAG_CASTLE_K && flag !== FLAG_CASTLE_Q) {
      const rank = to >> 4, file = to & 15;
      const homeRank = colorOf(piece) === WHITE ? 0 : 7;
      if ((t === KNIGHT || t === BISHOP) && (from >> 4) === homeRank) {
        reasons.push('sviluppa un pezzo verso il centro');
      } else if (t === PAWN && (file === 3 || file === 4) && (rank === 3 || rank === 4)) {
        reasons.push('occupa il centro');
      } else if (t === QUEEN && false) {
        /* niente */
      } else if (t === ROOK) {
        let own = 0, enemy = 0;
        for (let r = 0; r < 8; r++) {
          const s = r * 16 + file;
          const q = arr[s];
          if (!q) continue;
          if ((q & 7) !== PAWN) continue;
          if ((q >> 3) === colorOf(piece)) own++; else enemy++;
        }
        if (!own && !enemy) reasons.push('occupa una colonna aperta');
        else if (!own) reasons.push('entra in una colonna semiaperta');
      } else if (t === KING) {
        reasons.push('porta il re in una casa piu\' sicura');
      }
    }

    const threats = [];
    if (!mate) {
      const hp = hangingPieces(board);
      const oppColor = board.turn;
      const list = oppColor === WHITE ? hp.white : hp.black;
      for (const h of list.slice(0, 2)) {
        if (h.free) threats.push(`${PIECE_IT[h.piece]} in ${h.square} non è difeso`);
        else threats.push(`${PIECE_IT[h.piece]} in ${h.square} è attaccato`);
      }
    }
    board.undoMove();

    /* difende un pezzo in presa? */
    const before = hangingPieces(board);
    const myColor = board.turn;
    const mine = myColor === WHITE ? before.white : before.black;
    const movedAway = mine.some((h) => h.square === sqToAlg(from));
    if (!captured && !promo && movedAway) reasons.push('mette in salvo un pezzo attaccato');

    let text = PIECE_IT[t] + ' in ' + sqToAlg(to);
    if (captured) text = PIECE_IT[t] + ' prende in ' + sqToAlg(to);
    let sentence = text + ': ' + reasons.join(', ').replace(/, ([^,]*)$/, ' e $1');
    if (!reasons.length) sentence = text + ': mossa di attesa, mantiene la posizione.';
    return { san: san, sentence: sentence, reasons: reasons, threats: threats, mate: mate, check: inCheck, capture: !!captured, promotion: promo };
  }

  /* descrizione di un pezzo sulla scacchiera: "la donna in d5" */
  function descrTarget(board, sq) {
    const p = board.squares[sq];
    if (!p) return 'la casa ' + sqToAlg(sq);
    return PIECE_IT_ART[p & 7] + ' in ' + sqToAlg(sq);
  }

  /* ==================================================================
   * Suggerimenti didattici sulla posizione
   * ================================================================== */
  function analyze(board, opts) {
    opts = opts || {};
    const arr = board.squares;
    const us = board.turn;
    const them = us ^ 1;

    let matW = 0, matB = 0, matWP = 0, matBP = 0;
    let developed = [0, 0];
    let pawnFiles = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
    let centerPieces = [0, 0];
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = arr[s];
      if (!p) continue;
      const t = p & 7, c = p >> 3;
      if (t !== KING) {
        if (c === WHITE) matW += VALUE[t]; else matB += VALUE[t];
      }
      if (t === PAWN) {
        if (c === WHITE) matWP += VALUE[t]; else matBP += VALUE[t];
        pawnFiles[c][s & 15]++;
      }
      if ((t === KNIGHT || t === BISHOP) && (s >> 4) !== (c === WHITE ? 0 : 7)) developed[c]++;
      if (t !== PAWN && t !== KING && (s & 15) >= 2 && (s & 15) <= 5 && (s >> 4) >= 2 && (s >> 4) <= 5) centerPieces[c]++;
    }

    const hp = hangingPieces(board);
    const pins = findPins(board);
    const mine = us === WHITE ? hp.white : hp.black;
    const theirs = us === WHITE ? hp.black : hp.white;

    const tips = [];
    const phase = matW + matB < 2600 ? 'finale' : (board.fullmove <= 10 ? 'apertura' : 'mediogioco');

    const diff = us === WHITE ? matW - matB : matB - matW;
    if (diff >= 200) tips.push(`Sei in vantaggio di circa ${Math.round(diff / 100 * 10) / 10} pedoni: gioca semplice, scambia i pezzi e sfrutta il vantaggio.`);
    else if (diff <= -200) tips.push(`Sei in svantaggio di circa ${Math.round(-diff / 100 * 10) / 10} pedoni: cerca il controgioco, non scambiare a cuor leggero.`);
    else tips.push('Il materiale è in equilibrio: conta la posizione dei pezzi.');

    const devUs = developed[us], devThem = developed[them];
    if (devUs < 3 && board.fullmove <= 12) tips.push(`Hai solo ${devUs} pezzi leggeri sviluppati: tira fuori cavalli e alfieri prima di attaccare.`);
    if (devThem < 3 && board.fullmove <= 12) tips.push(`L'avversario ha sviluppato solo ${devThem} pezzi: puoi approfittarne sviluppando più veloce e attaccando.`);

    const kingSq = board.kings[us];
    if (kingSq >= 0) {
      const castled = (kingSq === 6 || kingSq === 2 || kingSq === 118 || kingSq === 114);
      const canCastle = (us === WHITE)
        ? ((board.castling & (E.CASTLE_WK | E.CASTLE_WQ)) !== 0 && !board.inCheck(WHITE))
        : ((board.castling & (E.CASTLE_BK | E.CASTLE_BQ)) !== 0 && !board.inCheck(BLACK));
      if (!castled && board.fullmove <= 15) {
        if (canCastle) tips.push('Il tuo re è ancora al centro: valuta l\'arrocco per metterlo al sicuro.');
        else tips.push('Il tuo re non è ancora al sicuro: attenzione agli attacchi sul centro.');
      }
    }

    if (mine.length) {
      const worst = mine.slice().sort((a, b) => b.value - a.value)[0];
      tips.push(`Attenzione: ${PIECE_IT[worst.piece].toLowerCase()} in ${worst.square} è attaccato${worst.free ? ' e non è difeso' : ''}. Difendilo, spostalo o crea una minaccia più forte.`);
    }
    if (theirs.length) {
      const best = theirs.slice().sort((a, b) => b.value - a.value)[0];
      tips.push(`Puoi puntare a ${PIECE_IT[best.piece].toLowerCase()} in ${best.square}: ${best.free ? 'non è difeso' : 'è difeso, ma attaccabile'}.`);
    }
    for (const pin of pins) {
      if (pin.defenderColor === them) {
        tips.push(`${PIECE_IT[pin.piece]} avversario in ${sqToAlg(pin.pinned)} è inchiodato al re da ${sqToAlg(pin.by)}: non può muoversi.`);
      }
    }

    /* pedoni doppi / isolati */
    for (let f = 0; f < 8; f++) {
      if (pawnFiles[us][f] > 1) tips.push(`Hai pedoni doppi sulla colonna ${'abcdefgh'[f]}: cerca di non creare altri buchi.`);
      else if (pawnFiles[us][f] === 1) {
        const l = f > 0 ? pawnFiles[us][f - 1] : 0;
        const r = f < 7 ? pawnFiles[us][f + 1] : 0;
        if (!l && !r && (pawnFiles[us].reduce((a, b) => a + b, 0) > 2)) {
          tips.push(`Il pedone in ${'abcdefgh'[f]} è isolato: può diventare un bersaglio.`);
        }
      }
    }

    /* testo della fase */
    const phaseTips = {
      apertura: 'In apertura: occupa il centro con i pedoni, sviluppa cavalli e alfieri, arrocca.',
      mediogioco: 'Nel mediogioco: cerca i pezzi indifesi, crea doppi attacchi e apri le colonne verso il re nemico.',
      finale: 'Nel finale: il re diventa un pezzo forte, attiva la torre e spingi i pedoni passati.'
    };
    tips.push(phaseTips[phase]);

    return {
      material: { white: matW, black: matB, pawnsWhite: matWP, pawnsBlack: matBP, diff: diff },
      hanging: { mine: mine, theirs: theirs },
      pins: pins,
      developed: developed,
      phase: phase,
      tips: tips,
      usedHanging: true
    };
  }

  /* ================================================ qualità di una mossa */
  function quality(lossCp, isBest, missedMate, gaveMate) {
    if (gaveMate) return { label: 'Scacco matto!', cls: 'best', symbol: '#' };
    if (missedMate) return { label: 'Occasione mancata: c\'era il matto', cls: 'blunder', symbol: '??' };
    if (isBest) return { label: 'La mossa migliore', cls: 'best', symbol: '!' };
    if (lossCp <= 20) return { label: 'Ottima mossa', cls: 'best', symbol: '!' };
    if (lossCp <= 70) return { label: 'Buona mossa', cls: 'good', symbol: '' };
    if (lossCp <= 150) return { label: 'Imprecisione', cls: 'inaccuracy', symbol: '?!' };
    if (lossCp <= 350) return { label: 'Errore', cls: 'mistake', symbol: '?' };
    return { label: 'Errore grave', cls: 'blunder', symbol: '??' };
  }

  /* ============================================================ aperture */
  const OPENINGS = [
    { moves: ['e4'], name: 'Apertura di Re (1.e4)' },
    { moves: ['e4', 'e5'], name: 'Partita Aperta' },
    { moves: ['e4', 'e5', 'Nf3'], name: 'Apertura del Cavallo di Re' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6'], name: 'Difesa del Cavallo' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Partita Italiana' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], name: 'Giuoco Piano' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], name: 'Difesa dei Due Cavalli' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Partita Spagnola (Ruy López)' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], name: 'Partita Scozzese' },
    { moves: ['e4', 'e5', 'Nf3', 'Nf6'], name: 'Difesa Petrov' },
    { moves: ['e4', 'e5', 'f4'], name: 'Gambetto di Re' },
    { moves: ['e4', 'e5', 'Bc4'], name: 'Apertura dell\'Alfiere' },
    { moves: ['e4', 'c5'], name: 'Difesa Siciliana' },
    { moves: ['e4', 'c5', 'Nf3', 'd6'], name: 'Siciliana Variante Najdorf (prep.)' },
    { moves: ['e4', 'c5', 'Nf3', 'Nc6'], name: 'Siciliana Chiusa (prep.)' },
    { moves: ['e4', 'e6'], name: 'Difesa Francese' },
    { moves: ['e4', 'c6'], name: 'Difesa Caro-Kann' },
    { moves: ['e4', 'd5'], name: 'Difesa Scandinava' },
    { moves: ['e4', 'Nf6'], name: 'Difesa Alekhine' },
    { moves: ['e4', 'd6'], name: 'Difesa Pirc' },
    { moves: ['e4', 'g6'], name: 'Difesa Moderna' },
    { moves: ['d4'], name: 'Apertura di Donna (1.d4)' },
    { moves: ['d4', 'd5'], name: 'Partita Chiusa' },
    { moves: ['d4', 'd5', 'c4'], name: 'Gambetto di Donna' },
    { moves: ['d4', 'd5', 'c4', 'e6'], name: 'Gambetto di Donna Rifiutato' },
    { moves: ['d4', 'd5', 'c4', 'dxc4'], name: 'Gambetto di Donna Accettato' },
    { moves: ['d4', 'd5', 'c4', 'c6'], name: 'Difesa Slava' },
    { moves: ['d4', 'Nf6'], name: 'Difese Indiane' },
    { moves: ['d4', 'Nf6', 'c4', 'e6'], name: 'India di Donna / Nimzo' },
    { moves: ['d4', 'Nf6', 'c4', 'g6'], name: 'India di Re / Grünfeld' },
    { moves: ['d4', 'f5'], name: 'Difesa Olandese' },
    { moves: ['Nf3'], name: 'Apertura Réti' },
    { moves: ['c4'], name: 'Apertura Inglese' },
    { moves: ['b3'], name: 'Apertura Larsen' },
    { moves: ['f4'], name: 'Apertura Bird' },
    { moves: ['g3'], name: 'Apertura Catalana (prep.)' },
    { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], name: 'Gambetto Evans' },
    { moves: ['e4', 'e5', 'Nc3'], name: 'Partita Viennese' },
    { moves: ['e4', 'e5', 'd4'], name: 'Centro di Partita' }
  ];

  function detectOpening(sanMoves) {
    let best = null;
    for (const op of OPENINGS) {
      if (op.moves.length > sanMoves.length) continue;
      let match = true;
      for (let i = 0; i < op.moves.length; i++) {
        if (op.moves[i].replace(/[+#!?]/g, '') !== sanMoves[i].replace(/[+#!?]/g, '')) { match = false; break; }
      }
      if (match && (!best || op.moves.length > best.moves.length)) best = op;
    }
    return best ? best.name : null;
  }

  /* ============================================================= lezioni */
  const LESSONS = [
    /* ---------------- BASE ---------------- */
    {
      id: 'b1', level: 'Base', title: 'Matto in una mossa (torre)',
      fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
      goal: 'Trova lo scacco matto in una mossa.', type: 'mate1', solution: ['a1a8'],
      hint: 'La torre ha una strada libera lungo la prima traversa... e la traversa del re nero è scoperta.',
      explanation: 'Ta8#! La torre arriva sull\'ottava traversa e il re nero, bloccato dai suoi stessi pedoni, non ha case di fuga. È il classico "matto della traversa".'
    },
    {
      id: 'b2', level: 'Base', title: 'Matto in una mossa (donna)',
      fen: '7k/8/6K1/8/8/8/8/7Q w - - 0 1',
      goal: 'Trova lo scacco matto in una mossa.', type: 'mate1', solution: ['h1h7'],
      hint: 'Il re nero è nell\'angolo: la donna può avvicinarsi... con la protezione del re bianco.',
      explanation: 'Dh7#! La donna si appoggia al re in g6, dà scacco e toglie tutte le case di fuga (g8 e g7). Regola d\'oro: per matare nell\'angolo servono donna e re vicini.'
    },
    {
      id: 'b3', level: 'Base', title: 'Matto in una mossa (donna) 2',
      fen: '6k1/5ppp/8/8/8/8/3Q4/6K1 w - - 0 1',
      goal: 'Trova lo scacco matto in una mossa.', type: 'mate1', solution: ['d2d8'],
      hint: 'Anche la donna può usare la traversa scoperta.',
      explanation: 'Dd8#! La donna conquista l\'ottava traversa e dà scacco: il re nero è intrappolato dai pedoni f7, g7 e h7.'
    },
    {
      id: 'b4', level: 'Base', title: 'Vinci il pezzo gratis',
      fen: '4k3/8/8/3q4/4B3/8/8/4K3 w - - 0 1',
      goal: 'Cattura il pezzo di maggior valore che non è difeso.', type: 'move', solution: ['e4d5'],
      hint: 'Conta il valore dei pezzi: pedone 1, cavallo e alfiere 3, torre 5, donna 9.',
      explanation: 'Axd5! L\'alfiere cattura la donna, che non è difesa da nessuno. Prima di ogni cattura chiediti sempre: "e se me la riprende?".'
    },
    {
      id: 'b5', level: 'Base', title: 'Metti al sicuro il re: l\'arrocco',
      fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1',
      goal: 'Esegui l\'arrocco corto (O-O).', type: 'move', solution: ['e1g1'],
      hint: 'Prima di attaccare, metti al sicuro il re: l\'arrocco corto si esegue muovendo il re di due case (e1-g1).',
      explanation: 'O-O! Il re va in g1 dietro ai pedoni e la torre entra in gioco in f1. L\'arrocco è l\'unica mossa in cui si muovono due pezzi insieme.'
    },
    {
      id: 'b6', level: 'Base', title: 'La promozione',
      fen: '8/P6k/8/8/8/8/8/K7 w - - 0 1',
      goal: 'Porta il pedone in ottava traversa.', type: 'move', solution: ['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n'],
      hint: 'Spingi il pedone da a7 ad a8: quando un pedone arriva in fondo diventa un pezzo!',
      explanation: 'a8=D! Il pedone diventa donna, il pezzo più forte. Quasi sempre si scegle la donna, che vale 9 pedoni.'
    },
    {
      id: 'b7', level: 'Base', title: 'Il matto del pastore',
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
      goal: 'Dai scacco matto in una mossa.', type: 'mate1', solution: ['h5f7'],
      hint: 'La donna in h5 e l\'alfiere in c4 guardano la stessa casa debole: la f7, difesa solo dal re.',
      explanation: 'Dxf7#! Il "matto del pastore": la donna cattura il pedone f7, protetta dall\'alfiere in c4. Il re non può prendere (la donna è difesa) e non ha case di fuga. Da ricordare: se l\'avversario gioca e5 e poi muove il cavallo in f6 senza difendere f7, questo matto è in agguato.'
    },

    /* ---------------- INTERMEDIO ---------------- */
    {
      id: 'i1', level: 'Intermedio', title: 'Matto in due: sacrificio in d8',
      fen: 'r5k1/5ppp/8/8/8/8/3Q1PPP/3R2K1 w - - 0 1',
      goal: 'Trova la prima mossa del matto in due.', type: 'move', solution: ['d2d8'],
      hint: 'Sacrifica qualcosa di grande sull\'ottava traversa: la torre è pronta a entrare.',
      explanation: 'Dd8+!! La donna si sacrifica per aprire la strada: la torre nera deve catturare (o bloccarsi), e poi Txd8 è matto. Il tema è la traversa debole: se il re non ha case di fuga, la traversa è fatale.'
    },
    {
      id: 'i2', level: 'Intermedio', title: 'La forchetta di cavallo',
      fen: 'r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1',
      goal: 'Con una sola mossa attacca il re e la torre avversaria.', type: 'move', solution: ['b5c7'],
      hint: 'Il cavallo deve saltare in una casa da cui tocca sia il re sia la torre.',
      explanation: 'Cc7+! Il cavallo dà scacco al re e contemporaneamente attacca la torre in a8: al prossimo colpo la catturerà. Questa doppia minaccia si chiama "forchetta" ed è l\'arma preferita del cavallo.'
    },
    {
      id: 'i3', level: 'Intermedio', title: 'Sfrutta l\'inchiodatura',
      fen: 'r3k3/pp3ppp/2n5/1B6/3P4/8/PPP2PPP/R5K1 w - - 0 1',
      goal: 'Attacca il cavallo nero, che è inchiodato al suo re.', type: 'move', solution: ['d4d5'],
      hint: 'Il cavallo in c6 non può muoversi: l\'alfiere in b5 lo inchioda al re in e8. Attaccalo con il pedone.',
      explanation: 'd5! Il pedone attacca il cavallo in c6, che è inchiodato al re dall\'alfiere in b5: non può scappare e verrà catturato. Riconoscere le inchiodature è uno dei temi tattici più redditizi.'
    },
    {
      id: 'i4', level: 'Intermedio', title: 'Il pedone passato corre',
      fen: '7k/8/8/8/8/8/8/K3P3 w - - 0 1',
      goal: 'Porta il pedone a promozione: il computer muoverà il re nero.', type: 'promotion', solution: [],
      hint: 'Il re nero è lontanissimo: avanza con il pedone e usa il tuo re per proteggerlo se serve.',
      explanation: 'Un pedone passato senza ostacoli davanti è una macchina da guerra: accompagnato dal re va dritto in promozione. Nel finale il re diventa un pezzo attivo, non resta in un angolo.'
    },

    /* ---------------- AVANZATO ---------------- */
    {
      id: 'a1', level: 'Avanzato', title: 'Attacco a raggi X',
      fen: '8/pp3p2/8/4k2r/8/8/5PPP/1R4K1 w - - 0 1',
      goal: 'Vinci la torre nera con una sola mossa.', type: 'move', solution: ['b1b5'],
      hint: 'Cerca una casa da cui la torre dà scacco e ha, dietro il re, un altro pezzo sulla stessa linea.',
      explanation: 'Tb5+! La torre dà scacco al re sulla quinta traversa: la torre nera in h5 non può difendere il re né catturare (il re la blocca), e dopo che il re si sposta segue Txb5 con la torre in più. Questo tema si chiama "attacco a raggi X": re e pezzo sulla stessa linea sono un bersaglio doppio.'
    },
    {
      id: 'a2', level: 'Avanzato', title: 'Il matto affogato',
      fen: '5rk1/6pp/8/3Q4/6N1/8/8/6K1 w - - 0 1',
      goal: 'Trova la prima mossa della combinazione di matto (sono 3 mosse).', type: 'move', solution: ['g4h6'],
      hint: 'Il cavallo va in h6 con scacco, poi la donna si sacrifica in g8... e il cavallo rifinisce in f7.',
      explanation: 'Ch6+! Rh8 forzato, poi Dg8+!! (la donna si immola, protetta dal cavallo) e dopo Rxg8 segue Cf7#: il re nero è soffocato dai suoi stessi pezzi. È il famoso "matto affogato": il cavallo e la donna sono una coppia letale.'
    },
    {
      id: 'a3', level: 'Avanzato', title: 'La forchetta del pedone',
      fen: '4k3/pp3ppp/2n1b3/8/3P4/5N2/PPP2PPP/3R2K1 w - - 0 1',
      goal: 'Con una spinta di pedone attacca due pezzi.', type: 'move', solution: ['d4d5'],
      hint: 'Un pedone che arriva in d5 minaccia due case contemporaneamente.',
      explanation: 'd5! Il pedone attacca insieme il cavallo in c6 e l\'alfiere in e6: il nero può salvarne solo uno. Anche il pedone sa fare forchette, e sono le più pericolose perché il pedone vale solo 1 punto.'
    },
    {
      id: 'a4', level: 'Avanzato', title: 'La forchetta reale',
      fen: 'r1q3k1/5ppp/8/3N4/8/8/5PPP/R2R2K1 w - - 0 1',
      goal: 'Con una mossa del cavallo attacca re e donna.', type: 'move', solution: ['d5e7'],
      hint: 'Il cavallo deve saltare in una casa che tocca sia il re in g8 sia la donna in c8.',
      explanation: 'Ce7+! Il cavallo dà scacco al re e attacca la donna in c8: il nero deve salvarsi dallo scacco e al colpo successivo il cavallo cattura la donna. Si chiama "forchetta reale" perché il re e la donna cadono nello stesso attacco.'
    }
  ];

  /* ============================================== testo per l'utente */
  function pieceName(t) { return PIECE_IT[t] || 'pezzo'; }

  return {
    PIECE_IT, PIECE_IT_ART, VALUE,
    attacksFrom, attackersOf, hangingPieces, findPins,
    describeMove, analyze, quality, detectOpening, LESSONS, OPENINGS,
    pieceName, descrTarget
  };
});
