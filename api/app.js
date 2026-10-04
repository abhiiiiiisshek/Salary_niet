// Serves the payroll app to signed-in users, and the login page to everyone else.
import { configured, checkPassword, loggedIn, sessionCookie, clearCookie, readForm, send } from '../lib/auth.js';

const login = (msg = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Sign in · NIET Payroll</title>
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta name="theme-color" content="#e9eee7">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600&family=Spectral:wght@600&display=swap" rel="stylesheet">
<style>
:root{--paper:#e9eee7;--sheet:#fafbf8;--ink:#1b2a4a;--soft:#56627a;--rule:#d2dad1;--stamp:#b3261e}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font:15px/1.5 "Public Sans","Segoe UI",system-ui,sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
form{width:100%;max-width:360px;background:var(--sheet);border:1px solid var(--rule);border-radius:6px;padding:26px 24px;
  background-image:repeating-linear-gradient(115deg,transparent 0 13px,rgba(180,203,189,.28) 13px 14px);box-shadow:0 14px 30px -20px rgba(27,42,74,.5)}
.mark{display:block;width:64px;height:64px;margin:0 0 14px;filter:drop-shadow(0 6px 12px rgba(19,34,74,.28))}
h1{margin:0 0 4px;font:600 24px/1.15 Spectral,Georgia,serif}
p{margin:0 0 18px;color:var(--soft);font-size:13.5px}
label{display:block;font-size:13px;color:var(--soft);margin:12px 0 4px}
input{width:100%;font:inherit;color:var(--ink);background:#fff;border:1px solid #c9d2c8;border-radius:4px;padding:10px 11px}
input:focus{outline:none;border-color:var(--ink);box-shadow:0 0 0 3px rgba(59,109,179,.18)}
button{margin-top:18px;width:100%;border:0;border-radius:4px;background:var(--ink);color:#fff;font:600 15px/1 inherit;padding:13px;cursor:pointer}
button:hover{background:#24375f}
.err{margin:12px 0 0;color:var(--stamp);font-size:13.5px}
</style></head><body><main>
<form method="post" action="/" autocomplete="on">
  <img class="mark" src="/icon-192.png" alt="" width="64" height="64"><h1>NIET Payroll</h1>
  <p>Noida Institute of Education &amp; Technology. Sign in to prepare the payroll and transfer memo.</p>
  <label for="u">Username</label><input id="u" name="user" autocomplete="username" required autofocus>
  <label for="p">Password</label><input id="p" name="pass" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in</button>
  ${msg ? `<p class="err" role="alert">${msg}</p>` : ''}
</form></main></body></html>`;

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!configured()) {
    return send(res, 503, 'text/plain; charset=utf-8', 'Not configured: add PAYROLL_USER and PAYROLL_PASSWORD in Vercel > Settings > Environment Variables, then redeploy.');
  }
  if (url.searchParams.has('logout')) {
    return send(res, 303, 'text/plain', '', { 'Set-Cookie': clearCookie(), Location: '/' });
  }
  if (req.method === 'POST') {
    const f = await readForm(req);
    if (checkPassword(f.user, f.pass)) {
      return send(res, 303, 'text/plain', '', { 'Set-Cookie': sessionCookie(), Location: '/app' });
    }
    await new Promise(r => setTimeout(r, 600)); // slow down guessing
    return send(res, 401, 'text/html; charset=utf-8', login('Wrong username or password.'));
  }
  if (!loggedIn(req)) return send(res, 200, 'text/html; charset=utf-8', login());
  return send(res, 302, 'text/plain', '', { Location: '/app' + (url.hash || '') });
}
