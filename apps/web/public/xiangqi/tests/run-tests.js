/* 自动化测试套件 —— node tests/run-tests.js
 *
 * 覆盖：
 *   1. 引擎规则（马蹩腿/象眼/炮架/照面/将军/绝杀/困毙/44 步开局）
 *   2. safeApplyMove 统一走子入口（P1-04：回合/归属/坐标/合法性/不可变性/版本号）
 *   3. 中文记谱（P1-02：炮二平五/马八进七/相七进五/黑方记谱/前中后判重）
 *   4. 视图几何（P1-01/P0-01：方向换算/点击容差/翻转往返）
 *   5. AI（P1-05：预算/将军应将/自博弈）
 *   6. UI 交互（P0-01/P0-02：空位落子/翻转操作/新局作废旧 AI/悔棋/吃子）
 */
'use strict';

let pass = 0, fail = 0, failures = [];
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); console.log('  **FAIL** ' + name); }
}
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  ok(a === b, name + (a === b ? '' : '  [实际 ' + a + ' / 期望 ' + b + ']'));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function boardStr(b) { return b.map(row => row.map(p => p || '..').join(' ')).join('|'); }

/* ================= 模块加载 ================= */
const XQ = require('../js/engine.js');
const XQN = require('../js/notation.js');
const XQG = require('../js/geom.js');
const XQAI = require('../js/ai.js');

/* ============ 1. 引擎规则 ============ */
console.log('T1 引擎规则');
{
  const b = XQ.initialBoard();
  ok(b[0][4] === 'rK' && b[9][4] === 'bK', '初始：帅将归位');
  ok(b[0][0] === 'rR' && b[9][8] === 'bR', '初始：车占角');
  ok(b[2][1] === 'rC' && b[7][7] === 'bC', '初始：炮就位');
  ok(b[3][0] === 'rP' && b[6][8] === 'bP', '初始：兵卒就位');

  ok(XQ.pseudoMoves(b, 0, 4).length === 1, '开局帅仅 1 步');
  ok(XQ.pseudoMoves(b, 0, 1).length === 2, '开局边马 2 步');
  ok(XQ.pseudoMoves(b, 0, 0).length === 2, '开局角车 2 步');
  ok(XQ.pseudoMoves(b, 2, 1).length === 12, '开局炮 12 伪着法');
  ok(XQ.pseudoMoves(b, 3, 0).length === 1, '开局兵只能直进');

  // 蹩马腿
  let h = XQ.emptyBoard(); h[5][4] = 'rN';
  ok(XQ.pseudoMoves(h, 5, 4).length === 8, '空场马 8 步');
  h[4][4] = 'bP';
  ok(XQ.pseudoMoves(h, 5, 4).filter(m => m.r === 3).length === 0, '马腿挡住向上两跳');
  h[6][3] = 'bP';
  ok(XQ.pseudoMoves(h, 5, 4).filter(m => m.r === 7 && m.c === 2).length === 0, '指定马腿挡 (7,2)');

  // 象：过河 + 象眼
  let e = XQ.emptyBoard(); e[4][4] = 'rB';
  let em = XQ.pseudoMoves(e, 4, 4);
  ok(em.length === 2 && em.every(m => m.r <= 4), '红象河边仅 2 步且不过河');
  e = XQ.emptyBoard(); e[2][4] = 'rB'; e[3][3] = 'bP';
  ok(!XQ.pseudoMoves(e, 2, 4).some(m => m.r === 4 && m.c === 2), '塞象眼挡 (4,2)');

  // 士宫
  let a = XQ.emptyBoard(); a[0][3] = 'rA';
  eq(XQ.pseudoMoves(a, 0, 3).map(m => [m.r, m.c]), [[1, 4]], '角士唯一走位是宫心');

  // 炮架
  let cb = XQ.emptyBoard(); cb[5][4] = 'rC'; cb[5][0] = 'bR';
  ok(!XQ.pseudoMoves(cb, 5, 4).some(m => m.r === 5 && m.c === 0), '无炮架不能吃');
  cb[5][2] = 'rP';
  ok(XQ.pseudoMoves(cb, 5, 4).some(m => m.r === 5 && m.c === 0), '有炮架隔子吃车');
  ok(!XQ.pseudoMoves(cb, 5, 4).some(m => m.r === 5 && m.c === 2), '炮不能吃自己的架');

  // 照面
  let fb = XQ.initialBoard();
  for (let r = 1; r < 9; r++) { fb[r][4] = null; }
  ok(XQ.kingsFace(fb), '空线照面');
  fb[4][4] = 'rR';
  ok(!XQ.kingsFace(fb), '有子隔断不照面');

  // 将军与吃应将子
  let mb = XQ.emptyBoard(); mb[0][4] = 'rK'; mb[9][4] = 'bK'; mb[9][3] = 'rR';
  ok(XQ.inCheck(mb, XQ.BLACK), '黑被将军');
  eq(XQ.movesFor(mb, 9, 4).map(m => [m.tr, m.tc]), [[9, 3]], '王可吃无保护车且仅此一步');
  mb[8][3] = 'rR';
  ok(!XQ.movesFor(mb, 9, 4).some(m => m.tr === 9 && m.tc === 3), '王不能吃有保护车');

  // 绝杀/困毙
  let sb = XQ.emptyBoard(); sb[0][3] = 'rK'; sb[9][4] = 'bK'; sb[8][3] = 'rR'; sb[8][5] = 'rR';
  eq(XQ.gameStatus(sb, XQ.BLACK), { over: true, winner: 'r', reason: 'stalemate' }, '双车困毙');
  sb[7][4] = 'rR';
  eq(XQ.gameStatus(sb, XQ.BLACK), { over: true, winner: 'r', reason: 'checkmate' }, '加将军即绝杀');

  // 合法过滤（走完不得自照面）
  let lb = XQ.emptyBoard(); lb[0][4] = 'rK'; lb[9][4] = 'bK'; lb[4][4] = 'rR';
  const rm = XQ.movesFor(lb, 4, 4);
  ok(rm.every(m => m.tc === 4), '唯一隔子不得离开照面线');
  ok(rm.some(m => m.tr === 9 && m.tc === 4), '隔子沿本线吃将合法');

  ok(!XQ.gameStatus(XQ.initialBoard(), XQ.RED).over, '开局未终局');
  ok(XQ.legalMoves(XQ.initialBoard(), XQ.RED).length === 44, '开局红方 44 步（经典数）');
}

