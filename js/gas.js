'use strict';
async function exportAllToGas() {
  if (!gasUrl) {
    showToast(LANG === 'JP' ? '先にURLを設定してください' : '먼저 URL을 설정해 주세요', 'w');
    return;
  }
  const jp = LANG === 'JP';
  if (!confirm(jp ? 'ローカルのデータをGoogleに上書きします。よろしいですか？' : '로컬 데이터로 Google을 덮어씁니다. 계속하시겠습니까?')) return;

  const statusEl = document.getElementById('gas-sync-status');
  if (statusEl) {
    statusEl.innerHTML = LANG === 'JP' ? 'アップロード中... ⏳' : '업로드 중... ⏳';
  }

  const payrolls = [];
  employees.forEach(emp => {
    for (let y = 2024; y <= 2027; y++) {
      for (let m = 1; m <= 12; m++) {
        const s = localStorage.getItem('kyuyo_p_' + emp.no + '_' + y + '_' + m);
        if (s) {
          try {
            const d = JSON.parse(s);
            payrolls.push({
              no: emp.no,
              name: emp.name,
              year: y,
              month: m,
              ...d
            });
          } catch (e) {}
        }
      }
    }
  });

  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        type: 'exportAll',
        employees: employees,
        payrolls: payrolls,
        rateHistory: rateHistory
      })
    });

    await new Promise(r => setTimeout(r, 3000));

    const check = await gasRequest({ action: 'getAll' });
    const saved = check.data || check;

    const empCount = (saved.employees || []).length;
    const payrollCount = (saved.payrolls || []).length;
    const rateCount = (saved.rateHistory || []).length;

    if (empCount < employees.length) {
      throw new Error('저장 확인 실패: 직원 ' + empCount + '/' + employees.length);
    }

    const msg = LANG === 'JP'
      ? '✅ 保存確認完了！従業員 ' + empCount + '名、給与 ' + payrollCount + '件、料率 ' + rateCount + '件'
      : '✅ 저장 확인 완료! 직원 ' + empCount + '명, 급여 ' + payrollCount + '건, 요율 ' + rateCount + '건';

    if (statusEl) {
      statusEl.innerHTML = '<span style="color:var(--green)">' + msg + '</span>';
    }

    showToast(LANG === 'JP' ? 'Google保存確認完了 ✓' : 'Google 저장 확인 완료 ✓', 's');
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML =
        '<span style="color:var(--red)">❌ ' +
        err.message +
        '</span>';
    }

    showToast(LANG === 'JP' ? 'アップロード失敗' : '업로드 실패', 'e');
    console.error('exportAllToGas error:', err);
  }
}

function collectAllPayrolls() {
  const result = [];

  employees.forEach(emp => {
    for (let y = 2024; y <= 2030; y++) {
      for (let m = 1; m <= 12; m++) {
        const key = `kyuyo_p_${emp.no}_${y}_${m}`;
        const saved = localStorage.getItem(key);

        if (saved) {
          try {
            const d = JSON.parse(saved);
            result.push({
              no: emp.no,
              name: emp.name,
              year: y,
              month: m,
              ...d
            });
          } catch(e){}
        }
      }
    }
  });

  return result;
}
async function testGas() { await testGasConnection(); }

async function testGasConnection() {
  const urlInput = document.getElementById('gasUrlInput');
  const url = (urlInput?.value || gasUrl || '').trim();

  if (!url) {
    showToast(LANG === 'JP' ? 'URLを入力してください' : 'URL을 입력해 주세요', 'w');
    return;
  }

  const statusEl = document.getElementById('gas-sync-status');
  if (statusEl) {
    statusEl.textContent = LANG === 'JP' ? '接続テスト中...' : '연결 테스트 중...';
  }

  const callbackName = 'gasTest_' + Date.now();

  const cleanup = () => {
    delete window[callbackName];
    const old = document.getElementById(callbackName);
    if (old) old.remove();
  };

  window[callbackName] = function(res) {
    cleanup();

    if (res && res.ok) {
      if (statusEl) {
        statusEl.innerHTML =
          '<span style="color:var(--green)">✅ ' +
          (LANG === 'JP' ? '接続成功！' : '연결 성공！') +
          '</span>';
      }

      showToast(
        LANG === 'JP'
          ? '接続テスト成功 ✓'
          : '연결 테스트 성공 ✓',
        's'
      );
    } else {
      if (statusEl) {
        statusEl.innerHTML =
          '<span style="color:var(--red)">❌ ' +
          (res?.error || (LANG === 'JP' ? '接続失敗' : '연결 실패')) +
          '</span>';
      }
    }
  };

  const script = document.createElement('script');
  script.id = callbackName;
  script.src =
    url +
    '?action=test&callback=' +
    encodeURIComponent(callbackName) +
    '&t=' +
    Date.now();

  script.onerror = function() {
    cleanup();

    if (statusEl) {
      statusEl.innerHTML =
        '<span style="color:var(--red)">❌ ' +
        (LANG === 'JP'
          ? '接続失敗。URLを確認してください'
          : '연결 실패. URL 확인해 주세요') +
        '</span>';
    }

    showToast(
      LANG === 'JP'
        ? '接続失敗。URLを確認してください'
        : '연결 실패. URL 확인해 주세요',
      'e'
    );
  };

  document.body.appendChild(script);
}

