// Imprest (P.I.) register: one open book at a time; closing a book locks it, stores its Excel,
// and opens the next book with the balance carried forward.
import { loggedIn, send } from '../lib/auth.js';
import { dbConfigured, pidb } from '../lib/db.js';
import '../pi/pi-engine.js';
const PI = globalThis.PI;

const json = (res, status, obj) => send(res, status, 'application/json', JSON.stringify(obj));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const B64 = /^[A-Za-z0-9+/=]+$/;
const money = v => Math.round(Number(v) * 100) / 100;
const clean = (s, n = 300) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let t = typeof req.body === 'string' ? req.body : '';
  if (!t) { for await (const c of req) t += c; }
  return JSON.parse(t || '{}');
}

function maxSanction(books) {
  let m = Math.max(0, ...books.map(b => (Number(b.first_sanction) || 1) - 1));
  for (const b of books) for (const e of b.entries || []) { const n = parseInt(e.sanction, 10); if (Number.isFinite(n) && n > m) m = n; }
  return m;
}

function cleanEntries(list) {
  if (!Array.isArray(list) || list.length > 200) throw Object.assign(new Error('Too many payments in one P.I.'), { status: 400 });
  return list.map((e, i) => {
    const out = {
      id: clean(e.id, 40) || `e${Date.now()}${i}`,
      date: ISO.test(e.date || '') ? e.date : '',
      sanction: /^\d{1,6}$/.test(String(e.sanction ?? '').trim()) ? Number(e.sanction) : clean(e.sanction, 12),
      desc: clean(e.desc, 300), head: clean(e.head, 80), amount: money(e.amount),
    };
    if (!out.date || !out.desc || !out.head || !(out.amount > 0)) throw Object.assign(new Error(`Payment ${i + 1} is incomplete (date, details, head and amount are needed).`), { status: 400 });
    return out;
  });
}

