import React, { useState } from 'react';
import { Lock, X, Eye, EyeOff } from 'lucide-react';
import { UserProfile } from '../../types';
import type { AddLogHandler } from './types';
import { unwrapPrivateKey } from '../../utils/vaultCrypto';

interface PasscodeModalProps {
  user: UserProfile;
  onAddLog: AddLogHandler;
  onUnlocked: () => void;
  onCancel: () => void;
}

/** Asks for the passcode and checks it by decrypting the stored private key. */
export default function PasscodeModal({ user, onAddLog, onUnlocked, onCancel }: PasscodeModalProps) {
  const [passcodeAttempt, setPasscodeAttempt] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
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
      onUnlocked();
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

  return (
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
            onClick={onCancel}
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
              onClick={onCancel}
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
  );
}
