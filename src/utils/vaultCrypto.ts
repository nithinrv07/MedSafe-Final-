// Real cryptography for MedSafe, built on the standard Web Crypto API.
// The same module runs in the browser and in Node 20+ (globalThis.crypto.subtle).
//
// Scheme
// - Every user owns an RSA-2048 key pair (RSA-OAEP / SHA-256). The same key
//   material is imported as RSA-PSS to sign consent decisions.
// - The private key never leaves the browser in plaintext. It is wrapped with
//   AES-256-GCM under a key derived from the user's password (PBKDF2-SHA256)
//   and only that wrapped blob is stored on the server, so the user can log in
//   from another device.
// - The password itself is never sent to the server either. The client sends a
//   separate PBKDF2-derived "auth key" (different salt), which the server hashes
//   again with scrypt.
// - Each medical record is encrypted with its own random AES-256-GCM key. That
//   record key is wrapped (RSA-OAEP) once per reader: the patient, plus every
//   doctor the patient has approved. Approving a doctor = re-wrapping record
//   keys for that doctor's public key. Revoking = deleting those envelopes.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const AUTH_KDF_ITERATIONS = 210_000;
export const WRAP_KDF_ITERATIONS = 310_000;

// ---------- encoding helpers ----------

export function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

function toPem(b64: string, label: string): string {
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

function fromPem(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '');
  return b64ToBytes(body);
}

// ---------- hashing ----------

export async function sha256Hex(data: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return toHex(await subtle.digest('SHA-256', bytes));
}

/** Short, human-readable SHA-256 fingerprint of a public key. */
export async function keyFingerprint(publicKeyPem: string): Promise<string> {
  const hex = await sha256Hex(fromPem(publicKeyPem));
  return hex.slice(0, 32).match(/.{4}/g)!.join(':').toUpperCase();
}

// ---------- password-derived keys ----------

async function pbkdf2Bits(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<ArrayBuffer> {
  const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
}

/**
 * The credential the client sends to the server instead of the raw password.
 * Uses a different salt than the key-wrapping derivation, so knowing it does not
 * help decrypt the user's private key.
 */
export async function deriveAuthKey(password: string, email: string): Promise<string> {
  const salt = enc.encode(`medsafe-auth-v1:${email.trim().toLowerCase()}`);
  return bytesToB64(await pbkdf2Bits(password, salt, AUTH_KDF_ITERATIONS));
}

// ---------- user key pairs ----------

export interface GeneratedKeys {
  publicKey: string; // SPKI PEM
  privateKey: string; // PKCS#8 PEM (keep client-side only)
}

export async function generateUserKeys(): Promise<GeneratedKeys> {
  const pair = await subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  );
  const spki = await subtle.exportKey('spki', pair.publicKey);
  const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey);
  return {
    publicKey: toPem(bytesToB64(spki), 'PUBLIC KEY'),
    privateKey: toPem(bytesToB64(pkcs8), 'PRIVATE KEY'),
  };
}

/** Encrypts the private key PEM with a password. Returns an opaque JSON blob safe to store server-side. */
export async function wrapPrivateKey(privateKeyPem: string, password: string): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const bits = await pbkdf2Bits(password, salt, WRAP_KDF_ITERATIONS);
  const key = await subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, fromPem(privateKeyPem));
  return JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter: WRAP_KDF_ITERATIONS, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) });
}

/** Decrypts a wrapped private key. Throws if the password is wrong. */
export async function unwrapPrivateKey(wrapped: string, password: string): Promise<string> {
  const blob = JSON.parse(wrapped);
  const bits = await pbkdf2Bits(password, b64ToBytes(blob.salt), blob.iter);
  const key = await subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  try {
    const pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(blob.iv) }, key, b64ToBytes(blob.ct));
    return toPem(bytesToB64(pkcs8), 'PRIVATE KEY');
  } catch {
    throw new Error('Incorrect passcode');
  }
}

