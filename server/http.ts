import type { IncomingMessage, ServerResponse } from 'node:http';
export type ApiRequest = IncomingMessage & { body?: unknown };
export type ApiResponse = ServerResponse & { status(code: number): ApiResponse; json(body: unknown): void };
export function respond(res: ApiResponse, code: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(code).json(body);
}
export function jsonBody(req: ApiRequest): unknown {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}
export function safeError(res: ApiResponse) { respond(res, 503, { error: 'This service is unavailable right now. Please try again later.' }); }
