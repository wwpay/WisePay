// 수정: 2026-05-27 13:29 — showSaveFilePicker 제거 (페이지 리로드 원인) → 앵커 다운로드만 사용
'use strict';

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

/* ── 사원 백업 ── */
function downloadEmpBackupJson() {
  const filename = '사원_backup_' + _backupDateStr() + '.json';
  const data = { exportedAt: new Date().toISOString(), employees };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  _saveFile(blob, filename);
  _markBackupDone();
  showToast(LANG === 'JP' ? '従業員バックアップ完了 ✓' : '사원 백업 완료 ✓', 's');
}

/* ── 급여 백업 ── */
function downloadPayBackupJson() {
  const filename = '급여_backup_' + _backupDateStr() + '.json';
  const data = { exportedAt: new Date().toISOString(), payrolls: collectAllPayrolls(), rateHistory };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  _saveFile(blob, filename);
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
        // 기존 급여 키 삭제 후 복원
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
function downloadBackupExcel() {
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
  _saveFile(blob, filename);
  _markBackupDone();
  showToast(LANG === 'JP' ? 'Excelバックアップ完了 ✓' : 'Excel 백업 완료 ✓', 's');
}
