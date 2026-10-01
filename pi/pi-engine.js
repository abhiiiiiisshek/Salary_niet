/* Imprest (P.I.) engine: calculations + P.W.A. Form No.2 Excel generator.
 * Layout and style ids come from the approved "PI NO.2 NEW" sheet (pi_template.xlsx holds styles only, no data).
 * Works in browser and Node; needs JSZip. */
(function (root) {
  'use strict';
  const SHEET = 'xl/worksheets/sheet6.xml';
  const HEADS = [
    'Books & Stationery Exp A/c',
    'Printing & Stationery Exp A/c',
    'Internet & Telephone Exp A/c',
    'M/o NIET A/c.',
    'Office Expense A/c',
    'Conveyance A/c',
    'Legal and Consultancy A/c',
  ];

  const r2 = x => Math.round((Number(x) || 0) * 100) / 100;            // money to paise
  const pad = n => String(n).padStart(2, '0');
  const parseISO = s => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const dots = s => { const d = parseISO(s); return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : ''; };
  const dashes = s => { const d = parseISO(s); return d ? `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}` : ''; };
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };

  // Indian financial year (April–March): 2026-08-14 -> "2026-27"
  function fyOf(s) { const d = parseISO(s); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; }
  const piLabel = (no, fy) => `${String(no).padStart(3, '0')}/${fy}`;

  // Totals, abstract by head, and checks. book: {imprest, opening, received, entries:[{date,sanction,desc,amount,head}]}
  function summarize(book) {
    const entries = (book.entries || []).slice();
    const cash = r2(Number(book.opening) + Number(book.received));
    const spent = r2(entries.reduce((t, e) => t + Number(e.amount || 0), 0));
    const byHead = new Map();
    for (const e of entries) byHead.set(e.head, r2((byHead.get(e.head) || 0) + Number(e.amount || 0)));
    const abstract = [...byHead.entries()].map(([head, amount]) => ({ head, amount }));
    const balance = r2(cash - spent);
    const problems = [];
    if (r2(Number(book.opening) + Number(book.received)) !== r2(book.imprest) && book.imprest) problems.push(`Opening cash + cheque (₹${cash}) should equal the imprest of ₹${book.imprest}.`);
    if (balance < 0) problems.push(`Spent ₹${spent} is more than the cash in hand ₹${cash}.`);
    const seen = new Set();
    entries.forEach((e, i) => {
      const n = i + 1;
      if (!parseISO(e.date)) problems.push(`Payment ${n}: date missing.`);
      else if (book.start_date && e.date < book.start_date) problems.push(`Payment ${n}: date is before this P.I. started (${dots(book.start_date)}).`);
      if (!(Number(e.amount) > 0)) problems.push(`Payment ${n}: amount must be more than 0.`);
      if (!String(e.desc || '').trim()) problems.push(`Payment ${n}: write what it was for.`);
      if (!String(e.head || '').trim()) problems.push(`Payment ${n}: choose a head of account.`);
      if (e.sanction !== '' && e.sanction != null) {
        if (seen.has(String(e.sanction))) problems.push(`Sanction No. ${e.sanction} is used twice.`);
        seen.add(String(e.sanction));
      }
    });
    return { cash, spent, balance, abstract, problems };
  }

  // ---------- Excel ----------
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const num = v => String(r2(v));
  function cell(ref, s, v) {
    if (v === undefined || v === null || v === '') return `<c r="${ref}" s="${s}"/>`;
    if (typeof v === 'object' && v.f) return `<c r="${ref}" s="${s}"><f>${esc(v.f)}</f><v>${num(v.v)}</v></c>`;
    if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${num(v)}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }
  // spec: {A:[style,value], ...}
  function row(r, ht, spec, custom) {
    const cells = COLS.filter(c => spec[c]).map(c => cell(c + r, spec[c][0], spec[c][1])).join('');
    return `<row r="${r}" spans="1:9" ht="${ht}"${custom ? ' customHeight="1"' : ''} x14ac:dyDescent="0.25">${cells}</row>`;
  }

  async function buildExcel(JSZip, templateBuf, book, opts = {}) {
    const S = summarize(book);
    const entries = (book.entries || []).slice();
    if (!entries.length) entries.push({ date: '', sanction: '', desc: '', amount: '', head: '' });
    const z = await JSZip.loadAsync(templateBuf);
    let x = await z.file(SHEET).async('string');
    const toText = book.end_date ? dots(book.end_date) : '';
    const asOf = book.end_date || opts.asOf || iso(new Date());
    const R = [];
    R.push(row(2, 15.75, { A: [1, 'P.W.A. Form No.6'], B: [1], C: [1], D: [1, `        P.I. No. ${piLabel(book.pi_no, book.fy)}`], E: [1], F: [1], G: [41], H: [42] }));
    R.push(row(3, 15.75, { A: [50, `FORM NO.2 IMPREST CASH ACCOUNT OF ${String(book.holder || '').toUpperCase()} (${book.designation || 'Office Assistant'})`], B: [50], C: [50], D: [50], E: [50], F: [50], G: [50], H: [50] }));
    R.push(row(4, 15.75, { A: [3], B: [3], C: [50, `From ${dots(book.start_date)} to ${toText}`], D: [50], E: [50], F: [50], G: [50], H: [3, `Date : ${dots(asOf)}`] }));
    R.push(row(5, 15.75, { A: [1, 'Imprest Cash Book'], B: [1], C: [6], D: [6], E: [51, 'See Chapter VI, Paragraph 163 to 167'], F: [51], G: [51], H: [51] }));
    R.push(row(6, 69.75, { A: [2, 'Date'], B: [25, 'Sanction No.'], C: [2, 'Transactions'], D: [52, 'Amount of each Payment'], E: [52], F: [52, 'Total'], G: [52], H: [2, 'Head of Account'] }));
    R.push(row(7, 15.75, { A: [2, 1], B: [2, 2], C: [2, 3], D: [52, 4], E: [52], F: [52, 5], G: [52], H: [2, 6] }));
    R.push(row(8, 15.75, { A: [7], B: [7], C: [7], D: [2, 'Rs.'], E: [2, 'P.'], F: [2, 'Rs.'], G: [2, 'P.'], H: [7] }));
    const chq = `Cash received vide ch.no. ${book.cheque_no ? book.cheque_no + ' ' : ''}${book.cheque_date ? 'dtd ' + dots(book.cheque_date) : ''}`.trimEnd();
    R.push(row(9, 15.75, { A: [6], B: [6], C: [8, `Cash in hand on ${dots(book.start_date)}`], D: [30], E: [31], F: [32, r2(book.opening)], G: [11, '-'], H: [6] }));
    R.push(row(10, 15.75, { A: [6], B: [6], C: [8, chq], D: [29], E: [33], F: [34, r2(book.received)], G: [11, '-'], H: [6] }));
    R.push(row(11, 15.75, { A: [13], B: [6], C: [14, 'TOTAL CASH IN HAND'], D: [29], E: [35], F: [31, { f: 'F9+F10', v: S.cash }], G: [1, '-'], H: [6] }));
    let r = 12;
    const first = r;
    for (const e of entries) {
      const san = e.sanction === '' || e.sanction == null ? '' : (/^\d+$/.test(String(e.sanction)) ? Number(e.sanction) : String(e.sanction));
      R.push(row(r, 18.75, { A: [54, dashes(e.date)], B: [59, san], C: [54, e.desc || ''], D: [55, e.amount === '' ? '' : r2(e.amount)], E: [54, e.amount === '' ? '' : '_'], F: [54], G: [54], H: [54, e.head || ''], I: [53] }, true));
      r++;
    }
    const last = r - 1, T = r;
    R.push(row(T, 15.75, { A: [6], B: [6], C: [16, 'Total'], D: [30, { f: `SUM(D${first}:D${last})`, v: S.spent }], E: [35, '-'], F: [34, { f: `F11`, v: S.cash }], G: [6, '-'], H: [6] }));
    R.push(row(T + 1, 15.75, { A: [6], B: [6], C: [16, `Balance as on ${dots(asOf)}`], D: [30, { f: `F${T}-D${T}`, v: S.balance }], E: [35], F: [34], G: [6], H: [6] }));
    R.push(row(T + 2, 15.75, { A: [6], B: [1, 'ABSTRACT OF CHARGES'], C: [1], D: [31], E: [31], F: [31], G: [1], H: [1, 'P.W.A. form number 2'] }));
    R.push(row(T + 3, 15.75, { A: [6], B: [6], C: [1, 'Name of Accounting Head'], D: [49, 'Amount'], E: [49], F: [31], G: [6], H: [6] }));
    R.push(row(T + 4, 31.5, { A: [6], B: [6], C: [6], D: [37, 'Rs.'], E: [37, 'P.'], F: [37], G: [2], H: [6] }));
    let h = T + 5;
    const hFirst = h;
    const heads = S.abstract.length ? S.abstract : [{ head: '', amount: 0 }];
    for (const a of heads) {
      R.push(row(h, 15.75, { A: [6], B: [6], C: [23, a.head], D: [57, { f: `SUMIF($H$${first}:$H$${last},C${h},$D$${first}:$D$${last})`, v: a.amount }], E: [38, '-'], F: [37], G: [2], H: [6] }));
      h++;
    }
    R.push(row(h, 15.75, { A: [6], B: [6], C: [23, 'Total'], D: [58, { f: `SUM(D${hFirst}:D${h - 1})`, v: S.spent }], E: [39, '-'], F: [31], G: [6], H: [6] }));
    const merges = ['A3:H3', 'C4:G4', 'E5:H5', 'D6:E6', 'F6:G6', 'D7:E7', 'F7:G7', `D${T + 3}:E${T + 3}`];
    x = x.replace('<sheetData/>', '<sheetData>' + R.join('') + '</sheetData>' +
      `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
    x = x.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A2:I${h}"/>`);
    // print: whole form on one page width
    x = x.replace(/<pageMargins [^>]*\/>/, '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>');
    if (!/<sheetPr>/.test(x)) x = x.replace('<dimension', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension');
    z.file(SHEET, x);
    const tab = `PI ${String(book.pi_no).padStart(3, '0')}`;
    let wb = await z.file('xl/workbook.xml').async('string');
    wb = wb.replace(/<sheet name="[^"]*"/, `<sheet name="${tab}"`);
    if (!/<definedNames>/.test(wb)) wb = wb.replace('</sheets>', `</sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${tab}'!$A$2:$H$${h}</definedName></definedNames>`);
    z.file('xl/workbook.xml', wb);
    let app = await z.file('docProps/app.xml').async('string');
    app = app.replace(/<vt:lpstr>PI<\/vt:lpstr>/, `<vt:lpstr>${tab}</vt:lpstr>`);
    z.file('docProps/app.xml', app);
    const name = `PI_${String(book.pi_no).padStart(3, '0')}_${book.fy}.xlsx`;
    const blob = await z.generateAsync({ type: opts.type || 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { blob, name, summary: S, rows: h };
  }

  const api = { HEADS, summarize, buildExcel, fyOf, piLabel, dots, dashes, iso, addDays, parseISO, r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PI = api;
})(typeof window !== 'undefined' ? window : globalThis);
