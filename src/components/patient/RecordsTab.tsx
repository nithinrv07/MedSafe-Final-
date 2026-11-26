import React, { useState } from 'react';
import { Plus, Database } from 'lucide-react';
import { UserProfile, MedicalRecord } from '../../types';
import type { AddLogHandler } from './types';
import AddRecordForm from './AddRecordForm';
import RecordCard from './RecordCard';

interface RecordsTabProps {
  user: UserProfile;
  records: MedicalRecord[];
  onAddRecord: (record: MedicalRecord) => void;
  onUpdateRecord: (record: MedicalRecord) => void;
  onAddLog: AddLogHandler;
  setSelectedZoomPhoto: (url: string | null) => void;
}

/** "Secure Records" tab: header, add-record form and the list of records. */
export default function RecordsTab({ user, records, onAddRecord, onUpdateRecord, onAddLog, setSelectedZoomPhoto }: RecordsTabProps) {
  const filteredRecords = records.filter(rec => rec.patientId === user.id);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div id="patient-locker-view" className="space-y-6 bg-blue-50/30 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-blue-100/50 shadow-sm">

      {/* Header control */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
        <div>
          <h3 className="font-display text-2xl font-bold text-teal-950">Primacy Medical Records</h3>
          <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
            Every document shown is encrypted locally prior to cloud transit. Only owners with Private Key credentials can unlock payloads.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-bold px-4.5 py-2.5 text-xs tracking-wide transition-all shadow-sm cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Add Record
        </button>
      </div>

      <AddRecordForm
        user={user}
        showAddForm={showAddForm}
        setShowAddForm={setShowAddForm}
        onAddRecord={onAddRecord}
        onAddLog={onAddLog}
      />

      {/* List of active records */}
      <div className="space-y-4">
        {filteredRecords.length === 0 ? (
          <div className="text-center p-12 border border-dashed border-zinc-250 rounded-2xl bg-white shadow-sm">
            <Database className="h-9 w-9 text-zinc-400 mx-auto mb-3" />
            <p className="text-zinc-500 font-sans font-medium text-xs md:text-sm">No primacy patient records found. Create one now!</p>
          </div>
        ) : (
          filteredRecords.map((rec) => (
            <RecordCard
              key={rec.id}
              rec={rec}
              user={user}
              onUpdateRecord={onUpdateRecord}
              onAddLog={onAddLog}
              setSelectedZoomPhoto={setSelectedZoomPhoto}
            />
          ))
        )}
      </div>
    </div>
  );
}
