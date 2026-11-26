import React, { useState } from 'react';
import { Key, Network } from 'lucide-react';
import { UserProfile, MedicalRecord, AccessRequest } from '../../types';
import type { UpdateRequestHandler, AddLogHandler } from './types';

interface NodeDetailPanelProps {
  user: UserProfile;
  allUsers: UserProfile[];
  records: MedicalRecord[];
  requests: AccessRequest[];
  selectedNodeId: string | null;
  onSubmitRequest: (request: AccessRequest) => void;
  onUpdateRequestHandler: UpdateRequestHandler;
  onAddLog: AddLogHandler;
  handleApproveAccessRequest: (requestId: string) => void;
  handleRevokeDoctorAccess: (req: AccessRequest) => void;
}

/** Right-hand panel of the node map: patient summary, or a doctor's details with pre-authorize / revoke. */
export default function NodeDetailPanel({ user, allUsers, records, requests, selectedNodeId, onSubmitRequest, onUpdateRequestHandler, onAddLog, handleApproveAccessRequest, handleRevokeDoctorAccess }: NodeDetailPanelProps) {
  const filteredRequests = requests.filter(req => req.patientId === user.id);

  const [preAuthPurpose, setPreAuthPurpose] = useState('Routine Consultation');
  const [preAuthPrivateKey, setPreAuthPrivateKey] = useState(user.privateKey || '');
  const [preAuthError, setPreAuthError] = useState('');
  const [preAuthSuccess, setPreAuthSuccess] = useState(false);
  // The vault may be unlocked after this tab mounts; prefill the key field then.
  React.useEffect(() => {
    if (user.privateKey) setPreAuthPrivateKey(k => k || user.privateKey!);
  }, [user.privateKey]);

  const handlePreAuthorizeDoctor = (doc: UserProfile) => {
    if (!user.privateKey) {
      setPreAuthError('Unlock your vault with your passcode first.');
      return;
    }
    if (preAuthPrivateKey.trim() !== user.privateKey.trim()) {
      setPreAuthError('This private key does not match your account.');
      return;
    }

    const newReqId = `req-${crypto.randomUUID()}`;
    const newRequest: AccessRequest = {
      id: newReqId,
      patientId: user.id,
      patientName: user.name,
      doctorId: doc.id,
      doctorName: doc.name,
      doctorSpecialty: doc.specialty || 'General Practitioner',
      requestedPurpose: preAuthPurpose || 'Authorized patient connection',
      status: 'APPROVED',
      requestedAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
    };

    // The signature (RSA-PSS) and the doctor's record keys are created in App before sending.
    onSubmitRequest(newRequest);

    setPreAuthSuccess(true);
    setPreAuthError('');
    setTimeout(() => {
      setPreAuthSuccess(false);
    }, 3000);
  };

  return (
    <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm min-h-[460px] flex flex-col justify-between">
      {(() => {
        if (!selectedNodeId) {
          return (
            <div className="my-auto text-center py-8 space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 border border-teal-150 flex items-center justify-center mx-auto shadow-sm animate-pulse">
                <Network className="h-6 w-6" />
              </div>
              <h4 className="font-display font-bold text-zinc-900 text-sm uppercase tracking-wide">Inspection Ledger</h4>
              <p className="text-zinc-500 font-sans text-xs leading-relaxed max-w-[240px] mx-auto">
                Click on any doctor node on the map to review cryptographic signatures, pre-authorize new access keys, or revoke read permissions instantly.
              </p>
            </div>
          );
        }

        if (selectedNodeId === 'patient') {
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 pb-3.5 border-b border-zinc-150">
                <div className="h-9 w-9 rounded-xl bg-zinc-900 text-teal-400 flex items-center justify-center font-bold font-mono">
                  {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </div>
                <div>
                  <h4 className="font-display font-bold text-zinc-900 text-sm">{user.name}</h4>
                  <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider block font-bold">Ledger Root Patient Vault</span>
                </div>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-[9px] font-mono text-zinc-400 block uppercase font-bold">Secure ID Hash</span>
                  <span className="font-mono text-[9px] text-zinc-800 break-all select-all font-semibold bg-zinc-50 px-2 py-1.5 rounded border border-zinc-200 block mt-1">{user.keyFingerprint}</span>
                </div>

                <div>
                  <span className="text-[9px] font-mono text-zinc-400 block uppercase font-bold">Registered Account email</span>
                  <span className="font-mono text-zinc-700 block">{user.email}</span>
                </div>

                <div>
                  <span className="text-[9px] font-mono text-zinc-400 block uppercase font-bold">Authorized Keys Status</span>
                  <span className="text-emerald-700 font-bold block mt-0.5">✓ 2048-Bit RSA Keypair Embedded</span>
                </div>

                <div className="pt-2 border-t border-zinc-100 leading-relaxed font-sans text-zinc-500">
                  You are the primary vault owner. All clinical connection permissions are signed with your client private key and recorded immutably on-chain.
                </div>
              </div>
            </div>
          );
        }

        // Retrieve connection details
        const docProfile = allUsers.find(u => u.id === selectedNodeId);
        const email = docProfile?.email || '';

        // Compute mock clinic name based on email domain
        let clinicName = 'General Clinical Practice';
        if (email.includes('metrocardio')) clinicName = 'Metro Cardiology Clinic';
        else if (email.includes('neurohealth')) clinicName = 'Neuro Health Center';

        // Search requests
        const docRequests = filteredRequests.filter(req => req.doctorId === selectedNodeId);
        // Grab active request, or pending request, or most recent request
        const currentReq = docRequests.find(r => r.status === 'APPROVED') || 
                           docRequests.find(r => r.status === 'PENDING') ||
                           docRequests[0];

        const status = currentReq ? currentReq.status : 'DISCONNECTED';

        return (
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">

              {/* Header details */}
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-zinc-150">
                <div>
                  <h4 className="font-display font-bold text-zinc-900 text-sm">{docProfile?.name || `Dr. ${selectedNodeId}`}</h4>
                  <span className="text-[9px] font-mono text-zinc-400 block uppercase font-bold mt-0.5">{docProfile?.specialty || 'Medical Specialist'} • {clinicName}</span>
                </div>

                <div>
                  {status === 'APPROVED' && (
                    <span className="px-2 py-0.5 text-[9px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-250 rounded-full font-bold">
                      ACTIVE SYNC
                    </span>
                  )}
                  {status === 'PENDING' && (
                    <span className="px-2 py-0.5 text-[9px] font-mono bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold animate-pulse">
                      PENDING
                    </span>
                  )}
                  {status === 'REVOKED' && (
                    <span className="px-2 py-0.5 text-[9px] font-mono bg-zinc-100 text-zinc-500 border border-zinc-200 rounded-full font-bold">
                      REVOKED
                    </span>
                  )}
                  {status === 'REJECTED' && (
                    <span className="px-2 py-0.5 text-[9px] font-mono bg-red-50 text-red-700 border border-red-200 rounded-full font-bold">
                      DECLINED
                    </span>
                  )}
                  {status === 'DISCONNECTED' && (
                    <span className="px-2 py-0.5 text-[9px] font-mono bg-zinc-100 text-zinc-400 border border-zinc-200 rounded-full">
                      NO CONNECTION
                    </span>
                  )}
                </div>
              </div>

              {/* Cryptographic details or Authorization Form */}
              {status === 'DISCONNECTED' || status === 'REVOKED' || status === 'REJECTED' ? (
                // Pre-authorization form
                <div className="space-y-3 pt-2 text-xs">
                  <h5 className="font-display font-bold text-zinc-900 text-xs uppercase tracking-wide flex items-center gap-1.5 text-teal-800">
                    <Key className="h-3.5 w-3.5" /> Pre-Authorize Clinician
                  </h5>
                  <p className="text-zinc-500 text-[11px] leading-relaxed">
                    Grant direct, encrypted access to your medicine records and diagnostics. Confirm below using your asymmetric key.
                  </p>

                  {preAuthError && (
                    <div className="p-2 bg-red-50 border border-red-200 text-[10px] text-red-750 rounded-lg">
                      {preAuthError}
                    </div>
                  )}

                  {preAuthSuccess && (
                    <div className="p-2 bg-emerald-50 border border-emerald-250 text-[10px] text-emerald-800 rounded-lg">
                      ✓ Connection authorized and published to ledger node!
                    </div>
                  )}

                  <div className="space-y-2">
                    <div>
                      <label className="block text-[9px] font-mono text-zinc-400 uppercase font-semibold mb-1">
                        Access Purpose / Justification
                      </label>
                      <input 
                        type="text"
                        value={preAuthPurpose}
                        onChange={(e) => setPreAuthPurpose(e.target.value)}
                        placeholder="e.g. Consultation check, medication review"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-1.5 text-[11px] focus:outline-none focus:border-zinc-300"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-zinc-450 uppercase font-semibold mb-1">
                        Your Secret PEM Private Key
                      </label>
                      <textarea
                        rows={3}
                        value={preAuthPrivateKey}
                        onChange={(e) => setPreAuthPrivateKey(e.target.value)}
                        placeholder="-----BEGIN PRIVATE KEY-----"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-1.5 text-[9px] font-mono focus:outline-none focus:border-zinc-300"
                      />
                      <button
                        type="button"
                        onClick={() => setPreAuthPrivateKey(user.privateKey || '')}
                        className="text-[8px] font-mono text-teal-700 hover:underline mt-1 font-bold bg-transparent border-0 cursor-pointer block text-left"
                      >
                        Auto-fill private key block
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => docProfile && handlePreAuthorizeDoctor(docProfile)}
                      className="w-full bg-teal-850 hover:bg-teal-900 text-white font-bold py-2 rounded-xl text-xs font-mono tracking-wide mt-2 shadow-sm cursor-pointer"
                    >
                      Sign & Establish Connection
                    </button>
                  </div>

                </div>
              ) : (
                // Connection stats & hashes
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[9px] font-mono text-zinc-400 block uppercase font-semibold">Clinician Public Key Directory Address</span>
                    <span className="font-mono text-[9px] text-zinc-500 break-all select-all block bg-zinc-50 p-1.5 rounded border border-zinc-200 mt-1 max-h-[60px] overflow-y-auto">{docProfile?.publicKey || 'No key loaded'}</span>
                  </div>

                  {currentReq && (
                    <>
                      <div>
                        <span className="text-[9px] font-mono text-zinc-400 block uppercase font-semibold">Connection Established Purpose</span>
                        <p className="font-sans text-zinc-700 italic mt-0.5 bg-zinc-50/50 p-2 rounded">"{currentReq.requestedPurpose}"</p>
                      </div>

                      {currentReq.digitalSignature && (
                        <div>
                          <span className="text-[9px] font-mono text-zinc-400 block uppercase font-semibold flex items-center justify-between">
                            <span>Cryptographic Signature Proof</span>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(currentReq.digitalSignature || '');
                                onAddLog('Signature Copied', 'SUCCESS', `Cryptographic access signature token for ${currentReq.doctorName} copied to clipboard.`);
                              }}
                              className="text-[8px] font-mono text-teal-750 hover:underline cursor-pointer"
                            >
                              Copy Token
                            </button>
                          </span>
                          <span className="font-mono text-[9px] text-teal-750 break-all select-all font-semibold block bg-teal-50/20 p-2 rounded border border-teal-100 mt-1">{currentReq.digitalSignature}</span>
                        </div>
                      )}

                      <div className="text-[9px] font-mono text-zinc-450 space-y-0.5 pt-1 border-t border-zinc-100">
                        <div>Request Created: {new Date(currentReq.requestedAt).toLocaleString()}</div>
                        {currentReq.decidedAt && <div>Signature Sealed: {new Date(currentReq.decidedAt).toLocaleString()}</div>}
                      </div>
                    </>
                  )}

                </div>
              )}

            </div>

            {/* Bottom actions container */}
            <div className="pt-4 border-t border-zinc-100 mt-auto">
              {status === 'APPROVED' && currentReq && (
                <button
                  onClick={() => handleRevokeDoctorAccess(currentReq)}
                  className="w-full py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-mono font-bold transition-all shadow-sm cursor-pointer"
                >
                  Revoke Secure Read Access
                </button>
              )}

              {status === 'PENDING' && currentReq && (
                <div className="flex gap-2">
                  <button
                    onClick={() => onUpdateRequestHandler(currentReq.id, 'REJECTED')}
                    className="flex-1 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-red-600 hover:text-red-700 text-xs font-mono font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleApproveAccessRequest(currentReq.id)}
                    className="flex-1 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs font-mono tracking-wide transition-all shadow-sm cursor-pointer"
                  >
                    Approve & Sign
                  </button>
                </div>
              )}
            </div>

          </div>
        );
      })()}
    </div>
  );
}
