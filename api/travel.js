// Travel (conveyance) expenses: trips with optional proof of payment, grouped into numbered claims (TC-001/2026-27),
// which can be marked paid and, optionally, entered in the open P.I. under "Conveyance A/c".
import { loggedIn, send } from '../lib/auth.js';
import { dbConfigured, trdb, pidb } from '../lib/db.js';
import '../pi/pi-engine.js';
import '../travel/travel-engine.js';
const PI = globalThis.PI, TRV = globalThis.TRV;

const json = (res, status, obj) => send(res, status, 'application/json', JSON.stringify(obj));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const B64 = /^[A-Za-z0-9+/=]+$/;
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const money = v => Math.round(Number(v) * 100) / 100;
const clean = (s, n = 200) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const err = (status, message) => Object.assign(new Error(message), { status });

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let t = typeof req.body === 'string' ? req.body : '';
  if (!t) { for await (const c of req) t += c; }
  return JSON.parse(t || '{}');
}

function tripFields(b) {
  const f = {
    trip_date: ISO.test(b.trip_date || '') ? b.trip_date : '',
    from_place: clean(b.from_place, 80) || 'NIET',
    to_place: clean(b.to_place, 120),
    purpose: clean(b.purpose, 200),
    mode: clean(b.mode, 30) || null,
    amount: money(b.amount),
  };
  if (!f.trip_date) throw err(400, 'Choose the date of the trip.');
  if (f.trip_date > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) throw err(400, 'The trip date is in the future.');
  if (!f.to_place) throw err(400, 'Write where you went.');
  if (!f.purpose) throw err(400, 'Write what work it was for.');
  if (!(f.amount > 0) || f.amount > 100000) throw err(400, 'Enter the amount you paid.');
  return f;
}
function proofOf(b) {
  const p = b.proof;
  if (!p) return null;
  if (!PROOF_TYPES.includes(p.mime) || typeof p.b64 !== 'string' || !B64.test(p.b64)) throw err(400, 'The proof must be a photo (JPG/PNG) or a PDF.');
  if (p.b64.length > 3_400_000) throw err(400, 'The proof file is too large. Use a photo or a PDF under 2.5 MB.');
  const thumb = typeof p.thumb === 'string' && B64.test(p.thumb) && p.thumb.length < 200_000 ? p.thumb : null;
  return { mime: p.mime, b64: p.b64, thumb, name: clean(p.name, 80) || 'proof' };
}

