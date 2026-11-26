import express, { type NextFunction, type Request, type Response } from 'express';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AccessRequest, StoredRecord, UserProfile } from '../src/types.js';
import { consentMessage, keyFingerprint, verifySignature } from '../src/utils/vaultCrypto.js';
import { hashAuthKey, newId, Store, type StoredLog, type StoredUser, verifyAuthKey } from './store.js';
import { sendOtpEmail } from './mailer.js';
import { analyzeWithGemini, isGeminiConfigured, simulateOcr } from './ocr.js';

export interface AppOptions {
  isProduction: boolean;
  /** Show the OTP in the API response. Only for local demos; refused in production. */
  devEchoOtp: boolean;
  allowReset: boolean;
  seedDemo: boolean;
  /** Override for tests. */
  sendOtp?: (email: string, otp: string) => Promise<boolean>;
}

const SESSION_COOKIE = 'medsafe_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_MS = 30 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

// ---------- validation schemas ----------

const email = z.string().trim().toLowerCase().email().max(254);
const role = z.enum(['PATIENT', 'DOCTOR']);
const authKey = z.string().min(40).max(100);
const id = z.string().regex(/^[A-Za-z0-9_-]{3,80}$/);
const b64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/);
const pem = z.string().max(2000).regex(/^-----BEGIN PUBLIC KEY-----[\sA-Za-z0-9+/=]+-----END PUBLIC KEY-----\s*$/);
const category = z.enum(['Prescription', 'Lab Report', 'Diagnosis', 'Immunization']);
const isoDate = z.string().max(40).refine(s => !Number.isNaN(Date.parse(s)), 'Invalid date');
const envelopes = z.record(id, b64.max(1024)).refine(o => Object.keys(o).length <= 100, 'Too many envelopes');

