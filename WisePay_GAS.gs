// WisePay GAS Script
// 수정: 2026-05-25 23:48 — backupWeekly / deleteOldBackups / createWeeklyBackupTrigger 추가
// 이 파일 전체를 Google Apps Script(code.gs)에 붙여넣고 재배포하세요.
// 배포 설정: 웹 앱 > 액세스 권한: 전체(Everyone)
//
// ⚠️ PDF 파싱 기능을 쓰려면:
//   GAS 편집기 왼쪽 메뉴 「서비스(+)」→ Drive API v2 추가 필요

const SHEET_EMP  = '사원정보';
const SHEET_PAY  = '급여데이터';
const SHEET_RATE = '보험료율데이터';
const SHEET_LOG  = '동기화로그';

// 일본어 시트명 (마이그레이션 후 삭제 대상)
const SHEET_EMP_JP  = '従業員';
const SHEET_PAY_JP  = '給与データ';
const SHEET_RATE_JP = '保険料率履歴';

// 협회けんぽ URL (2025년 사이트 개편 후 변경된 URL)
const KENPO_INDEX_URL = 'https://www.kyoukaikenpo.or.jp/about/business/insurance_rate/rate_prefectures/';
const KENPO_BASE_URL  = 'https://www.kyoukaikenpo.or.jp';

// ── Entry points ──────────────────────────────────────────────

