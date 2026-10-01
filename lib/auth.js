// Session login for NIET Payroll. No third-party packages.
// Env: PAYROLL_USER, PAYROLL_PASSWORD (changing the password signs everyone out).
import crypto from 'node:crypto';

const COOKIE = 'niet_session';
const HOURS = 12;

export function configured() {
  return Boolean(process.env.PAYROLL_USER && process.env.PAYROLL_PASSWORD);
}

function key() {
  return crypto.createHash('sha256').update('niet-payroll|' + process.env.PAYROLL_USER + '|' + process.env.PAYROLL_PASSWORD).digest();
}
function sign(v) { return crypto.createHmac('sha256', key()).update(v).digest('base64url'); }
function eq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkPassword(user, pass) {
  return configured() && eq(user || '', process.env.PAYROLL_USER) && eq(pass || '', process.env.PAYROLL_PASSWORD);
}

export function sessionCookie() {
  const exp = String(Date.now() + HOURS * 3600e3);
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${HOURS * 3600}`;
}
export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function loggedIn(req) {
  if (!configured()) return false;
  const raw = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  return Boolean(exp && sig) && eq(sig, sign(exp)) && Number(exp) > Date.now();
}

export async function readForm(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let text = typeof req.body === 'string' ? req.body : '';
  if (!text) { for await (const chunk of req) text += chunk; }
  return Object.fromEntries(new URLSearchParams(text));
}

export function send(res, status, type, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}
