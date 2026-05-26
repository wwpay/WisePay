// 수정: 2026-05-26 22:55 — Undo/Redo 기능 구현 (undo.js 신규)
'use strict';

const UNDO_MAX = 50;
const SS_UNDO  = 'wisepay_undo';
const SS_REDO  = 'wisepay_redo';

let undoStack = [];
let redoStack = [];

// ── sessionStorage 백업/복원 ──

function _saveToSession() {
  try {
    sessionStorage.setItem(SS_UNDO, JSON.stringify(undoStack));
    sessionStorage.setItem(SS_REDO, JSON.stringify(redoStack));
  } catch(e) {}
}

function initUndo() {
  try {
    const u = sessionStorage.getItem(SS_UNDO);
    const r = sessionStorage.getItem(SS_REDO);
    if (u) undoStack = JSON.parse(u);
    if (r) redoStack = JSON.parse(r);
  } catch(e) {}
}

// ── 외부 API ──

function pushAction(action) {
  undoStack.push(action);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack = [];
  _saveToSession();
}

function insertSaveMarker() {
  undoStack.push({ type: 'SAVE_MARKER' });
  _saveToSession();
}

// undoStack 최상단이 SAVE_MARKER이면 저장 완료 상태
function hasUnsavedChanges() {
  if (!undoStack.length) return false;
  return undoStack[undoStack.length - 1].type !== 'SAVE_MARKER';
}

// ── 내부 유틸 ──

function _normVal(v) {
  const n = parseInt(String(v == null ? '0' : v).replace(/,/g, '')) || 0;
  return n === 0 ? '' : n.toLocaleString();
}

function _findEmpIdxByNo(empNo) {
  return employees.findIndex(e => String(e.no) === String(empNo));
}

// ── 적용/복원 ──

function _applyEdit(change, value) {
  const empIdx = _findEmpIdxByNo(change.empNo);
  if (empIdx < 0) return;

  if (currentEmpIdx !== empIdx || currentYear !== change.year || currentMonth !== change.month) {
    currentEmpIdx = empIdx;
    currentYear   = change.year;
    currentMonth  = change.month;
    loadPayrollForm();
  }

  const el = document.getElementById(change.col);
  if (!el) return;
  el.value = _normVal(value);
  markPayrollDirty();
  recalc();
}

function _restoreEmployee(empNo, snapshot) {
  const idx = _findEmpIdxByNo(empNo);
  if (idx >= 0) {
    employees[idx] = { ...snapshot, deleted: false };
  } else {
    employees.push({ ...snapshot, deleted: false });
  }
  localStorage.setItem(LS.emp, JSON.stringify(employees));
  renderEmpSelect();
  renderEmpList();
}

function _softDeleteEmployee(empNo) {
  const idx = _findEmpIdxByNo(empNo);
  if (idx < 0) return;
  employees[idx] = { ...employees[idx], deleted: true };
  if (currentEmpIdx === idx) {
    currentEmpIdx = -1;
    loadPayrollForm();
  }
  localStorage.setItem(LS.emp, JSON.stringify(employees));
  renderEmpSelect();
  renderEmpList();
}

function _revertAction(action) {
  switch (action.type) {
    case 'edit':
      _applyEdit(action, action.before);
      break;
    case 'addRow':
      _softDeleteEmployee(action.empNo);
      break;
    case 'deleteEmployee':
      _restoreEmployee(action.empNo, action.snapshot);
      break;
    case 'bulkEdit':
      (action.changes || []).forEach(c => _applyEdit(c, c.before));
      break;
  }
}

function _doAction(action) {
  switch (action.type) {
    case 'edit':
      _applyEdit(action, action.after);
      break;
    case 'addRow':
      _restoreEmployee(action.empNo, action.snapshot);
      break;
    case 'deleteEmployee':
      _softDeleteEmployee(action.empNo);
      break;
    case 'bulkEdit':
      (action.changes || []).forEach(c => _applyEdit(c, c.after));
      break;
  }
}

// ── undo / redo ──

function undo() {
  while (undoStack.length > 0) {
    const action = undoStack.pop();
    redoStack.push(action);
    if (action.type === 'SAVE_MARKER') continue;
    _revertAction(action);
    _saveToSession();
    showToast(LANG === 'JP' ? '元に戻しました' : '실행 취소됨', 's');
    return true;
  }
  _saveToSession();
  showToast(LANG === 'JP' ? 'これ以上元に戻せません' : '더 이상 취소할 수 없습니다', 'w');
  return false;
}

function redo() {
  while (redoStack.length > 0) {
    const action = redoStack.pop();
    undoStack.push(action);
    if (action.type === 'SAVE_MARKER') continue;
    _doAction(action);
    _saveToSession();
    showToast(LANG === 'JP' ? 'やり直しました' : '다시 실행됨', 's');
    return true;
  }
  _saveToSession();
  showToast(LANG === 'JP' ? 'やり直せる操作がありません' : '다시 실행할 작업이 없습니다', 'w');
  return false;
}
