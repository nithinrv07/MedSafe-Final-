import React, { useState } from 'react';
import { X, AlertTriangle, Sparkles, UploadCloud, Loader2 } from 'lucide-react';
import { UserProfile, MedicalRecord } from '../../types';
import type { AddLogHandler } from './types';
import { checkDrugInteractions } from '../../utils/drugInteractions';
import { encryptRecordPayload } from '../../utils/vaultCrypto';
import EncryptionVisualizer from '../EncryptionVisualizer';

interface AddRecordFormProps {
  user: UserProfile;
  showAddForm: boolean;
  setShowAddForm: (open: boolean) => void;
  onAddRecord: (record: MedicalRecord) => void;
  onAddLog: AddLogHandler;
}

/** New-record form: optional AI document reading, then encryption preview and save. */
export default function AddRecordForm({ user, showAddForm, setShowAddForm, onAddRecord, onAddLog }: AddRecordFormProps) {
  const [newTitle, setNewTitle] = useState('');
  const [isOcrAnalyzing, setIsOcrAnalyzing] = useState(false);
  const [newCategory, setNewCategory] = useState<'Prescription' | 'Lab Report' | 'Diagnosis' | 'Immunization'>('Prescription');
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newDrugs, setNewDrugs] = useState('');
  const [newPhotoUrls, setNewPhotoUrls] = useState<string[]>([]);
  // Encryption Visualizer Intermediary State
  const [visualData, setVisualData] = useState<{
    plain: string;
    cipher: string;
    active: boolean;
  } | null>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setIsOcrAnalyzing(true);

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        setNewPhotoUrls((prev) => [...prev, base64Data]);
        onAddLog(
          'Diagnostic Image Uploaded',
          'SUCCESS',
          `Selected local patient scan document: ${file.name} (${Math.round(file.size / 1024)} KB) and processed key buffers ready for browser pre-encryption.`
        );

        try {
          const res = await fetch('/api/ocr/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data, fileName: file.name }),
          });
          const data = await res.json();
          if (res.ok && data.success && data.data) {
            setNewTitle(data.data.title || '');
            setNewCategory(data.data.category || 'Prescription');
            setNewDoctorName(data.data.doctorName || '');
            setNewDetails(data.data.details || '');
            setNewDrugs(data.data.medicines || '');

            onAddLog(
              'AI OCR Analysis Complete',
              'SUCCESS',
              `Automatically extracted document details via ${data.simulated ? 'the offline sample template' : 'Gemini AI'} and auto-populated vault form fields.`
            );
          }
        } catch (err) {
          console.error('Failed to run OCR details extraction:', err);
        } finally {
          setIsOcrAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Trigger Local Asymmetric Record Encryption
  const handleCreateRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDetails) return;

    const finalMedicinesList = newDrugs
      ? newDrugs.split(',').map(m => m.trim()).filter(Boolean)
      : [];

    // Real AES-256-GCM output of this content, shown in the visualizer.
    // The record itself is encrypted again for all readers when it is saved.
    const preview = await encryptRecordPayload(
      { title: newTitle, details: newDetails, medicines: finalMedicinesList, photoUrls: [] },
      { [user.id]: user.publicKey }
    );

    // Trigger visualizer
    setVisualData({
      plain: newDetails,
      cipher: `AES-256-GCM | iv=${preview.iv} | ${preview.ciphertext}`,
      active: true,
    });

    // Save record to local state
    const createdRecord: MedicalRecord = {
      id: `rec-${crypto.randomUUID()}`,
      patientId: user.id,
      authorId: user.id,
      createdAt: new Date().toISOString(),
      ciphertext: '',
      iv: '',
      keyEnvelopes: {},
      readers: [],
      title: newTitle,
      category: newCategory,
      doctorName: newDoctorName || 'Self Uploaded',
      date: new Date().toISOString().split('T')[0],
      details: newDetails,
      encryptedContent: '',
      hash: '',
      medicines: finalMedicinesList,
      photoUrl: newPhotoUrls[0] || undefined,
      photoUrls: newPhotoUrls,
    };

    setTimeout(() => {
      onAddRecord(createdRecord);
      // Reset
      setNewTitle('');
      setNewDoctorName('');
      setNewDetails('');
      setNewDrugs('');
      setNewPhotoUrls([]);
      setShowAddForm(false);
      setVisualData(null);
    }, 2800);
  };

  return (
    <>
      {/* Direct interactive sandbox encryptor */}
      {visualData?.active && (
        <EncryptionVisualizer
          plainText={visualData.plain}
          cipherText={visualData.cipher}
          isEncrypting={visualData.active}
        />
      )}

      {/* Add Record Form Panel */}
      {showAddForm && (
        <div id="add-record-panel" className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4 shadow-md">
          <div className="flex justify-between items-center pb-2 border-b border-zinc-150">
            <div className="flex items-center gap-2">
              <h4 className="font-display font-bold text-zinc-900 text-sm uppercase tracking-wide">
                Zero-Knowledge Record Generator
              </h4>
              {isOcrAnalyzing && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-teal-50 text-teal-700 border border-teal-200 animate-pulse">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  AI Parsing...
                </span>
              )}
            </div>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded hover:bg-zinc-100 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleCreateRecordSubmit} className="space-y-4 text-xs font-sans">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">
                  Record Label / Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Chest X-Ray, Blood panel"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all hover:bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">
                  Category Type
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-zinc-900 focus:outline-none h-[34px] cursor-pointer"
                >
                  <option value="Prescription">Prescription</option>
                  <option value="Lab Report">Lab Report</option>
                  <option value="Diagnosis">Diagnosis</option>
                  <option value="Immunization">Immunization</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">
                  Issuing Physician
                </label>
                <input
                  type="text"
                  value={newDoctorName}
                  onChange={(e) => setNewDoctorName(e.target.value)}
                  placeholder="e.g. Dr. Sarah Lin"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all hover:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">
                Clinical Report Payload (To Encrypt on Client-side)
              </label>
              <textarea
                required
                value={newDetails}
                onChange={(e) => setNewDetails(e.target.value)}
                placeholder="Write private diagnoses or lab stats. This text will undergo immediate local AES encrypting in your browser before saving."
                rows={3}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all hover:bg-white leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase flex items-center justify-between font-semibold">
                <span>Pharmacological Medicines list (Comma separated for AI Scanner check)</span>
                <span className="text-teal-600 flex items-center gap-1 font-bold">
                  <Sparkles className="h-3 w-3 animate-spin text-teal-600" /> Cross-check active
                </span>
              </label>
              <input
                type="text"
                value={newDrugs}
                onChange={(e) => setNewDrugs(e.target.value)}
                placeholder="e.g. Nitroglycerin, Sildenafil, Lisinopril, Spironolactone"
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all hover:bg-white"
              />
              {(() => {
                const list = newDrugs ? newDrugs.split(',').map(m => m.trim()).filter(Boolean) : [];
                const evalResult = checkDrugInteractions(list);
                if (evalResult.severity === 'NONE') return null;
                return (
                  <div className={`mt-2.5 p-3 rounded-xl border text-[10px] space-y-1.5 animate-scale-up ${evalResult.severity === 'CRITICAL' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-250 text-amber-800'}`}>
                    <div className="flex items-center gap-1.5 font-bold font-mono text-[10px] uppercase">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-650" />
                      AI INTERCEPTOR: {evalResult.severity} CONTRAINDICATION
                    </div>
                    <p className="font-sans leading-relaxed">{evalResult.description}</p>
                    <div className="pt-1.5 border-t border-current/10 font-sans leading-relaxed">
                      <span className="font-bold">Suggested Clinical Mitigation:</span> {evalResult.resolution}
                    </div>
                  </div>
                );
              })()}
              <span className="text-[10px] text-zinc-500 font-sans mt-1.5 block leading-relaxed">
                * AI checks cross-drug conflicts automatically if medications interact (e.g. Lisinopril + Spironolactone).
              </span>
            </div>

            {/* Photo attachment section */}
            <div className="space-y-2.5 pt-1.5 border-t border-zinc-100">
              <label className="block text-[10px] font-mono text-zinc-500 uppercase font-semibold">
                Attach Clinical Photo Card or Scan Document (Multiple Supported)
              </label>

              <div className="w-full">
                {/* Drag & Drop File Selector area */}
                <div className="border border-dashed border-zinc-200 hover:border-zinc-350 rounded-xl p-6 bg-zinc-50 hover:bg-zinc-100 transition-all text-center relative flex flex-col justify-center items-center group min-h-[120px] bg-zinc-50/50">
                  <UploadCloud className="h-7 w-7 text-zinc-400 mb-1.5 group-hover:text-zinc-650 transition-colors" />
                  <p className="text-[11px] font-medium text-zinc-800">
                    Drag & drop or <span className="text-teal-600 font-bold hover:underline cursor-pointer">browse files</span>
                  </p>
                  <p className="text-[9px] text-zinc-400 mt-0.5">JPEG, PNG scans up to 10MB</p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              </div>

              {/* Pre-upload attachment banner indicators (multiple) */}
              {newPhotoUrls.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[9px] font-mono text-teal-700 font-bold block uppercase">
                    ✓ Staged Attachments ({newPhotoUrls.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {newPhotoUrls.map((url, idx) => (
                      <div key={idx} className="p-2.5 bg-teal-50/45 border border-teal-200 rounded-xl flex items-center justify-between animate-fade-in text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded border border-zinc-200 overflow-hidden shrink-0">
                            <img
                              src={url}
                              alt={`Secure preview ${idx + 1}`}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="min-w-0 text-[10px]">
                            <span className="text-[8px] font-mono text-zinc-450 truncate block max-w-[120px] leading-none">
                              {url.startsWith('data:') ? `Custom Scan Document #${idx + 1}` : `Mock Preset Image #${idx + 1}`}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewPhotoUrls((prev) => prev.filter((_, i) => i !== idx))}
                          className="px-2 py-1 rounded bg-white hover:bg-red-50 text-red-650 hover:text-red-700 font-mono text-[9px] border border-zinc-200 hover:border-red-200 cursor-pointer transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full inline-flex justify-center items-center rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-2.5 transition-all cursor-pointer font-mono text-xs shadow-sm"
            >
              Encrypt Document & Write to Ledger (Local Client Encryption)
            </button>
          </form>
        </div>
      )}
    </>
  );
}
