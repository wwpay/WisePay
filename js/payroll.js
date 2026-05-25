// 수정: 2026-05-25 22:40 — 이 월 삭제 버튼 → N월 데이터 초기화로 동적 표시
'use strict';
function renderMonthTabs() {
  const c = document.getElementById('monthTabs');
  c.innerHTML = '';
  const u = LANG==='JP' ? '月' : '월';
  for(let m=1; m<=12; m++) {
    const b = document.createElement('button');
    b.className = 'month-tab' + (m===currentMonth?' active':'');
    b.textContent = m+u;
    b.onclick = () => {
      if(payrollDirty && m !== currentMonth) {
        const jp = LANG==='JP';
        const msg = jp ? '保存されていない給与データがあります。このまま切り替えますか？' : '저장되지 않은 급여 데이터가 있습니다. 전환하시겠습니까?';
        if(!confirm(msg)) return;
      }
      currentMonth=m; renderMonthTabs(); onMonthYearChange();
    };
    c.appendChild(b);
  }
  document.getElementById('yearTxt').textContent = currentYear + (LANG==='JP'?'年':'년');
  const delBtn = document.getElementById('t-del-month-btn');
  if(delBtn) delBtn.textContent = LANG==='JP' ? `${currentMonth}月データをリセット` : `${currentMonth}월 데이터 초기화`;
}

function changeYear(d) {
  if(payrollDirty) {
    const jp = LANG==='JP';
    const msg = jp ? '保存されていない給与データがあります。このまま切り替えますか？' : '저장되지 않은 급여 데이터가 있습니다. 전환하시겠습니까?';
    if(!confirm(msg)) return;
  }
  currentYear+=d; currentMonth = d < 0 ? 12 : 1; renderMonthTabs(); onMonthYearChange();
}

// 월/연도 변경 시 요율 자동 전환 + 알림
function onMonthYearChange() {
  const jp = LANG==='JP';
  const ym = `${currentYear}-${String(currentMonth).padStart(2,'0')}`;
  applyRatesForYM(currentYear, currentMonth);
  // 최신 이력보다 이후 달을 보고 있을 때만 경고 (이력 범위 내 달은 정상 상속)
  const sortedHistory = [...rateHistory].sort((a,b) => a.from > b.from ? 1 : -1);
  const lastKnown = sortedHistory[sortedHistory.length - 1];
  const isBeyondKnown = lastKnown && ym > lastKnown.from;
  const bannerEl = document.getElementById('rate-month-banner');
  if(bannerEl) {
    if(isBeyondKnown) {
      const applied = getRatesForYM(currentYear, currentMonth);
      const msg = jp
        ? `【要率確認】${currentYear}年${currentMonth}月の保険料率は未登録のため、${applied.from}以降の料率を適用中です。「最新要率を取得」で確認・登録してください。`
        : `【요율 확인】${currentYear}년 ${currentMonth}월 요율이 미등록이어서 ${applied.from} 이후 요율을 적용 중입니다. 「최신 요율 가져오기」로 확인・등록해 주세요.`;
      bannerEl.querySelector('#rate-month-msg').textContent = msg;
      bannerEl.style.display = '';
    } else {
      bannerEl.style.display = 'none';
    }
  }
  loadPayrollForm();
}

