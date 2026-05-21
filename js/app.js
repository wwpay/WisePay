// 수정: 2026-05-21 — 로그인 기능 추가, GAS URL 하드코딩, 로그인 시 자동 GAS 동기화
'use strict';
// ══ INIT ══
window.addEventListener('DOMContentLoaded', () => {
  LANG = localStorage.getItem(LS.lang) || 'KR';
  applyLang();
  if (!checkAuth()) return;
  initApp();
});

function initApp() {
  // load storage
  try { const s = localStorage.getItem(LS.emp); if(s) employees = JSON.parse(s); } catch(e){}
  try { const s = localStorage.getItem(LS.rateHistory); if(s) rateHistory = JSON.parse(s); } catch(e){}
  // 마이그레이션: 2026-04 이전 항목의 kodomo가 0.23이면 0으로 수정
  // 2026-01~02의 kaigo가 1.60이면 1.59로 수정 (令和7年度 실제 요율)
  let migrated = false;
  rateHistory.forEach(r => {
    if(r.from < '2026-04' && r.kodomo > 0) { r.kodomo = 0.00; migrated = true; }
    if(r.from < '2026-03' && Math.abs(r.kaigo - 1.60) < 0.001) { r.kaigo = 1.59; migrated = true; }
  });
  // 2026-04 항목이 없으면 추가
  if(!rateHistory.find(r => r.from === '2026-04')) {
    const base = rateHistory.find(r => r.from === '2026-03') || rateHistory[rateHistory.length-1];
    if(base) {
      rateHistory.push({ ...base, from:'2026-04', kodomo:0.23 });
      rateHistory.sort((a,b) => a.from > b.from ? 1 : -1);
      migrated = true;
    }
  }
  // 요율 이력 정리: 빈 from 항목 제거 + 같은 from 중복 제거 (마지막 항목 우선)
  const beforeClean = rateHistory.length;
  const deduped = [];
  const seenFrom = new Set();
  [...rateHistory].sort((a,b)=>a.from>b.from?1:-1).reverse().forEach(r => {
    if(!r.from || !/^\d{4}-\d{2}$/.test(r.from)) return;
    if(seenFrom.has(r.from)) return;
    seenFrom.add(r.from);
    deduped.unshift(r);
  });
  if(deduped.length !== beforeClean) { rateHistory = deduped; migrated = true; }
  if(migrated) localStorage.setItem(LS.rateHistory, JSON.stringify(rateHistory));
  // 구버전 단일 rates 호환
  try { const s = localStorage.getItem(LS.rates); if(s) { const r=JSON.parse(s); rates={...rates,...r}; } } catch(e){}
  // 구버전 급여 키 마이그레이션: 비패딩 사원번호(kyuyo_p_1_...) → 4자리(kyuyo_p_0001_...)
  migratePayrollKeys();
  // GAS URL은 state.js에서 하드코딩 — localStorage에 동기화
  localStorage.setItem(LS.gas, gasUrl);
  document.getElementById('gasUrlInput').value = gasUrl;

  // 급여 입력란: 포커스 이탈 시 빈 값 → "0" 복원
  document.addEventListener('focusout', e => {
    if(e.target.matches('#page-payroll .row-input') && e.target.value === '') {
      e.target.value = '0';
    }
  });

  renderEmpSelect();
  renderMonthTabs();
  applyRatesForYM(currentYear, currentMonth);
  loadPayrollForm();
  updateRatesDisplay();
  checkRateBanner();
  updateGasStatus();
  setTimeout(() => onMonthYearChange(), 100);
  // 로그인 후 Google 시트에서 최신 데이터 자동 로드
  autoLoadFromGas();
}

