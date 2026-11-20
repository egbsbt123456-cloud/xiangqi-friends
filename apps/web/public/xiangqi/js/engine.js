/* 中国象棋规则引擎（纯逻辑，零 DOM 依赖）
 * 浏览器：window.XQ；Node：module.exports
 *
 * 坐标约定：col 0-8 从红方视角左→右；row 0-9，row 0 为红方底线（显示在棋盘下方），
 * row 9 为黑方底线。河界在 row 4/5 之间。红宫 rows 0-2 cols 3-5，黑宫 rows 7-9 cols 3-5。
 */
(function (root) {
  'use strict';

  var RED = 'r', BLACK = 'b';

  var NAMES = {
    rK: '帅', rA: '仕', rB: '相', rN: '马', rR: '车', rC: '炮', rP: '兵',
    bK: '将', bA: '士', bB: '象', bN: '马', bR: '车', bC: '炮', bP: '卒'
  };

  var VALUES = { K: 10000, R: 900, C: 450, N: 400, B: 200, A: 200, P: 100 };

  function sideOf(p) { return p ? p.charAt(0) : null; }
  function typeOf(p) { return p ? p.charAt(1) : null; }
  function opp(side) { return side === RED ? BLACK : RED; }
  function onBoard(r, c) {
    return Number.isInteger(r) && Number.isInteger(c) &&
           r >= 0 && r < 10 && c >= 0 && c < 9;
  }
  function insidePalace(side, r, c) {
    if (c < 3 || c > 5) { return false; }
    return side === RED ? (r >= 0 && r <= 2) : (r >= 7 && r <= 9);
  }

  function emptyBoard() {
    var b = [], r, c;
    for (r = 0; r < 10; r++) {
      b.push([]);
      for (c = 0; c < 9; c++) { b[r].push(null); }
    }
    return b;
  }

  function initialBoard() {
    var b = emptyBoard();
    var back = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R'], c;
    for (c = 0; c < 9; c++) {
      b[0][c] = 'r' + back[c];
      b[9][c] = 'b' + back[c];
    }
    b[2][1] = 'rC'; b[2][7] = 'rC';
    b[7][1] = 'bC'; b[7][7] = 'bC';
    for (c = 0; c < 9; c += 2) {
      b[3][c] = 'rP';
      b[6][c] = 'bP';
    }
    return b;
  }

  function cloneBoard(b) {
    return b.map(function (row) { return row.slice(); });
  }

  /* ---------------- 走子生成（伪合法，不含己方王安全过滤） ---------------- */

  function pseudoMoves(board, r, c) {
    if (!onBoard(r, c) || !board || !Array.isArray(board[r])) { return []; }
    var p = board[r][c], out = [], t, i;
    if (!p) { return out; }
    var side = sideOf(p), type = typeOf(p);
    var push = function (rr, cc) {
      if (onBoard(rr, cc)) {
        var q = board[rr][cc];
        if (!q || sideOf(q) !== side) { out.push({ r: rr, c: cc }); }
      }
    };

    if (type === 'K') {
      push(r + 1, c); push(r - 1, c); push(r, c + 1); push(r, c - 1);
      // 目标必须仍在己方九宫（push 只查了棋盘边界，这里再过滤）
      out = out.filter(function (m) { return insidePalace(side, m.r, m.c); });
    } else if (type === 'A') {
      push(r + 1, c + 1); push(r + 1, c - 1); push(r - 1, c + 1); push(r - 1, c - 1);
      out = out.filter(function (m) { return insidePalace(side, m.r, m.c); });
    } else if (type === 'B') {
      var deltas = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
      for (i = 0; i < deltas.length; i++) {
        t = deltas[i];
        var mr = r + t[0] / 2, mc = c + t[1] / 2;
        var tr = r + t[0], tc = c + t[1];
        if (!onBoard(tr, tc) || board[mr][mc]) { continue; }
        // 象不可过河：红象 row<=4，黑象 row>=5
        if (side === RED ? tr > 4 : tr < 5) { continue; }
        push(tr, tc);
      }
    } else if (type === 'N') {
      var jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      for (i = 0; i < jumps.length; i++) {
        var dr = jumps[i][0], dc = jumps[i][1];
        var legR = Math.abs(dr) === 2 ? r + dr / 2 : r;
        var legC = Math.abs(dc) === 2 ? c + dc / 2 : c;
        if (!onBoard(r + dr, c + dc)) { continue; }
        if (board[legR][legC]) { continue; } // 蹩马腿
        push(r + dr, c + dc);
      }
    } else if (type === 'R') {
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (i = 0; i < dirs.length; i++) {
        var rr = r + dirs[i][0], cc = c + dirs[i][1];
        while (onBoard(rr, cc)) {
          var q = board[rr][cc];
          if (!q) { out.push({ r: rr, c: cc }); }
          else {
            if (sideOf(q) !== side) { out.push({ r: rr, c: cc }); }
            break;
          }
          rr += dirs[i][0]; cc += dirs[i][1];
        }
      }
    } else if (type === 'C') {
      var cdirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (i = 0; i < cdirs.length; i++) {
        var cr = r + cdirs[i][0], ccc = c + cdirs[i][1], jumped = false;
        while (onBoard(cr, ccc)) {
          var cq = board[cr][ccc];
          if (!jumped) {
            if (!cq) { out.push({ r: cr, c: ccc }); }
            else { jumped = true; } // 炮架
          } else {
            if (cq) {
              if (sideOf(cq) !== side) { out.push({ r: cr, c: ccc }); } // 隔子吃
              break;
            }
          }
          cr += cdirs[i][0]; ccc += cdirs[i][1];
        }
      }
    } else if (type === 'P') {
      var fwd = side === RED ? 1 : -1;
      push(r + fwd, c);
      // 过河后（红 row>=5，黑 row<=4）可横走一步
      if (side === RED ? r >= 5 : r <= 4) {
        push(r, c + 1); push(r, c - 1);
      }
    }
    return out;
  }

  /* ---------------- 王安全 / 将军 / 照面 ---------------- */

  function findKing(board, side) {
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = board[r][c];
        if (p === side + 'K') { return { r: r, c: c }; }
      }
    }
    return null;
  }

  function attacked(board, tr, tc, bySide) {
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = board[r][c];
        if (!p || sideOf(p) !== bySide) { continue; }
        var ms = pseudoMoves(board, r, c);
        for (var i = 0; i < ms.length; i++) {
          if (ms[i].r === tr && ms[i].c === tc) { return true; }
        }
      }
    }
    return false;
  }

  // 将帅照面（同一列且中间无子）
  function kingsFace(board) {
    var rk = findKing(board, RED), bk = findKing(board, BLACK);
    if (!rk || !bk || rk.c !== bk.c) { return false; }
    for (var r = Math.min(rk.r, bk.r) + 1; r < Math.max(rk.r, bk.r); r++) {
      if (board[r][rk.c]) { return false; }
    }
    return true;
  }

  function kingSafe(board, side) {
    var k = findKing(board, side);
    if (!k) { return false; }
    if (attacked(board, k.r, k.c, opp(side))) { return false; }
    if (kingsFace(board)) { return false; }
    return true;
  }

  function inCheck(board, side) { return !kingSafe(board, side); }

  /* ---------------- 合法着法 ---------------- */

  function movesFor(board, r, c) {
    if (!onBoard(r, c) || !board || !Array.isArray(board[r])) { return []; }
    var p = board[r][c], out = [];
    if (!p) { return out; }
    var side = sideOf(p);
    var ps = pseudoMoves(board, r, c);
    for (var i = 0; i < ps.length; i++) {
      var t = ps[i], cap = board[t.r][t.c];
      board[t.r][t.c] = p; board[r][c] = null;
      if (kingSafe(board, side)) {
        out.push({ fr: r, fc: c, tr: t.r, tc: t.c });
      }
      board[r][c] = p; board[t.r][t.c] = cap;
    }
    return out;
  }

  function legalMoves(board, side) {
    var out = [];
    for (var r = 0; r < 10; r++) {
      for (var c = 0; c < 9; c++) {
        var p = board[r][c];
        if (p && sideOf(p) === side) {
          var ms = movesFor(board, r, c);
          for (var i = 0; i < ms.length; i++) { out.push(ms[i]); }
        }
      }
    }
    return out;
  }

  /* ---------------- 走子 / 撤销 ---------------- */

  function makeMove(board, m) {
    var captured = board[m.tr][m.tc];
    board[m.tr][m.tc] = board[m.fr][m.fc];
    board[m.fr][m.fc] = null;
    return captured;
  }

  function unmakeMove(board, m, captured) {
    board[m.fr][m.fc] = board[m.tr][m.tc];
    board[m.tr][m.tc] = captured || null;
  }

  function applyMove(board, m) {
    var nb = cloneBoard(board);
    makeMove(nb, m);
    return nb;
  }

  /* ---------------- 终局判定 ---------------- */

  function gameStatus(board, sideToMove) {
    var moves = legalMoves(board, sideToMove);
    if (moves.length > 0) { return { over: false, winner: null, reason: null }; }
    return {
      over: true,
      winner: opp(sideToMove),
      reason: inCheck(board, sideToMove) ? 'checkmate' : 'stalemate'
    };
  }

  /* ---------------- 对局状态 + 统一走子入口（P1-04） ---------------- */

  // 状态对象：联机/单机共用的唯一权威形态。
  // board 只能通过 safeApplyMove 产生的新状态替换，禁止原地修改。
  function createInitialState() {
    return {
      board: initialBoard(),
      turn: RED,
      over: false, winner: null, reason: null,
      version: 0,          // 联机走棋协议的 expectedVersion
      lastMove: null
    };
  }

  // 返回 { ok: true, state: 新状态 } 或 { ok: false, code: 错误码 }
  // 错误码：GAME_OVER / NOT_YOUR_TURN / BAD_COORDS / NOT_YOUR_PIECE / ILLEGAL_MOVE
  function safeApplyMove(state, actorSide, move) {
    if (!state || state.over) { return { ok: false, code: 'GAME_OVER' }; }
    if ((state.turn !== RED && state.turn !== BLACK) ||
        !Number.isInteger(state.version) || state.version < 0 ||
        !Array.isArray(state.board) || state.board.length !== 10 ||
        !state.board.every(function (row) {
          return Array.isArray(row) && row.length === 9 && row.every(function (p) {
            return p === null || (typeof p === 'string' && /^[rb][KABNRCP]$/.test(p));
          });
        })) { return { ok: false, code: 'BAD_STATE' }; }
    if (actorSide !== state.turn) { return { ok: false, code: 'NOT_YOUR_TURN' }; }
    if (!move ||
        !onBoard(move.fr, move.fc) || !onBoard(move.tr, move.tc)) {
      return { ok: false, code: 'BAD_COORDS' }; // onBoard 含 Number.isInteger
    }
    var piece = state.board[move.fr][move.fc];
    if (!piece || sideOf(piece) !== actorSide) {
      return { ok: false, code: 'NOT_YOUR_PIECE' };
    }
    var legal = false;
    var ms = movesFor(state.board, move.fr, move.fc);
    for (var i = 0; i < ms.length; i++) {
      if (ms[i].tr === move.tr && ms[i].tc === move.tc) { legal = true; break; }
    }
    if (!legal) { return { ok: false, code: 'ILLEGAL_MOVE' }; }

    var nb = applyMove(state.board, move); // clone + 落子，不动原棋盘
    var st = gameStatus(nb, opp(state.turn));
    return {
      ok: true,
      state: {
        board: nb,
        turn: opp(state.turn),
        over: st.over, winner: st.winner, reason: st.reason,
        version: state.version + 1,
        lastMove: { fr: move.fr, fc: move.fc, tr: move.tr, tc: move.tc }
      }
    };
  }

  var XQ = {
    RED: RED, BLACK: BLACK,
    NAMES: NAMES, VALUES: VALUES,
    sideOf: sideOf, typeOf: typeOf, opp: opp,
    onBoard: onBoard, insidePalace: insidePalace,
    emptyBoard: emptyBoard, initialBoard: initialBoard, cloneBoard: cloneBoard,
    pseudoMoves: pseudoMoves,
    findKing: findKing, attacked: attacked, kingsFace: kingsFace,
    kingSafe: kingSafe, inCheck: inCheck,
    movesFor: movesFor, legalMoves: legalMoves,
    makeMove: makeMove, unmakeMove: unmakeMove, applyMove: applyMove,
    gameStatus: gameStatus,
    createInitialState: createInitialState, safeApplyMove: safeApplyMove
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = XQ; }
  root.XQ = XQ;
})(typeof window !== 'undefined' ? window : globalThis);