// ══ EMP SELECT ══
function renderEmpSelect() {
  const sel = document.getElementById('empSelect');
  sel.innerHTML = '';
  const jp = LANG==='JP';
  // 미선택 옵션 항상 첫 번째에
  const blank = document.createElement('option');
  blank.value = '-1';
  blank.textContent = jp ? '── 従業員を選択 ──' : '── 사원 선택 ──';
  sel.appendChild(blank);
  if(!employees.length) return;
  employees.forEach((e,i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${String(e.no).padStart(4,'0')} ${e.name}`;
    sel.appendChild(opt);
  });
  // currentEmpIdx가 유효하면 선택 유지, 아니면 미선택
  sel.value = (currentEmpIdx >= 0 && currentEmpIdx < employees.length) ? currentEmpIdx : '-1';
}
function onEmpChange() {
  const newIdx = parseInt(document.getElementById('empSelect').value);
  if(payrollDirty && newIdx !== currentEmpIdx) {
    const jp = LANG==='JP';
    const msg = jp
      ? '保存されていない給与データがあります。このまま切り替えますか？'
      : '저장되지 않은 급여 데이터가 있습니다. 전환하시겠습니까?';
    if(!confirm(msg)) {
      document.getElementById('empSelect').value = currentEmpIdx;
      return;
    }
  }
  currentEmpIdx = isNaN(newIdx) ? -1 : newIdx;
  loadPayrollForm();
}

function loadPayrollForm() {
  const showContent = (show) => {
    const ids = ['payrollContent','payrollBody','rates-wrap-section','calc-info-section'];
    // payrollContent, payrollBody는 id로 직접 제어
    const pc = document.getElementById('payrollContent');
    const pb = document.getElementById('payrollBody');
    const rw = document.querySelector('.rates-wrap');
    const ci = document.querySelector('.calc-info');
    if(pc) pc.style.display = show ? '' : 'none';
    if(pb) pb.style.display = show ? 'grid' : 'none';
    if(rw) rw.style.display = show ? '' : 'none';
    if(ci) ci.style.display = show ? '' : 'none';
  };

  const ph = document.getElementById('payrollPlaceholder');
  // 미선택 상태
  if(currentEmpIdx < 0 || !employees.length) {
    showContent(false);
    if(ph) ph.style.display = '';
    payrollDirty = false;
    const saveBtn = document.getElementById('btn-save');
    if(saveBtn) { saveBtn.style.background = ''; saveBtn.style.borderColor = ''; }
    return;
  }

  if(currentEmpIdx >= employees.length) currentEmpIdx = 0;
  if(ph) ph.style.display = 'none';
  showContent(true);

  const emp = employees[currentEmpIdx];
  const pNo = String(emp.no).padStart(4,'0');
  const key = `kyuyo_p_${pNo}_${currentYear}_${currentMonth}`;
  const saved = localStorage.getItem(key);

  if(saved) {
    try {
      const d = JSON.parse(saved);
      PFIELDS.forEach(f => { const el=document.getElementById(f); if(el && d[f]!==undefined) el.value=d[f]; });
    } catch(e){}
  } else {
    const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevKey = `kyuyo_p_${pNo}_${prevY}_${prevM}`;
    const prevSaved = localStorage.getItem(prevKey);
    if(prevSaved) {
      try {
        const d = JSON.parse(prevSaved);
        PFIELDS.forEach(f => { const el=document.getElementById(f); if(el && d[f]!==undefined) el.value=d[f]; });
        document.getElementById('r-ot').value = '';
        document.getElementById('k-nencho').value = '';
        document.getElementById('r-commute').value = emp.commute || '';
      } catch(e){}
    } else {
      document.getElementById('r-commute').value = emp.commute ? emp.commute.toLocaleString() : '';
      ['r-base','r-ot','r-kintai','r-commutetax','r-kinmu','r-shokumu','r-field','k-jumin','k-nencho'].forEach(f => {
        document.getElementById(f).value='';
      });
    }
  }
  updateEmpHeader();
  payrollDirty = false;
  const saveBtn = document.getElementById('btn-save');
  if(saveBtn) { saveBtn.style.background = ''; saveBtn.style.borderColor = ''; }
  recalc();
}

function updateEmpHeader() {
  if(!employees.length) return;
  const emp = employees[currentEmpIdx];
  document.getElementById('avatarTxt').textContent = emp.name.charAt(0);
  document.getElementById('empNameTxt').textContent = emp.name;
  document.getElementById('empIdTxt').textContent = String(emp.no).padStart(4,'0');
  const yu = LANG==='JP'?'年':'년', mu = LANG==='JP'?'月分':'월분';
  document.getElementById('empMonthTxt').textContent = `${currentYear}${yu}${currentMonth}${mu}`;
}

// ══ CALC ══
// 쉼표 포맷: 입력 중 세 자리마다 , 추가
function fmtInput(input) {
  const isNeg = input.value.startsWith('-');
  const raw = input.value.replace(/[^0-9]/g, '');
  if(raw === '') { input.value = ''; return; }
  const num = parseInt(raw, 10);
  const pos = input.selectionStart;
  const prevLen = input.value.length;
  input.value = (isNeg ? '-' : '') + num.toLocaleString();
  const diff = input.value.length - prevLen;
  input.setSelectionRange(pos + diff, pos + diff);
  markPayrollDirty();
}

function markPayrollDirty() {
  payrollDirty = true;
  const saveBtn = document.getElementById('btn-save');
  if(saveBtn) { saveBtn.style.background='#e53e3e'; saveBtn.style.borderColor='#e53e3e'; }
}

function pv(id) {
  const el = document.getElementById(id);
  if(!el) return 0;
  return parseInt((el.value||'0').replace(/,/g,'')) || 0;
}

// 엔터키 → 다음 필드 포커스 / ESC → 원래 값 복원
function focusNext(event, nextId) {
  if(event.key === 'Enter') {
    event.preventDefault();
    const next = document.getElementById(nextId);
    if(next) next.focus();
  } else if(event.key === 'Escape') {
    event.preventDefault();
    const id = event.target.id;
    if(prevValues[id] !== undefined) {
      event.target.value = prevValues[id];
      recalc();
    }
    event.target.blur();
  }
}

// 포커스 시 현재 값 저장 (ESC 복원용) + "0" 표시 중이면 클리어
function savePrevVal(input) {
  prevValues[input.id] = input.value;
  if(input.value === '0') input.value = '';
}

// 반각 스페이스로 변환 (일본어 입력 시 전각 스페이스 → 반각)
function toHalfSpace(str) {
  return str.replace(/\u3000/g, ' ');
}
function isKaigo(emp) {
  if(emp.kaigo==='yes') return true;
  if(emp.kaigo==='no') return false;
  if(!emp.birth) return false;
  return (currentYear - parseInt(emp.birth.substring(0,4))) >= 40;
}
function recalc() {
  const emp = employees[currentEmpIdx];
  const base=pv('r-base'),ot=pv('r-ot'),kintai=pv('r-kintai'),commute=pv('r-commute'),commutetax=pv('r-commutetax'),kinmu=pv('r-kinmu'),shokumu=pv('r-shokumu'),field=pv('r-field'),jumin=pv('k-jumin'),nencho=pv('k-nencho');
  const totalPay = base+ot-kintai+commute+commutetax+kinmu+shokumu+field;
  // 標準報酬月額：r-hyoが0より大きければ手動値を優先（随時改定・資格取得時の実際の等級）
  const hyo_override = pv('r-hyo');
  const hyo = hyo_override > 0 ? hyo_override : (emp ? getHyo(base-kintai+commute+commutetax+kinmu+shokumu+field) : 58000);
  // 사회보험 가입 전월 면제: shaho_start(YYYY-MM) 이전 월은 전 사회보험 0, 소득세만 적용
  const shahoParts = emp && emp.shaho_start ? emp.shaho_start.split('-') : null;
  const shahoFrom = shahoParts ? parseInt(shahoParts[0])*100 + parseInt(shahoParts[1]) : 0;
  const shahoExempt = shahoFrom > 0 && (currentYear*100 + currentMonth) < shahoFrom;

  const kenko  = shahoExempt ? 0 : Math.floor(hyo*rates.kenko/100/2);
  const kaigo  = shahoExempt ? 0 : (emp&&isKaigo(emp)?Math.floor(hyo*rates.kaigo/100/2):0);
  const kodomo = shahoExempt ? 0 : Math.floor(hyo*rates.kodomo/100/2);
  const nenkin = shahoExempt ? 0 : Math.floor(hyo*rates.nenkin/100/2);
  // 고용보험: 사회보험 면제 기간이거나 미가입이면 0
  const koyoEnabled = !shahoExempt && (!emp || emp.koyo !== 'no');
  const koyo = koyoEnabled ? Math.round(totalPay*rates.koyo/100) : 0;
  // 고용보험 입력란 비활성화 처리
  const koyoEl = document.getElementById('k-koyo');
  if(koyoEl) {
    koyoEl.style.color = koyoEnabled ? '' : 'var(--text3)';
    koyoEl.style.textDecoration = koyoEnabled ? '' : 'line-through';
  }

  const shakai=kenko+kaigo+kodomo+nenkin+koyo;
  // 소득세 과세기준: 총지급 - 비과세통근수당 - 사회보험합계
  const shotokuBase = totalPay - commute - shakai;
  const fuyou = emp ? (parseInt(emp.fuyouCount)||0) : 0;
  const shotokuKbn = emp ? (emp.shotokuKbn||'ko') : 'ko';
  const isOtsu = shotokuKbn === 'otsu';
  const shotoku = Math.max(0, calcShotoku(shotokuBase, fuyou, isOtsu, currentYear, currentMonth));

  const totalKojo=shakai+shotoku+jumin+nencho;
  const net=totalPay-totalKojo;
  const fmt=n=>n.toLocaleString();
  document.getElementById('shikyuuTotal').textContent=fmt(totalPay);
  document.getElementById('totalPayTxt').textContent='¥'+fmt(totalPay);
  document.getElementById('k-kenko').textContent=fmt(kenko);
  document.getElementById('k-kaigo').textContent=fmt(kaigo);
  document.getElementById('k-kaigo').className='row-val'+(kaigo===0?' zero':' hi');
  document.getElementById('k-kodomo').textContent=fmt(kodomo);
  document.getElementById('k-nenkin').textContent=fmt(nenkin);
  document.getElementById('k-koyo').textContent=fmt(koyo);
  document.getElementById('k-shotoku').textContent=fmt(shotoku);
  document.getElementById('kojoTotal').textContent=fmt(totalKojo);
  document.getElementById('totalKojoTxt').textContent='¥'+fmt(totalKojo);
  document.getElementById('netAmountTxt').textContent='¥'+fmt(net);
  if(emp) {
    const fuyouTxt = fuyou > 0 ? `、${LANG==='JP'?'扶養':'부양'}${fuyou}${LANG==='JP'?'人':'명'}(-${fmt(fuyou*1610)}円)` : '';
    document.getElementById('ci-kenko').textContent=`標準報酬月額：${fmt(hyo)}円、労働者：${(rates.kenko/2).toFixed(4)}%`;
    document.getElementById('ci-nenkin').textContent=`標準報酬月額：${fmt(hyo)}円、労働者：${(rates.nenkin/2).toFixed(2)}%`;
    document.getElementById('ci-koyo').textContent=koyoEnabled?`労働者：${rates.koyo.toFixed(2)}%、賃金総額：${fmt(totalPay)}円`:(LANG==='JP'?'未加入':'미가입');
    document.getElementById('ci-shotoku').textContent=`${shotokuKbn==='otsu'?(LANG==='JP'?'乙欄':'을란'):(LANG==='JP'?'甲欄':'갑란')}、課税対象：${fmt(shotokuBase)}円${fuyouTxt}`;
  }
  // diff (1월이면 전년 12월과 비교)
  if(emp) {
    const prevY = currentMonth===1 ? currentYear-1 : currentYear;
    const prevM = currentMonth===1 ? 12 : currentMonth-1;
    const pk=`kyuyo_p_${String(emp.no).padStart(4,'0')}_${prevY}_${prevM}`;
    const ps=localStorage.getItem(pk);
    const de=document.getElementById('netDiffTxt');
    if(ps) { try { const pd=JSON.parse(ps); const diff=net-(pd._net||0); const u=LANG==='JP'?'前月比':'전월 대비'; de.textContent=`${u} ${diff>=0?'+':''}${fmt(diff)}`; de.className='net-diff '+(diff>=0?'up':'dn'); } catch(e){ de.textContent=' '; de.className='net-diff'; } }
    else { de.textContent=' '; de.className='net-diff'; }
  }
  window._calc = {kenko,nenkin,shotoku,totalPay,totalKojo,net};
}

// ══ DELETE MONTH ══
function deleteCurrentMonth() {
  if(!employees.length) return;
  const emp = employees[currentEmpIdx];
  const jp = LANG === 'JP';
  const label = `${emp.name} ${currentYear}年${currentMonth}月`;
  const msg = jp ? `${label}分のデータを削除しますか？\nこの操作は元に戻せません。` : `${label}분 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`;
  if(!confirm(msg)) return;
  const key = `kyuyo_p_${String(emp.no).padStart(4,'0')}_${currentYear}_${currentMonth}`;
  localStorage.removeItem(key);
  payrollDirty = false;
  const saveBtn = document.getElementById('btn-save');
  if(saveBtn) { saveBtn.style.background = ''; saveBtn.style.borderColor = ''; }
  PFIELDS.forEach(f => { const el = document.getElementById(f); if(el) el.value = ''; });
  recalc();
  showToast(jp ? `${label}分を削除しました` : `${label}분 삭제됨`, 'w');
}

// ══ SAVE PAYROLL ══
function saveCurrent() {
  if(!employees.length) { showToast(LANG==='JP'?'従業員を先に登録してください':'사원을 먼저 등록해 주세요','w'); return; }
  const emp=employees[currentEmpIdx];
  const key=`kyuyo_p_${String(emp.no).padStart(4,'0')}_${currentYear}_${currentMonth}`;
  const d={}; PFIELDS.forEach(f=>{d[f]=document.getElementById(f)?.value||0;}); d._net=window._calc?.net||0;
  localStorage.setItem(key,JSON.stringify(d));

  // dirty 리셋 + 버튼 색 복구
  payrollDirty = false;
  const saveBtn = document.getElementById('btn-save');
  if(saveBtn) { saveBtn.style.background = ''; saveBtn.style.borderColor = ''; }

  if(gasUrl && window._calc) {
    const c=window._calc;
    fetch(gasUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({type:'payroll',year:currentYear,month:currentMonth,no:emp.no,name:emp.name,...c}),mode:'no-cors'})
      .then(()=>showToast(LANG==='JP'?'Google スプレッドシートに保存しました ✓':'Google 스프레드시트에 저장됨 ✓','s'))
      .catch(()=>showToast(LANG==='JP'?'ローカルのみ保存しました':'로컬만 저장됨','w'));
  } else {
    showToast(LANG==='JP'?`${emp.name} ${currentMonth}月分を保存しました ✓`:`${emp.name} ${currentMonth}월분 저장됨 ✓`,'s');
  }
}

