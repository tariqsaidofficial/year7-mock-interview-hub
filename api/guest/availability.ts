import { ApiRequest, ApiResponse, respond } from '../../server/http';

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  return respond(res, 200, { open: process.env['INTERVIEW_RUN_OPEN'] === 'true' });
}
