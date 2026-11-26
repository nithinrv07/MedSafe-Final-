import React, { useState } from 'react';
import { Shield, Copy } from 'lucide-react';
import { UserProfile } from '../../types';
import Logo from '../Logo';

interface IdentityCardProps {
  user: UserProfile;
}

/** Visual identity card with copyable public/private key buttons. */
export default function IdentityCard({ user }: IdentityCardProps) {
  const [copiedText, setCopiedText] = useState<'PUBLIC' | 'PRIVATE' | null>(null);
  const copyText = (txt: string, type: 'PUBLIC' | 'PRIVATE') => {
    navigator.clipboard.writeText(txt);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 1500);
  };

  return (
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
  );
}