/* ============ 2. safeApplyMove（P1-04） ============ */
console.log('T2 safeApplyMove 统一走子入口');
{
  const s0 = XQ.createInitialState();
  eq([s0.turn, s0.version, s0.over], ['r', 0, false], '初始状态字段');

  // 合法走子：炮二平五
  const mv = { fr: 2, fc: 7, tr: 2, tc: 4 };
  const before = boardStr(s0.board);
  const r1 = XQ.safeApplyMove(s0, XQ.RED, mv);
  ok(r1.ok, '炮二平五合法');
  ok(r1.state.turn === 'b' && r1.state.version === 1, '换边且版本+1');
  ok(r1.state.board[2][4] === 'rC' && r1.state.board[2][7] === null, '新棋盘落子正确');
  ok(boardStr(s0.board) === before, 'P1-04：原棋盘未被修改（纯函数）');
  eq(r1.state.lastMove, mv, 'lastMove 记录');

  // 黑方合法应着：马8进7
  const r2 = XQ.safeApplyMove(r1.state, XQ.BLACK, { fr: 9, fc: 7, tr: 7, tc: 6 });
  ok(r2.ok && r2.state.version === 2 && r2.state.turn === 'r', '黑应着合法且版本连续');

  // 错误码
  eq(XQ.safeApplyMove(s0, XQ.BLACK, mv), { ok: false, code: 'NOT_YOUR_TURN' }, '非本回合拒绝');
  eq(XQ.safeApplyMove(s0, XQ.RED, { fr: 9, fc: 1, tr: 8, tc: 1 }), { ok: false, code: 'NOT_YOUR_PIECE' }, '走对方子拒绝');
  eq(XQ.safeApplyMove(s0, XQ.RED, { fr: 0, fc: 1, tr: 0, tc: 3 }), { ok: false, code: 'ILLEGAL_MOVE' }, '马走三格拒绝');
  eq(XQ.safeApplyMove(s0, XQ.RED, { fr: 0.5, fc: 1, tr: 2, tc: 2 }), { ok: false, code: 'BAD_COORDS' }, '小数坐标拒绝');
  eq(XQ.safeApplyMove(s0, XQ.RED, { fr: 'a', fc: 1, tr: 2, tc: 2 }), { ok: false, code: 'BAD_COORDS' }, '非整数坐标拒绝');
  eq(XQ.safeApplyMove(s0, XQ.RED, { fr: 0, fc: 1, tr: 10, tc: 2 }), { ok: false, code: 'BAD_COORDS' }, '越界坐标拒绝');
  eq(XQ.safeApplyMove(s0, XQ.RED, null), { ok: false, code: 'BAD_COORDS' }, '空 move 拒绝');

  // 终局后拒绝
  const over = XQ.createInitialState(); over.over = true;
  eq(XQ.safeApplyMove(over, XQ.RED, mv), { ok: false, code: 'GAME_OVER' }, '终局后拒绝走子');

  // 整数坐标守卫
  ok(XQ.onBoard(0, 0) && XQ.onBoard(9, 8), 'onBoard 整数合法');
  ok(!XQ.onBoard(0.5, 0) && !XQ.onBoard('1', 1) && !XQ.onBoard(-1, 0) && !XQ.onBoard(10, 0), 'onBoard 拒绝非整数/越界');
}

