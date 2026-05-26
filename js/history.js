// 수정: 2026-05-27 00:00 — renderAnnual: 미선택 시 플레이스홀더 표시 (급여명세와 동일 패턴)
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

// 체크리스트 빌드 — 이전 선택 유지 (첫 빌드 시 첫 번째 사원 선택)
function buildAnnualEmpSel() {
  const list = document.getElementById('annualEmpCheckList');
  if (!list) return;
  const isFirstBuild = list.children.length === 0;
  const prevNos = new Set(getSelectedAnnualNos().map(String));
  list.innerHTML = '';
  employees.forEach((e, idx) => {
    if (!e || e.no == null) return;
    const noStr = String(e.no);
    const checked = isFirstBuild ? idx === 0 : prevNos.has(noStr);
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 6px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;user-select:none;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = noStr;
    cb.checked = checked;
    cb.style.cssText = 'width:15px;height:15px;flex-shrink:0;cursor:pointer;accent-color:var(--accent);';
    const span = document.createElement('span');
    span.textContent = `${e.name}（${String(e.no).padStart(4,'0')}）`;
    label.appendChild(cb);
    label.appendChild(span);
    list.appendChild(label);
  });
  updateAnnualSelSummary();
}

// 현재 체크된 사원번호 배열 반환
function getSelectedAnnualNos() {
  return Array.from(
    document.querySelectorAll('#annualEmpCheckList input[type="checkbox"]:checked')
  ).map(cb => parseInt(cb.value));
}

// 선택 요약 텍스트 갱신
function updateAnnualSelSummary() {
  const nos = getSelectedAnnualNos();
  const total = document.querySelectorAll('#annualEmpCheckList input[type="checkbox"]').length;
  const jp = LANG === 'JP';
  const summary = document.getElementById('annualEmpSelSummary');
  if (!summary) return;
  if (nos.length === 0) {
    summary.textContent = jp ? '未選択' : '미선택';
    summary.style.color = 'var(--red)';
  } else if (nos.length === total) {
    summary.textContent = jp ? `全員（${total}名）` : `전체（${total}명）`;
    summary.style.color = 'var(--text2)';
  } else if (nos.length === 1) {
    const emp = employees.find(e => parseInt(e.no) === nos[0]);
    summary.textContent = emp ? emp.name : `1${jp?'名':'명'}`;
    summary.style.color = 'var(--text2)';
  } else {
    const emp = employees.find(e => parseInt(e.no) === nos[0]);
    const first = emp ? emp.name : '';
    summary.textContent = jp ? `${first} 他${nos.length-1}名` : `${first} 외${nos.length-1}명`;
    summary.style.color = 'var(--text2)';
  }
}

function openAnnualEmpModal()  { document.getElementById('annualEmpModal').classList.add('open'); }
function closeAnnualEmpModal() { document.getElementById('annualEmpModal').classList.remove('open'); }
function selectAllAnnualEmps() { document.querySelectorAll('#annualEmpCheckList input[type="checkbox"]').forEach(cb => cb.checked = true); }
function clearAllAnnualEmps()  { document.querySelectorAll('#annualEmpCheckList input[type="checkbox"]').forEach(cb => cb.checked = false); }

