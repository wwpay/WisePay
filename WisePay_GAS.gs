// WisePay GAS — 수정: 2026-05-20 12:32 — 초기 작성 (자동 동기화 지원)
// Google Apps Script — code.gs 에 이 내용 전체를 붙여 넣으세요

var SS = SpreadsheetApp.getActiveSpreadsheet();

function getSheet(name) {
  return SS.getSheetByName(name) || SS.insertSheet(name);
}

function readJSON(sheetName) {
  try {
    var val = getSheet(sheetName).getRange('A1').getValue();
    return val ? JSON.parse(val) : [];
  } catch (e) { return []; }
}

function writeJSON(sheetName, data) {
  getSheet(sheetName).getRange('A1').setValue(JSON.stringify(data));
}

// ── POST 처리 (저장) ──────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.type === 'exportAll') {
      // 전체 내보내기 (수동 동기화)
      writeJSON('employees',   data.employees   || []);
      writeJSON('payrolls',    data.payrolls    || []);
      writeJSON('rateHistory', data.rateHistory || []);

    } else if (data.type === 'employees') {
      // 직원 자동 동기화 (저장 시 자동 호출)
      writeJSON('employees', data.employees || []);

    } else if (data.type === 'payroll') {
      // 급여 단건 자동 동기화
      var payrolls = readJSON('payrolls');
      var idx = -1;
      for (var i = 0; i < payrolls.length; i++) {
        if (payrolls[i].no === data.no &&
            String(payrolls[i].year)  === String(data.year) &&
            String(payrolls[i].month) === String(data.month)) {
          idx = i; break;
        }
      }
      if (idx >= 0) { payrolls[idx] = data; } else { payrolls.push(data); }
      writeJSON('payrolls', payrolls);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── GET 처리 (읽기 / 연결 테스트) ────────────────────────
function doGet(e) {
  var action   = e.parameter.action;
  var callback = e.parameter.callback;
  var result;

  if (action === 'test') {
    result = { ok: true };

  } else if (action === 'getAll') {
    result = {
      employees:   readJSON('employees'),
      payrolls:    readJSON('payrolls'),
      rateHistory: readJSON('rateHistory')
    };

  } else {
    result = { ok: false, error: 'unknown action: ' + action };
  }

  // JSONP 방식 (CORS 우회)
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
