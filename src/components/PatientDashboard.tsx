import React, { useState } from 'react';
import { UserProfile, MedicalRecord, AccessRequest, AuditLog } from '../types';
import type { AddLogHandler, PatientTab, UpdateRequestHandler } from './patient/types';
import PatientSidebar from './patient/PatientSidebar';
import RecordsTab from './patient/RecordsTab';
import AccessRequestsTab from './patient/AccessRequestsTab';
import AuditLogTab from './patient/AuditLogTab';
import KeyCardTab from './patient/KeyCardTab';
import NodeMapTab from './patient/NodeMapTab';
import SignConsentPanel from './patient/SignConsentPanel';
import PhotoLightbox from './shared/PhotoLightbox';

interface PatientDashboardProps {
  user: UserProfile;
  records: MedicalRecord[];
  requests: AccessRequest[];
  logs: AuditLog[];
  allUsers: UserProfile[];
  onLogout: () => void;
  onAddRecord: (record: MedicalRecord) => void;
  onUpdateRecord: (record: MedicalRecord) => void;
  onUpdateRequestHandler: UpdateRequestHandler;
  onAddLog: AddLogHandler;
  onSubmitRequest: (request: AccessRequest) => void;
}

/** Patient area: navigation plus one component per tab (see ./patient/). */
export default function PatientDashboard({
  user,
  records,
  requests,
  logs,
  allUsers,
  onLogout,
  onAddRecord,
  onUpdateRecord,
  onUpdateRequestHandler,
  onAddLog,
  onSubmitRequest,
}: PatientDashboardProps) {
  const [activeTab, setActiveTab] = useState<PatientTab>('LOCKER');
  const [selectedZoomPhoto, setSelectedZoomPhoto] = useState<string | null>(null);
  // Request awaiting the patient's signature. Shown above whichever tab triggered it.
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null);

  const selectTab = (tab: PatientTab) => {
    setActiveTab(tab);
    setSigningRequestId(null);
  };

  const handleApproveAccessRequest = (requestId: string) => setSigningRequestId(requestId);
  const handleRevokeDoctorAccess = (req: AccessRequest) => onUpdateRequestHandler(req.id, 'REVOKED');
  const handleSignConfirmed = (requestId: string) => {
    onUpdateRequestHandler(requestId, 'APPROVED');
    setSigningRequestId(null);
  };

  return (
    <div id="patient-dashboard-container" className="min-h-screen bg-[#fafafa] text-zinc-900 flex flex-col md:flex-row font-sans selection:bg-teal-100 selection:text-teal-900">
      <PatientSidebar
        user={user}
        records={records}
        requests={requests}
        activeTab={activeTab}
        onSelectTab={selectTab}
        onLogout={onLogout}
      />

      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto max-w-5xl">
        {signingRequestId && (
          <div className="mb-6">
            <SignConsentPanel
              key={signingRequestId}
              user={user}
              requestId={signingRequestId}
              onConfirm={handleSignConfirmed}
              onCancel={() => setSigningRequestId(null)}
            />
          </div>
        )}

        {activeTab === 'LOCKER' && (
          <RecordsTab
            user={user}
            records={records}
            onAddRecord={onAddRecord}
            onUpdateRecord={onUpdateRecord}
            onAddLog={onAddLog}
            setSelectedZoomPhoto={setSelectedZoomPhoto}
          />
        )}

        {activeTab === 'DOCTORS' && (
          <AccessRequestsTab
            user={user}
            requests={requests}
            onUpdateRequestHandler={onUpdateRequestHandler}
            handleApproveAccessRequest={handleApproveAccessRequest}
            handleRevokeDoctorAccess={handleRevokeDoctorAccess}
          />
        )}

        {activeTab === 'LEDGER' && <AuditLogTab user={user} logs={logs} />}

        {activeTab === 'KEYCARD' && <KeyCardTab user={user} requests={requests} onAddLog={onAddLog} />}

        {activeTab === 'NODEMAP' && (
          <NodeMapTab
            user={user}
            allUsers={allUsers}
            records={records}
            requests={requests}
            onSubmitRequest={onSubmitRequest}
            onUpdateRequestHandler={onUpdateRequestHandler}
            onAddLog={onAddLog}
            handleApproveAccessRequest={handleApproveAccessRequest}
            handleRevokeDoctorAccess={handleRevokeDoctorAccess}
          />
        )}
      </main>

      <PhotoLightbox selectedZoomPhoto={selectedZoomPhoto} setSelectedZoomPhoto={setSelectedZoomPhoto} />
    </div>
  );
}
