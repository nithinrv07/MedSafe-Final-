import React, { useState } from 'react';
import { UserProfile, AccessRequest } from '../../types';

interface NodeMapCanvasProps {
  user: UserProfile;
  allUsers: UserProfile[];
  requests: AccessRequest[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

/** SVG graph: the patient in the centre, connected doctors around them, coloured by access status. */
export default function NodeMapCanvas({ user, allUsers, requests, selectedNodeId, onSelectNode }: NodeMapCanvasProps) {
  const filteredRequests = requests.filter(req => req.patientId === user.id);

  const [showAllDirectoryNodes, setShowAllDirectoryNodes] = useState(false);

  return (
    <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-3xl p-4 shadow-sm overflow-hidden flex flex-col items-center justify-center relative min-h-[460px]">
      {/* Legend Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-zinc-50/90 border border-zinc-200/60 rounded-xl p-2.5 space-y-1.5 text-[10px] font-mono text-zinc-500 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-500 shadow-inner" />
          <span className="font-semibold text-zinc-700">Approved (Decryption Sync)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-inner" />
          <span className="font-semibold text-zinc-700">Pending Consent Authorization</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-400 shadow-inner" />
          <span className="font-semibold text-zinc-700">Revoked / Disconnected</span>
        </div>
      </div>

      {/* SVG canvas */}
      {(() => {
        // Core Node positions setup
        const cx = 220;
        const cy = 200;
        const R = 120;

        // Find unique connections
        const doctorConnections: Record<string, {
          doctorId: string;
          doctorName: string;
          doctorSpecialty: string;
          status: 'APPROVED' | 'PENDING' | 'REVOKED' | 'REJECTED' | 'DISCONNECTED';
          request?: AccessRequest;
          email: string;
        }> = {};

        filteredRequests.forEach(req => {
          const existing = doctorConnections[req.doctorId];
          if (!existing) {
            const docProfile = allUsers.find(u => u.id === req.doctorId);
            doctorConnections[req.doctorId] = {
              doctorId: req.doctorId,
              doctorName: req.doctorName,
              doctorSpecialty: req.doctorSpecialty,
              status: req.status,
              request: req,
              email: docProfile?.email || ''
            };
          } else {
            const isMoreActive = 
              (req.status === 'APPROVED') ||
              (req.status === 'PENDING' && existing.status !== 'APPROVED');

            if (isMoreActive) {
              doctorConnections[req.doctorId] = {
                ...existing,
                status: req.status,
                request: req
              };
            }
          }
        });

        // Add other doctors from directory
        allUsers.filter(u => u.role === 'DOCTOR').forEach(doc => {
          if (!doctorConnections[doc.id]) {
            doctorConnections[doc.id] = {
              doctorId: doc.id,
              doctorName: doc.name,
              doctorSpecialty: doc.specialty || 'General Practitioner',
              status: 'DISCONNECTED',
              email: doc.email
            };
          }
        });

        const nodesToShow = Object.values(doctorConnections).filter(
          d => d.status !== 'DISCONNECTED' || showAllDirectoryNodes
        );

        return (
          <>
            <div className="absolute top-4 right-4 z-10">
              <label className="flex items-center gap-2 text-[10px] font-mono font-bold text-zinc-500 cursor-pointer bg-zinc-50/90 border border-zinc-200/60 rounded-xl p-2 select-none hover:bg-zinc-150 transition-colors shadow-sm">
                <input 
                  type="checkbox" 
                  checked={showAllDirectoryNodes} 
                  onChange={(e) => setShowAllDirectoryNodes(e.target.checked)}
                  className="rounded text-teal-650 focus:ring-teal-500 h-3.5 w-3.5 cursor-pointer"
                />
                Show Directory Registry
              </label>
            </div>

            <svg width="440" height="380" className="w-full max-w-[440px] h-[380px] select-none overflow-visible">
              {/* Define gradients for animations */}
              <defs>
                <radialGradient id="patientGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
                </radialGradient>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.1" />
                </filter>
              </defs>

              {/* RENDER EDGES FIRST (so nodes sit on top) */}
              {nodesToShow.map((node, index) => {
                const theta = (index * 2 * Math.PI / nodesToShow.length) - Math.PI / 2;
                const x = cx + R * Math.cos(theta);
                const y = cy + R * Math.sin(theta);

                // Edge visual depending on status
                if (node.status === 'APPROVED') {
                  return (
                    <g key={`edge-${node.doctorId}`}>
                      {/* Glowing outer beam */}
                      <line x1={cx} y1={cy} x2={x} y2={y} stroke="#2dd4bf" strokeWidth="6" strokeOpacity="0.15" strokeLinecap="round" />
                      {/* Solid teal path */}
                      <line x1={cx} y1={cy} x2={x} y2={y} stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" />
                      {/* Streaming particles */}
                      <circle r="4" fill="#5eead4">
                        <animate attributeName="cx" from={cx} to={x} dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="cy" from={cy} to={y} dur="1.8s" repeatCount="indefinite" />
                      </circle>
                      <circle r="3" fill="#ffffff">
                        <animate attributeName="cx" from={cx} to={x} dur="1.8s" begin="0.6s" repeatCount="indefinite" />
                        <animate attributeName="cy" from={cy} to={y} dur="1.8s" begin="0.6s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  );
                } else if (node.status === 'PENDING') {
                  return (
                    <g key={`edge-${node.doctorId}`}>
                      {/* Dashed amber path */}
                      <line 
                        x1={cx} y1={cy} x2={x} y2={y} 
                        stroke="#f59e0b" strokeWidth="2" 
                        strokeDasharray="6, 4" 
                        strokeLinecap="round"
                      />
                      {/* Pulsing amber particle */}
                      <circle r="4.5" fill="#fbbf24">
                        <animate attributeName="cx" from={cx} to={x} dur="2.8s" repeatCount="indefinite" />
                        <animate attributeName="cy" from={cy} to={y} dur="2.8s" repeatCount="indefinite" />
                        <animate attributeName="r" values="3.5;5.5;3.5" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  );
                } else {
                  // Revoked / disconnected
                  return (
                    <line 
                      key={`edge-${node.doctorId}`}
                      x1={cx} y1={cy} x2={x} y2={y} 
                      stroke="#cbd5e1" strokeWidth="1.5" 
                      strokeDasharray="3, 5" 
                      strokeLinecap="round" 
                    />
                  );
                }
              })}

              {/* RENDER CLINICIAN NODES */}
              {nodesToShow.map((node, index) => {
                const theta = (index * 2 * Math.PI / nodesToShow.length) - Math.PI / 2;
                const x = cx + R * Math.cos(theta);
                const y = cy + R * Math.sin(theta);
                const isSelected = selectedNodeId === node.doctorId;

                // Style states based on status
                let ringColor = 'stroke-zinc-200';
                let bgColor = 'fill-white';
                let initialsColor = 'fill-zinc-800';

                if (node.status === 'APPROVED') {
                  ringColor = isSelected ? 'stroke-teal-600 stroke-[3.5]' : 'stroke-teal-500';
                  bgColor = 'fill-teal-50/95';
                  initialsColor = 'fill-teal-900';
                } else if (node.status === 'PENDING') {
                  ringColor = isSelected ? 'stroke-amber-600 stroke-[3.5]' : 'stroke-amber-500';
                  bgColor = 'fill-amber-50/95';
                  initialsColor = 'fill-amber-900';
                } else if (node.status === 'REVOKED' || node.status === 'REJECTED') {
                  ringColor = isSelected ? 'stroke-red-500 stroke-[3.5]' : 'stroke-red-200';
                  bgColor = 'fill-red-50/40';
                  initialsColor = 'fill-red-800';
                } else {
                  ringColor = isSelected ? 'stroke-zinc-500 stroke-[3.5]' : 'stroke-zinc-300 stroke-dasharray-[3,3]';
                  bgColor = 'fill-zinc-50/50';
                  initialsColor = 'fill-zinc-500';
                }

                const initials = node.doctorName
                  .split(' ')
                  .filter(w => w !== 'Dr.' && w !== 'Dr')
                  .map(w => w[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase();

                return (
                  <g 
                    key={`node-${node.doctorId}`}
                    className="cursor-pointer group/node"
                    onClick={() => onSelectNode(node.doctorId)}
                  >
                    {/* Hover glow aura */}
                    <circle 
                      cx={x} cy={y} r="28" 
                      className="fill-transparent group-hover/node:fill-zinc-100/50 transition-all duration-300"
                    />

                    {/* Node Circle */}
                    <circle 
                      cx={x} cy={y} r="20" 
                      className={`${bgColor} ${ringColor} stroke-[2] transition-all`}
                      filter="url(#shadow)"
                    />

                    {/* Initials Text */}
                    <text 
                      x={x} y={y + 3.5} 
                      textAnchor="middle" 
                      className={`text-[10px] font-mono font-bold ${initialsColor}`}
                    >
                      {initials || 'DR'}
                    </text>

                    {/* Small status overlay icon badge */}
                    {node.status === 'APPROVED' && (
                      <g transform={`translate(${x + 10}, ${y - 15})`}>
                        <circle r="5" fill="#0d9488" />
                        <path d="M-2.5,-0.5 L-0.5,1.5 L2.5,-1.5" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}
                    {node.status === 'PENDING' && (
                      <g transform={`translate(${x + 10}, ${y - 15})`}>
                        <circle r="5" fill="#f59e0b" />
                        <circle r="3" fill="none" stroke="#ffffff" strokeWidth="0.8" />
                        <line x1="0" y1="-1.5" x2="0" y2="0" stroke="#ffffff" strokeWidth="0.8" />
                        <line x1="0" y1="0" x2="1.5" y2="0" stroke="#ffffff" strokeWidth="0.8" />
                      </g>
                    )}
                    {(node.status === 'REVOKED' || node.status === 'REJECTED') && (
                      <g transform={`translate(${x + 10}, ${y - 15})`}>
                        <circle r="5" fill="#ef4444" />
                        <line x1="-1.5" y1="-1.5" x2="1.5" y2="1.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
                        <line x1="1.5" y1="-1.5" x2="-1.5" y2="1.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
                      </g>
                    )}

                    {/* Text label below */}
                    <text 
                      x={x} y={y + 32} 
                      textAnchor="middle" 
                      className={`text-[9px] font-sans font-bold ${isSelected ? 'fill-teal-950 font-extrabold scale-103' : 'fill-zinc-800'}`}
                    >
                      {node.doctorName.replace('Dr. ', '')}
                    </text>
                    <text 
                      x={x} y={y + 41} 
                      textAnchor="middle" 
                      className="text-[7.5px] font-mono fill-zinc-400"
                    >
                      {node.doctorSpecialty}
                    </text>
                  </g>
                );
              })}

              {/* PULSING PATIENT CENTRAL NODE */}
              {/* Concentric expanding ripples */}
              <circle cx={cx} cy={cy} r="38" fill="none" stroke="#0d9488" strokeWidth="1.5" opacity="0.3">
                <animate attributeName="r" values="28;44;28" dur="2.5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="2.5s" repeatCount="indefinite" />
              </circle>
              <circle cx={cx} cy={cy} r="30" fill="url(#patientGlow)" />
              <circle 
                cx={cx} cy={cy} r="26" 
                fill="#0f172a" 
                stroke="#2dd4bf" 
                strokeWidth="3" 
                filter="url(#shadow)"
                className="cursor-pointer"
                onClick={() => onSelectNode('patient')}
              />
              <text 
                x={cx} y={cy + 4} 
                textAnchor="middle" 
                fill="#2dd4bf" 
                className="text-[11px] font-mono font-bold tracking-wider cursor-pointer"
                onClick={() => onSelectNode('patient')}
              >
                {user.name.split(' ').map(w => w[0]).join('').toUpperCase()}
              </text>
              <text 
                x={cx} y={cy + 38} 
                textAnchor="middle" 
                fill="#0f172a" 
                className="text-[9px] font-sans font-bold uppercase tracking-wider"
              >
                Vault Owner
              </text>
            </svg>
          </>
        );
      })()}
    </div>
  );
}
