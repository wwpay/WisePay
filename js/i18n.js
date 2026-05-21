// 수정: 2026-05-21 10:57 — 사이드바 로고 WisePay CI 디자인 적용
'use strict';
function setTxt(id, jp, kr) {
  const el = document.getElementById(id);
  if (el) el.textContent = LANG === 'JP' ? jp : kr;
}
function setHtml(id, jp, kr) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = LANG === 'JP' ? jp : kr;
}

function toggleLang() {
  LANG = LANG === 'JP' ? 'KR' : 'JP';
  localStorage.setItem(LS.lang, LANG);
  applyLang();

  renderMonthTabs();
  renderEmpSelect();
  renderEmpList();
  renderRatesPage();
  updateGasStatus();
  recalc();

  showToast(
    LANG === 'JP' ? '日本語に切り替えました' : '한국어로 전환했습니다',
    's'
  );
}

function applyLang() {
  document.documentElement.lang = LANG === 'JP' ? 'ja' : 'ko';

  setTxt('t-appname', '給与Pro', '급여Pro');
  setTxt('t-nav-main', 'メイン', '메인');
  setTxt('t-nav-payroll', '給与明細', '급여 명세');
  setTxt('t-nav-history', '支給履歴', '지급 이력');
  setTxt('t-nav-annual', '年間給与一覧', '연간 급여 일람');
  setTxt('t-nav-setting', '設定', '설정');
  setTxt('t-nav-emp', '従業員管理', '직원 관리');
  setTxt('t-emp-add', '+ 新規', '+ 직원 추가');
  setTxt('t-nav-rates', '保険料率設定', '보험료율 설정');
  setTxt('t-nav-gas', 'Google連携設定', 'Google 연동 설정');

  setTxt('t-langbtn', '한국어로 전환', '日本語に切替');
  setTxt('t-ai-btn', '最新料率を取得', '최신 요율 가져오기');
  setTxt('t-save-btn', '保存', '저장');
  setTxt('t-print-btn', '印刷', '인쇄');

  setTxt('t-net-label', '差引総支給額（手取り）', '차인지급액');
  setTxt('t-card-shikyuu', '支給', '지급');
  setTxt('t-card-kojo', '控除', '공제');

  setTxt('t-r-base', '月給', '월급');
  setTxt('t-r-ot', '残業手当', '잔업수당');
  setTxt('t-r-kintai', '勤怠控除', '근태공제');
  setTxt('t-r-commute', '非課税通勤手当', '비과세 교통비');
  setTxt('t-r-commutetax', '課税通勤手当', '과세 교통비');
  setTxt('t-r-kinmu', '勤務手当', '근무수당');
  setTxt('t-r-shokumu', '職務手当', '직무수당');
  setTxt('t-r-field', '現場手当', '현장수당');
  setTxt('t-r-total', '計', '합계');

  setTxt('t-k-kenko', '健康保険料', '건강보험료');
  setTxt('t-k-kaigo', '介護保険料', '개호보험료');
  setTxt('t-k-kodomo', '子ども・子育て支援金', '자녀・육아지원금');
  setTxt('t-k-nenkin', '厚生年金保険料', '후생연금보험료');
  setTxt('t-k-koyo', '雇用保険料', '고용보험료');
  setTxt('t-k-shotoku', '所得税', '소득세');
  setTxt('t-k-jumin', '住民税', '주민세');
  setTxt('t-k-nencho', '年末調整精算額', '연말정산 정산액');
  setTxt('t-k-total', '計', '합계');

  setTxt('t-gas-title', '🔗 Google スプレッドシート連携設定', '🔗 Google 스프레드시트 연동 설정');
  setTxt('t-gas-cancel', 'キャンセル', '취소');
  setTxt('t-gas-test', '🔌 接続テスト', '🔌 접속 테스트');
  setTxt('t-gas-save', '保存して連携', '저장하고 연동');

  setTxt('t-gas-page-title', 'Google連携設定', 'Google 연동 설정');
  setTxt('t-gas-desc', 'Google Apps Script を使って給与データをスプレッドシートに自動保存・同期できます。', 'Google Apps Script를 사용해 급여 데이터를 스프레드시트에 자동 저장·동기화할 수 있습니다.');
  setTxt('t-gas-step1-title', 'Google スプレッドシートを新規作成', 'Google 스프레드시트 새로 만들기');
  setTxt('t-gas-step1-desc', '「WisePay」という名前でスプレッドシートを作成してください。', '「WisePay」라는 이름으로 스프레드시트를 만들어 주세요.');
  setTxt('t-gas-step2-title', '拡張機能 → Apps Script を開く', '확장 프로그램 → Apps Script 열기');
  setTxt('t-gas-step2-desc', 'メニュー「拡張機能」→「Apps Script」→ code.gs に以下のコードを貼り付けてください。', '메뉴 「확장 프로그램」→「Apps Script」→ code.gs에 아래 코드를 붙여 넣으세요.');
  setTxt('t-gas-code-comment', '// ↓ このコードを code.gs にそのまま貼り付けてください', '// ↓ 이 코드를 code.gs에 그대로 붙여 넣으세요');
  setTxt('t-gas-copy-btn', '📋 コードをコピー', '📋 코드 복사');
  setTxt('t-gas-step3-title', 'ウェブアプリとしてデプロイ', '웹 앱으로 배포');
  setHtml('t-gas-step3-desc',
    '「デプロイ」→「新しいデプロイ」→ 種類:「ウェブアプリ」<br>アクセス権限:「全員」→ デプロイ → <strong>URLをコピー</strong><br><span style="color:var(--orange);font-size:11px;">✅ exec = 「デプロイ」URL（アクセス:全員 必須）&nbsp;&nbsp;🧪 dev = 「テストデプロイ」URL（オーナーのみ・権限エラーが出やすい）</span>',
    '「배포」→「새 배포」→ 유형:「웹 앱」<br>액세스 권한:「전체」→ 배포 → <strong>URL 복사</strong><br><span style="color:var(--orange);font-size:11px;">✅ exec = 「배포」URL (액세스:전체 필수)&nbsp;&nbsp;🧪 dev = 「테스트 배포」URL (소유자만·권한 오류 잦음)</span>'
  );
  setTxt('t-gas-step4-title', 'WebアプリのURLを入力', '웹 앱 URL 입력');
  setTxt('t-gas-sync-title', 'データ同期', '데이터 동기화');
  setTxt('t-gas-upload-label', 'ローカル → Google', '로컬 → Google');
  setTxt('t-gas-upload-desc', '現在のデータをGoogleに保存', '현재 데이터를 Google에 저장');
  setTxt('t-gas-download-label', 'Google → ローカル', 'Google → 로컬');
  setTxt('t-gas-download-desc', '⚠️ ローカルデータが上書きされます', '⚠️ 로컬 데이터가 덮어써집니다');
  setTxt('t-gas-sync-note', '※ 初回は「ローカル → Google」で既存データをアップロードしてください', '※ 초회는 「로컬 → Google」로 기존 데이터를 업로드해 주세요');

  setTxt('t-rates-page-title', '保険料率設定', '보험료율 설정');
  setTxt('t-rates-desc', '協会けんぽ東京都・2026年度の料率。改定時に更新してください。', '협회けんぽ 도쿄도・2026년도 요율. 개정 시 업데이트해 주세요.');
  setTxt('t-rates-current', '現在の適用料率', '현재 적용 요율');
  setTxt('t-rates-ai', 'AIで最新料率を確認', 'AI로 최신 요율 확인');
  setTxt('t-rates-save', '料率を保存', '요율 저장');

  updateGasStatus();
}