function saveGasUrl() {
  const url = document.getElementById('gasUrlInput')?.value.trim();
  if(!url) { showToast(LANG==='JP'?'URLを入力してください':'URL을 입력해 주세요','w'); return; }
  gasUrl = url;
  localStorage.setItem(LS.gas, gasUrl);
  updateGasStatus();
  const actionsEl = document.getElementById('gas-actions');
  if(actionsEl) actionsEl.style.display = '';
  showToast(LANG==='JP'?'Google連携URLを保存しました ✓':'Google 연동 URL 저장됨 ✓','s');
}

function updateGasStatus() {
  const dot = document.getElementById('gasDot') || document.getElementById('gas-dot');
  const txt = document.getElementById('gasText') || document.getElementById('gas-txt');
  if(!dot||!txt) return;
  if(gasUrl) { dot.className='sdot sdot-ok'; txt.textContent=LANG==='JP'?'Google連携済み':'Google 연동됨'; }
  else { dot.className='sdot sdot-ng'; txt.textContent=LANG==='JP'?'Google未連携':'Google 미연동'; }
}

// GAS 통신 - JSONP 방식 (CORS 완전 우회)
function gasRequest(params, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = 'wisepay_cb_' + Date.now();
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      delete window[cbName];
      if (document.body.contains(script)) document.body.removeChild(script);
      reject(new Error('timeout'));
    }, timeoutMs);

    window[cbName] = (data) => {
      clearTimeout(timeout);
      delete window[cbName];
      document.body.removeChild(script);
      resolve(data);
    };

    const qs = Object.entries(params)
      .map(([k,v]) => k + '=' + encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : v))
      .join('&');
    script.src = gasUrl + '?' + qs + '&callback=' + cbName;
    script.onerror = () => {
      clearTimeout(timeout);
      delete window[cbName];
      reject(new Error('script load error'));
    };
    document.body.appendChild(script);
  });
}
async function importAllFromGas() {
  if(!gasUrl){showToast(LANG==='JP'?'先にURLを設定してください':'먼저 URL을 설정해 주세요','w');return;}
  const jp=LANG==='JP';
  if(!confirm(jp?'Googleのデータでローカルを上書きします。よろしいですか？':'구글 데이터로 로컬을 덮어씁니다. 계속하시겠습니까?')) return;
  const statusEl=document.getElementById('gas-sync-status');
  if(statusEl) statusEl.innerHTML=jp?'ダウンロード中... ⏳':'다운로드 중... ⏳';
  try {
    const result = await gasRequest({ action: 'getAll' });
    const d = result.data || result;
    if(d.employees&&d.employees.length>0){
      employees=d.employees.map(e=>({...e,
        families:typeof e.families==='string'?JSON.parse(e.families||'[]'):(e.families||[]),
        fuyouCount:parseInt(e.fuyouCount)||0,
        commute:parseInt(e.commute)||0
      }));
      localStorage.setItem(LS.emp,JSON.stringify(employees));
    }
    if(d.payrolls&&d.payrolls.length>0){
      d.payrolls.forEach(p=>localStorage.setItem('kyuyo_p_'+p.no+'_'+p.year+'_'+p.month, JSON.stringify(p)));
    }
    if(d.rateHistory&&d.rateHistory.length>0){
      rateHistory=d.rateHistory.map(r=>({
        from:r.from,
        kenko:parseFloat(r.kenko)||9.85,
        kaigo:parseFloat(r.kaigo)||1.62,
        kodomo:parseFloat(r.kodomo)||0,
        nenkin:parseFloat(r.nenkin)||18.30,
        koyo:parseFloat(r.koyo)||0.50
      }));
      saveRateHistory();
    }
    const msg=jp?'✅ 完了！従業員'+(d.employees||[]).length+'名、給与'+(d.payrolls||[]).length+'件':'✅ 완료! 직원 '+(d.employees||[]).length+'명, 급여 '+(d.payrolls||[]).length+'건';
    if(statusEl) statusEl.innerHTML='<span style="color:var(--green)">'+msg+'</span>';
    if(employees.length > 0 && currentEmpIdx < 0) currentEmpIdx = 0;
    renderEmpSelect(); loadPayrollForm(); applyRatesForYM(currentYear,currentMonth);
    showToast(jp?'ダウンロード完了 ✓':'가져오기 완료 ✓','s');
  } catch(err){
    if(statusEl) statusEl.innerHTML='<span style="color:var(--red)">❌ '+err.message+'</span>';
    console.error('importAllFromGas error:', err);
  }
}
const GAS_CODE = '// WisePay GAS 코드는 별도 파일(WisePay_GAS_code.gs)을 사용해 주세요';

