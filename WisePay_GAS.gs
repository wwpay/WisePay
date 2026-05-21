// WisePay GAS Script
// 이 파일 전체를 Google Apps Script(code.gs)에 붙여넣고 재배포하세요.
// 배포 설정: 웹 앱 > 액세스 권한: 전체(Everyone)

const SHEET_EMP  = '従業員';
const SHEET_PAY  = '給与データ';
const SHEET_RATE = '保険料率履歴';

// ── Entry points ──────────────────────────────────────────────

function doGet(e) {
  const action   = e.parameter.action   || '';
  const callback = e.parameter.callback || '';
  let result;
  try {
    if      (action === 'test')        result = { ok: true };
    else if (action === 'getAll')      result = getAllData();
    else if (action === 'scrapeRates') result = scrapeKenpoRates();
    else result = { ok: false, error: 'Unknown action: ' + action };
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  const json = JSON.stringify(result);
  return ContentService
    .createTextOutput(callback ? callback + '(' + json + ')' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type === 'exportAll') {
      if (data.employees)   saveSheet(SHEET_EMP,  data.employees);
      if (data.payrolls)    saveSheet(SHEET_PAY,  data.payrolls);
      if (data.rateHistory) saveSheet(SHEET_RATE, data.rateHistory);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ ok: false, error: 'Unknown type' });
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Data helpers ──────────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { if (h !== '') obj[String(h)] = row[i]; });
    return obj;
  });
}

function saveSheet(name, records) {
  if (!records || !records.length) return;
  const sheet = getSheet(name);
  sheet.clearContents();
  const headers = [...new Set(records.flatMap(r => Object.keys(r)))];
  const rows = [headers, ...records.map(r => headers.map(h => r[h] !== undefined ? r[h] : ''))];
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
}

function getAllData() {
  return {
    ok: true,
    data: {
      employees:   sheetToObjects(getSheet(SHEET_EMP)),
      payrolls:    sheetToObjects(getSheet(SHEET_PAY)),
      rateHistory: sheetToObjects(getSheet(SHEET_RATE))
    }
  };
}

// ── 協会けんぽ スクレイピング ─────────────────────────────────

function scrapeKenpoRates() {
  const today  = new Date();
  const year   = today.getFullYear();
  const month  = today.getMonth() + 1;

  // 令和年号: 2019年 = 令和元年(1), 2026年 = 令和8年
  const reiwa  = year - 2018;
  // 健康保険料率は3月改定。1-2月は前年度。
  const fiscal = month >= 3 ? reiwa : reiwa - 1;
  const r2     = String(fiscal).padStart(2, '0');
  const fromYr = month >= 3 ? year : year - 1;
  const from   = fromYr + '-03';

  const urls = [
    'https://www.kyoukaikenpo.or.jp/g7/cat330/sb3130/r' + r2 + '/r' + fiscal + 'ryouritsu3gatukara/',
    'https://www.kyoukaikenpo.or.jp/g7/cat330/sb3130/r' + r2 + '/',
  ];

  const opts = {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  };

  let html = null, usedUrl = null;
  for (const url of urls) {
    try {
      const res = UrlFetchApp.fetch(url, opts);
      if (res.getResponseCode() === 200) {
        const c = res.getContentText('UTF-8');
        if (c.includes('東京')) { html = c; usedUrl = url; break; }
      }
    } catch(e) {
      Logger.log('Fetch error: ' + url + ' -> ' + e.message);
    }
  }

  if (!html) {
    return { ok: false, error: 'ページ取得失敗。時間をおいて再試行してください。' };
  }

  const parsed = parseTokyoRates(html);
  if (!parsed.kenko) {
    return {
      ok: false,
      error: '東京都の保険料率を解析できませんでした。\n協会けんぽのサイト構成が変更された可能性があります。\n出典: ' + usedUrl
    };
  }

  // 子ども・子育て支援金: 令和8年度(2026年度)以降 0.23%
  const kodomo = fiscal >= 8 ? 0.23 : 0.00;

  return {
    ok:         true,
    kenko:      parsed.kenko,
    kaigo:      parsed.kaigo || 1.62,
    kodomo:     kodomo,
    nenkin:     18.30,
    koyo:       0.50,
    from:       from,
    source:     usedUrl,
    scraped_at: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')
  };
}

function parseTokyoRates(html) {
  // スクリプト・スタイル除去 → プレーンテキスト化
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  let kenko = null, kaigo = null;

  // 東京都の行の直後から合計保険料率を取得 (8.5〜11.5%の範囲)
  // 折半額(4〜6%)は除外
  const tokyoIdx = text.indexOf('東京都');
  if (tokyoIdx >= 0) {
    const seg  = text.slice(tokyoIdx, tokyoIdx + 250);
    const nums = (seg.match(/\d{1,2}\.\d{2,3}/g) || []).map(Number);
    kenko = nums.find(v => v >= 8.5 && v <= 11.5) || null;
  }

  // 介護保険料率 (全国一律 1〜3%)
  const kaigoIdx = text.search(/介護保険料率|介護保険.*?料率/);
  if (kaigoIdx >= 0) {
    const seg  = text.slice(kaigoIdx, kaigoIdx + 150);
    const nums = (seg.match(/\d+\.\d{2,3}/g) || []).map(Number);
    kaigo = nums.find(v => v >= 1.0 && v <= 3.0) || null;
  }

  return { kenko, kaigo };
}
