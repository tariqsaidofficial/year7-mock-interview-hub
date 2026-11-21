import { previewDemoEnabled } from '../../server/preview-demo';
import { ApiRequest, ApiResponse, jsonBody, respond, safeError } from '../../server/http';
import { allowAdminAttempt, issueAdmin, revokeSession, sameOrigin, verifyAdminPassword } from '../../server/session';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (previewDemoEnabled()) return respond(res, 403, { error: 'This endpoint is unavailable in the synthetic preview.' });
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  if (!sameOrigin(req) || req.headers['x-requested-with'] !== 'Year7Interview') return respond(res, 403, { error: 'Request denied.' });
  try {
    if (!(await allowAdminAttempt(req))) return respond(res, 429, { error: 'Too many sign-in attempts. Please wait 15 minutes.' });
    if (Number(req.headers['content-length'] || 0) > 1000) return respond(res, 400, { error: 'Invalid sign-in request.' });
    let body: unknown;
    try { body = jsonBody(req); } catch { return respond(res, 400, { error: 'Invalid sign-in request.' }); }
    if (Buffer.byteLength(JSON.stringify(body) ?? '', 'utf8') > 1000) return respond(res, 400, { error: 'Invalid sign-in request.' });
    const password = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>)['password'] : undefined;
    if (typeof password !== 'string' || password.length > 256 || !verifyAdminPassword(password)) return respond(res, 401, { error: 'Invalid sign-in details.' });
    await revokeSession(req, res, 'admin');
    return respond(res, 200, await issueAdmin(req, res));
  } catch { return safeError(res); }
}
