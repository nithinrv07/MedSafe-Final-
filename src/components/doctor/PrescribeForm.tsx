import React, { useState } from 'react';
import { Sparkles, X, ShieldAlert, RefreshCw, PlusCircle, UploadCloud } from 'lucide-react';
import { UserProfile, MedicalRecord, AccessRequest } from '../../types';
import type { AddLogHandler } from './types';
import { checkDrugInteractions } from '../../utils/drugInteractions';

interface PrescribeFormProps {
  user: UserProfile;
  records: MedicalRecord[];
  selectedGrantReq: AccessRequest;
  onClose: () => void;
  onAddRecord: (record: MedicalRecord) => void;
  onAddLog: AddLogHandler;
}

/** Add a record to an approved patient's vault, with a drug-interaction check first. */
export default function PrescribeForm({ user, records, selectedGrantReq, onClose, onAddRecord, onAddLog }: PrescribeFormProps) {
  const [newPrescTitle, setNewPrescTitle] = useState('');
  const [newPrescCategory, setNewPrescCategory] = useState<'Prescription' | 'Lab Report' | 'Diagnosis' | 'Immunization'>('Prescription');
  const [newPrescDetails, setNewPrescDetails] = useState('');
  const [newPrescDrugs, setNewPrescDrugs] = useState('');
  const [newPrescPhotoUrls, setNewPrescPhotoUrls] = useState<string[]>([]);
  // AI conflict interceptor state
  const [aiWarning, setAiWarning] = useState<{
    severity: 'CRITICAL' | 'MODERATE' | 'NONE';
    description: string;
    resolution: string;
  } | null>(null);

  const [simulationStep, setSimulationStep] = useState<'IDLE' | 'ANALYZING' | 'WARN_SHOWN'>('IDLE');
  const triggerAiCheckingSequence = () => {
    if (!newPrescDrugs) {
      setAiWarning(null);
      return;
    }

    setSimulationStep('ANALYZING');
    const splitDrugs = newPrescDrugs.split(',').map(m => m.trim()).filter(Boolean);

    // Look for overall combinations including those in patient's past records if we have a patient
    const pastDrugs: string[] = [];
    if (selectedGrantReq) {
      const patientRecords = records.filter(r => r.patientId === selectedGrantReq.patientId);
      patientRecords.forEach(r => pastDrugs.push(...r.medicines));
    }

    const compiledMedList = [...splitDrugs, ...pastDrugs];

    setTimeout(() => {
      const evaluation = checkDrugInteractions(compiledMedList);
      setAiWarning(evaluation);
      setSimulationStep('WARN_SHOWN');

      if (evaluation.severity !== 'NONE') {
        onAddLog(
          'AI Contraindication Detected',
          evaluation.severity === 'CRITICAL' ? 'ALERT' : 'WARNING',
          `Drug interaction check raised a ${evaluation.severity} warning for: ${compiledMedList.join(', ')}.`
        );
      }
    }, 1200);
  };
  const handleDoctorFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewPrescPhotoUrls((prev) => [...prev, reader.result as string]);
          onAddLog(
            'Prescribing Image Appended',
            'SUCCESS',
            `${user.name} attached a scan (${file.name}) to a new record before encryption.`
          );
        };
        reader.readAsDataURL(file);
      });
    }
  };
  const handleAppependRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrantReq || !newPrescTitle || !newPrescDetails) return;

    const finalDrugsList = newPrescDrugs
      ? newPrescDrugs.split(',').map(m => m.trim()).filter(Boolean)
      : [];

    // Encrypted with AES-256-GCM for the patient and this doctor in App before upload.
    const createdRecord: MedicalRecord = {
      id: `rec-${crypto.randomUUID()}`,
      patientId: selectedGrantReq.patientId,
      authorId: user.id,
      createdAt: new Date().toISOString(),
      ciphertext: '',
      iv: '',
      keyEnvelopes: {},
      readers: [],
      title: newPrescTitle,
      category: newPrescCategory,
      doctorName: user.name,
      date: new Date().toISOString().split('T')[0],
      details: newPrescDetails,
      encryptedContent: '',
      hash: '',
      medicines: finalDrugsList,
      photoUrl: newPrescPhotoUrls[0] || undefined,
      photoUrls: newPrescPhotoUrls
    };

    onAddRecord(createdRecord);

    // Reset
    setNewPrescTitle('');
    setNewPrescDetails('');
    setNewPrescDrugs('');
    setNewPrescPhotoUrls([]);
    onClose();
    setAiWarning(null);
    setSimulationStep('IDLE');
  };

  return (
    <div id="append-vault-prescription-modal" className="bg-white border border-zinc-250 rounded-2xl p-6 space-y-4 shadow-lg animate-fade-in">

      <div className="flex justify-between items-center border-b border-zinc-150 pb-2.5">
        <div className="flex items-center gap-2">
          <PlusCircle className="h-5 w-5 text-indigo-600" />
          <h4 className="font-display font-bold text-zinc-900 text-sm uppercase">
            New Secure Prescription File: {selectedGrantReq.patientName}
          </h4>
        </div>
        <button
          onClick={() => onClose}
          className="p-1 rounded bg-zinc-50 text-zinc-400 hover:text-zinc-700 cursor-pointer hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleAppependRecordSubmit} className="space-y-4 text-xs font-sans">

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">Record Title</label>
            <input
              type="text"
              required
              value={newPrescTitle}
              onChange={(e) => setNewPrescTitle(e.target.value)}
              placeholder="e.g. Dynamic Hypertension Titration"
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-zinc-900 hover:bg-white focus:outline-none focus:border-zinc-400 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">File Type Category</label>
            <select
              value={newPrescCategory}
              onChange={(e) => setNewPrescCategory(e.target.value as any)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-zinc-900 focus:outline-none h-[38px] cursor-pointer"
            >
              <option value="Prescription">Prescription File</option>
              <option value="Diagnosis">Clinical Diagnosis</option>
              <option value="Lab Report">Lab Work Summary</option>
              <option value="Immunization">Immunization Record</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-mono text-zinc-500 mb-1.5 uppercase font-semibold">Clinical Content Payload (To Pre-Encrypt)</label>
          <textarea
            required
            value={newPrescDetails}
            onChange={(e) => setNewPrescDetails(e.target.value)}
            placeholder="Add detailed clinical report, dosage directives and treatment plans."
            rows={3}
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2.5 px-3 text-zinc-900 focus:outline-none hover:bg-white focus:border-zinc-400 transition-all leading-relaxed"
          />
        </div>

        {/* AI Interaction Scanner Trigger Component */}
        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <label className="text-[10px] font-mono text-zinc-600 uppercase font-bold">Active Compounds to Check</label>
              <p className="text-[10px] text-zinc-450 mt-0.5 font-medium">Separate with commas (e.g. Sildenafil, Furosemide, Simvastatin)</p>
            </div>

            <button
              type="button"
              onClick={triggerAiCheckingSequence}
              className="py-1 px-3.5 rounded bg-zinc-900 hover:bg-zinc-800 text-white font-mono font-bold text-[10px] flex items-center gap-1 cursor-pointer shadow-sm"
            >
              {simulationStep === 'ANALYZING' ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin text-zinc-300" /> Analyzing chemical pathways...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-yellow-500" /> Run AI Conflict Screen
                </>
              )}
            </button>
          </div>

          <input
            type="text"
            value={newPrescDrugs}
            onChange={(e) => setNewPrescDrugs(e.target.value)}
            placeholder="e.g. Nitroglycerin, Sildenafil"
            className="w-full bg-white border border-zinc-200 rounded-lg py-1.5 px-3 text-zinc-900 text-xs placeholder-zinc-400 focus:outline-none focus:border-zinc-400 transition-all font-medium"
          />

          {/* Highly descriptive patient safety alarm box */}
          {aiWarning && (
            <div className={`p-4 rounded-lg border flex gap-3 text-xs leading-relaxed animate-fade-in ${
              aiWarning.severity === 'CRITICAL'
                ? 'bg-red-50 border-red-250 text-red-800'
                : aiWarning.severity === 'MODERATE'
                  ? 'bg-amber-50 border-amber-250 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <div className="space-y-1">
                <h5 className="font-bold font-display uppercase tracking-wider flex items-center gap-1 text-[11px] font-bold">
                  <ShieldAlert className="h-4 w-4" /> AI INTERCEPT: {aiWarning.severity} PHARMACOLOGICAL WARNING
                </h5>
                <p className="font-sans text-[11px] leading-relaxed opacity-95">
                  {aiWarning.description}
                </p>
                <p className="font-sans text-[10px] leading-relaxed opacity-90 pt-1 italic">
                  <span className="font-bold underline">Urgent Clinician Resolution:</span> {aiWarning.resolution}
                </p>
              </div>
            </div>
          )}
                         {/* Safe Medical Photo Attachment for Doctor */}
        <div className="space-y-2.5 pt-1.5 border-t border-zinc-150">
          <label className="block text-[10px] font-mono text-zinc-500 uppercase font-semibold">
            Attach Diagnostic Imaging or RX Scan Card (Multiple Supported)
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Drag & Drop File Selector */}
            <div className="border border-dashed border-zinc-200 hover:border-zinc-355 rounded-xl p-4 bg-zinc-50 hover:bg-zinc-100 transition-all text-center relative flex flex-col justify-center items-center group min-h-[100px] bg-zinc-50/50">
              <UploadCloud className="h-6 w-6 text-zinc-400 mb-1.5 group-hover:text-zinc-650 transition-colors" />
              <p className="text-[10px] font-medium text-zinc-800">
                Drag & drop or <span className="text-teal-600 font-bold hover:underline cursor-pointer">browse files</span>
              </p>
              <p className="text-[9px] text-zinc-400 mt-0.5">JPEG, PNG medical files up to 10MB</p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleDoctorFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>

            {/* Presets library */}
            <div className="bg-zinc-55/50 border border-zinc-200 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-[8px] font-mono text-zinc-400 uppercase font-bold block mb-1">Sandbox Presets:</span>
              <div className="grid grid-cols-2 gap-1 text-[9px] font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setNewPrescPhotoUrls(prev => [...prev, 'https://picsum.photos/seed/eleanor_ecg/600/450']);
                    onAddLog('Primacy Clinical Prescription Added', 'SUCCESS', 'Doctor configured Cardiology ECG Waveform Scan Preset.');
                  }}
                  className={`p-1.5 rounded-lg border text-left flex items-center gap-1 transition-all bg-white hover:bg-zinc-50 cursor-pointer ${newPrescPhotoUrls.some(url => url.includes('eleanor_ecg')) ? 'border-teal-500 ring-1 ring-teal-500 text-teal-850 font-bold' : 'border-zinc-250 text-zinc-650'}`}
                >
                  🩻 Einthoven ECG chart
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewPrescPhotoUrls(prev => [...prev, 'https://picsum.photos/seed/patient_mri/600/450']);
                    onAddLog('Primacy Clinical Prescription Added', 'SUCCESS', 'Doctor configured Brain Cerebral MRI Preset.');
                  }}
                  className={`p-1.5 rounded-lg border text-left flex items-center gap-1 transition-all bg-white hover:bg-zinc-55 cursor-pointer ${newPrescPhotoUrls.some(url => url.includes('patient_mri')) ? 'border-teal-500 ring-1 ring-teal-500 text-teal-850 font-bold' : 'border-zinc-250 text-zinc-650'}`}
                >
                  🧠 Brain MRI Scan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewPrescPhotoUrls(prev => [...prev, 'https://picsum.photos/seed/patient_xray/600/450']);
                    onAddLog('Primacy Clinical Prescription Added', 'SUCCESS', 'Doctor configured Clinical Chest Radiology Scan.');
                  }}
                  className={`p-1.5 rounded-lg border text-left flex items-center gap-1 transition-all bg-white hover:bg-zinc-55 cursor-pointer ${newPrescPhotoUrls.some(url => url.includes('patient_xray')) ? 'border-teal-500 ring-1 ring-teal-500 text-teal-850 font-bold' : 'border-zinc-250 text-zinc-650'}`}
                >
                  🩻 Chest X-Ray
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewPrescPhotoUrls(prev => [...prev, 'https://picsum.photos/seed/eleanor_blood/600/450']);
                    onAddLog('Primacy Clinical Prescription Added', 'SUCCESS', 'Doctor configured Blood Metabolic Panel Analytics.');
                  }}
                  className={`p-1.5 rounded-lg border text-left flex items-center gap-1 transition-all bg-white hover:bg-zinc-55 cursor-pointer ${newPrescPhotoUrls.some(url => url.includes('eleanor_blood')) ? 'border-teal-500 ring-1 ring-teal-500 text-teal-850 font-bold' : 'border-zinc-250 text-zinc-650'}`}
                >
                  🧪 Lab Assay Results
                </button>
              </div>
            </div>
          </div>

          {/* Pre-upload attachment banner indicators (multiple) */}
          {newPrescPhotoUrls.length > 0 && (
            <div className="space-y-2">
              <span className="text-[9px] font-mono text-teal-700 font-bold block uppercase">
                ✓ Staged Attachments ({newPrescPhotoUrls.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {newPrescPhotoUrls.map((url, idx) => (
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
                      onClick={() => setNewPrescPhotoUrls((prev) => prev.filter((_, i) => i !== idx))}
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
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={() => onClose}
            className="py-1.5 px-3.5 rounded-xl border border-zinc-200 bg-white text-zinc-500 font-bold hover:bg-zinc-50 cursor-pointer text-xs"
          >
            Dismiss Prescription
          </button>
          <button
            type="submit"
            disabled={aiWarning?.severity === 'CRITICAL'}
            className={`py-1.5 px-4.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm ${
              aiWarning?.severity === 'CRITICAL'
                ? 'bg-zinc-100 text-zinc-400 border border-zinc-200 cursor-not-allowed'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white'
            }`}
          >
            Authorize Encrypted Prescription Append
          </button>
        </div>
      </form>

    </div>
  );
}