export default async function handler(req, res) {
  if (!loggedIn(req)) return json(res, 401, { error: 'Sign in required' });
  if (!dbConfigured()) return json(res, 200, { configured: false });
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET') {
      const proofId = url.searchParams.get('proof');
      if (proofId) {
        const p = /^\d+$/.test(proofId) ? await trdb.proof(Number(proofId)) : null;
        if (!p) return json(res, 404, { error: 'No proof found' });
        res.statusCode = 200; res.setHeader('Content-Type', p.mime); res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.end(Buffer.from(p.b64, 'base64'));
      }
      const th = url.searchParams.get('thumb');
      if (th) {
        const p = /^\d+$/.test(th) ? await trdb.thumb(Number(th)) : null;
        if (!p) return json(res, 404, { error: 'No proof found' });
        const full = !p.thumb_b64 ? await trdb.proof(Number(th)) : null;
        if (full && full.mime === 'application/pdf') return json(res, 404, { error: 'PDF has no thumbnail' });
        res.statusCode = 200; res.setHeader('Content-Type', p.thumb_b64 ? 'image/jpeg' : full.mime);
        res.setHeader('Cache-Control', 'private, max-age=604800, immutable'); res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.end(Buffer.from(p.thumb_b64 || full.b64, 'base64'));
      }
      const xl = url.searchParams.get('claim');
      if (xl) {
        const f = /^\d+$/.test(xl) ? await trdb.claimFile(Number(xl)) : null;
        if (!f || !f.xlsx_b64) return json(res, 404, { error: 'No Excel saved for this claim' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Disposition', `attachment; filename="${String(f.xlsx_name || 'Travel_Claim.xlsx').replace(/[^\w.\-]/g, '_')}"`);
        return res.end(Buffer.from(f.xlsx_b64, 'base64'));
      }
      const [trips, claims] = await Promise.all([trdb.trips(), trdb.claims()]);
      return json(res, 200, { configured: true, trips, claims });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const b = await readJson(req);

    if (b.action === 'add_trip') {
      // proof of payment is optional; it can also be added later by editing the trip
      const f = tripFields(b), p = proofOf(b);
      const trip = await trdb.addTrip({ ...f, proof_name: p ? p.name : null, proof_mime: p ? p.mime : null });
      if (p) {
        try { await trdb.putProof({ trip_id: trip.id, mime: p.mime, b64: p.b64, thumb_b64: p.thumb }); }
        catch (e) { await trdb.delTrip(trip.id); throw e; }
      }
      return json(res, 200, { ok: true, trip });
    }

    if (b.action === 'update_trip') {
      const id = Number(b.id), t = Number.isInteger(id) ? await trdb.trip(id) : null;
      if (!t) return json(res, 404, { error: 'Trip not found' });
      if (t.claim_id) return json(res, 409, { error: 'This trip is already in a claim. Cancel the claim first to change it.' });
      const f = tripFields(b), p = proofOf(b);
      if (p) { await trdb.delProof(id); await trdb.putProof({ trip_id: id, mime: p.mime, b64: p.b64, thumb_b64: p.thumb }); f.proof_name = p.name; f.proof_mime = p.mime; }
      const rows = await trdb.patchTrips(`?id=eq.${id}&claim_id=is.null`, f);
      return json(res, 200, { ok: true, trip: rows[0] });
    }

    if (b.action === 'delete_trip') {
      const id = Number(b.id), t = Number.isInteger(id) ? await trdb.trip(id) : null;
      if (!t) return json(res, 404, { error: 'Trip not found' });
      if (t.claim_id) return json(res, 409, { error: 'This trip is in a claim. Cancel the claim first.' });
      await trdb.delTrip(id);
      return json(res, 200, { ok: true });
    }

    if (b.action === 'create_claim') {
      const ids = Array.isArray(b.trip_ids) ? [...new Set(b.trip_ids.map(Number).filter(Number.isInteger))] : [];
      if (!ids.length) return json(res, 400, { error: 'Choose at least one trip.' });
      const all = await trdb.trips();
      const picked = all.filter(t => ids.includes(t.id));
      if (picked.length !== ids.length) return json(res, 400, { error: 'Some trips were not found.' });
      if (picked.some(t => t.claim_id)) return json(res, 409, { error: 'Some of these trips are already in a claim.' });
      const claimant = clean(b.claimant, 80); if (!claimant) return json(res, 400, { error: 'Write the claimant name.' });
      const date = ISO.test(b.claim_date || '') ? b.claim_date : new Date().toISOString().slice(0, 10);
      const fy = TRV.fyOf(date);
      const claims = await trdb.claims();
      const no = Math.max(0, ...claims.filter(c => c.fy === fy).map(c => c.claim_no)) + 1;
      const total = money(picked.reduce((t, x) => t + Number(x.amount), 0));
      let claim;
      try { claim = await trdb.addClaim({ fy, claim_no: no, claim_date: date, claimant, designation: clean(b.designation, 60) || 'Office Assistant', total, status: 'submitted' }); }
      catch (e) { if (e.code === '23505') return json(res, 409, { error: 'Another claim was just created. Please try again.' }); throw e; }
      const linked = await trdb.patchTrips(`?id=in.(${ids.join(',')})&claim_id=is.null`, { claim_id: claim.id });
      if (linked.length !== ids.length) { await trdb.patchTrips(`?claim_id=eq.${claim.id}`, { claim_id: null }); await trdb.delClaim(claim.id); return json(res, 409, { error: 'Some trips were claimed meanwhile. Please try again.' }); }
      return json(res, 200, { ok: true, claim, trips: linked });
    }

    if (b.action === 'attach_excel') {
      const id = Number(b.id);
      if (typeof b.xlsx_b64 !== 'string' || !B64.test(b.xlsx_b64) || b.xlsx_b64.length > 3_000_000) return json(res, 400, { error: 'Excel file missing' });
      const rows = await trdb.patchClaim(`?id=eq.${id}`, { xlsx_b64: b.xlsx_b64, xlsx_name: clean(b.xlsx_name, 80) || 'Travel_Claim.xlsx' });
      return json(res, rows.length ? 200 : 404, rows.length ? { ok: true } : { error: 'Claim not found' });
    }

    if (b.action === 'cancel_claim') {
      const id = Number(b.id), c = Number.isInteger(id) ? await trdb.claim(id) : null;
      if (!c) return json(res, 404, { error: 'Claim not found' });
      if (c.status === 'paid') return json(res, 409, { error: 'This claim is already paid and can’t be cancelled.' });
      await trdb.patchTrips(`?claim_id=eq.${id}`, { claim_id: null });
      await trdb.delClaim(id);
      return json(res, 200, { ok: true });
    }

    if (b.action === 'mark_paid') {
      const id = Number(b.id), c = Number.isInteger(id) ? await trdb.claim(id) : null;
      if (!c) return json(res, 404, { error: 'Claim not found' });
      if (c.status === 'paid') return json(res, 409, { error: 'Already marked paid.' });
      const label = TRV.claimLabel(c.claim_no, c.fy);
      let note = clean(b.note, 200) || 'Paid';
      if (b.add_to_pi) {
        const book = await pidb.open();
        if (!book) return json(res, 409, { error: 'No P.I. is open. Start one in Imprest first, or mark paid without adding to the P.I.' });
        const books = await pidb.list();
        let maxS = Math.max(0, ...books.map(x => (Number(x.first_sanction) || 1) - 1));
        for (const x of books) for (const e of x.entries || []) { const n = parseInt(e.sanction, 10); if (n > maxS) maxS = n; }
        const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
        const date = today < book.start_date ? book.start_date : today;
        const entry = { id: 'tc' + c.id, date, sanction: maxS + 1, desc: `Paid to ${c.claimant} for travelling charges vide claim ${label}`, head: 'Conveyance A/c', amount: money(c.total) };
        if ((book.entries || []).some(e => e.id === entry.id)) return json(res, 409, { error: 'This claim is already in the P.I.' });
        const entries = [...(book.entries || []), entry];
        const S = PI.summarize({ ...book, entries });
        if (S.balance < 0) return json(res, 409, { error: `The open P.I. has only ₹${PI.summarize(book).balance} left, less than this claim (₹${c.total}). Close the P.I. to get the cheque first, or mark paid without adding to the P.I.` });
        await pidb.patch(`?id=eq.${book.id}&status=eq.open`, { entries, updated_at: new Date().toISOString() });
        note = `Paid through P.I. ${PI.piLabel(book.pi_no, book.fy)}, Sanction No. ${entry.sanction}`;
      }
      const rows = await trdb.patchClaim(`?id=eq.${id}&status=eq.submitted`, { status: 'paid', paid_at: new Date().toISOString(), paid_note: note });
      return json(res, 200, { ok: true, claim: rows[0] });
    }

    return json(res, 400, { error: 'Unknown action' });
  } catch (e) {
    const missing = /doesn't exist yet/.test(e.message);
    return json(res, missing ? 503 : (e.status || 502), { error: missing || (e.status && e.status < 500) ? e.message : 'Database: ' + e.message });
  }
}
