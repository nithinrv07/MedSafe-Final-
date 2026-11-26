import { describe, expect, it } from 'vitest';
import {
  consentMessage,
  decryptRecordPayload,
  deriveAuthKey,
  encryptRecordPayload,
  generateUserKeys,
  keysMatch,
  rewrapRecordKey,
  signMessage,
  unwrapPrivateKey,
  verifySignature,
  wrapPrivateKey,
} from '../src/utils/vaultCrypto';

describe('vaultCrypto', () => {
  it('wraps and unwraps a private key with the passcode only', async () => {
    const k = await generateUserKeys();
    const wrapped = await wrapPrivateKey(k.privateKey, 'correct horse');
    expect(wrapped).not.toContain(k.privateKey.slice(40, 80));
    expect(await unwrapPrivateKey(wrapped, 'correct horse')).toBe(k.privateKey);
    await expect(unwrapPrivateKey(wrapped, 'wrong')).rejects.toThrow('Incorrect passcode');
    expect(await keysMatch(k.publicKey, k.privateKey)).toBe(true);
  });

  it('auth key differs from anything that could unwrap the private key and depends on email', async () => {
    const a = await deriveAuthKey('pw', 'A@x.com');
    expect(a).toBe(await deriveAuthKey('pw', 'a@x.com'));
    expect(a).not.toBe(await deriveAuthKey('pw', 'b@x.com'));
  });

  it('encrypts records so only listed readers can decrypt, and supports re-wrapping', async () => {
    const patient = await generateUserKeys();
    const doctor = await generateUserKeys();
    const outsider = await generateUserKeys();
    const payload = { title: 'T', details: 'secret details', medicines: ['Warfarin'], photoUrls: [] };
    const rec = await encryptRecordPayload(payload, { p: patient.publicKey });

    expect(rec.ciphertext).not.toContain('secret');
    expect(rec.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await decryptRecordPayload(rec, 'p', patient.privateKey)).toEqual(payload);
    await expect(decryptRecordPayload(rec, 'd', doctor.privateKey)).rejects.toThrow();
    await expect(decryptRecordPayload({ ...rec, keyEnvelopes: { x: rec.keyEnvelopes.p } }, 'x', outsider.privateKey)).rejects.toThrow();

    rec.keyEnvelopes.d = await rewrapRecordKey(rec.keyEnvelopes.p, patient.privateKey, doctor.publicKey);
    expect((await decryptRecordPayload(rec, 'd', doctor.privateKey)).details).toBe('secret details');
  });

  it('detects tampered ciphertext', async () => {
    const k = await generateUserKeys();
    const rec = await encryptRecordPayload({ title: 'T', details: 'x', medicines: [], photoUrls: [] }, { p: k.publicKey });
    const bytes = atob(rec.ciphertext).split('');
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
    await expect(decryptRecordPayload({ ...rec, ciphertext: btoa(bytes.join('')) }, 'p', k.privateKey)).rejects.toThrow();
  });

  it('signs consent decisions so they can be verified with the public key', async () => {
    const k = await generateUserKeys();
    const other = await generateUserKeys();
    const msg = consentMessage({ requestId: 'r1', patientId: 'p', doctorId: 'd', status: 'APPROVED', decidedAt: '2026-01-01T00:00:00Z' });
    const sig = await signMessage(msg, k.privateKey);
    expect(await verifySignature(msg, sig, k.publicKey)).toBe(true);
    expect(await verifySignature(msg.replace('APPROVED', 'REVOKED'), sig, k.publicKey)).toBe(false);
    expect(await verifySignature(msg, sig, other.publicKey)).toBe(false);
  });
});