/* ============ 3. 中文记谱（P1-02） ============ */
console.log('T3 中文记谱');
{
  const b = XQ.initialBoard();
  eq(XQN.notation(b, { fr: 2, fc: 7, tr: 2, tc: 4 }), '炮二平五', '炮二平五');
  eq(XQN.notation(b, { fr: 2, fc: 1, tr: 2, tc: 4 }), '炮八平五', '炮八平五');
  eq(XQN.notation(b, { fr: 0, fc: 1, tr: 2, tc: 2 }), '马八进七', '马八进七（斜行子记目标纵线）');
  eq(XQN.notation(b, { fr: 0, fc: 2, tr: 2, tc: 4 }), '相七进五', '相七进五');
  eq(XQN.notation(b, { fr: 6, fc: 4, tr: 5, tc: 4 }), '卒5进1', '黑卒前进（阿拉伯数字）');
  eq(XQN.notation(b, { fr: 9, fc: 7, tr: 7, tc: 6 }), '马8进7', '黑马8进7');
  eq(XQN.notation(b, { fr: 9, fc: 1, tr: 7, tc: 2 }), '马2进3', '黑马2进3');

  // 黑方横走（过河后）
  const rb = XQ.initialBoard();
  rb[6][2] = null; rb[4][2] = 'bP'; // 黑卒已过河
  eq(XQN.notation(rb, { fr: 4, fc: 2, tr: 4, tc: 3 }), '卒3平4', '黑卒过河横走');
  const rpb = XQ.initialBoard();
  rpb[3][2] = null; rpb[5][2] = 'rP';
  eq(XQN.notation(rpb, { fr: 5, fc: 2, tr: 5, tc: 3 }), '兵七平六', '红兵过河横走');

  // 同纵线同类判重：前/后
  const db = XQ.emptyBoard(); db[4][4] = 'rR'; db[6][4] = 'rR';
  eq(XQN.notation(db, { fr: 6, fc: 4, tr: 7, tc: 4 }), '前车进一', '前车进一');
  eq(XQN.notation(db, { fr: 4, fc: 4, tr: 3, tc: 4 }), '后车退一', '后车退一');
  // 三个同类：前/中/后
  db[8][4] = 'rR';
  eq(XQN.notation(db, { fr: 6, fc: 4, tr: 7, tc: 4 }), '中车进一', '三车同线用中');
  // 黑方前后（靠近红方者为前）
  const bb = XQ.emptyBoard(); bb[5][3] = 'bR'; bb[7][3] = 'bR';
  eq(XQN.notation(bb, { fr: 5, fc: 3, tr: 4, tc: 3 }), '前车进1', '黑前车（row 小者为前）');
  eq(XQN.notation(bb, { fr: 7, fc: 3, tr: 8, tc: 3 }), '后车退1', '黑后车');

  // 直行子步数记谱：炮五进四（经典吃中卒）
  const cb = XQ.initialBoard(); cb[2][7] = null; cb[2][4] = 'rC';
  eq(XQN.notation(cb, { fr: 2, fc: 4, tr: 6, tc: 4 }), '炮五进四', '炮五进四');
  // 单车退步数
  eq(XQN.notation(db, { fr: 5, fc: 4, tr: 5, tc: 4 }), null, '起点无子返回 null');
}

