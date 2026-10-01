// Password gate for the whole site (payroll data must never be public).
// Set PAYROLL_USER and PAYROLL_PASSWORD in Vercel > Project > Settings > Environment Variables.

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default function middleware(request: Request) {
  const user = process.env.PAYROLL_USER;
  const pass = process.env.PAYROLL_PASSWORD;

  // Fail closed: if the password isn't configured, nobody gets in.
  if (!user || !pass) {
    return new Response('Not configured: set PAYROLL_USER and PAYROLL_PASSWORD in Vercel, then redeploy.', {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }

  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(':');
      if (i > -1 && same(decoded.slice(0, i), user) && same(decoded.slice(i + 1), pass)) {
        // Same response @vercel/functions next() returns: continue to the static file.
        return new Response(null, { headers: { 'x-middleware-next': '1' } });
      }
    } catch { /* malformed header -> ask again */ }
  }

  return new Response('Sign in to use NIET Payroll.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="NIET Payroll", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
}
