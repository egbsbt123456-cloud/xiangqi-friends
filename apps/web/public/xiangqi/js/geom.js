/* 视图坐标 ↔ 引擎坐标（P1-01 / P0-01）——纯逻辑模块
 *
 * 引擎坐标：row 0 = 红方底线，row 9 = 黑方底线，col 0-8 从红方左侧起。
 * 视图坐标：vr 0-9 从屏幕上→下，vc 0-8 从屏幕左→右。
 *
 * 默认（flipped=false，红方在下）：红底线 row 0 显示在屏幕底部 → vr = 9 - r，
 * 红左侧 col 0 显示在屏幕左 → vc = c。
 * 翻转（flipped=true，黑方在下）：整体旋转 180° → vr = r，vc = 8 - c。
 * 翻转只影响渲染与点击映射，绝不修改真实棋盘数组。
 */
(function (root) {
  'use strict';

  var M = 30;        // 棋盘边距（与 SVG viewBox 460x510 匹配）
  var CELL = 50;     // 交叉点间距
  var TOL = 0.44;    // 点击容差（交叉点 0.44 格以内才算点中）

  function viewRow(r, flipped) { return flipped ? r : 9 - r; }
  function viewCol(c, flipped) { return flipped ? 8 - c : c; }

  // 视图格 → 引擎格（getCellFromClick 的核心换算）
  function engineFromView(vr, vc, flipped) {
    return {
      r: flipped ? vr : 9 - vr,
      c: flipped ? 8 - vc : vc
    };
  }

  // SVG 局部坐标 → 引擎格；未命中任何交叉点返回 null
  function cellFromLocal(x, y, flipped) {
    if (typeof x !== 'number' || typeof y !== 'number' ||
        !isFinite(x) || !isFinite(y)) { return null; }
    var rawRow = (y - M) / CELL;
    var rawCol = (x - M) / CELL;
    var vr = Math.round(rawRow);
    var vc = Math.round(rawCol);
    if (vr < 0 || vr > 9 || vc < 0 || vc > 8) { return null; }
    if (Math.abs(rawRow - vr) > TOL || Math.abs(rawCol - vc) > TOL) { return null; }
    return engineFromView(vr, vc, flipped);
  }

  var XQG = {
    M: M, CELL: CELL, TOL: TOL,
    viewRow: viewRow, viewCol: viewCol,
    engineFromView: engineFromView, cellFromLocal: cellFromLocal
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = XQG; }
  root.XQG = XQG;
})(typeof window !== 'undefined' ? window : globalThis);
