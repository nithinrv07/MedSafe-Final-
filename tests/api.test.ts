import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import { MemoryPersistence } from '../server/persistence';
import {
  consentMessage,
  decryptRecordPayload,
  deriveAuthKey,
  encryptRecordPayload,
  generateUserKeys,
  rewrapRecordKey,
  signMessage,
  unwrapPrivateKey,
  wrapPrivateKey,
} from '../src/utils/vaultCrypto';

let server: Server;
let base = '';
const sentOtps = new Map<string, string>();

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  post(path: string, body: unknown) {
    return this.call('POST', path, body);
  }
  get(path: string) {
    return this.call('GET', path);
  }
  async login(email: string, role: 'PATIENT' | 'DOCTOR', password: string) {
    const r = await this.post('/api/auth/login', { email, role, authKey: await deriveAuthKey(password, email) });
    expect(r.status).toBe(200);
    const v = await this.post('/api/auth/verify', { challengeId: r.body.challengeId, otp: sentOtps.get(email) });
    expect(v.status).toBe(200);
    const privateKey = await unwrapPrivateKey(v.body.user.encryptedPrivateKey, password);
    return { user: v.body.user, privateKey };
  }
}

beforeAll(async () => {
  const store = new Store(new MemoryPersistence());
  await store.load({ seedDemo: true });
  const app = createApp(store, {
    isProduction: false,
    devEchoOtp: false,
    allowReset: false,
    seedDemo: true,
    sendOtp: async (email, otp) => {
      sentOtps.set(email, otp);
      return true;
    },
  });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(() => server?.close());

describe('authentication', () => {
  it('rejects anonymous access to state', async () => {
    expect((await new Client().get('/api/state')).status).toBe(401);
  });

  it('rejects a wrong passcode and never returns the OTP', async () => {
    const c = new Client();
    const bad = await c.post('/api/auth/login', { email: 'eleanor@vance.io', role: 'PATIENT', authKey: await deriveAuthKey('wrong', 'eleanor@vance.io') });
    expect(bad.status).toBe(401);
    const ok = await c.post('/api/auth/login', { email: 'eleanor@vance.io', role: 'PATIENT', authKey: await deriveAuthKey('password', 'eleanor@vance.io') });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain(sentOtps.get('eleanor@vance.io'));
  });

  it('locks the OTP challenge after repeated wrong codes', async () => {
    const c = new Client();
    const r = await c.post('/api/auth/login', { email: 'lin@neurohealth.com', role: 'DOCTOR', authKey: await deriveAuthKey('password', 'lin@neurohealth.com') });
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await c.post('/api/auth/verify', { challengeId: r.body.challengeId, otp: '000000' === sentOtps.get('lin@neurohealth.com') ? '111111' : '000000' })).status;
    expect(last).toBe(429);
  });

  it('never exposes secrets in state', async () => {
    const c = new Client();
    await c.login('chen@metrocardio.org', 'DOCTOR', 'password');
    const s = await c.get('/api/state');
    const text = JSON.stringify(s.body);
    expect(text).not.toMatch(/"passcode"|"authHash"|"privateKey"|BEGIN PRIVATE KEY/);
    expect(JSON.stringify(s.body.records)).not.toMatch(/"details"|"title"|Lisinopril/);
    const others = s.body.users.filter((u: any) => u.email !== 'chen@metrocardio.org');
    expect(others.every((u: any) => !u.encryptedPrivateKey)).toBe(true);
  });

  it('registers a new user only after email verification', async () => {
    const c = new Client();
    const keys = await generateUserKeys();
    const r = await c.post('/api/auth/register', {
      email: 'new@patient.test', role: 'PATIENT', name: 'New Patient',
      authKey: await deriveAuthKey('hunter22', 'new@patient.test'),
      publicKey: keys.publicKey, encryptedPrivateKey: await wrapPrivateKey(keys.privateKey, 'hunter22'),
    });
    expect(r.status).toBe(200);
    expect((await c.get('/api/state')).status).toBe(401);
    const v = await c.post('/api/auth/verify', { challengeId: r.body.challengeId, otp: sentOtps.get('new@patient.test') });
    expect(v.status).toBe(200);
    expect((await c.get('/api/state')).status).toBe(200);
  });
});

describe('records and consent', () => {
  it('lets an approved doctor decrypt, and blocks an unapproved one', async () => {
    const chen = new Client();
    const { user: chenUser, privateKey: chenKey } = await chen.login('chen@metrocardio.org', 'DOCTOR', 'password');
    const st = await chen.get('/api/state');
    expect(st.body.records.length).toBe(2);
    const payload = await decryptRecordPayload(st.body.records[0], chenUser.id, chenKey);
    expect(payload.details.length).toBeGreaterThan(10);

    const lin = new Client();
    await lin.login('lin@neurohealth.com', 'DOCTOR', 'password');
    expect((await lin.get('/api/state')).body.records.length).toBe(0);
  });

  it('blocks a doctor from approving their own request or forging records', async () => {
    const lin = new Client();
    const { user } = await lin.login('lin@neurohealth.com', 'DOCTOR', 'password');
    const st = await lin.get('/api/state');
    const req = st.body.requests.find((r: any) => r.doctorId === user.id);
    expect((await lin.post('/api/requests/update', { requestId: req.id, status: 'APPROVED', decidedAt: new Date().toISOString(), digitalSignature: 'AAAA' })).status).toBe(403);

    const keys = await generateUserKeys();
    const enc = await encryptRecordPayload({ title: 'x', details: 'x', medicines: [], photoUrls: [] }, { [req.patientId]: keys.publicKey, [user.id]: keys.publicKey });
    expect((await lin.post('/api/records', { patientId: req.patientId, category: 'Diagnosis', doctorName: 'x', date: '2026-01-01', ...enc })).status).toBe(403);
  });

  it('rejects a forged patient signature', async () => {
    const eleanor = new Client();
    await eleanor.login('eleanor@vance.io', 'PATIENT', 'password');
    const st = await eleanor.get('/api/state');
    const pending = st.body.requests.find((r: any) => r.status === 'PENDING');
    const other = await generateUserKeys();
    const decidedAt = new Date().toISOString();
    const sig = await signMessage(consentMessage({ requestId: pending.id, patientId: pending.patientId, doctorId: pending.doctorId, status: 'APPROVED', decidedAt }), other.privateKey);
    const r = await eleanor.post('/api/requests/update', { requestId: pending.id, status: 'APPROVED', decidedAt, digitalSignature: sig, envelopes: {} });
    expect(r.status).toBe(400);
  });

  it('approve gives the doctor keys; revoke takes them away', async () => {
    const eleanor = new Client();
    const { user: me, privateKey } = await eleanor.login('eleanor@vance.io', 'PATIENT', 'password');
    let st = await eleanor.get('/api/state');
    const pending = st.body.requests.find((r: any) => r.status === 'PENDING');
    const doctor = st.body.users.find((u: any) => u.id === pending.doctorId);

    const envelopes: Record<string, string> = {};
    for (const rec of st.body.records) envelopes[rec.id] = await rewrapRecordKey(rec.keyEnvelopes[me.id], privateKey, doctor.publicKey);
    const decidedAt = new Date().toISOString();
    const msg = consentMessage({ requestId: pending.id, patientId: me.id, doctorId: doctor.id, status: 'APPROVED', decidedAt });
    const ok = await eleanor.post('/api/requests/update', { requestId: pending.id, status: 'APPROVED', decidedAt, digitalSignature: await signMessage(msg, privateKey), envelopes });
    expect(ok.status).toBe(200);

    const lin = new Client();
    const { user: linUser, privateKey: linKey } = await lin.login('lin@neurohealth.com', 'DOCTOR', 'password');
    st = await lin.get('/api/state');
    expect(st.body.records.length).toBe(2);
    await decryptRecordPayload(st.body.records[0], linUser.id, linKey);

    const revokedAt = new Date().toISOString();
    const rmsg = consentMessage({ requestId: pending.id, patientId: me.id, doctorId: doctor.id, status: 'REVOKED', decidedAt: revokedAt });
    expect((await eleanor.post('/api/requests/update', { requestId: pending.id, status: 'REVOKED', decidedAt: revokedAt, digitalSignature: await signMessage(rmsg, privateKey) })).status).toBe(200);
    expect((await lin.get('/api/state')).body.records.length).toBe(0);
  });

  it('keeps an intact audit hash chain and disables reset', async () => {
    const c = new Client();
    await c.login('eleanor@vance.io', 'PATIENT', 'password');
    expect((await c.get('/api/logs/verify')).body.valid).toBe(true);
    expect((await c.post('/api/reset', {})).status).toBe(403);
  });
});