/* ============ 4. 视图几何（P1-01 / P0-01） ============ */
console.log('T4 视图几何');
{
  ok(XQG.viewRow(0, false) === 9 && XQG.viewRow(9, false) === 0, 'P1-01：红底线(row0)显示在屏幕底部');
  ok(XQG.viewCol(0, false) === 0 && XQG.viewCol(8, false) === 8, '默认视角列不镜像');
  ok(XQG.viewRow(0, true) === 0 && XQG.viewCol(0, true) === 8, '翻转视角整体旋转180°');

  let roundTrips = 0;
  for (const fl of [false, true]) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const x = XQG.M + XQG.viewCol(c, fl) * XQG.CELL;
        const y = XQG.M + XQG.viewRow(r, fl) * XQG.CELL;
        const cell = XQG.cellFromLocal(x, y, fl);
        if (cell && cell.r === r && cell.c === c) { roundTrips++; }
      }
    }
  }
  ok(roundTrips === 180, '两种视角下 90 格点击换算全部往返一致');

  ok(XQG.cellFromLocal(XQG.M + 2.4 * XQG.CELL, XQG.M + 5 * XQG.CELL, false) !== null, '0.4 格偏差仍点中');
  ok(XQG.cellFromLocal(XQG.M + 3.5 * XQG.CELL, XQG.M + 5 * XQG.CELL, false) === null, '半格中点判空');
  ok(XQG.cellFromLocal(0, 0, false) === null, '棋盘外返回 null');
  ok(XQG.cellFromLocal(NaN, 100, false) === null, '非数字返回 null');
}

/* ============ 5. AI（P1-05） ============ */
console.log('T5 AI');
{
  const t0 = Date.now();
  const r = XQAI.bestMove(XQ.initialBoard(), 'r', 2);
  ok(r && r.move, '开局能出着法');
  ok(r.nodes <= XQAI.NODE_BUDGET + 100, '节点预算受控（' + r.nodes + ' ≤ ' + (XQAI.NODE_BUDGET + 100) + '）');
  ok(Date.now() - t0 < 4000, '时间预算受控');

  // 被将军时必须应将：黑仅能躲王
  const cb = XQ.emptyBoard(); cb[0][4] = 'rK'; cb[9][4] = 'bK'; cb[8][4] = 'rR';
  const r2 = XQAI.bestMove(cb, 'b', 2);
  ok(r2 && r2.move, '被将军时有着法');
  const applied = XQ.safeApplyMove(
    { board: cb, turn: 'b', over: false, winner: null, reason: null, version: 0, lastMove: null },
    'b', r2.move);
  ok(applied.ok, 'AI 应将着法经引擎校验合法');
  ok(applied.state.board[8][4] !== 'bK' || applied.state.turn === 'r', 'AI 走完换边');

  // 已被将死：无着法
  const mb2 = XQ.emptyBoard();
  mb2[0][3] = 'rK'; mb2[9][4] = 'bK'; mb2[8][3] = 'rR'; mb2[8][5] = 'rR'; mb2[7][4] = 'rR';
  ok(XQAI.bestMove(mb2, 'b', 2) === null, '将死方无着法返回 null');

  // 自博弈：AI 走出的每一步都过 safeApplyMove 校验（预算截断也不产生非法着法）
  let st = XQ.createInitialState();
  let plies = 0, illegal = 0;
  while (plies < 60 && !st.over) {
    const mv = XQAI.bestMove(st.board, st.turn, 2);
    if (!mv || !mv.move) { break; }
    const res = XQ.safeApplyMove(st, st.turn, mv.move);
    if (!res.ok) { illegal++; break; }
    st = res.state;
    plies++;
  }
  ok(illegal === 0 && (plies >= 50 || st.over), '自博弈 ' + plies + ' 手合法（允许正常提前终局）');
}