export default async function handler(req, res) {
  if (!loggedIn(req)) return json(res, 401, { error: 'Sign in required' });
  if (!dbConfigured()) return json(res, 200, { configured: false });
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET') {
      const dl = url.searchParams.get('download');
      if (dl) {
        const f = /^\d+$/.test(dl) ? await pidb.file(Number(dl)) : null;
        if (!f || !f.xlsx_b64) return json(res, 404, { error: 'No saved Excel for this P.I.' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Disposition', `attachment; filename="${String(f.xlsx_name || 'PI.xlsx').replace(/[^\w.\-]/g, '_')}"`);
        return res.end(Buffer.from(f.xlsx_b64, 'base64'));
      }
      const books = await pidb.list();
      return json(res, 200, { configured: true, books, nextSanction: maxSanction(books) + 1 });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const b = await readJson(req);

    if (b.action === 'start') {
      if (await pidb.open()) return json(res, 409, { error: 'A P.I. is already open. Close it first.' });
      if (!ISO.test(b.start_date || '')) return json(res, 400, { error: 'Start date is needed.' });
      const imprest = money(b.imprest || 5000), opening = money(b.opening || 0);
      if (!(imprest > 0) || opening < 0 || opening > imprest) return json(res, 400, { error: 'Opening cash must be between 0 and the imprest amount.' });
      const pi_no = parseInt(b.pi_no, 10);
      if (!(pi_no > 0)) return json(res, 400, { error: 'P.I. number is needed.' });
      const holder = clean(b.holder, 80);
      if (!holder) return json(res, 400, { error: 'Account holder name is needed.' });
      try {
        const row = await pidb.insert({
          fy: PI.fyOf(b.start_date), pi_no, status: 'open', holder, designation: clean(b.designation, 60) || 'Office Assistant',
          imprest, start_date: b.start_date, opening, received: money(imprest - opening),
          cheque_no: clean(b.cheque_no, 30) || null, cheque_date: ISO.test(b.cheque_date || '') ? b.cheque_date : null,
          entries: [], first_sanction: parseInt(b.first_sanction, 10) > 0 ? parseInt(b.first_sanction, 10) : null,
        });
        return json(res, 200, { ok: true, book: row });
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'That P.I. number already exists for this financial year, or another P.I. is open.' });
        throw e;
      }
    }

    if (b.action === 'save') {
      const id = Number(b.id);
      const book = Number.isInteger(id) ? await pidb.get(id) : null;
      if (!book) return json(res, 404, { error: 'P.I. not found' });
      if (book.status !== 'open') return json(res, 409, { error: 'This P.I. is closed. Reopen it to make changes.' });
      const entries = cleanEntries(b.entries);
      const fields = {
        entries, updated_at: new Date().toISOString(),
        cheque_no: clean(b.cheque_no, 30) || null,
        cheque_date: ISO.test(b.cheque_date || '') ? b.cheque_date : null,
        holder: clean(b.holder, 80) || book.holder,
        designation: clean(b.designation, 60) || book.designation,
      };
      const S = PI.summarize({ ...book, ...fields });
      if (S.balance < 0) return json(res, 400, { error: `Total spent ₹${S.spent} is more than the cash in hand ₹${S.cash}.` });
      const rows = await pidb.patch(`?id=eq.${id}&status=eq.open`, fields);
      if (!rows.length) return json(res, 409, { error: 'This P.I. was closed meanwhile.' });
      return json(res, 200, { ok: true, book: rows[0], summary: S });
    }

    if (b.action === 'close') {
      const id = Number(b.id);
      const book = Number.isInteger(id) ? await pidb.get(id) : null;
      if (!book || book.status !== 'open') return json(res, 409, { error: 'Only the open P.I. can be closed.' });
      if (!ISO.test(b.end_date || '') || b.end_date < book.start_date) return json(res, 400, { error: 'Closing date must be on or after the start date.' });
      if (!(book.entries || []).length) return json(res, 400, { error: 'Add at least one payment before closing.' });
      const S = PI.summarize(book);
      if (S.problems.length) return json(res, 400, { error: 'Fix these first: ' + S.problems.join(' ') });
      if (typeof b.xlsx_b64 !== 'string' || !B64.test(b.xlsx_b64) || b.xlsx_b64.length > 3_000_000) return json(res, 400, { error: 'Excel file missing.' });
      const closed = await pidb.patch(`?id=eq.${id}&status=eq.open`, {
        status: 'closed', end_date: b.end_date, closed_at: new Date().toISOString(),
        xlsx_b64: b.xlsx_b64, xlsx_name: clean(b.xlsx_name, 80) || 'PI.xlsx', updated_at: new Date().toISOString(),
      });
      if (!closed.length) return json(res, 409, { error: 'This P.I. was already closed.' });
      // open the next book with the balance carried forward
      const start = PI.addDays(b.end_date, 1), fy = PI.fyOf(start);
      const all = await pidb.list();
      const nextNo = fy === book.fy ? book.pi_no + 1 : Math.max(0, ...all.filter(x => x.fy === fy).map(x => x.pi_no)) + 1;
      const opening = money(S.balance);
      const next = await pidb.insert({
        fy, pi_no: nextNo, status: 'open', holder: book.holder, designation: book.designation, imprest: book.imprest,
        start_date: start, opening, received: money(Number(book.imprest) - opening), cheque_no: null, cheque_date: null, entries: [],
      });
      return json(res, 200, { ok: true, closed: closed[0].id, next });
    }

    if (b.action === 'reopen') {
      const id = Number(b.id), reason = clean(b.reason, 500);
      if (reason.length < 5) return json(res, 400, { error: 'Write a reason (at least 5 characters).' });
      const all = await pidb.list();
      const closedBooks = all.filter(x => x.status === 'closed');
      const latest = closedBooks.sort((a, z) => (a.end_date < z.end_date ? 1 : -1))[0];
      if (!latest || latest.id !== id) return json(res, 409, { error: 'Only the most recently closed P.I. can be reopened.' });
      const open = all.find(x => x.status === 'open');
      if (open && (open.entries || []).length) return json(res, 409, { error: `P.I. ${PI.piLabel(open.pi_no, open.fy)} already has payments, so the earlier one can't be reopened.` });
      if (open) await pidb.remove(`?id=eq.${open.id}&status=eq.open`);
      const notes = [...(latest.reopen_notes || []), { at: new Date().toISOString(), reason }];
      const rows = await pidb.patch(`?id=eq.${id}&status=eq.closed`, { status: 'open', end_date: null, closed_at: null, xlsx_b64: null, xlsx_name: null, reopen_notes: notes, updated_at: new Date().toISOString() });
      return json(res, 200, { ok: true, book: rows[0] });
    }

    if (b.action === 'delete') {
      // Only the most recent P.I. can be deleted (keeps the carry-forward chain intact).
      const id = Number(b.id);
      const all = await pidb.list();
      const latest = all.slice().sort((x, z) => (x.start_date < z.start_date ? 1 : x.start_date > z.start_date ? -1 : z.id - x.id))[0];
      if (!latest || latest.id !== id) return json(res, 409, { error: 'Only the most recent P.I. can be deleted. Delete the newer ones first.' });
      const label = PI.piLabel(latest.pi_no, latest.fy);
      if (String(b.confirm || '').trim() !== label) return json(res, 400, { error: `Type ${label} to confirm.` });
      await pidb.remove(`?id=eq.${id}`);
      return json(res, 200, { ok: true, deleted: label });
    }

    return json(res, 400, { error: 'Unknown action' });
  } catch (e) {
    return json(res, e.status || 502, { error: e.status ? e.message : 'Database: ' + e.message });
  }
}