function applyAnnualEmpSel() {
  closeAnnualEmpModal();
  updateAnnualSelSummary();
  renderAnnual();
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
    const r = getRatesForYM(year, month);
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

// 중도입사 주석 반환
function getJoinNote(emp, year, jp) {
  if (!emp.join) return '';
  const parts = emp.join.split('-');
  const jy = parseInt(parts[0]), jm = parseInt(parts[1]);
  if ((jy*100+jm) > (year-1)*100+12) {
    return jp ? `　入社日：${jy}年${jm}月` : `　입사일：${jy}년 ${jm}월`;
  }
  return '';
}

// 한 사원의 임금대장 표 + 요약바 HTML 반환 (데이터 없으면 null)
function buildEmpTableHtml(emp, year, jp) {
  const mu = jp ? '月' : '월';
  const fmt = n => n.toLocaleString();

  const fiscalMonths = [
    { year: year-1, month: 12 },
    ...Array.from({length:11}, (_,i) => ({ year, month: i+1 }))
  ];
  const monthData = fiscalMonths.map(({year:y, month:m}) => calcMonthData(emp, y, m));
  if (!monthData.some(d => d !== null)) return null;

  let lastIdx = 0;
  for(let i=0;i<12;i++) { if(monthData[i]!==null) lastIdx=i; }
  const showCount = lastIdx+1;
  const cols = `grid-template-columns:110px repeat(${showCount},1fr) 86px;`;
  const sumKey = k => monthData.slice(0,showCount).reduce((s,d)=>s+(d?d[k]:0),0);

  const payItems = [
    {key:'base',    label:jp?'基本給':'기본급'},
    {key:'ot',      label:jp?'残業手当':'잔업수당'},
    {key:'commute', label:jp?'非課税通勤手当':'비과세 교통비'},
    {key:'kinmu',   label:jp?'勤務手当':'근무수당'},
    {key:'shokumu', label:jp?'職務手当':'직무수당'},
    {key:'field',   label:jp?'現場手当':'현장수당'},
  ];
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

  const noDataCell = `<div style="color:var(--text3)">0</div>`;
  const valCell = val => val===0
    ? `<div style="color:var(--text3)">0</div>`
    : `<div>${fmt(val)}</div>`;
  const sumCell = k => `<div style="font-weight:600;">${fmt(sumKey(k))}</div>`;

  let html = `<div class="annual-scroll-wrap"><div class="annual-wrap">`;

  html += `<div class="annual-head-row" style="${cols}"><div>${jp?'項目':'항목'}</div>`;
  for(let i=0;i<showCount;i++) {
    const {year:y,month:m}=fiscalMonths[i];
    html += `<div>${(m===12&&y===year-1)?(jp?`前年<br>12${mu}`:`전년<br>12${mu}`):`${m}${mu}`}</div>`;
  }
  html += `<div>${jp?'年計':'연계'}</div></div>`;

  payItems.forEach(r => {
    html += `<div class="annual-data-row" style="${cols}"><div>${r.label}</div>`;
    for(let i=0;i<showCount;i++) html += monthData[i] ? valCell(monthData[i][r.key]) : noDataCell;
    html += sumCell(r.key) + `</div>`;
  });
  html += `<div class="annual-data-row annual-subtotal-pay" style="${cols}"><div>${jp?'支給合計':'지급합계'}</div>`;
  for(let i=0;i<showCount;i++) html += monthData[i]?`<div>${fmt(monthData[i].totalPay)}</div>`:`<div style="color:var(--text3)">0</div>`;
  html += `<div style="font-weight:700;">${fmt(sumKey('totalPay'))}</div></div>`;

  deductItems.forEach(r => {
    html += `<div class="annual-data-row" style="${cols}"><div>${r.label}</div>`;
    for(let i=0;i<showCount;i++) html += monthData[i] ? valCell(monthData[i][r.key]) : noDataCell;
    html += sumCell(r.key) + `</div>`;
  });
  html += `<div class="annual-data-row annual-subtotal-deduct" style="${cols}"><div>${jp?'控除合計':'공제합계'}</div>`;
  for(let i=0;i<showCount;i++) html += monthData[i]?`<div>${fmt(monthData[i].totalKojo)}</div>`:`<div style="color:var(--text3)">0</div>`;
  html += `<div style="font-weight:700;">${fmt(sumKey('totalKojo'))}</div></div>`;

  html += `<div class="annual-data-row annual-net-row" style="${cols}"><div>${jp?'差引支給額':'차인지급액'}</div>`;
  for(let i=0;i<showCount;i++) html += monthData[i]?`<div>¥${fmt(monthData[i].net)}</div>`:`<div style="color:var(--text3)">¥0</div>`;
  html += `<div>¥${fmt(sumKey('net'))}</div></div>`;
  html += `</div></div>`;

  html += `<div style="margin-top:12px;background:var(--accent2);border:1px solid var(--accent3);border-radius:var(--r);padding:12px 16px;display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px;">`;
  html += `<span><strong>${jp?'年間支給合計':'연간 지급 합계'}:</strong> ¥${fmt(sumKey('totalPay'))}</span>`;
  html += `<span><strong>${jp?'年間控除合計':'연간 공제 합계'}:</strong> ¥${fmt(sumKey('totalKojo'))}</span>`;
  html += `<span style="font-size:14px;font-weight:700;color:var(--accent);"><strong>${jp?'年間手取り合計':'연간 실수령 합계'}:</strong> ¥${fmt(sumKey('net'))}</span>`;
  html += `</div>`;
  return html;
}

function renderAnnual() {
  const jp = LANG==='JP';
  const ph = document.getElementById('annualPrintHeader');
  const placeholder = document.getElementById('annualPlaceholder');
  const content = document.getElementById('annualContent');

  const showPlaceholder = () => {
    if(placeholder) placeholder.style.display = 'flex';
    if(content) content.style.display = 'none';
    ph.style.display = 'none';
  };
  const showContent = () => {
    if(placeholder) placeholder.style.display = 'none';
    if(content) content.style.display = '';
  };

  if (!employees.length) {
    showPlaceholder();
    return;
  }

  const selectedNos = getSelectedAnnualNos();
  const year = parseInt(document.getElementById('annualYearSel')?.value)||2026;
  const today = jp ? new Date().toLocaleDateString('ja-JP') : new Date().toLocaleDateString('ko-KR');
  const noDataMsg = `<div style="padding:40px;text-align:center;color:var(--text3);">${jp?'この年度のデータがありません':'이 연도의 데이터가 없습니다'}</div>`;

  if (selectedNos.length === 0) {
    showPlaceholder();
    return;
  }
  showContent();

  // 단일 사원: 고정 헤더 방식
  if (selectedNos.length === 1) {
    const emp = employees.find(e => parseInt(e.no) === selectedNos[0]);
    if (!emp) { ph.style.display='none'; document.getElementById('annualContent').innerHTML=noDataMsg; return; }
    ph.style.display = 'block';
    document.getElementById('annualPrintTitle').textContent =
      `${emp.name}（${String(emp.no).padStart(4,'0')}） ${year}${jp?'年度':'년도'} ${jp?'賃金台帳':'임금대장'}`;
    document.getElementById('annualPrintSub').textContent =
      (jp?`出力日：${today}`:`출력일：${today}`) + getJoinNote(emp, year, jp);
    document.getElementById('annualContent').innerHTML = buildEmpTableHtml(emp, year, jp) || noDataMsg;
    return;
  }

  // 복수 사원: 인라인 헤더 + 페이지 구분
  ph.style.display = 'none';
  let allHtml = '';
  let count = 0;
  selectedNos.forEach(no => {
    const emp = employees.find(e => parseInt(e.no) === no);
    if (!emp) return;
    const tableHtml = buildEmpTableHtml(emp, year, jp);
    if (!tableHtml) return;
    const title = `${emp.name}（${String(emp.no).padStart(4,'0')}） ${year}${jp?'年度':'년도'} ${jp?'賃金台帳':'임금대장'}`;
    const sub = (jp?`出力日：${today}`:`출력일：${today}`) + getJoinNote(emp, year, jp);
    allHtml += `<div class="annual-emp-block${count>0?' annual-page-break':''}">` +
      `<div style="font-size:16px;font-weight:700;margin-bottom:3px;">${title}</div>` +
      `<div style="font-size:12px;color:#666;margin-bottom:10px;">${sub}</div>` +
      tableHtml + `</div>`;
    count++;
  });
  document.getElementById('annualContent').innerHTML = allHtml || noDataMsg;
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
