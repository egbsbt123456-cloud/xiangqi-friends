/* 象棋 UI 主逻辑：渲染 + 输入 + 对局流程
 *
 * P0-01：棋盘交互统一事件委托——点击任何位置换算为交叉点行列，
 *        空白交叉点也能落子；不存在逐棋子监听，杜绝一次点击处理两次。
 * P0-02：局次版本号 gameEpoch + 定时器取消，重新开局/悔棋时旧 AI 任务全部失效；
 *        AI 在棋盘克隆上计算，绝不污染真实对局。
 * P1-01：显示层方向换算（默认红方在下、黑方在上），翻转只改渲染与点击映射。
 * P1-02：中文记谱统一由 js/notation.js 生成，且以【走子前】棋盘计算、随历史保存。
 * P1-04：走子一律通过 XQ.safeApplyMove 纯函数产生新状态，原棋盘不被原地修改。
 */
(function () {
  'use strict';

  var XQ = window.XQ;
  var XQAI = window.XQAI;
  var XQN = window.XQN;
  var XQG = window.XQG;
  var mode = new URLSearchParams(window.location ? window.location.search : '').get('mode') || 'ai';
  if (mode !== 'local' && mode !== 'online') { mode = 'ai'; }
  var onlineSide = null, onlineReady = false, pendingMove = false, onlineCode = null;
  function tellParent(type, data) { window.parent.postMessage({channel:'boardgame:xiangqi',type:type,data:data}, window.location.origin); }


  /* ---------------- 几何 ---------------- */
  var M = XQG.M, CELL = XQG.CELL;
  var PIECE_R = 21; // 棋子显示半径（42px）

  function posOf(vr, vc) { return { x: M + vc * CELL, y: M + vr * CELL }; } // 视图坐标 → SVG 位置

  function viewRow(r) { return XQG.viewRow(r, flipped); }
  function viewCol(c) { return XQG.viewCol(c, flipped); }
  function viewX(r, c) { return posOf(viewRow(r), viewCol(c)).x; }
  function viewY(r, c) { return posOf(viewRow(r), viewCol(c)).y; }

  /* ---------------- 对局状态 ---------------- */
  var state = null;       // 引擎权威状态 {board, turn, over, winner, reason, version, lastMove}
  var history = [];      // {move, captured, mover, notation, turnBefore}，记谱在走子前生成
  var selected = null;    // {r, c}
  var legalTargets = [];
  var flipped = false;    // 视角翻转（纯渲染层）
  var aiThinking = false;
  var showHints = true;

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ---------------- DOM ---------------- */
  var svg = document.getElementById('board');
  var gridLayer = document.getElementById('gridLayer');
  var starLayer = document.getElementById('starLayer');
  var hintLayer = document.getElementById('hintLayer');
  var selLayer = document.getElementById('selLayer');
  var pieceLayer = document.getElementById('pieceLayer');
  var moveListEl = document.getElementById('moveList');
  var statusRed = document.getElementById('statusRed');
  var statusBlack = document.getElementById('statusBlack');
  var statusBar = document.getElementById('statusBar');
  var capturedRed = document.getElementById('capturedRed');
  var capturedBlack = document.getElementById('capturedBlack');
  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modalTitle');
  var modalBody = document.getElementById('modalBody');

  /* ---------------- 棋子渲染 ---------------- */
  var pieceEls = {}; // 'r,c' -> g 元素

  function pieceSVGFileName(p) { return 'img/pieces/' + p + '.svg'; }

  function renderPieces() {
    pieceLayer.innerHTML = '';
    pieceEls = {};
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = state.board[r][c];
        if (!p) { continue; }
        var g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', 'piece ' + (XQ.sideOf(p) === 'r' ? 'red' : 'black'));
        g.setAttribute('transform', 'translate(' + viewX(r, c) + ',' + viewY(r, c) + ')');
        var img = document.createElementNS(SVGNS, 'image');
        img.setAttribute('class', 'piece-img');
        img.setAttribute('href', pieceSVGFileName(p));
        img.setAttribute('x', -PIECE_R);
        img.setAttribute('y', -PIECE_R);
        img.setAttribute('width', PIECE_R * 2);
        img.setAttribute('height', PIECE_R * 2);
        g.appendChild(img);
        // P0-01：棋子元素不挂监听，统一由棋盘 svg 委托处理
        pieceLayer.appendChild(g);
        pieceEls[r + ',' + c] = g;
      }
    }
  }

  /* ---------------- 棋盘绘制 ---------------- */
  function drawBoard() {
    gridLayer.innerHTML = '';
    starLayer.innerHTML = '';

    var line = function (x1, y1, x2, y2, cls) {
      var l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('class', cls || 'grid-line');
      gridLayer.appendChild(l);
    };

    for (var r = 0; r < 10; r++) {
      line(M, M + r * CELL, M + 8 * CELL, M + r * CELL);
    }
    for (var c = 0; c < 9; c++) {
      if (c === 0 || c === 8) {
        line(M + c * CELL, M, M + c * CELL, M + 9 * CELL);
      } else {
        line(M + c * CELL, M, M + c * CELL, M + 4 * CELL);
        line(M + c * CELL, M + 5 * CELL, M + c * CELL, M + 9 * CELL);
      }
    }
    var palace = function (vr0, vr2) {
      var a = posOf(vr0, 3), b = posOf(vr2, 5);
      var d = posOf(vr0, 5), e = posOf(vr2, 3);
      line(a.x, a.y, b.x, b.y, 'palace-line');
      line(d.x, d.y, e.x, e.y, 'palace-line');
    };
    palace(viewRow(0), viewRow(2));
    palace(viewRow(7), viewRow(9));

    var riverText = document.createElementNS(SVGNS, 'text');
    riverText.setAttribute('x', M + 4 * CELL);
    riverText.setAttribute('y', M + 4 * CELL + 17);
    riverText.setAttribute('text-anchor', 'middle');
    riverText.setAttribute('style', 'font-size:22px; fill:#7a5c33; letter-spacing:8px; font-family:"KaiTi","STKaiti",serif');
    riverText.textContent = '楚 河        汉 界';
    gridLayer.appendChild(riverText);

    var stars = [];
    for (var pc = 0; pc < 9; pc += 2) { stars.push([3, pc]); stars.push([6, pc]); }
    stars.push([2, 1]); stars.push([2, 7]); stars.push([7, 1]); stars.push([7, 7]);
    stars.forEach(function (s) {
      var vp = posOf(viewRow(s[0]), viewCol(s[1]));
      var mk = function (dx, dy) {
        var g = document.createElementNS(SVGNS, 'path');
        var x = vp.x + dx, y = vp.y + dy;
        var sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
        g.setAttribute('d', 'M' + x + ',' + y + ' l' + (4 * sx) + ',' + 0 +
          ' l0,' + (4 * sy) + ' l' + (-4 * sx) + ',0' + ' z');
        g.setAttribute('class', 'star');
        starLayer.appendChild(g);
      };
      if (s[1] > 0) { mk(-5, -5); mk(-5, 5); }
      if (s[1] < 8) { mk(5, -5); mk(5, 5); }
    });

    var frame = document.createElementNS(SVGNS, 'rect');
    frame.setAttribute('x', M - 4); frame.setAttribute('y', M - 4);
    frame.setAttribute('width', 8 * CELL + 8); frame.setAttribute('height', 9 * CELL + 8);
    frame.setAttribute('class', 'grid-line');
    frame.setAttribute('fill', 'none');
    frame.setAttribute('stroke-width', '2.5');
    gridLayer.appendChild(frame);
  }

  /* ---------------- 提示层 ---------------- */
  function renderHints() {
    hintLayer.innerHTML = '';
    selLayer.innerHTML = '';
    if (!selected) { return; }
    var ring = document.createElementNS(SVGNS, 'circle');
    ring.setAttribute('cx', viewX(selected.r, selected.c));
    ring.setAttribute('cy', viewY(selected.r, selected.c));
    ring.setAttribute('r', PIECE_R + 2);
    ring.setAttribute('class', 'sel-ring');
    selLayer.appendChild(ring);
    if (!showHints) { return; }
    legalTargets.forEach(function (t) {
      var dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('cx', viewX(t.r, t.c));
      dot.setAttribute('cy', viewY(t.r, t.c));
      dot.setAttribute('r', state.board[t.r][t.c] ? PIECE_R - 6 : 7);
      dot.setAttribute('class', 'hint-dot' + (state.board[t.r][t.c] ? ' enemy' : ''));
      hintLayer.appendChild(dot);
    });
  }

  function renderLastMove() {
    var layer = document.getElementById('lastLayer');
    if (!layer) {
      layer = document.createElementNS(SVGNS, 'g');
      layer.id = 'lastLayer';
      svg.insertBefore(layer, selLayer);
    }
    layer.innerHTML = '';
    if (!state.lastMove) { return; }
    var lm = state.lastMove;
    [{ r: lm.fr, c: lm.fc }, { r: lm.tr, c: lm.tc }].forEach(function (mk) {
      var rect = document.createElementNS(SVGNS, 'rect');
      rect.setAttribute('x', viewX(mk.r, mk.c) - PIECE_R - 2);
      rect.setAttribute('y', viewY(mk.r, mk.c) - PIECE_R - 2);
      rect.setAttribute('width', (PIECE_R + 2) * 2);
      rect.setAttribute('height', (PIECE_R + 2) * 2);
      rect.setAttribute('class', 'last-move');
      layer.appendChild(rect);
    });
  }

  /* ---------------- 点击 → 交叉点（P0-01 核心） ---------------- */
  function getCellFromClick(event) {
    var matrix = svg.getScreenCTM();
    if (!matrix) { return null; }
    var point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    var local = point.matrixTransform(matrix.inverse());
    // 换算核心在 js/geom.js，与翻转状态联动
    return XQG.cellFromLocal(local.x, local.y, flipped);
  }

  // 统一入口：全棋盘唯一 click 监听（事件委托）
  svg.addEventListener('click', function (event) {
    var cell = getCellFromClick(event);
    if (!cell) { return; }
    onCellClick(cell.r, cell.c);
  });

  function onCellClick(r, c) {
    if (!state || state.over || aiThinking || pendingMove) { return; }
    if (mode === 'ai' && state.turn !== XQ.RED) { return; }
    if (mode === 'online' && (!onlineReady || state.turn !== onlineSide)) { return; }

    var p = state.board[r][c];
    if (selected) {
      if (selected.r === r && selected.c === c) {
        // 再点选中棋子：取消选择
        selected = null; legalTargets = [];
        renderHints();
        return;
      }
      if (p && XQ.sideOf(p) === state.turn) {
        selectPiece(r, c); // 切换选中己方另一棋子
        return;
      }
      // 空位或敌子：尝试走/吃（非法则由引擎拒绝）
      tryMove(selected.r, selected.c, r, c);
    } else if (p && XQ.sideOf(p) === state.turn) {
      selectPiece(r, c);
    }
  }

  function selectPiece(r, c) {
    selected = { r: r, c: c };
    legalTargets = XQ.movesFor(state.board, r, c).map(function (m) {
      return { r: m.tr, c: m.tc };
    });
    renderHints();
  }

  function tryMove(fr, fc, tr, tc) {
    // 人方走子与 AI 走子共用 doMove：校验、记谱、历史、收尾完全一致
    var move = { fr: fr, fc: fc, tr: tr, tc: tc };
    if (mode === 'online') {
      if (!onlineReady || pendingMove || state.turn !== onlineSide || !XQ.safeApplyMove(state, onlineSide, move).ok) { return; }
      pendingMove = true; selected = null; legalTargets = []; renderHints();
      tellParent('move', {move:move,expectedVersion:state.version});
      return;
    }
    doMove(move);
  }

  /* ---------------- 走子后统一收尾 ---------------- */
  // 入口：state 已是走子后的新状态；fr/fc/tr/tc 供历史与渲染
  function afterMoveApplied(fr, fc, tr, tc) {
    selected = null; legalTargets = [];
    renderPieces();
    renderLastMove();
    renderHints();
    appendMoveToList();
    renderCaptured();
    updateStatus();

    if (state.over) {
      endGame();
      return;
    }
    if (state.turn === XQ.BLACK) {
      scheduleAI();
    }
  }

  // 通用走子（人 + AI 共用）：校验 → 换状态 → 收尾
  function doMove(m) {
    var res = XQ.safeApplyMove(state, state.turn, m);
    if (!res.ok) { return false; }
    var mover = state.board[m.fr][m.fc];
    var captured = state.board[m.tr][m.tc];
    var notation = XQN.notation(state.board, m); // P1-02：走子前棋盘记谱
    history.push({
      move: m, captured: captured, mover: mover,
      notation: notation, turnBefore: state.turn
    });
    state = res.state;
    afterMoveApplied(m.fr, m.fc, m.tr, m.tc);
    return true;
  }

  /* ---------------- AI 调度（P0-02） ---------------- */
  var gameEpoch = 0;  // 局次版本号：新局/悔棋递增，旧任务据此失效
  var aiTimer = null;
  var aiWorker = null;
  var aiWatchdog = null;
  var aiEnabled = mode === 'ai'; // 测试钩子可关，供自动化测试走确定性双人线

  function cancelPendingAI() {
    gameEpoch++;
    if (aiTimer !== null) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
    if (aiWorker) { aiWorker.terminate(); aiWorker = null; }
    if (aiWatchdog !== null) { clearTimeout(aiWatchdog); aiWatchdog = null; }
    aiThinking = false;
  }

  function scheduleAI() {
    if (!aiEnabled || aiThinking || !state || state.over || state.turn !== XQ.BLACK) { return; }
    var epoch = gameEpoch, version = state.version;
    aiThinking = true;
    updateStatus();
    aiTimer = setTimeout(function () {
      aiTimer = null;
      var worker = null, watchdog = null, finished = false, fallbackStarted = false;
      function current() { return epoch === gameEpoch && state && !state.over && state.turn === XQ.BLACK && state.version === version; }
      function stopWorker() {
        if (worker) { worker.terminate(); if (aiWorker === worker) { aiWorker = null; } }
        if (watchdog !== null) { clearTimeout(watchdog); if (aiWatchdog === watchdog) { aiWatchdog = null; } }
      }
      function finish(result) {
        if (finished) { return; }
        finished = true; stopWorker();
        if (!current()) { return; }
        aiThinking = false;
        if (result && result.move && doMove(result.move)) { return; }
        // An error/illegal result must not strand Black or falsely declare a win.
        var moves = XQ.legalMoves(state.board, XQ.BLACK);
        if (moves.length) { doMove(moves[0]); }
        else { state = Object.assign({}, state, XQ.gameStatus(state.board, XQ.BLACK)); endGame(); }
      }
      function fallback() {
        if (finished || fallbackStarted || !current()) { stopWorker(); return; }
        fallbackStarted = true; stopWorker();
        var result = null;
        try { result = XQAI.bestMove(XQ.cloneBoard(state.board), XQ.BLACK, 2, {nodeBudget:4000,timeMs:250}); }
        catch (err) { console.warn('AI 兼容计算失败，改用合法走法', err); }
        finish(result);
      }
      if (!current()) { return; }
      if (typeof window.Worker === 'function') {
        try {
          worker = new window.Worker(window.__XQ_WORKER_URL__ || 'js/ai-worker.js'); aiWorker = worker;
          worker.onmessage = function (event) {
            var data = event.data || {};
            if (data.id !== epoch || data.version !== version) { return; }
            if (data.error) { fallback(); } else { finish(data.result); }
          };
          worker.onerror = function (event) { if (event.preventDefault) { event.preventDefault(); } fallback(); };
          worker.onmessageerror = fallback;
          watchdog = setTimeout(fallback, 2200); aiWatchdog = watchdog;
          worker.postMessage({id:epoch,version:version,board:XQ.cloneBoard(state.board),side:XQ.BLACK,depth:2});
          return;
        } catch (err) { /* file:// or unsupported Worker: use a short bounded search */ }
      }
      fallback();
    }, 120);
  }

  /* ---------------- 记录列表 / 吃子区 ---------------- */
  function appendMoveToList() {
    var h = history[history.length - 1];
    if (!h) { return; }
    var li = document.createElement('li');
    li.textContent = h.notation;
    if (h.captured) { li.className = 'capture'; }
    moveListEl.appendChild(li);
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function rebuildMoveList() {
    moveListEl.innerHTML = '';
    history.forEach(function (h, i) {
      var li = document.createElement('li');
      li.textContent = h.notation;
      if (h.captured) { li.className = 'capture'; }
      moveListEl.appendChild(li);
    });
  }

  function renderCaptured() {
    capturedRed.innerHTML = '';
    capturedBlack.innerHTML = '';
    history.forEach(function (h) {
      if (h.captured) {
        var box = XQ.sideOf(h.captured) === 'r' ? capturedBlack : capturedRed;
        var el = document.createElement('img');
        el.src = pieceSVGFileName(h.captured);
        box.appendChild(el);
      }
    });
  }

  /* ---------------- 状态栏 ---------------- */
  function updateStatus() {
    if (!state) { return; }
    var over = state.over;
    statusRed.textContent = state.turn === XQ.RED && !over ? (aiThinking ? '等待黑方…' : '红方行棋') : '红方';
    statusBlack.textContent = state.turn === XQ.BLACK && !over ? (aiThinking ? '黑方思考中…' : '黑方行棋') : '黑方';
    statusRed.classList.toggle('active', state.turn === XQ.RED && !over);
    statusBlack.classList.toggle('active', state.turn === XQ.BLACK && !over);

    var inChk = !over && XQ.inCheck(state.board, state.turn);
    if (!over) {
      statusBar.textContent = (state.turn === XQ.RED ? '红方' : '黑方') + '行棋' +
        (inChk ? ' — 将军！' : '') + (aiThinking ? '（黑方思考中）' : '');
    }
    statusBar.classList.toggle('check', inChk);

    for (var key in pieceEls) {
      if (Object.prototype.hasOwnProperty.call(pieceEls, key)) {
        pieceEls[key].classList.remove('check-flash');
      }
    }
    if (inChk) {
      var k = XQ.findKing(state.board, state.turn);
      if (k) {
        var el = pieceEls[k.r + ',' + k.c];
        if (el) { el.classList.add('check-flash'); }
      }
    }
  }

  function endGame() {
    var msg;
    if (state.reason === 'checkmate') {
      msg = (state.winner === XQ.RED ? '红方' : '黑方') + '胜 — 绝杀';
    } else if (state.reason === 'stalemate') {
      msg = (state.winner === XQ.RED ? '红方' : '黑方') + '胜 — 困毙';
    } else if (state.reason === 'resign') {
      msg = (state.winner === XQ.RED ? '红方' : '黑方') + '胜 — 对方认输';
    } else if (state.reason === 'cancelled') {
      msg = '房间已取消';
    } else {
      msg = '对局结束';
    }
    statusBar.textContent = msg;
    modalTitle.textContent = msg;
    modalBody.textContent = '共 ' + history.length + ' 手';
    modal.classList.remove('hidden');
    updateStatus();
  }

  /* ---------------- 悔棋 ---------------- */
  function undo() {
    if (mode === 'online' || !state || history.length === 0) { return; }
    // 先作废一切未执行的 AI 任务（P0-02 同机制）
    cancelPendingAI();

    // turn 为黑 = AI 尚未走（或没走成）：只退人的一手；turn 为红 = AI 刚走完：退两手
    var steps = mode === 'local' ? 1 : state.turn === XQ.BLACK ? 1 : 2;
    if (history.length < steps) { steps = history.length; }

    for (var i = 0; i < steps; i++) {
      var h = history.pop();
      if (!h) { break; }
    }

    // 重建状态：从初始盘重放剩余历史（状态是不可变纯函数产物，重放最可靠）
    state = XQ.createInitialState();
    for (var j = 0; j < history.length; j++) {
      var hh = history[j];
      var res = XQ.safeApplyMove(state, state.turn, hh.move);
      if (!res.ok) { break; } // 理论不可达：历史均为已验证合法着法
      state = res.state;
    }

    selected = null; legalTargets = [];
    modal.classList.add('hidden');
    renderPieces(); renderLastMove(); renderHints();
    rebuildMoveList(); renderCaptured(); updateStatus();
  }

  /* ---------------- 新局 ---------------- */
  function newGame() {
    cancelPendingAI(); // P0-02：作废所有未执行的 AI 任务
    state = XQ.createInitialState();
    history = [];
    selected = null; legalTargets = [];
    modal.classList.add('hidden');
    renderPieces(); renderLastMove(); renderHints();
    rebuildMoveList(); renderCaptured(); updateStatus();
  }

  /* ---------------- 事件绑定 ---------------- */
  document.getElementById('btnNew').addEventListener('click', newGame);
  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnFlip').addEventListener('click', function () {
    flipped = !flipped; // 只改渲染与点击映射，不动棋盘数组（P1-01）
    drawBoard(); renderPieces(); renderLastMove(); renderHints();
  });
  document.getElementById('chkHints').addEventListener('change', function (e) {
    showHints = e.target.checked;
    renderHints();
  });
  document.getElementById('modalOk').addEventListener('click', function () {
    modal.classList.add('hidden');
    newGame();
  });

  document.getElementById('modalReview').addEventListener('click', function () {
    modal.classList.add('hidden');
  });

  /* ---------------- 启动 ---------------- */
  drawBoard();
  newGame();
  svg.setAttribute('data-ready', 'true');

  if (mode === 'online') {
    document.getElementById('btnNew').hidden = true;
    document.getElementById('btnUndo').hidden = true;
    document.getElementById('modalOk').hidden = true;
    statusBar.textContent = '等待房间同步…';
    window.addEventListener('message', function (event) {
      if (event.source !== window.parent || event.origin !== window.location.origin || !event.data || event.data.channel !== 'boardgame:xiangqi:control') { return; }
      var room = event.data.room;
      if (!room || !room.state || !Array.isArray(room.history)) { return; }
      if (onlineCode === room.code && state && room.state.version < state.version) { return; }
      var first = onlineCode !== room.code, ended = !first && state && state.over;
      if (!first && room.state.version === state.version && !pendingMove) { return; }
      onlineCode = room.code; onlineSide = room.yourSide; onlineReady = room.status === 'playing'; pendingMove = false;
      if (first) { flipped = onlineSide === 'b'; drawBoard(); }
      state = room.state; history = room.history; selected = null; legalTargets = [];
      renderPieces(); renderLastMove(); renderHints(); rebuildMoveList(); renderCaptured(); updateStatus();
      if (room.status === 'waiting') { statusBar.textContent = '等待好友加入'; }
      if (state.over && !ended) { endGame(); }
    });
    tellParent('ready', {});
  }

  /* ---------------- 测试钩子（仅自动化测试使用，正常游玩无副作用） ---------------- */
  window.__XQ_TEST__ = {
    onCellClick: onCellClick,
    getCellFromClick: getCellFromClick,
    getState: function () { return state; },
    getHistory: function () { return history; },
    newGame: newGame,
    undo: undo,
    scheduleAI: scheduleAI,
    getEpoch: function () { return gameEpoch; },
    setAIEnabled: function (v) { aiEnabled = v; },
    setFlipped: function (v) {
      flipped = v;
      drawBoard(); renderPieces(); renderLastMove(); renderHints();
    },
    clickView: function (vr, vc) { // 直接按视图坐标派发点击（自动化测试用）
      var cell = XQG.cellFromLocal(M + vc * CELL, M + vr * CELL, flipped);
      if (!cell) { return null; }
      onCellClick(cell.r, cell.c);
      return cell;
    }
  };
})();
