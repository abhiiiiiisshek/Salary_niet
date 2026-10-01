// node test/regression.cjs  — regenerates August 2026 and checks it against the approved figures.
const path = require('path'), fs = require('fs');
const JSZip = require(process.env.JSZIP || 'jszip');
const fsrc = fs.readFileSync(path.join(__dirname, '../src/engine.js'), 'utf8');
new Function('module', fsrc)(undefined);
const PAS = globalThis.PAS;
const X = fs.readFileSync(path.join(__dirname, '../private/payroll_template.xlsx'));
const W = fs.readFileSync(path.join(__dirname, '../private/memo_template.docx'));
(async () => {
  const out = await PAS.generate(JSZip, X, W, { year: 2026, monthIdx: 7, chequeDate: new Date(2026, 8, 1), att: {} }, 'nodebuffer');
  // Approved August 2026 total. Needs the private templates in private/ to run.
  const memoSum = out.calc.lines.reduce((t, l) => t + l.U, 0);
  const ok = out.ok && out.calc.total === 249199 && memoSum === out.calc.total
    && PAS.toWords(249199) === 'Two Lakh Forty-Nine Thousand One Hundred Ninety-Nine';
  console.log(ok ? 'PASS  August 2026 = ₹2,49,199' : 'FAIL'); process.exit(ok ? 0 : 1);
})();
