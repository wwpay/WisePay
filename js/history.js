// 수정: 2026-05-22 14:00 — buildAnnualEmpSel/buildHistEmpSel null 가드 추가
'use strict';
function buildAnnualEmpSel() {
  const sel = document.getElementById('annualEmpSel');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  employees.forEach((e,i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = `${e.name}（${String(e.no).padStart(4,'0')}）`;
    sel.appendChild(o);
  });
  // 이전 선택 유지, 없으면 첫 번째 직원 선택
  sel.value = (prev !== '' && employees[parseInt(prev)]) ? prev : (employees.length ? '0' : '');
}

function calcMonthData(emp, year, month) {
  const key = `kyuyo_p_${String(emp.no).padStart(4,'0')}_${year}_${month}`;
  const s = localStorage.getItem(key);
  if(!s) return null;
  try {
    const d = JSON.parse(s);
    const base=parseInt((d['r-base']||'0').replace(/,/g,'')), ot=parseInt((d['r-ot']||'0').replace(/,/g,'')), kintai=parseInt((d['r-kintai']||'0').replace(/,/g,''));
    const commute=parseInt((d['r-commute']||'0').replace(/,/g,'')), commutetax=parseInt((d['r-commutetax']||'0').replace(/,/g,''));
    const kinmu=parseInt((d['r-kinmu']||'0').replace(/,/g,''));
    const shokumu=parseInt((d['r-shokumu']||'0').replace(/,/g,'')), field=parseInt((d['r-field']||'0').replace(/,/g,''));
    const jumin=parseInt((d['k-jumin']||'0').replace(/,/g,'')), nencho=parseInt((d['k-nencho']||'0').replace(/,/g,''));
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
      `<div style="padding:40px;text-align:center;color:var(--text3);">${jp?'従業員データがありません。まずGoogle同期を行ってください。':'직원 데이터가 없습니다. Google 동기화를 먼저 해주세요.'}</div>`;
    return;
  }
  const empIdx = parseInt(document.getElementById('annualEmpSel')?.value);
  const year = parseInt(document.getElementById('annualYearSel')?.value)||2026;
  if(isNaN(empIdx)||!employees[empIdx]) return;
  const emp = employees[empIdx];
  const jp = LANG==='JP';
  const mu = jp?'月':'월';
  const fmt = n => n.toLocaleString();

  // 인쇄 헤더
  const ph = document.getElementById('annualPrintHeader');
  ph.style.display='block';
  document.getElementById('annualPrintTitle').textContent = `${emp.name}（${String(emp.no).padStart(4,'0')}） ${year}${jp?'年':'년'} ${jp?'年間給与一覧':'연간 급여 일람'}`;
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

  // 각 월 데이터 수집
  const monthData = [];
  for(let m=1;m<=12;m++) monthData.push(calcMonthData(emp,year,m));
  const hasAny = monthData.some(d=>d!==null);

  if(!hasAny) {
    document.getElementById('annualContent').innerHTML =
      `<div style="padding:40px;text-align:center;color:var(--text3);">${jp?'この年のデータがありません':'이 연도의 데이터가 없습니다'}</div>`;
    return;
  }

  // 합계
  const totals = {};
  rows.forEach(r => {
    totals[r.key] = monthData.reduce((s,d) => s+(d?d[r.key]:0), 0);
  });

  let html = `<div class="annual-wrap">`;
  // 헤더
  html += `<div class="annual-head-row"><div>${jp?'項目':'항목'}</div>`;
  for(let m=1;m<=12;m++) html += `<div>${m}${mu}</div>`;
  html += `</div>`;

  // 데이터 행
  rows.forEach(r => {
    const isBold = r.key==='net'||r.key==='totalPay';
    html += `<div class="annual-data-row${r.key==='net'?' total-row':''}">`;
    html += `<div style="${isBold?'font-weight:600;':''}">${r.label}</div>`;
    for(let m=0;m<12;m++) {
      const d = monthData[m];
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
  html += `<div class="annual-data-row total-row">`;
  html += `<div>${jp?'年計':'연계'}</div>`;
  for(let m=0;m<12;m++) {
    html += monthData[m]
      ? `<div style="color:var(--accent);font-weight:600;">${fmt(monthData[m].net)}</div>`
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
  employees.forEach((e,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=`${e.name}（${String(e.no).padStart(4,'0')}）`; sel.appendChild(o); });
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
    const base=parseInt(d['r-base']||0),ot=parseInt(d['r-ot']||0),kintai=parseInt(d['r-kintai']||0),commute=parseInt(d['r-commute']||0),commutetax=parseInt(d['r-commutetax']||0),kinmu=parseInt(d['r-kinmu']||0),shokumu=parseInt(d['r-shokumu']||0),field=parseInt(d['r-field']||0);
    const totalPay=base+ot-kintai+commute+commutetax+kinmu+shokumu+field;
    // 標準報酬月額：残業手当(ot)は変動給のため除外
    const hyo=getHyo(base-kintai+commute+commutetax+kinmu+shokumu+field);
    const kenko=Math.floor(hyo*rates.kenko/100/2);
    const kaigo2=isKaigo(emp)?Math.floor(hyo*rates.kaigo/100/2):0;
    const kodomo=Math.floor(hyo*rates.kodomo/100/2);
    const nenkin=Math.floor(hyo*rates.nenkin/100/2);
    const koyo=Math.floor(totalPay*rates.koyo/100);
    const shakai=kenko+kaigo2+kodomo+nenkin+koyo;
    const shotoku=calcShotoku(totalPay-commute-shakai);
    const jumin=parseInt(d['k-jumin']||0),nencho=parseInt(d['k-nencho']||0);
    const totalKojo=shakai+shotoku+jumin+nencho;
    const net=totalPay-totalKojo;
    const mu=LANG==='JP'?'月':'월';
    const tr=document.createElement('tr');
    tr.onclick=()=>{ currentEmpIdx=employees.indexOf(emp); currentMonth=m; gotoPage('payroll',document.querySelector('.nav-item')); document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); document.querySelector('.nav-item').classList.add('active'); renderMonthTabs(); loadPayrollForm(); };
    tr.innerHTML=`<td>${m}${mu}</td><td>${emp.name}</td><td>¥${totalPay.toLocaleString()}</td><td>¥${totalKojo.toLocaleString()}</td><td style="font-weight:600;">¥${net.toLocaleString()}</td><td>¥${nenkin.toLocaleString()}</td><td>¥${kenko.toLocaleString()}</td><td>¥${shotoku.toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
}


