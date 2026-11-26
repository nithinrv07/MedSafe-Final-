import React from 'react';
import { FileLock } from 'lucide-react';
import { UserProfile, MedicalRecord, AccessRequest } from '../../types';
import type { AddLogHandler } from './types';
import PrescribeForm from './PrescribeForm';
import GrantCard from './GrantCard';

interface ApprovedVaultsTabProps {
  user: UserProfile;
  records: MedicalRecord[];
  requests: AccessRequest[];
  selectedGrantReq: AccessRequest | null;
  setSelectedGrantReq: (req: AccessRequest | null) => void;
  onAddRecord: (record: MedicalRecord) => void;
  onAddLog: AddLogHandler;
  setSelectedZoomPhoto: (url: string | null) => void;
}

/** "Approved Vaults" tab: patients who granted access, their records, and the prescribe form. */
export default function ApprovedVaultsTab({
  user, records, requests, selectedGrantReq, setSelectedGrantReq, onAddRecord, onAddLog, setSelectedZoomPhoto,
}: ApprovedVaultsTabProps) {
  const filteredRequestsByDoctor = requests.filter(req => req.doctorId === user.id);

  return (
    <div id="doctor-grants-vault-view" className="space-y-6">

      <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
        <h3 className="font-display text-2xl font-bold text-teal-950"> Approved vaults</h3>
        <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
          Patients who have signed consent allow you to translate and view their medical files. You may also execute AI-conflict screens ahead of issuing medicines.
        </p>
      </div>

      {selectedGrantReq && (
        <PrescribeForm
          key={selectedGrantReq.id}
          user={user}
          records={records}
          selectedGrantReq={selectedGrantReq}
          onClose={() => setSelectedGrantReq(null)}
          onAddRecord={onAddRecord}
          onAddLog={onAddLog}
        />
      )}

      {/* Active grants catalog */}
      <div className="space-y-6">
        {filteredRequestsByDoctor.filter(r => r.status === 'APPROVED').length === 0 ? (
          <div className="text-center p-12 border border-dashed border-zinc-250 bg-white rounded-2xl shadow-sm">
            <FileLock className="h-9 w-9 text-zinc-400 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm font-sans font-medium">
              You currently have no active patient vault reading grants. Go directory search to file handshakes.
            </p>
          </div>
        ) : (
          filteredRequestsByDoctor
            .filter(r => r.status === 'APPROVED')
            .map((approveReq) => (
              <GrantCard
                key={approveReq.id}
                approveReq={approveReq}
                records={records}
                user={user}
                onPrescribe={setSelectedGrantReq}
                onAddLog={onAddLog}
                setSelectedZoomPhoto={setSelectedZoomPhoto}
              />
            ))
        )}
      </div>
    </div>
  );
}
