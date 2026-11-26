import React, { useState } from 'react';
import { UserProfile } from '../../types';
import QRCode from 'qrcode';

interface QrPassCardProps {
  user: UserProfile;
}

/** QR pass a doctor can scan. The QR image is generated locally. */
export default function QrPassCard({ user }: QrPassCardProps) {
  // QR pass is generated locally; the patient id is never sent to a third-party QR service.
  const [qrDataUrl, setQrDataUrl] = useState('');
  React.useEffect(() => {
    QRCode.toDataURL(user.id, { width: 260, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [user.id]);

  return (
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
  );
}
