/* =========================================================================
 * engine.js - Motore scacchistico: scacchiera, generazione mosse, FEN, SAN,
 *             hashing Zobrist, arrocco, en passant, promozione.
 * Rappresentazione 0x88. Codifica pezzo = colore*8 + tipo
 *   colore: 0 = bianco, 1 = nero
 *   tipo:   1 = pedone, 2 = cavallo, 3 = alfirе, 4 = torre, 5 = donna, 6 = re
 * ========================================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- costanti */
  const WHITE = 0, BLACK = 1;
  const EMPTY = 0;
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const FLAG_NONE = 0, FLAG_EP = 1, FLAG_CASTLE_K = 2, FLAG_CASTLE_Q = 3, FLAG_DOUBLE = 4;

  const CASTLE_WK = 1, CASTLE_WQ = 2, CASTLE_BK = 4, CASTLE_BQ = 8;

  const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];
  const BISHOP_OFFSETS = [-17, -15, 15, 17];
  const ROOK_OFFSETS = [-16, -1, 1, 16];
  const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];

  const PIECE_LETTER = { 1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };
  const LETTER_TO_TYPE = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };

  const CHAR_TO_PIECE = {
    p: 9, n: 10, b: 11, r: 12, q: 13, k: 14,
    P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6
  };
  const PIECE_CHAR = ['', 'P', 'N', 'B', 'R', 'Q', 'K', '', '', 'p', 'n', 'b', 'r', 'q', 'k'];

  /* ------------------------------------------------------------ utilità 0x88 */
  const onBoard = (s) => (s & 0x88) === 0;
  const fileOf = (s) => s & 15;
  const rankOf = (s) => s >> 4;
  const colorOf = (p) => p >> 3;
  const typeOf = (p) => p & 7;

  function sqToAlg(s) {
    return String.fromCharCode(97 + (s & 15)) + String.fromCharCode(49 + (s >> 4));
  }
  function algToSq(a) {
    const f = a.charCodeAt(0) - 97;
    const r = a.charCodeAt(1) - 49;
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return r * 16 + f;
  }
  function sqToIndex(s) { return rankOf(s) * 8 + fileOf(s); }

  /* ------------------------------------------------------- codifica delle mosse
   * bit  0-7  : casa di partenza
   * bit  8-15 : casa di arrivo
   * bit 16-19 : pezzo di promozione (0 = nessuno)
   * bit 20-23 : flag speciale
   */
  function encodeMove(from, to, promo, flag) {
    return (from & 0xFF) | ((to & 0xFF) << 8) | ((promo & 0xF) << 16) | ((flag & 0xF) << 20);
  }
  const mFrom = (m) => m & 0xFF;
  const mTo = (m) => (m >> 8) & 0xFF;
  const mPromo = (m) => (m >> 16) & 0xF;
  const mFlag = (m) => (m >> 20) & 0xF;

  function moveToUci(m) {
    let s = sqToAlg(mFrom(m)) + sqToAlg(mTo(m));
    const p = mPromo(m);
    if (p) s += PIECE_LETTER[p].toLowerCase();
    return s;
  }
  function uciToMove(board, uci) {
    if (!uci || uci.length < 4) return 0;
    const from = algToSq(uci.slice(0, 2));
    const to = algToSq(uci.slice(2, 4));
    const promo = uci.length > 4 ? LETTER_TO_TYPE[uci[4].toUpperCase()] || 0 : 0;
    const moves = board.generateLegalMoves();
    for (const m of moves) {
      if (mFrom(m) === from && mTo(m) === to && mPromo(m) === promo) return m;
    }
    // fallback: promozione non specificata
    for (const m of moves) {
      if (mFrom(m) === from && mTo(m) === to) return m;
    }
    return 0;
  }

  /* ------------------------------------------------------- Zobrist (38 bit) */
  let seed = 0x9e3779b9;
  function rnd32() {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed >>> 0;
  }
  const Z1 = { pieces: [], turn: 0, castling: [], ep: [] };
  const Z2 = { pieces: [], turn: 0, castling: [], ep: [] };
  (function initZobrist() {
    for (let p = 0; p < 15; p++) {
      Z1.pieces[p] = new Int32Array(128);
      Z2.pieces[p] = new Int32Array(128);
      for (let s = 0; s < 128; s++) {
        Z1.pieces[p][s] = rnd32() & 63;
        Z2.pieces[p][s] = rnd32() | 0;
      }
    }
    Z1.turn = rnd32() & 63; Z2.turn = rnd32() | 0;
    for (let c = 0; c < 16; c++) { Z1.castling[c] = rnd32() & 63; Z2.castling[c] = rnd32() | 0; }
    for (let f = 0; f < 8; f++) { Z1.ep[f] = rnd32() & 63; Z2.ep[f] = rnd32() | 0; }
  })();

  /* ================================================================= Board */
  class Board {
    constructor(fen) {
      this.squares = new Uint8Array(128);
      this.undoStack = [];
      this.load(fen || START_FEN);
    }

    /* ------------------------------------------------------------- FEN */
    load(fen) {
      const parts = String(fen).trim().split(/\s+/);
      if (!parts[0]) throw new Error('FEN non valida');
      this.squares.fill(0);
      const rows = parts[0].split('/');
      let count = 0;
      for (let i = 0; i < 8; i++) {
        const rank = 7 - i;
        const row = rows[i] || '';
        let file = 0;
        for (const ch of row) {
          if (ch >= '1' && ch <= '8') {
            file += ch.charCodeAt(0) - 48;
          } else {
            const piece = CHAR_TO_PIECE[ch];
            if (!piece) throw new Error('FEN non valida: ' + ch);
            if (file > 7) throw new Error('FEN non valida');
            this.squares[rank * 16 + file] = piece;
            file++;
            count++;
          }
        }
      }
      this.turn = parts[1] === 'b' ? BLACK : WHITE;
      this.castling = 0;
      const c = parts[2] || '-';
      if (c.indexOf('K') >= 0) this.castling |= CASTLE_WK;
      if (c.indexOf('Q') >= 0) this.castling |= CASTLE_WQ;
      if (c.indexOf('k') >= 0) this.castling |= CASTLE_BK;
      if (c.indexOf('q') >= 0) this.castling |= CASTLE_BQ;
      this.ep = (parts[3] && parts[3] !== '-') ? algToSq(parts[3]) : -1;
      this.halfmove = parts[4] ? (parseInt(parts[4], 10) || 0) : 0;
      this.fullmove = parts[5] ? (parseInt(parts[5], 10) || 1) : 1;

      this.kings = [-1, -1];
      this.pieceCount = 0;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        const p = this.squares[s];
        if (!p) continue;
        if (typeOf(p) === KING) this.kings[colorOf(p)] = s;
        else this.pieceCount++;
      }
      this.undoStack = [];
      this.computeHash();
    }

    fen() {
      let out = '';
      for (let rank = 7; rank >= 0; rank--) {
        let empty = 0;
        for (let file = 0; file < 8; file++) {
          const p = this.squares[rank * 16 + file];
          if (!p) { empty++; continue; }
          if (empty) { out += empty; empty = 0; }
          out += PIECE_CHAR[p];
        }
        if (empty) out += empty;
        if (rank > 0) out += '/';
      }
      out += this.turn === WHITE ? ' w' : ' b';
      let cr = '';
      if (this.castling & CASTLE_WK) cr += 'K';
      if (this.castling & CASTLE_WQ) cr += 'Q';
      if (this.castling & CASTLE_BK) cr += 'k';
      if (this.castling & CASTLE_BQ) cr += 'q';
      out += ' ' + (cr || '-');
      out += ' ' + (this.ep >= 0 ? sqToAlg(this.ep) : '-');
      out += ' ' + this.halfmove + ' ' + this.fullmove;
      return out;
    }

    clone() { return new Board(this.fen()); }

    /* ------------------------------------------------------ hashing */
    _hx(a, b) { this.h1 ^= a; this.h2 ^= b; }
    _xorPiece(piece, sq) { this._hx(Z1.pieces[piece][sq], Z2.pieces[piece][sq]); }
    _xorTurn() { this._hx(Z1.turn, Z2.turn); }
    _xorCastling(c) { this._hx(Z1.castling[c], Z2.castling[c]); }
    _xorEpFile(f) { this._hx(Z1.ep[f], Z2.ep[f]); }

    computeHash() {
      this.h1 = 0; this.h2 = 0;
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        const p = this.squares[s];
        if (p) this._xorPiece(p, s);
      }
      if (this.turn === BLACK) this._xorTurn();
      this._xorCastling(this.castling);
      if (this.ep >= 0) this._xorEpFile(fileOf(this.ep));
      return this.key();
    }
    key() { return this.h1 * 4294967296 + (this.h2 >>> 0); }

    /* ------------------------------------------------- isSquareAttacked */
    isAttacked(target, byColor) {
      const sq = this.squares;
      if (byColor === WHITE) {
        let s = target - 17;
        if (!(s & 0x88) && s >= 0 && sq[s] === 1) return true;
        s = target - 15;
        if (!(s & 0x88) && s >= 0 && sq[s] === 1) return true;
      } else {
        let s = target + 17;
        if (s < 128 && !(s & 0x88) && sq[s] === 9) return true;
        s = target + 15;
        if (s < 128 && !(s & 0x88) && sq[s] === 9) return true;
      }
      const kn = byColor === WHITE ? KNIGHT : 10;
      for (let i = 0; i < 8; i++) {
        const s = target + KNIGHT_OFFSETS[i];
        if (s >= 0 && s < 128 && !(s & 0x88) && sq[s] === kn) return true;
      }
      const kg = byColor === WHITE ? KING : 14;
      for (let i = 0; i < 8; i++) {
        const s = target + KING_OFFSETS[i];
        if (s >= 0 && s < 128 && !(s & 0x88) && sq[s] === kg) return true;
      }
      const bi = byColor === WHITE ? BISHOP : 11;
      const ro = byColor === WHITE ? ROOK : 12;
      const qu = byColor === WHITE ? QUEEN : 13;
      for (let i = 0; i < 4; i++) {
        const off = BISHOP_OFFSETS[i];
        let s = target + off;
        while (s >= 0 && s < 128 && !(s & 0x88)) {
          const p = sq[s];
          if (p) { if (p === bi || p === qu) return true; break; }
          s += off;
        }
      }
      for (let i = 0; i < 4; i++) {
        const off = ROOK_OFFSETS[i];
        let s = target + off;
        while (s >= 0 && s < 128 && !(s & 0x88)) {
          const p = sq[s];
          if (p) { if (p === ro || p === qu) return true; break; }
          s += off;
        }
      }
      return false;
    }

    inCheck(color) {
      const k = this.kings[color];
      if (k < 0) return false;
      return this.isAttacked(k, color ^ 1);
    }

    /* -------------------------------------------------- generazione mosse */
    generateMoves(capturesOnly) {
      const moves = [];
      const sq = this.squares;
      const us = this.turn, them = us ^ 1;
      const ep = this.ep;

      for (let from = 0; from < 128; from++) {
        if (from & 0x88) { from += 7; continue; }
        const piece = sq[from];
        if (!piece || colorOf(piece) !== us) continue;
        const type = typeOf(piece);

        if (type === PAWN) {
          const dir = us === WHITE ? 16 : -16;
          const startRank = us === WHITE ? 1 : 6;
          const promoRank = us === WHITE ? 6 : 1;
          let to = from + dir;
          if (to >= 0 && to < 128 && !(to & 0x88) && !sq[to]) {
            if (rankOf(from) === promoRank) {
              moves.push(encodeMove(from, to, QUEEN, FLAG_NONE));
              moves.push(encodeMove(from, to, ROOK, FLAG_NONE));
              moves.push(encodeMove(from, to, BISHOP, FLAG_NONE));
              moves.push(encodeMove(from, to, KNIGHT, FLAG_NONE));
            } else if (!capturesOnly) {
              moves.push(encodeMove(from, to, 0, FLAG_NONE));
              const to2 = from + 2 * dir;
              if (rankOf(from) === startRank && to2 >= 0 && to2 < 128 && !(to2 & 0x88) && !sq[to2]) {
                moves.push(encodeMove(from, to2, 0, FLAG_DOUBLE));
              }
            }
          }
          for (let k = 0; k < 2; k++) {
            const off = k === 0 ? dir - 1 : dir + 1;
            const t = from + off;
            if (t < 0 || t > 127 || (t & 0x88)) continue;
            const target = sq[t];
            if (target && colorOf(target) === them) {
              if (rankOf(from) === promoRank) {
                moves.push(encodeMove(from, t, QUEEN, FLAG_NONE));
                moves.push(encodeMove(from, t, ROOK, FLAG_NONE));
                moves.push(encodeMove(from, t, BISHOP, FLAG_NONE));
                moves.push(encodeMove(from, t, KNIGHT, FLAG_NONE));
              } else {
                moves.push(encodeMove(from, t, 0, FLAG_NONE));
              }
            } else if (!target && t === ep) {
              moves.push(encodeMove(from, t, 0, FLAG_EP));
            }
          }
        } else if (type === KNIGHT || type === KING) {
          const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
          for (let i = 0; i < offsets.length; i++) {
            const to = from + offsets[i];
            if (to < 0 || to > 127 || (to & 0x88)) continue;
            const target = sq[to];
            if (target && colorOf(target) === us) continue;
            if (capturesOnly && !target) continue;
            moves.push(encodeMove(from, to, 0, FLAG_NONE));
          }
          if (type === KING && !capturesOnly) {
            const c = this.castling;
            if (us === WHITE) {
              if ((c & CASTLE_WK) && !sq[5] && !sq[6]) {
                if (!this.isAttacked(4, them) && !this.isAttacked(5, them) && !this.isAttacked(6, them)) {
                  moves.push(encodeMove(4, 6, 0, FLAG_CASTLE_K));
                }
              }
              if ((c & CASTLE_WQ) && !sq[1] && !sq[2] && !sq[3]) {
                if (!this.isAttacked(4, them) && !this.isAttacked(3, them) && !this.isAttacked(2, them)) {
                  moves.push(encodeMove(4, 2, 0, FLAG_CASTLE_Q));
                }
              }
            } else {
              if ((c & CASTLE_BK) && !sq[117] && !sq[118]) {
                if (!this.isAttacked(116, them) && !this.isAttacked(117, them) && !this.isAttacked(118, them)) {
                  moves.push(encodeMove(116, 118, 0, FLAG_CASTLE_K));
                }
              }
              if ((c & CASTLE_BQ) && !sq[113] && !sq[114] && !sq[115]) {
                if (!this.isAttacked(116, them) && !this.isAttacked(115, them) && !this.isAttacked(114, them)) {
                  moves.push(encodeMove(116, 114, 0, FLAG_CASTLE_Q));
                }
              }
            }
          }
        } else {
          const offsets = type === BISHOP ? BISHOP_OFFSETS : type === ROOK ? ROOK_OFFSETS : KING_OFFSETS;
          for (let i = 0; i < offsets.length; i++) {
            const off = offsets[i];
            let to = from + off;
            while (to >= 0 && to < 128 && !(to & 0x88)) {
              const target = sq[to];
              if (target) {
                if (colorOf(target) === them) moves.push(encodeMove(from, to, 0, FLAG_NONE));
                break;
              }
              if (!capturesOnly) moves.push(encodeMove(from, to, 0, FLAG_NONE));
              to += off;
            }
          }
        }
      }
      return moves;
    }

    generateLegalMoves() {
      const out = [];
      const moves = this.generateMoves(false);
      const us = this.turn;
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        this.makeMove(m);
        if (!this.inCheck(us)) out.push(m);
        this.undoMove();
      }
      return out;
    }

    hasLegalMoves() {
      const moves = this.generateMoves(false);
      const us = this.turn;
      for (let i = 0; i < moves.length; i++) {
        this.makeMove(moves[i]);
        const ok = !this.inCheck(us);
        this.undoMove();
        if (ok) return true;
      }
      return false;
    }

    /* ------------------------------------------------------ make / undo */
    makeMove(m) {
      const from = mFrom(m), to = mTo(m), flag = mFlag(m), promo = mPromo(m);
      const sq = this.squares;
      const piece = sq[from];
      const us = colorOf(piece), them = us ^ 1;
      const capturedSq = flag === FLAG_EP ? (us === WHITE ? to - 16 : to + 16) : to;
      const captured = sq[capturedSq];

      this.undoStack.push({
        m, castling: this.castling, ep: this.ep, halfmove: this.halfmove,
        fullmove: this.fullmove, captured, capturedSq, h1: this.h1, h2: this.h2,
        kingW: this.kings[0], kingB: this.kings[1]
      });

      /* hash: rimuovo ep e diritti di arrocco correnti */
      if (this.ep >= 0) this._xorEpFile(fileOf(this.ep));

      let castling = this.castling;
      if (piece === 6) castling &= ~(CASTLE_WK | CASTLE_WQ);
      if (piece === 14) castling &= ~(CASTLE_BK | CASTLE_BQ);
      if (piece === 4) { if (from === 0) castling &= ~CASTLE_WQ; if (from === 7) castling &= ~CASTLE_WK; }
      if (piece === 12) { if (from === 112) castling &= ~CASTLE_BQ; if (from === 119) castling &= ~CASTLE_BK; }
      if (captured === 4) { if (capturedSq === 0) castling &= ~CASTLE_WQ; if (capturedSq === 7) castling &= ~CASTLE_WK; }
      if (captured === 12) { if (capturedSq === 112) castling &= ~CASTLE_BQ; if (capturedSq === 119) castling &= ~CASTLE_BK; }
      if (castling !== this.castling) {
        this._xorCastling(this.castling);
        this._xorCastling(castling);
        this.castling = castling;
      }

      /* sposto i pezzi */
      this._xorPiece(piece, from);
      sq[from] = 0;
      if (captured) {
        this._xorPiece(captured, capturedSq);
        sq[capturedSq] = 0;
        this.pieceCount--;
      }
      const placed = promo ? ((us << 3) | promo) : piece;
      sq[to] = placed;
      this._xorPiece(placed, to);

      if (flag === FLAG_CASTLE_K) {
        if (us === WHITE) { sq[7] = 0; sq[5] = 4; this._xorPiece(4, 7); this._xorPiece(4, 5); }
        else { sq[119] = 0; sq[117] = 12; this._xorPiece(12, 119); this._xorPiece(12, 117); }
      } else if (flag === FLAG_CASTLE_Q) {
        if (us === WHITE) { sq[0] = 0; sq[3] = 4; this._xorPiece(4, 0); this._xorPiece(4, 3); }
        else { sq[112] = 0; sq[115] = 12; this._xorPiece(12, 112); this._xorPiece(12, 115); }
      }

      if (typeOf(piece) === KING) this.kings[us] = to;

      this.ep = flag === FLAG_DOUBLE ? (from + to) >> 1 : -1;
      if (this.ep >= 0) this._xorEpFile(fileOf(this.ep));

      this.halfmove = (typeOf(piece) === PAWN || captured) ? 0 : this.halfmove + 1;
      if (us === BLACK) this.fullmove++;
      this.turn = them;
      this._xorTurn();
    }

    undoMove() {
      const u = this.undoStack.pop();
      if (!u) return;
      const m = u.m;
      const from = mFrom(m), to = mTo(m), flag = mFlag(m), promo = mPromo(m);
      const sq = this.squares;

      if (flag === FLAG_CASTLE_K) {
        if (this.turn === BLACK) { sq[5] = 0; sq[7] = 4; }
        else { sq[117] = 0; sq[119] = 12; }
      } else if (flag === FLAG_CASTLE_Q) {
        if (this.turn === BLACK) { sq[3] = 0; sq[0] = 4; }
        else { sq[115] = 0; sq[112] = 12; }
      }

      const piece = sq[to];
      sq[to] = 0;
      sq[from] = promo ? ((colorOf(piece) << 3) | PAWN) : piece;
      if (u.captured) { sq[u.capturedSq] = u.captured; this.pieceCount++; }

      this.castling = u.castling;
      this.ep = u.ep;
      this.halfmove = u.halfmove;
      this.fullmove = u.fullmove;
      this.kings[0] = u.kingW;
      this.kings[1] = u.kingB;
      this.h1 = u.h1;
      this.h2 = u.h2;
      this.turn ^= 1;
    }

    makeNullMove() {
      this.undoStack.push({
        nullMove: true, castling: this.castling, ep: this.ep, halfmove: this.halfmove,
        fullmove: this.fullmove, captured: 0, capturedSq: -1, h1: this.h1, h2: this.h2,
        kingW: this.kings[0], kingB: this.kings[1]
      });
      if (this.ep >= 0) this._xorEpFile(fileOf(this.ep));
      this.ep = -1;
      this.halfmove++;
      this.turn ^= 1;
      this._xorTurn();
    }

    undoNullMove() {
      const u = this.undoStack.pop();
      if (!u) return;
      this.castling = u.castling;
      this.ep = u.ep;
      this.halfmove = u.halfmove;
      this.fullmove = u.fullmove;
      this.h1 = u.h1;
      this.h2 = u.h2;
      this.kings[0] = u.kingW;
      this.kings[1] = u.kingB;
      this.turn ^= 1;
    }

    /* ---------------------------------------------------- SAN */
    moveToSan(move) {
      const from = mFrom(move), to = mTo(move), flag = mFlag(move), promo = mPromo(move);
      const piece = this.squares[from];
      const type = typeOf(piece);
      const isCapture = !!this.squares[to] || flag === FLAG_EP;

      let san;
      if (flag === FLAG_CASTLE_K) san = 'O-O';
      else if (flag === FLAG_CASTLE_Q) san = 'O-O-O';
      else if (type === PAWN) {
        san = '';
        if (isCapture) san += String.fromCharCode(97 + fileOf(from)) + 'x';
        san += sqToAlg(to);
        if (promo) san += '=' + PIECE_LETTER[promo];
      } else {
        san = PIECE_LETTER[type];
        const legal = this.generateLegalMoves();
        let ambiguous = false, sameFile = false, sameRank = false;
        for (let i = 0; i < legal.length; i++) {
          const o = legal[i];
          if (o === move) continue;
          if (mTo(o) !== to) continue;
          const op = this.squares[mFrom(o)];
          if (typeOf(op) !== type || colorOf(op) !== colorOf(piece)) continue;
          ambiguous = true;
          if (fileOf(mFrom(o)) === fileOf(from)) sameFile = true;
          if (rankOf(mFrom(o)) === rankOf(from)) sameRank = true;
        }
        if (ambiguous) {
          if (!sameFile) san += String.fromCharCode(97 + fileOf(from));
          else if (!sameRank) san += String.fromCharCode(49 + rankOf(from));
          else san += sqToAlg(from);
        }
        if (isCapture) san += 'x';
        san += sqToAlg(to);
      }

      this.makeMove(move);
      const opp = this.turn;
      const check = this.inCheck(opp);
      const hasMoves = this.hasLegalMoves();
      this.undoMove();
      if (check) san += hasMoves ? '+' : '#';
      else if (!hasMoves) san += ' (=)';
      return san;
    }

    /* -------------------------------------------------- stato partita */
    insufficientMaterial() {
      let minors = 0, others = 0;
      const bishopColors = [];
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        const p = this.squares[s];
        if (!p) continue;
        const t = typeOf(p);
        if (t === KING) continue;
        if (t === PAWN || t === ROOK || t === QUEEN) { others++; continue; }
        minors++;
        if (t === BISHOP) bishopColors.push((rankOf(s) + fileOf(s)) % 2);
      }
      if (others > 0) return false;
      if (minors <= 1) return true;
      // re + alfiere contro re + alfiere, alfieri sullo stesso colore
      if (minors === 2 && bishopColors.length === 2 && bishopColors[0] === bishopColors[1]) return true;
      return false;
    }

    isGameOver(repetitionCount) {
      const legal = this.generateLegalMoves();
      if (legal.length === 0) {
        if (this.inCheck(this.turn)) return { over: true, result: this.turn === WHITE ? '0-1' : '1-0', reason: 'scacco matto' };
        return { over: true, result: '1/2-1/2', reason: 'stallo' };
      }
      if (this.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'regola delle 50 mosse' };
      if (this.insufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'materiale insufficiente' };
      if (repetitionCount && repetitionCount >= 3) return { over: true, result: '1/2-1/2', reason: 'tripla ripetizione' };
      return { over: false, result: '*', reason: '' };
    }
  }

  /* --------------------------------------------------------------- export */
  return {
    WHITE, BLACK, EMPTY, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    FLAG_NONE, FLAG_EP, FLAG_CASTLE_K, FLAG_CASTLE_Q, FLAG_DOUBLE,
    CASTLE_WK, CASTLE_WQ, CASTLE_BK, CASTLE_BQ,
    START_FEN, PIECE_LETTER, PIECE_CHAR, LETTER_TO_TYPE,
    Board, encodeMove, mFrom, mTo, mPromo, mFlag, moveToUci, uciToMove,
    sqToAlg, algToSq, onBoard, fileOf, rankOf, colorOf, typeOf
  };
});
