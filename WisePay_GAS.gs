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
    headers.forEach((h, i) => {
      if (h !== '') {
        // 日付型の from フィールドを YYYY-MM に正規化
        if (String(h) === 'from' && row[i] instanceof Date) {
          const d = row[i];
          obj[String(h)] = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        } else {
          obj[String(h)] = row[i];
        }
      }
    });
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

  // 令和年号: 2019 = 令和元年(1)
  const reiwa    = year - 2018;
  const fiscal   = month >= 3 ? reiwa : reiwa - 1;
  const prevFisc = fiscal - 1;
  const r2cur    = String(fiscal).padStart(2, '0');
  const r2prev   = String(prevFisc).padStart(2, '0');
  const fromYr   = month >= 3 ? year : year - 1;
  const from     = fromYr + '-03';

  Logger.log('令和' + fiscal + '年度 / from=' + from);

  // URL候補: ゼロ埋めあり・なし、前年度も試みる
  const urls = [
    'https://www.kyoukaikenpo.or.jp/g7/cat330/sb3130/r' + r2cur + '/r' + fiscal + 'ryouritsu3gatukara/',
    'https://www.kyoukaikenpo.or.jp/g7/cat330/sb3130/r' + r2cur + '/r' + r2cur + 'ryouritsu3gatukara/',
    'https://www.kyoukaikenpo.or.jp/g7/cat330/sb3130/r' + r2prev + '/r' + prevFisc + 'ryouritsu3gatukara/',
    'https://www.kyoukaikenpo.or.jp/g7/cat330/sb3130/r' + r2prev + '/r' + r2prev + 'ryouritsu3gatukara/',
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
      Logger.log('試行: ' + url);
      const res  = UrlFetchApp.fetch(url, opts);
      const code = res.getResponseCode();
      Logger.log('ステータス: ' + code);
      if (code === 200) {
        const c = res.getContentText('UTF-8');
        Logger.log('HTMLサイズ=' + c.length + ' 東京含む=' + c.includes('東京'));
        if (c.includes('東京')) { html = c; usedUrl = url; break; }
      }
    } catch(e) {
      Logger.log('Fetchエラー: ' + e.message);
    }
  }

  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'ページ取得失敗。協会けんぽサイトに接続できませんでした。' };
  }

  const parsed = parseTokyoRates(html);
  Logger.log('解析結果: kenko=' + parsed.kenko + ' kaigo=' + parsed.kaigo);

  if (parsed.kenko == null) {
    return {
      ok: false,
      error: '東京都の保険料率を解析できませんでした。\nサイト構成が変更された可能性があります。\n出典: ' + usedUrl
    };
  }

  const kodomo = fiscal >= 8 ? 0.23 : 0.00;

  return {
    ok:         true,
    kenko:      parsed.kenko,
    kaigo:      parsed.kaigo != null ? parsed.kaigo : 1.62,
    kodomo:     kodomo,
    nenkin:     18.30,
    koyo:       0.50,
    from:       from,
    source:     usedUrl,
    scraped_at: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')
  };
}

function parseTokyoRates(html) {
  if (!html || typeof html !== 'string') {
    Logger.log('parseTokyoRates: html が無効 (' + typeof html + ')');
    return { kenko: null, kaigo: null };
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ');

  Logger.log('プレーンテキスト先頭300文字: ' + text.substring(0, 300));

  let kenko = null, kaigo = null;

  // 東京都の行から合計保険料率を取得 (8.5〜11.5%)
  const tokyoIdx = text.indexOf('東京都');
  Logger.log('東京都インデックス: ' + tokyoIdx);

  if (tokyoIdx >= 0) {
    const seg  = text.slice(tokyoIdx, tokyoIdx + 600);
    Logger.log('東京都付近(先頭300): ' + seg.substring(0, 300));
    const nums = (seg.match(/\d{1,2}\.\d{2,3}/g) || []).map(Number);
    Logger.log('抽出された数値: ' + JSON.stringify(nums));
    // 合計料率(8.5〜11.5%) → 折半料率(4〜6%)は除外
    kenko = nums.find(v => v >= 8.5 && v <= 11.5) || null;
    Logger.log('健康保険料率(東京): ' + kenko);
  }

  // 介護保険料率 (全国一律 1〜3%)
  const kaigoIdx = text.search(/介護保険料率|介護保険.*?料率/);
  if (kaigoIdx >= 0) {
    const seg  = text.slice(kaigoIdx, kaigoIdx + 300);
    Logger.log('介護保険付近: ' + seg.substring(0, 150));
    const nums = (seg.match(/\d+\.\d{2,3}/g) || []).map(Number);
    kaigo = nums.find(v => v >= 1.0 && v <= 3.0) || null;
    Logger.log('介護保険料率: ' + kaigo);
  }

  return { kenko, kaigo };
}
