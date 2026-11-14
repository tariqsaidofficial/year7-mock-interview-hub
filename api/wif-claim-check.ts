import { ApiRequest, ApiResponse, respond } from '../server/http';

// Temporary protected-preview diagnostic. Remove before any production release.
export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  const token = req.headers['x-vercel-oidc-token'];
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    return respond(res, 503, { tokenPresent: false });
  }
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    const expectedSubject = 'owner:dxbmark:project:year7-mock-interview-hub:environment:preview';
    return respond(res, 200, {
      tokenPresent: true,
      claimKeys: Object.keys(claims).sort(),
      issuerMatchesTeam: claims['iss'] === 'https://oidc.vercel.com/dxbmark',
      audienceMatchesTeam: claims['aud'] === 'https://vercel.com/dxbmark',
      subjectMatchesPreview: claims['sub'] === expectedSubject,
      projectMatches: claims['project_id'] === 'prj_WRunWM1HAJAGs3twDh8LfV6BvK5Y',
      environmentMatchesPreview: claims['environment'] === 'preview',
    });
  } catch {
    return respond(res, 503, { tokenPresent: true, claimsReadable: false });
  }
}
