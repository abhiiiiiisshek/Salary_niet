// Minimal Supabase (PostgREST) client using fetch. Server-side only, with the service_role key.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (legacy service_role JWT, or a new sb_secret_ key)
const T = 'payroll_versions';

export function dbConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function rest(method, query, body, extraHeaders = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${base}/rest/v1/${T}${query}`, {
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
    const e = new Error((data && data.message) || `Database error ${r.status}`);
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
