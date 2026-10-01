// Monthly records: every Generate is saved as a draft; one version per month can be marked final.
// A final can be reopened only with a written reason; the old final is kept as "replaced".
import { loggedIn, send } from '../lib/auth.js';
import { db, dbConfigured } from '../lib/db.js';

const json = (res, status, obj) => send(res, status, 'application/json', JSON.stringify(obj));
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const B64 = /^[A-Za-z0-9+/=]+$/;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const label = p => `${MONTHS[+p.slice(5) - 1]} ${p.slice(0, 4)}`;

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let t = typeof req.body === 'string' ? req.body : '';
  if (!t) { for await (const c of req) t += c; }
  return JSON.parse(t || '{}');
}

export default async function handler(req, res) {
  if (!loggedIn(req)) return json(res, 401, { error: 'Sign in required' });
  if (!dbConfigured()) return json(res, 200, { configured: false });
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET') {
      const dl = url.searchParams.get('download');
      if (dl) {
        if (!['xlsx', 'docx'].includes(dl)) return json(res, 400, { error: 'Bad file type' });
        const id = Number(url.searchParams.get('id'));
        const row = Number.isInteger(id) && id > 0 ? await db.getFile(id, dl) : null;
        if (!row) return json(res, 404, { error: 'Not found' });
        const type = dl === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                                   : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        res.statusCode = 200;
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Disposition', `attachment; filename="${row[dl + '_name'].replace(/[^\w.\-]/g, '_')}"`);
        return res.end(Buffer.from(row[dl + '_b64'], 'base64'));
      }
      const period = url.searchParams.get('period');
      if (period) {
        if (!PERIOD.test(period)) return json(res, 400, { error: 'Bad month' });
        return json(res, 200, { configured: true, rows: await db.listPeriod(period) });
      }
      const year = url.searchParams.get('year');
      if (!/^\d{4}$/.test(year || '')) return json(res, 400, { error: 'Bad year' });
      return json(res, 200, { configured: true, rows: await db.listYear(year) });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const b = await readJson(req);

    if (b.action === 'save') {
      if (!PERIOD.test(b.period || '')) return json(res, 400, { error: 'Bad month' });
      if (!Number.isInteger(b.total) || b.total < 0) return json(res, 400, { error: 'Bad total' });
      for (const k of ['xlsx_b64', 'docx_b64']) {
        if (typeof b[k] !== 'string' || !b[k] || b[k].length > 3_000_000 || !B64.test(b[k])) return json(res, 400, { error: 'Bad file' });
      }
      if (await db.finalOf(b.period)) {
        return json(res, 409, { error: `${label(b.period)} is already final. Reopen it first to make changes.`, final: true });
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const version = (await db.lastVersion(b.period)) + 1;
        try {
          const row = await db.insert({
            period: b.period, version, status: 'draft', total: b.total,
            inputs: b.inputs || {}, lines: Array.isArray(b.lines) ? b.lines : [],
            template_version: String(b.template_version || '').slice(0, 20) || null,
            xlsx_name: String(b.xlsx_name || 'Payroll.xlsx').slice(0, 120),
            docx_name: String(b.docx_name || 'Transfer_Memo.docx').slice(0, 120),
            xlsx_b64: b.xlsx_b64, docx_b64: b.docx_b64,
            created_by: process.env.PAYROLL_USER || null,
          });
          const { xlsx_b64, docx_b64, ...meta } = row;
          return json(res, 200, { ok: true, row: meta });
        } catch (e) { if (e.code !== '23505') throw e; } // version clash: retry with next number
      }
      return json(res, 409, { error: 'Could not save, please try again.' });
    }

    if (b.action === 'finalize') {
      const id = Number(b.id);
      if (!Number.isInteger(id) || id < 1) return json(res, 400, { error: 'Bad version' });
      try {
        const rows = await db.patch(`?id=eq.${id}&status=eq.draft`, { status: 'final', finalized_at: new Date().toISOString() });
        if (!rows || !rows.length) return json(res, 409, { error: 'Only a draft can be marked final.' });
        const { xlsx_b64, docx_b64, ...meta } = rows[0];
        return json(res, 200, { ok: true, row: meta });
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'This month already has a final version. Reopen it first.' });
        throw e;
      }
    }

    if (b.action === 'reopen') {
      if (!PERIOD.test(b.period || '')) return json(res, 400, { error: 'Bad month' });
      const reason = String(b.reason || '').trim();
      if (reason.length < 5) return json(res, 400, { error: 'Write a reason (at least 5 characters) for reopening a final month.' });
      const rows = await db.patch(`?period=eq.${b.period}&status=eq.final`, {
        status: 'replaced', replaced_at: new Date().toISOString(), replaced_reason: reason.slice(0, 500),
      });
      if (!rows || !rows.length) return json(res, 409, { error: 'This month has no final version.' });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'Unknown action' });
  } catch (e) {
    return json(res, 502, { error: 'Records database: ' + e.message });
  }
}
