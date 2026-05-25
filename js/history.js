// 수정: 2026-05-25 22:28 — 임금대장: 데이터 없는 월 0 표시 (전년12월 포함)
'use strict';
function buildAnnualYearSel() {
  const sel = document.getElementById('annualYearSel');
  if(!sel) return;
  const jp = LANG === 'JP';
  const prev = sel.value;
  const years = [2026, 2025, 2024];
  sel.innerHTML = '';
  years.forEach(y => {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = jp ? `${y}年度` : `${y}년도`;
    sel.appendChild(o);
  });
  if(years.map(String).includes(prev)) sel.value = prev;
}

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
    const hyo_override = safeInt(d['r-hyo']);
    const hyo = hyo_override > 0 ? hyo_override : getHyo(base-kintai+commute+commutetax+kinmu+shokumu+field);
    // 해당 월의 정확한 요율 사용
    const r = getRatesForYM(year, month);
    // 사회보험 가입 전월 면제
    const shahoParts = emp.shaho_start ? emp.shaho_start.split('-') : null;
    const shahoFrom = shahoParts ? parseInt(shahoParts[0])*100 + parseInt(shahoParts[1]) : 0;
    const shahoExempt = shahoFrom > 0 && (year*100 + month) < shahoFrom;
    const kenko  = shahoExempt ? 0 : Math.floor(hyo*r.kenko/100/2);
    const kaigo2 = shahoExempt ? 0 : (isKaigo(emp)?Math.floor(hyo*r.kaigo/100/2):0);
    const kodomo = shahoExempt ? 0 : Math.floor(hyo*r.kodomo/100/2);
    const nenkin = shahoExempt ? 0 : Math.floor(hyo*r.nenkin/100/2);
    const koyoEnabled = !shahoExempt && emp.koyo !== 'no';
    const koyo   = koyoEnabled ? Math.round(totalPay*r.koyo/100) : 0;
    const shakai=kenko+kaigo2+kodomo+nenkin+koyo;
    const shotokuBase = totalPay-commute-shakai;
    const fuyou = parseInt(emp.fuyouCount)||0;
    const isOtsu = (emp.shotokuKbn||'ko') === 'otsu';
    let shotoku = Math.max(0, calcShotoku(shotokuBase, fuyou, isOtsu, year, month));
    const totalKojo=shakai+shotoku+jumin+nencho;
    const net=totalPay-totalKojo;
    return {base,ot,kintai,commute,commutetax,kinmu,shokumu,field,totalPay,kenko,kaigo:kaigo2,kodomo,nenkin,koyo,shakai,shotoku,jumin,nencho,totalKojo,net};
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
  document.getElementById('annualPrintTitle').textContent = `${emp.name}（${String(emp.no).padStart(4,'0')}） ${year}${jp?'年度':'년도'} ${jp?'賃金台帳':'임금대장'}`;
  // 중도입사 판정: 해당 연도(전년12월~당년11월) 이내에 입사
  let joinNote = '';
  if(emp.join) {
    const jp2 = jp;
    const parts = emp.join.split('-');
    const jy = parseInt(parts[0]), jm = parseInt(parts[1]);
    const fiscalStart = (year-1)*100 + 12; // 전년 12월
    const joinYM = jy*100 + jm;
    if(joinYM > fiscalStart) {
      joinNote = jp2 ? `　入社日：${jy}年${jm}月` : `　입사일：${jy}년 ${jm}월`;
    }
  }
  document.getElementById('annualPrintSub').textContent = (jp?`出力日：${new Date().toLocaleDateString('ja-JP')}`:`출력일：${new Date().toLocaleDateString('ko-KR')}`) + joinNote;

  // 익월 10일 지급: 前年12月～当年11月
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

  let lastIdx = 0;
  for(let i=0; i<12; i++) { if(monthData[i] !== null) lastIdx = i; }
  const showCount = lastIdx + 1;
  // 항목열 + 월열들 + 연계열
  const cols = `grid-template-columns:110px repeat(${showCount},1fr) 86px;`;

  const sumKey = key => monthData.slice(0, showCount).reduce((s,d) => s+(d?d[key]:0), 0);

  // 지급 세부 — 급여 명세와 동일 항목, 전 사원 레이아웃 통일을 위해 무조건 전체 표시
  const payItems = [
    {key:'base',    label:jp?'基本給':'기본급'},
    {key:'ot',      label:jp?'残業手当':'잔업수당'},
    {key:'commute', label:jp?'非課税通勤手当':'비과세 교통비'},
    {key:'kinmu',   label:jp?'勤務手当':'근무수당'},
    {key:'shokumu', label:jp?'職務手当':'직무수당'},
    {key:'field',   label:jp?'現場手当':'현장수당'},
  ];

  // 공제 세부 — 마찬가지로 무조건 전체 표시
  const deductItems = [
    {key:'kenko',   label:jp?'健康保険料':'건강보험료'},
    {key:'kaigo',   label:jp?'介護保険料':'개호보험료'},
    {key:'kodomo',  label:jp?'子育て支援金':'아동육성지원금'},
    {key:'nenkin',  label:jp?'厚生年金':'후생연금'},
    {key:'koyo',    label:jp?'雇用保険':'고용보험'},
    {key:'shotoku', label:jp?'所得税':'소득세'},
    {key:'jumin',   label:jp?'住民税':'주민세'},
    {key:'nencho',  label:jp?'年末調整':'연말정산'},
  ];

  // 셀 렌더 헬퍼
  const noDataCell = `<div style="color:var(--text3)">0</div>`;
  function valCell(val, neg) {
    if(val === 0) return `<div style="color:var(--text3)">0</div>`;
    const c = neg ? 'color:var(--red);' : '';
    return `<div style="${c}">${neg?'-':''}${fmt(val)}</div>`;
  }
  function sumCell(key, neg, accent) {
    const t = sumKey(key);
    const c = accent ? 'color:var(--accent);font-weight:700;' : (neg ? 'color:var(--red);font-weight:600;' : 'font-weight:600;');
    return `<div style="${c}">${neg?'-':''}${fmt(t)}</div>`;
  }

  let html = `<div class="annual-wrap">`;

  // ── 헤더 행 ──
  html += `<div class="annual-head-row" style="${cols}"><div>${jp?'項目':'항목'}</div>`;
  for(let i=0;i<showCount;i++) {
    const {year:y,month:m} = fiscalMonths[i];
    html += `<div>${(m===12&&y===year-1)?(jp?`前年<br>12${mu}`:`전년<br>12${mu}`):`${m}${mu}`}</div>`;
  }
  html += `<div>${jp?'年計':'연계'}</div></div>`;

  // ── 지급 세부 ──
  payItems.forEach(r => {
    html += `<div class="annual-data-row" style="${cols}"><div>${r.label}</div>`;
    for(let i=0;i<showCount;i++) html += monthData[i] ? valCell(monthData[i][r.key], false) : noDataCell;
    html += sumCell(r.key, false, false) + `</div>`;
  });
  // 지급합계
  html += `<div class="annual-data-row annual-subtotal-pay" style="${cols}"><div>${jp?'支給合計':'지급합계'}</div>`;
  for(let i=0;i<showCount;i++) html += monthData[i] ? `<div>${fmt(monthData[i].totalPay)}</div>` : `<div style="color:var(--text3)">0</div>`;
  html += `<div style="font-weight:700;">${fmt(sumKey('totalPay'))}</div></div>`;

  // ── 공제 세부 ──
  deductItems.forEach(r => {
    html += `<div class="annual-data-row" style="${cols}"><div>${r.label}</div>`;
    for(let i=0;i<showCount;i++) html += monthData[i] ? valCell(monthData[i][r.key], false) : noDataCell;
    html += sumCell(r.key, false, false) + `</div>`;
  });
  // 공제합계
  html += `<div class="annual-data-row annual-subtotal-deduct" style="${cols}"><div>${jp?'控除合計':'공제합계'}</div>`;
  for(let i=0;i<showCount;i++) html += monthData[i] ? `<div>${fmt(monthData[i].totalKojo)}</div>` : `<div style="color:var(--text3)">0</div>`;
  html += `<div style="font-weight:700;">${fmt(sumKey('totalKojo'))}</div></div>`;

  // ── 차인지급액 ──
  html += `<div class="annual-data-row annual-net-row" style="${cols}"><div>${jp?'差引支給額':'차인지급액'}</div>`;
  for(let i=0;i<showCount;i++) html += monthData[i] ? `<div>¥${fmt(monthData[i].net)}</div>` : `<div style="color:var(--text3)">¥0</div>`;
  html += `<div>¥${fmt(sumKey('net'))}</div></div>`;

  html += `</div>`;

  // 연간 합계 요약 바
  html += `<div style="margin-top:12px;background:var(--accent2);border:1px solid var(--accent3);border-radius:var(--r);padding:12px 16px;display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px;">`;
  html += `<span><strong>${jp?'年間支給合計':'연간 지급 합계'}:</strong> ¥${fmt(sumKey('totalPay'))}</span>`;
  html += `<span><strong>${jp?'年間控除合計':'연간 공제 합계'}:</strong> ¥${fmt(sumKey('totalKojo'))}</span>`;
  html += `<span style="font-size:14px;font-weight:700;color:var(--accent);"><strong>${jp?'年間手取り合計':'연간 실수령 합계'}:</strong> ¥${fmt(sumKey('net'))}</span>`;
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
    const hyo_override=safeInt(d['r-hyo']);
    const hyo=hyo_override>0?hyo_override:getHyo(base-kintai+commute+commutetax+kinmu+shokumu+field);
    const r=getRatesForYM(year,m);
    const shahoParts=emp.shaho_start?emp.shaho_start.split('-'):null;
    const shahoFrom=shahoParts?parseInt(shahoParts[0])*100+parseInt(shahoParts[1]):0;
    const shahoExempt=shahoFrom>0&&(year*100+m)<shahoFrom;
    const kenko=shahoExempt?0:Math.floor(hyo*r.kenko/100/2);
    const kaigo2=shahoExempt?0:(isKaigo(emp)?Math.floor(hyo*r.kaigo/100/2):0);
    const kodomo=shahoExempt?0:Math.floor(hyo*r.kodomo/100/2);
    const nenkin=shahoExempt?0:Math.floor(hyo*r.nenkin/100/2);
    const koyoEnabled=!shahoExempt&&emp.koyo!=='no';
    const koyo=koyoEnabled?Math.round(totalPay*r.koyo/100):0;
    const shakai=kenko+kaigo2+kodomo+nenkin+koyo;
    const fuyou=parseInt(emp.fuyouCount)||0;
    const isOtsu=(emp.shotokuKbn||'ko')==='otsu';
    const shotoku=Math.max(0,calcShotoku(totalPay-commute-shakai,fuyou,isOtsu,year,m));
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


