// Serves the approved templates (salaries + bank accounts) only to signed-in users.
// They live in Vercel environment variables, never in the public repo.
// middleware.ts already blocks unauthenticated requests; this re-checks as a second lock.

function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const user = process.env.PAYROLL_USER, pass = process.env.PAYROLL_PASSWORD;
  const h = req.headers.authorization || '';
  let ok = false;
  if (user && pass && h.startsWith('Basic ')) {
    const s = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const i = s.indexOf(':');
    ok = i > -1 && same(s.slice(0, i), user) && same(s.slice(i + 1), pass);
  }
  if (!ok) return res.status(401).json({ error: 'Sign in required' });

  const xlsx = process.env.TEMPLATE_XLSX_B64, docx = process.env.TEMPLATE_DOCX_B64;
  if (!xlsx || !docx) return res.status(503).json({ error: 'Set TEMPLATE_XLSX_B64 and TEMPLATE_DOCX_B64 in Vercel' });
  return res.status(200).json({ xlsx, docx });
}
