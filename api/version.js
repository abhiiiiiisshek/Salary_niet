// Reports only a short fingerprint of the templates Vercel is serving (no personal data),
// so a stale environment variable can be spotted without signing in.
import crypto from 'node:crypto';
import { send } from '../lib/auth.js';

export default function handler(req, res) {
  const x = process.env.TEMPLATE_XLSX_B64 || '', d = process.env.TEMPLATE_DOCX_B64 || '';
  const fp = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 6).toUpperCase();
  const xb = Buffer.from(x, 'base64'), db = Buffer.from(d, 'base64');
  const body = {
    templateVersion: x && d ? fp(Buffer.concat([xb, db])) : null,
    xlsx: x ? { version: fp(xb), chars: x.length } : null,
    docx: d ? { version: fp(db), chars: d.length } : null,
    deployedCommit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
  };
  return send(res, 200, 'application/json', JSON.stringify(body));
}