// GAS 페이지 준비
function openGasModal() {
  const preview = document.getElementById('gasCodePreview');
  if (preview) preview.textContent = GAS_CODE;
  const inp = document.getElementById('gasUrlInput');
  if (inp) inp.value = gasUrl || '';
  const actionsEl = document.getElementById('gas-actions');
  if (actionsEl) actionsEl.style.display = gasUrl ? '' : 'none';
  updateGasUrlBadge();
}

function updateGasUrlBadge() {
  const input = document.getElementById('gasUrlInput');
  const badge = document.getElementById('gasUrlBadge');
  if (!input || !badge) return;
  const url = input.value.trim();
  if (!url) { badge.style.display = 'none'; return; }
  const jp = LANG === 'JP';
  badge.style.display = 'inline-block';
  if (url.endsWith('/exec')) {
    badge.textContent = jp ? '✅ デプロイ (exec)' : '✅ 배포 (exec)';
    badge.style.background = '#dcfce7';
    badge.style.color = '#166534';
    badge.style.borderColor = '#bbf7d0';
  } else if (url.endsWith('/dev')) {
    badge.textContent = jp ? '🧪 テストデプロイ (dev)' : '🧪 테스트 배포 (dev)';
    badge.style.background = '#fef3c7';
    badge.style.color = '#92400e';
    badge.style.borderColor = '#fde68a';
  } else {
    badge.textContent = jp ? '⚠️ URL確認' : '⚠️ URL 확인';
    badge.style.background = '#fee2e2';
    badge.style.color = '#991b1b';
    badge.style.borderColor = '#fecaca';
  }
}

// 로그인 후 GAS에서 조용히 최신 데이터 가져오기 (confirm 없음)
async function autoLoadFromGas() {
  if (!gasUrl) return;
  try {
    const result = await gasRequest({ action: 'getAll' });
    const d = result.data || result;
    if (d.employees && d.employees.length > 0) {
      employees = d.employees.map(e => ({
        ...e,
        families: typeof e.families === 'string' ? JSON.parse(e.families || '[]') : (e.families || []),
        fuyouCount: parseInt(e.fuyouCount) || 0,
        commute: parseInt(e.commute) || 0
      }));
      localStorage.setItem(LS.emp, JSON.stringify(employees));
    }
    if (d.payrolls && d.payrolls.length > 0) {
      d.payrolls.forEach(p =>
        localStorage.setItem('kyuyo_p_' + p.no + '_' + p.year + '_' + p.month, JSON.stringify(p))
      );
    }
    if (d.rateHistory && d.rateHistory.length > 0) {
      rateHistory = d.rateHistory.map(r => ({
        from: r.from,
        kenko: parseFloat(r.kenko) || 9.85,
        kaigo: parseFloat(r.kaigo) || 1.62,
        kodomo: parseFloat(r.kodomo) || 0,
        nenkin: parseFloat(r.nenkin) || 18.30,
        koyo: parseFloat(r.koyo) || 0.50
      }));
      saveRateHistory();
    }
    if (employees.length > 0 && currentEmpIdx < 0) currentEmpIdx = 0;
    renderEmpSelect();
    loadPayrollForm();
    applyRatesForYM(currentYear, currentMonth);
    buildAnnualEmpSel();
    renderAnnual();
    buildHistEmpSel();
    renderHistory();
    updateGasStatus();
    showToast(LANG === 'JP' ? 'Google同期完了 ✓' : 'Google 동기화 완료 ✓', 's');
  } catch (err) {
    console.warn('GAS auto-load failed:', err);
  }
}

// GAS 코드 클립보드 복사
function copyGasCode() {
  const text = document.getElementById('gasCodePreview')?.textContent || GAS_CODE;
  navigator.clipboard.writeText(text)
    .then(() => showToast(LANG === 'JP' ? 'コードをコピーしました ✓' : '코드를 복사했습니다 ✓', 's'))
    .catch(() => showToast(LANG === 'JP' ? 'コピー失敗' : '복사 실패', 'e'));
}

