// Approved templates (salaries + bank accounts) from Vercel environment variables, for signed-in users only.
import { loggedIn, send } from '../lib/auth.js';

export default function handler(req, res) {
  if (!loggedIn(req)) return send(res, 401, 'application/json', JSON.stringify({ error: 'Sign in required' }));
  const xlsx = process.env.TEMPLATE_XLSX_B64, docx = process.env.TEMPLATE_DOCX_B64;
  if (!xlsx || !docx) return send(res, 503, 'application/json', JSON.stringify({ error: 'Set TEMPLATE_XLSX_B64 and TEMPLATE_DOCX_B64 in Vercel, then redeploy' }));
  return send(res, 200, 'application/json', JSON.stringify({ xlsx, docx }));
}
