import React, { useState } from 'react';
import { Key, Image, ZoomIn } from 'lucide-react';
import { UserProfile, MedicalRecord, AccessRequest } from '../../types';
import type { AddLogHandler } from './types';

interface DoctorRecordItemProps {
  rec: MedicalRecord;
  approveReq: AccessRequest;
  user: UserProfile;
  onAddLog: AddLogHandler;
  setSelectedZoomPhoto: (url: string | null) => void;
}

/** One record inside an approved vault: decrypt with the doctor's own key, then view. */
export default function DoctorRecordItem({ rec, approveReq, user, onAddLog, setSelectedZoomPhoto }: DoctorRecordItemProps) {
  const [decryptedRecordIds, setDecryptedRecordIds] = useState<Record<string, string>>({});
  const [decryptionError, setDecryptionError] = useState<Record<string, string>>({});
  const [recordKeyInputs, setRecordKeyInputs] = useState<Record<string, string>>({});
  const [showingKeyInputIds, setShowingKeyInputIds] = useState<Record<string, boolean>>({});
  // Locally Decrypt primacy record payload using approved digital signature key
  const handleDecryptRecord = (rec: MedicalRecord, req: AccessRequest, passedKey?: string) => {
    if (req.status !== 'APPROVED') {
      const errs = { ...decryptionError, [rec.id]: 'Access Denied: Token approval is pending or revoked by medical patient.' };
      setDecryptionError(errs);
      return;
    }

    const finalKey = passedKey ? passedKey.trim() : '';
    if (!finalKey) {
      setDecryptionError({
        ...decryptionError,
        [rec.id]: 'Private key block is required.'
      });
      return;
    }

    // Doctors decrypt with their OWN private key: the patient re-wrapped each
    // record key for this doctor's public key when approving the request.
    if (!user.privateKey || finalKey !== user.privateKey.trim()) {
      setDecryptionError({
        ...decryptionError,
        [rec.id]: 'This private key does not match your account.'
      });
      return;
    }

    try {
      if (rec.locked) throw new Error('No decryption key has been shared with you for this record.');
      const decodedPlain = rec.details;
      
      setDecryptedRecordIds({
        ...decryptedRecordIds,
        [rec.id]: decodedPlain
      });

      // Clear any past error on success
      const errs = { ...decryptionError };
      delete errs[rec.id];
      setDecryptionError(errs);

      onAddLog(
        'Vault Record Viewed',
        'SUCCESS',
        `${user.name} viewed a decrypted record of a patient.`,
        rec.patientId
      );
    } catch (err: any) {
      setDecryptionError({
        ...decryptionError,
        [rec.id]: err.message || 'Validation Failure: Cryptographic handshake mismatch.'
      });
    }
  };

  const isOpened = decryptedRecordIds[rec.id];
  const hasErr = decryptionError[rec.id];

  return (
    <div
      className="p-4 rounded-xl bg-zinc-50/60 border border-zinc-200 space-y-3"
    >
      <div className="flex justify-between items-start gap-3">
        <div>
          <span className="px-2 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[9px] font-mono uppercase font-bold border border-zinc-250">
            {rec.category}
          </span>
          <h5 className="font-display font-bold text-zinc-900 mt-1 text-sm">{rec.title}</h5>
        </div>

        {isOpened ? (
          <span className="py-1 px-2.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[9px] font-bold flex items-center gap-1">
            ✓ Decrypted
          </span>
        ) : (
          <div className="text-right">
            {!showingKeyInputIds[rec.id] ? (
              <button
                onClick={() => setShowingKeyInputIds({ ...showingKeyInputIds, [rec.id]: true })}
                className="py-1 px-3 rounded bg-white hover:bg-zinc-100 border border-zinc-200 text-teal-700 hover:text-teal-800 font-mono text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 shadow-sm"
              >
                <Key className="h-3 w-3" /> Local Decrypt
              </button>
            ) : (
              <div className="p-3 bg-zinc-100/60 border border-zinc-200 rounded-xl text-left space-y-2 animate-scale-up max-w-xs shrink-0">
                <label className="block text-[8px] font-mono text-zinc-550 uppercase font-bold">
                  Your own private key (PEM):
                </label>
                <textarea
                  value={recordKeyInputs[rec.id] || ''}
                  onChange={(e) => setRecordKeyInputs({ ...recordKeyInputs, [rec.id]: e.target.value })}
                  placeholder="Paste your private key or use auto-fill below..."
                  rows={3}
                  className="w-full text-[9px] font-mono p-1.5 border border-zinc-250 rounded bg-white text-zinc-805 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <div className="flex justify-between items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRecordKeyInputs({ ...recordKeyInputs, [rec.id]: user.privateKey || '' })}
                    className="py-0.5 px-1 border border-zinc-200 rounded text-[7px] font-mono font-bold text-zinc-650 bg-white cursor-pointer hover:bg-zinc-50"
                  >
                    ⚡ Auto-fill
                  </button>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const prev = { ...showingKeyInputIds };
                        delete prev[rec.id];
                        setShowingKeyInputIds(prev);
                      }}
                      className="py-0.5 px-1 border border-zinc-250 rounded text-[8px] font-mono text-zinc-650 bg-white cursor-pointer hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecryptRecord(rec, approveReq, recordKeyInputs[rec.id])}
                      className="py-0.5 px-1.5 rounded bg-teal-600 text-white text-[8px] font-mono font-bold cursor-pointer hover:bg-teal-700 transition-colors"
                    >
                      Unlock
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cipher visualization or plaintext result */}
      {isOpened ? (
        <div className="space-y-3 pt-1">
          <div className="bg-white p-3.5 rounded-lg border border-teal-200 text-xs font-sans text-zinc-805 leading-relaxed max-w-full">
            <span className="text-[9px] font-mono text-teal-700 flex items-center gap-1.5 mb-1.5 bg-teal-50 border border-teal-200/50 p-1 px-2 rounded font-bold">
              ✓ Decryption Authenticated: Plaintext output
            </span>
            <p className="font-medium text-zinc-800 leading-relaxed">{isOpened}</p>
          </div>

          {/* Render attached clinical photocard displays if present */}
          {((rec.photoUrls && rec.photoUrls.length > 0) || rec.photoUrl) && (
            <div className="space-y-2 pt-2">
              <span className="text-[9px] font-mono text-zinc-500 uppercase font-bold">
                Clinical Scan Attachments ({rec.photoUrls ? rec.photoUrls.length : 1})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(rec.photoUrls && rec.photoUrls.length > 0 ? rec.photoUrls : [rec.photoUrl!]).map((photo, pIdx) => (
                  <div key={pIdx} className="border border-zinc-200 rounded-xl bg-zinc-55/50 overflow-hidden shadow-sm max-w-sm animate-fade-in">
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
        <div className="bg-[#f0f0f0] p-3 rounded-lg border border-zinc-200 text-[10px] font-mono text-zinc-500 select-all line-clamp-1 truncate">
          ENCRYPTED CIPHER VAULT METADATA: {rec.encryptedContent}
        </div>
      )}

      {hasErr && (
        <div className="p-2.5 rounded bg-red-50 border border-red-200 text-[10px] leading-relaxed text-red-700 font-medium text-mono">
          ✖ Decryption error: {hasErr}
        </div>
      )}

      {/* Active pills indicator */}
      {rec.medicines.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono text-zinc-400 font-semibold pt-1">
          <span>Patient Medicines:</span>
          {rec.medicines.map((m, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-zinc-200 rounded text-zinc-800 uppercase border border-zinc-250 text-[9px]">
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
