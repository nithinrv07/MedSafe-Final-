import React, { useState } from 'react';
import { Shield, Key, FileText, Lock, Plus, Check, X, LogOut, Radio, HelpCircle, Eye, EyeOff, AlertTriangle, AlertCircle, Copy, Database, Sparkles, RefreshCcw, UploadCloud, Image, Camera, Paperclip, Search, ZoomIn, Loader2, Network } from 'lucide-react';
import { UserProfile, MedicalRecord, AccessRequest, AuditLog } from '../types';
import { checkDrugInteractions } from '../utils/drugInteractions';
import { encryptRecordPayload, unwrapPrivateKey } from '../utils/vaultCrypto';
import QRCode from 'qrcode';
import EncryptionVisualizer from './EncryptionVisualizer';
import Logo from './Logo';

interface PatientDashboardProps {
  user: UserProfile;
  records: MedicalRecord[];
  requests: AccessRequest[];
  logs: AuditLog[];
  allUsers: UserProfile[];
  onLogout: () => void;
  onAddRecord: (record: MedicalRecord) => void;
  onUpdateRecord: (record: MedicalRecord) => void;
  onUpdateRequestHandler: (requestId: string, status: 'APPROVED' | 'REJECTED' | 'REVOKED', digitalSignature?: string) => void;
  onAddLog: (action: string, status: 'SUCCESS' | 'WARNING' | 'ALERT', details: string) => void;
  onSubmitRequest: (request: AccessRequest) => void;
}

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
  // Navigation internal view
  const [activeTab, setActiveTab] = useState<'LOCKER' | 'DOCTORS' | 'LEDGER' | 'KEYCARD' | 'NODEMAP'>('LOCKER');

  // Interactive Node Map State Declarations
  const [searchQuery, setSearchQuery] = useState('');
  const [preAuthPurpose, setPreAuthPurpose] = useState('Routine Consultation');
  const [preAuthPrivateKey, setPreAuthPrivateKey] = useState(user.privateKey || '');
  const [preAuthError, setPreAuthError] = useState('');
  const [preAuthSuccess, setPreAuthSuccess] = useState(false);
  const [showAllDirectoryNodes, setShowAllDirectoryNodes] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handlePreAuthorizeDoctor = (doc: UserProfile) => {
    if (!user.privateKey) {
      setPreAuthError('Unlock your vault with your passcode first.');
      return;
    }
    if (preAuthPrivateKey.trim() !== user.privateKey.trim()) {
      setPreAuthError('This private key does not match your account.');
      return;
    }

    const newReqId = `req-${crypto.randomUUID()}`;
    const newRequest: AccessRequest = {
      id: newReqId,
      patientId: user.id,
      patientName: user.name,
      doctorId: doc.id,
      doctorName: doc.name,
      doctorSpecialty: doc.specialty || 'General Practitioner',
      requestedPurpose: preAuthPurpose || 'Authorized patient connection',
      status: 'APPROVED',
      requestedAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
    };

    // The signature (RSA-PSS) and the doctor's record keys are created in App before sending.
    onSubmitRequest(newRequest);

    setPreAuthSuccess(true);
    setPreAuthError('');
    setTimeout(() => {
      setPreAuthSuccess(false);
    }, 3000);
  };

  // Input States for New Record Creation
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isOcrAnalyzing, setIsOcrAnalyzing] = useState(false);
  const [newCategory, setNewCategory] = useState<'Prescription' | 'Lab Report' | 'Diagnosis' | 'Immunization'>('Prescription');
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newDrugs, setNewDrugs] = useState('');
  const [newPhotoUrls, setNewPhotoUrls] = useState<string[]>([]);

  // Local decryptions triggers for patient's own vault
  const [decryptedRecordIds, setDecryptedRecordIds] = useState<Record<string, string>>({});
  const [decryptionError, setDecryptionError] = useState<Record<string, string>>({});
  const [recordKeyInputs, setRecordKeyInputs] = useState<Record<string, string>>({});
  const [showingKeyInputIds, setShowingKeyInputIds] = useState<Record<string, boolean>>({});
  const [selectedZoomPhoto, setSelectedZoomPhoto] = useState<string | null>(null);

  // Editing state controls for decrypted records
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCategory, setEditingCategory] = useState<'Prescription' | 'Lab Report' | 'Diagnosis' | 'Immunization'>('Prescription');
  const [editingDoctorName, setEditingDoctorName] = useState('');
  const [editingDetails, setEditingDetails] = useState('');
  const [editingDrugs, setEditingDrugs] = useState('');

  // Encryption Visualizer Intermediary State
  const [visualData, setVisualData] = useState<{
    plain: string;
    cipher: string;
    active: boolean;
  } | null>(null);

  // Secure prompt toggle for authorization
  const [signingRequestId, setSigningRequestId] = useState<string | null>(null);
  const [privateKeyConfirmInput, setPrivateKeyConfirmInput] = useState(user.privateKey || '');
  const [privateKeyError, setPrivateKeyError] = useState('');

  // QR pass is generated locally; the patient id is never sent to a third-party QR service.
  const [qrDataUrl, setQrDataUrl] = useState('');
  React.useEffect(() => {
    QRCode.toDataURL(user.id, { width: 260, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [user.id]);

  // The vault may be unlocked after this component mounts; prefill the key fields then.
  React.useEffect(() => {
    if (user.privateKey) {
      setPreAuthPrivateKey(k => k || user.privateKey!);
      setPrivateKeyConfirmInput(k => k || user.privateKey!);
    }
  }, [user.privateKey]);

  // Key card toggles
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copiedText, setCopiedText] = useState<'PUBLIC' | 'PRIVATE' | null>(null);

  // Passcode verification states
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
  const [passcodeAttempt, setPasscodeAttempt] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  const handleShowKeyClick = () => {
    if (showPrivateKey) {
      setShowPrivateKey(false);
    } else {
      setPasscodeAttempt('');
      setPasscodeError('');
      setShowPasscode(false);
      setIsPasscodeModalOpen(true);
    }
  };

  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    // Real check: the passcode must decrypt the stored, encrypted private key.
    let ok = false;
    try {
      ok = !!user.encryptedPrivateKey && (await unwrapPrivateKey(user.encryptedPrivateKey, passcodeAttempt)) === user.privateKey;
    } catch {
      ok = false;
    }
    if (ok) {
      setShowPrivateKey(true);
      setIsPasscodeModalOpen(false);
      setShowPasscode(false);
      setPasscodeAttempt('');
      setPasscodeError('');
      onAddLog(
        'Private Key Unlocked',
        'SUCCESS',
        `Primacy owner successfully validated passcode and unlocked key-card view.`
      );
    } else {
      setPasscodeError('Incorrect security passcode. Please enter the correct passcode.');
      onAddLog(
        'Failed Private Key Unlock Attempt',
        'ALERT',
        `An attempt to unlock the private key-card with an invalid passcode was blocked.`
      );
    }
  };

  const filteredRecords = records.filter(rec => rec.patientId === user.id);
  const filteredRequests = requests.filter(req => req.patientId === user.id);
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

  // Trigger Asymmetric Digital signature confirmation sequence
  const handleApproveAccessRequest = (requestId: string) => {
    // Stage for private key sign
    setSigningRequestId(requestId);
    setPrivateKeyError('');
  };

  const handleSignConfirm = () => {
    if (!signingRequestId) return;

    if (!user.privateKey) {
      setPrivateKeyError('Unlock your vault with your passcode first.');
      return;
    }
    if (privateKeyConfirmInput.trim() !== user.privateKey.trim()) {
      setPrivateKeyError('This private key does not match your account.');
      return;
    }

    // App signs the decision with RSA-PSS and re-wraps your record keys for the doctor.
    onUpdateRequestHandler(signingRequestId, 'APPROVED');

    setSigningRequestId(null);
  };

  // Revoke Doctor's Read Access instantly (Zero-Knowledge revoking)
  const handleRevokeDoctorAccess = (req: AccessRequest) => {
    onUpdateRequestHandler(req.id, 'REVOKED');
  };

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

  const copyText = (txt: string, type: 'PUBLIC' | 'PRIVATE') => {
    navigator.clipboard.writeText(txt);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 1500);
  };

  return (
    <div id="patient-dashboard-container" className="min-h-screen bg-[#fafafa] text-zinc-900 flex flex-col md:flex-row font-sans selection:bg-teal-100 selection:text-teal-900">
      
      {/* Visual Navigation Column */}
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-zinc-200 flex flex-col justify-between shrink-0 shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8 animate-fade-in">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 shadow-sm overflow-hidden text-teal-400">
              <Logo className="object-contain w-full h-full p-1" />
            </div>
            <div>
              <h2 className="font-display font-bold text-zinc-900 leading-tight uppercase text-sm tracking-wide">
                Patient Locker
              </h2>
              <p className="font-mono text-[9px] text-teal-650 tracking-wider font-semibold">
                CRYPTOGRAPHIC ID ACTIVE
              </p>
            </div>
          </div>

          <div id="patient-identity-teaser" className="bg-blue-50/60 rounded-xl p-4 border border-blue-200/60 mb-6 flex flex-col">
            <span className="text-[9px] font-mono text-blue-400 uppercase font-semibold">Primacy Owner</span>
            <span className="font-display font-bold text-blue-950 text-sm truncate">{user.name}</span>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-mono text-blue-600 font-bold">Vault Connected</span>
            </div>
          </div>

          {/* Nav Tab Options */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('LOCKER')}
              className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === 'LOCKER'
                  ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
              }`}
            >
              <FileText className="h-4 w-4" /> Secure Records ({filteredRecords.length})
            </button>
            <button
              onClick={() => { setActiveTab('DOCTORS'); setSigningRequestId(null); }}
              className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'DOCTORS'
                  ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Shield className="h-4 w-4" /> Access & Approvals
              </span>
              {filteredRequests.some(r => r.status === 'PENDING') && (
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </button>
            <button
              onClick={() => { setActiveTab('NODEMAP'); setSigningRequestId(null); }}
              className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === 'NODEMAP'
                  ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
              }`}
            >
              <Network className="h-4 w-4" /> Connection Node Map
            </button>
            <button
              onClick={() => setActiveTab('LEDGER')}
              className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === 'LEDGER'
                  ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
              }`}
            >
              <Radio className="h-4 w-4" /> Logs
            </button>
            <button
              onClick={() => setActiveTab('KEYCARD')}
              className={`w-full text-left py-2.5 px-4 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer ${
                activeTab === 'KEYCARD'
                  ? 'bg-teal-700 text-white border border-teal-800 font-bold shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-transparent'
              }`}
            >
              <Key className="h-4 w-4" /> Key Card
            </button>
          </nav>
        </div>

        {/* Logout widget */}
        <div className="p-6 border-t border-zinc-200 bg-zinc-50/50">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200/60 bg-red-50/50 hover:bg-red-100/50 text-zinc-900 py-2.5 px-4 text-xs font-mono font-semibold tracking-wide transition-all shadow-sm cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Shut Private Locker
          </button>
        </div>
      </aside>

      {/* Main Panel Area */}
      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto max-w-5xl">
        
        {/* TAB 1: Locker Dashboard Records */}
        {activeTab === 'LOCKER' && (
          <div id="patient-locker-view" className="space-y-6 bg-blue-50/30 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-blue-100/50 shadow-sm">
            
            {/* Header control */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
              <div>
                <h3 className="font-display text-2xl font-bold text-teal-950">Primacy Medical Records</h3>
                <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
                  Every document shown is encrypted locally prior to cloud transit. Only owners with Private Key credentials can unlock payloads.
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-bold px-4.5 py-2.5 text-xs tracking-wide transition-all shadow-sm cursor-pointer"
              >
                <Plus className="h-4 w-4" /> Add Record
              </button>
            </div>

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

            {/* List of active records */}
            <div className="space-y-4">
              {filteredRecords.length === 0 ? (
                <div className="text-center p-12 border border-dashed border-zinc-250 rounded-2xl bg-white shadow-sm">
                  <Database className="h-9 w-9 text-zinc-400 mx-auto mb-3" />
                  <p className="text-zinc-500 font-sans font-medium text-xs md:text-sm">No primacy patient records found. Create one now!</p>
                </div>
              ) : (
                filteredRecords.map((rec) => {
                  return (
                    <div
                      key={rec.id}
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
                })
              )}
            </div>

          </div>
        )}

        {/* TAB 2: Access Requests & Doctor lists */}
        {activeTab === 'DOCTORS' && (
          <div id="patient-doctors-view" className="space-y-6 bg-blue-50/30 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-blue-100/50 shadow-sm">
            
            {/* Header control */}
            <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
              <h3 className="font-display text-2xl font-bold text-teal-950">Clinician Approvals Hub</h3>
              <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
                Doctors must seek express digital permission to see your medicine vault. Sign requests using your asymmetric key pair to activate safe read decryption.
              </p>
            </div>

            {/* Secret key sign sequence popup/overlay */}
            {signingRequestId && (
              <div id="private-key-signing-modal" className="bg-white border-2 border-orange-200 rounded-2xl p-6 space-y-4 shadow-lg animate-fade-in">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 border border-orange-200">
                    <Key className="h-4.5 w-4.5" />
                  </span>
                  <h4 className="font-display font-bold text-zinc-900 text-sm uppercase tracking-wide">
                    Digital Signature credentials Required
                  </h4>
                </div>
                
                <p className="text-xs text-zinc-600 leading-relaxed font-sans">
                  The system requires your asymmetric private key (PEM format) to build audit trail and append signed token approvals. Enter your private key to sign the contract authorization.
                </p>

                {privateKeyError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-750">
                    {privateKeyError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-[10px] font-mono text-zinc-500 uppercase font-semibold">
                    Your private key (PEM), unlocked in this browser
                  </label>
                  <textarea
                    rows={4}
                    value={privateKeyConfirmInput}
                    onChange={(e) => setPrivateKeyConfirmInput(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-[10px] text-zinc-950 font-mono focus:outline-none focus:border-zinc-400 transition-all hover:bg-white"
                    placeholder="-----BEGIN PRIVATE KEY-----"
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setSigningRequestId(null)}
                    className="py-1.5 px-3.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-500 text-xs font-semibold cursor-pointer shadow-sm"
                  >
                    Cancel Action
                  </button>
                  <button
                    onClick={handleSignConfirm}
                    className="py-1.5 px-4.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs cursor-pointer shadow-sm"
                  >
                    Sign & Approve Access
                  </button>
                </div>
              </div>
            )}

            {/* List design */}
            <div className="space-y-4">
              {filteredRequests.length === 0 ? (
                <div className="text-center p-12 border border-dashed border-zinc-250 rounded-2xl bg-white shadow-sm">
                  <Shield id="empty-shield" className="h-9 w-9 text-zinc-400 mx-auto mb-3" />
                  <p className="text-zinc-500 font-sans font-medium text-xs md:text-sm">No credentials requests are currently registered on your profile.</p>
                </div>
              ) : (
                filteredRequests.map((req) => {
                  return (
                    <div
                      key={req.id}
                      className={`rounded-2xl p-6 border shadow-sm transition-all ${
                        req.status === 'PENDING'
                          ? 'border-amber-200 bg-amber-50/40'
                          : req.status === 'APPROVED'
                            ? 'border-zinc-200 bg-white hover:border-zinc-250'
                            : 'border-zinc-150 bg-[#f9f9f9]'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-zinc-900 text-base">
                              {req.doctorName}
                            </span>
                            <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-zinc-100 text-zinc-650 border border-zinc-200">
                              {req.doctorSpecialty}
                            </span>
                          </div>
                          
                          <p className="text-xs text-zinc-700 leading-relaxed max-w-xl font-sans">
                            <span className="text-[10px] font-mono text-zinc-400 block mb-0.5 uppercase font-semibold">Stated Purpose of Request:</span>
                            "{req.requestedPurpose}"
                          </p>

                          <div className="text-[10px] font-mono text-zinc-450 flex flex-wrap items-center gap-4 pt-1">
                            <span>Request Filed: {new Date(req.requestedAt).toLocaleString()}</span>
                            {req.decidedAt && <span>Decided: {new Date(req.decidedAt).toLocaleString()}</span>}
                          </div>

                          {req.digitalSignature && (
                            <div className="pt-2">
                              <span className="text-[9px] font-mono text-zinc-400 block uppercase font-semibold">Asymmetric Consent Signature</span>
                              <span className="font-mono text-[10px] text-teal-700 break-all select-all font-semibold">
                                {req.digitalSignature}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions for Approve or Revoke */}
                        <div className="flex flex-col items-end gap-2 shrink-0 w-full md:w-auto">
                          
                          {/* Active Status indicator badges */}
                          <div className="mb-2">
                            {req.status === 'PENDING' && (
                              <span className="px-2.5 py-1 text-[10px] font-mono bg-amber-100 text-amber-800 border border-amber-200 rounded-full font-bold">
                                ⏳ PENDING APPROVAL
                              </span>
                            )}
                            {req.status === 'APPROVED' && (
                              <span className="px-2.5 py-1 text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full font-bold flex items-center gap-1">
                                <Check className="h-3 w-3" /> ACTIVE DECRYPT TOKEN
                              </span>
                            )}
                            {req.status === 'REJECTED' && (
                              <span className="px-2.5 py-1 text-[10px] font-mono bg-red-50 text-red-700 border border-red-200 rounded-full font-bold">
                                ❌ DECLINED
                              </span>
                            )}
                            {req.status === 'REVOKED' && (
                              <span className="px-2.5 py-1 text-[10px] font-mono bg-zinc-100 text-zinc-500 border border-zinc-200 rounded-full font-bold">
                                🛑 REVOKED BY OWNER
                              </span>
                            )}
                          </div>

                          {req.status === 'PENDING' && (
                            <div className="flex gap-2 w-full md:w-auto">
                              <button
                                onClick={() => onUpdateRequestHandler(req.id, 'REJECTED')}
                                className="flex-1 md:flex-none py-1.5 px-3.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-red-600 hover:text-red-700 text-xs font-mono transition-all cursor-pointer font-bold shadow-sm"
                              >
                                Decline
                              </button>
                              <button
                                onClick={() => handleApproveAccessRequest(req.id)}
                                className="flex-1 md:flex-none py-1.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs font-mono tracking-wide transition-all cursor-pointer shadow-sm"
                              >
                                Approve & Sign
                              </button>
                            </div>
                          )}

                          {req.status === 'APPROVED' && (
                            <button
                              onClick={() => handleRevokeDoctorAccess(req)}
                              className="w-full md:w-auto py-1.5 px-4 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-mono transition-all cursor-pointer font-bold shadow-sm"
                            >
                              Revoke Access Immediately
                            </button>
                          )}

                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

        {/* TAB 3:  logs */}
        {activeTab === 'LEDGER' && (
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
        )}

        {/* TAB 4: key management */}
        {activeTab === 'KEYCARD' && (
          <div id="patient-key-view" className="space-y-6 bg-blue-50/30 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-blue-100/50 shadow-sm">
            
            <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
              <h3 className="font-display text-2xl font-bold text-teal-950">Your Key Card</h3>
              <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
                Only you have the corresponding secret key which is needed to provide clinical decrypted read permissions.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {/* Cryptographic Key Card layout - Gorgeous minimalist silver card */}
              <div id="physical-cryptokey-card" className="relative w-full bg-gradient-to-br from-white via-blue-50/50 to-blue-100/50 p-8 rounded-3xl border border-blue-200/60 shadow-md overflow-hidden flex flex-col justify-between">
                {/* Subtle silver/grey details */}
                <div className="absolute top-0 right-0 w-44 h-44 bg-teal-500/[0.02] rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-blue-500/[0.04] rounded-full blur-3xl pointer-events-none" />
                
                <div className="relative z-10 space-y-6">
                  
                  {/* Branding line */}
                  <div className="flex justify-between items-start animate-fade-in">
                    <div className="flex items-center gap-2">
                      <Shield className="h-6 w-6 text-blue-950 animate-pulse" />
                      <div>
                        <h4 className="font-display font-black text-blue-950 tracking-wide text-xs uppercase leading-none">PRIMACY LEDGER</h4>
                        <p className="font-mono text-[7px] text-blue-500/80 tracking-widest leading-none mt-1 uppercase font-bold">PIN-SECURE-ID-V2</p>
                      </div>
                    </div>
                    {/* Holographic smart security chip */}
                    <div className="w-10 h-8 rounded-lg bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 border border-amber-300 relative shadow-inner overflow-hidden flex flex-col justify-between p-1.5 select-none opacity-90 h-8">
                      <div className="grid grid-cols-3 gap-0.5 h-1 w-full bg-blue-950/10" />
                      <div className="grid grid-cols-2 gap-0.5 h-2 w-full bg-blue-950/10" />
                    </div>
                  </div>

                  {/* Patient metadata */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-blue-200/60">
                    <div>
                      <span className="text-[8px] font-mono text-blue-400 block uppercase font-bold">Primacy Owner Profile</span>
                      <span className="font-display font-bold text-blue-900 text-xs uppercase">{user.name}</span>
                    </div>
                    <div>
                      <span className="text-[8px] font-mono text-blue-400 block uppercase font-bold">Root Address</span>
                      <span className="font-mono text-teal-700 text-[10px] tracking-tight truncate block select-all font-semibold">
                        {user.email}
                      </span>
                    </div>
                  </div>

                  {/* Key Status Indicators */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-white/80 rounded-xl p-3 border border-blue-200/60 text-xs shadow-sm">
                      <span className="text-[8px] font-mono text-blue-400 block uppercase font-bold">Public Directory Key</span>
                      <div className="flex justify-between items-center mt-1">
                        <span className="font-mono text-teal-600 text-[10px] font-bold">PUBLISHED</span>
                        <button
                          onClick={() => copyText(user.publicKey, 'PUBLIC')}
                          className="text-[9px] font-mono text-blue-500 hover:text-blue-900 flex items-center gap-0.5 cursor-pointer font-bold"
                        >
                          {copiedText === 'PUBLIC' ? 'Copied' : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>

                    <div className="bg-white/80 rounded-xl p-3 border border-blue-200/60 text-xs shadow-sm">
                      <span className="text-[8px] font-mono text-blue-400 block uppercase font-bold">Private Consent Key</span>
                      <div className="flex justify-between items-center mt-1">
                        <span className="font-mono text-amber-600 text-[10px] font-bold">LOCAL HIDDEN</span>
                        <button
                          onClick={() => copyText(user.privateKey || '', 'PRIVATE')}
                          className="text-[9px] font-mono text-blue-500 hover:text-blue-900 flex items-center gap-0.5 cursor-pointer font-bold"
                        >
                          {copiedText === 'PRIVATE' ? 'Copied' : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Primacy QR Code Document Pass Card */}
              <div id="physical-qr-pass-card" className="relative w-full bg-gradient-to-br from-white via-blue-50/50 to-blue-100/50 p-8 rounded-3xl border border-blue-200/60 shadow-md overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/[0.01] rounded-full blur-2xl pointer-events-none" />
                
                <div className="space-y-4">
                  {/* Top Header */}
                  <div className="flex justify-between items-start pb-2 border-b border-blue-200/60">
                    <div>
                      <h4 className="font-display font-black text-blue-950 tracking-wide text-xs uppercase leading-none">PHYSICAL DOSSIER QR</h4>
                      <p className="font-mono text-[7px] text-blue-500/80 tracking-wider mt-1 uppercase font-bold">SCAN-TO-IDENTIFY</p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-blue-900 text-white font-mono text-[8px] font-bold">PRIMACY PASS</span>
                  </div>

                  {/* QR Image rendering centered and framed with styling */}
                  <div className="flex flex-col items-center justify-center py-2">
                    <div className="p-3 bg-white rounded-2xl border border-blue-200/60 shadow-sm flex items-center justify-center hover:scale-105 transition-all duration-300">
                      <img 
                        src={qrDataUrl}
                        alt="Primacy Patient QR Code ID"
                        referrerPolicy="no-referrer"
                        className="w-[130px] h-[130px]"
                      />
                    </div>
                    <span className="font-mono text-[10px] text-teal-700 font-bold mt-3 text-center block tracking-tight select-all">
                      Primacy Patient Key: {user.id}
                    </span>
                  </div>

                  {/* Context note */}
                  <p className="text-[10px] font-sans text-zinc-450 leading-relaxed text-center">
                    Present this physical ledger pass to approved doctor networks. Scanning this QR auto-loads your medical identity in directory requests.
                  </p>
                </div>
              </div>
            </div>

            {/* Explanatory cards showing PEM outputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
              
              {/* Public key drawer */}
              <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-200/60 shadow-sm space-y-3 hover:border-blue-300/60 transition-all">
                <h5 className="font-display font-bold text-blue-950 text-xs uppercase tracking-wide flex items-center gap-2">
                  <Key className="h-4 w-4 text-teal-600" /> Public directory Key
                </h5>
                <p className="text-blue-500/80 text-xs font-sans leading-relaxed">
                  Used by third-party clinical vaults to pre-encrypt diagnoses payloads prior to ledger transmission. Shared publicly via primacy indexing directory.
                </p>
                <pre className="p-3 bg-white/80 rounded-xl text-[9px] font-mono text-teal-800 leading-relaxed max-h-[120px] overflow-y-auto break-all select-all border border-blue-200/60">
                  {user.publicKey}
                </pre>
              </div>

              {/* Private key drawer */}
              <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-200/60 shadow-sm space-y-3 hover:border-blue-300/60 transition-all">
                <div className="flex justify-between items-center">
                  <h5 className="font-display font-bold text-blue-950 text-xs uppercase tracking-wide flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-600" /> Secret Private signature key
                  </h5>
                  <button
                    onClick={handleShowKeyClick}
                    className="p-1 px-2.5 rounded bg-white border border-blue-200/60 text-[10px] font-mono text-blue-500/80 hover:text-blue-900 hover:bg-blue-100/50 flex items-center gap-1 cursor-pointer font-bold"
                  >
                    {showPrivateKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showPrivateKey ? 'Hide key' : 'Show key'}
                  </button>
                </div>
                <p className="text-blue-500/80 text-xs font-sans leading-relaxed">
                  Required to complete digital consent. Keep safe. Private keys never travel over networks; signing actions execute securely in browser.
                </p>
                <div className="relative font-sans text-xs">
                  {showPrivateKey ? (
                    <pre className="p-3 bg-white/80 rounded-xl text-[9px] font-mono text-amber-800 leading-relaxed max-h-[120px] overflow-y-auto break-all select-all border border-blue-200/60">
                      {user.privateKey}
                    </pre>
                  ) : (
                    <div className="bg-white/80 rounded-xl p-6 text-center text-xs font-mono text-blue-400 border border-blue-200/60 block tracking-wider uppercase select-none italic py-[42px]">
                      •••• Key is locked for security ••••
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 5: Interactive Node Map */}
        {activeTab === 'NODEMAP' && (
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
              
              {/* Map Canvas - spans 7 cols */}
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
                              onClick={() => {
                                setSelectedNodeId(node.doctorId);
                                setPreAuthPurpose('Routine Consultation');
                                setPreAuthPrivateKey(user.privateKey || '');
                                setPreAuthError('');
                                setPreAuthSuccess(false);
                              }}
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
                          onClick={() => setSelectedNodeId('patient')}
                        />
                        <text 
                          x={cx} y={cy + 4} 
                          textAnchor="middle" 
                          fill="#2dd4bf" 
                          className="text-[11px] font-mono font-bold tracking-wider cursor-pointer"
                          onClick={() => setSelectedNodeId('patient')}
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

              {/* Info Detail Panel - spans 5 cols */}
              <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm min-h-[460px] flex flex-col justify-between">
                {(() => {
                  if (!selectedNodeId) {
                    return (
                      <div className="my-auto text-center py-8 space-y-3">
                        <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 border border-teal-150 flex items-center justify-center mx-auto shadow-sm animate-pulse">
                          <Network className="h-6 w-6" />
                        </div>
                        <h4 className="font-display font-bold text-zinc-900 text-sm uppercase tracking-wide">Inspection Ledger</h4>
                        <p className="text-zinc-500 font-sans text-xs leading-relaxed max-w-[240px] mx-auto">
                          Click on any doctor node on the map to review cryptographic signatures, pre-authorize new access keys, or revoke read permissions instantly.
                        </p>
                      </div>
                    );
                  }

                  if (selectedNodeId === 'patient') {
                    return (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2.5 pb-3.5 border-b border-zinc-150">
                          <div className="h-9 w-9 rounded-xl bg-zinc-900 text-teal-400 flex items-center justify-center font-bold font-mono">
                            {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-display font-bold text-zinc-900 text-sm">{user.name}</h4>
                            <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider block font-bold">Ledger Root Patient Vault</span>
                          </div>
                        </div>

                        <div className="space-y-3.5 text-xs">
                          <div>
                            <span className="text-[9px] font-mono text-zinc-400 block uppercase font-bold">Secure ID Hash</span>
                            <span className="font-mono text-[9px] text-zinc-800 break-all select-all font-semibold bg-zinc-50 px-2 py-1.5 rounded border border-zinc-200 block mt-1">{user.keyFingerprint}</span>
                          </div>

                          <div>
                            <span className="text-[9px] font-mono text-zinc-400 block uppercase font-bold">Registered Account email</span>
                            <span className="font-mono text-zinc-700 block">{user.email}</span>
                          </div>

                          <div>
                            <span className="text-[9px] font-mono text-zinc-400 block uppercase font-bold">Authorized Keys Status</span>
                            <span className="text-emerald-700 font-bold block mt-0.5">✓ 2048-Bit RSA Keypair Embedded</span>
                          </div>

                          <div className="pt-2 border-t border-zinc-100 leading-relaxed font-sans text-zinc-500">
                            You are the primary vault owner. All clinical connection permissions are signed with your client private key and recorded immutably on-chain.
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Retrieve connection details
                  const docProfile = allUsers.find(u => u.id === selectedNodeId);
                  const email = docProfile?.email || '';
                  
                  // Compute mock clinic name based on email domain
                  let clinicName = 'General Clinical Practice';
                  if (email.includes('metrocardio')) clinicName = 'Metro Cardiology Clinic';
                  else if (email.includes('neurohealth')) clinicName = 'Neuro Health Center';

                  // Search requests
                  const docRequests = filteredRequests.filter(req => req.doctorId === selectedNodeId);
                  // Grab active request, or pending request, or most recent request
                  const currentReq = docRequests.find(r => r.status === 'APPROVED') || 
                                     docRequests.find(r => r.status === 'PENDING') ||
                                     docRequests[0];
                  
                  const status = currentReq ? currentReq.status : 'DISCONNECTED';

                  return (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-4">
                        
                        {/* Header details */}
                        <div className="flex items-start justify-between gap-2 pb-3 border-b border-zinc-150">
                          <div>
                            <h4 className="font-display font-bold text-zinc-900 text-sm">{docProfile?.name || `Dr. ${selectedNodeId}`}</h4>
                            <span className="text-[9px] font-mono text-zinc-400 block uppercase font-bold mt-0.5">{docProfile?.specialty || 'Medical Specialist'} • {clinicName}</span>
                          </div>
                          
                          <div>
                            {status === 'APPROVED' && (
                              <span className="px-2 py-0.5 text-[9px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-250 rounded-full font-bold">
                                ACTIVE SYNC
                              </span>
                            )}
                            {status === 'PENDING' && (
                              <span className="px-2 py-0.5 text-[9px] font-mono bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold animate-pulse">
                                PENDING
                              </span>
                            )}
                            {status === 'REVOKED' && (
                              <span className="px-2 py-0.5 text-[9px] font-mono bg-zinc-100 text-zinc-500 border border-zinc-200 rounded-full font-bold">
                                REVOKED
                              </span>
                            )}
                            {status === 'REJECTED' && (
                              <span className="px-2 py-0.5 text-[9px] font-mono bg-red-50 text-red-700 border border-red-200 rounded-full font-bold">
                                DECLINED
                              </span>
                            )}
                            {status === 'DISCONNECTED' && (
                              <span className="px-2 py-0.5 text-[9px] font-mono bg-zinc-100 text-zinc-400 border border-zinc-200 rounded-full">
                                NO CONNECTION
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Cryptographic details or Authorization Form */}
                        {status === 'DISCONNECTED' || status === 'REVOKED' || status === 'REJECTED' ? (
                          // Pre-authorization form
                          <div className="space-y-3 pt-2 text-xs">
                            <h5 className="font-display font-bold text-zinc-900 text-xs uppercase tracking-wide flex items-center gap-1.5 text-teal-800">
                              <Key className="h-3.5 w-3.5" /> Pre-Authorize Clinician
                            </h5>
                            <p className="text-zinc-500 text-[11px] leading-relaxed">
                              Grant direct, encrypted access to your medicine records and diagnostics. Confirm below using your asymmetric key.
                            </p>

                            {preAuthError && (
                              <div className="p-2 bg-red-50 border border-red-200 text-[10px] text-red-750 rounded-lg">
                                {preAuthError}
                              </div>
                            )}

                            {preAuthSuccess && (
                              <div className="p-2 bg-emerald-50 border border-emerald-250 text-[10px] text-emerald-800 rounded-lg">
                                ✓ Connection authorized and published to ledger node!
                              </div>
                            )}

                            <div className="space-y-2">
                              <div>
                                <label className="block text-[9px] font-mono text-zinc-400 uppercase font-semibold mb-1">
                                  Access Purpose / Justification
                                </label>
                                <input 
                                  type="text"
                                  value={preAuthPurpose}
                                  onChange={(e) => setPreAuthPurpose(e.target.value)}
                                  placeholder="e.g. Consultation check, medication review"
                                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-1.5 text-[11px] focus:outline-none focus:border-zinc-300"
                                />
                              </div>

                              <div>
                                <label className="block text-[9px] font-mono text-zinc-450 uppercase font-semibold mb-1">
                                  Your Secret PEM Private Key
                                </label>
                                <textarea
                                  rows={3}
                                  value={preAuthPrivateKey}
                                  onChange={(e) => setPreAuthPrivateKey(e.target.value)}
                                  placeholder="-----BEGIN PRIVATE KEY-----"
                                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-1.5 text-[9px] font-mono focus:outline-none focus:border-zinc-300"
                                />
                                <button
                                  type="button"
                                  onClick={() => setPreAuthPrivateKey(user.privateKey || '')}
                                  className="text-[8px] font-mono text-teal-700 hover:underline mt-1 font-bold bg-transparent border-0 cursor-pointer block text-left"
                                >
                                  Auto-fill private key block
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => docProfile && handlePreAuthorizeDoctor(docProfile)}
                                className="w-full bg-teal-850 hover:bg-teal-900 text-white font-bold py-2 rounded-xl text-xs font-mono tracking-wide mt-2 shadow-sm cursor-pointer"
                              >
                                Sign & Establish Connection
                              </button>
                            </div>

                          </div>
                        ) : (
                          // Connection stats & hashes
                          <div className="space-y-3.5 text-xs">
                            <div>
                              <span className="text-[9px] font-mono text-zinc-400 block uppercase font-semibold">Clinician Public Key Directory Address</span>
                              <span className="font-mono text-[9px] text-zinc-500 break-all select-all block bg-zinc-50 p-1.5 rounded border border-zinc-200 mt-1 max-h-[60px] overflow-y-auto">{docProfile?.publicKey || 'No key loaded'}</span>
                            </div>

                            {currentReq && (
                              <>
                                <div>
                                  <span className="text-[9px] font-mono text-zinc-400 block uppercase font-semibold">Connection Established Purpose</span>
                                  <p className="font-sans text-zinc-700 italic mt-0.5 bg-zinc-50/50 p-2 rounded">"{currentReq.requestedPurpose}"</p>
                                </div>

                                {currentReq.digitalSignature && (
                                  <div>
                                    <span className="text-[9px] font-mono text-zinc-400 block uppercase font-semibold flex items-center justify-between">
                                      <span>Cryptographic Signature Proof</span>
                                      <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(currentReq.digitalSignature || '');
                                          onAddLog('Signature Copied', 'SUCCESS', `Cryptographic access signature token for ${currentReq.doctorName} copied to clipboard.`);
                                        }}
                                        className="text-[8px] font-mono text-teal-750 hover:underline cursor-pointer"
                                      >
                                        Copy Token
                                      </button>
                                    </span>
                                    <span className="font-mono text-[9px] text-teal-750 break-all select-all font-semibold block bg-teal-50/20 p-2 rounded border border-teal-100 mt-1">{currentReq.digitalSignature}</span>
                                  </div>
                                )}

                                <div className="text-[9px] font-mono text-zinc-450 space-y-0.5 pt-1 border-t border-zinc-100">
                                  <div>Request Created: {new Date(currentReq.requestedAt).toLocaleString()}</div>
                                  {currentReq.decidedAt && <div>Signature Sealed: {new Date(currentReq.decidedAt).toLocaleString()}</div>}
                                </div>
                              </>
                            )}

                          </div>
                        )}

                      </div>

                      {/* Bottom actions container */}
                      <div className="pt-4 border-t border-zinc-100 mt-auto">
                        {status === 'APPROVED' && currentReq && (
                          <button
                            onClick={() => handleRevokeDoctorAccess(currentReq)}
                            className="w-full py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-mono font-bold transition-all shadow-sm cursor-pointer"
                          >
                            Revoke Secure Read Access
                          </button>
                        )}

                        {status === 'PENDING' && currentReq && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => onUpdateRequestHandler(currentReq.id, 'REJECTED')}
                              className="flex-1 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-red-600 hover:text-red-700 text-xs font-mono font-bold transition-all shadow-sm cursor-pointer"
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => handleApproveAccessRequest(currentReq.id)}
                              className="flex-1 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs font-mono tracking-wide transition-all shadow-sm cursor-pointer"
                            >
                              Approve & Sign
                            </button>
                          </div>
                        )}
                      </div>

                    </div>
                  );
                })()}
              </div>

            </div>

            {/* clinician Directory Registry Search Area */}
            <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-zinc-150 mb-4 gap-3">
                <div>
                  <h4 className="font-display font-bold text-zinc-900 text-sm uppercase tracking-wide">Ledger Network Registry</h4>
                  <p className="text-zinc-500 font-sans text-xs mt-0.5">Find available doctors and clinics registered on the Primacy medical ledger.</p>
                </div>
                <div className="relative max-w-xs w-full">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search doctor or specialty..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {(() => {
                  const doctors = allUsers.filter(u => u.role === 'DOCTOR');
                  const filtered = doctors.filter(doc => {
                    const q = searchQuery.toLowerCase();
                    return doc.name.toLowerCase().includes(q) || 
                           (doc.specialty && doc.specialty.toLowerCase().includes(q));
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="col-span-full text-center py-6 text-xs text-zinc-400 italic">
                        No doctors matching '{searchQuery}' found on the network.
                      </div>
                    );
                  }

                  return filtered.map(doc => {
                    const docRequests = filteredRequests.filter(req => req.doctorId === doc.id);
                    const currentReq = docRequests.find(r => r.status === 'APPROVED') || 
                                       docRequests.find(r => r.status === 'PENDING') ||
                                       docRequests[0];
                    const docStatus = currentReq ? currentReq.status : 'DISCONNECTED';

                    return (
                      <div key={doc.id} className="p-4 bg-zinc-50/50 border border-zinc-200 rounded-2xl flex items-center justify-between shadow-sm hover:border-zinc-250 hover:bg-white transition-all">
                        <div>
                          <div className="font-sans font-bold text-xs text-zinc-900">{doc.name}</div>
                          <div className="font-mono text-[9px] text-zinc-400 mt-0.5">{doc.specialty || 'General Practitioner'}</div>
                          
                          <div className="mt-2.5">
                            {docStatus === 'APPROVED' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-150 rounded-full font-bold">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Secure Sync Active
                              </span>
                            )}
                            {docStatus === 'PENDING' && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono bg-amber-50 text-amber-800 border border-amber-150 rounded-full font-bold">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Approval
                              </span>
                            )}
                            {(docStatus === 'REVOKED' || docStatus === 'DISCONNECTED' || docStatus === 'REJECTED') && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-mono bg-zinc-100 text-zinc-450 border border-zinc-200 rounded-full">
                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Disconnected
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          {(docStatus === 'REVOKED' || docStatus === 'DISCONNECTED' || docStatus === 'REJECTED') ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedNodeId(doc.id);
                                setPreAuthPurpose('Routine Consultation');
                                setPreAuthPrivateKey(user.privateKey || '');
                                setPreAuthError('');
                                setPreAuthSuccess(false);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-bold font-mono text-[10px] shadow-sm transition-all cursor-pointer"
                            >
                              Connect
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedNodeId(doc.id);
                              }}
                              className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-600 font-mono text-[10px] shadow-sm transition-all cursor-pointer"
                            >
                              Inspect
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

            </div>

          </div>
        )}

      </main>

      {/* High-Resolution Zoom Display Lightbox Modal Dialog */}
      {selectedZoomPhoto && (
        <div 
          onClick={() => setSelectedZoomPhoto(null)}
          className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-zinc-200 rounded-2xl p-4 max-w-3xl w-full max-h-[92vh] flex flex-col relative animate-scale-up shadow-2xl cursor-default"
          >
            <div className="flex justify-between items-center pb-2.5 border-b border-zinc-150 mb-3.5">
              <h4 className="font-mono font-bold text-zinc-900 text-xs uppercase tracking-tight">
               Cryptographic Patient diagnostic Display Viewer
              </h4>
              <button
                onClick={() => setSelectedZoomPhoto(null)}
                className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-950 flex items-center justify-center flex-1 min-h-0">
              <img
                src={selectedZoomPhoto}
                alt="Patient diagnostic high-resolution display view"
                className="max-w-full max-h-[64vh] object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            
            <div className="mt-3.5 p-3 bg-zinc-50 border border-zinc-150 rounded-xl font-mono text-[9px] text-zinc-500 leading-relaxed text-center">
              🔒 256-Bit Encrypted Block Transit Integrity Validated • Referred as Direct Raw Sandbox Image Element • ReferrerPolicy "no-referrer"
            </div>
          </div>
        </div>
      )}

      {/* Passcode Unlock Modal Dialogue */}
      {isPasscodeModalOpen && (
        <div 
          className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-zinc-200 rounded-3xl p-6 max-w-sm w-full relative animate-scale-up shadow-2xl"
          >
            <div className="flex justify-between items-start pb-4 border-b border-zinc-150 mb-4">
              <div className="flex items-center gap-2.5 text-zinc-900">
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 shadow-sm">
                  <Lock className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-sm tracking-tight text-zinc-900 animate-pulse">
                    Unlock Private Key
                  </h4>
                  <p className="text-[10px] font-sans text-zinc-500 mt-0.5 uppercase tracking-wide">
                    Verification Required
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPasscodeModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <form onSubmit={handleVerifyPasscode} className="space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed font-sans">
                Please enter your security passcode to display your private signature key.
              </p>

              {passcodeError && (
                <div id="passcode-error-box" className="p-3 rounded-xl bg-red-50 border border-red-200 text-[11px] font-medium text-red-700 leading-relaxed">
                  ⚠️ {passcodeError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-zinc-550 uppercase tracking-wider">
                  Passcode
                </label>
                <div className="relative">
                  <input
                    type={showPasscode ? "text" : "password"}
                    required
                    autoFocus
                    value={passcodeAttempt}
                    onChange={(e) => setPasscodeAttempt(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2.5 pl-3.5 pr-10 text-sm font-mono text-zinc-900 focus:outline-none focus:border-zinc-400 hover:bg-white transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode(!showPasscode)}
                    className="absolute right-3.5 top-3 text-zinc-400 hover:text-zinc-655 focus:outline-none transition-colors cursor-pointer"
                    title={showPasscode ? "Hide passcode" : "Show passcode"}
                  >
                    {showPasscode ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>


              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasscodeModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 hover:border-zinc-300 text-xs font-mono font-bold text-zinc-650 hover:text-zinc-900 cursor-pointer bg-white transition-all text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-mono font-bold text-white cursor-pointer transition-all text-center shadow-sm"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
