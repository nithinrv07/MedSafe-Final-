import React, { useState } from 'react';
import { Send, Check, X, QrCode, ScanLine } from 'lucide-react';
import { UserProfile, MedicalRecord, AccessRequest, AuditLog } from '../../types';
import type { DoctorTab, AddLogHandler } from './types';
import QRScanner from '../QRScanner';

interface PatientSearchTabProps {
  user: UserProfile;
  allUsers: UserProfile[];
  records: MedicalRecord[];
  requests: AccessRequest[];
  logs: AuditLog[];
  onSubmitRequest: (patientId: string, patientName: string, justification: string) => void;
  onAddLog: AddLogHandler;
  onSelectTab: (tab: DoctorTab) => void;
}

/** Directory search, QR scan and the access-request form. */
export default function PatientSearchTab({ user, allUsers, records, requests, logs, onSubmitRequest, onAddLog, onSelectTab }: PatientSearchTabProps) {
  const filteredRequestsByDoctor = requests.filter(req => req.doctorId === user.id);
  const patientsList = allUsers.filter(u => u.role === 'PATIENT');

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [requestJustification, setRequestJustification] = useState('');
  const [successRequestMessage, setSuccessRequestMessage] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scannedNotification, setScannedNotification] = useState<string | null>(null);

  const handleScanSuccess = (patientId: string, patientName: string) => {
    setSelectedPatientId(patientId);
    setScannedNotification(`Secure Identity verified! Scanned physical credentials for ${patientName} successfully.`);
    onAddLog(
      'QR Code Dossier Scanned',
      'SUCCESS',
      `Scanned physical QR credentials. Identified Primacy Patient: ${patientName} (${patientId}).`
    );
    // Clear notification after 6 seconds
    setTimeout(() => {
      setScannedNotification(null);
    }, 6000);
  };
  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !requestJustification) return;

    const patient = patientsList.find(p => p.id === selectedPatientId);
    if (!patient) return;

    onSubmitRequest(patient.id, patient.name, requestJustification);

    setSuccessRequestMessage(`Your authorization request has been published for ${patient.name}. Direct them to approve using their Primacy Private Key.`);
    setSelectedPatientId('');
    setRequestJustification('');
    setTimeout(() => setSuccessRequestMessage(''), 5000);
  };

  return (
    <>
          <div id="doctor-search-vault-view" className="space-y-6">

            <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
              <h3 className="font-display text-2xl font-bold text-teal-950"> Directory Index</h3>
              <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
                Patient records are fully sealed with non-custodial keys. Input clinician criteria and purpose parameters below to request decryption authorization.
              </p>
            </div>

            {successRequestMessage && (
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-xs font-sans text-teal-850 leading-relaxed shadow-sm">
                {successRequestMessage}
              </div>
            )}

            {scannedNotification && (
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-sans text-indigo-950 flex items-center justify-between shadow-sm animate-fade-in animate-pulse">
                <span className="flex items-center gap-2 font-bold">
                  <Check className="h-4 w-4 text-indigo-650" />
                  {scannedNotification}
                </span>
                <button 
                  onClick={() => setScannedNotification(null)}
                  className="p-1 text-indigo-450 hover:text-indigo-950 text-xs cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Structured File Request Entry Form */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-zinc-100 pb-3">
                <h4 className="font-display font-bold text-zinc-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  <Send className="h-4 w-4 text-indigo-600 animate-pulse" /> Create Security Request
                </h4>
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 py-1.5 px-3 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm self-start sm:self-auto"
                >
                  <QrCode className="h-4 w-4 text-indigo-650" /> Scan Patient QR
                </button>
              </div>

              <form onSubmit={handleRequestSubmit} className="space-y-4 text-xs font-sans">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] font-mono text-zinc-500 uppercase font-semibold">
                        Select Patient Profile on Directory
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowScanner(true)}
                        className="text-[10px] font-mono text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold cursor-pointer hover:underline"
                      >
                        <ScanLine className="h-3 w-3" /> Quick QR Scanner
                      </button>
                    </div>
                    <select
                      required
                      value={selectedPatientId}
                      onChange={(e) => setSelectedPatientId(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2.5 px-3.5 text-zinc-900 focus:outline-none focus:border-zinc-400 transition-all cursor-pointer h-[42px] font-medium"
                    >
                      <option value="">-- Choose Sandbox Patient on Ledger --</option>
                      {patientsList.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">
                      Clinician Access Periodicity
                    </label>
                    <div className="p-2.5 bg-zinc-55 border border-zinc-200 rounded-xl font-mono text-[10px] text-indigo-700 bg-zinc-50 flex items-center justify-between font-bold h-[42px]">
                      <span>SINGLE REVIEW EVALUATION SESSION</span>
                      <span>MAX 24 HOURS VALIDITY</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">
                    Clinical Motive
                  </label>
                  <textarea
                    required
                    value={requestJustification}
                    onChange={(e) => setRequestJustification(e.target.value)}
                    placeholder="e.g. Evaluating past ECG logs and prescription conflicts ahead of prescribing lipid therapeutics."
                    rows={3}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2.5 px-3 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 hover:bg-white transition-all leading-relaxed"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                >
                  Publish Authorization Request to Patient Ledger
                </button>
              </form>
            </div>

            {/* List of outstanding requests filed by this Doctor */}
            <div className="space-y-4">
              <h4 className="font-display font-bold text-zinc-900 text-xs uppercase tracking-wider">
                My Requests
              </h4>

              {filteredRequestsByDoctor.length === 0 ? (
                <div className="text-center p-8 border border-dashed border-zinc-200 bg-white rounded-2xl text-xs text-zinc-400 font-sans shadow-sm">
                  No previous ledger have been registered by your clinical license.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRequestsByDoctor.map((req) => {
                    return (
                      <div
                        key={req.id}
                        className="bg-white border border-zinc-200 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs font-mono shadow-sm"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-sans font-bold text-zinc-900 text-sm">
                              {req.patientName}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              Filed: {new Date(req.requestedAt).toLocaleDateString()}
                            </span>
                          </div>

                          <p className="text-zinc-650 font-sans text-xs mt-1 leading-relaxed">
                            "{req.requestedPurpose}"
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {req.status === 'PENDING' && (
                            <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-250 text-[10px] font-bold">
                              ⏳ WAITING PATIENT KEY SIGN
                            </span>
                          )}
                          {req.status === 'APPROVED' && (
                            <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-850 border border-emerald-200 text-[10px] font-bold">
                              ✓ KEY DECRYPT APPROVED
                            </span>
                          )}
                          {req.status === 'REJECTED' && (
                            <span className="px-2.5 py-1 rounded bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
                              ✕ ACCESS REJECTED
                            </span>
                          )}
                          {req.status === 'REVOKED' && (
                            <span className="px-2.5 py-1 rounded bg-zinc-100 text-zinc-550 border border-zinc-200 text-[10px] font-bold">
                              🛑 ACCESS REVOKED
                            </span>
                          )}

                          {req.status === 'APPROVED' && (
                            <button
                              onClick={() => onSelectTab('ACTIVE_GRANTS')}
                              className="py-1.5 px-3 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-sans font-bold cursor-pointer transition-all border border-zinc-850 text-[10.5px] shadow-sm"
                            >
                             Vault Records →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
      {showScanner && (
        <QRScanner
          allUsers={allUsers}
          onScanSuccess={handleScanSuccess}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
