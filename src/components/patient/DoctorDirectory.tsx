import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { UserProfile, AccessRequest } from '../../types';

interface DoctorDirectoryProps {
  user: UserProfile;
  allUsers: UserProfile[];
  requests: AccessRequest[];
  onSelectNode: (id: string | null) => void;
}

/** Searchable list of registered doctors; "Inspect" selects one on the node map. */
export default function DoctorDirectory({ user, allUsers, requests, onSelectNode }: DoctorDirectoryProps) {
  const filteredRequests = requests.filter(req => req.patientId === user.id);

  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-zinc-150 mb-4 gap-3">
        <div>
          <h4 className="font-display font-bold text-zinc-900 text-sm uppercase tracking-wide">Ledger Network Registry</h4>
          <p className="text-zinc-500 font-sans text-xs mt-0.5">Find available doctors and clinics registered on the Primacy medical ledger.</p>
        </div>
        <div className="relative max-w-xs w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-3.5 w-3.5 text-zinc-400" />
          </span>
          <input
            type="text"
            placeholder="Search doctor or specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-300"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {(() => {
          const doctors = allUsers.filter(u => u.role === 'DOCTOR');
          const filtered = doctors.filter(doc => {
            const q = searchQuery.toLowerCase();
            return doc.name.toLowerCase().includes(q) || 
                   (doc.specialty && doc.specialty.toLowerCase().includes(q));
          });

          if (filtered.length === 0) {
            return (
              <div className="col-span-full text-center py-6 text-xs text-zinc-400 italic">
                No doctors matching '{searchQuery}' found on the network.
              </div>
            );
          }

          return filtered.map(doc => {
            const docRequests = filteredRequests.filter(req => req.doctorId === doc.id);
            const currentReq = docRequests.find(r => r.status === 'APPROVED') || 
                               docRequests.find(r => r.status === 'PENDING') ||
                               docRequests[0];
            const docStatus = currentReq ? currentReq.status : 'DISCONNECTED';

            return (
              <div key={doc.id} className="p-4 bg-zinc-50/50 border border-zinc-200 rounded-2xl flex items-center justify-between shadow-sm hover:border-zinc-250 hover:bg-white transition-all">
                <div>
                  <div className="font-sans font-bold text-xs text-zinc-900">{doc.name}</div>
                  <div className="font-mono text-[9px] text-zinc-400 mt-0.5">{doc.specialty || 'General Practitioner'}</div>

                  <div className="mt-2.5">
                    {docStatus === 'APPROVED' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-150 rounded-full font-bold">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Secure Sync Active
                      </span>
                    )}
                    {docStatus === 'PENDING' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono bg-amber-50 text-amber-800 border border-amber-150 rounded-full font-bold">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Approval
                      </span>
                    )}
                    {(docStatus === 'REVOKED' || docStatus === 'DISCONNECTED' || docStatus === 'REJECTED') && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono bg-zinc-100 text-zinc-450 border border-zinc-200 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Disconnected
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {(docStatus === 'REVOKED' || docStatus === 'DISCONNECTED' || docStatus === 'REJECTED') ? (
                    <button
                      type="button"
                      onClick={() => onSelectNode(doc.id)}
                      className="px-3 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-bold font-mono text-[10px] shadow-sm transition-all cursor-pointer"
                    >
                      Connect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectNode(doc.id);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 font-mono text-[10px] shadow-sm transition-all cursor-pointer"
                    >
                      Inspect
                    </button>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>

    </div>
  );
}
