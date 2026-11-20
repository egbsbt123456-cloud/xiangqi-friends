/* 象棋 AI：alpha-beta + 静态搜索（quiescence）
 * 纯逻辑模块：浏览器 window.XQAI / Node module.exports
 *
 * P1-05 修复要点：
 * 1. quiesce() 区分被将军/非被将军：被将军时必须搜索【全部】应将着法，
 *    一个都搜不出来才是将死；非被将军时才允许静态评价 + 仅吃子展开。
 * 2. 节点预算 + 时间预算：超限提前截断，返回当前最好结果。
 * 3. 静态搜索深度上限 QDEPTH_MAX：防止连环将军导致的无穷递归。
 * 4. 搜索一律在棋盘克隆上进行（调用方传入 clone，见 app.js scheduleAI），
 *    AI 的 make/unmake 永不污染真实对局棋盘。
 *
 * 浏览器通过 Web Worker 运行，失败时使用低预算同步兜底。
 */
(function (root) {
  'use strict';

  var XQ = root.XQ || (typeof require === 'function' ? require('./engine.js') : null);

  var PIECE_VALUES = { K: 10000, R: 900, C: 450, N: 400, B: 200, A: 200, P: 100 };
  var P_BONUS = {
    P: [
      [0,0,0,0,0,0,0,0,0],
      [0,0,20,24,30,24,20,0,0],
      [0,0,26,34,40,34,26,0,0],
      [0,10,24,36,44,36,24,10,0],
      [0, 6,18,30,38,30,18, 6,0],
      [0, 4,10,22,32,22,10, 4,0],
      [0, 0, 6,14,22,14, 6, 0,0],
      [0, 0, 2, 8,12, 8, 2, 0,0],
      [0, 0, 0, 2, 4, 2, 0, 0,0],
      [0,0,0,0,0,0,0,0,0]
    ],
    N: [
      [0,0,4,0,0,0,4,0,0],
      [0,2,4,6,8,6,4,2,0],
      [2,4,8,10,10,10,8,4,2],
      [2,6,10,12,12,12,10,6,2],
      [2,6,10,12,12,12,10,6,2],
      [2,6,10,12,12,12,10,6,2],
      [2,4,8,10,10,10,8,4,2],
      [0,2,4,6,8,6,4,2,0],
      [0,0,2,4,4,4,2,0,0],
      [0,0,0,0,0,0,0,0,0]
    ],
    C: [
      [6,6,0,4,8,4,0,6,6],
      [6,8,2,6,10,6,2,8,6],
      [4,6,4,8,10,8,4,6,4],
      [2,4,6,8,12,8,6,4,2],
      [2,4,6,8,12,8,6,4,2],
      [2,4,6,8,12,8,6,4,2],
      [2,4,6,8,12,8,6,4,2],
      [2,4,6,8,12,8,6,4,2],
      [4,6,4,8,10,8,4,6,4],
      [6,8,2,6,10,6,2,8,6]
    ],
    R: [
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8],
      [8,10,6,6,6,6,6,10,8]
    ]
  };

  /* ---------------- 预算控制 ---------------- */
  var NODE_BUDGET = 30000;   // 每次搜索的节点上限
  var TIME_BUDGET_MS = 3000; // 每次搜索的时间上限
  var QDEPTH_MAX = 8;        // 静态搜索深度上限（防连环将军无限递归）

  var nodeCount = 0;
  var startTime = 0;
  var nodeLimit = NODE_BUDGET, timeLimit = TIME_BUDGET_MS;
  var BUDGET_STOP = {};

  function outOfBudget() {
    return nodeCount >= nodeLimit || (Date.now() - startTime) >= timeLimit;
  }
  function visit() { if (outOfBudget()) { throw BUDGET_STOP; } nodeCount++; }

  function evalBoard(board) {
    var score = 0;
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = board[r][c];
        if (!p) { continue; }
        var v = PIECE_VALUES[p.charAt(1)];
        var bonus = P_BONUS[p.charAt(1)];
        if (bonus) {
          var rr = p.charAt(0) === 'r' ? r : 9 - r;
          v += bonus[rr][c];
        }
        score += (p.charAt(0) === 'r' ? v : -v);
      }
    }
    return score; // 正 = 红优
  }

  function orderMoves(board, moves) {
    var scored = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var cap = board[m.tr][m.tc];
      var sc = cap
        ? PIECE_VALUES[cap.charAt(1)] * 10 - PIECE_VALUES[board[m.fr][m.fc].charAt(1)]
        : 0;
      scored.push({ m: m, sc: sc, cap: cap });
    }
    scored.sort(function (a, b) { return b.sc - a.sc; });
    return scored;
  }

  /* ---------------- 静态搜索 ---------------- */
  function quiesce(board, side, alpha, beta, qdepth) {
    visit();
    var moves = XQ.legalMoves(board, side);
    if (moves.length === 0) { return -100000 + qdepth; }
    if (qdepth >= QDEPTH_MAX) { return (side === 'r' ? 1 : -1) * evalBoard(board); }

    var inChk = XQ.inCheck(board, side);
    if (inChk) {
      // P1-05 核心修复：被将军时不能用静态评价敷衍，必须搜全部应将着法
      if (qdepth >= QDEPTH_MAX) {
        // 深度上限兜底：防连环将军导致无穷递归
        return (side === 'r' ? 1 : -1) * evalBoard(board);
      }
      var evasions = moves;
      if (evasions.length === 0) {
        return -100000 - qdepth; // 将死：从被将死方视角
      }
      var evOrd = orderMoves(board, evasions);
      for (var e = 0; e < evOrd.length; e++) {
        var em = evOrd[e].m, ecap = evOrd[e].cap;
        XQ.makeMove(board, em);
        var esc;
        try { esc = -quiesce(board, XQ.opp(side), -beta, -alpha, qdepth + 1); }
        finally { XQ.unmakeMove(board, em, ecap); }
        if (esc >= beta) { return beta; }
        if (esc > alpha) { alpha = esc; }
      }
      return alpha;
    }

    // 非被将军：静态评价 + 仅吃子展开
    var stand = (side === 'r' ? 1 : -1) * evalBoard(board);
    if (stand >= beta) { return beta; }
    if (stand > alpha) { alpha = stand; }
    var ord = orderMoves(board, moves);
    for (var i = 0; i < ord.length; i++) {
      if (!ord[i].cap) { continue; } // 只展开吃子
      var m = ord[i].m, cap = ord[i].cap;
      XQ.makeMove(board, m);
      var sc;
      try { sc = -quiesce(board, XQ.opp(side), -beta, -alpha, qdepth + 1); }
      finally { XQ.unmakeMove(board, m, cap); }
      if (sc >= beta) { return beta; }
      if (sc > alpha) { alpha = sc; }
    }
    return alpha;
  }

  /* ---------------- 主搜索 ---------------- */
  function search(board, side, depth, alpha, beta) {
    visit();
    if (depth <= 0) {
      return quiesce(board, side, alpha, beta, 0);
    }
    var moves = XQ.legalMoves(board, side);
    if (moves.length === 0) {
      // 将死/困毙：从走子方视角是极坏（深度越浅越坏，促使早将死）
      return -100000 - depth;
    }
    var ord = orderMoves(board, moves);
    for (var i = 0; i < ord.length; i++) {
      // 预算耗尽：保留已搜到的最好结果，提前返回
      if (outOfBudget()) { throw BUDGET_STOP; }
      var m = ord[i].m, cap = ord[i].cap;
      XQ.makeMove(board, m);
      var sc;
      try { sc = -search(board, XQ.opp(side), depth - 1, -beta, -alpha); }
      finally { XQ.unmakeMove(board, m, cap); }
      if (sc >= beta) { return beta; }
      if (sc > alpha) { alpha = sc; }
    }
    return alpha;
  }

  // 返回 {move, score, nodes, elapsedMs}；无棋可走返回 null
  function bestMove(board, side, depth, options) {
    options = options || {};
    nodeCount = 0;
    startTime = Date.now();
    nodeLimit = Number.isFinite(options.nodeBudget) ? Math.max(1, Math.min(NODE_BUDGET, Math.floor(options.nodeBudget))) : NODE_BUDGET;
    timeLimit = Number.isFinite(options.timeMs) ? Math.max(1, Math.min(TIME_BUDGET_MS, options.timeMs)) : TIME_BUDGET_MS;
    if (!Number.isInteger(depth) || depth < 1) { depth = 2; }
    depth = Math.min(depth, 6);

    var moves = XQ.legalMoves(board, side);
    if (moves.length === 0) { return null; }

    var best = null, bestScore = -Infinity;
    var ord = orderMoves(board, moves);
    var cutoff = false;
    for (var i = 0; i < ord.length; i++) {
      if (outOfBudget()) { cutoff = true; break; }
      var m = ord[i].m, cap = ord[i].cap;
      XQ.makeMove(board, m);
      var sc;
      try { sc = -search(board, XQ.opp(side), depth - 1, -Infinity, Infinity); }
      catch (err) { if (err !== BUDGET_STOP) { throw err; } cutoff = true; break; }
      finally { XQ.unmakeMove(board, m, cap); }
      sc += Math.random() * 4 - 2;     // 微小随机避免走法死板
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    return { move: best || ord[0].m, score: best ? bestScore : (side === 'r' ? 1 : -1) * evalBoard(board), nodes: nodeCount, elapsedMs: Date.now() - startTime, cutoff: cutoff };
  }

  var XQAI = {
    evalBoard: evalBoard,
    bestMove: bestMove,
    NODE_BUDGET: NODE_BUDGET,
    TIME_BUDGET_MS: TIME_BUDGET_MS
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = XQAI; }
  root.XQAI = XQAI;
})(typeof window !== 'undefined' ? window : globalThis);

