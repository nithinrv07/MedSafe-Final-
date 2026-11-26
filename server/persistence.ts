// Persistence backends. Without FIREBASE_DATABASE_URL the server keeps data in
// memory only. With it, every change is written to its own path in the Firebase
// Realtime Database (instead of re-uploading the whole database on each change).
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

export interface Persistence {
  loadAll(): Promise<any | null>;
  put(path: string, value: unknown): Promise<void>;
  replaceAll(tree: unknown): Promise<void>;
}

export class MemoryPersistence implements Persistence {
  async loadAll() {
    return null;
  }
  async put() {}
  async replaceAll() {}
}

export class FirebasePersistence implements Persistence {
  private auth;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private dbUrl: string,
    private backendEmail: string,
    private backendPassword: string
  ) {
    const app = initializeApp({
      apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyDGmZOGdm7vUNRIUqjIu6sVtdT-PZj1j6s',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'medsafe-e1d89.firebaseapp.com',
      projectId: process.env.FIREBASE_PROJECT_ID || 'medsafe-e1d89',
    });
    this.auth = getAuth(app);
    this.dbUrl = dbUrl.replace(/\/+$/, '');
  }

  private async token(): Promise<string> {
    if (this.auth.currentUser) {
      try {
        return await this.auth.currentUser.getIdToken(false);
      } catch {
        /* fall through to sign in again */
      }
    }
    try {
      const cred = await signInWithEmailAndPassword(this.auth, this.backendEmail, this.backendPassword);
      return await cred.user.getIdToken();
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        console.log('[FIREBASE] Backend service account not found; creating it.');
        const cred = await createUserWithEmailAndPassword(this.auth, this.backendEmail, this.backendPassword);
        return await cred.user.getIdToken();
      }
      throw error;
    }
  }

  private async url(path: string) {
    return `${this.dbUrl}/${path}.json?auth=${encodeURIComponent(await this.token())}`;
  }

  async loadAll() {
    const res = await fetch(await this.url(''));
    if (!res.ok) throw new Error(`Firebase load failed: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /** Writes are serialized so they reach the database in the order they were made. */
  put(path: string, value: unknown) {
    this.queue = this.queue
      .then(async () => {
        const res = await fetch(await this.url(path), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      })
      .catch(err => console.error(`[FIREBASE] Failed to write ${path}:`, err));
    return this.queue;
  }

  replaceAll(tree: unknown) {
    return this.put('', tree);
  }
}

export function createPersistence(): Persistence {
  const dbUrl = process.env.FIREBASE_DATABASE_URL;
  if (!dbUrl) {
    console.log('[STORE] FIREBASE_DATABASE_URL not set: using in-memory storage (data is lost on restart).');
    return new MemoryPersistence();
  }
  const email = process.env.BACKEND_EMAIL;
  const password = process.env.BACKEND_PASSWORD;
  if (!email || !password) {
    throw new Error('FIREBASE_DATABASE_URL is set, so BACKEND_EMAIL and BACKEND_PASSWORD must be set too (see .env.example).');
  }
  return new FirebasePersistence(dbUrl, email, password);
}