function doGet(e) {
  const action   = e.parameter.action   || '';
  const callback = e.parameter.callback || '';
  let result;
  try {
    if      (action === 'test')                                    result = { ok: true };
    else if (action === 'getAll')                                  result = getAllData();
    else if (action === 'scrapeRates' || action === 'scrapeKenpoRates') result = scrapeKenpoRates();
    else if (action === 'importWageLedgerR7')                       result = importWageLedgerR7()
    else if (action === 'importWageLedgerR8')                       result = importWageLedgerR8()
    else if (action === 'importPayrolls') {
      let incoming = [];
      try { incoming = JSON.parse(e.parameter.payrolls || '[]'); } catch(err) { incoming = []; }
      if (incoming.length) {
        const existing = sheetToObjects(getSheet(SHEET_PAY));
        const payMap = {};
        existing.forEach(function(p) {
          payMap[String(parseInt(p.no)) + '_' + p.year + '_' + p.month] = p;
        });
        incoming.forEach(function(fp) {
          const k = fp.no + '_' + fp.year + '_' + fp.month;
          if (payMap[k]) { Object.assign(payMap[k], fp); } else { payMap[k] = fp; }
        });
        const merged = Object.values(payMap).sort(function(a, b) {
          const nd = parseInt(a.no) - parseInt(b.no);
          if (nd !== 0) return nd;
          const yd = a.year - b.year;
          if (yd !== 0) return yd;
          return a.month - b.month;
        });
        saveSheet(SHEET_PAY, merged);
      }
      result = { ok: true, count: incoming.length };
    }
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
    if (data.type === 'employees') {
      if (data.employees && data.employees.length > 0) {
        saveSheet(SHEET_EMP, data.employees);
      }
      return jsonResponse({ ok: true, count: (data.employees || []).length });
    }
    if (data.type === 'appendLog') {
      appendLog(data);
      return jsonResponse({ ok: true });
    }
    if (data.type === 'importPayrolls') {
      const incoming = data.payrolls || [];
      if (incoming.length) {
        const existing = sheetToObjects(getSheet(SHEET_PAY));
        const payMap = {};
        existing.forEach(function(p) {
          payMap[String(parseInt(p.no)) + '_' + p.year + '_' + p.month] = p;
        });
        incoming.forEach(function(fp) {
          const k = fp.no + '_' + fp.year + '_' + fp.month;
          if (payMap[k]) { Object.assign(payMap[k], fp); } else { payMap[k] = fp; }
        });
        const merged = Object.values(payMap).sort(function(a, b) {
          const nd = parseInt(a.no) - parseInt(b.no);
          if (nd !== 0) return nd;
          const yd = a.year - b.year;
          if (yd !== 0) return yd;
          return a.month - b.month;
        });
        saveSheet(SHEET_PAY, merged);
      }
      return jsonResponse({ ok: true, count: incoming.length });
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
        if ((String(h) === 'from' || String(h) === 'shaho_start') && row[i] instanceof Date) {
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
  const rows = [headers, ...records.map(r => headers.map(function(h) {
    const v = r[h] !== undefined ? r[h] : '';
    // 배열·객체는 JSON 문자열로 직렬화 (예: families 배열)
    return (Array.isArray(v) || (v !== null && typeof v === 'object' && !(v instanceof Date)))
      ? JSON.stringify(v) : v;
  }))];
  sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
}

function appendLog(data) {
  const MAX_ROWS = 500;
  const headers = ['timestamp', 'logType', 'empCount', 'payrollCount', 'result', 'memo'];
  const sheet = getSheet(SHEET_LOG);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  const row = [ts, data.logType || '', data.empCount || 0, data.payrollCount || 0, data.result || '', data.memo || ''];
  sheet.insertRowAfter(1);
  sheet.getRange(2, 1, 1, row.length).setValues([row]);
  const total = sheet.getLastRow() - 1;
  if (total > MAX_ROWS) {
    sheet.deleteRows(MAX_ROWS + 2, total - MAX_ROWS);
  }
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

  const r2 = String(fiscal).padStart(2, '0');
  Logger.log('対象: ' + fromYr + '年度 (令和' + fiscal + '年度) / from=' + from);

  const opts = {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control':   'no-cache',
      'Pragma':          'no-cache',
      'Sec-Fetch-Dest':  'document',
      'Sec-Fetch-Mode':  'navigate',
      'Sec-Fetch-Site':  'none',
      'Upgrade-Insecure-Requests': '1',
    }
  };

  // ── Step 1: 年度ページを直接 URL 構築して取得（最速）──────────
  const directYearUrl = KENPO_INDEX_URL + 'r' + r2 + '/';
  Logger.log('Step1(direct): ' + directYearUrl);
  let idxHtml = kenpoFetch(directYearUrl, opts);
  let rates = idxHtml ? extractRatesFromHtml(idxHtml) : { kenko: null, kaigo: null };
  Logger.log('年度直接URL抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);

  // ── Step 2: インデックスページから年度リンクを探す ────────────
  if (rates.kenko == null) {
    Logger.log('Step2(index): ' + KENPO_INDEX_URL);
    const fetchedIdx = kenpoFetch(KENPO_INDEX_URL, opts);
    if (fetchedIdx) {
      if (!idxHtml) idxHtml = fetchedIdx;
      rates = extractRatesFromHtml(fetchedIdx);
      Logger.log('インデックスHTML抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);

      if (rates.kenko == null) {
        const yearUrl = findYearPageUrl(fetchedIdx, fromYr, fiscal);
        Logger.log('年度ページURL: ' + yearUrl);
        if (yearUrl) {
          const yearHtml = kenpoFetch(yearUrl, opts);
          if (yearHtml) {
            rates = extractRatesFromHtml(yearHtml);
            Logger.log('年度ページHTML抽出: kenko=' + rates.kenko + ' kaigo=' + rates.kaigo);
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
    }
  }

  // ── Step 3: インデックスページのPDFを直接試みる ─────────────
  if (rates.kenko == null && idxHtml) {
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
    .replace(/&[a-z]+;/gi, ' ')   // &darr; &rarr; &uarr; 等を除去
    .replace(/\s+/g, ' ');

  return extractRatesFromText(text);
}

function extractNumbers(text) {
  return (text.match(/\d{1,2}\.\d{1,3}(?:%|％)?/g) || [])
    .map(s => Number(s.replace(/[％%]/g, '')))
    .filter(v => !Number.isNaN(v));
}

function findNumberNearKeyword(text, keywordPattern, min, max, windowSize = 300) {
  const re = new RegExp(keywordPattern, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = Math.max(0, m.index - 120);
    const segment = text.slice(start, m.index + windowSize);
    const nums = extractNumbers(segment).filter(v => v >= min && v <= max);
    if (nums.length) return nums[0];
  }
  return null;
}

// 全角数字・記号 → 半角変換 (e.g. １０．３１％ → 10.31%)
function toHankaku(str) {
  return str
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/．/g, '.')
    .replace(/％/g, '%');
}

function extractRatesFromText(text) {
  if (!text) return { kenko: null, kaigo: null };

  const normalized = toHankaku(text.replace(/[　\s]+/g, ' ').replace(/\s+/g, ' ').trim());
  let kenko = null;
  let kaigo = null;
  let tokyoSegment = null;

  // 「東京都」を見つけ、直後〜次の都道府県名の前までを切り出し、そのセグメント内で率を抽出
  const tokyoIdx = normalized.indexOf('東京都');
  if (tokyoIdx >= 0) {
    const afterStart = tokyoIdx + 3; // '東京都' の3文字をスキップ
    const nextPrefPos = normalized.slice(afterStart).search(/[一-鿿]+[都道府県]/);
    const endPos = nextPrefPos > 0 ? afterStart + nextPrefPos : Math.min(normalized.length, tokyoIdx + 250);
    tokyoSegment = normalized.slice(tokyoIdx, endPos);
    const tokyoNums = extractNumbers(tokyoSegment).filter(v => v >= 1.0 && v <= 12.0);
    if (tokyoNums.length > 0) {
      const kenkoCandidates = tokyoNums.filter(v => v >= 8.0 && v <= 12.0);
      if (kenkoCandidates.length) kenko = kenkoCandidates[kenkoCandidates.length - 1];
      const kaigoCandidates = tokyoNums.filter(v => v >= 1.0 && v <= 3.5 && Math.abs(v - kenko) > 0.001);
      if (kaigoCandidates.length) kaigo = kaigoCandidates[kaigoCandidates.length - 1];
    }
  }

  // フォールバック: 東京セグメントに値がない場合はページ全体を検索
  if (kenko == null) {
    kenko = findNumberNearKeyword(normalized, '健康保険料率|健康保険料|協会けんぽ', 8.0, 12.0, 400);
  }
  if (kenko == null) {
    kenko = extractNumbers(normalized).find(v => v >= 8.0 && v <= 12.0) || null;
  }
  Logger.log('健康保険料率(東京)候補: ' + kenko);

  if (kaigo == null && tokyoSegment) {
    for (const pattern of ['介護保険料率', '介護保険.*?料率', '介護保険料', '介護保険']) {
      const found = findNumberNearKeyword(tokyoSegment, pattern, 1.0, 3.5, 200);
      if (found != null) { kaigo = found; break; }
    }
  }
  if (kaigo == null) {
    for (const pattern of ['介護保険料率', '介護保険.*?料率', '介護保険料', '介護保険']) {
      kaigo = findNumberNearKeyword(normalized, pattern, 1.0, 3.5, 400);
      if (kaigo != null) break;
    }
  }
  if (kaigo == null) {
    kaigo = extractNumbers(normalized).find(v => v >= 1.0 && v <= 3.5) || null;
  }
  Logger.log('介護保険料率候補: ' + kaigo);

  return { kenko, kaigo };
}

// ── 年度ページ URL を探す ──────────────────────────────────────

function findYearPageUrl(html, year, fiscal) {
  const yearStr  = String(year);
  const reiwaStr = '令和' + fiscal;
  const candidates = [];

  const re = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    let score = 0;

    if (text.includes(yearStr) || href.includes(yearStr) || text.includes(reiwaStr) || href.includes('r' + String(fiscal).padStart(2,'0'))) score += 30;
    if (text.includes('令和') || text.includes('年度') || href.includes('reiwa') || href.includes('年度')) score += 8;
    if (/保険料|料率/.test(text) || /保険料|料率/.test(href)) score += 5;
    if (/東京|東京都/.test(text) || /東京|東京都/.test(href)) score += 3;
    if (href.toLowerCase().endsWith('.pdf')) score += 2;

    if (score > 0) {
      candidates.push({ href, text, score });
    }
  }
  Logger.log('年度リンク候補: ' + JSON.stringify(candidates.slice(0, 8)));

  if (candidates.length === 0) return null;
  candidates.sort((a,b) => b.score - a.score);
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
    const res  = UrlFetchApp.fetch(url, opts);
    const code = res.getResponseCode();
    Logger.log('HTTP ' + code + ' : ' + url);

    if (code !== 200) {
      // 非200: レスポンスヘッダーと本文冒頭をログに出力してデバッグ支援
      try {
        const headers = res.getHeaders();
        Logger.log('レスポンスヘッダー: ' + JSON.stringify(headers));
      } catch(he) {}
      try {
        const body = res.getContentText('UTF-8');
        Logger.log('レスポンス本文先頭500: ' + body.substring(0, 500));
      } catch(be) {}
      return null;
    }

    return res.getContentText('UTF-8');
  } catch(e) {
    Logger.log('Fetch例外: ' + url + ' → ' + e.message);
    return null;
  }
}

// ── GAS 通信 (JSONP) ───────────────────────────────────────────
// フロントエンドは gasRequest() で呼び出す (gas.js 참조)

// ── 일본어 시트 → 한글 시트 마이그레이션 (한 번만 실행) ──────────
// GAS 편집기에서 직접 실행: migrateToKoreanSheets 선택 후 ▶ 실행
function migrateToKoreanSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pairs = [
    { from: SHEET_EMP_JP,  to: SHEET_EMP  },
    { from: SHEET_PAY_JP,  to: SHEET_PAY  },
    { from: SHEET_RATE_JP, to: SHEET_RATE },
  ];

  pairs.forEach(({ from, to }) => {
    const srcSheet = ss.getSheetByName(from);
    if (!srcSheet) {
      Logger.log('스킵 (없음): ' + from);
      return;
    }

    const srcData = srcSheet.getDataRange().getValues();
    if (srcData.length <= 1) {
      Logger.log('스킵 (데이터 없음): ' + from);
    } else {
      // 한글 시트가 없으면 생성, 있으면 내용 덮어쓰기
      let dstSheet = ss.getSheetByName(to);
      if (!dstSheet) dstSheet = ss.insertSheet(to);
      dstSheet.clearContents();
      dstSheet.getRange(1, 1, srcData.length, srcData[0].length).setValues(srcData);
      Logger.log('이전 완료: ' + from + ' → ' + to + ' (' + (srcData.length - 1) + '행)');
    }

    // 일본어 시트 삭제
    ss.deleteSheet(srcSheet);
    Logger.log('삭제 완료: ' + from);
  });

  Logger.log('마이그레이션 완료');
}

// ── 주간 자동 백업 ────────────────────────────────────────────────
// 매주 월요일 오전 9시 GAS 트리거로 자동 실행
// 별도 스프레드시트 WisePay_backup_YYYYMMDD 를 Drive에 생성, 최대 26개 유지
function backupWeekly() {
  const ts   = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  const name = 'WisePay_backup_' + ts;
  const main = SpreadsheetApp.getActiveSpreadsheet();

  // 새 스프레드시트 생성
  const backup = SpreadsheetApp.create(name);

  // 메인 시트 복사
  [SHEET_EMP, SHEET_PAY, SHEET_RATE, SHEET_LOG].forEach(function(sn) {
    const src = main.getSheetByName(sn);
    if (!src) return;
    const nr = src.getLastRow(), nc = src.getLastColumn();
    if (nr === 0 || nc === 0) return;
    const vals = src.getRange(1, 1, nr, nc).getValues();
    var dst = backup.getSheetByName(sn) || backup.insertSheet(sn);
    dst.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
  });

  // 기본 Sheet1 삭제
  try {
    var s1 = backup.getSheetByName('Sheet1');
    if (s1 && backup.getSheets().length > 1) backup.deleteSheet(s1);
  } catch(e) {}

  // 백업 이력 기록 (newest-first)
  var hist = getSheet('백업이력');
  if (hist.getLastRow() === 0) {
    hist.getRange(1, 1, 1, 3).setValues([['timestamp', 'filename', 'fileId']]);
  }
  hist.insertRowAfter(1);
  hist.getRange(2, 1, 1, 3).setValues([[ts, name, backup.getId()]]);

  deleteOldBackups();
  Logger.log('자동 백업 완료: ' + name + ' (ID: ' + backup.getId() + ')');
  return { ok: true, name: name };
}

// 26개 초과 시 오래된 백업 스프레드시트를 휴지통으로 이동
function deleteOldBackups() {
  var MAX = 26;
  var hist = getSheet('백업이력');
  if (hist.getLastRow() < 2) return;
  var data    = hist.getDataRange().getValues();
  var headers = data[0];
  var idIdx   = headers.indexOf('fileId');
  var rows    = data.slice(1); // newest first
  if (rows.length <= MAX) return;
  var toDelete = rows.slice(MAX);
  toDelete.forEach(function(row) {
    var fid = row[idIdx];
    if (!fid) return;
    try { DriveApp.getFileById(String(fid)).setTrashed(true); }
    catch(e) { Logger.log('백업 삭제 실패: ' + fid + ' / ' + e.message); }
  });
  hist.deleteRows(MAX + 2, rows.length - MAX);
  Logger.log((rows.length - MAX) + '개 오래된 백업 삭제');
}

// GAS 편집기에서 한 번만 실행 → 매주 월요일 오전 9시 트리거 등록
function createWeeklyBackupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'backupWeekly'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupWeekly')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();
  Logger.log('✅ 매주 월요일 오전 9시 자동 백업 트리거 설정 완료');
}

// ── 잔여 한글 시트 정리 (한 번만 실행) ───────────────────────────
// 보험료율이력 → 보험료율데이터, 직원정보 → 사원정보
function migrateExtraSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pairs = [
    { from: '보험료율이력', to: '보험료율데이터' },
    { from: '직원정보',     to: '사원정보'      },
  ];

  pairs.forEach(({ from, to }) => {
    const srcSheet = ss.getSheetByName(from);
    if (!srcSheet) { Logger.log('스킵 (없음): ' + from); return; }

    const srcData = srcSheet.getDataRange().getValues();
    if (srcData.length <= 1) {
      Logger.log('스킵 (데이터 없음): ' + from);
    } else {
      let dstSheet = ss.getSheetByName(to);
      if (!dstSheet) dstSheet = ss.insertSheet(to);
      dstSheet.clearContents();
      dstSheet.getRange(1, 1, srcData.length, srcData[0].length).setValues(srcData);
      Logger.log('이전 완료: ' + from + ' → ' + to + ' (' + (srcData.length - 1) + '행)');
    }

    ss.deleteSheet(srcSheet);
    Logger.log('삭제 완료: ' + from);
  });

  Logger.log('정리 완료');
}

// ── 보험요율데이터 → 보험료율데이터 데이터 이전 후 삭제 (한 번만 실행) ──
function migrateRateData() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName('보험요율데이터');
  if (!src) { Logger.log('보험요율데이터 시트 없음 — 스킵'); return; }

  const data = src.getDataRange().getValues();
  let dst = ss.getSheetByName('보험료율데이터');
  if (!dst) dst = ss.insertSheet('보험료율데이터');
  dst.clearContents();
  dst.getRange(1, 1, data.length, data[0].length).setValues(data);
  Logger.log('이전 완료: 보험요율데이터 → 보험료율데이터 (' + (data.length - 1) + '행)');

  ss.deleteSheet(src);
  Logger.log('삭제 완료: 보험요율데이터');
}

// ── freee 사원 CSV → 사원정보 시트 임포트 (한 번만 실행) ──────────
// 사전 준비: CSV 파일을 Google Drive 루트에 업로드
// 파일명: -freee=employee_exports_2026_5.csv
function importFreeeEmployees() {
  const FILE_NAME = '-freee=employee_exports_2026_5.csv';
  const files = DriveApp.getFilesByName(FILE_NAME);
  if (!files.hasNext()) {
    Logger.log('파일을 찾을 수 없음: ' + FILE_NAME);
    Logger.log('Google Drive 루트에 CSV 파일을 업로드한 후 재실행해 주세요.');
    return;
  }

  const csv  = files.next().getBlob().getDataAsString('UTF-8');
  const rows = Utilities.parseCsv(csv);
  if (rows.length < 2) { Logger.log('데이터 없음'); return; }

  const headers = rows[0];
  const col = name => headers.indexOf(name);

  // freee CSV 행 → WisePay 사원 객체
  const freeeEmps = [];
  for (let i = 1; i < rows.length; i++) {
    const r     = rows[i];
    const noStr = (r[col('従業員番号')] || '').trim();
    if (!noStr) continue;
    // 퇴직자 스킵
    if ((r[col('退職日')] || '').trim() !== '') continue;

    const families = [];
    for (let f = 1; f <= 8; f++) {
      const sei   = (r[col('家族情報' + f + ' 姓')] || '').trim();
      const mei   = (r[col('家族情報' + f + ' 名')] || '').trim();
      const birth = (r[col('家族情報' + f + ' 生年月日')] || '').trim();
      const name  = [sei, mei].filter(Boolean).join(' ');
      if (name && birth) families.push({ name: name, birth: birth });
    }

    freeeEmps.push({
      no:         parseInt(noStr, 10),
      name:       [(r[col('姓')] || '').trim(), (r[col('名')] || '').trim()].filter(Boolean).join(' '),
      kana:       [(r[col('姓カナ')] || '').trim(), (r[col('名カナ')] || '').trim()].filter(Boolean).join(' '),
      join:        r[col('入社日')]    || '',
      birth:       r[col('生年月日')] || '',
      kaigo:       'auto',
      koyo:       (r[col('雇用保険に加入しているか')] || '').indexOf('加入') !== -1 ? 'yes' : 'no',
      shotokuKbn: (r[col('所得税納税者区分')]         || '').indexOf('甲')  !== -1 ? 'ko'  : 'otsu',
      fuyouCount:  parseInt(r[col('扶養親族等の数')]) || 0,
      base:        0,
      commute:     parseInt((r[col('通勤手当の金額・単価')] || '0').toString().replace(/,/g, '')) || 0,
      families:    JSON.stringify(families),
    });
  }

  if (!freeeEmps.length) { Logger.log('변환된 사원 없음'); return; }

  // 기존 사원정보를 no 기준으로 읽어 upsert (신규 추가 + 기존 갱신)
  const existing = sheetToObjects(getSheet(SHEET_EMP));
  const empMap   = {};
  existing.forEach(function(e) { empMap[parseInt(e.no)] = e; });
  freeeEmps.forEach(function(fe) {
    if (empMap[fe.no]) {
      Object.assign(empMap[fe.no], fe);
    } else {
      empMap[fe.no] = fe;
    }
  });

  const merged = Object.values(empMap).sort(function(a, b) { return parseInt(a.no) - parseInt(b.no); });
  saveSheet(SHEET_EMP, merged);
  Logger.log('임포트 완료: ' + freeeEmps.length + '명 갱신, 합계 ' + merged.length + '명 → ' + SHEET_EMP);
}

// ── freee 급여 CSV → 급여데이터 시트 임포트 ─────────────────────────────
// 사전 준비: 3개 CSV 파일을 Google Drive 루트에 업로드
// 검색 조건: 파일명에 "payroll_books_2026" 포함
function importFreeePayrolls() {
  const iter = DriveApp.searchFiles("title contains 'payroll_books_2026'");
  const payrolls = [];

  while (iter.hasNext()) {
    const file = iter.next();
    const csv  = file.getBlob().getDataAsString('UTF-8');
    const rows = Utilities.parseCsv(csv);
    if (rows.length < 2) continue;

    const headers = rows[0];
    const col = function(name) { return headers.indexOf(name); };

    for (var i = 1; i < rows.length; i++) {
      const r = rows[i];
      // 지급일 없는 행(빈 행) 스킵
      const dateStr = (r[col('支給月日')] || '').toString().trim();
      if (!dateStr) continue;
      const parts = dateStr.split('/');
      if (parts.length < 2) continue;
      const year  = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (!year || !month) continue;

      const no = parseInt((r[col('従業員番号')] || '').toString().trim(), 10);
      if (!no) continue;

      // 컬럼이 없거나 빈 값이면 0 반환
      const gv = function(name) {
        const idx = col(name);
        if (idx < 0 || idx >= r.length) return 0;
        const v = (r[idx] || '').toString().replace(/,/g, '').trim();
        return v === '' ? 0 : (parseInt(v, 10) || 0);
      };

      payrolls.push({
        no:             no,
        name:           (r[col('従業員名')] || '').toString().trim(),
        year:           year,
        month:          month,
        'r-base':       gv('基本給'),
        'r-ot':         gv('時間外手当'),           // PYG는 컬럼 없음 → 0
        'r-kintai':     gv('欠勤控除') + gv('遅刻早退控除'),
        'r-commute':    gv('非課税通勤手当'),
        'r-commutetax': gv('課税通勤手当'),
        'r-kinmu':      gv('勤務手当'),             // PYG는 컬럼 없음 → 0
        'r-shokumu':    gv('職務手当'),
        'r-field':      0,
        'k-jumin':      gv('住民税'),
        'k-nencho':     gv('年末調整'),             // 年末調整精算 아닌 年末調整 사용
        '_net':         gv('差引支給金額'),
      });
    }
    Logger.log('읽기 완료: ' + file.getName());
  }

  if (!payrolls.length) {
    Logger.log('데이터 없음 — Google Drive에 payroll_books_2026 CSV가 있는지 확인하세요.');
    return;
  }

  // 기존 급여데이터를 no+year+month 기준으로 맵
  const existing = sheetToObjects(getSheet(SHEET_PAY));
  const payMap   = {};
  existing.forEach(function(p) {
    payMap[String(parseInt(p.no)) + '_' + p.year + '_' + p.month] = p;
  });

  // upsert: 기존 레코드는 갱신, 신규는 추가
  payrolls.forEach(function(fp) {
    const k = fp.no + '_' + fp.year + '_' + fp.month;
    if (payMap[k]) {
      Object.assign(payMap[k], fp);
    } else {
      payMap[k] = fp;
    }
  });

  // no → year → month 순 정렬
  const merged = Object.values(payMap).sort(function(a, b) {
    const nd = parseInt(a.no) - parseInt(b.no);
    if (nd !== 0) return nd;
    const yd = a.year - b.year;
    if (yd !== 0) return yd;
    return a.month - b.month;
  });

  saveSheet(SHEET_PAY, merged);
  Logger.log('임포트 완료: ' + payrolls.length + '건 갱신, 합계 ' + merged.length + '건 → ' + SHEET_PAY);
}

// ── 賃金台帳(令和7年) データ → 급여데이터 시트 반영 ─────────────────
// GAS 편집기에서 실행: 함수 목록에서 importWageLedgerR7 선택 후 ▶ 실행
// 또는 웹 URL에 ?action=importWageLedgerR7&callback=xxx 추가
//
// ★ 포인트: 標準報酬月額 수동 지정(r-hyo)
//   - 鄭 基石 2025/09,10 → r-hyo=260000 (수시개정 전 구등급 유지)
//   - 朴 修完 2025/04~11 → r-hyo=300000 (자격취득시 등급, 통근포함 자동계산=320000와 불일치)
// ★ 年末調整: 환급(還付)은 음수 — 총공제액을 줄여 차인지급액 증가
//   - 鄭 基石 2024/12: k-nencho=-31280
//   - 朴 娟慶 2024/12: k-nencho=-21000
function importWageLedgerR7() {
  const incoming = [
    // ── 鄭 基石 (No.000002) ──
    // 12月分(2024年12): 기본200,000+근무12,200+직무50,000 / 년말조정환급-31,280
    { no:2, name:'鄭 基石', year:2024, month:12, 'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':-31280,'_net':244076 },
    { no:2, name:'鄭 基石', year:2025, month:1,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':0,     '_net':212796 },
    { no:2, name:'鄭 基石', year:2025, month:2,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':0,     '_net':212796 },
    { no:2, name:'鄭 基石', year:2025, month:3,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':0,     '_net':212900 },
    { no:2, name:'鄭 基石', year:2025, month:4,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':0,     '_net':212900 },
    { no:2, name:'鄭 基石', year:2025, month:5,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':0,     '_net':212900 },
    { no:2, name:'鄭 基石', year:2025, month:6,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':0,     '_net':212900 },
    { no:2, name:'鄭 基石', year:2025, month:7,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':0,     '_net':212900 },
    { no:2, name:'鄭 基石', year:2025, month:8,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':12200,'r-shokumu':50000,'r-field':0,'r-hyo':0,     'k-jumin':5000,'k-nencho':0,     '_net':212900 },
    // 9,10月: 직무手当15,000のみ・給与減少も標準報酬月額は随時改定前260,000のまま
    { no:2, name:'鄭 基石', year:2025, month:9,  'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,   'r-shokumu':15000,'r-field':0,'r-hyo':260000,'k-jumin':4900,'k-nencho':0,     '_net':167450 },
    { no:2, name:'鄭 基石', year:2025, month:10, 'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,   'r-shokumu':15000,'r-field':0,'r-hyo':260000,'k-jumin':5300,'k-nencho':0,     '_net':167050 },
    // 11月: 随時改定後220,000등급 (자동계산과 일치, r-hyo=0)
    { no:2, name:'鄭 基石', year:2025, month:11, 'r-base':200000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,   'r-shokumu':15000,'r-field':0,'r-hyo':0,     'k-jumin':4900,'k-nencho':0,     '_net':173200 },
    // ── 朴 娟慶 (No.000017) ──
    // 12月分(2024年12): 년말조정환급-21,000
    { no:17, name:'朴 娟慶', year:2024, month:12, 'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':-21000,'_net':313406 },
    { no:17, name:'朴 娟慶', year:2025, month:1,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':0,     '_net':292406 },
    { no:17, name:'朴 娟慶', year:2025, month:2,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':0,     '_net':292406 },
    { no:17, name:'朴 娟慶', year:2025, month:3,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':0,     '_net':292550 },
    { no:17, name:'朴 娟慶', year:2025, month:4,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':0,     '_net':292730 },
    { no:17, name:'朴 娟慶', year:2025, month:5,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':0,     '_net':292730 },
    { no:17, name:'朴 娟慶', year:2025, month:6,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':0,     '_net':292730 },
    { no:17, name:'朴 娟慶', year:2025, month:7,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':0,     '_net':292730 },
    { no:17, name:'朴 娟慶', year:2025, month:8,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6400,'k-nencho':0,     '_net':292730 },
    { no:17, name:'朴 娟慶', year:2025, month:9,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6700,'k-nencho':0,     '_net':292430 },
    { no:17, name:'朴 娟慶', year:2025, month:10, 'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':8200,'k-nencho':0,     '_net':290930 },
    { no:17, name:'朴 娟慶', year:2025, month:11, 'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':0,'k-jumin':6700,'k-nencho':0,     '_net':292430 },
    // ── 朴 修完 (No.000019) 入社: 令和7年2月10日 ──
    // 2,3月分: 社会保険未加入 (r-hyo=0で保険額=0として計算)
    { no:19, name:'朴 修完', year:2025, month:2,  'r-base':136000,'r-ot':5000, 'r-kintai':0,'r-commute':2880, 'r-commutetax':0,'r-kinmu':68000, 'r-shokumu':0,'r-field':0,'r-hyo':0,     'k-jumin':0,'k-nencho':0,'_net':206750 },
    { no:19, name:'朴 修完', year:2025, month:3,  'r-base':200000,'r-ot':20400,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':0,     'k-jumin':0,'k-nencho':0,'_net':323410 },
    // 4月~11月: 資格取得時標準報酬月額=300,000 (通勤込み自動計算=320,000 와 다름 → r-hyo=300000)
    { no:19, name:'朴 修完', year:2025, month:4,  'r-base':200000,'r-ot':3600, 'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':265843 },
    { no:19, name:'朴 修完', year:2025, month:5,  'r-base':200000,'r-ot':7200, 'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':269203 },
    { no:19, name:'朴 修完', year:2025, month:6,  'r-base':200000,'r-ot':10800,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':272673 },
    { no:19, name:'朴 修完', year:2025, month:7,  'r-base':200000,'r-ot':12000,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':273867 },
    { no:19, name:'朴 修完', year:2025, month:8,  'r-base':200000,'r-ot':15600,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':277347 },
    { no:19, name:'朴 修完', year:2025, month:9,  'r-base':200000,'r-ot':19200,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':280717 },
    { no:19, name:'朴 修完', year:2025, month:10, 'r-base':200000,'r-ot':20000,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':281513 },
    { no:19, name:'朴 修完', year:2025, month:11, 'r-base':200000,'r-ot':0,    'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':262363 },
  ];

  const existing = sheetToObjects(getSheet(SHEET_PAY));
  const payMap = {};
  existing.forEach(function(p) {
    payMap[String(parseInt(p.no)) + '_' + p.year + '_' + p.month] = p;
  });
  incoming.forEach(function(fp) {
    const k = fp.no + '_' + fp.year + '_' + fp.month;
    if (payMap[k]) { Object.assign(payMap[k], fp); } else { payMap[k] = fp; }
  });
  const merged = Object.values(payMap).sort(function(a, b) {
    const nd = parseInt(a.no) - parseInt(b.no);
    if (nd !== 0) return nd;
    const yd = a.year - b.year;
    if (yd !== 0) return yd;
    return a.month - b.month;
  });
  saveSheet(SHEET_PAY, merged);
  Logger.log('importWageLedgerR7 완료: ' + incoming.length + '건 → ' + SHEET_PAY);
  return { ok: true, count: incoming.length };
}

function importWageLedgerR8() {
  // payroll_book-2026 CSV 데이터 (익월 10일 지급: 지급일 전월이 급여월)
  // 鄭 基石(no=2) 5건, 朴 娟慶(no=17) 5건, 朴 修完(no=19) 5건
  const incoming = [
    // 鄭 基石 (no=2)
    { no:2,  name:'鄭 基石', year:2025, month:12, 'r-base':200000,'r-ot':28000,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':15000,'r-field':0,'r-hyo':220000,'k-jumin':4900,'k-nencho':-61980,'_net':262600 },
    { no:2,  name:'鄭 基石', year:2026, month:1,  'r-base':200000,'r-ot':26600,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':15000,'r-field':0,'r-hyo':220000,'k-jumin':4900,'k-nencho':0,'_net':199290 },
    { no:2,  name:'鄭 基石', year:2026, month:2,  'r-base':200000,'r-ot':1400, 'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':15000,'r-field':0,'r-hyo':220000,'k-jumin':4900,'k-nencho':0,'_net':174950 },
    { no:2,  name:'鄭 基石', year:2026, month:3,  'r-base':200000,'r-ot':37800,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':15000,'r-field':0,'r-hyo':220000,'k-jumin':4900,'k-nencho':0,'_net':210103 },
    { no:2,  name:'鄭 基石', year:2026, month:4,  'r-base':200000,'r-ot':2800, 'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':15000,'r-field':0,'r-hyo':220000,'k-jumin':4900,'k-nencho':0,'_net':176130 },
    // 朴 娟慶 (no=17)
    { no:17, name:'朴 娟慶', year:2025, month:12, 'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':360000,'k-jumin':6700,'k-nencho':-39700,'_net':332560 },
    { no:17, name:'朴 娟慶', year:2026, month:1,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':360000,'k-jumin':6700,'k-nencho':0,'_net':292860 },
    { no:17, name:'朴 娟慶', year:2026, month:2,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':360000,'k-jumin':6700,'k-nencho':0,'_net':292860 },
    { no:17, name:'朴 娟慶', year:2026, month:3,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':360000,'k-jumin':6700,'k-nencho':0,'_net':292914 },
    { no:17, name:'朴 娟慶', year:2026, month:4,  'r-base':360000,'r-ot':0,'r-kintai':0,'r-commute':0,'r-commutetax':0,'r-kinmu':0,'r-shokumu':0,'r-field':0,'r-hyo':360000,'k-jumin':6700,'k-nencho':0,'_net':292680 },
    // 朴 修完 (no=19)
    { no:19, name:'朴 修完', year:2025, month:12, 'r-base':200000,'r-ot':47500,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,    'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':-31860,'_net':340151 },
    { no:19, name:'朴 修完', year:2026, month:1,  'r-base':200000,'r-ot':12500,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,    'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':274794 },
    { no:19, name:'朴 修完', year:2026, month:2,  'r-base':200000,'r-ot':2500, 'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,    'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':265169 },
    { no:19, name:'朴 修完', year:2026, month:3,  'r-base':200000,'r-ot':80000,'r-kintai':0,'r-commute':13150,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':0,    'r-field':0,'r-hyo':300000,'k-jumin':0,'k-nencho':0,'_net':338253 },
    { no:19, name:'朴 修完', year:2026, month:4,  'r-base':200000,'r-ot':1250, 'r-kintai':0,'r-commute':21930,'r-commutetax':0,'r-kinmu':100000,'r-shokumu':8333,'r-field':0,'r-hyo':320000,'k-jumin':0,'k-nencho':0,'_net':277917 },
  ];

  const existing = sheetToObjects(getSheet(SHEET_PAY));
  const payMap = {};
  existing.forEach(function(p) {
    payMap[String(parseInt(p.no)) + '_' + p.year + '_' + p.month] = p;
  });
  incoming.forEach(function(fp) {
    const k = fp.no + '_' + fp.year + '_' + fp.month;
    if (payMap[k]) { Object.assign(payMap[k], fp); } else { payMap[k] = fp; }
  });
  const merged = Object.values(payMap).sort(function(a, b) {
    const nd = parseInt(a.no) - parseInt(b.no);
    if (nd !== 0) return nd;
    const yd = a.year - b.year;
    if (yd !== 0) return yd;
    return a.month - b.month;
  });
  saveSheet(SHEET_PAY, merged);
  Logger.log('importWageLedgerR8 완료: ' + incoming.length + '건 → ' + SHEET_PAY);
  return { ok: true, count: incoming.length };
}