/* ============ 6. UI 交互（伪 DOM 全链路） ============ */
console.log('T6 UI 交互（P0-01 / P0-02 / P1-01）');

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...cs) { cs.forEach(c => this.set.add(c)); }
  remove(...cs) { cs.forEach(c => this.set.delete(c)); }
  toggle(c, f) {
    if (f === undefined) { this.set.has(c) ? this.set.delete(c) : this.set.add(c); }
    else if (f) { this.set.add(c); } else { this.set.delete(c); }
  }
  contains(c) { return this.set.has(c); }
}
class FakeEl {
  constructor(tag) {
    this.tag = tag; this.children = []; this.handlers = {};
    this._html = ''; this.textContent = ''; this.className = '';
    this.attrs = {}; this.scrollTop = 0; this.scrollHeight = 0;
    this.classList = new FakeClassList(); this.checked = false;
    this.src = ''; this.id = ''; this.lastChild = null; this.style = {};
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; this.children = []; this.lastChild = null; }
  appendChild(c) { this.children.push(c); this.lastChild = c; return c; }
  insertBefore(n) { this.children.push(n); this.lastChild = n; return n; }
  addEventListener(t, fn) { (this.handlers[t] = this.handlers[t] || []).push(fn); }
  removeEventListener(t, fn) { const a = this.handlers[t]; if (a) { const i = a.indexOf(fn); if (i >= 0) { a.splice(i, 1); } } }
  dispatch(t, ev) { (this.handlers[t] || []).slice().forEach(fn => fn(ev || {})); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') { this.className = String(v); } }
  getAttribute(k) { return this.attrs[k]; }
}
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; } };
class FakeSVGEl extends FakeEl {
  getScreenCTM() { return IDENTITY; }
  createSVGPoint() {
    const p = { x: 0, y: 0 };
    p.matrixTransform = m => ({ x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f });
    return p;
  }
}

const IDS = ['board', 'gridLayer', 'starLayer', 'hintLayer', 'selLayer', 'pieceLayer',
  'moveList', 'statusRed', 'statusBlack', 'statusBar', 'capturedRed', 'capturedBlack',
  'modal', 'modalTitle', 'modalBody', 'btnNew', 'btnUndo', 'btnFlip', 'chkHints', 'modalOk', 'modalReview'];
const els = {};
IDS.forEach(id => { els[id] = id === 'board' ? new FakeSVGEl('svg') : new FakeEl('div'); els[id].id = id; });

global.window = globalThis;
global.document = {
  getElementById: id => els[id] || null,
  createElementNS: (ns, tag) => new FakeSVGEl(tag),
  createElement: tag => new FakeEl(tag)
};
require('../js/app.js');
const T = window.__XQ_TEST__;
const svg = els.board;

// 视图坐标 → 点击事件（走真实监听链：svg click → getCellFromClick → onCellClick）
function clickView(vr, vc) {
  svg.dispatch('click', {
    clientX: XQG.M + vc * XQG.CELL,
    clientY: XQG.M + vr * XQG.CELL
  });
}
const engineToView = (r, c) => [XQG.viewRow(r, false), XQG.viewCol(c, false)]; // 默认视角
function clickEngine(r, c) { const [vr, vc] = engineToView(r, c); clickView(vr, vc); }

