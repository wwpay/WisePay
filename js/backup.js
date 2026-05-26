// 수정: 2026-05-26 16:01 — 백업 flash·토스트 수정: sessionStorage 제거 + Excel showSaveFilePicker 순서 변경
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

// anchor fallback 다운로드 (페이지 이동 없음)
function _anchorDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function downloadBackupJson() {
  const date = _backupDateStr();
  const filename = 'WisePay_backup_' + date + '.json';
  const data = {
    exportedAt: new Date().toISOString(),
    employees,
    payrolls: collectAllPayrolls(),
    rateHistory,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (e) {
      if (e.name === 'AbortError') return;
      _anchorDownload(blob, filename);
    }
  } else {
    _anchorDownload(blob, filename);
  }

  _markBackupDone();
  showToast(LANG === 'JP' ? 'JSONバックアップ完了 ✓' : 'JSON 백업 완료 ✓', 's');
}

async function downloadBackupExcel() {
  if (typeof XLSX === 'undefined') {
    showToast(LANG === 'JP' ? 'Excelライブラリ読み込み中... 少々お待ちください' : 'Excel 라이브러리 로딩 중... 잠시 후 다시 시도해 주세요', 'w');
    return;
  }
  const date = _backupDateStr();
  const filename = 'WisePay_backup_' + date + '.xlsx';

  // XLSX.write() 전에 showSaveFilePicker 호출 — user activation 컨텍스트 유지
  let fileHandle = null;
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
      });
    } catch (e) {
      if (e.name === 'AbortError') return;
      fileHandle = null;
    }
  }

  // 파일 핸들 확보 후 XLSX 생성 (무거운 동기 작업)
  const wb = XLSX.utils.book_new();
  const empData = employees.length ? employees.map(e => ({ ...e, families: JSON.stringify(e.families || []) })) : [{}];
  const payData = collectAllPayrolls();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empData), '사원정보');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payData.length ? payData : [{}]), '급여데이터');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rateHistory.length ? rateHistory : [{}]), '보험료율이력');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (e) {
      console.warn('Excel write failed:', e);
      _anchorDownload(blob, filename);
    }
  } else {
    _anchorDownload(blob, filename);
  }

  _markBackupDone();
  showToast(LANG === 'JP' ? 'Excelバックアップ完了 ✓' : 'Excel 백업 완료 ✓', 's');
}