const schemas = {
  register: z.object({
    email,
    role,
    name: z.string().trim().min(1).max(120),
    authKey,
    publicKey: pem,
    encryptedPrivateKey: z.string().max(4000),
    licenceNumber: z.string().trim().max(60).optional(),
    specialty: z.string().trim().max(80).optional(),
  }),
  login: z.object({ email, role, authKey }),
  verify: z.object({ challengeId: z.string().max(100), otp: z.string().regex(/^\d{6}$/) }),
  resend: z.object({ challengeId: z.string().max(100) }),
  record: z.object({
    id: id.optional(),
    patientId: id,
    category,
    doctorName: z.string().trim().max(120),
    date: isoDate,
    ciphertext: b64.max(9_000_000),
    iv: b64.max(32),
    keyEnvelopes: envelopes,
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  recordUpdate: z.object({
    id,
    category,
    doctorName: z.string().trim().max(120),
    ciphertext: b64.max(9_000_000),
    iv: b64.max(32),
    keyEnvelopes: envelopes,
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  doctorRequest: z.object({ id: id.optional(), patientId: id, requestedPurpose: z.string().trim().min(1).max(1000) }),
  patientPreAuth: z.object({
    id: id.optional(),
    doctorId: id,
    requestedPurpose: z.string().trim().min(1).max(1000),
    decidedAt: isoDate,
    digitalSignature: b64.max(1024),
    envelopes,
  }),
  requestUpdate: z.object({
    requestId: id,
    status: z.enum(['APPROVED', 'REJECTED', 'REVOKED']),
    decidedAt: isoDate.optional(),
    digitalSignature: b64.max(1024).optional(),
    envelopes: envelopes.optional(),
  }),
  log: z.object({
    action: z.string().trim().min(1).max(120),
    status: z.enum(['SUCCESS', 'WARNING', 'ALERT']),
    details: z.string().trim().max(1000),
    patientId: id.optional(),
  }),
  ocr: z.object({ image: z.string().max(9_000_000), fileName: z.string().max(255).optional() }),
};

// ---------- helpers ----------

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new HttpError(400, `Invalid request: ${issue.path.join('.') || 'body'} ${issue.message}`.trim());
  }
  return r.data;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Public profile: never includes the auth hash or the wrapped private key. */
function publicProfile(u: StoredUser): UserProfile {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    ...(u.role === 'DOCTOR' ? { licenceNumber: u.licenceNumber, specialty: u.specialty } : {}),
    publicKey: u.publicKey,
    keyFingerprint: u.keyFingerprint,
    createdAt: u.createdAt,
  };
}

function selfProfile(u: StoredUser): UserProfile {
  return { ...publicProfile(u), encryptedPrivateKey: u.encryptedPrivateKey };
}

interface Challenge {
  otp: string;
  email: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  kind: 'LOGIN' | 'REGISTER';
  userId?: string;
  pendingUser?: StoredUser;
}

// ---------- app ----------

export function createApp(store: Store, opts: AppOptions) {
  const app = express();
  const sendOtp = opts.sendOtp ?? sendOtpEmail;
  const echoOtp = opts.devEchoOtp && !opts.isProduction;

  const sessions = new Map<string, { userId: string; expiresAt: number }>();
  const challenges = new Map<string, Challenge>();
  const loginFailures = new Map<string, { count: number; lockedUntil: number }>();

  // Periodically drop expired sessions and challenges.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, s] of sessions) if (s.expiresAt < now) sessions.delete(k);
    for (const [k, c] of challenges) if (c.expiresAt < now) challenges.delete(k);
  }, 60_000);
  sweeper.unref();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    next();
  });
  app.use('/api', express.json({ limit: '12mb' }));

  // Mutating requests must be JSON. Browsers cannot send cross-site JSON
  // without a CORS preflight, which this server never approves. Together with
  // the SameSite=Strict cookie this blocks CSRF.
  app.use('/api', (req, _res, next) => {
    if (req.method !== 'GET' && !req.is('application/json')) return next(new HttpError(415, 'Content-Type must be application/json'));
    next();
  });

  // ---- session handling ----
  function currentUser(req: Request): StoredUser | null {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const s = sessions.get(token);
    if (!s || s.expiresAt < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return store.db.users.get(s.userId) ?? null;
  }

  function requireUser(req: Request): StoredUser {
    const u = currentUser(req);
    if (!u) throw new HttpError(401, 'Please sign in');
    return u;
  }

  function startSession(res: Response, userId: string) {
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: opts.isProduction,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
  }

  async function issueChallenge(c: Omit<Challenge, 'otp' | 'expiresAt' | 'attempts' | 'lastSentAt'>) {
    const challengeId = randomBytes(24).toString('base64url');
    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const challenge: Challenge = { ...c, otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0, lastSentAt: Date.now() };
    challenges.set(challengeId, challenge);
    const delivered = await sendOtp(c.email, otp);
    if (!delivered) {
      if (opts.isProduction) {
        challenges.delete(challengeId);
        throw new HttpError(503, 'Could not send the verification email. Please try again later.');
      }
      console.log(`[OTP] Email not configured/failed. Development code for ${c.email}: ${otp}`);
    }
    return { challengeId, delivered, ...(echoOtp ? { devOtp: otp } : {}) };
  }

  const audit = (entry: Omit<StoredLog, 'id' | 'timestamp' | 'prevHash' | 'hash'>) => store.addLog(entry);
  const actor = (u: StoredUser) => ({ actorId: u.id, actorName: u.name, actorRole: u.role });

  // ---- auth routes ----

  app.post(
    '/api/auth/register',
    asyncRoute(async (req, res) => {
      const body = parse(schemas.register, req.body);
      if ([...store.db.users.values()].some(u => u.email === body.email && u.role === body.role)) {
        throw new HttpError(409, 'An account with this email and role already exists');
      }
      if (body.role === 'DOCTOR' && !body.licenceNumber) throw new HttpError(400, 'Doctors must provide a licence number');
      let fingerprint: string;
      try {
        fingerprint = await keyFingerprint(body.publicKey);
        JSON.parse(body.encryptedPrivateKey);
      } catch {
        throw new HttpError(400, 'Invalid key material');
      }
      const pendingUser: StoredUser = {
        id: newId('usr'),
        email: body.email,
        name: body.name,
        role: body.role,
        ...(body.role === 'DOCTOR' ? { licenceNumber: body.licenceNumber, specialty: body.specialty || 'General Practice' } : {}),
        publicKey: body.publicKey,
        keyFingerprint: fingerprint,
        encryptedPrivateKey: body.encryptedPrivateKey,
        authHash: hashAuthKey(body.authKey),
        createdAt: new Date().toISOString(),
      };
      res.json(await issueChallenge({ kind: 'REGISTER', email: body.email, pendingUser }));
    })
  );

  app.post(
    '/api/auth/login',
    asyncRoute(async (req, res) => {
      const body = parse(schemas.login, req.body);
      const key = `${body.email}|${body.role}`;
      const f = loginFailures.get(key);
      if (f && f.lockedUntil > Date.now()) {
        throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
      }
      const user = [...store.db.users.values()].find(u => u.email === body.email && u.role === body.role);
      // Always run scrypt so response time does not reveal whether the account exists.
      const ok = verifyAuthKey(body.authKey, user?.authHash ?? 'scrypt:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
      if (!user || !ok) {
        const count = (f && f.lockedUntil <= Date.now() && f.count >= LOGIN_MAX_FAILURES ? 0 : f?.count ?? 0) + 1;
        loginFailures.set(key, { count, lockedUntil: count >= LOGIN_MAX_FAILURES ? Date.now() + LOGIN_LOCK_MS : 0 });
        if (user) {
          await audit({ ...actor(user), action: 'Failed Sign-in Attempt', status: 'ALERT', details: 'Incorrect passcode entered.', subjectIds: [user.id] });
        }
        throw new HttpError(401, 'Incorrect email, role or passcode');
      }
      loginFailures.delete(key);
      res.json(await issueChallenge({ kind: 'LOGIN', email: user.email, userId: user.id }));
    })
  );

  app.post(
    '/api/auth/resend',
    asyncRoute(async (req, res) => {
      const { challengeId } = parse(schemas.resend, req.body);
      const c = challenges.get(challengeId);
      if (!c || c.expiresAt < Date.now()) throw new HttpError(400, 'This sign-in attempt has expired. Please start again.');
      if (Date.now() - c.lastSentAt < OTP_RESEND_MS) throw new HttpError(429, 'Please wait 30 seconds before requesting another code.');
      c.otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      c.attempts = 0;
      c.lastSentAt = Date.now();
      c.expiresAt = Date.now() + OTP_TTL_MS;
      const delivered = await sendOtp(c.email, c.otp);
      if (!delivered) {
        if (opts.isProduction) throw new HttpError(503, 'Could not send the verification email.');
        console.log(`[OTP] Development code for ${c.email}: ${c.otp}`);
      }
      res.json({ challengeId, delivered, ...(echoOtp ? { devOtp: c.otp } : {}) });
    })
  );

  app.post(
    '/api/auth/verify',
    asyncRoute(async (req, res) => {
      const { challengeId, otp } = parse(schemas.verify, req.body);
      const c = challenges.get(challengeId);
      if (!c || c.expiresAt < Date.now()) {
        challenges.delete(challengeId);
        throw new HttpError(400, 'This code has expired. Please request a new one.');
      }
      if (!safeEqual(c.otp, otp)) {
        c.attempts++;
        if (c.attempts >= OTP_MAX_ATTEMPTS) {
          challenges.delete(challengeId);
          throw new HttpError(429, 'Too many incorrect codes. Please sign in again.');
        }
        throw new HttpError(401, `Incorrect code. ${OTP_MAX_ATTEMPTS - c.attempts} attempt(s) left.`);
      }
      challenges.delete(challengeId);

      let user: StoredUser | undefined;
      if (c.kind === 'REGISTER') {
        const p = c.pendingUser!;
        if ([...store.db.users.values()].some(u => u.email === p.email && u.role === p.role)) {
          throw new HttpError(409, 'An account with this email and role already exists');
        }
        await store.putUser(p);
        user = p;
        await audit({ ...actor(p), action: 'Account Registered', status: 'SUCCESS', details: `New ${p.role === 'PATIENT' ? 'patient' : 'clinician'} account created. Key fingerprint ${p.keyFingerprint}.`, subjectIds: [p.id] });
      } else {
        user = store.db.users.get(c.userId!);
        if (!user) throw new HttpError(400, 'Account no longer exists');
      }
      startSession(res, user.id);
      await audit({ ...actor(user), action: 'User Authentication Success', status: 'SUCCESS', details: 'Signed in with passcode and email verification code.', subjectIds: [user.id] });
      res.json({ user: selfProfile(user) });
    })
  );

  app.post(
    '/api/auth/logout',
    asyncRoute(async (req, res) => {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const user = currentUser(req);
      if (token) sessions.delete(token);
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      if (user) await audit({ ...actor(user), action: 'User Logged Out', status: 'SUCCESS', details: 'Session closed.', subjectIds: [user.id] });
      res.json({ success: true });
    })
  );

  app.get('/api/auth/me', (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    res.json({ user: selfProfile(user) });
  });

  // ---- authorization helpers ----

  const requestsFor = (patientId: string) => [...store.db.requests.values()].filter(r => r.patientId === patientId);
  const approvedDoctorIds = (patientId: string) =>
    new Set(requestsFor(patientId).filter(r => r.status === 'APPROVED').map(r => r.doctorId));
  const recordsOf = (patientId: string) => [...store.db.records.values()].filter(r => r.patientId === patientId);

  function canReadRecord(u: StoredUser, r: StoredRecord) {
    if (u.role === 'PATIENT') return r.patientId === u.id;
    return approvedDoctorIds(r.patientId).has(u.id) && !!r.keyEnvelopes[u.id];
  }

  function recordView(u: StoredUser, r: StoredRecord) {
    const { keyEnvelopes, ...rest } = r;
    return { ...rest, keyEnvelopes: keyEnvelopes[u.id] ? { [u.id]: keyEnvelopes[u.id] } : {}, readers: Object.keys(keyEnvelopes) };
  }

  /** Envelopes may only be addressed to the patient and doctors the patient has approved. */
  function checkEnvelopeRecipients(patientId: string, env: Record<string, string>, mustInclude: string[]) {
    const allowed = approvedDoctorIds(patientId);
    allowed.add(patientId);
    for (const uid of Object.keys(env)) {
      if (!allowed.has(uid)) throw new HttpError(403, 'Records can only be shared with doctors the patient has approved');
    }
    for (const uid of mustInclude) {
      if (!env[uid]) throw new HttpError(400, 'A decryption key for the patient (and author) is required');
    }
  }

  async function verifyConsent(patient: StoredUser, req: AccessRequest, status: string, decidedAt: string, signature: string | undefined) {
    if (!signature) throw new HttpError(400, 'A digital signature from the patient is required');
    if (Math.abs(Date.now() - Date.parse(decidedAt)) > 10 * 60 * 1000) throw new HttpError(400, 'Signature timestamp is too old');
    const ok = await verifySignature(
      consentMessage({ requestId: req.id, patientId: req.patientId, doctorId: req.doctorId, status, decidedAt }),
      signature,
      patient.publicKey
    );
    if (!ok) throw new HttpError(400, 'Digital signature is not valid for this patient');
  }

  /** On approval the patient re-wraps every one of their record keys for the doctor. */
  async function grantEnvelopes(patientId: string, doctorId: string, env: Record<string, string>) {
    const recs = recordsOf(patientId);
    const missing = recs.filter(r => !env[r.id]).map(r => r.id);
    if (missing.length) throw new HttpError(400, `Missing decryption keys for ${missing.length} record(s)`);
    for (const r of recs) await store.putRecord({ ...r, keyEnvelopes: { ...r.keyEnvelopes, [doctorId]: env[r.id] } });
  }

  async function removeEnvelopes(patientId: string, doctorId: string) {
    for (const r of recordsOf(patientId)) {
      if (r.keyEnvelopes[doctorId]) {
        const { [doctorId]: _gone, ...rest } = r.keyEnvelopes;
        await store.putRecord({ ...r, keyEnvelopes: rest });
      }
    }
  }

  // ---- data routes ----

  app.get('/api/state', (req, res) => {
    const u = requireUser(req);
    const since = Number(req.query.since);
    if (since && since === store.version) return res.status(204).end();

    const users = [...store.db.users.values()]
      .filter(x => u.role === 'DOCTOR' || x.role === 'DOCTOR' || x.id === u.id)
      .map(x => (x.id === u.id ? selfProfile(x) : publicProfile(x)));
    const records = [...store.db.records.values()].filter(r => canReadRecord(u, r)).map(r => recordView(u, r));
    const requests = [...store.db.requests.values()].filter(r => r.patientId === u.id || r.doctorId === u.id);
    const logs = store.db.logs
      .filter(l => l.subjectIds.includes(u.id) || l.actorId === u.id)
      .slice(-300)
      .reverse()
      .map(({ subjectIds: _s, ...l }) => l);

    res.json({ version: store.version, users, records, requests, logs });
  });

  app.post(
    '/api/records',
    asyncRoute(async (req, res) => {
      const u = requireUser(req);
      const body = parse(schemas.record, req.body);
      const patient = store.db.users.get(body.patientId);
      if (!patient || patient.role !== 'PATIENT') throw new HttpError(404, 'Patient not found');
      if (u.role === 'PATIENT' && u.id !== patient.id) throw new HttpError(403, 'Patients can only add records to their own vault');
      if (u.role === 'DOCTOR' && !approvedDoctorIds(patient.id).has(u.id)) throw new HttpError(403, 'You do not have approved access to this patient');
      if (body.id && store.db.records.has(body.id)) throw new HttpError(409, 'Record id already exists');
      checkEnvelopeRecipients(patient.id, body.keyEnvelopes, [patient.id, u.id]);

      const rec: StoredRecord = {
        id: body.id ?? newId('rec'),
        patientId: patient.id,
        authorId: u.id,
        category: body.category,
        doctorName: u.role === 'DOCTOR' ? u.name : body.doctorName || 'Self Uploaded',
        date: body.date.slice(0, 10),
        createdAt: new Date().toISOString(),
        ciphertext: body.ciphertext,
        iv: body.iv,
        keyEnvelopes: body.keyEnvelopes,
        hash: body.hash,
      };
      await store.putRecord(rec);
      await audit({ ...actor(u), action: 'Encrypted Record Added', status: 'SUCCESS', details: `${rec.category} added to ${patient.name}'s vault (ciphertext SHA-256 ${rec.hash.slice(0, 16)}…).`, subjectIds: [patient.id, u.id] });
      res.json({ success: true, record: recordView(u, rec) });
    })
  );

  app.post(
    '/api/records/update',
    asyncRoute(async (req, res) => {
      const u = requireUser(req);
      const body = parse(schemas.recordUpdate, req.body);
      const existing = store.db.records.get(body.id);
      if (!existing) throw new HttpError(404, 'Record not found');
      if (u.role !== 'PATIENT' || existing.patientId !== u.id) throw new HttpError(403, 'Only the patient who owns this record can edit it');
      checkEnvelopeRecipients(u.id, body.keyEnvelopes, [u.id]);
      const rec: StoredRecord = {
        ...existing,
        category: body.category,
        doctorName: body.doctorName || existing.doctorName,
        ciphertext: body.ciphertext,
        iv: body.iv,
        keyEnvelopes: body.keyEnvelopes,
        hash: body.hash,
        updatedAt: new Date().toISOString(),
      };
      await store.putRecord(rec);
      await audit({ ...actor(u), action: 'Encrypted Record Updated', status: 'SUCCESS', details: `Record re-encrypted (ciphertext SHA-256 ${rec.hash.slice(0, 16)}…).`, subjectIds: [u.id] });
      res.json({ success: true, record: recordView(u, rec) });
    })
  );

  app.post(
    '/api/requests/submit',
    asyncRoute(async (req, res) => {
      const u = requireUser(req);
      if (u.role === 'DOCTOR') {
        const body = parse(schemas.doctorRequest, req.body);
        const patient = store.db.users.get(body.patientId);
        if (!patient || patient.role !== 'PATIENT') throw new HttpError(404, 'Patient not found');
        if (requestsFor(patient.id).some(r => r.doctorId === u.id && (r.status === 'PENDING' || r.status === 'APPROVED'))) {
          throw new HttpError(409, 'You already have a pending or approved request for this patient');
        }
        const request: AccessRequest = {
          id: body.id && !store.db.requests.has(body.id) ? body.id : newId('req'),
          patientId: patient.id,
          patientName: patient.name,
          doctorId: u.id,
          doctorName: u.name,
          doctorSpecialty: u.specialty || 'General Practice',
          requestedPurpose: body.requestedPurpose,
          status: 'PENDING',
          requestedAt: new Date().toISOString(),
        };
        await store.putRequest(request);
        await audit({ ...actor(u), action: 'Access Request Submitted', status: 'WARNING', details: `${u.name} requested access to ${patient.name}'s records. Purpose: ${body.requestedPurpose}`, subjectIds: [patient.id, u.id] });
        return res.json({ success: true, request });
      }

      // Patient pre-authorizes a doctor directly (signed).
      const body = parse(schemas.patientPreAuth, req.body);
      const doctor = store.db.users.get(body.doctorId);
      if (!doctor || doctor.role !== 'DOCTOR') throw new HttpError(404, 'Doctor not found');
      if (approvedDoctorIds(u.id).has(doctor.id)) throw new HttpError(409, 'This doctor already has access');
      const request: AccessRequest = {
        id: body.id && !store.db.requests.has(body.id) ? body.id : newId('req'),
        patientId: u.id,
        patientName: u.name,
        doctorId: doctor.id,
        doctorName: doctor.name,
        doctorSpecialty: doctor.specialty || 'General Practice',
        requestedPurpose: body.requestedPurpose,
        status: 'APPROVED',
        requestedAt: body.decidedAt,
        decidedAt: body.decidedAt,
        digitalSignature: body.digitalSignature,
      };
      await verifyConsent(u, request, 'APPROVED', body.decidedAt, body.digitalSignature);
      request.signatureVerified = true;
      // Close any older open request from the same doctor.
      for (const r of requestsFor(u.id)) {
        if (r.doctorId === doctor.id && r.status === 'PENDING') await store.putRequest({ ...r, status: 'REJECTED', decidedAt: body.decidedAt });
      }
      await store.putRequest(request);
      await grantEnvelopes(u.id, doctor.id, body.envelopes);
      await audit({ ...actor(u), action: 'Clinician Pre-Authorized', status: 'SUCCESS', details: `${u.name} granted ${doctor.name} access (signature verified). Purpose: ${body.requestedPurpose}`, subjectIds: [u.id, doctor.id] });
      res.json({ success: true, request });
    })
  );

  app.post(
    '/api/requests/update',
    asyncRoute(async (req, res) => {
      const u = requireUser(req);
      const body = parse(schemas.requestUpdate, req.body);
      const request = store.db.requests.get(body.requestId);
      if (!request) throw new HttpError(404, 'Request not found');

      if (u.role === 'DOCTOR') {
        // A doctor may only give up their own access.
        if (request.doctorId !== u.id || body.status !== 'REVOKED' || request.status !== 'APPROVED') {
          throw new HttpError(403, 'Doctors can only relinquish their own approved access');
        }
        const updated: AccessRequest = { ...request, status: 'REVOKED', decidedAt: new Date().toISOString(), digitalSignature: undefined, signatureVerified: false };
        await store.putRequest(updated);
        await removeEnvelopes(request.patientId, u.id);
        await audit({ ...actor(u), action: 'Access Relinquished by Doctor', status: 'WARNING', details: `${u.name} gave up access to ${request.patientName}'s records.`, subjectIds: [request.patientId, u.id] });
        return res.json({ success: true, request: updated });
      }

      if (request.patientId !== u.id) throw new HttpError(403, 'This request is not addressed to you');
      const allowed: Record<string, string[]> = { APPROVED: ['PENDING'], REJECTED: ['PENDING'], REVOKED: ['APPROVED'] };
      if (!allowed[body.status].includes(request.status)) throw new HttpError(409, `Cannot change a ${request.status} request to ${body.status}`);

      const decidedAt = body.decidedAt ?? '';
      await verifyConsent(u, request, body.status, decidedAt, body.digitalSignature);
      const updated: AccessRequest = { ...request, status: body.status, decidedAt, digitalSignature: body.digitalSignature, signatureVerified: true };

      if (body.status === 'APPROVED') {
        await grantEnvelopes(u.id, request.doctorId, body.envelopes ?? {});
      } else {
        await removeEnvelopes(u.id, request.doctorId);
      }
      await store.putRequest(updated);
      const verb = body.status === 'APPROVED' ? 'approved' : body.status === 'REJECTED' ? 'rejected' : 'revoked';
      await audit({
        ...actor(u),
        action: `Access Request ${verb[0].toUpperCase()}${verb.slice(1)}`,
        status: body.status === 'APPROVED' ? 'SUCCESS' : 'ALERT',
        details: `${u.name} ${verb} access for ${request.doctorName} (signature verified).`,
        subjectIds: [u.id, request.doctorId],
      });
      res.json({ success: true, request: updated });
    })
  );

  app.post(
    '/api/logs',
    asyncRoute(async (req, res) => {
      const u = requireUser(req);
      const body = parse(schemas.log, req.body);
      const subjectIds = [u.id];
      if (body.patientId && body.patientId !== u.id && requestsFor(body.patientId).some(r => r.doctorId === u.id)) {
        subjectIds.push(body.patientId);
      }
      await audit({ ...actor(u), action: body.action, status: body.status, details: body.details, subjectIds });
      res.json({ success: true });
    })
  );

  app.get('/api/logs/verify', (req, res) => {
    requireUser(req);
    const broken = store.verifyLogChain();
    res.json({ valid: broken < 0, entries: store.db.logs.length, ...(broken >= 0 ? { brokenAt: broken } : {}) });
  });

  app.post(
    '/api/ocr/analyze',
    asyncRoute(async (req, res) => {
      requireUser(req);
      const { image, fileName } = parse(schemas.ocr, req.body);
      if (!isGeminiConfigured()) {
        return res.json({ success: true, simulated: true, data: simulateOcr(fileName || '') });
      }
      try {
        res.json({ success: true, simulated: false, data: await analyzeWithGemini(image) });
      } catch (err: any) {
        console.error('[OCR] Gemini analysis failed:', err?.message);
        res.json({ success: true, simulated: true, data: simulateOcr(fileName || ''), error: 'AI analysis failed; please fill in the form manually.' });
      }
    })
  );

  app.post(
    '/api/reset',
    asyncRoute(async (_req, res) => {
      if (!opts.allowReset || opts.isProduction) throw new HttpError(403, 'Resetting the database is disabled on this server');
      await store.reset(opts.seedDemo);
      sessions.clear();
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.json({ success: true, message: 'Database re-seeded successfully' });
    })
  );

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Upload is too large' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    console.error('[API] Unexpected error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
