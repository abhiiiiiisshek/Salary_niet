// Approved templates (salaries + bank accounts) for signed-in users only.
import { loggedIn, send } from '../lib/auth.js';
import { loadTemplates } from '../lib/templates.js';

export default function handler(req, res) {
  if (!loggedIn(req)) return send(res, 401, 'application/json', JSON.stringify({ error: 'Sign in required' }));
  const t = loadTemplates();
  if (t.error) return send(res, 503, 'application/json', JSON.stringify({ error: t.error }));
  return send(res, 200, 'application/json', JSON.stringify({ xlsx: t.xlsx, docx: t.docx, version: t.version, source: t.source }));
}
