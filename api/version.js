// Public: only a short fingerprint of the templates being served and where they come from. No personal data.
import { send } from '../lib/auth.js';
import { loadTemplates } from '../lib/templates.js';

export default async function handler(req, res) {
  const t = loadTemplates();
  return send(res, 200, 'application/json', JSON.stringify({
    templateVersion: t.version || null, source: t.source, problem: t.error || null,
    sealedVersion: (await import('./_sealed.js')).default.version, deployedCommit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
  }));
}
