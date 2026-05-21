// WisePay GAS Script
// 이 파일 전체를 Google Apps Script(code.gs)에 붙여넣고 재배포하세요.
// 배포 설정: 웹 앱 > 액세스 권한: 전체(Everyone)
//
// ⚠️ PDF 파싱 기능을 쓰려면:
//   GAS 편집기 왼쪽 메뉴 「서비스(+)」→ Drive API v2 추가 필요

const SHEET_EMP  = '従業員';
const SHEET_PAY  = '給与データ';
const SHEET_RATE = '保険料率履歴';

// 협회けんぽ 새 URL
const KENPO_INDEX_URL = 'https://kyoukaikenpo.or.jp/about/business/insurance_rate/premium_prefectures/';
const KENPO_BASE_URL  = 'https://kyoukaikenpo.or.jp';

// ── Entry points ──────────────────────────────────────────────

function doGet(e) {
  const action   = e.parameter.action   || '';
  const callback = e.parameter.callback || '';
  let result;
  try {
    if      (action === 'test')                                    result = { ok: true };
    else if (action === 'getAll')                                  result = getAllData();
    else if (action === 'scrapeRates' || action === 'scrapeKenpoRates') result = scrapeKenpoRates();
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
        // Google Sheets가 YYYY-MM을 Date로 변환하는 문제 대응
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

// ── 협회けんぽ スクレイピング ─────────────────────────────────

function scrapeKenpoRates() {
  const today  = new Date();
  const year   = today.getFullYear();
  const month  = today.getMonth() + 1;
  const fiscal = month >= 3 ? year - 2018 : year - 2019;   // 令和年号
  const fromYr = month >= 3 ? year : year - 1;
  const from   = fromYr + '-03';

  Logger.log('対象: ' + fromYr + '年度 (令和' + fiscal + '年度) / from=' + from);

  const opts = {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'ja,en-US;q=0.7',
      'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
    }
  };

  // ── Step 1: インデックスページ取得 ──────────────────────────
  Logger.log('Step1: ' + KENPO_INDEX_URL);
  const idxRes = kenpoFetch(KENPO_INDEX_URL, opts);
  if (!idxRes) return { ok: false, error: 'インデックスページ取得失敗: ' + KENPO_INDEX_URL };

  const idxHtml = idxRes;
  Logger.log('インデックスHTMLサイズ: ' + idxHtml.length);

  // ── Step 2: インデックスページ内 HTML から直接料率を試みる ──
  let rates = extractRatesFromHtml(idxHtml);
  Logger.log('インデックスHTML直接抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);

  // ── Step 3: 年度リンクを見つけて年度ページを試みる ──────────
  if (rates.kenko == null) {
    const yearUrl = findYearPageUrl(idxHtml, fromYr, fiscal);
    Logger.log('年度ページURL: ' + yearUrl);

    if (yearUrl) {
      const yearHtml = kenpoFetch(yearUrl, opts);
      if (yearHtml) {
        rates = extractRatesFromHtml(yearHtml);
        Logger.log('年度ページHTML抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);

        // ── Step 4: HTML失敗 → 年度ページ内PDFを探してテキスト化 ──
        if (rates.kenko == null) {
          const pdfUrl = findTokyoPdfUrl(yearHtml);
          Logger.log('東京都PDFリンク: ' + pdfUrl);
          if (pdfUrl) {
            rates = extractRatesFromPdf(pdfUrl, opts);
            Logger.log('PDF抽出結果: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);
          }
        }
      }
    }
  }

  // ── Step 5: インデックスページのPDFを直接試みる ─────────────
  if (rates.kenko == null) {
    const pdfUrl = findTokyoPdfUrl(idxHtml);
    Logger.log('インデックスPDF: ' + pdfUrl);
    if (pdfUrl) {
      rates = extractRatesFromPdf(pdfUrl, opts);
      Logger.log('インデックスPDF抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);
    }
  }

  if (rates.kenko == null) {
    return {
      ok: false,
      error: '東京都の保険料率を抽出できませんでした。\nGASの実行ログを確認してください。\n出典: ' + KENPO_INDEX_URL
    };
  }

  const kodomo = fiscal >= 8 ? 0.23 : 0.00;

  return {
    ok:         true,
    kenko:      rates.kenko,
    kaigo:      rates.kaigo != null ? rates.kaigo : 1.62,
    kodomo:     kodomo,
    nenkin:     18.30,
    koyo:       0.50,
    from:       from,
    source:     KENPO_INDEX_URL,
    scraped_at: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')
  };
}

// ── HTML から東京都の料率を抽出 ────────────────────────────────

function extractRatesFromHtml(html) {
  if (!html || typeof html !== 'string') return { kenko: null, kaigo: null };

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ');

  return extractRatesFromText(text);
}

function extractRatesFromText(text) {
  if (!text) return { kenko: null, kaigo: null };

  let kenko = null, kaigo = null;

  // 東京都 直後の数値列から合計保険料率 (8.5〜11.5%)
  const tokyoIdx = text.indexOf('東京都');
  Logger.log('東京都 idx=' + tokyoIdx);
  if (tokyoIdx >= 0) {
    const seg  = text.slice(tokyoIdx, tokyoIdx + 600);
    Logger.log('東京都付近300文字: ' + seg.substring(0, 300));
    const nums = (seg.match(/\d{1,2}\.\d{2,3}/g) || []).map(Number);
    Logger.log('数値リスト: ' + JSON.stringify(nums));
    kenko = nums.find(v => v >= 8.5 && v <= 11.5) || null;
    Logger.log('健康保険料率(東京): ' + kenko);
  }

  // 介護保険料率 (全国一律 1〜3%)
  const kaigoIdx = text.search(/介護保険料率|介護保険.*?料率/);
  if (kaigoIdx >= 0) {
    const seg  = text.slice(kaigoIdx, kaigoIdx + 300);
    const nums = (seg.match(/\d+\.\d{2,3}/g) || []).map(Number);
    kaigo = nums.find(v => v >= 1.0 && v <= 3.0) || null;
    Logger.log('介護保険料率: ' + kaigo);
  }

  return { kenko, kaigo };
}

// ── 年度ページ URL を探す ──────────────────────────────────────

function findYearPageUrl(html, year, fiscal) {
  const yearStr  = String(year);
  const reiwaStr = '令和' + fiscal;
  const candidates = [];

  const re = /href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (text.includes(yearStr) || text.includes(reiwaStr) ||
        href.includes(yearStr) || href.includes('r' + String(fiscal).padStart(2,'0'))) {
      candidates.push({ href, text });
    }
  }
  Logger.log('年度リンク候補: ' + JSON.stringify(candidates.slice(0, 8)));

  if (candidates.length === 0) return null;
  const href = candidates[0].href;
  if (href.startsWith('http')) return href;
  return KENPO_BASE_URL + (href.startsWith('/') ? href : '/' + href);
}

// ── 東京都 PDF URL を探す ──────────────────────────────────────

function findTokyoPdfUrl(html) {
  // tokyo / 東京 を含む PDF リンクを優先
  const re = /href=["']([^"']+\.pdf)["']/gi;
  const pdfs = [];
  let m;
  while ((m = re.exec(html)) !== null) pdfs.push(m[1]);

  Logger.log('全PDFリンク: ' + JSON.stringify(pdfs.slice(0, 10)));

  const tokyoPdf = pdfs.find(p => /tokyo|Tokyo|東京/i.test(p));
  const target   = tokyoPdf || pdfs[0] || null;
  if (!target) return null;
  if (target.startsWith('http')) return target;
  return KENPO_BASE_URL + (target.startsWith('/') ? target : '/' + target);
}

// ── PDF → テキスト変換（Drive API v2 が必要）────────────────────

function extractRatesFromPdf(pdfUrl, opts) {
  try {
    Logger.log('PDF取得: ' + pdfUrl);
    const res = UrlFetchApp.fetch(pdfUrl, opts);
    Logger.log('PDF HTTP: ' + res.getResponseCode());
    if (res.getResponseCode() !== 200) return { kenko: null, kaigo: null };

    const blob = res.getBlob().setName('kenpo_tmp.pdf');

    // Drive API v2 で Google ドキュメントに変換してテキスト抽出
    // 「サービスを追加 → Drive API v2」を有効にしておくこと
    const file = Drive.Files.insert(
      { title: 'kenpo_tmp', mimeType: 'application/vnd.google-apps.document' },
      blob,
      { convert: true }
    );
    let text = '';
    try {
      text = DocumentApp.openById(file.id).getBody().getText();
      Logger.log('PDFテキスト先頭500: ' + text.substring(0, 500));
    } finally {
      Drive.Files.remove(file.id);
    }
    return extractRatesFromText(text);

  } catch(e) {
    Logger.log('PDF処理エラー (Drive API v2 未追加の可能性): ' + e.message);
    return { kenko: null, kaigo: null };
  }
}

// ── HTTP ヘルパー ─────────────────────────────────────────────

function kenpoFetch(url, opts) {
  try {
    const res = UrlFetchApp.fetch(url, opts);
    const code = res.getResponseCode();
    Logger.log('HTTP ' + code + ' : ' + url);
    if (code !== 200) return null;
    return res.getContentText('UTF-8');
  } catch(e) {
    Logger.log('Fetch失敗: ' + url + ' → ' + e.message);
    return null;
  }
}

// ── GAS 通信 (JSONP) ───────────────────────────────────────────
// フロントエンドは gasRequest() で呼び出す (gas.js 参照)
