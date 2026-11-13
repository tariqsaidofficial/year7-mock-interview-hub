import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, runId } from './firebase-admin';
import type { ApiRequest, ApiResponse } from './http';

export type Role = 'guest' | 'admin';
export type Session = { id: string; role: Role; csrfHash: string; expiresAt: number; runId: string; clientKey: string };
const GUEST_COOKIE = '__Host-y7_guest';
const ADMIN_COOKIE = '__Host-y7_admin';
const GUEST_LIFETIME = 12 * 60 * 60 * 1000;
const ADMIN_LIFETIME = 2 * 60 * 60 * 1000;

function pepper(): string {
  const value = process.env['SESSION_PEPPER'] || '';
  if (value.length < 32) throw new Error('Session secret unavailable');
  return value;
}
function digest(value: string): string { return createHmac('sha256', pepper()).update(value).digest('hex'); }
function cookieName(role: Role) { return role === 'guest' ? GUEST_COOKIE : ADMIN_COOKIE; }
function cookies(req: ApiRequest): Record<string, string> {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map((part) => part.trim().split('=')).filter(([key, value]) => key && value));
}
function sessions() { return db().collection('interviewRuns').doc(runId()).collection('sessions'); }
function counters() { return db().collection('interviewRuns').doc(runId()).collection('securityCounters'); }
export function setSessionCookie(res: ApiResponse, role: Role, value: string, ageSeconds: number) {
  res.setHeader('Set-Cookie', `${cookieName(role)}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ageSeconds}`);
}
export function clearSessionCookie(res: ApiResponse, role: Role) { setSessionCookie(res, role, '', 0); }
export function sameOrigin(req: ApiRequest): boolean {
  const configured = process.env['APP_ORIGIN'];
  const origin = req.headers.origin;
  if (!configured || !origin || Array.isArray(origin)) return false;
  try {
    const expected = new URL(configured);
    if (expected.protocol !== 'https:' && !(expected.protocol === 'http:' && expected.hostname === 'localhost')) return false;
    return new URL(origin).origin === expected.origin && origin === expected.origin;
  }
  catch { return false; }
}
export function clientKey(req: ApiRequest): string {
  // Vercel overwrites x-forwarded-for at its edge; never trust it in local mode.
  const ip = process.env['VERCEL'] === '1' ? req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] : req.socket?.remoteAddress;
  if (typeof ip !== 'string' || !ip || ip.length > 128) throw new Error('Client address unavailable');
  return digest(ip.split(',')[0].trim());
}
export async function getSession(req: ApiRequest, role: Role): Promise<Session | null> {
  const token = cookies(req)[cookieName(role)];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const snap = await sessions().doc(digest(token)).get();
  if (!snap.exists) return null;
  const data = snap.data() as Session;
  if (data.role !== role || data.runId !== runId() || data.expiresAt <= Date.now() || data.clientKey !== clientKey(req)) return null;
  return { ...data, id: snap.id };
}
export function validCsrf(req: ApiRequest, session: Session): boolean {
  const value = req.headers['x-csrf-token'];
  if (!sameOrigin(req) || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return false;
  const expected = Buffer.from(session.csrfHash, 'hex');
  const actual = Buffer.from(digest(value), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function createSession(req: ApiRequest, res: ApiResponse, role: Role) {
  const candidate = newSession(req, role);
  await sessions().doc(candidate.id).create(candidate.data);
  setSessionCookie(res, role, candidate.token, Math.floor((candidate.expiresAt - Date.now()) / 1000));
  return { csrf: candidate.csrf, expiresAt: candidate.expiresAt };
}
function newSession(req: ApiRequest, role: Role) {
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + (role === 'guest' ? GUEST_LIFETIME : ADMIN_LIFETIME);
  const id = digest(token);
  return { token, csrf, expiresAt, id, data: { role, csrfHash: digest(csrf), expiresAt, runId: runId(), clientKey: clientKey(req), createdAt: Date.now() } };
}
export async function issueGuest(req: ApiRequest, res: ApiResponse) {
  if (process.env['INTERVIEW_RUN_OPEN'] !== 'true') return { kind: 'closed' as const };
  const existing = await getSession(req, 'guest');
  if (existing) return { kind: 'existing' as const };
  const ip = clientKey(req);
  const hour = Math.floor(Date.now() / 3_600_000);
  const maxRun = Number(process.env['MAX_GUEST_SESSIONS'] || 40);
  if (!Number.isInteger(maxRun) || maxRun < 1 || maxRun > 40) throw new Error('Guest limit unavailable');
  const maxPerAddress = Number(process.env['MAX_GUEST_SESSIONS_PER_IP'] || maxRun);
  if (!Number.isInteger(maxPerAddress) || maxPerAddress < 1 || maxPerAddress > maxRun) throw new Error('Guest address limit unavailable');
  if (maxPerAddress === maxRun) {
    // One atomic slot per issued session bounds the run without a shared hot
    // counter. The classroom's shared IP cannot exceed the run cap either.
    const candidate = newSession(req, 'guest');
    const slots = db().collection('interviewRuns').doc(runId()).collection('guestSlots');
    const order = Array.from({ length: maxRun }, (_, index) => index);
    for (let i = order.length - 1; i > 0; i--) { const j = randomBytes(4).readUInt32BE(0) % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    for (const index of order) {
      const batch = db().batch();
      batch.create(slots.doc(String(index)), { sessionId: candidate.id, clientKey: ip, createdAt: Date.now() });
      batch.create(sessions().doc(candidate.id), candidate.data);
      try {
        await batch.commit();
        setSessionCookie(res, 'guest', candidate.token, Math.floor((candidate.expiresAt - Date.now()) / 1000));
        return { kind: 'created' as const, csrf: candidate.csrf, expiresAt: candidate.expiresAt };
      } catch (error) {
        if ((error as { code?: number }).code !== 6) throw error;
      }
    }
    return { kind: 'limited' as const };
  }
  // Deliberately lower per-IP ceilings retain the transactional counter.
  // Configure the ceiling before opening a run and keep it fixed for that run.
  const runRef = counters().doc('guest-total');
  const ipRef = counters().doc(`guest-${hour}-${ip}`);
  const allowed = await db().runTransaction(async (tx) => {
    const [run, address] = await Promise.all([tx.get(runRef), tx.get(ipRef)]);
    if (Number(run.get('count') || 0) >= maxRun || Number(address.get('count') || 0) >= maxPerAddress) return false;
    tx.set(runRef, { count: Number(run.get('count') || 0) + 1 });
    tx.set(ipRef, { count: Number(address.get('count') || 0) + 1, expiresAt: Date.now() + 86_400_000 });
    return true;
  });
  if (!allowed) return { kind: 'limited' as const };
  return { kind: 'created' as const, ...await createSession(req, res, 'guest') };
}
export async function issueAdmin(req: ApiRequest, res: ApiResponse) { return createSession(req, res, 'admin'); }
export async function revokeSession(req: ApiRequest, res: ApiResponse, role: Role) {
  const session = await getSession(req, role);
  if (session) await sessions().doc(session.id).delete();
  clearSessionCookie(res, role);
}
export async function issueCsrf(req: ApiRequest, role: Role): Promise<string | null> {
  const session = await getSession(req, role);
  if (!session) return null;
  const csrf = randomBytes(32).toString('hex');
  await sessions().doc(session.id).update({ csrfHash: digest(csrf) });
  return csrf;
}
export function verifyAdminPassword(password: string): boolean {
  const encoded = process.env['ADMIN_PASSWORD_HASH'] || '';
  const match = /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) throw new Error('Administrator password hash unavailable');
  const expected = Buffer.from(match[2], 'hex');
  const actual = scryptSync(password, Buffer.from(match[1], 'hex'), 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(expected, actual);
}
export async function allowAdminAttempt(req: ApiRequest): Promise<boolean> {
  const period = Math.floor(Date.now() / 900_000);
  const refs = [counters().doc(`login-${period}-${clientKey(req)}`), counters().doc(`login-total-${period}`)];
  return db().runTransaction(async (tx) => {
    const [address, total] = await Promise.all(refs.map((ref) => tx.get(ref)));
    if (Number(address.get('count') || 0) >= 5 || Number(total.get('count') || 0) >= 30) return false;
    tx.set(refs[0], { count: Number(address.get('count') || 0) + 1, expiresAt: Date.now() + 86_400_000 });
    tx.set(refs[1], { count: Number(total.get('count') || 0) + 1, expiresAt: Date.now() + 86_400_000 });
    return true;
  });
}
