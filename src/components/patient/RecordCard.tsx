import React, { useState } from 'react';
import { Lock, Check, AlertTriangle, Image, ZoomIn } from 'lucide-react';
import { UserProfile, MedicalRecord } from '../../types';
import type { AddLogHandler } from './types';
import { checkDrugInteractions } from '../../utils/drugInteractions';

interface RecordCardProps {
  rec: MedicalRecord;
  user: UserProfile;
  onUpdateRecord: (record: MedicalRecord) => void;
  onAddLog: AddLogHandler;
  setSelectedZoomPhoto: (url: string | null) => void;
}

/** One record in the vault: ciphertext summary, decrypted view, edit form and interaction check. */
export default function RecordCard({ rec, user, onUpdateRecord, onAddLog, setSelectedZoomPhoto }: RecordCardProps) {
  // Local decryptions triggers for patient's own vault
  const [decryptedRecordIds, setDecryptedRecordIds] = useState<Record<string, string>>({});
  const [decryptionError, setDecryptionError] = useState<Record<string, string>>({});
  const [recordKeyInputs, setRecordKeyInputs] = useState<Record<string, string>>({});
  const [showingKeyInputIds, setShowingKeyInputIds] = useState<Record<string, boolean>>({});

  // Editing state controls for decrypted records
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCategory, setEditingCategory] = useState<'Prescription' | 'Lab Report' | 'Diagnosis' | 'Immunization'>('Prescription');
  const [editingDoctorName, setEditingDoctorName] = useState('');
  const [editingDetails, setEditingDetails] = useState('');
  const [editingDrugs, setEditingDrugs] = useState('');
  const handleDecryptSelfRecord = (rec: MedicalRecord, passedKey?: string) => {
    const finalKey = passedKey ? passedKey.trim() : '';
    if (!finalKey) {
      setDecryptionError({
        ...decryptionError,
        [rec.id]: 'Private key block is required.'
      });
      return;
    }

    if (!user.privateKey || finalKey !== user.privateKey.trim()) {
      setDecryptionError({
        ...decryptionError,
        [rec.id]: 'This private key does not match your account.'
      });
      return;
    }

    try {
      // Records are decrypted with AES-GCM in App as soon as the vault is unlocked.
      if (rec.locked) throw new Error('This record could not be decrypted with your key.');
      const decodedPlain = rec.details;
      setDecryptedRecordIds({
        ...decryptedRecordIds,
        [rec.id]: decodedPlain,
      });

      // Clear any past error on success
      const errs = { ...decryptionError };
      delete errs[rec.id];
      setDecryptionError(errs);

    } catch (err: any) {
      setDecryptionError({
        ...decryptionError,
        [rec.id]: err.message || 'Validation Failure: Cryptographic mismatch.'
      });
    }
  };

  const handleCloseDecryptedRecord = (recId: string) => {
    const updated = { ...decryptedRecordIds };
    delete updated[recId];
    setDecryptedRecordIds(updated);
    if (editingRecordId === recId) {
      setEditingRecordId(null);
    }
  };

  const handleUpdateRecordSubmit = (rec: MedicalRecord) => {
    if (!editingTitle || !editingDetails) return;

    const updatedMedicines = editingDrugs
      ? editingDrugs.split(',').map(m => m.trim()).filter(Boolean)
      : [];

    const updatedRecord: MedicalRecord = {
      ...rec,
      title: editingTitle,
      category: editingCategory,
      doctorName: editingDoctorName || 'Self Uploaded',
      details: editingDetails,
      medicines: updatedMedicines,
    };

    setDecryptedRecordIds({
      ...decryptedRecordIds,
      [rec.id]: editingDetails,
    });

    onUpdateRecord(updatedRecord);


    setEditingRecordId(null);
  };

  return (
    <div
      className="bg-white border border-zinc-200 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-start gap-6 shadow-sm hover:border-zinc-300 transition-all"
    >
      <div className="space-y-4 max-w-xl flex-1">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="px-2.5 py-1 text-[9px] font-mono rounded bg-teal-50 text-teal-700 border border-teal-200/50 font-bold uppercase">
              {rec.category}
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              Issued: {rec.date} by {rec.doctorName}
            </span>
          </div>
          <h4 className="font-display font-bold text-zinc-900 text-base md:text-lg">
            {rec.title}
          </h4>
        </div>

        {/* Cipher text block */}
        <div className="bg-zinc-50 p-3 py-2.5 rounded-xl border border-zinc-200/80">
          <span className="text-[10px] font-mono text-teal-700 flex items-center gap-1.5 mb-1 uppercase font-bold">
            <Lock className="h-3 w-3" /> Encrypted Cyphertext Block
          </span>
          <p className="font-mono text-[10px] text-zinc-500 truncate tracking-tight break-all select-all">
            {rec.encryptedContent}
          </p>
        </div>
        {/* Decrypted payload or locker */}
        {decryptedRecordIds[rec.id] ? (
          <div className="space-y-4 pt-1 animate-fade-in text-xs">
            {editingRecordId === rec.id ? (
              <div className="space-y-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
                <span className="text-[9px] font-mono text-zinc-500 uppercase font-bold tracking-wider block mb-1">Edit Record Parameters</span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[8px] font-mono text-zinc-400 uppercase font-bold mb-1">Record Title</label>
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="w-full bg-white border border-zinc-250 rounded-lg p-1.5 text-[11px] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-mono text-zinc-400 uppercase font-bold mb-1">Category Type</label>
                    <select
                      value={editingCategory}
                      onChange={(e) => setEditingCategory(e.target.value as any)}
                      className="w-full bg-white border border-zinc-250 rounded-lg p-1.5 text-[11px] focus:outline-none h-[29px]"
                    >
                      <option value="Prescription">Prescription</option>
                      <option value="Lab Report">Lab Report</option>
                      <option value="Diagnosis">Diagnosis</option>
                      <option value="Immunization">Immunization</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[8px] font-mono text-zinc-400 uppercase font-bold mb-1">Issuing Physician</label>
                    <input
                      type="text"
                      value={editingDoctorName}
                      onChange={(e) => setEditingDoctorName(e.target.value)}
                      className="w-full bg-white border border-zinc-250 rounded-lg p-1.5 text-[11px] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[8px] font-mono text-zinc-400 uppercase font-bold mb-1">Plaintext Medical Narrative</label>
                  <textarea
                    value={editingDetails}
                    onChange={(e) => setEditingDetails(e.target.value)}
                    rows={3}
                    className="w-full bg-white border border-zinc-250 rounded-lg p-1.5 text-[11px] focus:outline-none leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-mono text-zinc-400 uppercase font-bold mb-1">Medicines (Comma-separated)</label>
                  <input
                    type="text"
                    value={editingDrugs}
                    onChange={(e) => setEditingDrugs(e.target.value)}
                    className="w-full bg-white border border-zinc-250 rounded-lg p-1.5 text-[11px] focus:outline-none"
                    placeholder="e.g. Nitroglycerin, Lisinopril"
                  />
                  {(() => {
                    const list = editingDrugs ? editingDrugs.split(',').map(m => m.trim()).filter(Boolean) : [];
                    const evalResult = checkDrugInteractions(list);
                    if (evalResult.severity === 'NONE') return null;
                    return (
                      <div className={`mt-2 p-2.5 rounded-lg border text-[9px] space-y-1.5 ${evalResult.severity === 'CRITICAL' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-250 text-amber-800'}`}>
                        <div className="flex items-center gap-1 font-bold font-mono text-[9px] uppercase">
                          <AlertTriangle className="h-3 w-3 text-red-650" />
                          AI WARNING: {evalResult.severity}
                        </div>
                        <p className="font-sans leading-relaxed">{evalResult.description}</p>
                        <div className="pt-1 border-t border-current/10 font-sans leading-relaxed">
                          <span className="font-bold">Mitigation:</span> {evalResult.resolution}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-teal-50/20 border border-teal-150 rounded-xl text-zinc-850 space-y-1">
                <span className="text-[9px] font-mono text-teal-800 uppercase font-bold tracking-wider block">Plaintext Medical Diagnosis / Narrative</span>
                <p className="leading-relaxed font-sans font-medium">{decryptedRecordIds[rec.id]}</p>
              </div>
            )}

            {((rec.photoUrls && rec.photoUrls.length > 0) || rec.photoUrl) && (
              <div className="space-y-2 pt-2">
                <span className="text-[9px] font-mono text-zinc-500 uppercase font-bold">
                  Clinical Scan Attachments ({rec.photoUrls ? rec.photoUrls.length : 1})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(rec.photoUrls && rec.photoUrls.length > 0 ? rec.photoUrls : [rec.photoUrl!]).map((photo, pIdx) => (
                    <div key={pIdx} className="border border-zinc-200 rounded-xl bg-zinc-50 overflow-hidden shadow-sm max-w-sm">
                      <div className="p-2 border-b border-zinc-200 bg-white flex items-center justify-between">
                        <span className="text-[8px] font-mono text-zinc-550 uppercase font-bold flex items-center gap-1">
                          <Image className="h-3 w-3 text-zinc-400" /> Scan #{pIdx + 1}
                        </span>
                        <button
                          onClick={() => setSelectedZoomPhoto(photo)}
                          className="p-1 hover:bg-zinc-150 rounded text-teal-650 hover:text-teal-800 cursor-pointer flex items-center gap-1 text-[9px] font-mono font-bold"
                        >
                          <ZoomIn className="h-3 w-3" /> Click to Zoom
                        </button>
                      </div>
                      <div className="relative group/pic aspect-video bg-zinc-150 cursor-pointer overflow-hidden" onClick={() => setSelectedZoomPhoto(photo)}>
                        <img
                          src={photo}
                          alt={`${rec.title} - scan ${pIdx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-zinc-950/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white text-[9px] font-mono bg-zinc-900/90 px-2 py-1 rounded-md font-bold">
                            Expand Display Scans
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="text-[10px] font-mono text-zinc-400 italic">
             Click "Decrypt Locally" button to verify this block with your private PKI keys.
          </div>
        )}

        {rec.medicines.length > 0 && editingRecordId !== rec.id && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
            <span className="text-[10px] font-mono text-zinc-400 uppercase mr-1 font-semibold">
              Covered Active Drug Lines:
            </span>
            {rec.medicines.map((sub, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 text-[10px] font-mono border border-zinc-200">
                {sub}
              </span>
            ))}
          </div>
        )}
        {rec.medicines.length > 0 && editingRecordId !== rec.id && (() => {
          const evalResult = checkDrugInteractions(rec.medicines);
          if (evalResult.severity === 'NONE') return null;
          return (
            <div className={`mt-2 p-3 rounded-xl border text-[9px] space-y-1.5 ${evalResult.severity === 'CRITICAL' ? 'bg-red-50 border-red-200 text-red-850' : 'bg-amber-50 border-amber-250 text-amber-850'}`}>
              <div className="flex items-center gap-1 font-bold font-mono text-[9px] uppercase">
                <AlertTriangle className="h-3 w-3 text-red-650" />
                CLINICAL INTERACTION ALERT: {evalResult.severity}
              </div>
              <p className="font-sans leading-relaxed">{evalResult.description}</p>
              <div className="pt-1 border-t border-current/10 font-sans leading-relaxed">
                <span className="font-bold">Resolution:</span> {evalResult.resolution}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Right-side status and unlock button */}
      <div className="flex md:flex-col items-end gap-3 justify-between w-full md:w-auto shrink-0 border-t md:border-t-0 pt-4 md:pt-0 border-zinc-150">
        <div className="text-left md:text-right">
          <span className="text-[8px] font-mono text-zinc-400 block uppercase font-bold">SHA256 Ledger Hash</span>
          <span className="font-mono text-[10px] text-zinc-550 font-bold select-all bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded">{rec.hash}</span>
        </div>

        <div className="w-full md:w-auto text-right space-y-2">
          {decryptedRecordIds[rec.id] ? (
            <div className="flex flex-wrap items-center justify-end gap-2 animate-fade-in">
              {editingRecordId === rec.id ? (
                <>
                  <button
                    onClick={() => handleUpdateRecordSubmit(rec)}
                    className="px-2.5 py-1 rounded bg-teal-650 hover:bg-teal-700 text-white font-mono text-[10px] font-bold border border-teal-650 hover:border-teal-700 cursor-pointer transition-colors"
                  >
                    Update
                  </button>
                  <button
                    onClick={() => setEditingRecordId(null)}
                    className="px-2.5 py-1 rounded bg-white hover:bg-zinc-100 text-zinc-600 font-mono text-[10px] font-bold border border-zinc-350 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="inline-flex py-1 px-2 rounded-lg bg-emerald-50 border border-emerald-250 text-emerald-700 text-[9px] font-mono font-bold items-center gap-1">
                    <Check className="h-3 w-3" /> Decrypted
                  </div>
                  <button
                    onClick={() => {
                      setEditingRecordId(rec.id);
                      setEditingTitle(rec.title);
                      setEditingCategory(rec.category);
                      setEditingDoctorName(rec.doctorName);
                      setEditingDetails(decryptedRecordIds[rec.id]);
                      setEditingDrugs(rec.medicines.join(', '));
                    }}
                    className="px-2.5 py-1 rounded bg-white hover:bg-zinc-100 text-zinc-700 font-mono text-[10px] font-bold border border-zinc-350 cursor-pointer transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleCloseDecryptedRecord(rec.id)}
                    className="px-2.5 py-1 rounded bg-white hover:bg-red-50 text-red-600 font-mono text-[10px] font-bold border border-zinc-350 hover:border-red-300 cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-2 min-w-[240px]">
              {!showingKeyInputIds[rec.id] ? (
                <button
                  onClick={() => setShowingKeyInputIds({ ...showingKeyInputIds, [rec.id]: true })}
                  className="w-full md:w-auto inline-flex justify-center items-center gap-1 py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-mono font-bold transition-all hover:scale-103 cursor-pointer shadow-sm"
                >
                  🔑 Decrypt Locally
                </button>
              ) : (
                <div className="p-3 bg-zinc-55 border border-zinc-200 rounded-xl text-left space-y-2 animate-scale-up">
                  <label className="block text-[9px] font-mono text-zinc-555 uppercase font-bold">
                    Provide Private Key PEM Block:
                  </label>
                  <textarea
                    value={recordKeyInputs[rec.id] || ''}
                    onChange={(e) => setRecordKeyInputs({ ...recordKeyInputs, [rec.id]: e.target.value })}
                    placeholder="Paste private key block here..."
                    rows={4}
                    className="w-full text-[9px] font-mono p-1.5 border border-zinc-250 rounded bg-white text-zinc-805 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <div className="flex flex-wrap gap-1.5 justify-between">
                    <button
                      type="button"
                      onClick={() => setRecordKeyInputs({ ...recordKeyInputs, [rec.id]: user.privateKey || '' })}
                      className="py-1 px-1.5 border border-zinc-200 hover:border-zinc-300 rounded text-[8px] font-mono font-bold text-zinc-650 hover:text-zinc-800 bg-white hover:bg-zinc-50 cursor-pointer"
                    >
                      Auto-fill my key
                    </button>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const prevInput = { ...showingKeyInputIds };
                          delete prevInput[rec.id];
                          setShowingKeyInputIds(prevInput);
                        }}
                        className="py-1 px-2 border border-zinc-200 hover:border-zinc-300 rounded text-[9px] font-mono text-zinc-650 bg-white hover:bg-zinc-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecryptSelfRecord(rec, recordKeyInputs[rec.id])}
                        className="py-1 px-2.5 rounded bg-teal-600 hover:bg-teal-700 text-white text-[9px] font-mono font-bold cursor-pointer transition-colors"
                      >
                        Unlock Payload
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {decryptionError[rec.id] && (
            <span className="text-[9px] text-red-650 font-mono block mt-1 text-center md:text-right">{decryptionError[rec.id]}</span>
          )}
        </div>
      </div>

    </div>
  );
}
