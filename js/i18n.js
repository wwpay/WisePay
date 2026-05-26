// 수정: 2026-05-27 00:00 — 임금대장 플레이스홀더 i18n 텍스트 추가
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
  updateRatesDisplay();
  renderAnnual();
  renderHistory();
  buildHistEmpSel();
  updateGasStatus();
  recalc();

  showToast(
    LANG === 'JP' ? '日本語に切り替えました' : '한국어로 전환했습니다',
    's'
  );
}

function applyLang() {
  document.documentElement.lang = LANG === 'JP' ? 'ja' : 'ko';

  setTxt('t-appname', '給与Pro by Wisewires', '급여Pro by Wisewires');
  setTxt('t-nav-main', 'メイン', '메인');
  setTxt('t-nav-payroll', '給与明細', '급여 명세');
  setTxt('t-nav-history', '支給履歴', '지급 이력');
  setTxt('t-nav-annual', '賃金台帳', '임금대장');
  setTxt('t-annual-title', '賃金台帳', '임금대장');
  setTxt('t-nav-setting', '設定', '설정');
  setTxt('t-nav-emp', '従業員管理', '사원 관리');
  setTxt('t-emp-add', '+ 新規', '+ 사원 추가');
  setTxt('t-nav-rates', '保険料率設定', '보험료율 설정');
  setTxt('t-nav-gas', 'データ管理', '데이터 관리');

  setTxt('t-langbtn', '한국어로 전환', '日本語に切替');
  setTxt('t-ai-btn', '協会けんぽ 最新料率を取得', '協会けんぽ 최신 요율 가져오기');
  setTxt('t-save-btn', '保存', '저장');
  // t-del-month-btn은 renderMonthTabs()에서 동적으로 갱신
  setTxt('t-print-btn', '印刷', '인쇄');
  setTxt('t-pdf-btn', 'PDF保存', 'PDF 저장');

  setTxt('t-net-label', '差引総支給額（手取り）', '차인지급액');
  setTxt('t-card-shikyuu', '支給', '지급');
  setTxt('t-card-kojo', '控除', '공제');

  setTxt('t-r-base', '月給', '월급');
  setTxt('t-r-ot', '残業手当', '잔업수당');
  setTxt('t-r-commute', '非課税通勤手当', '비과세 교통비');
  setTxt('t-r-kinmu', '勤務手当', '근무수당');
  setTxt('t-r-shokumu', '職務手当', '직무수당');
  setTxt('t-r-field', '現場手当', '현장수당');
  setHtml('t-r-hyo', '標準報酬月額<br>（手動指定・任意）', '표준보수월액<br>（수동지정・선택）');
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

  setTxt('t-gas-page-title', 'Google連携設定', 'Google 연동 설정');
  setTxt('t-gas-desc', 'Google Apps Script を使って給与データをスプレッドシートに自動保存・同期できます。', 'Google Apps Script를 사용해 급여 데이터를 스프레드시트에 자동 저장·동기화할 수 있습니다.');
  setTxt('t-gas-step1-title', 'Google スプレッドシートを新規作成', 'Google 스프레드시트 새로 만들기');
  setTxt('t-gas-step1-desc', '「WisePay」という名前でスプレッドシートを作成してください。', '「WisePay」라는 이름으로 스프레드시트를 만들어 주세요.');
  setTxt('t-gas-step3-title', 'ウェブアプリとしてデプロイ', '웹 앱으로 배포');
  setHtml('t-gas-step3-desc',
    '「デプロイ」→「新しいデプロイ」→ 種類:「ウェブアプリ」<br>アクセス権限:「全員」→ デプロイ → <strong>URLをコピー</strong><br><span style="color:var(--orange);font-size:11px;">✅ exec = 「デプロイ」URL（アクセス:全員 必須）&nbsp;&nbsp;🧪 dev = 「テストデプロイ」URL（オーナーのみ・権限エラーが出やすい）</span>',
    '「배포」→「새 배포」→ 유형:「웹 앱」<br>액세스 권한:「전체」→ 배포 → <strong>URL 복사</strong><br><span style="color:var(--orange);font-size:11px;">✅ exec = 「배포」URL (액세스:전체 필수)&nbsp;&nbsp;🧪 dev = 「테스트 배포」URL (소유자만·권한 오류 잦음)</span>'
  );
  setTxt('t-gas-step4-title', 'WebアプリのURLを入力', '웹 앱 URL 입력');
  setTxt('t-gas-sync-title', 'データ同期', '데이터 동기화');
  setTxt('t-gas-upload-label', 'ローカルPC → Googleドライブ', '로컬PC → 구글 드라이브');
  setTxt('t-gas-upload-desc', 'ローカルデータをGoogleドライブに上書きします', '로컬 데이터를 구글 드라이브에 덮어씁니다');
  setTxt('t-gas-download-label', 'Googleドライブ → ローカルPC', '구글 드라이브 → 로컬PC');
  setTxt('t-gas-download-desc', 'Googleドライブのデータをローカルに上書きします', '구글 드라이브 데이터를 로컬에 덮어씁니다');
  setTxt('t-backup-title', 'データバックアップ', '데이터 백업');
  setTxt('t-backup-json-btn', '📄 JSONバックアップ', '📄 JSON 백업');
  setTxt('t-backup-excel-btn', '📊 Excelバックアップ', '📊 Excel 백업');
  setTxt('t-backup-file-desc', 'ファイル名: WisePay_backup_YYYYMMDD', '파일명: WisePay_backup_YYYYMMDD');
  setTxt('t-backup-auto-title', '📅 Googleドライブ 自動バックアップ', '📅 구글 드라이브 자동 백업');
  setTxt('t-backup-auto-desc',
    '毎週月曜日の午前9時に別のスプレッドシートへ自動バックアップされます（最大26個保持）。',
    '매주 월요일 오전 9시에 별도 스프레드시트로 자동 백업됩니다 (최대 26개 유지).'
  );

  setTxt('t-reset-zone', '危険区域', '위험 구역');
  setTxt('t-reset-title', 'ローカルデータ初期化', '로컬 데이터 초기화');
  setTxt('t-reset-desc', '従業員・給与・保険料率などブラウザに保存されたデータをすべて削除します。', '사원·급여·요율 등 브라우저에 저장된 모든 데이터를 삭제합니다.');
  setTxt('t-reset-btn', '初期化', '초기화');

  setTxt('t-rates-page-title', '保険料率設定', '보험료율 설정');
  setTxt('t-rates-desc', '協会けんぽ東京都・2026年度の料率。改定時に更新してください。', '協会けんぽ 도쿄도・2026년도 요율. 개정 시 업데이트해 주세요.');
  setTxt('t-rates-current', '現在の適用料率', '현재 적용 요율');
  setTxt('t-rates-ai', '協会けんぽから最新料率を取得', '協会けんぽ 최신 요율 가져오기');
  setTxt('t-rates-save', '料率を保存', '요율 저장');

  setTxt('t-annual-sel-btn',    '従業員選択',  '사원 선택');
  setTxt('t-annual-modal-title','従業員を選択','사원 선택');
  setTxt('t-annual-sel-all',   '全選択',      '전체 선택');
  setTxt('t-annual-sel-clear', '全解除',      '전체 해제');
  setTxt('t-annual-sel-ok',    '確認',        '확인');
  setTxt('t-annual-sel-cancel','キャンセル',  '취소');

  setTxt('t-history-title', '支給履歴', '지급 이력');
  setTxt('t-h-month', '月', '월');
  setTxt('t-h-name', '氏名', '이름');
  setTxt('t-h-pay', '支給総額', '지급총액');
  setTxt('t-h-kojo', '控除総額', '공제총액');
  setTxt('t-h-net', '手取り', '실수령액');
  setTxt('t-h-nenkin', '厚生年金', '후생연금');
  setTxt('t-h-kenko', '健康保険', '건강보험');
  setTxt('t-h-shotoku', '所得税', '소득세');

  setTxt('empFormTitle', '従業員を選択してください', '사원을 선택해 주세요');
  setTxt('t-emp-select-hint', '左のリストから従業員を選択するか、「新規」ボタンで登録してください。', '좌측 목록에서 사원을 선택하거나, 「사원 추가」 버튼으로 등록해 주세요。');

  setTxt('t-payroll-ph-main', '従業員を選択してください', '사원을 선택해 주세요');
  setTxt('t-payroll-ph-sub', '上のドロップダウンから従業員を選択すると給与明細が表示されます。', '위 드롭다운에서 사원을 선택하면 급여 명세가 표시됩니다.');
  setTxt('t-annual-ph-main', '従業員を選択してください', '사원을 선택해 주세요');
  setTxt('t-annual-ph-sub', '上の「従業員選択」ボタンから選択すると賃金台帳が表示されます。', '위 「사원 선택」 버튼으로 선택하면 임금대장이 표시됩니다.');
  setTxt('t-rates-title', '適用保険料率（2026年度・東京都）', '적용 보험료율（2026년도・도쿄도）');
  setHtml('t-rt-kenko', '健康保険料率<br>（東京都）', '건강보험료율<br>（도쿄도）');
  setHtml('t-rt-kaigo', '介護保険料率<br>（全国一律）', '개호보험료율<br>（전국 일률）');
  setHtml('t-rt-kodomo', '子育て支援金率<br>（全国一律）', '자녀지원금율<br>（전국 일률）');
  setHtml('t-rt-nenkin', '厚生年金<br>保険料率', '후생연금<br>보험료율');
  setHtml('t-rt-koyo', '雇用保険料率<br>（労働者負担）', '고용보험료율<br>（근로자 부담）');
  setTxt('t-calc-title', '給与計算情報', '급여 계산 정보');
  setTxt('t-ci-kenko', '健康保険', '건강보험');
  setTxt('t-ci-nenkin', '厚生年金', '후생연금');
  setTxt('t-ci-koyo', '雇用保険', '고용보험');
  setTxt('t-ci-shotoku', '所得税', '소득세');
  setTxt('t-nencho-hint', '※ 還付はマイナス(-)入力', '※ 환급은 마이너스(-) 입력');
  setTxt('t-banner-msg', '【保険料率更新】2026年度 協会けんぽ（東京都）の保険料率が改定されました。', '【보험료율 업데이트】2026년도 協会けんぽ（東京都）의 보험료율이 개정되었습니다。');

  setTxt('t-mr-title', '✨ 最新保険料率（2026年度）', '✨ 최신 보험료율（2026년도）');
  setTxt('t-mr-desc', '2026年度 東京都・協会けんぽの確定料率です。', '2026년도 도쿄도・協会けんぽ의 확정 요율입니다。');
  setHtml('t-mr-src', '※ 出典：協会けんぽ東京支部（2026年2月16日発表）<br>※ 健康保険料率は毎年3月、雇用保険料率は毎年4月改定', '※ 출처：協会けんぽ東京支部（2026년 2월 16일 발표）<br>※ 건강보험료율은 매년 3월, 고용보험료율은 매년 4월 개정');
  setTxt('t-mr-cancel', 'キャンセル', '취소');
  setTxt('t-mr-apply', 'この料率を適用する', '이 요율을 적용');

  updateGasStatus();

  // 언어 변경 시 현재 활성 페이지 상단 타이틀 즉시 갱신
  const _ap = document.querySelector('.page.active');
  if (_ap) {
    const _id = _ap.id.replace('page-', '');
    const _titles = {payroll:{JP:'給与明細',KR:'급여 명세'},history:{JP:'支給履歴',KR:'지급 이력'},employees:{JP:'従業員管理',KR:'사원 관리'},rates:{JP:'保険料率設定',KR:'보험료율 설정'},annual:{JP:'賃金台帳',KR:'임금대장'},gas:{JP:'データ管理',KR:'데이터 관리'},notifications:{JP:'通知',KR:'알림'}};
    const _t = _titles[_id];
    const _el = document.getElementById('topbar-title');
    if (_t && _el) _el.textContent = _t[LANG];
  }
}

