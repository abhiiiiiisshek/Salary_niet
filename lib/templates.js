// Where the server gets the templates from:
// 1) api/_sealed.js (encrypted, in the repo) when TEMPLATE_KEY is set, else
// 2) the TEMPLATE_XLSX_B64 / TEMPLATE_DOCX_B64 environment variables (older setup).
import crypto from 'node:crypto';
import SEALED from '../api/_sealed.js';

const fp = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 6).toUpperCase();

export function loadTemplates() {
  const k = (process.env.TEMPLATE_KEY || '').trim();
  if (k && SEALED && SEALED.ct) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(k, 'hex'), Buffer.from(SEALED.iv, 'base64'));
      d.setAuthTag(Buffer.from(SEALED.tag, 'base64'));
      const j = JSON.parse(Buffer.concat([d.update(Buffer.from(SEALED.ct, 'base64')), d.final()]).toString('utf8'));
      return { source: 'sealed', xlsx: j.xlsx, docx: j.docx, version: SEALED.version };
    } catch (e) {
      return { source: 'sealed', error: 'TEMPLATE_KEY does not match the sealed templates' };
    }
  }
  const x = process.env.TEMPLATE_XLSX_B64, dx = process.env.TEMPLATE_DOCX_B64;
  if (x && dx) return { source: 'env', xlsx: x, docx: dx, version: fp(Buffer.concat([Buffer.from(x, 'base64'), Buffer.from(dx, 'base64')])) };
  return { source: 'none', error: 'No templates: set TEMPLATE_KEY in Vercel, then redeploy' };
}
