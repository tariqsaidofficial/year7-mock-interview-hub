import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
import { getSession, issueCsrf, issueGuest, sameOrigin } from '../../server/session';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    try {
      const session = await getSession(req, 'guest');
      if (!session) return respond(res, 401, { error: 'Guest session expired. Please ask your teacher for help.' });
      return respond(res, 200, { csrf: await issueCsrf(req, 'guest'), expiresAt: session.expiresAt });
    } catch { return safeError(res); }
  }
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req) || req.headers['x-requested-with'] !== 'Year7Interview') return respond(res, 403, { error: 'Request denied.' });
  try {
    const result = await issueGuest(req, res);
    if (result.kind === 'closed') return respond(res, 403, { error: 'This classroom run is closed.' });
    if (result.kind === 'limited') return respond(res, 429, { error: 'Too many interview starts. Please ask your teacher for help.' });
    if (result.kind === 'existing') return respond(res, 200, { csrf: await issueCsrf(req, 'guest') });
    return respond(res, 200, { csrf: result.csrf, expiresAt: result.expiresAt });
  } catch { return safeError(res); }
}
