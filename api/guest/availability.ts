import { ApiRequest, ApiResponse, respond } from '../../server/http';
import { previewDemoEnabled } from '../../server/preview-demo';

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  if (previewDemoEnabled()) return respond(res, 200, { open: true, demo: true });
  return respond(res, 200, { open: process.env['INTERVIEW_RUN_OPEN'] === 'true' });
}
