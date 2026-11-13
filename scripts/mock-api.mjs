import { createServer } from 'node:http';

const categories = ['transition', 'subjects', 'activities', 'leadership'];
const completed = new Map();
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Mock-API': 'true' };

function send(res, status, body) {
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function bodyOf(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32_000) throw new Error('Request too large');
  }
  return JSON.parse(body);
}

createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://localhost').pathname;
  if (req.method === 'GET' && path === '/api/guest/availability') return send(res, 200, { open: true, simulated: true });
  if (req.method === 'POST' && path === '/api/guest/session') return send(res, 200, { csrf: 'local-mock-csrf', simulated: true });
  if (req.method === 'POST' && path === '/api/evaluate') {
    try {
      if (req.headers['x-csrf-token'] !== 'local-mock-csrf') return send(res, 403, { error: 'Mock session missing.' });
      const data = await bodyOf(req);
      if (typeof data.requestId !== 'string' || !Array.isArray(data.answers) || data.answers.length !== 10) return send(res, 400, { error: 'Invalid mock request.' });
      if (completed.has(data.requestId)) return send(res, 200, { evaluation: completed.get(data.requestId), simulated: true });
      if (completed.size >= 100) return send(res, 429, { error: 'Local mock limit reached. Restart the mock server.' });
      const summary = 'SIMULATED LOCAL FEEDBACK. This checks the interface only; no answer was evaluated by AI.';
      const evaluation = {
        categories: categories.map((categoryId) => ({ categoryId, indicator: 'Not enough evidence', evidence: 'Local mock: evidence was not assessed.', nextStep: 'Use the real, authorised evaluation service for feedback.' })),
        whatWentWell: [],
        evenBetterIf: 'This is a local interface preview, not feedback on your answers.',
        overallSummary: summary,
        formattedCopyableText: summary,
      };
      completed.set(data.requestId, evaluation);
      return send(res, 200, { evaluation, simulated: true });
    } catch { return send(res, 400, { error: 'Invalid mock request.' }); }
  }
  if (path.startsWith('/api/')) return send(res, 503, { error: 'This route is unavailable in the local mock. Use a configured Vercel development environment.' });
  return send(res, 404, { error: 'Not found.' });
}).listen(3101, '127.0.0.1', () => console.log('Mock API listening on 127.0.0.1:3101'));
