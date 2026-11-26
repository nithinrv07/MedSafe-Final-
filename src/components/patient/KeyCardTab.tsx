import React, { useState } from 'react';
import { Eye, EyeOff, Key, Lock } from 'lucide-react';
import { UserProfile, AccessRequest } from '../../types';
import type { AddLogHandler } from './types';
import IdentityCard from './IdentityCard';
import QrPassCard from './QrPassCard';
import PasscodeModal from './PasscodeModal';

interface KeyCardTabProps {
  user: UserProfile;
  requests: AccessRequest[];
  onAddLog: AddLogHandler;
}

/** "Key Card" tab: identity card, QR pass and the key drawers (private key behind the passcode). */
export default function KeyCardTab({ user, onAddLog }: KeyCardTabProps) {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);

  const handleShowKeyClick = () => {
    if (showPrivateKey) setShowPrivateKey(false);
    else setIsPasscodeModalOpen(true);
  };

  return (
    <>
    <div id="patient-key-view" className="space-y-6 bg-blue-50/30 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-blue-100/50 shadow-sm">

      <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-100/60 mb-6">
        <h3 className="font-display text-2xl font-bold text-teal-950">Your Key Card</h3>
        <p className="text-sm font-sans text-teal-800/80 mt-1 leading-relaxed">
          Only you have the corresponding secret key which is needed to provide clinical decrypted read permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <IdentityCard user={user} />
        <QrPassCard user={user} />
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

      {isPasscodeModalOpen && (
        <PasscodeModal
          user={user}
          onAddLog={onAddLog}
          onUnlocked={() => { setShowPrivateKey(true); setIsPasscodeModalOpen(false); }}
          onCancel={() => setIsPasscodeModalOpen(false)}
        />
      )}
    </>
  );
}
