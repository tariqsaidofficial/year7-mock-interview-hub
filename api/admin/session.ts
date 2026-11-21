import { previewDemoEnabled } from '../../server/preview-demo';
import { ApiRequest, ApiResponse, respond, safeError } from '../../server/http';
import { getSession, issueCsrf } from '../../server/session';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (previewDemoEnabled()) return respond(res, 403, { error: 'This endpoint is unavailable in the synthetic preview.' });
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const session = await getSession(req, 'admin');
    if (!session) return respond(res, 401, { error: 'Please sign in.' });
    return respond(res, 200, { csrf: await issueCsrf(req, 'admin'), expiresAt: session.expiresAt });
  } catch { return safeError(res); }
}
