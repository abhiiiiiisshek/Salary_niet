// Minimal Supabase (PostgREST) client using fetch. Server-side only, with the service_role key.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (legacy service_role JWT, or a new sb_secret_ key)
const T = 'payroll_versions';

export function dbConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function rest(method, query, body, extraHeaders = {}, table = T) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${base}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: key,
      // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys go only in apikey.
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json', Accept: 'application/json',
      Prefer: 'return=representation', ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    let msg = (data && data.message) || `Database error ${r.status}`;
    if (/Could not find the table|relation .* does not exist/i.test(msg)) msg = `The database table "${table}" doesn't exist yet. Open Supabase > SQL Editor, paste the latest supabase/schema.sql and press Run.`;
    const e = new Error(msg);
    e.status = r.status; e.code = data && data.code; throw e;
  }
  return data;
}

const LIST_COLS = 'id,period,version,status,total,lines,template_version,xlsx_name,docx_name,created_at,created_by,finalized_at,replaced_at,replaced_reason';

export const db = {
  listYear: y => rest('GET', `?select=${LIST_COLS}&period=gte.${y}-01&period=lte.${y}-12&order=period.asc,version.asc`),
  listPeriod: p => rest('GET', `?select=${LIST_COLS},inputs&period=eq.${p}&order=version.asc`),
  getFile: (id, kind) => rest('GET', `?select=${kind}_b64,${kind}_name,period,version,status&id=eq.${id}`).then(r => r[0]),
  lastVersion: p => rest('GET', `?select=version&period=eq.${p}&order=version.desc&limit=1`).then(r => (r[0] ? r[0].version : 0)),
  finalOf: p => rest('GET', `?select=id,version&period=eq.${p}&status=eq.final`).then(r => r[0] || null),
  insert: row => rest('POST', '', row).then(r => r[0]),
  patch: (filter, fields) => rest('PATCH', filter, fields),
};

// ---- Imprest (P.I.) books ----
const P = 'pi_books';
const PI_LIST = 'id,fy,pi_no,status,holder,designation,imprest,start_date,end_date,opening,received,cheque_no,cheque_date,first_sanction,entries,xlsx_name,closed_at,reopen_notes,updated_at';
const pr = (m, q, b) => rest(m, q, b, {}, P);
export const pidb = {
  list: () => pr('GET', `?select=${PI_LIST}&order=start_date.desc,id.desc`),
  get: id => pr('GET', `?select=${PI_LIST}&id=eq.${id}`).then(r => r[0] || null),
  open: () => pr('GET', `?select=${PI_LIST}&status=eq.open`).then(r => r[0] || null),
  file: id => pr('GET', `?select=xlsx_b64,xlsx_name&id=eq.${id}`).then(r => r[0] || null),
  insert: row => pr('POST', '', row).then(r => r[0]),
  patch: (filter, fields) => pr('PATCH', filter, fields),
  remove: filter => pr('DELETE', filter),
};

// ---- Travel claims ----
const tr = (table, m, q, b) => rest(m, q, b, {}, table);
const TRIP_COLS = 'id,trip_date,from_place,to_place,purpose,mode,amount,proof_name,proof_mime,claim_id,created_at';
const CLAIM_COLS = 'id,fy,claim_no,claim_date,claimant,designation,total,status,xlsx_name,paid_at,paid_note,created_at';
export const trdb = {
  trips: () => tr('travel_trips', 'GET', `?select=${TRIP_COLS}&order=trip_date.desc,id.desc`),
  trip: id => tr('travel_trips', 'GET', `?select=${TRIP_COLS}&id=eq.${id}`).then(r => r[0] || null),
  addTrip: row => tr('travel_trips', 'POST', '', row).then(r => r[0]),
  patchTrips: (filter, f) => tr('travel_trips', 'PATCH', filter, f),
  delTrip: id => tr('travel_trips', 'DELETE', `?id=eq.${id}`),
  proof: id => tr('travel_proofs', 'GET', `?select=mime,b64&trip_id=eq.${id}`).then(r => r[0] || null),
  thumb: id => tr('travel_proofs', 'GET', `?select=mime,thumb_b64&trip_id=eq.${id}`).then(r => r[0] || null),
  putProof: row => tr('travel_proofs', 'POST', '', row, ),
  delProof: id => tr('travel_proofs', 'DELETE', `?trip_id=eq.${id}`),
  claims: () => tr('travel_claims', 'GET', `?select=${CLAIM_COLS}&order=claim_date.desc,id.desc`),
  claim: id => tr('travel_claims', 'GET', `?select=${CLAIM_COLS}&id=eq.${id}`).then(r => r[0] || null),
  claimFile: id => tr('travel_claims', 'GET', `?select=xlsx_name,xlsx_b64&id=eq.${id}`).then(r => r[0] || null),
  addClaim: row => tr('travel_claims', 'POST', '', row).then(r => r[0]),
  patchClaim: (filter, f) => tr('travel_claims', 'PATCH', filter, f),
  delClaim: id => tr('travel_claims', 'DELETE', `?id=eq.${id}`),
};
