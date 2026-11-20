/* 中文记谱（P1-02）——纯逻辑模块，浏览器 window.XQN / Node module.exports
 *
 * 规则（依据中国象棋现行记谱惯例）：
 * - 纵线编号：红方从红方右侧数「一~九」，黑方从黑方右侧数「1~9」；
 *   引擎坐标 col 0-8 从红方左侧起 → 红路数 = 9-col，黑路数 = col+1。
 * - 红「进」= row 增大（向黑方），黑「进」= row 减小（向红方）；同 row 为「平」。
 * - 直行子（车炮兵将帅）进退记步数；斜行子（马相象士）进退记目标纵线。
 * - 同一纵线存在多个同类同色棋子时，改用「前/中/后 + 棋子名」；
 *   红「前」= row 大（靠黑方），黑「前」= row 小（靠红方）。
 * - 红用汉字数字，黑用阿拉伯数字（传统谱惯例，便于区分双方）。
 *
 * 重要：notation() 必须用【走子前】的棋盘调用。
 */
(function (root) {
  'use strict';

  var XQ = (typeof window !== 'undefined') ? window.XQ : require('./engine.js');

  var CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九']; // 红方数字
  var AR = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];          // 黑方数字

  function redFile(c) { return CN[8 - c]; }   // 红路数：col0=九 … col8=一
  function blackFile(c) { return AR[c]; }     // 黑路数：col0=1 … col8=9

  // 求与走子者同色同类且同纵线的所有 row（含走子者本身）
  function sameFileRows(boardBefore, piece, fc) {
    var rows = [];
    for (var r = 0; r < 10; r++) {
      if (boardBefore[r][fc] === piece) { rows.push(r); }
    }
    return rows;
  }

  function notation(boardBefore, move) {
    if (!boardBefore || !move) { return null; }
    var piece = boardBefore[move.fr] && boardBefore[move.fr][move.fc];
    if (!piece) { return null; }

    var side = XQ.sideOf(piece);
    var type = XQ.typeOf(piece);
    var name = XQ.NAMES[piece];
    var fileFn = (side === XQ.RED) ? redFile : blackFile;
    var numFn = (side === XQ.RED) ? CN : AR;

    // 头段：棋子名 + 纵线，或同线判重时的 前/中/后 + 棋子名
    var head;
    var same = sameFileRows(boardBefore, piece, move.fc);
    if (same.length > 1) {
      same.sort(function (a, b) { return side === XQ.RED ? b - a : a - b; }); // 靠对方者在前
      var idx = same.indexOf(move.fr);
      if (same.length === 2) {
        head = (idx === 0 ? '前' : '后') + name;
      } else if (same.length === 3) {
        head = (idx === 0 ? '前' : (idx === 1 ? '中' : '后')) + name;
      } else { // 4+ 个同类同线（极端罕见）
        head = (idx === 0 ? '前' : (idx === same.length - 1 ? '后' : CN[idx])) + name;
      }
    } else {
      head = name + fileFn(move.fc);
    }

    // 尾段：动词 + 目标
    var forward = (side === XQ.RED)
      ? move.tr > move.fr     // 红进：row 增大
      : move.tr < move.fr;    // 黑进：row 减小
    var verb, dest;
    if (move.tr === move.fr) {
      verb = '平';
      dest = fileFn(move.tc);
    } else if (type === 'N' || type === 'B' || type === 'A') {
      // 斜行子：马相象士进退均记目标纵线
      verb = forward ? '进' : '退';
      dest = fileFn(move.tc);
    } else {
      // 直行子：车炮兵将帅进退记步数
      verb = forward ? '进' : '退';
      dest = numFn[Math.abs(move.tr - move.fr) - 1];
    }
    return head + verb + dest;
  }

  var XQN = {
    notation: notation,
    redFile: redFile,
    blackFile: blackFile
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = XQN; }
  root.XQN = XQN;
})(typeof window !== 'undefined' ? window : globalThis);
