/* Travel (conveyance) claim: Excel proforma builder. Works in browser and Node; needs JSZip.
 * Style ids come from travel_template.xlsx (styles only, no data). */
(function (root) {
  'use strict';
  const SHEET = 'xl/worksheets/sheet1.xml';
  const ST = { title: 1, sub: 2, lab: 3, val: 4, valr: 5, hdr: 6, td: 7, tdc: 8, tdamt: 9, totl: 10, tota: 11, words: 12, decl: 13, sign: 14, note: 15, blank: 16 };
  const MODES = ['Auto', 'E-rickshaw', 'Rapido bike', 'Rapido auto', 'Uber', 'Ola', 'Metro', 'Bus', 'Cab', 'Train', 'Own vehicle'];

  const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
  const pad = n => String(n).padStart(2, '0');
  const parseISO = s => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const dots = s => { const d = parseISO(s); return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : ''; };
  function fyOf(s) { const d = parseISO(s); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; }
  const claimLabel = (no, fy) => `TC-${String(no).padStart(3, '0')}/${fy}`;

  // Indian-system words, with paise
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  const three = n => [Math.floor(n / 100) ? ONES[Math.floor(n / 100)] + ' Hundred' : '', n % 100 ? two(n % 100) : ''].filter(Boolean).join(' ');
  function words(n) {
    n = Math.floor(n); if (!n) return 'Zero';
    const p = [], cr = Math.floor(n / 1e7); n %= 1e7; const l = Math.floor(n / 1e5); n %= 1e5; const t = Math.floor(n / 1e3); n %= 1e3;
    if (cr) p.push(words(cr) + ' Crore'); if (l) p.push(two(l) + ' Lakh'); if (t) p.push(two(t) + ' Thousand'); if (n) p.push(three(n));
    return p.join(' ');
  }
  function amountInWords(x) {
    const rs = Math.floor(r2(x)), ps = Math.round((r2(x) - rs) * 100);
    return `Rupees ${words(rs)}${ps ? ` and ${two(ps)} Paise` : ''} Only`;
  }

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  function cell(ref, s, v) {
    if (v === undefined || v === null || v === '') return `<c r="${ref}" s="${s}"/>`;
    if (typeof v === 'object' && v.f) return `<c r="${ref}" s="${s}"><f>${esc(v.f)}</f><v>${r2(v.v)}</v></c>`;
    if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }
  function row(r, ht, spec) {
    const cells = COLS.filter(c => spec[c]).map(c => cell(c + r, spec[c][0], spec[c][1])).join('');
    return `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`;
  }
  // fill a merged range with the same style so borders print on every cell
  const span = (from, to, s, v) => { const o = {}; const a = COLS.indexOf(from), b = COLS.indexOf(to); for (let i = a; i <= b; i++) o[COLS[i]] = [s, i === a ? v : undefined]; return o; };

  async function buildClaimExcel(JSZip, templateBuf, c, opts = {}) {
    const trips = c.trips.slice().sort((a, z) => (a.date < z.date ? -1 : a.date > z.date ? 1 : 0));
    const total = r2(trips.reduce((t, x) => t + Number(x.amount), 0));
    const z = await JSZip.loadAsync(templateBuf);
    let x = await z.file(SHEET).async('string');
    const R = [], M = [];
    const label = claimLabel(c.claim_no, c.fy);
    R.push(row(1, 24, span('A', 'H', ST.title, c.institute || 'NOIDA INSTITUTE OF EDUCATION & TECHNOLOGY'))); M.push('A1:H1');
    R.push(row(2, 21, span('A', 'H', ST.sub, 'TRAVELLING / CONVEYANCE EXPENSES CLAIM'))); M.push('A2:H2');
    R.push(row(4, 19, { A: [ST.lab, 'Claim No.:'], C: [ST.val, label], F: [ST.lab, 'Date:'], G: [ST.val, dots(c.date)] })); M.push('A4:B4', 'C4:D4', 'G4:H4');
    R.push(row(5, 19, { A: [ST.lab, 'Name:'], C: [ST.val, c.claimant], E: [ST.lab, 'Designation:'], F: [ST.val, c.designation || 'Office Assistant'] })); M.push('A5:B5', 'C5:D5', 'F5:H5');
    R.push(row(6, 19, { A: [ST.lab, 'Period:'], C: [ST.val, `${dots(trips[0].date)} to ${dots(trips[trips.length - 1].date)}`], E: [ST.lab, 'No. of journeys:'], F: [ST.val, String(trips.length)] })); M.push('A6:B6', 'C6:D6', 'F6:H6');
    R.push(row(8, 32, { A: [ST.hdr, 'S.No.'], B: [ST.hdr, 'Date'], C: [ST.hdr, 'From'], D: [ST.hdr, 'To (Destination)'], E: [ST.hdr, 'Purpose of Visit / Work'], F: [ST.hdr, 'Mode'], G: [ST.hdr, 'Amount (Rs.)'], H: [ST.hdr, 'Proof No.'] }));
    let r = 9; const first = r;
    trips.forEach((t, i) => {
      const lines = Math.max(1, Math.ceil(String(t.purpose || '').length / 34), Math.ceil(String(t.to || '').length / 24));
      R.push(row(r, Math.max(20, 15 * lines + 5), { A: [ST.tdc, i + 1], B: [ST.tdc, dots(t.date)], C: [ST.td, t.from || 'NIET'], D: [ST.td, t.to], E: [ST.td, t.purpose], F: [ST.tdc, t.mode || ''], G: [ST.tdamt, r2(t.amount)], H: [ST.tdc, t.proofRef === undefined ? `R${i + 1}` : (t.proofRef || 'Nil')] }));
      r++;
    });
    const last = r - 1, T = r;
    R.push(row(T, 22, { ...span('A', 'F', ST.totl, 'Total'), G: [ST.tota, { f: `SUM(G${first}:G${last})`, v: total }], H: [ST.blank] })); M.push(`A${T}:F${T}`);
    R.push(row(T + 1, 30, span('A', 'H', ST.words, `(${amountInWords(total)})`))); M.push(`A${T + 1}:H${T + 1}`);
    const refs = trips.map((t, i) => t.proofRef === undefined ? `R${i + 1}` : t.proofRef).filter(x => /^R\d+$/.test(x || ''));
    const nP = refs.length, all = nP === trips.length;
    const proofTxt = !nP ? '.' : `, and that the proofs of payment (${nP === 1 ? refs[0] : `${refs[0]} to ${refs[nP - 1]}`}) are attached${all ? '' : ' for the journeys marked'}.`;
    R.push(row(T + 3, 48, span('A', 'H', ST.decl, `Certified that the above journeys were performed by me for the official work of the Institute and that the amounts claimed have actually been spent by me${proofTxt}`))); M.push(`A${T + 3}:H${T + 3}`);
    R.push(row(T + 7, 36, { ...span('A', 'C', ST.sign, `Signature of Claimant\n(${c.claimant}, ${c.designation || 'Office Assistant'})`), ...span('D', 'E', ST.sign, 'Verified by'), ...span('F', 'H', ST.sign, 'Approved by Principal') }));
    M.push(`A${T + 7}:C${T + 7}`, `D${T + 7}:E${T + 7}`, `F${T + 7}:H${T + 7}`);
    R.push(row(T + 9, 34, span('A', 'H', ST.note, `For office use:  Passed for payment of Rs. ____________    Paid vide P.I. No. ____________    Sanction No. ________    Date ____________`))); M.push(`A${T + 9}:H${T + 9}`);
    const lastRow = T + 9;
    x = x.replace('<sheetData/>', '<sheetData>' + R.join('') + '</sheetData>' + `<mergeCells count="${M.length}">${M.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
    x = x.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:H${lastRow}"/>`);
    z.file(SHEET, x);
    let wb = await z.file('xl/workbook.xml').async('string');
    const tab = label.split('/')[0];
    wb = wb.replace(/<sheet name="[^"]*"/, `<sheet name="${tab}"`);
    if (!/definedName/.test(wb)) wb = wb.replace('</sheets>', `</sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${tab}'!$A$1:$H$${lastRow}</definedName></definedNames>`);
    z.file('xl/workbook.xml', wb);
    const name = `Travel_Claim_${label.replace('/', '_')}.xlsx`;
    const blob = await z.generateAsync({ type: opts.type || 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { blob, name, total, rows: lastRow };
  }

  const api = { MODES, buildClaimExcel, amountInWords, claimLabel, fyOf, dots, r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TRV = api;
})(typeof window !== 'undefined' ? window : globalThis);
