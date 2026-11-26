import React, { useState } from 'react';
import { UserProfile, MedicalRecord, AccessRequest } from '../../types';
import type { AddLogHandler, UpdateRequestHandler } from './types';
import NodeMapCanvas from './NodeMapCanvas';
import NodeDetailPanel from './NodeDetailPanel';
import DoctorDirectory from './DoctorDirectory';

interface NodeMapTabProps {
  user: UserProfile;
  allUsers: UserProfile[];
  records: MedicalRecord[];
  requests: AccessRequest[];
  onSubmitRequest: (request: AccessRequest) => void;
  onUpdateRequestHandler: UpdateRequestHandler;
  onAddLog: AddLogHandler;
  handleApproveAccessRequest: (requestId: string) => void;
  handleRevokeDoctorAccess: (req: AccessRequest) => void;
}

/** "Connection Node Map" tab: graph on the left, details for the selected node on the right. */
export default function NodeMapTab(props: NodeMapTabProps) {
  const { user, allUsers, requests } = props;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <div id="patient-nodemap-view" className="space-y-6 bg-blue-50/30 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-blue-100/50 shadow-sm animate-fade-in">
      {/* Header control */}
      <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="font-display text-2xl font-bold text-teal-950">Secure Connection Node Map</h3>
          <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
            Visualize and manage your real-time secure ledger connections to clinicians and hospitals. Streaming lines represent verified cryptographic read paths.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white/80 border border-teal-100 px-3 py-1.5 rounded-xl text-xs font-mono font-medium shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-500 animate-pulse" />
          <span>Map Sync Active</span>
        </div>
      </div>

      {/* SVG Visualizer and Info Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        <NodeMapCanvas
          user={user}
          allUsers={allUsers}
          requests={requests}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />

        {/* Keyed by node so the pre-authorize form starts fresh for each doctor. */}
        <NodeDetailPanel
          key={selectedNodeId ?? 'none'}
          {...props}
          selectedNodeId={selectedNodeId}
        />
      </div>

      <DoctorDirectory user={user} allUsers={allUsers} requests={requests} onSelectNode={setSelectedNodeId} />
    </div>
  );
}
