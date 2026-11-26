import React from 'react';
import { Shield, Key, FileText, LogOut, Radio, Network } from 'lucide-react';
import { UserProfile, MedicalRecord, AccessRequest } from '../../types';
import type { PatientTab } from './types';
import Logo from '../Logo';

interface PatientSidebarProps {
  user: UserProfile;
  records: MedicalRecord[];
  requests: AccessRequest[];
  activeTab: PatientTab;
  onSelectTab: (tab: PatientTab) => void;
  onLogout: () => void;
}

/** Left navigation column: profile summary, tab buttons, sign-out. */
export default function PatientSidebar({ user, records, requests, activeTab, onSelectTab, onLogout }: PatientSidebarProps) {
  const filteredRecords = records.filter(rec => rec.patientId === user.id);
  const filteredRequests = requests.filter(req => req.patientId === user.id);

  return (
    <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-zinc-200 flex flex-col justify-between shrink-0 shadow-sm">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8 animate-fade-in">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 shadow-sm overflow-hidden text-teal-400">
            <Logo className="object-contain w-full h-full p-1" />
          </div>
          <div>
            <h2 className="font-display font-bold text-zinc-900 leading-tight uppercase text-sm tracking-wide">
              Patient Locker
            </h2>
            <p className="font-mono text-[9px] text-teal-650 tracking-wider font-semibold">
              CRYPTOGRAPHIC ID ACTIVE
            </p>
          </div>
        </div>

        <div id="patient-identity-teaser" className="bg-blue-50/60 rounded-xl p-4 border border-blue-200/60 mb-6 flex flex-col">
          <span className="text-[9px] font-mono text-blue-400 uppercase font-semibold">Primacy Owner</span>
          <span className="font-display font-bold text-blue-950 text-sm truncate">{user.name}</span>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[10px] font-mono text-blue-600 font-bold">Vault Connected</span>
          </div>
        </div>

        {/* Nav Tab Options */}
        <nav className="space-y-1">
          <button
            onClick={() => onSelectTab('LOCKER')}
            className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'LOCKER'
                ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
            }`}
          >
            <FileText className="h-4 w-4" /> Secure Records ({filteredRecords.length})
          </button>
          <button
            onClick={() => onSelectTab('DOCTORS')}
            className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'DOCTORS'
                ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Shield className="h-4 w-4" /> Access & Approvals
            </span>
            {filteredRequests.some(r => r.status === 'PENDING') && (
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </button>
          <button
            onClick={() => onSelectTab('NODEMAP')}
            className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'NODEMAP'
                ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
            }`}
          >
            <Network className="h-4 w-4" /> Connection Node Map
          </button>
          <button
            onClick={() => onSelectTab('LEDGER')}
            className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'LEDGER'
                ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
            }`}
          >
            <Radio className="h-4 w-4" /> Logs
          </button>
          <button
            onClick={() => onSelectTab('KEYCARD')}
            className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'KEYCARD'
                ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
            }`}
          >
            <Key className="h-4 w-4" /> Key Card
          </button>
        </nav>
      </div>

      {/* Logout widget */}
      <div className="p-6 border-t border-zinc-200 bg-zinc-50/50">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200/60 bg-red-50/50 hover:bg-red-100/50 text-zinc-900 py-2.5 px-4 text-xs font-mono font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
        >
          <LogOut className="h-4 w-4" /> Shut Private Locker
        </button>
      </div>
    </aside>
  );
}
