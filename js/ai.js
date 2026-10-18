/* =========================================================================
 * ai.js - Valutazione posizione + ricerca (negamax, alpha-beta, TT,
 *         null-move, LMR, quiescenza) e livelli di difficolta'.
 * ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'));
  } else {
    root.ChessAI = factory(root.ChessEngine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
  'use strict';

  const { WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, mFrom, mTo, mPromo, mFlag,
    FLAG_EP, FLAG_CASTLE_K, FLAG_CASTLE_Q, colorOf, typeOf } = E;

  const nowMs = (typeof performance !== 'undefined' && performance.now)
    ? () => performance.now() : () => Date.now();

  /* ------------------------------------------------------------- valori */
  const VALUE = [0, 100, 320, 330, 500, 900, 20000];
  const VALUE_MG = [0, 100, 320, 330, 500, 900, 0];
  const VALUE_EG = [0, 120, 320, 330, 520, 900, 0];

  /* --------------------------------------------------- tabelle posizionali
   * Scritte dalla 8a traversa (indice 0 = a8) fino alla 1a (indice 63 = h1).
   * Per il bianco: indice = (7 - traversa) * 8 + colonna
   * Per il nero  : indice = traversa * 8 + colonna
   */
  const PST_MG = {}, PST_EG = {};

  PST_MG[PAWN] = [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0
  ];
  PST_EG[PAWN] = [
    0, 0, 0, 0, 0, 0, 0, 0,
    90, 90, 90, 90, 90, 90, 90, 90,
    50, 50, 50, 50, 50, 50, 50, 50,
    25, 25, 25, 25, 25, 25, 25, 25,
    10, 10, 10, 10, 10, 10, 10, 10,
    5, 5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5, 5,
    0, 0, 0, 0, 0, 0, 0, 0
  ];
  PST_MG[KNIGHT] = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
  ];
  PST_EG[KNIGHT] = PST_MG[KNIGHT];
  PST_MG[BISHOP] = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
  ];
  PST_EG[BISHOP] = PST_MG[BISHOP];
  PST_MG[ROOK] = [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0
  ];
  PST_EG[ROOK] = [
    0, 0, 0, 0, 0, 0, 0, 0,
    10, 10, 10, 10, 10, 10, 10, 10,
    5, 5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5, 5,
    5, 5, 5, 5, 5, 5, 5, 5,
    0, 0, 0, 0, 0, 0, 0, 0
  ];
  PST_MG[QUEEN] = [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20
  ];
  PST_EG[QUEEN] = PST_MG[QUEEN];
  PST_MG[KING] = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20
  ];
  PST_EG[KING] = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50
  ];

  const PHASE_UNITS = [0, 0, 1, 1, 2, 4, 0];
  const TOTAL_PHASE = 24;

  function pstIndex(sq, color) {
    const f = sq & 15, r = sq >> 4;
    return color === WHITE ? (7 - r) * 8 + f : r * 8 + f;
  }

  /* ======================================================================
   * Valutazione statica. Ritorna il punteggio dal punto di vista di chi muove.
   * ==================================================================== */
  function evaluate(board) {
    const sqArr = board.squares;
    let phase = 0;
    const pawns = [[], []];
    const pawnFiles = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]];
    const bishops = [0, 0];

    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = sqArr[s];
      if (!p) continue;
      const t = p & 7, c = p >> 3;
      phase += PHASE_UNITS[t];
      if (t === PAWN) {
        const f = s & 15, r = s >> 4;
        pawns[c].push(f, r);
        pawnFiles[c][f]++;
      } else if (t === BISHOP) bishops[c]++;
    }

    let mg = 0, eg = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = sqArr[s];
      if (!p) continue;
      const t = p & 7, c = p >> 3;
      const sign = c === WHITE ? 1 : -1;
      const idx = pstIndex(s, c);
      mg += sign * (VALUE_MG[t] + PST_MG[t][idx]);
      eg += sign * (VALUE_EG[t] + PST_EG[t][idx]);
    }

    /* struttura pedonale */
    for (let c = 0; c < 2; c++) {
      const sign = c === WHITE ? 1 : -1;
      const opp = pawns[c ^ 1];
      for (let f = 0; f < 8; f++) {
        const n = pawnFiles[c][f];
        if (n > 1) { mg -= sign * 14 * (n - 1); eg -= sign * 20 * (n - 1); }
        if (n > 0) {
          const left = f > 0 ? pawnFiles[c][f - 1] : 0;
          const right = f < 7 ? pawnFiles[c][f + 1] : 0;
          if (!left && !right) { mg -= sign * 16; eg -= sign * 22; }
        }
      }
      /* pedoni passati */
      for (let i = 0; i < pawns[c].length; i += 2) {
        const f = pawns[c][i], r = pawns[c][i + 1];
        let passed = true;
        for (let j = 0; j < opp.length; j += 2) {
          const of = opp[j], or_ = opp[j + 1];
          if (Math.abs(of - f) <= 1) {
            if (c === WHITE ? or_ > r : or_ < r) { passed = false; break; }
          }
        }
        if (passed) {
          const adv = c === WHITE ? r : 7 - r;
          const bonus = [0, 8, 15, 30, 55, 95, 150, 0][adv];
          mg += sign * bonus;
          eg += sign * bonus * 1.7 | 0;
        }
      }
      /* alfieri su colore opposto */
      if (bishops[c] >= 2) { mg += sign * 32; eg += sign * 48; }
    }

    /* torri su colonne aperte/semichiusa + sicurezza del re */
    for (let c = 0; c < 2; c++) {
      const sign = c === WHITE ? 1 : -1;
      const ownPawns = pawnFiles[c];
      const enemyPawns = pawnFiles[c ^ 1];
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        const p = sqArr[s];
        if (!p) continue;
        const t = p & 7;
        if (t !== ROOK) continue;
        const f = s & 15;
        if (!ownPawns[f] && !enemyPawns[f]) { mg += sign * 18; eg += sign * 10; }
        else if (!ownPawns[f]) { mg += sign * 8; eg += sign * 5; }
      }
      /* scudo pedonale davanti al re (solo mediogioco) */
      const k = board.kings[c];
      if (k >= 0) {
        const kf = k & 15;
        let shield = 0;
        const dir = c === WHITE ? 1 : -1;
        for (let df = -1; df <= 1; df++) {
          const f = kf + df;
          if (f < 0 || f > 7) continue;
          const base = k + dir * 16 + df;
          if (base >= 0 && base < 128 && !(base & 0x88) && sqArr[base] === (c === WHITE ? PAWN : PAWN + 8)) shield++;
        }
        mg += sign * (shield * 12 - 22);
        eg += sign * (shield * 3);
      }
    }

    const ph = phase > TOTAL_PHASE ? TOTAL_PHASE : phase;
    let score = (mg * ph + eg * (TOTAL_PHASE - ph)) / TOTAL_PHASE;
    score += 8; /* tempo */

    return board.turn === WHITE ? Math.round(score) : -Math.round(score);
  }

  /* ================================================ ricerca =============== */
  const INF = 1000000;
  const MATE = 100000;
  const MATE_THRESHOLD = 99000;
  const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

  function hasNonPawnMaterial(board, color) {
    const sq = board.squares;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = sq[s];
      if (!p || (p >> 3) !== color) continue;
      const t = p & 7;
      if (t !== PAWN && t !== KING) return true;
    }
    return false;
  }

  class Searcher {
    constructor(board, opts) {
      opts = opts || {};
      this.board = board;
      this.tt = opts.tt || new Map();
      this.killers = [];
      for (let i = 0; i < 128; i++) this.killers.push([0, 0]);
      this.history = new Int32Array(128 * 128);
      this.pathKeys = new Float64Array(160);
      this.gameKeyCounts = opts.gameKeyCounts || null;
      this.useNull = opts.nullMove !== false;
      this.nodes = 0;
      this.stopped = false;
      this.stopAt = Infinity;
      this.maxNodes = opts.maxNodes || Infinity;
    }

    /* ---------------------------------------------------------- utilità */
    scoreMove(m, ply, ttMove) {
      if (m === ttMove) return 10000000;
      const board = this.board;
      const from = mFrom(m), to = mTo(m);
      const victim = board.squares[to];
      const promo = mPromo(m);
      let s = 0;
      if (victim) {
        const attacker = board.squares[from];
        s = 1000000 + VALUE[victim & 7] * 16 - VALUE[attacker & 7];
      } else if (mFlag(m) === FLAG_EP) {
        s = 1000000 + 100 * 16 - 100;
      }
      if (promo) s += 900000 + VALUE[promo];
      if (s === 0) {
        const k = this.killers[ply];
        if (m === k[0]) s = 900000;
        else if (m === k[1]) s = 800000;
        else s = this.history[from * 128 + to];
      }
      return s;
    }

    timeUp() { return nowMs() >= this.stopAt || this.nodes >= this.maxNodes; }

    /* ------------------------------------------------------- quiescenza */
    quiesce(alpha, beta, ply) {
      this.nodes++;
      if ((this.nodes & 1023) === 0 && this.timeUp()) { this.stopped = true; return 0; }
      if (this.stopped) return 0;

      const board = this.board;
      const inCheck = board.inCheck(board.turn);
      let best;
      if (!inCheck) {
        best = evaluate(board);
        if (best >= beta) return best;
        if (best > alpha) alpha = best;
        if (ply >= 60) return best;
      } else {
        best = -INF;
        if (ply >= 60) return 0;
      }

      const capturesOnly = !inCheck;
      const moves = board.generateMoves(capturesOnly);
      const n = moves.length;
      if (n === 0) return inCheck ? -MATE + ply : alpha;

      const scores = new Int32Array(n);
      for (let i = 0; i < n; i++) scores[i] = this.scoreMove(moves[i], ply <= 127 ? ply : 127, 0);

      const us = board.turn;
      let legal = 0;
      for (let i = 0; i < n; i++) {
        let bi = i;
        for (let j = i + 1; j < n; j++) if (scores[j] > scores[bi]) bi = j;
        if (bi !== i) {
          const tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm;
          const ts = scores[i]; scores[i] = scores[bi]; scores[bi] = ts;
        }
        const m = moves[i];
        if (capturesOnly) {
          /* delta pruning */
          const victim = board.squares[mTo(m)];
          const gain = (victim ? VALUE[victim & 7] : 100) + (mPromo(m) ? 800 : 0);
          if (best + gain + 200 < alpha) continue;
        }
        board.makeMove(m);
        if (board.inCheck(us)) { board.undoMove(); continue; }
        legal++;
        const score = -this.quiesce(-beta, -alpha, ply + 1);
        board.undoMove();
        if (this.stopped) return 0;
        if (score > best) {
          best = score;
          if (score > alpha) {
            alpha = score;
            if (alpha >= beta) return alpha;
          }
        }
      }
      if (legal === 0 && inCheck) return -MATE + ply;
      return best;
    }

    /* ---------------------------------------------------------- negamax */
    negamax(depth, alpha, beta, ply) {
      this.nodes++;
      if ((this.nodes & 1023) === 0 && this.timeUp()) { this.stopped = true; return 0; }
      if (this.stopped) return 0;

      const board = this.board;

      if (ply > 0) {
        if (board.halfmove >= 100) return 0;
        const k0 = board.key();
        if (board.pieceCount <= 4 && board.insufficientMaterial()) return 0;
        if (ply < 158) {
          this.pathKeys[ply] = k0;
          for (let p = ply - 2; p >= 0; p -= 2) if (this.pathKeys[p] === k0) return 0;
        }
        if (this.gameKeyCounts) {
          const c = this.gameKeyCounts.get(k0);
          if (c !== undefined && c >= 2) return 0;
        }
      }

      const key = board.key();
      const entry = this.tt.get(key);
      let ttMove = 0;
      if (entry) {
        ttMove = entry.move;
        if (entry.depth >= depth) {
          if (entry.flag === TT_EXACT) return entry.score;
          if (entry.flag === TT_LOWER && entry.score >= beta) return entry.score;
          if (entry.flag === TT_UPPER && entry.score <= alpha) return entry.score;
        }
      }

      if (depth <= 0) return this.quiesce(alpha, beta, ply <= 127 ? ply : 127);

      const inCheck = board.inCheck(board.turn);
      if (inCheck && ply < 30) depth++;

      /* null move */
      if (this.useNull && !inCheck && depth >= 3 && beta < MATE_THRESHOLD && ply > 0
        && hasNonPawnMaterial(board, board.turn)) {
        board.makeNullMove();
        const nscore = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1);
        board.undoNullMove();
        if (this.stopped) return 0;
        if (nscore >= beta) return beta;
      }

      const moves = board.generateMoves(false);
      const n = moves.length;
      const scores = new Int32Array(n);
      for (let i = 0; i < n; i++) scores[i] = this.scoreMove(moves[i], ply <= 127 ? ply : 127, ttMove);

      const us = board.turn;
      const alphaOrig = alpha;
      const enemy = us ^ 1;
      const enemyHasNonPawn = hasNonPawnMaterial(board, enemy);
      let bestScore = -INF, bestMove = 0, legal = 0;

      for (let i = 0; i < n; i++) {
        let bi = i;
        for (let j = i + 1; j < n; j++) if (scores[j] > scores[bi]) bi = j;
        if (bi !== i) {
          const tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm;
          const ts = scores[i]; scores[i] = scores[bi]; scores[bi] = ts;
        }
        const m = moves[i];
        const isQuiet = !board.squares[mTo(m)] && mFlag(m) !== FLAG_EP && !mPromo(m);

        board.makeMove(m);
        if (board.inCheck(us)) { board.undoMove(); continue; }
        legal++;

        const givesCheck = board.inCheck(enemy);
        let newDepth = depth - 1;
        if (givesCheck && ply < 24) newDepth++;
        let reduction = 0;
        if (depth >= 3 && legal > 3 && isQuiet && !givesCheck && !inCheck) {
          reduction = 1;
          if (depth >= 6 && legal > 8) reduction = 2;
        }

        let score;
        if (legal === 1) {
          score = -this.negamax(newDepth, -beta, -alpha, ply + 1);
        } else {
          score = -this.negamax(newDepth - reduction, -alpha - 1, -alpha, ply + 1);
          if (score > alpha && reduction > 0 && !this.stopped) {
            score = -this.negamax(newDepth, -alpha - 1, -alpha, ply + 1);
          }
          if (score > alpha && score < beta && !this.stopped) {
            score = -this.negamax(newDepth, -beta, -alpha, ply + 1);
          }
        }
        board.undoMove();
        if (this.stopped) return 0;

        if (score > bestScore) {
          bestScore = score;
          bestMove = m;
          if (score > alpha) {
            alpha = score;
            if (alpha >= beta) {
              if (isQuiet) {
                const k = this.killers[ply <= 127 ? ply : 127];
                if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
                this.history[mFrom(m) * 128 + mTo(m)] += depth * depth;
              }
              break;
            }
          }
        }
      }

      if (legal === 0) return inCheck ? -MATE + ply : 0;

      let flag = TT_EXACT;
      if (bestScore <= alphaOrig) flag = TT_UPPER;
      else if (bestScore >= beta) flag = TT_LOWER;
      if (bestScore > -MATE_THRESHOLD && bestScore < MATE_THRESHOLD) {
        this.tt.set(key, { depth, score: bestScore, flag, move: bestMove });
      }
      return bestScore;
    }

    /* ------------------------------------------------------------ radice */
    searchRootOnce(depth, prevBest, exact) {
      const board = this.board;
      const moves = this.rootMoves.slice();
      const n = moves.length;
      const scores = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        scores[i] = moves[i] === prevBest ? 10000000 : this.scoreMove(moves[i], 0, prevBest);
      }

      let bestMove = 0, bestScore = -INF, alpha = -INF, searched = 0;
      const collected = exact ? [] : null;

      for (let i = 0; i < n; i++) {
        let bi = i;
        for (let j = i + 1; j < n; j++) if (scores[j] > scores[bi]) bi = j;
        if (bi !== i) {
          const tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm;
          const ts = scores[i]; scores[i] = scores[bi]; scores[bi] = ts;
        }
        if (this.stopped || this.timeUp()) break;
        const m = moves[i];
        board.makeMove(m);
        let score;
        if (exact) {
          score = -this.negamax(depth - 1, -INF, INF, 1);
        } else if (searched === 0) {
          score = -this.negamax(depth - 1, -INF, -alpha, 1);
        } else {
          score = -this.negamax(depth - 1, -alpha - 1, -alpha, 1);
          if (score > alpha && !this.stopped) score = -this.negamax(depth - 1, -INF, -alpha, 1);
        }
        board.undoMove();
        if (this.stopped) break;
        searched++;
        if (collected) collected.push({ move: m, score: score });
        if (score > bestScore) {
          bestScore = score;
          bestMove = m;
          if (!exact && score > alpha) alpha = score;
        }
      }
      if (bestMove === 0) return null;
      return { move: bestMove, score: bestScore, complete: !this.stopped, scores: collected };
    }

    /* ------------------------------------------------------------ avvio */
    prepare() {
      const board = this.board;
      const legal = [];
      const moves = board.generateMoves(false);
      for (let i = 0; i < moves.length; i++) {
        board.makeMove(moves[i]);
        const ok = !board.inCheck(board.turn ^ 1);
        board.undoMove();
        if (ok) legal.push(moves[i]);
      }
      this.rootMoves = legal;
      return legal;
    }

    search(opts) {
      opts = opts || {};
      const maxDepth = opts.maxDepth || 3;
      const timeMs = opts.timeMs || 1000;
      const exactRoot = !!opts.exactRootScores;

      this.stopped = false;
      this.nodes = 0;
      this.startedAt = nowMs();
      this.stopAt = nowMs() + timeMs;
      this.maxNodes = opts.maxNodes || Infinity;
      if (this.gameKeyCounts) this.pathKeys[0] = this.board.key();

      const legal = this.prepare();
      if (legal.length === 0) return null;
      /* niente scorciatoia con una sola mossa: la ricerca la valuta comunque,
         altrimenti la posizione risulterebbe "0.00" (equilibrio) per finta */

      let best = null, bestEven = null, prevBest = 0;
      for (let d = 1; d <= maxDepth; d++) {
        const res = this.searchRootOnce(d, prevBest, exactRoot && d >= maxDepth);
        if (res) {
          best = res;
          best.depth = d;
          best.nodes = this.nodes;
          best.timeMs = Math.round(nowMs() - this.startedAt);
          if (d % 2 === 0) bestEven = best;
          prevBest = res.move;
        }
        if (this.stopped) break;
        if (best && (best.score > MATE_THRESHOLD || best.score < -MATE_THRESHOLD)) break;
        if (nowMs() - this.startedAt > timeMs * 0.45) break;
      }
      /* la valutazione statica non è simmetrica fra "tocca al bianco" e
         "tocca al nero": a profondità dispari chi ha mosso per ultimo sembra
         in vantaggio. Per la barra di valutazione preferiamo un risultato
         a profondità pari. */
      if (opts.evenDepth && best && !isMateScore(best.score) && best.depth % 2 === 1 && bestEven) return bestEven;
      return best;
    }
  }

  /* -------------------------------------------------- PV dalla TT */
  function isMateScore(score) { return score > MATE_THRESHOLD || score < -MATE_THRESHOLD; }

  function extractPv(board, tt, maxLen) {
    const clone = board.clone();
    const out = [];
    const seen = new Set();
    for (let i = 0; i < (maxLen || 8); i++) {
      const key = clone.key();
      if (seen.has(key)) break;
      seen.add(key);
      const entry = tt.get(key);
      if (!entry || !entry.move) break;
      const legal = clone.generateLegalMoves();
      if (legal.indexOf(entry.move) < 0) break;
      out.push(entry.move);
      clone.makeMove(entry.move);
    }
    return out;
  }

  /* ================================================== livelli ============ */
  const LEVELS = [
    {
      id: 1, name: 'Principiante', elo: '~400',
      depth: 1, timeMs: 150, noise: 170, blunder: 0.40,
      desc: 'Gioca quasi a caso: utile per imparare le regole e i primi matti.'
    },
    {
      id: 2, name: 'Novizio', elo: '~700',
      depth: 2, timeMs: 220, noise: 110, blunder: 0.24,
      desc: 'Commette molti errori, ma riconosce le catture piu\' semplici.'
    },
    {
      id: 3, name: 'Dilettante', elo: '~1000',
      depth: 2, timeMs: 320, noise: 65, blunder: 0.14,
      desc: 'Vede gli attacchi a un colpo e qualche minaccia semplice.'
    },
    {
      id: 4, name: 'Gambettista', elo: '~1250',
      depth: 3, timeMs: 500, noise: 35, blunder: 0.08,
      desc: 'Calcola qualche mossa in avanti e gioca gli sviluppi naturali.'
    },
    {
      id: 5, name: 'Intermedio', elo: '~1500',
      depth: 3, timeMs: 800, noise: 20, blunder: 0.04,
      desc: 'Buona tattica di base, sfrutta i pezzi in presa.'
    },
    {
      id: 6, name: 'Avanzato', elo: '~1750',
      depth: 4, timeMs: 1200, noise: 8, blunder: 0.02,
      desc: 'Calcola combinazioni di 3-4 mosse e cura la struttura pedonale.'
    },
    {
      id: 7, name: 'Esperto', elo: '~2000',
      depth: 5, timeMs: 1700, noise: 0, blunder: 0.005,
      desc: 'Gioco solido, sacrifici corretti e finali precisi.'
    },
    {
      id: 8, name: 'Maestro', elo: '~2150',
      depth: 6, timeMs: 2400, noise: 0, blunder: 0,
      desc: 'Il livello piu\' forte: nessun errore volontario, calcolo profondo.'
    }
  ];

  /* ------------------------------------------- scelta della mossa con livello */
  function chooseMove(board, levelIndex, opts) {
    opts = opts || {};
    const level = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, levelIndex))];
    const searcher = new Searcher(board, opts);
    const res = searcher.search({
      maxDepth: level.depth,
      timeMs: level.timeMs,
      exactRootScores: level.noise > 0
    });
    if (!res) return null;

    const info = {
      move: res.move,
      score: res.score,
      depth: res.depth,
      nodes: res.nodes,
      timeMs: res.timeMs,
      level: level.name,
      blunder: false,
      scoreLoss: 0
    };

    if (!res.scores || res.scores.length <= 1 || level.noise <= 0) return info;

    const list = res.scores.slice().sort((a, b) => b.score - a.score);
    if (list.length > 1 && Math.random() < level.blunder) {
      const pool = level.blunder > 0.3 ? list : list.slice(0, Math.max(2, Math.ceil(list.length / 2)));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      info.move = pick.move;
      info.score = pick.score;
      info.blunder = true;
      info.scoreLoss = Math.max(0, list[0].score - pick.score);
      return info;
    }

    let best = null;
    for (let i = 0; i < list.length; i++) {
      const noisy = list[i].score + (Math.random() * 2 - 1) * level.noise;
      if (!best || noisy > best.noisy) best = { noisy: noisy, cand: list[i] };
    }
    info.move = best.cand.move;
    info.score = best.cand.score;
    info.scoreLoss = Math.max(0, list[0].score - best.cand.score);
    return info;
  }

  /* --------------------------------------------- analisi "da insegnante" */
  function analyzePosition(board, opts) {
    opts = opts || {};
    const depth = opts.depth || 4;
    const timeMs = opts.timeMs || 1200;
    const searcher = new Searcher(board, { tt: opts.tt || new Map() });
    const res = searcher.search({
      maxDepth: depth, timeMs: timeMs, exactRootScores: false,
      evenDepth: opts.evenDepth !== false
    });
    if (!res) {
      return { legalMoves: 0, score: 0, mateIn: null, bestMove: null, pv: [], depth: 0 };
    }
    const score = res.score;
    let mateIn = null;
    if (score > MATE_THRESHOLD) mateIn = Math.ceil((MATE - score) / 2);
    else if (score < -MATE_THRESHOLD) mateIn = -Math.ceil((MATE + score) / 2);
    const pv = [];
    if (res.move) {
      pv.push(res.move);
      const clone = board.clone();
      clone.makeMove(res.move);
      const rest = extractPv(clone, searcher.tt, 6);
      for (let i = 0; i < rest.length; i++) pv.push(rest[i]);
    }
    return {
      legalMoves: searcher.rootMoves.length,
      score: score,
      mateIn: mateIn,
      bestMove: res.move,
      bestScore: score,
      pv: pv,
      depth: res.depth,
      nodes: res.nodes,
      searcher: searcher
    };
  }

  return {
    LEVELS, VALUE, evaluate, Searcher, chooseMove, analyzePosition,
    extractPv, MATE, MATE_THRESHOLD, hasNonPawnMaterial, isMateScore
  };
});
