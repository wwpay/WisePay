// 수정: 2026-05-27 15:12 — requestPermission 제거 + showDirectoryPicker 전 sessionStorage 복원키 설정
'use strict';

/* ── 날짜 유틸 ── */
function _backupDateStr() {
  const d = new Date();
  return d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
}

function _thisMondayStr() {
  const d = new Date();
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return mon.getFullYear() +
    String(mon.getMonth() + 1).padStart(2, '0') +
    String(mon.getDate()).padStart(2, '0');
}

function _markBackupDone() {
  localStorage.setItem('wisepay_backup_week', _thisMondayStr());
}

// 월요일 접속 시, 이번 주 백업 안 됐으면 토스트 알림
function checkBackupReminder() {
  if (new Date().getDay() !== 1) return;
  const mon = _thisMondayStr();
  if (localStorage.getItem('wisepay_backup_week') === mon) return;
  if (localStorage.getItem('wisepay_backup_reminded') === mon) return;
  localStorage.setItem('wisepay_backup_reminded', mon);
  setTimeout(() => {
    showToast(
      LANG === 'JP' ? '📦 今週の手動バックアップはお済みですか？' : '📦 이번 주 수동 백업 하셨나요?',
      'w'
    );
  }, 2500);
}

/* ── 앵커 다운로드 (비Chrome 폴백) ── */
function _saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ── IndexedDB: 폴더 핸들 저장/로드/삭제 ── */
function _openBackupDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wisepay_backup_v1', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('dir_handles');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function _saveDirHandle(handle) {
  const db = await _openBackupDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dir_handles', 'readwrite');
    tx.objectStore('dir_handles').put(handle, 'backup_dir');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _loadDirHandle() {
  try {
    const db = await _openBackupDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('dir_handles', 'readonly');
      const req = tx.objectStore('dir_handles').get('backup_dir');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

async function _clearDirHandle() {
  try {
    const db = await _openBackupDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('dir_handles', 'readwrite');
      tx.objectStore('dir_handles').delete('backup_dir');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

/* ── 파일 시스템 직접 쓰기 ── */
async function _writeToDir(dirHandle, blob, filename) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/* ── showDirectoryPicker 래퍼:
   Chrome 권한 승인 후 페이지가 리로드될 수 있으므로
   호출 전에 sessionStorage 복원 키를 설정해 둔다.
   취소 시에는 키를 삭제. ── */
async function _pickDirectory() {
  sessionStorage.setItem('wisepay_restore_page', 'gas');
  try {
    const handle = await showDirectoryPicker({ mode: 'readwrite' });
    return handle;
  } catch (e) {
    sessionStorage.removeItem('wisepay_restore_page');
    throw e;
  }
}

/* ── 폴더 지정 저장 (핵심 함수) ──
   반환값: true = 저장 완료, false = 취소/실패 */
async function _saveWithFolder(blob, filename) {
  const jp = LANG === 'JP';

  // File System Access API 미지원(Safari 등): 앵커 다운로드로 폴백
  if (typeof showDirectoryPicker === 'undefined') {
    _saveFile(blob, filename);
    return true;
  }

  let dirHandle = await _loadDirHandle();

  // 저장된 핸들이 있으면 권한을 조용히 확인 (requestPermission 사용 안 함)
  if (dirHandle) {
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      // 권한 만료(브라우저 재시작 등): 기존 설정 초기화 후 다시 폴더 선택
      await _clearDirHandle();
      localStorage.removeItem('wisepay_backup_folder_name');
      renderBackupFolderStatus();
      dirHandle = null;
    }
  }

  // 폴더 미설정 또는 권한 만료: 폴더 선택 대화상자 오픈
  if (!dirHandle) {
    try {
      dirHandle = await _pickDirectory();
      await _saveDirHandle(dirHandle);
      localStorage.setItem('wisepay_backup_folder_name', dirHandle.name);
      renderBackupFolderStatus();
    } catch (e) {
      if (e.name === 'AbortError') return false; // 사용자 취소
      showToast(jp ? 'フォルダ選択に失敗しました' : '폴더 선택에 실패했습니다', 'e');
      return false;
    }
  }

  // 파일 쓰기
  try {
    await _writeToDir(dirHandle, blob, filename);
    return true;
  } catch (e) {
    // 폴더 삭제 등 쓰기 실패: 설정 초기화
    await _clearDirHandle();
    localStorage.removeItem('wisepay_backup_folder_name');
    renderBackupFolderStatus();
    showToast(jp ? '保存フォルダが見つかりません。再設定してください。' : '저장 폴더를 찾을 수 없습니다. 다시 설정해 주세요.', 'e');
    return false;
  }
}

/* ── 백업 폴더 UI ── */
function renderBackupFolderStatus() {
  const el = document.getElementById('backup-folder-status');
  if (!el) return;
  const jp = LANG === 'JP';

  if (typeof showDirectoryPicker === 'undefined') {
    el.innerHTML = `<span style="color:var(--text3);font-size:11px;">${jp ? '⚠️ Chrome専用機能（Safari/Firefoxは非対応）' : '⚠️ Chrome 전용 기능 (Safari/Firefox 미지원)'}</span>`;
    return;
  }

  const folderName = localStorage.getItem('wisepay_backup_folder_name');
  if (folderName) {
    el.innerHTML =
      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>` +
      `<span style="color:var(--accent);font-weight:600;font-size:11px;">${folderName}</span>` +
      `<button onclick="setBackupFolder()" style="padding:2px 8px;font-size:10px;background:var(--accent2);color:var(--accent);border:1px solid var(--accent3);border-radius:4px;cursor:pointer;">${jp ? '変更' : '변경'}</button>` +
      `<button onclick="clearBackupFolder()" style="padding:2px 8px;font-size:10px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:4px;cursor:pointer;">${jp ? '解除' : '해제'}</button>`;
  } else {
    el.innerHTML =
      `<span style="color:var(--text3);font-size:11px;">${jp ? '未設定（初回バックアップ時に自動でフォルダを指定します）' : '미설정 (처음 백업 시 자동으로 폴더를 지정합니다)'}</span>` +
      `<button onclick="setBackupFolder()" style="padding:2px 8px;font-size:10px;background:var(--accent2);color:var(--accent);border:1px solid var(--accent3);border-radius:4px;cursor:pointer;">${jp ? 'フォルダ設定' : '폴더 설정'}</button>`;
  }
}

async function setBackupFolder() {
  const jp = LANG === 'JP';
  if (typeof showDirectoryPicker === 'undefined') {
    showToast(jp ? 'このブラウザはフォルダ選択に対応していません' : '이 브라우저는 폴더 선택을 지원하지 않습니다', 'w');
    return;
  }
  try {
    const dirHandle = await _pickDirectory();
    await _saveDirHandle(dirHandle);
    localStorage.setItem('wisepay_backup_folder_name', dirHandle.name);
    renderBackupFolderStatus();
    showToast(jp ? `フォルダを設定しました: ${dirHandle.name}` : `폴더 설정 완료: ${dirHandle.name}`, 's');
  } catch (e) {
    if (e.name !== 'AbortError') {
      showToast(jp ? 'フォルダ設定に失敗しました' : '폴더 설정에 실패했습니다', 'e');
    }
  }
}

async function clearBackupFolder() {
  await _clearDirHandle();
  localStorage.removeItem('wisepay_backup_folder_name');
  renderBackupFolderStatus();
  showToast(LANG === 'JP' ? 'フォルダ設定を解除しました' : '폴더 설정을 해제했습니다', 's');
}

/* ── 사원 백업 ── */
async function downloadEmpBackupJson() {
  const filename = '사원_backup_' + _backupDateStr() + '.json';
  const data = { exportedAt: new Date().toISOString(), employees };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const ok = await _saveWithFolder(blob, filename);
  if (!ok) return;
  _markBackupDone();
  showToast(LANG === 'JP' ? '従業員バックアップ完了 ✓' : '사원 백업 완료 ✓', 's');
}

/* ── 급여 백업 ── */
async function downloadPayBackupJson() {
  const filename = '급여_backup_' + _backupDateStr() + '.json';
  const data = { exportedAt: new Date().toISOString(), payrolls: collectAllPayrolls(), rateHistory };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const ok = await _saveWithFolder(blob, filename);
  if (!ok) return;
  _markBackupDone();
  showToast(LANG === 'JP' ? '給与バックアップ完了 ✓' : '급여 백업 완료 ✓', 's');
}

/* ── 사원 복원 ── */
function restoreEmpFromJson() {
  const input = document.getElementById('restoreEmpInput');
  if (input) { input.value = ''; input.click(); }
}

function _onRestoreEmpFile(input) {
  const file = input.files[0];
  if (!file) return;
  const jp = LANG === 'JP';
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!Array.isArray(data.employees)) {
        showToast(jp ? '従業員バックアップファイルではありません' : '사원 백업 파일이 아닙니다', 'e');
        input.value = '';
        return;
      }
      const msg = jp
        ? '⚠️ 従業員データを復元すると、現在の従業員データがバックアップ時点に戻ります。\n続けますか？'
        : '⚠️ 사원 데이터를 복원하면 현재 사원 데이터가 백업 시점으로 되돌아갑니다.\n계속하시겠습니까?';
      if (!confirm(msg)) { input.value = ''; return; }
      employees = data.employees;
      localStorage.setItem(LS.emp, JSON.stringify(employees));
      showToast(jp ? '従業員データを復元しました ✓' : '사원 데이터 복원 완료 ✓', 's');
      try { renderEmpList(); } catch(e) {}
      try { renderEmpSelect(); } catch(e) {}
      try { buildHistEmpSel(); renderHistory(); } catch(e) {}
      try { buildAnnualEmpSel(); renderAnnual(); } catch(e) {}
    } catch (err) {
      showToast(jp ? '読み込みに失敗しました' : '파일 읽기에 실패했습니다', 'e');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

/* ── 급여 복원 ── */
function restorePayFromJson() {
  const input = document.getElementById('restorePayInput');
  if (input) { input.value = ''; input.click(); }
}

function _onRestorePayFile(input) {
  const file = input.files[0];
  if (!file) return;
  const jp = LANG === 'JP';
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!Array.isArray(data.payrolls) && !Array.isArray(data.rateHistory)) {
        showToast(jp ? '給与バックアップファイルではありません' : '급여 백업 파일이 아닙니다', 'e');
        input.value = '';
        return;
      }
      const msg = jp
        ? '⚠️ 給与データを復元すると、現在の給与データがバックアップ時点に戻ります。\n続けますか？'
        : '⚠️ 급여 데이터를 복원하면 현재 급여 데이터가 백업 시점으로 되돌아갑니다.\n계속하시겠습니까?';
      if (!confirm(msg)) { input.value = ''; return; }

      if (Array.isArray(data.rateHistory)) {
        rateHistory = data.rateHistory;
        localStorage.setItem(LS.rateHistory, JSON.stringify(rateHistory));
      }

      if (Array.isArray(data.payrolls)) {
        employees.forEach(emp => {
          const pNo = String(emp.no).padStart(4, '0');
          for (let y = 2024; y <= 2030; y++) {
            for (let m = 1; m <= 12; m++) {
              localStorage.removeItem(`kyuyo_p_${pNo}_${y}_${m}`);
            }
          }
        });
        data.payrolls.forEach(row => {
          const { no, name, year, month, ...d } = row;
          if (no == null || !year || !month) return;
          const pNo = String(no).padStart(4, '0');
          localStorage.setItem(`kyuyo_p_${pNo}_${year}_${month}`, JSON.stringify(d));
        });
      }

      showToast(jp ? '給与データを復元しました ✓' : '급여 데이터 복원 완료 ✓', 's');
      try { renderRates(); } catch(e) {}
      const activePage = document.querySelector('.page.active')?.id || '';
      if (activePage === 'page-annual') try { renderAnnual(); } catch(e) {}
      if (activePage === 'page-history') try { renderHistory(); } catch(e) {}
      if (activePage === 'page-payroll') try { loadPayrollForm(); } catch(e) {}
    } catch (err) {
      showToast(jp ? '読み込みに失敗しました' : '파일 읽기에 실패했습니다', 'e');
    }
    input.value = '';
  };
  reader.readAsText(file);
}

/* ── Excel 백업 ── */
async function downloadBackupExcel() {
  if (typeof XLSX === 'undefined') {
    showToast(LANG === 'JP' ? 'Excelライブラリ読み込み中... 少々お待ちください' : 'Excel 라이브러리 로딩 중... 잠시 후 다시 시도해 주세요', 'w');
    return;
  }
  const filename = 'WisePay_backup_' + _backupDateStr() + '.xlsx';
  const wb = XLSX.utils.book_new();
  const empData = employees.length ? employees.map(e => ({ ...e, families: JSON.stringify(e.families || []) })) : [{}];
  const payData = collectAllPayrolls();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empData), '사원정보');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payData.length ? payData : [{}]), '급여데이터');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rateHistory.length ? rateHistory : [{}]), '보험료율이력');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const ok = await _saveWithFolder(blob, filename);
  if (!ok) return;
  _markBackupDone();
  showToast(LANG === 'JP' ? 'Excelバックアップ完了 ✓' : 'Excel 백업 완료 ✓', 's');
}
