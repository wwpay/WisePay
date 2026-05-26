// 수정: 2026-05-26 13:25 — _triggerDownload: target=_blank으로 현재 페이지 네비게이션 방지, Excel도 직접 blob 제어
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

// 다운로드 트리거: target=_blank으로 현재 페이지 네비게이션 방지
function _triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
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

function downloadBackupJson() {
  const date = _backupDateStr();
  const data = {
    exportedAt: new Date().toISOString(),
    employees,
    payrolls: collectAllPayrolls(),
    rateHistory,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/octet-stream' });
  _triggerDownload(blob, 'WisePay_backup_' + date + '.json');
  _markBackupDone();
  showToast(LANG === 'JP' ? 'JSONバックアップ完了 ✓' : 'JSON 백업 다운로드 완료 ✓', 's');
}

function downloadBackupExcel() {
  if (typeof XLSX === 'undefined') {
    showToast(LANG === 'JP' ? 'Excelライブラリ読み込み中... 少々お待ちください' : 'Excel 라이브러리 로딩 중... 잠시 후 다시 시도해 주세요', 'w');
    return;
  }
  const date = _backupDateStr();
  const wb = XLSX.utils.book_new();
  const empData = employees.length ? employees.map(e => ({ ...e, families: JSON.stringify(e.families || []) })) : [{}];
  const payData = collectAllPayrolls();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empData), '사원정보');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payData.length ? payData : [{}]), '급여데이터');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rateHistory.length ? rateHistory : [{}]), '보험료율이력');
  // XLSX.writeFile 대신 직접 blob 생성 → _triggerDownload로 페이지 네비게이션 방지
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  _triggerDownload(blob, 'WisePay_backup_' + date + '.xlsx');
  _markBackupDone();
  showToast(LANG === 'JP' ? 'Excelバックアップ完了 ✓' : 'Excel 백업 다운로드 완료 ✓', 's');
}
