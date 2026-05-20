// 수정: 2026-05-20 17:45 — 급여 입력란 포커스 시 0 클리어, 이탈 시 0 복원
'use strict';
// ══ INIT ══
window.addEventListener('DOMContentLoaded', () => {
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
  if(migrated) localStorage.setItem(LS.rateHistory, JSON.stringify(rateHistory));
  // 구버전 단일 rates 호환
  try { const s = localStorage.getItem(LS.rates); if(s) { const r=JSON.parse(s); rates={...rates,...r}; } } catch(e){}
  gasUrl = localStorage.getItem(LS.gas) || '';
  LANG = localStorage.getItem(LS.lang) || 'KR';
  document.getElementById('gasUrlInput').value = gasUrl;

  // 급여 입력란: 포커스 이탈 시 빈 값 → "0" 복원
  document.addEventListener('focusout', e => {
    if(e.target.matches('#page-payroll .row-input') && e.target.value === '') {
      e.target.value = '0';
    }
  });

  applyLang();
  renderEmpSelect();
  renderMonthTabs();
  applyRatesForYM(currentYear, currentMonth); // 현재 월 요율 자동 적용
  loadPayrollForm();
  updateRatesDisplay();
  checkRateBanner();
  updateGasStatus();
  // 초기 월 알림 체크
  setTimeout(() => onMonthYearChange(), 100);
});

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