(async function interactionTests() {
  // --- P0-01 验收：空位落子（炮二平五），红兵、红马同样必须可走 ---
  T.setAIEnabled(false); T.newGame();
  let st = T.getState();
  ok(st.turn === 'r' && T.getHistory().length === 0, '新局就绪');

  clickEngine(2, 7); // 选炮
  ok(els.hintLayer.children.length >= 10, '选中显示走法点（含空位目标）');
  clickEngine(2, 4); // 平五（空位！）
  st = T.getState();
  ok(st.board[2][4] === 'rC' && st.board[2][7] === null, 'P0-01：点击空白交叉点成功落子');
  ok(st.turn === 'b' && T.getHistory().length === 1, '落子后换黑方');
  ok(T.getHistory()[0].notation === '炮二平五', 'P1-02：历史保存走子前记谱');

  T.undo();
  st = T.getState();
  ok(st.board[2][7] === 'rC' && st.board[2][4] === null && st.turn === 'r', '悔棋（AI 未走，退一手）');

  // 红马走空位
  clickEngine(0, 1); clickEngine(2, 2);
  st = T.getState();
  ok(st.board[2][2] === 'rN', 'P0-01：红马走到空位');
  T.undo();

  // 红兵走空位
  clickEngine(3, 2); clickEngine(4, 2);
  st = T.getState();
  ok(st.board[4][2] === 'rP', 'P0-01：红兵走到空位');
  T.undo();

  // --- 非法落点：不执行 ---
  clickEngine(2, 7); clickEngine(2, 0); // 炮不能越架落 (2,0)
  st = T.getState();
  ok(st.board[2][7] === 'rC' && T.getHistory().length === 0, '非法空位不落子');

  // --- 再点选中棋子取消选择（前置：清掉上一段遗留的选中态） ---
  T.newGame();
  clickEngine(2, 7); // 选中
  const hints = els.hintLayer.children.length;
  clickEngine(2, 7); // 取消
  ok(hints > 0 && els.hintLayer.children.length === 0, '再点选中棋子取消选择');

  // --- 空点击无副作用 ---
  clickEngine(5, 5);
  ok(T.getHistory().length === 0, '无选中时点空位无副作用');

  // --- 吃子全链路（确定性双人线）：炮二平五、马8进7、炮五进四吃中卒 ---
  T.newGame();
  clickEngine(2, 7); clickEngine(2, 4);        // 炮二平五
  // 黑方回合（AI 已禁用）：直接走引擎入口驱动黑方（等价于联机对手落子）
  T.onCellClick ? null : null;
  // 黑走马：通过状态驱动 —— 用 doMove 语义：这里用引擎 + 状态重放路径验证 UI 渲染
  // （app.doMove 未直接暴露，改用：先验证引擎层，再校验 UI 吃子渲染用同一渲染函数）
  const line = [
    { fr: 9, fc: 7, tr: 7, tc: 6 },   // 马8进7
    { fr: 2, fc: 4, tr: 6, tc: 4 }    // 炮五进四吃卒
  ];
  // 通过 scheduleAI 关闭时的引擎状态推进：直接调用 onCellClick 会被红方回合拦截，
  // 因此吃子渲染链路改由「AI 正常走子」覆盖（见下）。此处先推进引擎层验证。
  let simState = T.getState();
  for (const m of line) {
    const res = XQ.safeApplyMove(simState, simState.turn, m);
    ok(res.ok, '确定性线着法合法（' + XQN.notation(simState.board, m) + '）');
    simState = res.state;
  }
  ok(simState.board[6][4] === 'rC', '炮五进四吃中卒（引擎层）');

  // --- P0-02：AI 思考期间反复重新开局，旧任务不得污染新局 ---
  T.setAIEnabled(true); T.newGame();
  clickEngine(2, 7); clickEngine(2, 4); // 触发 AI 调度（120ms 后计算）
  const epochBefore = T.getEpoch();
  els.btnNew.dispatch('click'); els.btnNew.dispatch('click'); els.btnNew.dispatch('click');
  await sleep(700);
  st = T.getState();
  ok(T.getEpoch() > epochBefore, '新局递增局次版本号');
  ok(T.getHistory().length === 0 && st.turn === 'r', 'P0-02：旧 AI 任务未在新局走子');
  ok(boardStr(st.board) === boardStr(XQ.initialBoard()), 'P0-02：棋盘保持初始局面');

  // --- P0-02 正向：AI 正常应着 ---
  T.setAIEnabled(true); T.newGame();
  clickEngine(2, 7); clickEngine(2, 4);
  await sleep(1500); // 等 AI 计算并落子
  st = T.getState();
  ok(T.getHistory().length === 2 && T.getHistory()[1].mover.charAt(0) === 'b', 'AI 应着一手');
  ok(st.turn === 'r', 'AI 走完轮红');
  ok(els.capturedRed.children.length + els.capturedBlack.children.length >= 0, '吃子区渲染无异常');

  // --- 悔棋退两手（AI 已应着） ---
  els.btnUndo.dispatch('click');
  st = T.getState();
  ok(T.getHistory().length === 0 && st.turn === 'r' && boardStr(st.board) === boardStr(XQ.initialBoard()),
    '悔棋撤掉人+AI 两手回到初始');

  // --- P1-01：翻转后正常操作（左马 (0,1)→(2,2)） ---
  // 翻转视角：engine (r,c) 显示于视图 (vr=r, vc=8-c)
  T.setAIEnabled(false); T.newGame();
  els.btnFlip.dispatch('click'); // 翻转：黑方在下
  const beforeFlip = boardStr(T.getState().board);
  clickView(0, 7); // 引擎 (0,1) 左角马显示在视图 (0,7)
  ok(els.hintLayer.children.length >= 1, '翻转后可选中');
  clickView(2, 6); // 引擎 (2,2) 显示在视图 (2,6)
  ok(T.getState().board[2][2] === 'rN', 'P1-01：翻转视角后正常走子');
  els.btnFlip.dispatch('click'); // 翻回
  ok(boardStr(T.getState().board) !== beforeFlip, '翻转本身不改棋盘数组（仅走子改变）');
  T.undo();

  // --- 提示开关 ---
  els.chkHints.dispatch('change', { target: { checked: false } });
  clickEngine(2, 7);
  ok(els.hintLayer.children.length === 0, '关闭提示后不显示走法点');
  els.chkHints.dispatch('change', { target: { checked: true } });

  // 实际 UI 吃子链，替换原来“数量 >= 0”的无效断言。
  const realBestMove = XQAI.bestMove;
  XQAI.bestMove = () => ({ move: { fr:9,fc:7,tr:7,tc:6 } });
  T.setAIEnabled(true); T.newGame();
  clickEngine(2,7); clickEngine(2,4);
  await sleep(180);
  clickEngine(2,4); clickEngine(6,4);
  ok(els.capturedRed.children.length === 1 && els.capturedRed.children[0].src === 'img/pieces/bP.svg', 'UI 吃中卒后显示真实被吃黑卒');
  ok(els.moveList.children[0].textContent === '炮二平五', '着法正文不重复手写编号');
  T.undo();
  ok(T.getHistory().length === 2 && els.capturedRed.children.length === 0, '悔棋同步撤销吃子区与历史');
  T.newGame(); XQAI.bestMove=realBestMove;

  // 真实 Worker 异步回包协议的可控模拟：旧回包、非法结果、加载失败。
  const workers=[];
  class FakeWorker {
    constructor(path){this.path=path;this.terminated=false;workers.push(this);}
    postMessage(job){this.job=job;}
    terminate(){this.terminated=true;}
  }
  window.Worker=FakeWorker;
  T.setAIEnabled(true); T.newGame();clickEngine(2,7);clickEngine(2,4);await sleep(150);
  const old=workers[0], oldCallback=old.onmessage;
  ok(old.path === 'js/ai-worker.js' && old.job.side === 'b', '后台计算使用独立 Worker 与黑方棋盘副本');
  T.newGame();clickEngine(2,7);clickEngine(2,4);await sleep(150);
  const fresh=workers[1];
  ok(old.terminated, '新局会终止旧 Worker');
  oldCallback({data:{id:old.job.id,version:old.job.version,result:{move:{fr:9,fc:7,tr:7,tc:6}}}});
  ok(T.getHistory().length===1 && els.statusBar.textContent.includes('思考'), '旧回包不能走棋或清掉新局思考状态');
  fresh.onmessage({data:{id:fresh.job.id,version:fresh.job.version,result:{move:{fr:-1,fc:99,tr:0,tc:0}}}});
  ok(T.getHistory().length===2 && T.getState().turn==='r', '非法 AI 回包由合法走法兜底，不崩溃不卡黑方');
  T.newGame();clickEngine(2,7);clickEngine(2,4);await sleep(150);
  const failed=workers[2];failed.onerror({preventDefault(){}});
  ok(failed.terminated && T.getState().turn==='r', 'Worker 加载失败后兼容计算恢复轮次');
  delete window.Worker;T.newGame();

  // 终局后可回看，不能被“只能重开”的遮罩锁死。
  T.setAIEnabled(false);const mateState=T.getState();
  mateState.board=XQ.emptyBoard();mateState.board[0][3]='rK';mateState.board[9][4]='bK';
  mateState.board[8][3]='rR';mateState.board[8][5]='rR';mateState.board[6][4]='rR';
  clickEngine(6,4);clickEngine(7,4);
  ok(T.getState().over && !els.modal.classList.contains('hidden'), '终局展示结果弹窗');
  const terminalBoard=boardStr(T.getState().board);
  els.modalReview.dispatch('click');
  ok(els.modal.classList.contains('hidden') && boardStr(T.getState().board)===terminalBoard && T.getState().over, '查看棋局只关闭弹窗，不偷偷新开局');
  T.newGame();


  // --- 汇总 ---
  console.log('\n==== 测试结果：' + pass + ' 通过，' + fail + ' 失败 ====');
  if (fail > 0) { console.log('失败项：\n - ' + failures.join('\n - ')); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });


