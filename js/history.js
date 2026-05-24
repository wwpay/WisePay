// 수정: 2026-05-24 18:18 — renderAnnual 익월지급 대응: 전년12월~당년11월 표시 + 연도 드롭다운 年度 표기
'use strict';
function buildAnnualEmpSel() {
  const sel = document.getElementById('annualEmpSel');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  let firstVal = '';
  employees.forEach((e,i) => {
    if (!e || e.no == null) return;
    const o = document.createElement('option');
    o.value = i; o.textContent = `${e.name}（${String(e.no).padStart(4,'0')}）`;
    if (firstVal === '') firstVal = String(i);
    sel.appendChild(o);
  });
  sel.value = (prev !== '' && employees[parseInt(prev)]) ? prev : firstVal;
}

// GAS import 시 숫자값으로 저장될 수 있으므로 string/number 모두 처리
function safeInt(v) { return parseInt(String(v == null ? '0' : v).replace(/,/g, '')) || 0; }

function calcMonthData(emp, year, month) {
  const key = `kyuyo_p_${String(emp.no).padStart(4,'0')}_${year}_${month}`;
  const s = localStorage.getItem(key);
  if(!s) return null;
  try {
    const d = JSON.parse(s);
    const base=safeInt(d['r-base']), ot=safeInt(d['r-ot']), kintai=safeInt(d['r-kintai']);
    const commute=safeInt(d['r-commute']), commutetax=safeInt(d['r-commutetax']);
    const kinmu=safeInt(d['r-kinmu']);
    const shokumu=safeInt(d['r-shokumu']), field=safeInt(d['r-field']);
    const jumin=safeInt(d['k-jumin']), nencho=safeInt(d['k-nencho']);
    const totalPay = base+ot-kintai+commute+commutetax+kinmu+shokumu+field;
    const hyo = getHyo(base-kintai+commute+commutetax+kinmu+shokumu+field);
    // 해당 월의 정확한 요율 사용
    const r = getRatesForYM(year, month);
    const kenko=Math.floor(hyo*r.kenko/100/2);
    const kaigo2=isKaigo(emp)?Math.floor(hyo*r.kaigo/100/2):0;
    const kodomo=Math.floor(hyo*r.kodomo/100/2);
    const nenkin=Math.floor(hyo*r.nenkin/100/2);
    const koyoEnabled = emp.koyo !== 'no';
    const koyo=koyoEnabled ? Math.round(totalPay*r.koyo/100) : 0;
    const shakai=kenko+kaigo2+kodomo+nenkin+koyo;
    const shotokuBase = totalPay-commute-shakai;
    const fuyou = parseInt(emp.fuyouCount)||0;
    const isOtsu = (emp.shotokuKbn||'ko') === 'otsu';
    let shotoku = Math.max(0, calcShotoku(shotokuBase, fuyou, isOtsu));
    const totalKojo=shakai+shotoku+jumin+nencho;
    const net=totalPay-totalKojo;
    return {totalPay,kenko,kaigo:kaigo2,kodomo,nenkin,koyo,shakai,shotoku,jumin,nencho,totalKojo,net};
  } catch(e){ return null; }
}

function renderAnnual() {
  const jp = LANG==='JP';
  if (!employees.length) {
    document.getElementById('annualContent').innerHTML =
      `<div style="padding:40px;text-align:center;color:var(--text3);">${jp?'従業員データがありません。まずGoogle同期を行ってください。':'사원 데이터가 없습니다. Google 동기화를 먼저 해주세요.'}</div>`;
    return;
  }
  const empIdx = parseInt(document.getElementById('annualEmpSel')?.value);
  const year = parseInt(document.getElementById('annualYearSel')?.value)||2026;
  if(isNaN(empIdx)||!employees[empIdx]) {
    document.getElementById('annualContent').innerHTML =
      `<div style="padding:40px;text-align:center;color:var(--text3);">${jp?'従業員を選択してください':'사원을 선택해 주세요'}</div>`;
    return;
  }
  const emp = employees[empIdx];
  const mu = jp?'月':'월';
  const fmt = n => n.toLocaleString();

  // 인쇄 헤더
  const ph = document.getElementById('annualPrintHeader');
  ph.style.display='block';
  document.getElementById('annualPrintTitle').textContent = `${emp.name}（${String(emp.no).padStart(4,'0')}） ${year}${jp?'年度':'년도'} ${jp?'年間給与一覧':'연간 급여 일람'}`;
  document.getElementById('annualPrintSub').textContent = jp?`出力日：${new Date().toLocaleDateString('ja-JP')}`:`출력일：${new Date().toLocaleDateString('ko-KR')}`;

  const rows = [
    {key:'totalPay', label:jp?'支給総額':'지급총액'},
    {key:'shakai',   label:jp?'社会保険計':'사회보험계'},
    {key:'kenko',    label:jp?'健康保険料':'건강보험료'},
    {key:'kaigo',    label:jp?'介護保険料':'개호보험료'},
    {key:'nenkin',   label:jp?'厚生年金':'후생연금'},
    {key:'koyo',     label:jp?'雇用保険':'고용보험'},
    {key:'shotoku',  label:jp?'所得税':'소득세'},
    {key:'jumin',    label:jp?'住民税':'주민세'},
    {key:'nencho',   label:jp?'年末調整':'연말정산'},
    {key:'totalKojo',label:jp?'控除合計':'공제합계'},
    {key:'net',      label:jp?'手取り':'실수령액'},
  ];

  // 익월 10일 지급: 前年12月～当年11月 (12ヶ月) を表示
  // 예) 2026년도 = 2025-12 근무분(2026-01 지급) ~ 2026-11 근무분(2026-12 지급)
  const fiscalMonths = [
    { year: year-1, month: 12 },
    ...Array.from({length:11}, (_,i) => ({ year, month: i+1 }))
  ];

  const monthData = fiscalMonths.map(({year:y, month:m}) => calcMonthData(emp, y, m));
  const hasAny = monthData.some(d=>d!==null);

  if(!hasAny) {
    document.getElementById('annualContent').innerHTML =
      `<div style="padding:40px;text-align:center;color:var(--text3);">${jp?'この年度のデータがありません':'이 연도의 데이터가 없습니다'}</div>`;
    return;
  }

  // 데이터 있는 마지막 인덱스까지만 표시
  let lastIdx = 0;
  for(let i=0; i<12; i++) { if(monthData[i] !== null) lastIdx = i; }
  const showCount = lastIdx + 1;
  const cols = `grid-template-columns:100px repeat(${showCount},1fr);`;

  // 합계 (표시 범위 내에서만)
  const totals = {};
  rows.forEach(r => {
    totals[r.key] = monthData.slice(0, showCount).reduce((s,d) => s+(d?d[r.key]:0), 0);
  });

  let html = `<div class="annual-wrap">`;
  // 헤더: 전년12월은 별도 표기
  html += `<div class="annual-head-row" style="${cols}"><div>${jp?'項目':'항목'}</div>`;
  for(let i=0; i<showCount; i++) {
    const {year:y, month:m} = fiscalMonths[i];
    const label = (m===12 && y===year-1) ? (jp?`前年${m}${mu}`:`전년${m}${mu}`) : `${m}${mu}`;
    html += `<div>${label}</div>`;
  }
  html += `</div>`;

  // 데이터 행
  rows.forEach(r => {
    const isBold = r.key==='net'||r.key==='totalPay';
    html += `<div class="annual-data-row${r.key==='net'?' total-row':''}" style="${cols}">`;
    html += `<div style="${isBold?'font-weight:600;':''}">${r.label}</div>`;
    for(let i=0;i<showCount;i++) {
      const d = monthData[i];
      if(d) {
        const val = d[r.key];
        const color = r.key==='net'?'color:var(--accent);font-weight:600;':'';
        html += `<div style="${color}">${fmt(val)}</div>`;
      } else {
        html += `<div class="annual-no-data">-</div>`;
      }
    }
    html += `</div>`;
  });

  // 합계 행
  html += `<div class="annual-data-row total-row" style="${cols}">`;
  html += `<div>${jp?'年計':'연계'}</div>`;
  for(let i=0;i<showCount;i++) {
    html += monthData[i]
      ? `<div style="color:var(--accent);font-weight:600;">${fmt(monthData[i].net)}</div>`
      : `<div class="annual-no-data">-</div>`;
  }
  html += `</div>`;

  // 연간 합계 요약
  html += `</div>`;
  html += `<div style="margin-top:12px;background:var(--accent2);border:1px solid var(--accent3);border-radius:var(--r);padding:12px 16px;display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px;">`;
  html += `<span><strong>${jp?'年間支給合計':'연간 지급 합계'}:</strong> ¥${fmt(totals.totalPay)}</span>`;
  html += `<span><strong>${jp?'年間控除合計':'연간 공제 합계'}:</strong> ¥${fmt(totals.totalKojo)}</span>`;
  html += `<span style="font-size:14px;font-weight:700;color:var(--accent);"><strong>${jp?'年間手取り合計':'연간 실수령 합계'}:</strong> ¥${fmt(totals.net)}</span>`;
  html += `</div>`;

  document.getElementById('annualContent').innerHTML = html;
}