function importEncryptKey(publicKeyPem: string) {
  return subtle.importKey('spki', fromPem(publicKeyPem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
}
function importDecryptKey(privateKeyPem: string) {
  return subtle.importKey('pkcs8', fromPem(privateKeyPem), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
}
function importSignKey(privateKeyPem: string) {
  return subtle.importKey('pkcs8', fromPem(privateKeyPem), { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['sign']);
}
function importVerifyKey(publicKeyPem: string) {
  return subtle.importKey('spki', fromPem(publicKeyPem), { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['verify']);
}

/** Checks that a private key PEM really belongs to the given public key. */
export async function keysMatch(publicKeyPem: string, privateKeyPem: string): Promise<boolean> {
  try {
    const probe = randomBytes(32);
    const ct = await subtle.encrypt({ name: 'RSA-OAEP' }, await importEncryptKey(publicKeyPem), probe);
    const pt = new Uint8Array(await subtle.decrypt({ name: 'RSA-OAEP' }, await importDecryptKey(privateKeyPem), ct));
    return pt.length === probe.length && pt.every((b, i) => b === probe[i]);
  } catch {
    return false;
  }
}

// ---------- record encryption ----------

export interface RecordPayload {
  title: string;
  details: string;
  medicines: string[];
  photoUrls: string[];
}

export interface EncryptedRecordFields {
  ciphertext: string; // base64 AES-GCM output
  iv: string; // base64 12-byte nonce
  keyEnvelopes: Record<string, string>; // userId -> base64 RSA-OAEP wrapped AES key
  hash: string; // SHA-256 hex of the ciphertext, for integrity display
}

/** Encrypts a record payload for a set of readers (userId -> public key PEM). */
export async function encryptRecordPayload(
  payload: RecordPayload,
  readers: Record<string, string>
): Promise<EncryptedRecordFields> {
  const recordKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const rawKey = await subtle.exportKey('raw', recordKey);
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, recordKey, enc.encode(JSON.stringify(payload)));

  const keyEnvelopes: Record<string, string> = {};
  for (const [userId, pem] of Object.entries(readers)) {
    const wrapped = await subtle.encrypt({ name: 'RSA-OAEP' }, await importEncryptKey(pem), rawKey);
    keyEnvelopes[userId] = bytesToB64(wrapped);
  }

  return {
    ciphertext: bytesToB64(ct),
    iv: bytesToB64(iv),
    keyEnvelopes,
    hash: await sha256Hex(new Uint8Array(ct)),
  };
}

async function unwrapRecordKey(envelope: string, privateKeyPem: string): Promise<ArrayBuffer> {
  return subtle.decrypt({ name: 'RSA-OAEP' }, await importDecryptKey(privateKeyPem), b64ToBytes(envelope));
}

/** Decrypts a record using the envelope addressed to `userId`. */
export async function decryptRecordPayload(
  rec: { ciphertext: string; iv: string; keyEnvelopes: Record<string, string> },
  userId: string,
  privateKeyPem: string
): Promise<RecordPayload> {
  const envelope = rec.keyEnvelopes?.[userId];
  if (!envelope) throw new Error('No decryption key has been shared with you for this record');
  const raw = await unwrapRecordKey(envelope, privateKeyPem);
  const key = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(rec.iv) }, key, b64ToBytes(rec.ciphertext));
  return JSON.parse(dec.decode(pt));
}

/** Re-wraps a record key from the caller's envelope to another user's public key (used when granting access). */
export async function rewrapRecordKey(envelope: string, myPrivateKeyPem: string, recipientPublicKeyPem: string): Promise<string> {
  const raw = await unwrapRecordKey(envelope, myPrivateKeyPem);
  const wrapped = await subtle.encrypt({ name: 'RSA-OAEP' }, await importEncryptKey(recipientPublicKeyPem), raw);
  return bytesToB64(wrapped);
}

// ---------- consent signatures ----------

export interface ConsentFields {
  requestId: string;
  patientId: string;
  doctorId: string;
  status: string;
  decidedAt: string;
}

/** Canonical message signed by the patient when deciding on an access request. */
export function consentMessage(c: ConsentFields): string {
  return `medsafe-consent-v1|${c.requestId}|${c.patientId}|${c.doctorId}|${c.status}|${c.decidedAt}`;
}

export async function signMessage(message: string, privateKeyPem: string): Promise<string> {
  const sig = await subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, await importSignKey(privateKeyPem), enc.encode(message));
  return bytesToB64(sig);
}

export async function verifySignature(message: string, signatureB64: string, publicKeyPem: string): Promise<boolean> {
  try {
    return await subtle.verify({ name: 'RSA-PSS', saltLength: 32 }, await importVerifyKey(publicKeyPem), b64ToBytes(signatureB64), enc.encode(message));
  } catch {
    return false;
  }
}
