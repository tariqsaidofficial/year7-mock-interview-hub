import { previewDemoEnabled } from '../../server/preview-demo';
import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
import { getSession, revokeSession, sameOrigin, validCsrf } from '../../server/session';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (previewDemoEnabled()) return respond(res, 403, { error: 'This endpoint is unavailable in the synthetic preview.' });
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const session = await getSession(req, 'admin');
    if (!session) return respond(res, 401, { error: 'Please sign in.' });
    if (!sameOrigin(req) || !validCsrf(req, session)) return respond(res, 403, { error: 'Request denied.' });
    await revokeSession(req, res, 'admin');
    return respond(res, 200, { signedOut: true });
  } catch { return safeError(res); }
}