// ══ HISTORY ══
function buildHistEmpSel() {
  const sel=document.getElementById('histEmpSel');
  if(!sel) return;
  sel.innerHTML=`<option value="all">${LANG==='JP'?'全員':'전체'}</option>`;
  employees.forEach((e,i)=>{ if(!e||e.no==null) return; const o=document.createElement('option'); o.value=i; o.textContent=`${String(e.no).padStart(4,'0')} ${e.name}`; sel.appendChild(o); });
}

function renderHistory() {
  const tbody=document.getElementById('historyBody');
  if(!tbody) return;
  const year=parseInt(document.getElementById('histYearSel').value);
  const empSel=document.getElementById('histEmpSel').value;
  tbody.innerHTML='';
  const rows=[];
  employees.forEach((emp,ei)=>{
    if(empSel!=='all'&&parseInt(empSel)!==ei) return;
    for(let m=1;m<=12;m++){
      const s=localStorage.getItem(`kyuyo_p_${String(emp.no).padStart(4,'0')}_${year}_${m}`);
      if(!s) continue;
      try { rows.push({m,emp,d:JSON.parse(s)}); } catch(e){}
    }
  });
  if(!rows.length){ tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:25px;color:var(--text3);">${LANG==='JP'?'データがありません':'데이터 없음'}</td></tr>`; return; }
  rows.forEach(({m,emp,d})=>{
    const base=safeInt(d['r-base']),ot=safeInt(d['r-ot']),kintai=safeInt(d['r-kintai']),commute=safeInt(d['r-commute']),commutetax=safeInt(d['r-commutetax']),kinmu=safeInt(d['r-kinmu']),shokumu=safeInt(d['r-shokumu']),field=safeInt(d['r-field']);
    const totalPay=base+ot-kintai+commute+commutetax+kinmu+shokumu+field;
    // 標準報酬月額：残業手当(ot)は変動給のため除外
    const hyo=getHyo(base-kintai+commute+commutetax+kinmu+shokumu+field);
    const r=getRatesForYM(year,m);
    const kenko=Math.floor(hyo*r.kenko/100/2);
    const kaigo2=isKaigo(emp)?Math.floor(hyo*r.kaigo/100/2):0;
    const kodomo=Math.floor(hyo*r.kodomo/100/2);
    const nenkin=Math.floor(hyo*r.nenkin/100/2);
    const koyo=Math.floor(totalPay*r.koyo/100);
    const shakai=kenko+kaigo2+kodomo+nenkin+koyo;
    const fuyou=parseInt(emp.fuyouCount)||0;
    const isOtsu=(emp.shotokuKbn||'ko')==='otsu';
    const shotoku=Math.max(0,calcShotoku(totalPay-commute-shakai,fuyou,isOtsu));
    const jumin=safeInt(d['k-jumin']),nencho=safeInt(d['k-nencho']);
    const totalKojo=shakai+shotoku+jumin+nencho;
    const net=totalPay-totalKojo;
    const mu=LANG==='JP'?'月':'월';
    const tr=document.createElement('tr');
    tr.onclick=()=>{ currentEmpIdx=employees.indexOf(emp); currentMonth=m; gotoPage('payroll',document.querySelector('.nav-item')); document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); document.querySelector('.nav-item').classList.add('active'); renderMonthTabs(); loadPayrollForm(); };
    tr.innerHTML=`<td>${m}${mu}</td><td>${emp.name}</td><td>¥${totalPay.toLocaleString()}</td><td>¥${totalKojo.toLocaleString()}</td><td style="font-weight:600;">¥${net.toLocaleString()}</td><td>¥${nenkin.toLocaleString()}</td><td>¥${kenko.toLocaleString()}</td><td>¥${shotoku.toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
}


