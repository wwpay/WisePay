// 수정: 2026-05-22 14:20 — normalizeDate 함수 추가
'use strict';

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function showToast(msg, type = '') {
  let el = document.getElementById('showToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'showToast';
    el.className = 'showToast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'showToast show ' + type;
  setTimeout(() => {
    el.className = 'showToast ' + type;
  }, 2600);
}

function fmt(n) {
  return Math.round(n).toLocaleString('ja-JP');
}

// Google Sheets가 "2026-04"를 날짜로 변환해 ISO 문자열로 돌려줄 때 정규화
function normalizeYM(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  } catch(e) {}
  const match = s.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : s;
}

// ISO 날짜 문자열 → YYYY-MM-DD (예: '1973-07-18T15:00:00.000Z' → '1973-07-18')
function normalizeDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function fmtYM(ym) {
  const norm = normalizeYM(ym);
  if (!norm) return ym || '';
  const [y, m] = norm.split('-');
  return LANG === 'JP' ? `${y}年${parseInt(m)}月` : `${y}년 ${parseInt(m)}월`;
}
