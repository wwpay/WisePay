'use strict';
let LANG = 'KR';
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let currentEmpIdx = -1; // -1 = 미선택
let editingEmpIdx = -1;
let tempFamilies = [];
const GAS_URL = 'https://script.google.com/macros/s/AKfycbymciJAVPgcCA34OK3qr2sSXrPfpkrFSSTXnjqR6AGgHp9ZdZ0TOX8WIaxw2bs7NqL-sw/exec';
let gasUrl = GAS_URL;
let rates = { kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 };
// 월별 요율 이력 [{from:'2026-01', kenko:9.91, kaigo:1.60, ...}, ...]
// from: 'YYYY-MM' 형식, 해당 월부터 적용
let rateHistory = [
  { from:'2026-01', kenko:9.91, kaigo:1.59, kodomo:0.00, nenkin:18.30, koyo:0.50 },
  { from:'2026-03', kenko:9.85, kaigo:1.62, kodomo:0.00, nenkin:18.30, koyo:0.50 },
  { from:'2026-04', kenko:9.85, kaigo:1.62, kodomo:0.23, nenkin:18.30, koyo:0.50 },
];
let employees = [];
// 각 입력란의 이전 값 저장용 (ESC 복원)
const prevValues = {};

const LS = { emp:'kyuyo_emp', rates:'kyuyo_rates', rateHistory:'kyuyo_rate_history', gas:'kyuyo_gas', lang:'kyuyo_lang' };
let payrollDirty = false; // 급여명세 미저장 여부
let _pendingScrapedRates = null; // 스크래핑 결과 임시 보관

const PFIELDS = ['r-base','r-ot','r-kintai','r-commute','r-commutetax','r-kinmu','r-shokumu','r-field','k-jumin','k-nencho'];

