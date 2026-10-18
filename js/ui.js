/* =========================================================================
 * ui.js - Scacchiera: pezzi in SVG, rendering, selezione, trascinamento, suoni.
 * ========================================================================= */
(function (global) {
  'use strict';

  const E = global.ChessEngine;
  const { mFrom, mTo, FLAG_EP, FLAG_CASTLE_K, FLAG_CASTLE_Q, colorOf, typeOf, sqToAlg, WHITE } = E;

  const FILES = 'abcdefgh';
  const C_IT = { 1: 'pedone', 2: 'cavallo', 3: 'alfiere', 4: 'torre', 5: 'donna', 6: 're' };

  /* ======================================================================
   *  Pezzi: disegnati come SVG (viewBox 45x45) così sono identici su ogni
   *  sistema, scalano senza perdere qualità e si colorano con i gradienti
   *  definiti in index.html (#pgw bianco, #pgb nero).
   * ====================================================================== */
  const PIECE_SHAPES = {
    /* pedone */
    1: [
      ['circle', { cx: 22.5, cy: 12.6, r: 5.9 }],
      ['path', { d: 'M17.1 17.6 c1.4 3.2 2 6.6 1.6 10.4 h7.6 c-.4-3.8 .2-7.2 1.6-10.4 z' }],
      ['rect', { x: 11.6, y: 28.4, width: 21.8, height: 6.6, rx: 2.6 }]
    ],
    /* cavallo */
    2: [
      ['path', { d: 'M13.8 35 C13.9 31.4 14.6 28 16.6 25.6 L13.4 22.2 L9.8 21 C9 20 9.6 18.6 10.6 18.2 C14.6 15.8 19.6 13.8 23.2 12.4 L24.4 6.8 L27 12.4 C28.8 13.6 30 15.6 31 18.4 C32 22.4 32.2 26 32.2 29 C33.6 30.6 34.8 32.6 34.8 35 Z' }],
      ['circle', { cx: 18.8, cy: 19.4, r: 0.95, cls: 'occhio' }]
    ],
    /* alfiere */
    3: [
      ['circle', { cx: 22.5, cy: 6.4, r: 1.9 }],
      ['path', { d: 'M22.5 8.4 C25.9 11.6 28.2 15 28.2 18.4 a5.7 5.7 0 0 1 -11.4 0 c0-3.4 2.3-6.8 5.7-10 z' }],
      ['rect', { x: 17.1, y: 19.6, width: 10.8, height: 3.6, rx: 1.4 }],
      ['path', { d: 'M17.4 23.2 c0 4.6-1.9 7.6-3.4 9.8 h17 c-1.5-2.2-3.4-5.2-3.4-9.8 z' }],
      ['rect', { x: 10.9, y: 32.6, width: 23.2, height: 4.8, rx: 2.2 }]
    ],
    /* torre */
    4: [
      ['path', { d: 'M10.05 8.4 h3.5 v3.4 h3.7 v-3.4 h3.4 v3.4 h3.7 v-3.4 h3.4 v3.4 h3.7 v-3.4 h3.5 v7.4 H10.05 Z' }],
      ['path', { d: 'M13.9 15.8 h17.2 l1.5 3.8 H12.4 Z' }],
      ['path', { d: 'M13.6 19.6 h17.8 l-1.7 10.6 H15.3 Z' }],
      ['rect', { x: 10.9, y: 30.2, width: 23.2, height: 6.2, rx: 2.4 }]
    ],
    /* donna */
    5: [
      ['circle', { cx: 9.4, cy: 13.6, r: 1.9 }],
      ['circle', { cx: 16.6, cy: 11.8, r: 1.9 }],
      ['circle', { cx: 22.5, cy: 9.2, r: 2 }],
      ['circle', { cx: 28.4, cy: 11.8, r: 1.9 }],
      ['circle', { cx: 35.6, cy: 13.6, r: 1.9 }],
      ['path', { d: 'M11.3 25 L9.4 13.6 L15.9 22 L16.6 11.8 L19.6 22 L22.5 9.2 L25.4 22 L28.4 11.8 L29.1 22 L35.6 13.6 L33.7 25 Z' }],
      ['path', { d: 'M11.6 25 h21.8 l-2.6 8.4 H14.2 Z' }],
      ['rect', { x: 10.6, y: 33.4, width: 23.8, height: 5, rx: 2.2 }]
    ],
    /* re */
    6: [
      ['path', { d: 'M21.4 5.6 h2.2 v3.1 h3.1 v2.2 h-3.1 v3.1 h-2.2 v-3.1 h-3.1 V8.7 h3.1 Z' }],
      ['path', { d: 'M12.4 16.6 h20.2 l-2.3 8.4 H14.7 Z' }],
      ['path', { d: 'M14.3 25 h16.4 l-2.4 8.4 H16.7 Z' }],
      ['rect', { x: 10.6, y: 33.4, width: 23.8, height: 5, rx: 2.2 }]
    ]
  };

  const SVGNS = 'http://www.w3.org/2000/svg';

  /**
   * Markup SVG del pezzo, pronto per innerHTML.
   * @param {number} type  1..6
   * @param {number} color E.WHITE / E.BLACK
   * @param {string} [extraCls] classi aggiuntive sul <svg>
   */
  function pieceMarkup(type, color, extraCls) {
    const shapes = PIECE_SHAPES[type];
    if (!shapes) return '';
    const fill = color === WHITE ? 'url(#pgw)' : 'url(#pgb)';
    let body = '';
    for (const [tag, a] of shapes) {
      const cls = a.cls ? ' class="' + a.cls + '"' : '';
      if (tag === 'circle') {
        body += `<circle cx="${a.cx}" cy="${a.cy}" r="${a.r}"${cls}/>`;
      } else if (tag === 'rect') {
        body += `<rect x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}" rx="${a.rx}"${cls}/>`;
      } else {
        body += `<path d="${a.d}"${cls}/>`;
      }
    }
    return `<svg class="psvg ${color === WHITE ? 'sw' : 'sb'}${extraCls ? ' ' + extraCls : ''}" viewBox="0 0 45 45" style="fill:${fill}" aria-hidden="true">${body}</svg>`;
  }

  /* =============================================================== suoni */
  const Sound = {
    enabled: true,
    ctx: null,
    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
    },
    tone(freq, dur, type, gain) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain || 0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    },
    move() { this.tone(320, 0.09, 'triangle', 0.13); },
    capture() { this.tone(190, 0.13, 'square', 0.10); setTimeout(() => this.tone(140, 0.12, 'square', 0.08), 45); },
    check() { this.tone(720, 0.11, 'sawtooth', 0.10); setTimeout(() => this.tone(940, 0.14, 'sawtooth', 0.09), 90); },
    castle() { this.tone(300, 0.08, 'triangle', 0.12); setTimeout(() => this.tone(430, 0.12, 'triangle', 0.12), 80); },
    promote() { [520, 660, 800, 1000].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'triangle', 0.11), i * 75)); },
    win() { [520, 660, 780, 1040].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, 'sine', 0.13), i * 130)); },
    lose() { [440, 370, 300, 240].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'sine', 0.12), i * 140)); },
    bad() { this.tone(160, 0.18, 'sawtooth', 0.09); }
  };

  /* =========================================================== BoardView */
  class BoardView {
    constructor(opts) {
      this.el = opts.el;
      this.overlay = opts.overlay;
      this.onMoveAttempt = opts.onMoveAttempt || function () { };
      this.onSelect = opts.onSelect || function () { };

      this.flipped = false;
      this.showCoords = true;
      this.showHints = true;
      this.interactive = true;

      this.board = null;
      this.legal = [];
      this.fromMap = Object.create(null);
      this.selected = -1;
      this.lastMove = null;
      this.checkSq = -1;
      this.hintMove = 0;
      this.arrow = null;
      this.blunder = null;

      this.drag = null;
      this._build();
      this._bind();
    }

    _build() {
      this.el.innerHTML = '';
      this.cells = [];
      for (let i = 0; i < 64; i++) {
        const d = document.createElement('div');
        d.className = 'square';
        this.cells.push(d);
        this.el.appendChild(d);
      }
    }

    _bind() {
      this.el.addEventListener('pointerdown', (e) => this._down(e));
      global.addEventListener('pointermove', (e) => this._move(e));
      global.addEventListener('pointerup', (e) => this._up(e));
      global.addEventListener('pointercancel', () => this._cancelDrag());
      this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /* ------------------------------------------------ conversioni */
    squareFromPoint(clientX, clientY) {
      const r = this.el.getBoundingClientRect();
      const col = Math.floor((clientX - r.left) / (r.width / 8));
      const row = Math.floor((clientY - r.top) / (r.height / 8));
      if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
      return this._toSquare(col, row);
    }
    _toSquare(col, row) {
      const file = this.flipped ? 7 - col : col;
      const rank = this.flipped ? row : 7 - row;
      return rank * 16 + file;
    }
    _toDisplay(sq) {
      const file = sq & 15, rank = sq >> 4;
      return {
        col: this.flipped ? 7 - file : file,
        row: this.flipped ? rank : 7 - rank
      };
    }
    _cellIndex(sq) {
      const d = this._toDisplay(sq);
      return d.row * 8 + d.col;
    }

    /* ------------------------------------------------ dati */
    setFlipState(f) { this.flipped = !!f; }

    update(o) {
      if (o.board !== undefined) this.board = o.board;
      if (o.legal !== undefined) {
        this.legal = o.legal || [];
        this.fromMap = Object.create(null);
        for (const m of this.legal) {
          const f = mFrom(m);
          if (!this.fromMap[f]) this.fromMap[f] = [];
          this.fromMap[f].push(mTo(m));
        }
      }
      if (o.lastMove !== undefined) this.lastMove = o.lastMove;
      if (o.checkSq !== undefined) this.checkSq = o.checkSq;
      if (o.hintMove !== undefined) this.hintMove = o.hintMove;
      if (o.arrow !== undefined) this.arrow = o.arrow;
      if (o.blunder !== undefined) this.blunder = o.blunder;
      if (o.interactive !== undefined) this.interactive = o.interactive;
      if (o.showCoords !== undefined) this.showCoords = o.showCoords;
      if (o.showHints !== undefined) this.showHints = o.showHints;
      this.selected = -1;
      this.render();
    }

    /* ------------------------------------------------ rendering */
    render() {
      const board = this.board;
      const frag = document.createDocumentFragment();
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const sq = this._toSquare(col, row);
          const file = sq & 15, rank = sq >> 4;
          const light = (row + col) % 2 === 0;
          const piece = board ? board.squares[sq] : 0;

          const cell = document.createElement('div');
          let cls = 'square ' + (light ? 'light' : 'dark');
          if (this.lastMove && (sq === mFrom(this.lastMove) || sq === mTo(this.lastMove))) cls += ' last';
          if (sq === this.selected) cls += ' selected';
          if (sq === this.checkSq) cls += ' check';
          if (this.blunder && (sq === mFrom(this.blunder) || sq === mTo(this.blunder))) cls += ' blunder';
          if (this.hintMove && (sq === mFrom(this.hintMove) || sq === mTo(this.hintMove))) {
            cls += (sq === mFrom(this.hintMove) ? ' hint-from' : ' hint-to');
          }
          cell.className = cls;
          cell.dataset.sq = String(sq);
          cell.setAttribute('role', 'button');
          cell.setAttribute('aria-label', sqToAlg(sq) + ', ' + (piece ? ((colorOf(piece) === WHITE ? 'bianco ' : 'nero ') + C_IT[typeOf(piece)]) : 'vuota'));

          let inner = '';
          if (this.showCoords) {
            if (row === 7) inner += '<span class="coord f">' + FILES[file] + '</span>';
            if (col === 0) inner += '<span class="coord r">' + (rank + 1) + '</span>';
          }
          const isTarget = this.selected >= 0 && this.fromMap[this.selected] &&
            this.fromMap[this.selected].indexOf(sq) >= 0;
          if (piece) {
            inner += '<span class="piece">' + pieceMarkup(typeOf(piece), colorOf(piece)) + '</span>';
          } else if (this.showHints && isTarget) {
            inner += '<span class="dot"></span>';
          }
          if (this.showHints && isTarget && piece) inner += '<span class="ring"></span>';
          cell.innerHTML = inner;
          frag.appendChild(cell);
        }
      }
      this.el.replaceChildren(frag);
      this.cells = Array.prototype.slice.call(this.el.children);
      this._drawOverlay();
    }

    _drawOverlay() {
      if (!this.overlay) return;
      const svg = this.overlay;
      svg.innerHTML = '';
      const NS = SVGNS;

      const defs = document.createElementNS(NS, 'defs');
      const marker = document.createElementNS(NS, 'marker');
      marker.setAttribute('id', 'arrowhead');
      marker.setAttribute('markerWidth', '4');
      marker.setAttribute('markerHeight', '4');
      marker.setAttribute('refX', '2.2');
      marker.setAttribute('refY', '2');
      marker.setAttribute('orient', 'auto');
      marker.setAttribute('markerUnits', 'strokeWidth');
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M0,0 L4,2 L0,4 z');
      p.setAttribute('fill', 'rgba(110,231,183,.95)');
      marker.appendChild(p);
      defs.appendChild(marker);
      svg.appendChild(defs);

      const drawArrow = (move, color, width) => {
        const a = this._toDisplay(mFrom(move));
        const b = this._toDisplay(mTo(move));
        const x1 = a.col + 0.5, y1 = a.row + 0.5;
        const x2 = b.col + 0.5, y2 = b.row + 0.5;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const shorten = 0.30;
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', (x2 - (dx / len) * shorten).toFixed(3));
        line.setAttribute('y2', (y2 - (dy / len) * shorten).toFixed(3));
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', String(width));
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        svg.appendChild(line);
      };

      if (this.blunder) drawArrow(this.blunder, 'rgba(255,140,120,.85)', 0.1);
      if (this.hintMove) drawArrow(this.hintMove, 'rgba(110,231,183,.95)', 0.14);
    }

    /* ------------------------------------------------ interazione */
    _down(e) {
      if (!this.interactive || !this.board) return;
      const sq = this.squareFromPoint(e.clientX, e.clientY);
      if (sq < 0) return;
      const piece = this.board.squares[sq];

      if (this.selected >= 0 && sq !== this.selected && this.fromMap[this.selected] &&
        this.fromMap[this.selected].indexOf(sq) >= 0) {
        const from = this.selected;
        this.selected = -1;
        this.render();
        this.onMoveAttempt(from, sq);
        return;
      }

      if (!piece || !this.fromMap[sq]) {
        this.selected = -1;
        this.render();
        this.onSelect(-1);
        return;
      }

      this.selected = sq;
      this.render();
      this.onSelect(sq);

      const cell = this.cells[this._cellIndex(sq)];
      const rect = cell.getBoundingClientRect();
      const orig = cell.querySelector('.piece');
      const ghost = document.createElement('span');
      ghost.className = 'piece float';
      const size = rect.width;
      ghost.style.width = size + 'px';
      ghost.style.height = size + 'px';
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
      ghost.style.display = 'none';
      if (orig) {
        ghost.innerHTML = orig.innerHTML;
        orig.classList.add('dragging');
      }
      document.body.appendChild(ghost);
      this.drag = {
        from: sq, ghost: ghost, origin: orig,
        startX: e.clientX, startY: e.clientY, moved: false,
        pointerId: e.pointerId
      };
      if (this.el.setPointerCapture && e.pointerId !== undefined) {
        try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }
    }

    _move(e) {
      const d = this.drag;
      if (!d) return;
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (!d.moved && dist > 6) {
        d.moved = true;
        d.ghost.style.display = 'block';
      }
      if (d.moved) {
        d.ghost.style.left = e.clientX + 'px';
        d.ghost.style.top = e.clientY + 'px';
      }
    }

    _up(e) {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      const target = this.squareFromPoint(e.clientX, e.clientY);
      d.ghost.remove();
      if (d.origin) d.origin.classList.remove('dragging');
      if (!d.moved) return;
      if (target < 0 || target === d.from) { this.render(); return; }
      if (this.fromMap[d.from] && this.fromMap[d.from].indexOf(target) >= 0) {
        const from = d.from;
        this.selected = -1;
        this.render();
        this.onMoveAttempt(from, target);
      } else {
        this.render();
        this.onSelect(this.selected);
      }
    }

    _cancelDrag() {
      if (!this.drag) return;
      this.drag.ghost.remove();
      if (this.drag.origin) this.drag.origin.classList.remove('dragging');
      this.drag = null;
      this.render();
    }
  }

  global.ChessUI = { BoardView, Sound, pieceMarkup, C_IT };
})(typeof window !== 'undefined' ? window : globalThis);
