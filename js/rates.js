// 수정: 2026-05-21 10:44 — 빈 날짜 요율 이력 항목 방지 (updateRateHistoryFrom 유효성 검사)
'use strict';
function openRateModal() {
  const jp = LANG==='JP';
  const curRates = getRatesForYM(currentYear, currentMonth);
  const ym = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  const defs=[
    {key:'kenko', jp:'健康保険料率（東京都）', kr:'건강보험료율（도쿄도）'},
    {key:'kaigo', jp:'介護保険料率（全国一律）', kr:'개호보험료율（전국）'},
    {key:'kodomo',jp:'子育て支援金率（全国一律）',kr:'자녀지원금율（전국）'},
    {key:'nenkin',jp:'厚生年金保険料率',kr:'후생연금보험료율'},
    {key:'koyo',  jp:'雇用保険料率（労働者負担）',kr:'고용보험료율（근로자）'},
  ];
  const area=document.getElementById('rateModalRows');
  area.innerHTML=`<div style="font-size:12px;background:var(--accent2);border:1px solid var(--accent3);border-radius:var(--r2);padding:8px 10px;margin-bottom:12px;color:#3730a3;">
    ${jp?`${currentYear}年${currentMonth}月の保険料率を確認・登録します`:`${currentYear}년 ${currentMonth}월 보험료율을 확인・등록합니다`}
    <br><span style="font-size:11px;opacity:0.8;">${jp?`（適用中: ${curRates.from}以降の料率）`:`（적용 중: ${curRates.from} 이후 요율）`}</span>
  </div>`;
  defs.forEach(d=>{
    const row=document.createElement('div');
    row.className='rate-row';
    row.innerHTML=`<span>${jp?d.jp:d.kr}</span><div class="rate-row-r"><input class="rate-row-input" id="mi-${d.key}" type="number" step="0.01" value="${curRates[d.key]}"><span style="font-size:12px;color:var(--text3)">%</span></div>`;
    area.appendChild(row);
  });
  openModal('modal-rates');
}

function applyRates() {
  const jp = LANG==='JP';
  const newRates = {};
  ['kenko','kaigo','kodomo','nenkin','koyo'].forEach(k=>{
    const v=parseFloat(document.getElementById('mi-'+k).value);
    if(!isNaN(v)) newRates[k]=v;
  });
  // 현재 선택 월에 요율 저장
  const ym = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  const existing = rateHistory.findIndex(r => r.from === ym);
  const entry = { from:ym, ...newRates };
  if(existing >= 0) rateHistory[existing] = entry;
  else { rateHistory.push(entry); rateHistory.sort((a,b) => a.from > b.from ? 1 : -1); }
  saveRateHistory();
  // 현재 rates 업데이트
  rates = { ...rates, ...newRates };
  updateRatesDisplay(); recalc(); renderRatesPage();
  closeModal('modal-rates');
  // 배너 숨기기
  const bannerEl = document.getElementById('rate-month-banner');
  if(bannerEl) bannerEl.style.display = 'none';
  const now=new Date();
  document.getElementById('ratesUpdatedTxt').textContent=
    (jp?`${currentYear}年${currentMonth}月の料率を登録しました ✓`:`${currentYear}년 ${currentMonth}월 요율을 등록했습니다 ✓`);
  showToast(jp?`${currentYear}年${currentMonth}月の保険料率を登録しました ✓`:`${currentYear}년 ${currentMonth}월 요율 등록됨 ✓`,'s');
}

function updateRatesDisplay() {
  ['kenko','kaigo','kodomo','nenkin','koyo'].forEach(k=>{const el=document.getElementById('rt-'+k);if(el)el.textContent=rates[k].toFixed(2)+'%';});
}

