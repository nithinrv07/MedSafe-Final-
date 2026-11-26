import React from 'react';
import { Shield, Check } from 'lucide-react';
import { UserProfile, AccessRequest } from '../../types';
import type { UpdateRequestHandler } from './types';

interface AccessRequestsTabProps {
  user: UserProfile;
  requests: AccessRequest[];
  onUpdateRequestHandler: UpdateRequestHandler;
  handleApproveAccessRequest: (requestId: string) => void;
  handleRevokeDoctorAccess: (req: AccessRequest) => void;
}

/** "Access & Approvals" tab: incoming doctor requests with approve / decline / revoke. */
export default function AccessRequestsTab({ user, requests, onUpdateRequestHandler, handleApproveAccessRequest, handleRevokeDoctorAccess }: AccessRequestsTabProps) {
  const filteredRequests = requests.filter(req => req.patientId === user.id);

  return (
    <div id="patient-doctors-view" className="space-y-6 bg-blue-50/30 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-blue-100/50 shadow-sm">

      {/* Header control */}
      <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
        <h3 className="font-display text-2xl font-bold text-teal-950">Clinician Approvals Hub</h3>
        <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
          Doctors must seek express digital permission to see your medicine vault. Sign requests using your asymmetric key pair to activate safe read decryption.
        </p>
      </div>


      {/* List design */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="text-center p-12 border border-dashed border-zinc-250 rounded-2xl bg-white shadow-sm">
            <Shield id="empty-shield" className="h-9 w-9 text-zinc-400 mx-auto mb-3" />
            <p className="text-zinc-500 font-sans font-medium text-xs md:text-sm">No credentials requests are currently registered on your profile.</p>
          </div>
        ) : (
          filteredRequests.map((req) => {
            return (
              <div
                key={req.id}
                className={`rounded-2xl p-6 border shadow-sm transition-all ${
                  req.status === 'PENDING'
                    ? 'border-amber-200 bg-amber-50/40'
                    : req.status === 'APPROVED'
                      ? 'border-zinc-200 bg-white hover:border-zinc-250'
                      : 'border-zinc-150 bg-[#f9f9f9]'
                }`}
              >
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-zinc-900 text-base">
                        {req.doctorName}
                      </span>
                      <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-zinc-100 text-zinc-650 border border-zinc-200">
                        {req.doctorSpecialty}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-700 leading-relaxed max-w-xl font-sans">
                      <span className="text-[10px] font-mono text-zinc-400 block mb-0.5 uppercase font-semibold">Stated Purpose of Request:</span>
                      "{req.requestedPurpose}"
                    </p>

                    <div className="text-[10px] font-mono text-zinc-450 flex flex-wrap items-center gap-4 pt-1">
                      <span>Request Filed: {new Date(req.requestedAt).toLocaleString()}</span>
                      {req.decidedAt && <span>Decided: {new Date(req.decidedAt).toLocaleString()}</span>}
                    </div>

                    {req.digitalSignature && (
                      <div className="pt-2">
                        <span className="text-[9px] font-mono text-zinc-400 block uppercase font-semibold">Asymmetric Consent Signature</span>
                        <span className="font-mono text-[10px] text-teal-700 break-all select-all font-semibold">
                          {req.digitalSignature}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions for Approve or Revoke */}
                  <div className="flex flex-col items-end gap-2 shrink-0 w-full md:w-auto">

                    {/* Active Status indicator badges */}
                    <div className="mb-2">
                      {req.status === 'PENDING' && (
                        <span className="px-2.5 py-1 text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200 rounded-full font-bold">
                          ⏳ PENDING APPROVAL
                        </span>
                      )}
                      {req.status === 'APPROVED' && (
                        <span className="px-2.5 py-1 text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold flex items-center gap-1">
                          <Check className="h-3 w-3" /> ACTIVE DECRYPT TOKEN
                        </span>
                      )}
                      {req.status === 'REJECTED' && (
                        <span className="px-2.5 py-1 text-[10px] font-mono bg-red-50 text-red-700 border border-red-200 rounded-full font-bold">
                          ❌ DECLINED
                        </span>
                      )}
                      {req.status === 'REVOKED' && (
                        <span className="px-2.5 py-1 text-[10px] font-mono bg-zinc-100 text-zinc-500 border border-zinc-200 rounded-full font-bold">
                          🛑 REVOKED BY OWNER
                        </span>
                      )}
                    </div>

                    {req.status === 'PENDING' && (
                      <div className="flex gap-2 w-full md:w-auto">
                        <button
                          onClick={() => onUpdateRequestHandler(req.id, 'REJECTED')}
                          className="flex-1 md:flex-none py-1.5 px-3.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-red-600 hover:text-red-700 text-xs font-mono transition-all cursor-pointer font-bold shadow-sm"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => handleApproveAccessRequest(req.id)}
                          className="flex-1 md:flex-none py-1.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs font-mono tracking-wide transition-all cursor-pointer shadow-sm"
                        >
                          Approve & Sign
                        </button>
                      </div>
                    )}

                    {req.status === 'APPROVED' && (
                      <button
                        onClick={() => handleRevokeDoctorAccess(req)}
                        className="w-full md:w-auto py-1.5 px-4 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-mono transition-all cursor-pointer font-bold shadow-sm"
                      >
                        Revoke Access Immediately
                      </button>
                    )}

                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
