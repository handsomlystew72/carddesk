const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../parts/algo.js', 'utf8');
const m = src.split('/* ALGO-START */')[1].split('/* ALGO-END */')[0];
const { calibrationStatus, overshootPoints, gradeNum, centeringCeiling } = new Function(m + '; return {calibrationStatus, overshootPoints, gradeNum, centeringCeiling};')();
let fail = 0;
const eq = (label, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if(!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

// status
eq('PSA ceiling 9, got 9 -> at', calibrationStatus('psa', '9', '9'), 'at');
eq('PSA ceiling 9, got 8 -> below', calibrationStatus('psa', '9', '8'), 'below');
eq('PSA ceiling 9, got 10 -> above', calibrationStatus('psa', '9', '10'), 'above');
eq('CGC ceiling 9, got 9.5 -> between (no 9.5 tier)', calibrationStatus('cgc', '9', '9.5'), 'between');
eq('CGC ceiling 9, got 10 -> above', calibrationStatus('cgc', '9', '10'), 'above');
eq('CGC ceiling 10, got 10 Pristine -> above', calibrationStatus('cgc', '10', '10 Pristine'), 'above');
eq('CGC ceiling 10 Pristine, got 10 -> below', calibrationStatus('cgc', '10 Pristine', '10'), 'below');
eq('BGS ceiling 9, got 9.5 -> above (9.5 is a real tier)', calibrationStatus('bgs', '9', '9.5'), 'above');
eq('BGS ceiling 8.5, got 9 -> above', calibrationStatus('bgs', '8.5', '9'), 'above');
eq('PSA below-scale ceiling 1, got 5 -> above', calibrationStatus('psa', '1', '5'), 'above');
eq('PSA ceiling 10 can never be above', calibrationStatus('psa', '10', '10'), 'at');
// overshoot
eq('PSA 10 needs 55; measured 58 -> 3', overshootPoints('psa', '10', 58, null), 3);
eq('PSA 10 back 75; back 80 -> 5 (front 52 fine)', overshootPoints('psa', '10', 52, 80), 5);
eq('PSA 9 needs 60; measured 58 -> 0', overshootPoints('psa', '9', 58, 70), 0);
eq('CGC 9.5 judged against the 9 tier (60)', overshootPoints('cgc', '9.5', 63, null), 3);
eq('BGS 9.5 front 55 back 60; measured 57/62 -> 2', overshootPoints('bgs', '9.5', 57, 62), 2);
// consistency: ceiling from a measurement is never "above" for the grade it names
for(const k of ['psa', 'bgs', 'cgc']) for(const fw of [50, 53, 56, 61, 66, 71, 82]) {
  const c = centeringCeiling(k, fw, null).grade;
  if(calibrationStatus(k, c, c) !== 'at') { fail++; console.log('FAIL self-consistency', k, fw, c); }
}
console.log(fail ? fail + ' FAILED' : 'ALL PASSED');
process.exit(fail ? 1 : 0);