function renderRatesPage() {
  const jp = LANG==='JP';
  const area=document.getElementById('ratesFormArea');
  area.innerHTML='';

  // 이력 테이블
  const keys = ['kenko','kaigo','kodomo','nenkin','koyo'];
  const labels = jp
    ? ['健康保険料率','介護保険料率','子育て支援金率','厚生年金料率','雇用保険料率']
    : ['건강보험료율','개호보험료율','자녀지원금율','후생연금료율','고용보험료율'];

  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
    <colgroup>
      <col style="width:20%;">
      ${keys.map(()=>'<col style="width:14%;">').join('')}
      <col style="width:10%;">
    </colgroup>
    <thead>
      <tr style="background:var(--surface2);">
        <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:600;color:var(--text2);">${jp?'適用開始月':'적용 시작월'}</th>
        ${keys.map((k,i)=>`<th style="padding:8px 4px;text-align:center;border-bottom:1px solid var(--border);font-weight:600;color:var(--text2);font-size:11px;word-break:keep-all;line-height:1.3;">${labels[i]}</th>`).join('')}
        <th style="padding:8px 4px;border-bottom:1px solid var(--border);"></th>
      </tr>
    </thead>
    <tbody id="rateHistoryTbody"></tbody>
  </table>
  <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <button class="btn btn-success btn-sm" onclick="addRateHistoryRow()">${jp?'+ 新しい月の料率を追加':'+ 새 월 요율 추가'}</button>
    <span style="font-size:11px;color:var(--text3);">${jp?'月を選択して「最新要率を取得」ボタンでも追加できます':'월 선택 후 「최신 요율 가져오기」로도 추가 가능'}</span>
  </div>`;
  area.innerHTML = html;
  renderRateHistoryRows();
}

function renderRateHistoryRows() {
  const jp = LANG==='JP';
  const tbody = document.getElementById('rateHistoryTbody');
  if(!tbody) return;
  const keys = ['kenko','kaigo','kodomo','nenkin','koyo'];
  tbody.innerHTML = '';
  [...rateHistory].sort((a,b)=>a.from>b.from?-1:1).forEach((r,i) => {
    // 현재 선택 월에 적용 중인 요율인지 표시
    const curApplied = getRatesForYM(currentYear, currentMonth);
    const isCurrent = curApplied.from === r.from;
    const tr = document.createElement('tr');
    tr.style.background = isCurrent ? 'var(--accent2)' : '';
    tr.innerHTML = `
      <td style="padding:6px 8px;border-bottom:1px solid var(--border2);">
        <input type="month" value="${r.from}"
          style="width:100%;border:1px solid var(--border);border-radius:4px;padding:3px 4px;font-size:11px;font-family:inherit;background:var(--surface);color:var(--text);box-sizing:border-box;"
          onchange="updateRateHistoryFrom(${rateHistory.indexOf(r)}, this.value)">
        ${isCurrent?`<div style="margin-top:3px;"><span style="font-size:10px;background:var(--accent);color:white;border-radius:20px;padding:1px 6px;">${jp?'適用中':'적용 중'}</span></div>`:''}
      </td>
      ${keys.map(k=>`<td style="padding:6px 4px;border-bottom:1px solid var(--border2);">
        <div style="display:flex;align-items:center;gap:1px;">
          <input type="number" step="0.01" value="${r[k]}"
            style="width:0;flex:1;min-width:0;text-align:right;border:1px solid var(--border);border-radius:4px;padding:3px 3px;font-size:12px;font-family:inherit;box-sizing:border-box;"
            onchange="updateRateHistoryVal(${rateHistory.indexOf(r)},'${k}',this.value)">
          <span style="font-size:10px;color:var(--text3);flex-shrink:0;">%</span>
        </div>
      </td>`).join('')}
      <td style="padding:6px 4px;border-bottom:1px solid var(--border2);text-align:center;">
        <button class="btn btn-sm" onclick="deleteRateHistoryRow(${rateHistory.indexOf(r)})" style="color:var(--red);padding:2px 6px;font-size:11px;">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function addRateHistoryRow() {
  // 가장 최근 항목을 복사해서 다음 달로 추가
  const last = [...rateHistory].sort((a,b)=>a.from>b.from?-1:1)[0];
  const nextYM = last ? (() => {
    const [y,m] = last.from.split('-').map(Number);
    const nm = m===12?1:m+1, ny = m===12?y+1:y;
    return `${ny}-${String(nm).padStart(2,'0')}`;
  })() : `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  if(rateHistory.find(r=>r.from===nextYM)) { showToast(LANG==='JP'?'その月は既に登録済みです':'이미 등록된 월입니다','w'); return; }
  const base = last || { kenko:9.85,kaigo:1.62,kodomo:0.23,nenkin:18.30,koyo:0.50 };
  rateHistory.push({ from:nextYM, kenko:base.kenko, kaigo:base.kaigo, kodomo:base.kodomo, nenkin:base.nenkin, koyo:base.koyo });
  rateHistory.sort((a,b)=>a.from>b.from?1:-1);
  saveRateHistory();
  renderRateHistoryRows();
}

function updateRateHistoryFrom(idx, newFrom) {
  if(!newFrom) { renderRateHistoryRows(); return; }
  if(rateHistory.find((r,i)=>i!==idx&&r.from===newFrom)) { showToast(LANG==='JP'?'その月は既に登録済みです':'이미 등록된 월입니다','w'); renderRateHistoryRows(); return; }
  rateHistory[idx].from = newFrom;
  rateHistory.sort((a,b)=>a.from>b.from?1:-1);
  saveRateHistory();
  renderRateHistoryRows();
  applyRatesForYM(currentYear, currentMonth);
  updateRatesDisplay(); recalc();
}

function updateRateHistoryVal(idx, key, val) {
  const v = parseFloat(val);
  if(isNaN(v)) return;
  rateHistory[idx][key] = v;
  saveRateHistory();
  applyRatesForYM(currentYear, currentMonth);
  updateRatesDisplay(); recalc();
  showToast(LANG==='JP'?'保険料率を更新しました':'요율 업데이트됨','s');
}

function deleteRateHistoryRow(idx) {
  if(rateHistory.length <= 1) { showToast(LANG==='JP'?'最低1件は必要です':'최소 1개는 필요합니다','w'); return; }
  const jp = LANG==='JP';
  if(!confirm(jp?`${rateHistory[idx].from}の料率を削除しますか？`:`${rateHistory[idx].from} 요율을 삭제하시겠습니까?`)) return;
  rateHistory.splice(idx,1);
  saveRateHistory();
  renderRateHistoryRows();
  applyRatesForYM(currentYear, currentMonth);
  updateRatesDisplay(); recalc();
}

function saveRatesPage() {
  saveRateHistory();
  showToast(LANG==='JP'?'保険料率履歴を保存しました ✓':'보험료율 이력을 저장했습니다 ✓','s');
}

// ══ RATES HISTORY ══
// 해당 연월에 적용할 요율 반환
function getRatesForYM(year, month) {
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  // 해당 월 이하 중 가장 최근 항목 찾기
  const sorted = [...rateHistory].sort((a,b) => a.from > b.from ? -1 : 1);
  const found = sorted.find(r => r.from <= ym);
  if(found) return {...found};
  // 없으면 가장 오래된 것 반환
  const oldest = [...rateHistory].sort((a,b) => a.from > b.from ? 1 : -1)[0];
  return oldest ? {...oldest} : { kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 };
}

// 해당 연월의 요율로 rates 업데이트
function applyRatesForYM(year, month) {
  const r = getRatesForYM(year, month);
  rates = { kenko:r.kenko, kaigo:r.kaigo, kodomo:r.kodomo, nenkin:r.nenkin, koyo:r.koyo };
  updateRatesDisplay();
  // 해당 월 요율이 등록되어 있는지 확인 (정확히 from이 일치하는 항목)
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const exact = rateHistory.find(r => r.from === ym);
  return !!exact;
}

function saveRateHistory() {
  localStorage.setItem(LS.rateHistory, JSON.stringify(rateHistory));
}
function checkRateBanner() {
  const alarmBanner = document.getElementById('rate-alarm-banner');
  if (alarmBanner) {
    const has2026 = rateHistory.some(r => r.from >= '2026-03');
    alarmBanner.style.display = has2026 ? 'none' : '';
  }
}

