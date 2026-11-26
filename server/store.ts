// Server-side data store: in-memory state, optional Firebase Realtime Database
// persistence (per-item writes), the hash-chained audit log, demo seeding and
// a one-time migration of data written by older versions of MedSafe.
import { createHash, randomUUID, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AccessRequest, AuditLog, StoredRecord, UserProfile } from '../src/types.js';
import {
  consentMessage,
  deriveAuthKey,
  encryptRecordPayload,
  generateUserKeys,
  keyFingerprint,
  signMessage,
  wrapPrivateKey,
} from '../src/utils/vaultCrypto.js';
import type { Persistence } from './persistence.js';

export interface StoredUser extends Omit<UserProfile, 'privateKey'> {
  encryptedPrivateKey: string;
  authHash: string; // "scrypt:<salt b64>:<hash b64>" of the client-derived auth key
}

export type StoredLog = AuditLog & { subjectIds: string[] };

export interface DB {
  users: Map<string, StoredUser>;
  records: Map<string, StoredRecord>;
  requests: Map<string, AccessRequest>;
  logs: StoredLog[]; // oldest first
}

// ---------- password hashing (of the client-derived auth key) ----------

export function hashAuthKey(authKey: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(authKey, salt, 32);
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function verifyAuthKey(authKey: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = (stored || '').split(':');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(authKey, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

// ---------- store ----------

export class Store {
  db: DB = { users: new Map(), records: new Map(), requests: new Map(), logs: [] };
  /** Bumped on every change so clients can skip unchanged polls. */
  version = 1;

  constructor(private persistence: Persistence) {}

  private touch() {
    this.version++;
  }

  async putUser(u: StoredUser) {
    this.db.users.set(u.id, u);
    this.touch();
    await this.persistence.put(`users/${u.id}`, u);
  }

  async putRecord(r: StoredRecord) {
    this.db.records.set(r.id, r);
    this.touch();
    await this.persistence.put(`records/${r.id}`, r);
  }

  async putRequest(r: AccessRequest) {
    this.db.requests.set(r.id, r);
    this.touch();
    await this.persistence.put(`requests/${r.id}`, r);
  }

  /** Appends an entry to the tamper-evident audit log. */
  async addLog(entry: Omit<StoredLog, 'id' | 'timestamp' | 'prevHash' | 'hash'> & { timestamp?: string }) {
    const prev = this.db.logs[this.db.logs.length - 1];
    const log: StoredLog = {
      id: newId('log'),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      action: entry.action,
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorRole: entry.actorRole,
      status: entry.status,
      details: entry.details,
      subjectIds: entry.subjectIds,
      prevHash: prev?.hash ?? 'GENESIS',
      hash: '',
    };
    log.hash = logHash(log);
    this.db.logs.push(log);
    this.touch();
    await this.persistence.put(`logs/${log.id}`, log);
    return log;
  }

  /** Recomputes the hash chain. Returns the index of the first broken entry, or -1 if intact. */
  verifyLogChain(): number {
    let prev = 'GENESIS';
    for (let i = 0; i < this.db.logs.length; i++) {
      const l = this.db.logs[i];
      if (l.prevHash !== prev || l.hash !== logHash(l)) return i;
      prev = l.hash;
    }
    return -1;
  }

  async load(options: { seedDemo: boolean }) {
    const data = await this.persistence.loadAll();
    const isEmpty = !data || (!data.users && !data.records && !data.requests && !data.logs);

    if (isEmpty) {
      if (options.seedDemo) {
        console.log('[STORE] Database is empty. Seeding demo accounts...');
        await this.migrateLegacy(buildLegacyDemoData());
        await this.persistence.replaceAll(this.serialize());
      } else {
        console.log('[STORE] Database is empty. Demo seeding is disabled.');
      }
      return;
    }

    const asList = <T>(v: any): T[] => (Array.isArray(v) ? v.filter(Boolean) : v ? Object.values(v) : []);
    const raw = {
      users: asList<any>(data.users),
      records: asList<any>(data.records),
      requests: asList<any>(data.requests),
      logs: asList<any>(data.logs),
    };

    const needsMigration =
      Array.isArray(data.users) ||
      raw.users.some(u => !u.encryptedPrivateKey || 'passcode' in u || 'privateKey' in u) ||
      raw.records.some(r => !r.ciphertext || 'details' in r) ||
      raw.logs.some(l => !l.prevHash);

    if (needsMigration) {
      console.log('[STORE] Legacy data detected. Migrating to the encrypted format...');
      await this.migrateLegacy(raw);
      await this.persistence.replaceAll(this.serialize());
      console.log('[STORE] Migration complete. Plaintext passcodes, private keys and record contents were removed.');
    } else {
      raw.users.forEach(u => this.db.users.set(u.id, u));
      raw.records.forEach(r => this.db.records.set(r.id, { ...r, keyEnvelopes: r.keyEnvelopes || {} }));
      raw.requests.forEach(r => this.db.requests.set(r.id, r));
      this.db.logs = raw.logs.map(l => ({ ...l, subjectIds: l.subjectIds || [] })).sort(byTime);
      const broken = this.verifyLogChain();
      if (broken >= 0) console.warn(`[STORE] WARNING: audit log hash chain is broken at entry ${broken}.`);
    }
    this.touch();
  }

  serialize() {
    const obj = <T extends { id: string }>(m: Iterable<T>) => Object.fromEntries([...m].map(x => [x.id, x]));
    return {
      users: obj(this.db.users.values()),
      records: obj(this.db.records.values()),
      requests: obj(this.db.requests.values()),
      logs: obj(this.db.logs),
    };
  }

  async reset(seedDemo: boolean) {
    this.db = { users: new Map(), records: new Map(), requests: new Map(), logs: [] };
    if (seedDemo) await this.migrateLegacy(buildLegacyDemoData());
    this.touch();
    await this.persistence.replaceAll(this.serialize());
  }

  /**
   * Converts data from the old format (plaintext passcodes, fake keys, base64
   * "encryption") into the real encrypted format. This is the only time the
   * server handles private keys and plaintext, and it is data the old version
   * already stored in plaintext. Everything is discarded afterwards.
   */
  private async migrateLegacy(raw: { users: any[]; records: any[]; requests: any[]; logs: any[] }) {
    const privateKeys = new Map<string, string>();
    this.db = { users: new Map(), records: new Map(), requests: new Map(), logs: [] };

    for (const u of raw.users) {
      if (u.encryptedPrivateKey && u.authHash && !('passcode' in u) && !('privateKey' in u)) {
        this.db.users.set(u.id, u);
        continue;
      }
      if (!u.passcode) {
        console.warn(`[STORE] User ${u.id} has no recoverable passcode; their account must be re-registered.`);
        continue;
      }
      const keys = await generateUserKeys();
      privateKeys.set(u.id, keys.privateKey);
      const user: StoredUser = {
        id: u.id,
        email: String(u.email).toLowerCase(),
        name: u.name,
        role: u.role,
        ...(u.role === 'DOCTOR' ? { licenceNumber: u.licenceNumber, specialty: u.specialty } : {}),
        publicKey: keys.publicKey,
        keyFingerprint: await keyFingerprint(keys.publicKey),
        createdAt: u.createdAt || new Date().toISOString(),
        encryptedPrivateKey: await wrapPrivateKey(keys.privateKey, u.passcode),
        authHash: hashAuthKey(await deriveAuthKey(u.passcode, u.email)),
      };
      this.db.users.set(user.id, user);
    }

    for (const r of raw.requests) {
      if (!this.db.users.has(r.patientId) || !this.db.users.has(r.doctorId)) continue;
      const req: AccessRequest = { ...r };
      const patientKey = privateKeys.get(r.patientId);
      if (r.status !== 'PENDING' && patientKey) {
        req.decidedAt = r.decidedAt || new Date().toISOString();
        req.digitalSignature = await signMessage(
          consentMessage({ requestId: req.id, patientId: req.patientId, doctorId: req.doctorId, status: req.status, decidedAt: req.decidedAt! }),
          patientKey
        );
        req.signatureVerified = true;
      } else if (r.status !== 'PENDING') {
        delete req.digitalSignature;
        req.signatureVerified = false;
      }
      this.db.requests.set(req.id, req);
    }

    for (const r of raw.records) {
      if (r.ciphertext && r.keyEnvelopes && !('details' in r)) {
        this.db.records.set(r.id, r);
        continue;
      }
      const patient = this.db.users.get(r.patientId);
      if (!patient) continue;
      const readers: Record<string, string> = { [patient.id]: patient.publicKey };
      for (const req of this.db.requests.values()) {
        const doc = this.db.users.get(req.doctorId);
        if (req.patientId === patient.id && req.status === 'APPROVED' && doc) readers[doc.id] = doc.publicKey;
      }
      const photoUrls: string[] = r.photoUrls?.length ? r.photoUrls : r.photoUrl ? [r.photoUrl] : [];
      const enc = await encryptRecordPayload(
        { title: r.title || 'Untitled record', details: r.details || '', medicines: r.medicines || [], photoUrls },
        readers
      );
      const authorId =
        [...this.db.users.values()].find(u => u.role === 'DOCTOR' && u.name === r.doctorName)?.id ?? patient.id;
      this.db.records.set(r.id, {
        id: r.id,
        patientId: patient.id,
        authorId,
        category: r.category,
        doctorName: r.doctorName || 'Self Uploaded',
        date: r.date,
        createdAt: r.createdAt || new Date().toISOString(),
        ...enc,
      });
    }

    // Rebuild the audit log as a proper hash chain, oldest first.
    const oldLogs = [...raw.logs].sort(byTime);
    for (const l of oldLogs) {
      await this.addLog({
        timestamp: l.timestamp,
        action: l.action,
        actorId: l.actorId,
        actorName: l.actorName,
        actorRole: l.actorRole,
        status: l.status,
        details: l.details,
        subjectIds: l.subjectIds || [],
      });
    }
    await this.addLog({
      action: 'Ledger Migrated to Encrypted Format',
      actorName: 'MedSafe Server',
      actorRole: 'SYSTEM',
      status: 'SUCCESS',
      details: 'Accounts received real RSA-2048 key pairs; records were re-encrypted with AES-256-GCM; plaintext copies were removed.',
      subjectIds: [...this.db.users.keys()],
    });
    privateKeys.clear();
  }
}

function byTime(a: { timestamp?: string }, b: { timestamp?: string }) {
  return (a.timestamp || '').localeCompare(b.timestamp || '');
}

export function logHash(l: StoredLog): string {
  const body = JSON.stringify([l.id, l.timestamp, l.action, l.actorId ?? null, l.actorName, l.actorRole, l.status, l.details, l.subjectIds]);
  return createHash('sha256').update(`${l.prevHash}|${body}`).digest('hex');
}

/** Demo data in the legacy shape; migrateLegacy() turns it into real encrypted data. */
function buildLegacyDemoData() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  return {
    users: [
      { id: 'eleanor-vance', email: 'eleanor@vance.io', name: 'Eleanor Vance', role: 'PATIENT', passcode: 'password', createdAt: iso(15 * day) },
      { id: 'robert-chen', email: 'chen@metrocardio.org', name: 'Dr. Robert Chen', role: 'DOCTOR', licenceNumber: 'LIC-99321-CH', specialty: 'Cardiology', passcode: 'password', createdAt: iso(15 * day) },
      { id: 'sarah-lin', email: 'lin@neurohealth.com', name: 'Dr. Sarah Lin', role: 'DOCTOR', licenceNumber: 'LIC-11295-LN', specialty: 'Neurology', passcode: 'password', createdAt: iso(15 * day) },
    ],
    records: [
      {
        id: 'rec-lisinopril', patientId: 'eleanor-vance', title: 'Hypertension Heart Record & Lisinopril Therapy', category: 'Prescription',
        doctorName: 'Dr. Robert Chen', date: iso(3 * day).split('T')[0],
        details: 'Patient exhibits stable sinus rhythm; Lisinopril 20mg Qd prescribed for essential hypertension. Monitor BP weekly.',
        medicines: ['Lisinopril 20mg'],
      },
      {
        id: 'rec-bmp-panel', patientId: 'eleanor-vance', title: 'Basic Metabolic Panel (Lab Chemistry)', category: 'Lab Report',
        doctorName: 'Dr. Robert Chen', date: iso(10 * day).split('T')[0],
        details: 'Basic metabolic panel check: Na+: 139, K+: 4.1, Cl-: 102, Creatinine: 0.85 mg/dL. All indices within physiological norms.',
        medicines: [],
      },
    ],
    requests: [
      {
        id: 'req-chen-cardio', patientId: 'eleanor-vance', patientName: 'Eleanor Vance', doctorId: 'robert-chen', doctorName: 'Dr. Robert Chen',
        doctorSpecialty: 'Cardiology', requestedPurpose: 'Bi-annual lipid monitoring and medication synchronization check.',
        status: 'APPROVED', requestedAt: iso(12 * day), decidedAt: iso(12 * day),
      },
      {
        id: 'req-lin-neuro', patientId: 'eleanor-vance', patientName: 'Eleanor Vance', doctorId: 'sarah-lin', doctorName: 'Dr. Sarah Lin',
        doctorSpecialty: 'Neurology', requestedPurpose: 'Diagnostic overview of episodic tension cephalalgia to rule out central pathology.',
        status: 'PENDING', requestedAt: iso(1 * day),
      },
    ],
    logs: [
      {
        timestamp: iso(15 * day), action: 'MedSafe Ledger Initialized', actorName: 'MedSafe Server', actorRole: 'SYSTEM', status: 'SUCCESS',
        details: 'Demo database seeded.', subjectIds: ['eleanor-vance', 'robert-chen', 'sarah-lin'],
      },
    ],
  };
}
