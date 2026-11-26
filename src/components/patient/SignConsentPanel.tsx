import React, { useState } from 'react';
import { Key } from 'lucide-react';
import { UserProfile } from '../../types';

interface SignConsentPanelProps {
  user: UserProfile;
  requestId: string;
  /** Called once the key is confirmed; App then signs (RSA-PSS) and re-wraps record keys. */
  onConfirm: (requestId: string) => void;
  onCancel: () => void;
}

/** Confirmation step shown before the patient signs an approval. */
export default function SignConsentPanel({ user, requestId, onConfirm, onCancel }: SignConsentPanelProps) {
  const [privateKeyConfirmInput, setPrivateKeyConfirmInput] = useState(user.privateKey || '');
  const [privateKeyError, setPrivateKeyError] = useState('');

  const handleSignConfirm = () => {
    if (!user.privateKey) {
      setPrivateKeyError('Unlock your vault with your passcode first.');
      return;
    }
    if (privateKeyConfirmInput.trim() !== user.privateKey.trim()) {
      setPrivateKeyError('This private key does not match your account.');
      return;
    }
    onConfirm(requestId);
  };

  return (
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
            onClick={onCancel}
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
  );
}
