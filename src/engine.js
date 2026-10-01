/* Payroll Automation System — engine (works in browser and Node).
 * Needs JSZip. Templates are the approved Aug-2026 files with only the monthly values tokenised. */
(function (root) {
  'use strict';

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const SHEET = 'xl/worksheets/sheet4.xml';
  const FIRST_ROW = 4, LAST_ROW = 12;

  // Memo table order -> Excel row (the approved memo lists people in a different order than the sheet)
  // comma:false = that memo row is written without a comma in the approved memo (e.g. "27500=00").
  const MEMO_ROWS = [
    { memo: 1, row: 4,  comma: true  },
    { memo: 2, row: 5,  comma: true  },
    { memo: 3, row: 6,  comma: true  },
    { memo: 4, row: 9,  comma: true  },
    { memo: 5, row: 7,  comma: true  },
    { memo: 6, row: 8,  comma: true  },
    { memo: 7, row: 10, comma: false },
    { memo: 8, row: 11, comma: false },
    { memo: 9, row: 12, comma: true  },
  ];

  // ---------- the ONE rounding function every rupee passes through ----------
  // Same as Excel ROUND(x,0): half away from zero, after trimming float noise to 15 digits.
  function roundRupee(x) {
    const v = Number(Number(x).toPrecision(15));
    return v < 0 ? -Math.round(-v) : Math.round(v);
  }

  // ---------- calendar ----------
  function calendar(year, monthIdx /*0-11*/) {
    const days = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
    const payIdx = (monthIdx + 1) % 12, payYear = monthIdx === 11 ? year + 1 : year;
    return {
      year, monthIdx, days, monthName: MONTHS[monthIdx],
      payYear, payIdx, payMonthName: MONTHS[payIdx],
      short: MONTHS[monthIdx].slice(0, 3), payShort: MONTHS[payIdx].slice(0, 3),
    };
  }

  // ---------- Indian number formatting & words ----------
  function indianCommas(n) {
    const s = String(Math.abs(n));
    if (s.length <= 3) return s;
    const last3 = s.slice(-3), rest = s.slice(0, -3);
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  const ONES = ['', 'One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const TENS = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''); }
  function three(n) {
    const h = Math.floor(n / 100), r = n % 100, out = [];
    if (h) out.push(ONES[h] + ' Hundred');
    if (r) out.push(two(r));
    return out.join(' ');
  }
  function toWords(n) {
    if (n === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const thousand = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push(toWords(crore) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (thousand) parts.push(two(thousand) + ' Thousand');
    if (n) parts.push(three(n));
    return parts.join(' ');
  }

  // ---------- small XML helpers ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cellRe = ref => new RegExp('<c r="' + ref + '"(?: [^>]*?)?(?:/>|>[\\s\\S]*?</c>)');
  function cellStyle(xml, ref) {
    const m = xml.match(cellRe(ref)); if (!m) throw new Error('Template cell missing: ' + ref);
    const s = m[0].match(/ s="(\d+)"/); return s ? ' s="' + s[1] + '"' : '';
  }
  function setCell(xml, ref, kind, val, formula) {
    const st = cellStyle(xml, ref);
    let c;
    if (kind === 'n') c = '<c r="' + ref + '"' + st + '><v>' + val + '</v></c>';
    else if (kind === 'f') c = '<c r="' + ref + '"' + st + '><f>' + esc(formula) + '</f><v>' + val + '</v></c>';
    else c = '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + esc(val) + '</t></is></c>';
    return xml.replace(cellRe(ref), () => c);
  }
  function readNum(xml, ref) {
    const m = xml.match(cellRe(ref)); if (!m) return null;
    if (/t="s"|inlineStr/.test(m[0])) return null;
    const v = m[0].match(/<v>([^<]*)<\/v>/); return v ? Number(v[1]) : null;
  }
  function readShared(sst) {
    return [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join('')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }
  function readStr(xml, ref, sst) {
    const m = xml.match(cellRe(ref)); if (!m) return '';
    const v = m[0].match(/<v>([^<]*)<\/v>/);
    return /t="s"/.test(m[0]) && v ? sst[Number(v[1])] : '';
  }

  // ---------- employee master, read from the template itself ----------
  async function loadMaster(JSZip, xlsxBuf, docxBuf) {
    const xz = await JSZip.loadAsync(xlsxBuf), dz = await JSZip.loadAsync(docxBuf);
    const sheet = await xz.file(SHEET).async('string');
    const sst = readShared(await xz.file('xl/sharedStrings.xml').async('string'));
    const doc = await dz.file('word/document.xml').async('string');
    const tbl = doc.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)[0];
    const rows = tbl.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g).slice(1);
    const cellText = c => [...c.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(x => x[1]).join('');
    const memo = rows.map(r => r.match(/<w:tc>[\s\S]*?<\/w:tc>/g).map(cellText));

    const emps = [];
    for (let r = FIRST_ROW; r <= LAST_ROW; r++) {
      const isScale = r === 4;
      const J = readNum(sheet, 'J' + r), K = readNum(sheet, 'K' + r), N = readNum(sheet, 'N' + r) || 0;
      const M = isScale ? null : readNum(sheet, 'M' + r);
      const esi = /<c r="R\d+"[^>]*><f>/.test((sheet.match(cellRe('R' + r)) || [''])[0]);
      const mr = MEMO_ROWS.find(x => x.row === r), mrow = memo[mr.memo - 1];
      emps.push({
        row: r, sl: r - 3, name: readStr(sheet, 'B' + r, sst).trim(), designation: readStr(sheet, 'C' + r, sst),
        scale: isScale, bandPay: J, gradePay: K, hra: N, consolidated: M, esi,
        memoNo: mr.memo, memoComma: mr.comma, memoName: mrow[1], account: mrow[2],
      });
    }
    return emps;
  }

  // ---------- calculation (mirrors the sheet's formulas exactly) ----------
  function calculate(emps, cal, att) {
    const D = cal.days;
    const lines = emps.map(e => {
      const a = att[e.row] || { cl: 0, ml: 0, lwp: 0 };
      const G = Number(a.lwp) || 0;
      let L = null, M, O;
      if (e.scale) { L = (e.bandPay + e.gradePay) * 1; M = e.bandPay + e.gradePay + L; O = (e.bandPay + e.gradePay + L) / D * G; }
      else { M = e.consolidated; O = M / D * G; }
      const N = e.hra || 0;
      const P = M + N - O;
      const R = e.esi ? +P * 0.0075 : 0;
      const Q = 0, S = 0, T = 0;
      const U = roundRupee(P + Q - R - S - T);
      return { e, D, E: Number(a.cl) || 0, F: Number(a.ml) || 0, G, H: D - G, L, M, N, O, P, Q, R, S, T, U };
    });
    const sum = k => lines.reduce((t, l) => t + (l[k] || 0), 0);
    const total = sum('U');
    return { lines, totals: { M: sum('M'), N: sum('N'), O: sum('O'), P: sum('P'), Q: 0, R: sum('R'), S: 0, T: 0, U: total }, total };
  }

  // ---------- validation ----------
  function validate(emps, cal, att, chequeDate) {
    const errs = [];
    if (!chequeDate || isNaN(chequeDate.getTime())) errs.push('Cheque date is missing.');
    const accts = new Set();
    for (const e of emps) {
      const a = att[e.row] || {};
      for (const [k, label] of [['cl', 'C/L'], ['ml', 'M/L & E/L'], ['lwp', 'Leave W/Pay']]) {
        const v = Number(a[k] ?? 0);
        if (!Number.isFinite(v)) errs.push(`${e.name}: ${label} is not a number.`);
        else if (v < 0) errs.push(`${e.name}: ${label} cannot be negative.`);
        else if (v > cal.days) errs.push(`${e.name}: ${label} (${v}) is more than ${cal.days} days in ${cal.monthName}.`);
        else if (Math.round(v * 2) !== v * 2) errs.push(`${e.name}: ${label} must be whole or half days.`);
      }
      if ((Number(a.cl) || 0) + (Number(a.ml) || 0) + (Number(a.lwp) || 0) > cal.days) errs.push(`${e.name}: total leave exceeds ${cal.days} days.`);
      if (!e.account) errs.push(`${e.name}: bank account missing in memo template.`);
      else if (accts.has(e.account)) errs.push(`Duplicate bank account ${e.account}.`);
      accts.add(e.account);
      if (e.scale ? !(e.bandPay > 0) : !(e.consolidated > 0)) errs.push(`${e.name}: salary missing in template.`);
    }
    return errs;
  }

  const dd = n => String(n).padStart(2, '0');
  const fmtDate = d => dd(d.getDate()) + '.' + dd(d.getMonth() + 1) + '.' + d.getFullYear();

  // ---------- build Excel ----------
  async function buildExcel(JSZip, xlsxBuf, cal, calc, chequeDate) {
    const z = await JSZip.loadAsync(xlsxBuf);
    let x = await z.file(SHEET).async('string');
    const num = v => String(Number(v.toPrecision ? v.toPrecision(15) : v));
    x = setCell(x, 'A2', 's', 'PAYROLL OF TEACHING & NON TEACHING STAFF FOR THE MONTH OF  ' + cal.monthName.toUpperCase() + '-' + cal.year);
    for (const l of calc.lines) {
      const r = l.e.row;
      x = setCell(x, 'D' + r, 'n', l.D);
      x = setCell(x, 'E' + r, 'n', l.E);
      x = setCell(x, 'F' + r, 'n', l.F);
      x = setCell(x, 'G' + r, 'n', l.G);
      x = setCell(x, 'H' + r, 'f', l.H, `D${r}-G${r}`);
      if (l.e.scale) {
        x = setCell(x, 'L' + r, 'f', num(l.L), `SUM(J${r}+K${r})*1`);
        x = setCell(x, 'M' + r, 'f', num(l.M), `J${r}+K${r}+L${r}`);
        x = setCell(x, 'O' + r, 'f', num(l.O), `SUM(J${r}+K${r}+L${r})/D${r}*G${r}`);
      } else {
        x = setCell(x, 'O' + r, 'f', num(l.O), `M${r}/D${r}*G${r}`);
      }
      x = setCell(x, 'P' + r, 'f', num(l.P), `M${r}+N${r}-O${r}`);
      if (l.e.esi) x = setCell(x, 'R' + r, 'f', num(l.R), `+P${r}*0.0075`);
      x = setCell(x, 'U' + r, 'f', l.U, `ROUND(P${r}+Q${r}-R${r}-S${r}-T${r},0)`);
      x = setCell(x, 'V' + r, 's', 'Paid through BT dtd.' + fmtDate(chequeDate));
    }
    const t = calc.totals;
    for (const k of ['M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U'])
      x = setCell(x, k + '13', 'f', num(t[k]), `SUM(${k}${FIRST_ROW}:${k}${LAST_ROW})`);
    x = setCell(x, 'B15', 's', 'Rupees In Words: ' + toWords(calc.total).toUpperCase() + ' ONLY.');
    z.file(SHEET, x);

    const tab = cal.short.toLowerCase() + "'" + String(cal.year).slice(2);
    const q = "'" + tab.replace(/'/g, "''") + "'";
    let wb = await z.file('xl/workbook.xml').async('string');
    wb = wb.replace(/<sheet name="[^"]*"/, '<sheet name="' + esc(tab).replace(/'/g, '&apos;') + '"')
           .replace(/(<definedName name="_xlnm\.Print_Area" localSheetId="0">)[^<]*(<\/definedName>)/, (m, a, b) => a + esc(q) + '!$A$1:$V$21' + b);
    z.file('xl/workbook.xml', wb);
    let app = await z.file('docProps/app.xml').async('string');
    app = app.replace(/(<TitlesOfParts><vt:vector[^>]*>)<vt:lpstr>[^<]*<\/vt:lpstr><vt:lpstr>[^<]*<\/vt:lpstr>/,
      (m, a) => a + '<vt:lpstr>' + esc(tab) + '</vt:lpstr><vt:lpstr>' + esc(q) + '!Print_Area</vt:lpstr>');
    z.file('docProps/app.xml', app);
    return z;
  }

  // ---------- build Word memo ----------
  async function buildMemo(JSZip, docxBuf, cal, calc, chequeDate, chequeNo) {
    const z = await JSZip.loadAsync(docxBuf);
    let d = await z.file('word/document.xml').async('string');
    const words = toWords(calc.total);
    const map = {
      SAL_MON: cal.short + '-' + cal.year,
      PAY_MON: cal.payShort + '-' + cal.payYear,
      CHQ_NO: chequeNo && String(chequeNo).trim() ? ' ' + String(chequeNo).trim() : '        ',
      CHQ_DATE: fmtDate(chequeDate),
      TOTAL_IN: indianCommas(calc.total),
      WORDS_TITLE: words,
      WORDS_CAPS: words.toUpperCase(),
    };
    for (const mr of MEMO_ROWS) {
      const l = calc.lines.find(x => x.e.row === mr.row);
      map['AMT' + mr.memo] = mr.comma ? indianCommas(l.U) : String(l.U);
    }
    d = d.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, k) => { if (!(k in map)) throw new Error('Unknown token ' + k); return esc(map[k]); });
    if (/\{\{/.test(d)) throw new Error('Unfilled token in memo');
    z.file('word/document.xml', d);
    return z;
  }

  // ---------- one call does everything ----------
  async function generate(JSZip, xlsxBuf, docxBuf, input /* {year, monthIdx, chequeDate:Date, chequeNo, att:{row:{cl,ml,lwp}}} */, outType) {
    const cal = calendar(input.year, input.monthIdx);
    const emps = await loadMaster(JSZip, xlsxBuf, docxBuf);
    const errs = validate(emps, cal, input.att, input.chequeDate);
    if (errs.length) return { ok: false, errors: errs, cal, emps };
    const calc = calculate(emps, cal, input.att);
    // cross-check: memo total == Excel total == words
    const memoSum = MEMO_ROWS.reduce((t, mr) => t + calc.lines.find(x => x.e.row === mr.row).U, 0);
    if (memoSum !== calc.totals.U) return { ok: false, errors: ['Internal check failed: memo total ≠ payroll total.'], cal, emps };
    const xz = await buildExcel(JSZip, xlsxBuf, cal, calc, input.chequeDate);
    const dz = await buildMemo(JSZip, docxBuf, cal, calc, input.chequeDate, input.chequeNo);
    const type = outType || 'blob';
    return {
      ok: true, cal, emps, calc,
      xlsx: await xz.generateAsync({ type, compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      docx: await dz.generateAsync({ type, compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      xlsxName: `Payroll_${cal.monthName}_${cal.year}.xlsx`,
      docxName: `Transfer_Memo_${cal.monthName}_${cal.year}.docx`,
    };
  }

  const api = { MONTHS, calendar, roundRupee, indianCommas, toWords, loadMaster, calculate, validate, generate, fmtDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PAS = api;
})(typeof window !== 'undefined' ? window : globalThis);
