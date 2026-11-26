import React from 'react';
import { UserProfile, AuditLog } from '../../types';

interface AuditLogTabProps {
  user: UserProfile;
  logs: AuditLog[];
}

/** "Logs" tab: audit entries that concern this patient. */
export default function AuditLogTab({ user, logs }: AuditLogTabProps) {
  const filteredLogs = logs.filter(log => {
    const isActor = log.actorName === user.name;
    const detailsLower = log.details ? log.details.toLowerCase() : '';
    const actionLower = log.action ? log.action.toLowerCase() : '';
    const userNameLower = user.name ? user.name.toLowerCase() : '';
    const userEmailLower = user.email ? user.email.toLowerCase() : '';
    const userIdLower = user.id ? user.id.toLowerCase() : '';

    const isMentioned = 
      (userNameLower && (detailsLower.includes(userNameLower) || actionLower.includes(userNameLower))) ||
      (userEmailLower && (detailsLower.includes(userEmailLower) || actionLower.includes(userEmailLower))) ||
      (userIdLower && (detailsLower.includes(userIdLower) || actionLower.includes(userIdLower)));

    return isActor || isMentioned;
  });

  return (
    <div id="patient-ledger-view" className="space-y-6 bg-blue-50/30 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-blue-100/50 shadow-sm">

      {/* Header control */}
      <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
        <h3 className="font-display text-2xl font-bold text-teal-950">Immutable Ledger Audit Trail</h3>
        <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
          A system sequence containing cryptographically secure handshakes, decryption approvals, and record modifications. Fully immutable ledger representation.
        </p>
      </div>

      <div className="space-y-4">
        {filteredLogs.map((log) => {
          return (
            <div
              key={log.id}
              className="p-5 rounded-2xl bg-white border border-zinc-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 font-mono text-xs shadow-sm hover:border-zinc-250 transition-all"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                    log.status === 'SUCCESS' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-250' 
                      : log.status === 'ALERT'
                        ? 'bg-red-50 text-red-650 border border-red-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-250'
                  }`}>
                    {log.action}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>

                <p className="text-zinc-700 font-sans text-xs leading-relaxed max-w-xl">
                  {log.details}
                </p>

                <div className="text-[10px] text-zinc-400">
                  Handshake actor: <span className="text-zinc-600 font-semibold">{log.actorName}</span> ({log.actorRole})
                </div>
              </div>

              <div className="text-left md:text-right shrink-0">
                <span className="text-[9px] text-zinc-400 block uppercase font-bold">Ledger Block Hash</span>
                <span className="text-indigo-700 font-bold select-all font-mono text-xs">
                  {log.hash}
                </span>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
