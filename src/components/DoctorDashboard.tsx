import React, { useState } from 'react';
import { UserProfile, MedicalRecord, AccessRequest, AuditLog } from '../types';
import type { AddLogHandler, DoctorTab } from './doctor/types';
import DoctorSidebar from './doctor/DoctorSidebar';
import PatientSearchTab from './doctor/PatientSearchTab';
import ApprovedVaultsTab from './doctor/ApprovedVaultsTab';
import DoctorLogsTab from './doctor/DoctorLogsTab';
import PhotoLightbox from './shared/PhotoLightbox';

interface DoctorDashboardProps {
  user: UserProfile;
  records: MedicalRecord[];
  requests: AccessRequest[];
  logs: AuditLog[];
  allUsers: UserProfile[];
  onLogout: () => void;
  onSubmitRequest: (patientId: string, patientName: string, justification: string) => void;
  onAddRecord: (record: MedicalRecord) => void;
  onAddLog: AddLogHandler;
  onRevokeAccessDirectly: (requestId: string) => void;
}

/** Clinician area: navigation plus one component per tab (see ./doctor/). */
export default function DoctorDashboard({
  user,
  records,
  requests,
  logs,
  allUsers,
  onLogout,
  onSubmitRequest,
  onAddRecord,
  onAddLog,
}: DoctorDashboardProps) {
  const [activeTab, setActiveTab] = useState<DoctorTab>('PATIENTS_SEARCH');
  // Approved request the doctor is currently adding a record for.
  const [selectedGrantReq, setSelectedGrantReq] = useState<AccessRequest | null>(null);
  const [selectedZoomPhoto, setSelectedZoomPhoto] = useState<string | null>(null);

  const selectTab = (tab: DoctorTab) => {
    setActiveTab(tab);
    setSelectedGrantReq(null);
  };

  return (
    <div id="doctor-dashboard-container" className="min-h-screen bg-[#fafafa] text-zinc-900 flex flex-col md:flex-row font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <DoctorSidebar user={user} requests={requests} activeTab={activeTab} onSelectTab={selectTab} onLogout={onLogout} />

      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto max-w-5xl">
        {activeTab === 'PATIENTS_SEARCH' && (
          <PatientSearchTab
            user={user}
            allUsers={allUsers}
            records={records}
            requests={requests}
            logs={logs}
            onSubmitRequest={onSubmitRequest}
            onAddLog={onAddLog}
            onSelectTab={selectTab}
          />
        )}

        {activeTab === 'ACTIVE_GRANTS' && (
          <ApprovedVaultsTab
            user={user}
            records={records}
            requests={requests}
            selectedGrantReq={selectedGrantReq}
            setSelectedGrantReq={setSelectedGrantReq}
            onAddRecord={onAddRecord}
            onAddLog={onAddLog}
            setSelectedZoomPhoto={setSelectedZoomPhoto}
          />
        )}

        {activeTab === 'RECENT_LOGS' && <DoctorLogsTab user={user} logs={logs} />}
      </main>

      <PhotoLightbox selectedZoomPhoto={selectedZoomPhoto} setSelectedZoomPhoto={setSelectedZoomPhoto} />
    </div>
  );
}
