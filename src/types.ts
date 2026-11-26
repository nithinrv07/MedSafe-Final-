export type UserRole = 'PATIENT' | 'DOCTOR';
export type RecordCategory = 'Prescription' | 'Lab Report' | 'Diagnosis' | 'Immunization';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

/** A user as the client sees it. Secrets are never part of this object when it comes from the server. */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  licenceNumber?: string; // Doctors only
  specialty?: string; // Doctors only
  publicKey: string; // SPKI PEM
  keyFingerprint: string; // SHA-256 fingerprint of the public key
  createdAt: string;
  /** Only present on the logged-in user's own profile: private key encrypted under their passcode. */
  encryptedPrivateKey?: string;
  /** Client memory only (never sent to the server): the unlocked PKCS#8 private key PEM. */
  privateKey?: string;
}

/** Medical record as stored on the server: only metadata is in clear text. */
export interface StoredRecord {
  id: string;
  patientId: string;
  authorId: string;
  category: RecordCategory;
  doctorName: string;
  date: string;
  createdAt: string;
  updatedAt?: string;
  ciphertext: string; // AES-256-GCM, base64
  iv: string; // base64
  keyEnvelopes: Record<string, string>; // userId -> wrapped record key
  hash: string; // SHA-256 of ciphertext
}

/** Medical record as used by the UI: stored fields plus the decrypted payload (client-side only). */
export interface MedicalRecord extends Omit<StoredRecord, 'keyEnvelopes'> {
  keyEnvelopes: Record<string, string>; // only the caller's own envelope is returned by the server
  readers: string[]; // ids of every user who currently holds a key for this record
  title: string;
  details: string;
  medicines: string[];
  photoUrls?: string[];
  photoUrl?: string;
  /** Short preview of the ciphertext for display. */
  encryptedContent: string;
  /** True when this browser could not decrypt the record (no key or vault locked). */
  locked?: boolean;
}

export interface AccessRequest {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  requestedPurpose: string;
  status: RequestStatus;
  requestedAt: string;
  decidedAt?: string;
  digitalSignature?: string; // RSA-PSS signature by the patient over consentMessage(...)
  signatureVerified?: boolean; // set by the server after verifying digitalSignature
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  actorId?: string;
  actorName: string;
  actorRole: UserRole | 'SYSTEM';
  status: 'SUCCESS' | 'WARNING' | 'ALERT';
  details: string;
  prevHash?: string;
  hash: string; // SHA-256 hash chain: sha256(prevHash + entry)
}

export interface DrugConflictWarning {
  severity: 'CRITICAL' | 'MODERATE' | 'NONE';
  description: string;
  resolution: string;
}
