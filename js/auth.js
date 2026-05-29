// 수정: 2026-05-29 22:37 — viewer 차단 목록에 reinstateEmp, saveEmployee 추가
'use strict';

const AUTH_SESS_KEY = 'wisepay_session';
const AUTH_ID_KEY   = 'wisepay_saved_id';

let currentUser  = null; // { id, name, role, sessionType }
let _writeToken  = null; // admin 로그인 시만 설정, viewer는 null

const VIEWER_PAGES = new Set(['payroll', 'annual']);

async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function _getStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.sessionType === 'persistent' && s.expires && Date.now() < s.expires) return s;
      localStorage.removeItem(AUTH_SESS_KEY);
    }
  } catch(e) { localStorage.removeItem(AUTH_SESS_KEY); }
  try {
    const raw = sessionStorage.getItem(AUTH_SESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) { sessionStorage.removeItem(AUTH_SESS_KEY); }
  return null;
}

function _storeSession(user, wt) {
  const data = wt ? { ...user, _wt: wt } : { ...user };
  if (user.sessionType === 'persistent') {
    const midnight = new Date();
    midnight.setHours(23, 59, 59, 999);
    localStorage.setItem(AUTH_SESS_KEY, JSON.stringify({ ...data, expires: midnight.getTime() }));
  } else {
    sessionStorage.setItem(AUTH_SESS_KEY, JSON.stringify(data));
  }
}

function _clearSession() {
  localStorage.removeItem(AUTH_SESS_KEY);
  sessionStorage.removeItem(AUTH_SESS_KEY);
  currentUser = null;
  _writeToken = null;
}

function checkAuth() {
  const sess = _getStoredSession();
  if (sess) {
    currentUser = sess;
    _writeToken = sess._wt || null;
    LANG = sess.role === 'admin' ? 'KR' : 'JP';
    applyLang();
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('layout').style.display = '';
    renderNavForRole();
    return true;
  }
  _showLogin();
  return false;
}

function _showLogin() {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('layout').style.display = 'none';
  const savedId = localStorage.getItem(AUTH_ID_KEY);
  if (savedId) {
    document.getElementById('login-id').value = savedId;
    document.getElementById('login-save-id').checked = true;
    setTimeout(() => document.getElementById('login-pw').focus(), 50);
  } else {
    setTimeout(() => document.getElementById('login-id').focus(), 50);
  }
}

async function doLogin() {
  const id     = (document.getElementById('login-id').value || '').trim();
  const pw     = document.getElementById('login-pw').value || '';
  const saveId = document.getElementById('login-save-id').checked;
  const err    = document.getElementById('login-err');
  const btn    = document.getElementById('login-btn');

  if (!id || !pw) {
    err.textContent = 'IDとパスワードを入力してください / ID와 비밀번호를 입력해 주세요';
    return;
  }

  err.textContent = '';
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = 'ログイン中… / 로그인 중…';

  try {
    const hash   = await _sha256(pw);
    const url    = (typeof gasUrl !== 'undefined' && gasUrl) ? gasUrl : GAS_URL;
    const resp   = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ type: 'verifyLogin', id, hash }),
    });
    const result = await resp.json();

    if (result.ok && result.user) {
      if (saveId) localStorage.setItem(AUTH_ID_KEY, id);
      else        localStorage.removeItem(AUTH_ID_KEY);

      const wt = result.user.role === 'admin' ? hash : null;
      _storeSession(result.user, wt);
      currentUser = result.user;
      _writeToken = wt;
      LANG = result.user.role === 'admin' ? 'KR' : 'JP';
      applyLang();

      document.getElementById('login-overlay').style.display = 'none';
      document.getElementById('layout').style.display = '';
      renderNavForRole();
      initApp();
    } else {
      err.innerHTML = 'IDまたはパスワードが違います<br>ID 또는 비밀번호가 틀렸습니다';
      document.getElementById('login-pw').value = '';
      document.getElementById('login-pw').focus();
    }
  } catch(e) {
    err.textContent = 'ログインエラー / 로그인 오류가 발생했습니다';
    console.error('Login error:', e);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function loginOnEnter(e) {
  if (e.key === 'Enter') doLogin();
}

function doLogout() {
  _clearSession();
  location.reload();
}

// ── 권한 제어 ──

function isWriteAuthorized() {
  return !!(currentUser && currentUser.role === 'admin');
}

function gasWriteAuth() {
  if (!currentUser || !_writeToken) return {};
  return { _uid: currentUser.id, _token: _writeToken };
}

function canAccessPage(pageId) {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  return VIEWER_PAGES.has(pageId);
}

function showAccessDenied() {
  document.getElementById('modal-access-denied').style.display = 'flex';
  setTimeout(() => {
    const btn = document.getElementById('btn-access-denied-ok');
    if (btn) btn.focus();
  }, 50);
}

function closeAccessDenied() {
  document.getElementById('modal-access-denied').style.display = 'none';
}

function renderNavForRole() {
  if (!currentUser || currentUser.role === 'admin') return;
  // viewer: 접근 불가 메뉴 숨김
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    if (!VIEWER_PAGES.has(item.dataset.page)) item.style.display = 'none';
  });
  // 설정 섹션 헤더 숨김
  const settingSec = document.getElementById('t-nav-setting');
  if (settingSec) settingSec.style.display = 'none';
}

function applyViewerRestrictions() {
  if (!currentUser || currentUser.role === 'admin') return;

  // 저장·삭제 버튼 숨김
  const saveBtn = document.getElementById('btn-save');
  const delBtn  = document.getElementById('btn-del-month');
  if (saveBtn) saveBtn.style.display = 'none';
  if (delBtn)  delBtn.style.display  = 'none';

  // 급여 입력 필드 읽기 전용
  document.querySelectorAll('#page-payroll .row-input').forEach(inp => {
    inp.readOnly = true;
    inp.style.background  = 'var(--surface2)';
    inp.style.cursor      = 'default';
    inp.style.borderColor = 'transparent';
  });

  // 상단바에 열람 전용 배지 표시
  const topbarL = document.querySelector('.topbar-l');
  if (topbarL && !topbarL.querySelector('.viewer-badge')) {
    const badge = document.createElement('span');
    badge.className = 'viewer-badge';
    badge.textContent = LANG === 'JP' ? '閲覧専用' : '열람 전용';
    badge.style.cssText = 'font-size:11px;color:#fff;background:#64748b;border-radius:4px;padding:2px 8px;margin-left:8px;font-weight:600;';
    topbarL.appendChild(badge);
  }

  // 쓰기 함수 일괄 no-op 오버라이드
  const blocked = () => {
    showToast(LANG === 'JP' ? '閲覧専用のため操作できません' : '열람 전용 계정입니다', 'w');
  };
  window.saveCurrent           = blocked;
  window.deleteCurrentMonth    = blocked;
  window.resetLocalData        = blocked;
  window.importFreeePayrollCSV = blocked;
  window.saveEmpForm           = blocked;
  window.saveEmployee          = blocked;
  window.deleteEmp             = blocked;
  window.reinstateEmp          = blocked;
  window.applyRates            = blocked;
  window.saveRateHistory       = blocked;
  window.downloadBackupExcel   = blocked;
}
