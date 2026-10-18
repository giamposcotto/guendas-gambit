/* =========================================================================
 * app.js - Logica dell'applicazione: partita, insegnante, lezioni, orologio.
 * ========================================================================= */
(function () {
  'use strict';

  const E = window.ChessEngine;
  const AI = window.ChessAI;
  const C = window.ChessCoach;
  const UI = window.ChessUI;

  const { WHITE, BLACK, mFrom, mTo, mPromo, mFlag, FLAG_EP, FLAG_CASTLE_K, FLAG_CASTLE_Q,
    colorOf, typeOf, moveToUci, uciToMove, sqToAlg } = E;

  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'scacchi.settings.v1';
  const LS_LESSONS = 'scacchi.lessons.v1';

  /* ============================================================ stato */
  const S = {
    board: new E.Board(),
    startFen: E.START_FEN,
    moves: [],
    viewIndex: 0,
    playerColor: WHITE,
    level: 3,
    coachOn: true,
    refereeOn: true,
    hintsOn: true,
    coordsOn: true,
    soundOn: true,
    timeControl: 0,
    analysisSpeed: 2,
    boardTheme: 'verde',
    thinking: false,
    gameOver: null,
    keys: [],
    keyCounts: new Map(),
    lesson: null,
    lessonsDone: {},
    pendingAnalysis: null,
    lastAnalysis: null,
    hintMove: 0,
    blunderMove: 0,
    clock: { w: 0, b: 0, running: false, last: 0, interval: null },
    lastOpponentComment: ''
  };

  let view = null;

  /* ============================================================ utilità */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function scoreText(cp) {
    const v = cp / 100;
    return (v > 0 ? '+' : '') + v.toFixed(2);
  }
  function whitePov(cp, turn) { return turn === WHITE ? cp : -cp; }

  function toast(msg, cls) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (cls ? ' ' + cls : '');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  function openModal(html) {
    $('modal-content').innerHTML = html;
    $('modal').classList.add('show');
  }
  function closeModal() { $('modal').classList.remove('show'); }

  function setThinking(on, text) {
    S.thinking = on;
    $('thinking').classList.toggle('show', !!on);
    if (text) $('thinking-text').textContent = text;
    if (view) view.interactive = !on && !S.gameOver && S.viewIndex >= S.moves.length;
  }

  function analysisCfg(fast) {
    const s = S.analysisSpeed;
    if (fast) return { depth: s + 1, timeMs: [0, 220, 420, 750][s] };
    return { depth: s + 2, timeMs: [0, 400, 800, 1500][s] };
  }

  /* ============================================================ impostazioni */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (typeof o.level === 'number') S.level = clamp(o.level, 0, AI.LEVELS.length - 1);
        if (typeof o.coachOn === 'boolean') S.coachOn = o.coachOn;
        if (typeof o.refereeOn === 'boolean') S.refereeOn = o.refereeOn;
        if (typeof o.hintsOn === 'boolean') S.hintsOn = o.hintsOn;
        if (typeof o.coordsOn === 'boolean') S.coordsOn = o.coordsOn;
        if (typeof o.soundOn === 'boolean') S.soundOn = o.soundOn;
        if (typeof o.timeControl === 'number') S.timeControl = o.timeControl;
        if (typeof o.analysisSpeed === 'number') S.analysisSpeed = o.analysisSpeed;
        if (o.boardTheme) S.boardTheme = o.boardTheme;
        if (o.theme) document.documentElement.setAttribute('data-theme', o.theme);
        if (o.color) S.colorPref = o.color;
      }
      const done = localStorage.getItem(LS_LESSONS);
      if (done) S.lessonsDone = JSON.parse(done) || {};
    } catch (e) { /* ignora */ }
    S.colorPref = S.colorPref || 'w';
  }

  function saveSettings() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        level: S.level, coachOn: S.coachOn, refereeOn: S.refereeOn, hintsOn: S.hintsOn,
        coordsOn: S.coordsOn, soundOn: S.soundOn, timeControl: S.timeControl,
        analysisSpeed: S.analysisSpeed, boardTheme: S.boardTheme,
        theme: document.documentElement.getAttribute('data-theme'), color: S.colorPref
      }));
      localStorage.setItem(LS_LESSONS, JSON.stringify(S.lessonsDone));
    } catch (e) { /* ignora */ }
  }

  /* ============================================================ partita */
  function boardAt(index) {
    const b = new E.Board(S.startFen);
    for (let i = 0; i < index; i++) b.makeMove(S.moves[i].move);
    return b;
  }

  function resetKeyCounts() {
    S.keys = [];
    S.keyCounts = new Map();
    const b = new E.Board(S.startFen);
    S.keys.push(b.key());
    S.keyCounts.set(b.key(), 1);
  }

  function repetitionCount(key) {
    return S.keyCounts.get(key) || 0;
  }

  function newGame(opts) {
    opts = opts || {};
    S.moves = [];
    S.viewIndex = 0;
    S.gameOver = null;
    S.pendingAnalysis = null;
    S.lastAnalysis = null;
    S.hintMove = 0;
    S.lesson = opts.keepLesson ? S.lesson : null;
    S.startFen = opts.fen || E.START_FEN;
    S.board = new E.Board(S.startFen);
    resetKeyCounts();

    let color = opts.color;
    if (!color) color = S.colorPref;
    if (color === 'r') color = Math.random() < 0.5 ? 'w' : 'b';
    S.playerColor = color === 'b' ? BLACK : WHITE;

    S.clock.w = S.timeControl; S.clock.b = S.timeControl;
    S.clock.running = S.timeControl > 0;
    S.clock.last = Date.now();

    view.setFlipState(S.playerColor === BLACK);

    $('gameover').classList.remove('show');
    $('lesson-banner').style.display = 'none';
    if (S.lesson) renderLessonBanner();

    updateBoard();
    renderAll();

    if (S.board.turn !== S.playerColor && !S.gameOver) {
      setTimeout(computerTurn, 420);
    } else {
      startPlayerTurn();
    }
  }

  function currentBoard() {
    return S.viewIndex < S.moves.length ? boardAt(S.viewIndex) : S.board;
  }

  function legalFor(board) {
    return board.generateLegalMoves();
  }

  function updateBoard() {
    const viewing = S.viewIndex < S.moves.length;
    const board = viewing ? boardAt(S.viewIndex) : S.board;
    const legal = viewing ? [] : legalFor(board);
    const lastMove = S.viewIndex > 0 ? S.moves[S.viewIndex - 1].move : null;
    let checkSq = -1;
    if (board.inCheck(board.turn)) checkSq = board.kings[board.turn];
    view.setFlipState(view.flipped);
    view.update({
      board: board,
      legal: legal,
      lastMove: lastMove ? { from: mFrom(lastMove), to: mTo(lastMove) } : null,
      checkSq: checkSq,
      hintMove: viewing ? 0 : S.hintMove,
      blunder: viewing ? null : (S.blunderMove || null),
      interactive: !S.thinking && !S.gameOver && !viewing &&
        board.turn === S.playerColor && !(S.lesson && S.lesson.waiting),
      showCoords: S.coordsOn,
      showHints: S.hintsOn
    });
    $('btn-undo').disabled = S.moves.length === 0;
    $('btn-hint').disabled = S.gameOver || viewing || board.turn !== S.playerColor;
    $('btn-analyze').disabled = false;
  }

  function renderAll() {
    renderPlayers();
    renderMoves();
    renderCoach();
    renderEvalBar();
  }

  /* ------------------------------------------------ mosse */
  function applyMove(move, byPlayer) {
    /* se stiamo rivedendo la partita, taglio il futuro */
    if (S.viewIndex < S.moves.length) {
      S.board = boardAt(S.viewIndex);
      S.moves = S.moves.slice(0, S.viewIndex);
      S.keys = S.keys.slice(0, S.viewIndex + 1);
      S.keyCounts = new Map();
      for (const k of S.keys) S.keyCounts.set(k, (S.keyCounts.get(k) || 0) + 1);
      S.gameOver = null;
    }

    const board = S.board;
    const moving = colorOf(board.squares[mFrom(move)]);
    const san = board.moveToSan(move);
    const capture = !!board.squares[mTo(move)] || mFlag(move) === FLAG_EP;
    const flag = mFlag(move);
    const promo = mPromo(move);

    const comment = byPlayer ? null : C.describeMove(board, move);
    board.makeMove(move);

    const key = board.key();
    S.keys.push(key);
    S.keyCounts.set(key, (S.keyCounts.get(key) || 0) + 1);

    S.moves.push({
      move: move, san: san, fen: board.fen(), quality: null,
      comment: comment ? comment.sentence : null,
      byPlayer: !!byPlayer
    });
    S.viewIndex = S.moves.length;
    S.hintMove = 0;
    S.blunderMove = 0;

    if (S.soundOn) {
      if (promo) UI.Sound.promote();
      else if (flag === FLAG_CASTLE_K || flag === FLAG_CASTLE_Q) UI.Sound.castle();
      else if (capture) UI.Sound.capture();
      else UI.Sound.move();
    }

    const over = board.isGameOver(repetitionCount(key));
    if (over.over) {
      S.gameOver = over;
      S.clock.running = false;
      if (byPlayer && (over.result === '1-0' || over.result === '0-1')) UI.Sound.win();
      else if (byPlayer && over.result === '1/2-1/2') UI.Sound.bad();
      else if (!byPlayer && (over.result === '1-0' || over.result === '0-1')) UI.Sound.lose();
    } else if (S.soundOn && board.inCheck(board.turn)) {
      setTimeout(() => UI.Sound.check(), 140);
    }

    updateBoard();
    renderAll();
    if (S.gameOver) showGameOver();
    return { over: over, san: san, capture: capture, byPlayer: byPlayer };
  }

  function showGameOver() {
    const over = S.gameOver;
    let title = 'Partita finita';
    let text = over.reason;
    if (over.result === '1-0') title = 'Vittoria del Bianco';
    else if (over.result === '0-1') title = 'Vittoria del Nero';
    else title = 'Patta';
    if (over.reason === 'scacco matto') {
      const loser = S.board.turn;
      text = loser === WHITE ? 'Il Nero ha dato scacco matto.' : 'Il Bianco ha dato scacco matto.';
    }
    const iWon = (over.result === '1-0' && S.playerColor === WHITE) || (over.result === '0-1' && S.playerColor === BLACK);
    if (iWon) title = '🏆 ' + title + ' — hai vinto!';
    else if (over.result !== '1/2-1/2') title = title + ' — hai perso';
    $('gameover-title').textContent = title;
    $('gameover-text').textContent = text + (S.lesson ? '' : ' (clicca "Rivedi la partita" per ripassare)');
    $('gameover').classList.add('show');
  }

  /* ------------------------------------------------ turni */
  function startPlayerTurn() {
    if (S.gameOver) return;
    if (S.board.turn !== S.playerColor) return;
    if (!S.coachOn) { S.pendingAnalysis = null; return; }
    setThinking(true, "L'insegnante sta osservando…");
    setTimeout(() => {
      S.pendingAnalysis = AI.analyzePosition(S.board, analysisCfg(true));
      setThinking(false);
      renderCoach();
      renderEvalBar();
      renderHintsFromAnalysis();
    }, 24);
  }

  function computerTurn() {
    if (S.gameOver) return;
    if (S.board.turn === S.playerColor) { startPlayerTurn(); return; }
    setThinking(true, 'Sto pensando…');
    setTimeout(() => {
      const info = AI.chooseMove(S.board, S.level, { gameKeyCounts: S.keyCounts });
      setThinking(false);
      if (!info) { S.gameOver = S.board.isGameOver(0); showGameOver(); return; }
      const res = applyMove(info.move, false);
      S.lastOpponentComment = res.san;
      if (!res.over.over) {
        afterOpponentMove(res);
      }
    }, 220);
  }

  function afterOpponentMove(res) {
    /* avvisi: sono minacciato? */
    if (S.coachOn) {
      const hp = C.hangingPieces(S.board);
      const mine = S.playerColor === WHITE ? hp.white : hp.black;
      const threats = [];
      for (const h of mine.slice(0, 3)) {
        if (h.free) threats.push(`${C.PIECE_IT[h.piece]} in ${h.square} è attaccato e non è difeso`);
        else if (h.value >= 300) threats.push(`${C.PIECE_IT[h.piece]} in ${h.square} è attaccato`);
      }
      S.threats = threats;
    }
    updateBoard();
    startPlayerTurn();
  }

  function handlePlayerMove(move) {
    const before = S.pendingAnalysis;
    const res = applyMove(move, true);
    S.threats = [];

    /* le lezioni hanno una logica propria (anche se la mossa chiude la partita) */
    if (S.lesson && !S.lesson.solved) {
      checkLessonMove(move, res);
      return;
    }

    if (res.over && res.over.over) return;

    const finish = () => {
      updateBoard();
      renderCoach();
      setTimeout(computerTurn, 40);
    };

    if (S.coachOn && before) {
      setThinking(true, "Valuto la tua mossa…");
      setTimeout(() => {
        const after = AI.analyzePosition(S.board, analysisCfg(true));
        const bScore = clamp(before.score, -9000, 9000);
        const aScore = clamp(after.score, -9000, 9000);
        const loss = bScore + aScore;
        const mateAvailable = before.mateIn !== null && before.mateIn > 0;
        const gaveMate = S.board.isGameOver(0).reason === 'scacco matto';
        const isBest = before.bestMove && moveToUci(before.bestMove) === moveToUci(move);
        const q = C.quality(loss, isBest, mateAvailable && !gaveMate, gaveMate);
        const m = S.moves[S.moves.length - 1];
        m.quality = q;
        /* descrizione di cosa fa la mossa, come per le mosse dell'avversario */
        try {
          const posBefore = boardAt(S.moves.length - 1);
          m.comment = C.describeMove(posBefore, move).sentence;
        } catch (e) { /* la descrizione è un extra: se manca, il commento resta il giudizio */ }
        let extra = '';
        if (!isBest && before.bestMove && !gaveMate && loss > 25) {
          const clone = boardAt(S.moves.length - 1);
          const d = C.describeMove(clone, before.bestMove);
          extra = ` La mossa migliore era ${clone.moveToSan(before.bestMove)}: ${d.sentence.replace(/^[^:]*:\s*/, '')}.`;
        }
        m.note = extra;
        S.lastAnalysis = after;
        /* se la mossa è un errore, mostra con una freccia rossa cosa era meglio giocare */
        if ((q.cls === 'mistake' || q.cls === 'blunder') && before.bestMove) {
          S.blunderMove = before.bestMove;
        }
        setThinking(false);
        finish();
      }, 30);
    } else {
      finish();
    }
  }

  function onMoveAttempt(from, to) {
    if (S.thinking || S.gameOver) return;
    if (S.viewIndex < S.moves.length) return;
    if (S.board.turn !== S.playerColor) return;
    const cands = legalFor(S.board).filter((m) => mFrom(m) === from && mTo(m) === to);
    if (!cands.length) return;
    if (cands.length === 1) { handlePlayerMove(cands[0]); return; }
    /* promozione */
    const box = $('promo-choices');
    box.innerHTML = '';
    const order = [E.QUEEN, E.ROOK, E.BISHOP, E.KNIGHT];
    for (const t of order) {
      const mv = cands.find((m) => mPromo(m) === t);
      if (!mv) continue;
      const b = document.createElement('button');
      b.innerHTML = UI.pieceMarkup(t, S.playerColor);
      b.onclick = () => {
        $('promo').classList.remove('show');
        handlePlayerMove(mv);
      };
      box.appendChild(b);
    }
    $('promo').classList.add('show');
  }

  /* ------------------------------------------------ undo / navigazione */
  function undo() {
    if (S.thinking) return;
    if (!S.moves.length) return;
    S.gameOver = null;
    $('gameover').classList.remove('show');
    let n = S.moves.length;
    /* togli la mossa del computer e quella del giocatore */
    while (n > 0 && S.moves[n - 1].byPlayer) n--;
    if (n === S.moves.length) n--;
    if (n > 0 && !S.moves[n - 1].byPlayer && n === S.moves.length) n--;
    if (n < 0) n = 0;
    S.viewIndex = n;
    S.board = boardAt(n);
    S.moves = S.moves.slice(0, n);
    S.keys = S.keys.slice(0, n + 1);
    S.keyCounts = new Map();
    for (const k of S.keys) S.keyCounts.set(k, (S.keyCounts.get(k) || 0) + 1);
    S.pendingAnalysis = null;
    S.hintMove = 0;
    updateBoard();
    renderAll();
    if (S.board.turn !== S.playerColor) setTimeout(computerTurn, 200);
    else startPlayerTurn();
  }

  function gotoMove(index) {
    S.viewIndex = clamp(index, 0, S.moves.length);
    S.hintMove = 0;
    updateBoard();
    renderMoves();
    renderCoach();
  }

  /* ============================================================ coach UI */
  function renderHintsFromAnalysis() {
    if (!S.coachOn || !S.pendingAnalysis) return;
    const hp = C.hangingPieces(S.board);
    const mine = S.playerColor === WHITE ? hp.white : hp.black;
    if (!S.refereeOn || !mine.length) return;
  }

  let _coachCache = { fen: '', data: null };
  function coachFor(board) {
    const fen = board.fen();
    if (_coachCache.fen === fen && _coachCache.data) return _coachCache.data;
    const data = C.analyze(board, {});
    _coachCache = { fen: fen, data: data };
    return data;
  }

  /* --------- barra compatta dell'insegnante per gli smartphone -------- */
  function firstSentence(s) {
    const m = /[^.!?]*[.!?]/.exec(String(s || ''));
    return (m ? m[0] : String(s || '')).trim();
  }

  function updateMobileCoach(last, viewing) {
    const bar = $('coach-mobile');
    if (!bar) return;
    const badge = $('coach-mobile-badge');
    const txt = $('coach-mobile-text');
    const q = last ? last.quality : null;
    bar.className = 'coach-mobile' + (q ? ' ' + q.cls : '');
    if (viewing) {
      badge.textContent = '⏱';
      txt.textContent = "Stai rivedendo la partita: tocca l'ultima mossa per tornare a giocare.";
    } else if (last && q) {
      badge.textContent = q.symbol;
      txt.textContent = q.label + (last.comment ? ' · ' + firstSentence(last.comment) : '');
    } else if (last) {
      badge.textContent = '·';
      txt.textContent = last.comment ? firstSentence(last.comment) : (last.byPlayer ? 'Mossa registrata.' : "Mossa dell'avversario.");
    } else {
      badge.textContent = '🎓';
      txt.textContent = S.lesson
        ? S.lesson.title + ' — ' + S.lesson.goal
        : "Fai la tua prima mossa: poi ti dirò com'è andata.";
    }
  }

  function renderCoach() {
    if (!view) return;
    const board = currentBoard();
    const panelFeedback = $('coach-feedback-text');
    const viewing = S.viewIndex < S.moves.length;

    /* --- commento --- */
    let html = '';
    const last = S.viewIndex > 0 ? S.moves[S.viewIndex - 1] : null;
    if (last) {
      const who = last.byPlayer ? 'La tua mossa' : "Mossa dell'avversario";
      const q = last.quality;
      if (q) {
        html += `<div class="move-badge">${last.san}<span class="sym ${q.cls}">${q.symbol}</span></div> `;
        html += `<strong>${q.label}.</strong> `;
      } else {
        html += `<div class="move-badge">${last.san}</div> `;
      }
      if (last.comment) html += `${last.comment} `;
      if (last.note) html += `<span class="muted">${last.note}</span>`;
      if (!q && !last.comment) {
        html += (S.coachOn && last.byPlayer)
          ? 'Sto valutando la mossa…'
          : `${who}: nessun commento particolare.`;
      }
      $('coach-feedback').className = 'card ' + (q ? q.cls : '');
    } else {
      html = S.lesson
        ? `<strong>${S.lesson.title}.</strong> ${S.lesson.goal}`
        : 'Benvenuto! Fai la tua prima mossa: ti dirò subito se è buona e perché.';
      $('coach-feedback').className = 'card';
    }
    panelFeedback.innerHTML = html;
    updateMobileCoach(last, viewing);

    /* --- valutazione --- */
    let an = S.lastAnalysis;
    if (!an && S.pendingAnalysis) an = S.pendingAnalysis;
    if (an && !viewing) {
      const wp = whitePov(an.score, board.turn);
      let txt;
      if (an.mateIn !== null && an.mateIn > 0) txt = (an.mateIn === 1 ? 'Matto in 1 per ' : `Matto in ${an.mateIn} per `) + (board.turn === WHITE ? 'il Bianco' : 'il Nero');
      else if (an.mateIn !== null && an.mateIn < 0) txt = (an.mateIn === -1 ? 'Il Bianco ha matto in 1' : `Matto in ${-an.mateIn} per l'altro colore`);
      else if (Math.abs(wp) < 40) txt = 'Posizione equilibrata';
      else if (wp > 0) txt = 'Vantaggio del Bianco' + (Math.abs(wp) > 300 ? ' (decisivo)' : '');
      else txt = 'Vantaggio del Nero' + (Math.abs(wp) > 300 ? ' (decisivo)' : '');
      $('eval-chip').textContent = scoreText(wp);
      $('eval-chip').className = 'eval-chip ' + (wp > 0 ? 'plus' : wp < 0 ? 'minus' : '');
      $('eval-desc').textContent = txt;
    } else {
      $('eval-chip').textContent = '–';
      $('eval-chip').className = 'eval-chip';
      $('eval-desc').textContent = viewing ? 'Stai rivedendo la partita' : 'In attesa di analisi…';
    }

    /* --- suggerimento --- */
    if (S.hintMove) {
      const b = S.board;
      const san = b.moveToSan(S.hintMove);
      const d = C.describeMove(b.clone(), S.hintMove);
      $('coach-suggest').innerHTML = `<div class="move-badge">${san}</div> ${d.sentence}`;
      $('coach-suggest-card').style.display = '';
    } else {
      $('coach-suggest-card').style.display = 'none';
    }

    /* --- consigli --- */
    const an2 = coachFor(board);
    const tips = [];
    if (viewing) tips.push('Stai rivedendo una posizione passata: clicca sull\'ultima mossa per tornare a giocare.');
    if (S.threats && S.threats.length && !viewing) {
      for (const t of S.threats) tips.push('⚠ Attenzione: ' + t + '.');
    }
    if (S.gameOver) {
      tips.push(S.gameOver.result === '1/2-1/2'
        ? 'La partita è finita in patta (' + S.gameOver.reason + ').'
        : 'La partita è finita: ' + S.gameOver.reason + '.');
    }
    for (const t of an2.tips) if (tips.length < 6) tips.push(t);
    $('coach-tips').innerHTML = tips.map((t) => `<li>${t}</li>`).join('');

    /* --- apertura --- */
    const sanList = S.moves.slice(0, S.viewIndex).map((m) => m.san);
    const opening = C.detectOpening(sanList);
    $('coach-sub').textContent = opening ? 'Apertura: ' + opening : 'Livello ' + (S.level + 1) + ' · ' + AI.LEVELS[S.level].name;
  }

  function renderEvalBar() {
    const fill = $('evalbar-fill');
    let an = S.lastAnalysis || S.pendingAnalysis;
    if (!an || S.viewIndex < S.moves.length) { fill.style.height = '50%'; return; }
    const wp = whitePov(an.score, S.board.turn);
    const pct = 50 + 50 * Math.tanh(wp / 500);
    fill.style.height = clamp(pct, 3, 97) + '%';
  }

  function renderPlayers() {
    const topIsComputer = true;
    const bottom = S.playerColor === WHITE ? 'Bianco' : 'Nero';
    const top = S.playerColor === WHITE ? 'Nero' : 'Bianco';
    $('top-name').textContent = 'Computer';
    $('top-meta').textContent = `Livello ${S.level + 1} · ${AI.LEVELS[S.level].name} · ${AI.LEVELS[S.level].elo} Elo · ${top}`;
    $('bottom-name').textContent = 'Tu';
    $('bottom-meta').textContent = bottom + ' · ' + (S.lesson ? 'lezione' : 'partita libera');
    $('top-avatar').textContent = '🤖';
    $('bottom-avatar').textContent = S.playerColor === WHITE ? '♔' : '♚';

    const topColor = S.playerColor === WHITE ? BLACK : WHITE;
    const bottomColor = S.playerColor;
    $('top-captured').innerHTML = capturedHtml(topColor);
    $('bottom-captured').innerHTML = capturedHtml(bottomColor);

    $('player-top').classList.toggle('active', S.board.turn === topColor && !S.gameOver);
    $('player-bottom').classList.toggle('active', S.board.turn === bottomColor && !S.gameOver);

    $('top-clock').textContent = clockText(topColor === WHITE ? 'w' : 'b');
    $('bottom-clock').textContent = clockText(bottomColor === WHITE ? 'w' : 'b');
  }

  function capturedHtml(color) {
    /* pezzi avversari catturati da `color` */
    const start = new E.Board(S.startFen);
    const counts = {};
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = start.squares[s];
      if (p && colorOf(p) !== color) counts[typeOf(p)] = (counts[typeOf(p)] || 0) + 1;
    }
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const p = S.board.squares[s];
      if (p && colorOf(p) !== color) counts[typeOf(p)] -= 1;
    }
    let html = '';
    let material = 0;
    for (const t of [5, 4, 3, 2, 1]) {
      const n = counts[t] || 0;
      if (n > 0) {
        for (let k = 0; k < n; k++) html += '<span class="mini">' + UI.pieceMarkup(t, color ^ 1) + '</span>';
        material += n * (t === 1 ? 1 : t === 2 || t === 3 ? 3 : t === 4 ? 5 : 9);
      }
    }
    return html ? html + (material ? `<span class="adv">+${material}</span>` : '') : '';
  }

  function renderMoves() {
    const tbody = $('moves-table').querySelector('tbody');
    if (!S.moves.length) {
      tbody.innerHTML = '';
      $('moves-empty').style.display = '';
      return;
    }
    $('moves-empty').style.display = 'none';
    const startBoard = new E.Board(S.startFen);
    const blackStarts = startBoard.turn === BLACK;
    let html = '';
    let i = 0;
    while (i < S.moves.length) {
      const moveNo = Math.floor(i / 2) + 1;
      html += '<tr>';
      if (blackStarts) {
        html += `<td class="num">${moveNo}…</td>`;
        html += cellFor(i++);
        if (i < S.moves.length) html += cellFor(i++); else html += '<td></td>';
      } else {
        html += `<td class="num">${moveNo}.</td>`;
        html += cellFor(i++);
        if (i < S.moves.length) html += cellFor(i++); else html += '<td></td>';
      }
      html += '</tr>';
    }
    tbody.innerHTML = html;
    tbody.querySelectorAll('.mv').forEach((td) => {
      td.onclick = () => gotoMove(parseInt(td.dataset.idx, 10));
    });
  }

  function cellFor(index) {
    const m = S.moves[index];
    if (!m) return '<td></td>';
    const cur = (S.viewIndex === index + 1) ? ' current' : '';
    const sym = m.quality ? `<span class="sym ${m.quality.cls}">${m.quality.symbol}</span>` : '';
    return `<td class="mv${cur}" data-idx="${index + 1}" title="${(m.quality ? m.quality.label : '')}">${m.san}${sym}</td>`;
  }

  function renderLevels() {
    const box = $('level-list');
    box.innerHTML = '';
    AI.LEVELS.forEach((lv, i) => {
      const d = document.createElement('div');
      d.className = 'level-item' + (i === S.level ? ' active' : '');
      d.innerHTML = `<span class="num">${i + 1}</span>
        <div><div class="nm">${lv.name}</div><div class="ds">${lv.desc}</div></div>
        <div class="elo">${lv.elo}</div>`;
      d.onclick = () => {
        S.level = i;
        saveSettings();
        renderLevels();
        renderPlayers();
        toast('Livello: ' + lv.name + ' (' + lv.elo + ')', 'good');
      };
      box.appendChild(d);
    });
    $('level-desc').textContent = AI.LEVELS[S.level].desc;
  }

  /* ============================================================ lezioni */
  function renderLessons() {
    const box = $('lesson-list');
    const groups = { Base: [], Intermedio: [], Avanzato: [] };
    for (const l of C.LESSONS) (groups[l.level] || (groups[l.level] = [])).push(l);
    let html = '';
    let done = 0;
    for (const level of ['Base', 'Intermedio', 'Avanzato']) {
      const list = groups[level] || [];
      if (!list.length) continue;
      html += `<div class="lesson-group"><h4>${level}</h4>`;
      list.forEach((l) => {
        const isDone = !!S.lessonsDone[l.id];
        if (isDone) done++;
        const active = S.lesson && S.lesson.id === l.id ? ' active' : '';
        html += `<div class="lesson-item${isDone ? ' done' : ''}${active}" data-id="${l.id}" role="button" tabindex="0">
          <span class="num">${isDone ? '✓' : ''}</span>
          <div><div class="txt">${l.title}</div><div class="sub">${l.goal}</div></div>
        </div>`;
      });
      html += '</div>';
    }
    box.innerHTML = html;
    box.querySelectorAll('.lesson-item').forEach((el) => {
      el.onclick = () => startLesson(el.dataset.id);
    });
    const total = C.LESSONS.length;
    $('lesson-progress').style.width = Math.round((done / total) * 100) + '%';
    $('lesson-progress-text').textContent = `${done} di ${total} lezioni completate`;
  }

  function startLesson(id) {
    const lesson = C.LESSONS.find((l) => l.id === id);
    if (!lesson) return;
    S.lesson = { id: lesson.id, title: lesson.title, goal: lesson.goal, hint: lesson.hint,
      explanation: lesson.explanation, type: lesson.type, solution: lesson.solution,
      fen: lesson.fen, solved: false, attempts: 0, waiting: false };
    newGame({ fen: lesson.fen, color: 'w', keepLesson: true });
    renderLessonBanner();
    renderLessons();
    switchTab('lessons');
    toast('Lezione avviata: ' + lesson.title, 'good');
  }

  function renderLessonBanner() {
    if (!S.lesson) { $('lesson-banner').style.display = 'none'; return; }
    $('lesson-banner').style.display = '';
    $('lesson-title').textContent = S.lesson.title;
    $('lesson-goal').textContent = S.lesson.goal;
    $('lesson-status').textContent = S.lesson.solved
      ? '✓ Lezione completata. ' + S.lesson.explanation
      : 'Tocca a te: trova la mossa giusta. Se sbagli puoi riprovare.';
  }

  function checkLessonMove(move, res) {
    const L = S.lesson;
    L.attempts++;
    const uci = moveToUci(move);
    const solutionOk = L.solution.some((s) => s.slice(0, 4) === uci.slice(0, 4) && (s.length <= 4 || s[4] === uci[4]));
    let ok = false;
    if (L.type === 'mate1') ok = res.over.over && res.over.reason === 'scacco matto';
    else if (L.type === 'promotion') ok = !!mPromo(move);
    else ok = solutionOk;

    if (ok) {
      L.solved = true;
      L.waiting = false;
      S.lessonsDone[L.id] = true;
      saveSettings();
      const m = S.moves[S.moves.length - 1];
      m.quality = { label: 'Risposta esatta!', cls: 'best', symbol: '!' };
      renderLessonBanner();
      renderLessons();
      renderCoach();
      toast('✓ ' + L.explanation, 'good');
      if (!res.over.over) {
        /* il computer risponde e si continua a giocare */
        setTimeout(computerTurn, 900);
      }
    } else {
      const m = S.moves[S.moves.length - 1];
      m.quality = { label: 'Non è la mossa giusta', cls: 'blunder', symbol: '×' };
      renderCoach();
      toast('Non è la mossa giusta. Riprova! (indizio disponibile)', 'bad');
      L.waiting = true;
      setThinking(true, 'Torno indietro…');
      setTimeout(() => {
        setThinking(false);
        undo();
        L.waiting = false;
        updateBoard();
      }, 1500);
    }
  }

  /* ============================================================ orologio */
  function clockText(side) {
    if (!S.timeControl) return '∞';
    const t = Math.max(0, S.clock[side]);
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    return m + ':' + String(s).padStart(2, '0');
  }

  function startClock() {
    if (S.clock.interval) clearInterval(S.clock.interval);
    S.clock.last = Date.now();
    S.clock.interval = setInterval(() => {
      const now = Date.now();
      const dt = now - S.clock.last;
      S.clock.last = now;
      if (!S.clock.running || S.gameOver) return;
      const side = S.board.turn === WHITE ? 'w' : 'b';
      S.clock[side] = Math.max(0, S.clock[side] - dt);
      if (S.clock[side] <= 0) {
        S.clock.running = false;
        S.gameOver = { over: true, result: side === 'w' ? '0-1' : '1-0', reason: 'tempo esaurito' };
        showGameOver();
      }
      renderPlayers();
    }, 250);
  }

  /* ============================================================ comandi */
  function suggest() {
    if (S.thinking || S.gameOver) return;
    if (S.board.turn !== S.playerColor) return;
    setThinking(true, "Cerco la mossa migliore…");
    setTimeout(() => {
      const an = AI.analyzePosition(S.board, analysisCfg(false));
      setThinking(false);
      if (!an.bestMove) return;
      S.hintMove = an.bestMove;
      S.lastAnalysis = { score: an.score, mateIn: an.mateIn };
      updateBoard();
      renderCoach();
      renderEvalBar();
      const san = S.board.moveToSan(an.bestMove);
      toast('Mossa consigliata: ' + san, 'good');
    }, 30);
  }

  function analyzeDeep() {
    if (S.thinking) return;
    setThinking(true, 'Analisi approfondita…');
    setTimeout(() => {
      const board = currentBoard();
      const an = AI.analyzePosition(board, { depth: 6, timeMs: 2200 });
      const coach = C.analyze(board, {});
      const clone = board.clone();
      const line = [];
      for (const m of an.pv || []) {
        try { line.push(clone.moveToSan(m)); clone.makeMove(m); } catch (e) { break; }
      }
      setThinking(false);
      const wp = whitePov(an.score, board.turn);
      const mat = coach.material;
      let html = `<h2>Analisi della posizione</h2>
        <p><strong>Valutazione:</strong> ${scoreText(wp)} ${an.mateIn !== null && an.mateIn > 0 ? `— matto in ${an.mateIn} per ${board.turn === WHITE ? 'il Bianco' : 'il Nero'}` : ''}</p>
        <p><strong>Mossa migliore:</strong> ${an.bestMove ? board.moveToSan(an.bestMove) : '—'}</p>
        <p><strong>Linea principale:</strong> ${line.join(' ') || '—'}</p>
        <h3>Materiale</h3>
        <div class="kv"><span>Bianco</span><span>${(mat.white / 100).toFixed(1)}</span></div>
        <div class="kv"><span>Nero</span><span>${(mat.black / 100).toFixed(1)}</span></div>
        <div class="kv"><span>Differenza (dal punto di vista di chi muove)</span><span>${(mat.diff / 100).toFixed(2)}</span></div>
        <h3>Fase di gioco</h3><p>${coach.phase}</p>
        <h3>Consigli dell'insegnante</h3><ul>${coach.tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
      if (coach.hanging.mine.length) {
        html += `<h3>I tuoi pezzi in pericolo</h3><ul>${coach.hanging.mine.map((h) =>
          `<li>${C.PIECE_IT[h.piece]} in ${h.square}${h.free ? ' non è difeso' : ' è attaccato'}</li>`).join('')}</ul>`;
      }
      if (coach.hanging.theirs.length) {
        html += `<h3>Pezzi avversari attaccabili</h3><ul>${coach.hanging.theirs.map((h) =>
          `<li>${C.PIECE_IT[h.piece]} in ${h.square}${h.free ? ' non è difeso' : ''}</li>`).join('')}</ul>`;
      }
      html += `<p class="muted">Analisi eseguita a profondità ${an.depth} (${an.nodes.toLocaleString('it-IT')} posizioni esaminate).</p>`;
      openModal(html);
    }, 30);
  }

  function copyFen() {
    const fen = currentBoard().fen();
    navigator.clipboard ? navigator.clipboard.writeText(fen).then(() => toast('FEN copiata', 'good')).catch(() => toast(fen))
      : toast(fen);
  }

  function pgnText() {
    let out = '';
    const startBoard = new E.Board(S.startFen);
    const blackStarts = startBoard.turn === BLACK;
    for (let i = 0; i < S.moves.length; i++) {
      const num = Math.floor(i / 2) + 1;
      const isWhiteMove = blackStarts ? (i % 2 === 1) : (i % 2 === 0);
      if (isWhiteMove) out += num + '. ';
      else if (i === 0) out += num + '... ';
      out += S.moves[i].san + ' ';
    }
    const over = S.gameOver ? S.gameOver.result : '*';
    return `[Event "Partita contro il computer"]\n[Site "Guenda's Gambit"]\n[Date "${new Date().toISOString().slice(0, 10)}"]\n[White "${S.playerColor === WHITE ? 'Giocatore' : 'Computer ' + AI.LEVELS[S.level].name}"]\n[Black "${S.playerColor === BLACK ? 'Giocatore' : 'Computer ' + AI.LEVELS[S.level].name}"]\n[Result "${over}"]\n[FEN "${S.startFen}"]\n\n` + out + (over === '*' ? '' : over);
  }

  function copyPgn() {
    const txt = pgnText();
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('PGN copiato', 'good')).catch(() => openModal('<pre>' + txt.replace(/</g, '&lt;') + '</pre>'));
    else openModal('<pre>' + txt.replace(/</g, '&lt;') + '</pre>');
  }

  function switchTab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
  }

  /* ============================================================ avvio */
  let _booted = false;
  function init() {
    if (_booted) return;
    _booted = true;
    loadSettings();

    view = new UI.BoardView({
      el: $('board'),
      overlay: $('overlay'),
      onMoveAttempt: onMoveAttempt,
      onSelect: () => { }
    });
    view.showCoords = S.coordsOn;
    view.showHints = S.hintsOn;
    UI.Sound.enabled = S.soundOn;

    /* impostazioni -> UI */
    $('set-color').value = S.colorPref || 'w';
    $('set-time').value = String(S.timeControl);
    $('set-coach').checked = S.coachOn;
    $('set-referee').checked = S.refereeOn;
    $('set-hints').checked = S.hintsOn;
    $('set-coords').checked = S.coordsOn;
    $('set-sound').checked = S.soundOn;
    $('set-board').value = S.boardTheme;
    $('set-tempo-livello').value = String(S.analysisSpeed);
    applyBoardTheme(S.boardTheme);

    /* logo: lo stesso cavallo disegnato sulla scacchiera */
    const logo = $('brand-logo');
    if (logo) logo.innerHTML = UI.pieceMarkup(2, WHITE);

    /* eventi */
    $('btn-new').onclick = () => {
      S.lesson = null;
      newGame({ color: S.colorPref });
      toast('Nuova partita', 'good');
    };
    $('btn-undo').onclick = undo;
    $('btn-hint').onclick = suggest;
    $('btn-analyze').onclick = analyzeDeep;
    $('btn-flip').onclick = () => { view.flip(); };
    $('btn-moves').onclick = () => switchTab('moves');
    $('gameover-new').onclick = () => { $('gameover').classList.remove('show'); S.lesson = null; newGame({ color: S.colorPref }); };
    $('gameover-review').onclick = () => { $('gameover').classList.remove('show'); switchTab('moves'); gotoMove(0); };
    $('btn-theme').onclick = () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      $('btn-theme').textContent = next === 'dark' ? '🌙' : '☀️';
      saveSettings();
    };
    $('btn-help').onclick = showHelp;
    $('modal-close').onclick = closeModal;
    $('modal').onclick = (e) => { if (e.target === $('modal')) closeModal(); };

    document.querySelectorAll('.tabs button').forEach((b) => {
      b.onclick = () => switchTab(b.dataset.tab);
    });

    /* barra dell'insegnante su smartphone: apre il pannello e ci scorre sopra */
    const cm = $('coach-mobile');
    if (cm) {
      const openCoach = () => {
        switchTab('coach');
        const target = $('coach-feedback');
        if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      cm.onclick = openCoach;
      cm.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCoach(); }
      };
    }

    $('btn-copy-fen').onclick = copyFen;
    $('btn-copy-pgn').onclick = copyPgn;
    $('fen-input').onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      const fen = e.target.value.trim();
      try {
        const b = new E.Board(fen);
        S.lesson = null;
        newGame({ fen: fen, color: S.colorPref });
        toast('Posizione caricata', 'good');
      } catch (err) { toast('FEN non valida', 'bad'); }
    };

    $('set-color').onchange = (e) => { S.colorPref = e.target.value; saveSettings(); };
    $('set-time').onchange = (e) => { S.timeControl = parseInt(e.target.value, 10) || 0; saveSettings(); toast('Il tempo si applica dalla prossima partita'); };
    $('set-coach').onchange = (e) => { S.coachOn = e.target.checked; saveSettings(); };
    $('set-referee').onchange = (e) => { S.refereeOn = e.target.checked; saveSettings(); };
    $('set-hints').onchange = (e) => { S.hintsOn = e.target.checked; view.showHints = S.hintsOn; saveSettings(); updateBoard(); };
    $('set-coords').onchange = (e) => { S.coordsOn = e.target.checked; view.showCoords = S.coordsOn; saveSettings(); updateBoard(); };
    $('set-sound').onchange = (e) => { S.soundOn = e.target.checked; UI.Sound.enabled = S.soundOn; saveSettings(); };
    $('set-board').onchange = (e) => { S.boardTheme = e.target.value; applyBoardTheme(S.boardTheme); saveSettings(); };
    $('set-tempo-livello').onchange = (e) => { S.analysisSpeed = parseInt(e.target.value, 10) || 2; saveSettings(); };

    $('btn-lesson-hint').onclick = () => { if (S.lesson) toast('💡 ' + S.lesson.hint, 'good'); };
    $('btn-lesson-reset').onclick = () => { if (S.lesson) startLesson(S.lesson.id); };
    $('btn-lesson-close').onclick = () => {
      S.lesson = null;
      $('lesson-banner').style.display = 'none';
      newGame({ color: S.colorPref });
      renderLessons();
    };

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') gotoMove(S.viewIndex - 1);
      else if (e.key === 'ArrowRight') gotoMove(S.viewIndex + 1);
      else if (e.key === 'ArrowUp') gotoMove(S.moves.length);
      else if (e.key === 'h') suggest();
      else if (e.key === 'f') view.flip();
      else if (e.key === 'u') undo();
      else if (e.key === 'Escape') { closeModal(); $('promo').classList.remove('show'); }
    });

    renderLevels();
    renderLessons();
    startClock();
    newGame({ color: S.colorPref });
    const theme = document.documentElement.getAttribute('data-theme');
    $('btn-theme').textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  function applyBoardTheme(name) {
    const wrap = $('board-wrap');
    const themes = {
      verde: { light: '#e9e2d0', dark: '#7d9c68' },
      blu: { light: '#dee7f3', dark: '#5b7bab' },
      marmo: { light: '#f3efe6', dark: '#b6a99a' }
    };
    const t = themes[name] || themes.verde;
    document.documentElement.style.setProperty('--sq-light', t.light);
    document.documentElement.style.setProperty('--sq-dark', t.dark);
  }

  function showHelp() {
    openModal(`
      <h2>Come si gioca</h2>
      <p><strong>Muovi i pezzi</strong> cliccando il pezzo e poi la casa di arrivo, oppure trascinandolo con il mouse o il dito.</p>
      <p><strong>Obiettivo:</strong> dare scacco matto al re avversario, cioè attaccarlo senza che possa salvarsi.</p>
      <h3>Valore dei pezzi</h3>
      <p>Pedone 1 · Cavallo 3 · Alfiere 3 · Torre 5 · Donna 9 · Re (non si cattura, si dà matto).</p>
      <h3>Regole speciali</h3>
      <ul>
        <li><strong>Arrocco:</strong> il re si muove di due case verso la torre e la torre salta dall'altra parte (si scrive O-O oppure O-O-O). Serve a mettere il re al sicuro.</li>
        <li><strong>En passant:</strong> un pedone che arriva accanto a un pedone avversario appena mosso di due case può catturarlo come se avesse mosso di una.</li>
        <li><strong>Promozione:</strong> un pedone che arriva in ottava traversa diventa donna, torre, alfiere o cavallo.</li>
      </ul>
      <h3>L'insegnante</h3>
      <p>Con i commenti attivi, dopo ogni tua mossa riceverai un giudizio (ottima, buona, imprecisione, errore) e il consiglio sulla mossa migliore. Nella scheda <em>Lezioni</em> trovi esercizi divisi in Base, Intermedio e Avanzato.</p>
      <h3>Scorciatoie</h3>
      <p>← → per scorrere le mosse · H per il suggerimento · F per ruotare la scacchiera · U per annullare.</p>
    `);
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
