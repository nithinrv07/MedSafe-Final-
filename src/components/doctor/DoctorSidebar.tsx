import React from 'react';
import { Search, FileLock, LogOut, Radio } from 'lucide-react';
import { UserProfile, AccessRequest } from '../../types';
import type { DoctorTab } from './types';
import Logo from '../Logo';

interface DoctorSidebarProps {
  user: UserProfile;
  requests: AccessRequest[];
  activeTab: DoctorTab;
  onSelectTab: (tab: DoctorTab) => void;
  onLogout: () => void;
}

/** Left navigation column for clinicians. */
export default function DoctorSidebar({ user, requests, activeTab, onSelectTab, onLogout }: DoctorSidebarProps) {
  const filteredRequestsByDoctor = requests.filter(req => req.doctorId === user.id);

  return (
    <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-zinc-200 flex flex-col justify-between shrink-0 shadow-sm">
      <div className="p-6">

        <div className="flex items-center gap-2 mb-8 animate-fade-in">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 shadow-sm overflow-hidden text-teal-400">
            <Logo className="object-contain w-full h-full p-1" />
          </div>
          <div>
            <h2 className="font-display font-bold text-zinc-900 leading-tight uppercase text-sm tracking-wide">
              Clinician Portal
            </h2>
            <p className="font-mono text-[9px] text-indigo-600 tracking-wider font-semibold">
              LICENSE VERIFIED
            </p>
          </div>
        </div>

        <div id="doctor-identity-teaser" className="bg-blue-50/60 rounded-xl p-4 border border-blue-200/60 mb-6 flex flex-col gap-0.5">
          <span className="text-[9px] font-mono text-blue-400 uppercase font-bold">Licensed Provider</span>
          <span className="font-display font-bold text-blue-950 text-xs truncate">{user.name}</span>
          <span className="text-[10px] text-blue-700 font-sans mt-0.5 font-semibold">{user.specialty}</span>
          <span className="text-[9px] font-mono text-blue-500 mt-1">{user.licenceNumber}</span>
        </div>

        <nav className="space-y-1">
          <button
            onClick={() => onSelectTab('PATIENTS_SEARCH')}
            className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'PATIENTS_SEARCH'
                ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
            }`}
          >
            <Search className="h-4 w-4" /> Global Directory Search
          </button>
          <button
            onClick={() => onSelectTab('ACTIVE_GRANTS')}
            className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center justify-between transition-all cursor-pointer ${
              activeTab === 'ACTIVE_GRANTS'
                ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <FileLock className="h-4 w-4" /> Approved Vaults
            </span>
            {filteredRequestsByDoctor.some(r => r.status === 'APPROVED') && (
              <span className="px-2 py-0.5 text-[8px] font-bold bg-zinc-900 text-white rounded font-mono">
                {filteredRequestsByDoctor.filter(r => r.status === 'APPROVED').length}
              </span>
            )}
          </button>
          <button
            onClick={() => onSelectTab('RECENT_LOGS')}
            className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
              activeTab === 'RECENT_LOGS'
                ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
            }`}
          >
            <Radio className="h-4 w-4" />Interaction Log
          </button>
        </nav>

      </div>

      {/* Exit portal */}
      <div className="p-6 border-t border-zinc-200 bg-zinc-50/50">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200/60 bg-red-50/50 hover:bg-red-100/50 text-zinc-900 py-2.5 px-4 text-xs font-mono font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
        >
          <LogOut className="h-4 w-4" /> Lock Clinician Key
        </button>
      </div>
    </aside>
  );
}
