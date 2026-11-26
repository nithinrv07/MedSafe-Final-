import React, { useCallback, useEffect, useRef, useState } from 'react';
import { UserProfile, MedicalRecord, AccessRequest, AuditLog } from './types.js';
import { api } from './api.js';
import {
  consentMessage,
  decryptRecordPayload,
  encryptRecordPayload,
  RecordPayload,
  rewrapRecordKey,
  signMessage,
  unwrapPrivateKey,
} from './utils/vaultCrypto.js';

// Components
const LandingPage = React.lazy(() => import('./components/LandingPage.jsx'));
const AuthPage = React.lazy(() => import('./components/AuthPage.jsx'));
const PatientDashboard = React.lazy(() => import('./components/PatientDashboard.jsx'));
const DoctorDashboard = React.lazy(() => import('./components/DoctorDashboard.jsx'));
import { Loader2, RefreshCw, Lock } from 'lucide-react';

type Screen = 'LANDING' | 'AUTH' | 'PATIENT_DASH' | 'DOCTOR_DASH';
type ServerRecord = Omit<MedicalRecord, 'title' | 'details' | 'medicines' | 'photoUrls' | 'photoUrl' | 'encryptedContent' | 'locked'>;

const POLL_MS = 3000;

function cipherPreview(r: { iv: string; ciphertext: string }) {
  return `AES-256-GCM | iv=${r.iv} | ${r.ciphertext.slice(0, 120)}${r.ciphertext.length > 120 ? '…' : ''}`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('LANDING');
  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Server state (already filtered by the server to what this user may see)
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [serverRecords, setServerRecords] = useState<ServerRecord[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const versionRef = useRef(0);
  const decryptCache = useRef(new Map<string, RecordPayload>());

  // The private key lives only in memory. After a reload the user re-enters their passcode.
  const privateKey = currentUser?.privateKey;

  const resetClientState = () => {
    versionRef.current = 0;
    decryptCache.current.clear();
    setUsers([]);
    setServerRecords([]);
    setRecords([]);
    setRequests([]);
    setLogs([]);
  };

  // Restore an existing session on load.
  useEffect(() => {
    api
      .get('/api/auth/me')
      .then(({ user }) => {
        setCurrentUser(user);
        setScreen(user.role === 'PATIENT' ? 'PATIENT_DASH' : 'DOCTOR_DASH');
      })
      .catch(() => setScreen('LANDING'))
      .finally(() => setIsLoadingState(false));
  }, []);

  const fetchServerState = useCallback(
    async (force = false) => {
      if (!currentUser) return;
      if (force) setIsSyncing(true);
      try {
        const data = await api.get(`/api/state${!force && versionRef.current ? `?since=${versionRef.current}` : ''}`);
        setNetworkError(null);
        if (!data) return; // 204: nothing changed
        versionRef.current = data.version;
        setUsers(data.users);
        setServerRecords(data.records);
        setRequests(data.requests);
        setLogs(data.logs);
      } catch (err: any) {
        if (err.status === 401) {
          setCurrentUser(null);
          resetClientState();
          setScreen('AUTH');
          return;
        }
        setNetworkError('Server disconnected. Attempting to reconnect...');
      } finally {
        setIsSyncing(false);
      }
    },
    [currentUser?.id]
  );

  useEffect(() => {
    if (!currentUser) return;
    fetchServerState(true);
    const interval = setInterval(() => fetchServerState(), POLL_MS);
    return () => clearInterval(interval);
  }, [currentUser?.id, fetchServerState]);

  // Decrypt records in the browser whenever the ciphertexts or the key change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: MedicalRecord[] = [];
      for (const r of serverRecords) {
        const cacheKey = `${r.id}:${r.hash}`;
        let payload = decryptCache.current.get(cacheKey);
        if (!payload && privateKey && currentUser) {
          try {
            payload = await decryptRecordPayload(r, currentUser.id, privateKey);
            decryptCache.current.set(cacheKey, payload);
          } catch {
            /* stays locked */
          }
        }
        out.push({
          ...r,
          title: payload?.title ?? 'Encrypted record',
          details: payload?.details ?? '',
          medicines: payload?.medicines ?? [],
          photoUrls: payload?.photoUrls ?? [],
          photoUrl: payload?.photoUrls?.[0],
          encryptedContent: cipherPreview(r),
          locked: !payload,
        });
      }
      if (!cancelled) setRecords(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [serverRecords, privateKey, currentUser?.id]);

  // Runs a server action, then refreshes state. Errors are shown in a banner.
  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || 'Something went wrong');
    } finally {
      await fetchServerState(true);
    }
  };

  const requireKey = () => {
    if (!currentUser || !privateKey) throw new Error('Unlock your vault with your passcode first.');
    return { me: currentUser, key: privateKey };
  };

  const publicKeyOf = (userId: string) => {
    const u = users.find(x => x.id === userId);
    if (!u) throw new Error('Unknown user');
    return u.publicKey;
  };

  /** Everyone who should be able to read a patient's records: the patient and approved doctors. */
  const readersFor = (patientId: string, extra: string[] = []) => {
    const ids = new Set([patientId, ...extra]);
    requests.filter(r => r.patientId === patientId && r.status === 'APPROVED').forEach(r => ids.add(r.doctorId));
    return Object.fromEntries([...ids].map(id => [id, publicKeyOf(id)]));
  };

  const payloadOf = (rec: MedicalRecord): RecordPayload => ({
    title: rec.title,
    details: rec.details,
    medicines: rec.medicines || [],
    photoUrls: rec.photoUrls?.length ? rec.photoUrls : rec.photoUrl ? [rec.photoUrl] : [],
  });

  const handleAddLog = (action: string, status: 'SUCCESS' | 'WARNING' | 'ALERT', details: string, patientId?: string) => {
    api.post('/api/logs', { action, status, details: details.slice(0, 1000), ...(patientId ? { patientId } : {}) }).catch(err => console.error('Failed to post audit log:', err));
  };

  const handleAuthSuccess = (user: UserProfile) => {
    resetClientState();
    setCurrentUser(user);
    setScreen(user.role === 'PATIENT' ? 'PATIENT_DASH' : 'DOCTOR_DASH');
  };

  const handleAddRecord = (newRec: MedicalRecord) =>
    runAction(async () => {
      const { me } = requireKey();
      const readers = readersFor(newRec.patientId, [me.id]);
      const enc = await encryptRecordPayload(payloadOf(newRec), readers);
      await api.post('/api/records', {
        id: newRec.id,
        patientId: newRec.patientId,
        category: newRec.category,
        doctorName: newRec.doctorName,
        date: newRec.date,
        ...enc,
      });
    });

  const handleUpdateRecord = (rec: MedicalRecord) =>
    runAction(async () => {
      requireKey();
      const enc = await encryptRecordPayload(payloadOf(rec), readersFor(rec.patientId));
      await api.post('/api/records/update', { id: rec.id, category: rec.category, doctorName: rec.doctorName, ...enc });
    });

  /** Re-wraps every one of the patient's record keys for a doctor. */
  const envelopesForDoctor = async (doctorId: string) => {
    const { me, key } = requireKey();
    const doctorKey = publicKeyOf(doctorId);
    const envelopes: Record<string, string> = {};
    for (const r of serverRecords.filter(x => x.patientId === me.id)) {
      const mine = r.keyEnvelopes[me.id];
      if (!mine) throw new Error('Missing your own key for a record; please refresh and try again.');
      envelopes[r.id] = await rewrapRecordKey(mine, key, doctorKey);
    }
    return envelopes;
  };

  const handleUpdateRequestStatus = (requestId: string, status: 'APPROVED' | 'REJECTED' | 'REVOKED') =>
    runAction(async () => {
      const req = requests.find(r => r.id === requestId);
      if (!req) throw new Error('Request not found');

      if (currentUser?.role === 'DOCTOR') {
        await api.post('/api/requests/update', { requestId, status: 'REVOKED' });
        return;
      }

      const { key } = requireKey();
      const decidedAt = new Date().toISOString();
      const digitalSignature = await signMessage(
        consentMessage({ requestId, patientId: req.patientId, doctorId: req.doctorId, status, decidedAt }),
        key
      );
      await api.post('/api/requests/update', {
        requestId,
        status,
        decidedAt,
        digitalSignature,
        ...(status === 'APPROVED' ? { envelopes: await envelopesForDoctor(req.doctorId) } : {}),
      });
    });

  const handleDoctorSubmitRequest = (patientId: string, _patientName: string, justification: string) =>
    runAction(() => api.post('/api/requests/submit', { patientId, requestedPurpose: justification }));

  // Patient grants a doctor access directly (signed, with record keys).
  const handlePatientSubmitRequest = (newRequest: AccessRequest) =>
    runAction(async () => {
      const { me, key } = requireKey();
      const decidedAt = new Date().toISOString();
      const digitalSignature = await signMessage(
        consentMessage({ requestId: newRequest.id, patientId: me.id, doctorId: newRequest.doctorId, status: 'APPROVED', decidedAt }),
        key
      );
      await api.post('/api/requests/submit', {
        id: newRequest.id,
        doctorId: newRequest.doctorId,
        requestedPurpose: newRequest.requestedPurpose,
        decidedAt,
        digitalSignature,
        envelopes: await envelopesForDoctor(newRequest.doctorId),
      });
    });

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* ignore */
    }
    setCurrentUser(null);
    resetClientState();
    setScreen('LANDING');
  };

  if (isLoadingState) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
        <p className="text-sm font-mono text-zinc-500">Connecting to MedSafe...</p>
      </div>
    );
  }

  return (
    <div id="app-root-frame" className="min-h-screen bg-zinc-50 text-zinc-900 font-sans antialiased relative">

      {/* Sync / connectivity badge */}
      {currentUser && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
          {networkError ? (
            <div className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 border border-red-200 text-xs font-mono flex items-center gap-1.5 shadow-sm animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {networkError}
            </div>
          ) : (
            <button
              onClick={() => fetchServerState(true)}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-full bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-300 text-xs font-mono flex items-center gap-1.5 shadow-sm cursor-pointer hover:bg-zinc-50 active:scale-95 transition-all"
              title="Live sync active (click to refresh)"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {isSyncing ? 'Syncing...' : 'Live Sync Active'}
              <RefreshCw className={`h-3 w-3 ml-0.5 text-zinc-400 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      )}

      {actionError && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-lg px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 shadow-lg flex items-start gap-3">
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700 font-bold cursor-pointer" aria-label="Dismiss">×</button>
        </div>
      )}

      {currentUser && !privateKey && (screen === 'PATIENT_DASH' || screen === 'DOCTOR_DASH') && (
        <UnlockVault user={currentUser} onUnlocked={key => setCurrentUser({ ...currentUser, privateKey: key })} onLogout={handleLogout} />
      )}

      <React.Suspense fallback={
        <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
          <p className="text-sm font-mono text-zinc-500">Loading...</p>
        </div>
      }>
        {screen === 'LANDING' && (
          <LandingPage
            onGetStarted={() => { setAuthMode('REGISTER'); setScreen('AUTH'); }}
            onLogin={() => { setAuthMode('LOGIN'); setScreen('AUTH'); }}
          />
        )}

        {screen === 'AUTH' && (
          <AuthPage
            key={authMode}
            onBack={() => setScreen('LANDING')}
            onAuthSuccess={handleAuthSuccess}
            initialMode={authMode}
          />
        )}

        {screen === 'PATIENT_DASH' && currentUser && (
          <PatientDashboard
            user={currentUser}
            records={records}
            requests={requests}
            logs={logs}
            allUsers={users}
            onLogout={handleLogout}
            onAddRecord={handleAddRecord}
            onUpdateRecord={handleUpdateRecord}
            onUpdateRequestHandler={handleUpdateRequestStatus}
            onAddLog={handleAddLog}
            onSubmitRequest={handlePatientSubmitRequest}
          />
        )}

        {screen === 'DOCTOR_DASH' && currentUser && (
          <DoctorDashboard
            user={currentUser}
            records={records}
            requests={requests}
            logs={logs}
            allUsers={users}
            onLogout={handleLogout}
            onSubmitRequest={handleDoctorSubmitRequest}
            onAddRecord={handleAddRecord}
            onAddLog={handleAddLog}
            onRevokeAccessDirectly={(reqId) => handleUpdateRequestStatus(reqId, 'REVOKED')}
          />
        )}
      </React.Suspense>
    </div>
  );
}

/** Shown after a page reload: the session is still valid but the private key must be unlocked again. */
function UnlockVault({ user, onUnlocked, onLogout }: { user: UserProfile; onUnlocked: (key: string) => void; onLogout: () => void }) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.encryptedPrivateKey) return;
    setBusy(true);
    setError('');
    try {
      onUnlocked(await unwrapPrivateKey(user.encryptedPrivateKey, passcode));
    } catch {
      setError('Incorrect passcode.');
    } finally {
      setBusy(false);
      setPasscode('');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-zinc-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl border border-zinc-200 shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2 text-zinc-900 font-bold">
          <Lock className="h-5 w-5 text-teal-600" /> Unlock your vault
        </div>
        <p className="text-xs text-zinc-500">
          Your private key is never stored unencrypted. Enter your passcode to decrypt it in this browser, {user.name}.
        </p>
        <input
          type="password"
          autoFocus
          required
          value={passcode}
          onChange={e => setPasscode(e.target.value)}
          placeholder="Passcode"
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-teal-400"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-zinc-900 text-white py-2.5 text-sm font-bold cursor-pointer disabled:opacity-60">
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
          <button type="button" onClick={onLogout} className="rounded-xl border border-zinc-200 px-4 text-sm cursor-pointer">
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}
