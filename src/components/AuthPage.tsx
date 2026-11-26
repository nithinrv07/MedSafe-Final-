import React, { useState } from 'react';
import { Shield, Key, Mail, Lock, User, Eye, EyeOff, Loader2, Award, ClipboardList, ShieldCheck, ArrowLeft, Download, Copy, Check } from 'lucide-react';
import { UserRole, UserProfile } from '../types';
import { deriveAuthKey, generateUserKeys, unwrapPrivateKey, wrapPrivateKey } from '../utils/vaultCrypto';
import { api } from '../api';
import Logo from './Logo';

interface AuthPageProps {
  onBack: () => void;
  /** Called with the signed-in user; `privateKey` is set (unlocked in this browser). */
  onAuthSuccess: (user: UserProfile) => void;
  initialMode?: 'LOGIN' | 'REGISTER';
}

const MIN_PASSCODE_LENGTH = 8;

export default function AuthPage({
  onBack,
  onAuthSuccess,
  initialMode = 'LOGIN'
}: AuthPageProps) {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>(initialMode);
  const [role, setRole] = useState<UserRole>(() => {
    return (localStorage.getItem('medsafe_auth_role') as any) || 'PATIENT';
  });

  // Form values. The passcode is only ever held in memory.
  const [email, setEmail] = useState(() => localStorage.getItem('medsafe_auth_email') || '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [specialty, setSpecialty] = useState('General & Family Practice');

  // Interactive UI states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // Keys generated during registration, shown once on the key card screen. Memory only.
  const [generatedKeys, setGeneratedKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [registeredUser, setRegisteredUser] = useState<UserProfile | null>(null);
  const [copiedKey, setCopiedKey] = useState<'PUBLIC' | 'PRIVATE' | null>(null);

  // OTP related states
  const [otpMode, setOtpMode] = useState<'NONE' | 'LOGIN_VERIFY' | 'REGISTER_VERIFY'>('NONE');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState<string[]>(Array(6).fill(''));
  const [otpTimer, setOtpTimer] = useState<number>(0);
  // Only set when the server runs in local development with OTP_DEV_ECHO=true.
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    localStorage.setItem('medsafe_auth_role', role);
  }, [role]);

  React.useEffect(() => {
    localStorage.setItem('medsafe_auth_email', email);
  }, [email]);

  // Countdown timer effect
  React.useEffect(() => {
    let interval: any;
    if (otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpTimer]);

  const startOtpStep = (data: { challengeId: string; devOtp?: string }, target: 'LOGIN_VERIFY' | 'REGISTER_VERIFY') => {
    setChallengeId(data.challengeId);
    setSimulatedOtp(data.devOtp ?? null);
    setOtpMode(target);
    setOtpCode(Array(6).fill(''));
    setOtpTimer(30);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);
    try {
      const authKey = await deriveAuthKey(password, email);
      const data = await api.post('/api/auth/login', { email, role, authKey });
      startOtpStep(data, 'LOGIN_VERIFY');
    } catch (err: any) {
      setErrorMessage(err.message || 'Sign-in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!name || !email || !password) {
      setErrorMessage('Please fill in all mandatory fields.');
      return;
    }
    if (password.length < MIN_PASSCODE_LENGTH) {
      setErrorMessage(`Your passcode must be at least ${MIN_PASSCODE_LENGTH} characters. It protects your private key, so make it strong.`);
      return;
    }
    if (role === 'DOCTOR' && !licenseNumber) {
      setErrorMessage('Medical registration or state license number is required for Clinician role verification.');
      return;
    }

    setIsLoading(true);
    try {
      // Keys are generated in this browser. Only the public key and the
      // passcode-encrypted private key are sent to the server.
      const keys = await generateUserKeys();
      const [authKey, encryptedPrivateKey] = await Promise.all([
        deriveAuthKey(password, email),
        wrapPrivateKey(keys.privateKey, password),
      ]);
      const data = await api.post('/api/auth/register', {
        email,
        role,
        name,
        authKey,
        publicKey: keys.publicKey,
        encryptedPrivateKey,
        ...(role === 'DOCTOR' ? { licenceNumber: licenseNumber, specialty } : {}),
      });
      setGeneratedKeys(keys);
      startOtpStep(data, 'REGISTER_VERIFY');
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!challengeId) return;
    setErrorMessage('');
    try {
      const data = await api.post('/api/auth/resend', { challengeId });
      setSimulatedOtp(data.devOtp ?? null);
      setOtpTimer(30);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const otp = otpCode.join('');
    if (otp.length !== 6) {
      setErrorMessage('Please enter the full 6-digit OTP code.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const { user } = await api.post('/api/auth/verify', { challengeId, otp });

      if (otpMode === 'REGISTER_VERIFY') {
        // Show the key card once before entering the dashboard.
        setRegisteredUser(user);
        setOtpMode('NONE');
        return;
      }

      // Unlock the private key in this browser with the passcode.
      const privateKey = await unwrapPrivateKey(user.encryptedPrivateKey, password);
      setPassword('');
      onAuthSuccess({ ...user, privateKey });
    } catch (err: any) {
      setErrorMessage(err.message || 'OTP verification failed.');
      if (/sign in again|expired/i.test(err.message || '')) setOtpMode('NONE');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleOtpChange = (element: HTMLInputElement, index: number) => {
    const val = element.value;
    if (isNaN(Number(val))) return;

    const newCode = [...otpCode];
    newCode[index] = val.substring(val.length - 1);
    setOtpCode(newCode);

    if (val && element.nextElementSibling) {
      (element.nextElementSibling as HTMLInputElement).focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      const newCode = [...otpCode];
      if (!otpCode[index] && e.currentTarget.previousElementSibling) {
        const prevInput = e.currentTarget.previousElementSibling as HTMLInputElement;
        prevInput.focus();
        newCode[index - 1] = '';
      } else {
        newCode[index] = '';
      }
      setOtpCode(newCode);
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (pastedData.length === 6 && !isNaN(Number(pastedData))) {
      setOtpCode(pastedData.split(''));
      const container = e.currentTarget.parentElement;
      if (container) {
        const lastInput = container.children[5] as HTMLInputElement;
        if (lastInput) lastInput.focus();
      }
    }
  };

  const finalizeRegistration = () => {
    if (!generatedKeys || !registeredUser) return;
    setPassword('');
    onAuthSuccess({ ...registeredUser, privateKey: generatedKeys.privateKey });
  };

  const copyToClipboard = (text: string, type: 'PUBLIC' | 'PRIVATE') => {
    navigator.clipboard.writeText(text);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Demo shortcut login helper
  const handleDemoShortcut = (demoEmail: string, demoRole: UserRole) => {
    setEmail(demoEmail);
    setRole(demoRole);
  };

  return (
    <div id="auth-page-root" className="min-h-screen bg-blue-50/40 text-zinc-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative selection:bg-blue-100 selection:text-blue-900">
      
      {/* Background subtle effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.04),transparent_60%)] pointer-events-none" />
      
      <div className="max-w-xl w-full space-y-6 relative z-10">
        
        {/* Navigation back and branding */}
        <div className="flex flex-col items-center">
          <button
            id="auth-back-btn"
            onClick={onBack}
            className="self-start inline-flex items-center gap-1.5 text-xs font-mono text-blue-600 hover:text-blue-800 transition-all bg-blue-50/50 hover:bg-blue-100/50 px-3 py-1.5 rounded-lg border border-blue-200 cursor-pointer shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </button>
          
          <div className="mt-6 relative flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 shadow-sm overflow-hidden text-teal-400">
            <Logo className="object-contain w-full h-full p-1" />
          </div>
          <h2 className="mt-4 text-center text-2xl font-extrabold font-display text-teal-700 tracking-tight">
            {(registeredUser && generatedKeys) 
              ? 'Your Keys are Generated' 
              : mode === 'LOGIN' 
                ? 'Sign In to Private Vault' 
                : 'Initialize Primacy Keys'}
          </h2>
          <p className="mt-1 text-center text-xs md:text-sm font-sans text-zinc-500 max-w-sm">
            {(registeredUser && generatedKeys) 
              ? 'Primacy ownership starts here. Save these credentials securely.' 
              : mode === 'LOGIN' 
                ? 'Unlock your encrypted medical profile matching your secure roles.' 
                : 'Develop your public ledger parameters and asymmetric credentials.'}
          </p>
        </div>

        {/* Outer container */}
        <div className="bg-white rounded-3xl border border-zinc-200 p-8 shadow-md">
          
          {/* CRITICAL: Generated Key Card Presentation Screen */}
          {(registeredUser && generatedKeys) ? (
            <div id="key-generator-handout" className="space-y-6">
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 flex gap-3 text-sm text-teal-900">
                <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-teal-650" />
                <div>
                  <h4 className="font-bold font-display text-teal-950">Asymmetric Key Pair Provisioned!</h4>
                  <p className="text-xs text-teal-700/90 font-sans mt-0.5">
                    A real RSA-2048 key pair was generated in your browser. Your public key encrypts your records and lets the server verify your consent signatures; your private key decrypts and signs. It is stored only encrypted with your passcode.
                  </p>
                </div>
              </div>

              {/* Public Key Display */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-mono text-zinc-550">
                  <span className="flex items-center gap-1.5 text-zinc-700">
                    <Key className="h-3.5 w-3.5 text-teal-600" /> Public Key (Published on Directory)
                  </span>
                  <button
                    onClick={() => copyToClipboard(generatedKeys.publicKey, 'PUBLIC')}
                    className="flex items-center gap-1.5 py-1 px-2.5 rounded bg-zinc-50 hover:bg-zinc-100 text-zinc-600 transition-all cursor-pointer border border-zinc-200 text-[10px]"
                  >
                    {copiedKey === 'PUBLIC' ? <Check className="h-3 w-3 text-emerald-600 font-bold" /> : <Copy className="h-3 w-3" />}
                    {copiedKey === 'PUBLIC' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="p-3.5 bg-zinc-50 rounded-xl text-[10px] font-mono text-teal-800 border border-zinc-200 break-all h-20 overflow-y-auto leading-relaxed select-all">
                  {generatedKeys.publicKey}
                </pre>
              </div>

              {/* Private Key Display */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-mono text-zinc-550">
                  <span className="flex items-center gap-1.5 text-zinc-700">
                    <Lock className="h-3.5 w-3.5 text-amber-600" /> Private Signature Key (Containment Secret)
                  </span>
                  <button
                    onClick={() => copyToClipboard(generatedKeys.privateKey, 'PRIVATE')}
                    className="flex items-center gap-1.5 py-1 px-2.5 rounded bg-zinc-50 hover:bg-zinc-100 text-zinc-600 transition-all cursor-pointer border border-zinc-200 text-[10px]"
                  >
                    {copiedKey === 'PRIVATE' ? <Check className="h-3 w-3 text-emerald-600 font-bold" /> : <Copy className="h-3 w-3" />}
                    {copiedKey === 'PRIVATE' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="p-3.5 bg-zinc-50 rounded-xl text-[10px] font-mono text-amber-800 border border-zinc-200 break-all h-24 overflow-y-auto leading-relaxed select-all">
                  {generatedKeys.privateKey}
                </pre>
                <p className="text-[10px] text-amber-700/90 font-mono italic mt-1 bg-amber-50 rounded p-1.5 border border-amber-200/50">
                  This key was generated in your browser. The server only stores a copy encrypted with your passcode, so if you forget your passcode your records cannot be recovered.
                </p>
              </div>

              {/* Confirm Finish Button */}
              <button
                onClick={finalizeRegistration}
                className="w-full inline-flex justify-center items-center rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white py-3 text-xs md:text-sm font-bold shadow-sm transition-all cursor-pointer"
              >
                Assemble Cryptographic Ledger & Sign In
              </button>
            </div>
          ) : otpMode !== 'NONE' ? (
            /* OTP Verification Screen */
            <div id="otp-verification-container" className="space-y-6 animate-fade-in">
              <div className="text-center">
                <h3 className="text-lg font-bold font-display text-zinc-900">Email Verification Required</h3>
                <p className="text-xs text-zinc-505 mt-2 max-w-sm mx-auto leading-relaxed">
                  A 6-digit verification code has been dispatched to <span className="font-semibold text-zinc-800 font-mono text-[11px] bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">{email}</span>.
                </p>
              </div>

              {simulatedOtp && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950">
                  <div className="font-bold flex items-center gap-1.5 text-blue-900">
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    Local development mode
                  </div>
                  <p className="text-blue-700 mt-1 text-[11px] leading-relaxed">
                    Email is not configured and OTP_DEV_ECHO is on, so the code is shown here. This never happens in production: <strong className="font-mono text-sm bg-white/80 border border-blue-200 px-2 py-0.5 rounded text-blue-950 font-bold tracking-wider select-all">{simulatedOtp}</strong>
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="flex justify-between gap-2 max-w-[280px] mx-auto">
                  {otpCode.map((digit, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(e.target, idx)}
                      onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                      onPaste={idx === 0 ? handleOtpPaste : undefined}
                      className="w-10 h-12 bg-zinc-50 border border-zinc-200 rounded-lg text-center text-lg font-bold font-mono focus:outline-none focus:border-blue-400 focus:bg-blue-50/50 transition-all text-zinc-800 focus:ring-4 focus:ring-blue-500/10"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isVerifyingOtp || otpCode.some(d => d === '')}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 text-sm shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isVerifyingOtp ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying Code...
                    </>
                  ) : (
                    'Verify Credentials'
                  )}
                </button>
              </form>

              <div className="text-center space-y-2">
                <div className="text-xs text-zinc-500">
                  {otpTimer > 0 ? (
                    <span>Resend verification code in <strong className="font-mono">{otpTimer}s</strong></span>
                  ) : (
                    <button
                      onClick={handleResend}
                      className="text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer"
                    >
                      Resend Verification Code
                    </button>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => { setOtpMode('NONE'); setErrorMessage(''); setChallengeId(null); }}
                    className="text-blue-400 hover:text-blue-600 text-xs font-semibold hover:underline cursor-pointer"
                  >
                    Go Back & Edit Details
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Register / Login forms */
            <div id="standard-auth-container">
              {/* Role Toggle Selector */}
              <div className="grid grid-cols-2 gap-1.5 mb-6 p-1 bg-purple-50/60 rounded-xl border border-purple-200/60">
                <button
                  type="button"
                  onClick={() => setRole('PATIENT')}
                  className={`py-2 px-3 text-xs font-mono rounded-lg transition-all cursor-pointer ${
                    role === 'PATIENT'
                      ? 'bg-white text-purple-700 border border-purple-200/80 shadow-sm font-bold'
                      : 'text-purple-600/70 hover:text-purple-800 hover:bg-purple-100/50 border border-transparent'
                  }`}
                >
                  User Credentials
                </button>
                <button
                  type="button"
                  onClick={() => setRole('DOCTOR')}
                  className={`py-2 px-3 text-xs font-mono rounded-lg transition-all cursor-pointer ${
                    role === 'DOCTOR'
                      ? 'bg-white text-purple-700 border border-purple-200/80 shadow-sm font-bold'
                      : 'text-purple-600/70 hover:text-purple-800 hover:bg-purple-100/50 border border-transparent'
                  }`}
                >
                  Licensed Clinician
                </button>
              </div>

              {errorMessage && (
                <div id="auth-error-box" className="p-3.5 mb-5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-750 leading-relaxed">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={mode === 'LOGIN' ? handleLogin : handleRegister} className="space-y-4">
                
                {/* Full name field ONLY in Register */}
                {mode === 'REGISTER' && (
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-1.5 uppercase">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Victor Raj"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-400 focus:bg-blue-50/50 focus:ring-4 focus:ring-blue-500/10 hover:bg-white transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Email address */}
                <div>
                  <label className="block text-xs font-mono text-zinc-500 mb-1.5 uppercase">
                    E-Mail Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={role === 'PATIENT' ? 'Victorraj@gmail.com' : 'dr.sam21@gmail.com'}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-400 focus:bg-blue-50/50 focus:ring-4 focus:ring-blue-500/10 hover:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* License details for Doctors */}
                {mode === 'REGISTER' && role === 'DOCTOR' && (
                  <div id="clinician-fields-group" className="grid grid-cols-2 gap-3 animate-fade-in">
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-1.5 uppercase">
                        State License Number
                      </label>
                      <div className="relative">
                        <Award className="absolute left-3 top-3 h-4 w-4 text-indigo-500" />
                        <input
                          type="text"
                          required
                          value={licenseNumber}
                          onChange={(e) => setLicenseNumber(e.target.value)}
                          placeholder="MD-94021-TX"
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-400 focus:bg-blue-50/50 focus:ring-4 focus:ring-blue-500/10 hover:bg-white transition-all h-[38px]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-1.5 uppercase">
                        Medical Specialty
                      </label>
                      <select
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 px-3 text-xs text-zinc-900 focus:outline-none focus:border-blue-400 focus:bg-blue-50/50 focus:ring-4 focus:ring-blue-500/10 h-[38px] cursor-pointer hover:bg-white transition-all"
                      >
                        <option value="Cardiovascular Medicine">Cardiology</option>
                        <option value="Neurology & Sleep Medicine">Neurology</option>
                        <option value="Oncology Care">Oncology</option>
                        <option value="Internal Medicine">Internal Med</option>
                        <option value="General & Family Practice">Family Practice</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Password field */}
                <div>
                  <label className="block text-xs font-mono text-zinc-500 mb-1.5 uppercase">
                    Security Passcode
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2.5 pl-10 pr-10 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-blue-400 focus:bg-blue-50/50 focus:ring-4 focus:ring-blue-500/10 hover:bg-white transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-zinc-400 hover:text-zinc-655 focus:outline-none transition-colors cursor-pointer"
                      title={showPassword ? "Hide passcode" : "Show passcode"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 px-4 text-sm shadow-sm transition-all cursor-pointer disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {mode === 'LOGIN' ? 'Accessing Secure Ledger...' : 'Constructing RSA Parameters...'}
                    </>
                  ) : (
                    mode === 'LOGIN' ? 'Verify Digital Credentials' : 'Generate Secure Locker Keys'
                  )}
                </button>
              </form>

              {/* Mode Toggle Link */}
              <div className="mt-6 text-center text-xs font-sans text-zinc-500">
                {mode === 'LOGIN' ? (
                  <span>
                    No primacy key pair?{' '}
                    <button
                      onClick={() => { setMode('REGISTER'); setErrorMessage(''); }}
                      className="text-teal-650 hover:text-teal-700 cursor-pointer font-bold underline"
                    >
                      Initialize new keys
                    </button>
                  </span>
                ) : (
                  <span>
                    Already own a registered key card?{' '}
                    <button
                      onClick={() => { setMode('LOGIN'); setErrorMessage(''); }}
                      className="text-teal-650 hover:text-teal-700 cursor-pointer font-bold underline"
                    >
                      Log in here
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
