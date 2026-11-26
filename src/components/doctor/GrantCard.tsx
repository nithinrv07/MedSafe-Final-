import React from 'react';
import { Unlock } from 'lucide-react';
import { UserProfile, MedicalRecord, AccessRequest } from '../../types';
import type { AddLogHandler } from './types';
import DoctorRecordItem from './DoctorRecordItem';

interface GrantCardProps {
  approveReq: AccessRequest;
  records: MedicalRecord[];
  user: UserProfile;
  onPrescribe: (req: AccessRequest) => void;
  onAddLog: AddLogHandler;
  setSelectedZoomPhoto: (url: string | null) => void;
}

/** One approved patient vault: patient name, "prescribe" button and that patient's records. */
export default function GrantCard({ approveReq, records, user, onPrescribe, onAddLog, setSelectedZoomPhoto }: GrantCardProps) {
  const patientRecords = records.filter(rec => rec.patientId === approveReq.patientId);

  return (
    <div
      className="border border-zinc-200 bg-white rounded-2xl p-6 space-y-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-150 pb-3">
        <div>
          <span className="text-[9px] font-mono text-emerald-700 flex items-center gap-1 font-bold uppercase">
            <Unlock className="h-3.5 w-3.5 text-emerald-600" /> Signed Read Grant Verified
          </span>
          <h4 className="font-display font-bold text-zinc-900 text-base md:text-lg">
            {approveReq.patientName}
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPrescribe(approveReq)}
            className="py-1.5 px-3.5 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-mono font-bold text-xs cursor-pointer transition-all flex items-center gap-1 shadow-sm"
          >
            + Prescribe Substance
          </button>
        </div>
      </div>

      {/* List of their records */}
      <div className="space-y-4">
        {patientRecords.length === 0 ? (
          <p className="text-xs text-zinc-450 font-sans italic">Patient has no initial ledger records uploaded.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {patientRecords.map((rec) => (
              <DoctorRecordItem
                key={rec.id}
                rec={rec}
                approveReq={approveReq}
                user={user}
                onAddLog={onAddLog}
                setSelectedZoomPhoto={setSelectedZoomPhoto}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