// 페이지 닫기/새로고침 시 미저장 경고
window.addEventListener('beforeunload', e => {
  if(payrollDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function gotoPage(id, el) {
  // 급여명세에서 다른 페이지로 이동 시 미저장 경고
  const currentPage = document.querySelector('.page.active')?.id;
  if(currentPage === 'page-payroll' && id !== 'payroll' && payrollDirty) {
    const jp = LANG==='JP';
    const msg = jp
      ? '保存されていない給与データがあります。このまま移動しますか？'
      : '저장되지 않은 급여 데이터가 있습니다. 이동하시겠습니까?';
    if(!confirm(msg)) return;
    // 경고 무시하고 이동 선택 — 미저장 내용 파기
    payrollDirty = false;
    const saveBtn = document.getElementById('btn-save');
    if(saveBtn) saveBtn.style.background = '';
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(el) el.classList.add('active');
  else {
    const sideNav = document.querySelector(`.nav-item[data-page="${id}"]`);
    if(sideNav) sideNav.classList.add('active');
  }
  const titles = {payroll:{JP:'給与明細',KR:'급여 명세'},history:{JP:'支給履歴',KR:'지급 이력'},employees:{JP:'従業員管理',KR:'직원 관리'},rates:{JP:'保険料率設定',KR:'보험료율 설정'},annual:{JP:'年間給与一覧',KR:'연간 급여 일람'},gas:{JP:'Google連携設定',KR:'Google 연동 설정'}};
  const t = titles[id];
  if(t) document.getElementById('topbar-title').textContent = t[LANG];
  document.getElementById('btn-save').style.display = id==='payroll' ? '' : 'none';
  if(id==='payroll') loadPayrollForm();
  if(id==='history') { buildHistEmpSel(); renderHistory(); }
  if(id==='employees') renderEmpList();
  if(id==='rates') renderRatesPage();
  if(id==='annual') { buildAnnualEmpSel(); renderAnnual(); }
  if(id==='gas') openGasModal();
}

function resetLocalData() {
  const jp = LANG === 'JP';
  const msg = jp
    ? '⚠️ ローカルデータをすべて削除します。\n\n従業員・給与・保険料率データが消去されます。\nGoogleのデータは影響を受けません。\n\n本当に初期化しますか？'
    : '⚠️ 로컬 데이터를 모두 삭제합니다.\n\n직원·급여·보험료율 데이터가 지워집니다.\nGoogle 시트 데이터는 영향 없습니다.\n\n정말 초기화하시겠습니까?';
  if (!confirm(msg)) return;

  // kyuyo_ 접두사 키 전체 삭제 (lang, auth 제외)
  const keepKeys = new Set([LS.lang, 'wisepay_auth']);
  Object.keys(localStorage)
    .filter(k => k.startsWith('kyuyo_') && !keepKeys.has(k))
    .forEach(k => localStorage.removeItem(k));

  // 상태 변수 초기화
  employees = [];
  rateHistory = [
    { from:'2026-01', kenko:9.91, kaigo:1.59, kodomo:0.00, nenkin:18.30, koyo:0.50 },
    { from:'2026-03', kenko:9.85, kaigo:1.62, kodomo:0.00, nenkin:18.30, koyo:0.50 },
    { from:'2026-04', kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 },
  ];
  currentEmpIdx = -1;

  renderEmpSelect();
  renderMonthTabs();
  applyRatesForYM(currentYear, currentMonth);
  loadPayrollForm();
  updateRatesDisplay();

  showToast(jp ? 'ローカルデータを初期化しました' : '로컬 데이터를 초기화했습니다', 's');
}

// 구버전 급여 localStorage 키 마이그레이션
// kyuyo_p_1_2026_5 → kyuyo_p_0001_2026_5 형태로 일괄 변환
function migratePayrollKeys() {
  try {
    employees.forEach(emp => {
      const paddedNo = String(emp.no).padStart(4, '0');
      const numericNo = String(parseInt(paddedNo, 10)); // "0001" → "1"
      if(paddedNo === numericNo) return; // 이미 같으면 스킵
      for(let y = 2023; y <= 2027; y++) {
        for(let m = 1; m <= 12; m++) {
          const oldKey = `kyuyo_p_${numericNo}_${y}_${m}`;
          const newKey = `kyuyo_p_${paddedNo}_${y}_${m}`;
          const oldData = localStorage.getItem(oldKey);
          if(oldData && !localStorage.getItem(newKey)) {
            localStorage.setItem(newKey, oldData);
            localStorage.removeItem(oldKey);
          }
        }
      }
    });
  } catch(e) {}
}

