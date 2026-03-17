import { useState } from 'react';
import { useSetAtom } from 'jotai';
import {
  IoMailOutline, IoLogoGoogle, IoServerOutline, IoShieldCheckmarkOutline,
  IoOpenOutline, IoCopyOutline, IoCheckmarkOutline,
} from 'react-icons/io5';
import { hasAccountsAtom, checkAccountsAtom, loadThreadsAtom, dbReadyAtom } from '../atoms/app';

type Step = 'choose' | 'oauth-waiting' | 'imap' | 'connecting';

const imapProviders = [
  { id: 'yahoo', label: 'Yahoo', imap: 'imap.mail.yahoo.com', imapPort: 993, smtp: 'smtp.mail.yahoo.com', smtpPort: 465, security: 'SSL / TLS' },
  { id: 'imap', label: 'Other (IMAP)', imap: '', imapPort: 993, smtp: '', smtpPort: 465, security: 'SSL / TLS' },
];

export default function Onboarding({ onComplete }: { onComplete?: () => void } = {}) {
  const [step, setStep] = useState<Step>('choose');
  const [selectedProvider, setSelectedProvider] = useState<typeof imapProviders[0] | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(465);
  const [security, setSecurity] = useState('SSL / TLS');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const setHasAccounts = useSetAtom(hasAccountsAtom);
  const checkAccounts = useSetAtom(checkAccountsAtom);
  const loadThreads = useSetAtom(loadThreadsAtom);
  const setDbReady = useSetAtom(dbReadyAtom);

  const finishSetup = () => {
    setStatus('Syncing your email...');
    setDbReady(true);
    setHasAccounts(true);
    checkAccounts();
    setTimeout(() => loadThreads(), 3000);
    if (onComplete) setTimeout(() => onComplete(), 1500);
  };

  const handleOAuth = async (provider: 'gmail' | 'outlook') => {
    setError('');
    setStatus(provider === 'gmail' ? 'Waiting for Google sign-in...' : 'Waiting for Microsoft sign-in...');

    try {
      // Step 1: Get auth URL and start callback server
      const beginResult = await window.api.beginOAuth(provider);
      if (!beginResult.success) {
        setError(beginResult.error || 'Failed to start sign-in');
        return;
      }

      setAuthUrl(beginResult.url);
      setStep('oauth-waiting');

      // Step 2: Wait for callback in background
      const result = await window.api.awaitOAuth();
      if (result.success) {
        setStep('connecting');
        finishSetup();
      } else {
        setError(result.error || 'Sign-in failed');
        setStep('choose');
      }
    } catch (err: any) {
      setError(err.message || 'Sign-in failed');
      setStep('choose');
    }
  };

  const openAuthUrl = () => {
    if (authUrl) window.api.openExternal(authUrl);
  };

  const copyAuthUrl = () => {
    if (authUrl) {
      navigator.clipboard.writeText(authUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const cancelOAuth = () => {
    window.api.cancelOAuth();
    setStep('choose');
    setAuthUrl('');
    setError('');
  };

  const selectImapProvider = (p: typeof imapProviders[0]) => {
    setSelectedProvider(p);
    setImapHost(p.imap);
    setImapPort(p.imapPort);
    setSmtpHost(p.smtp);
    setSmtpPort(p.smtpPort);
    setSecurity(p.security);
    setStep('imap');
  };

  const handleImapConnect = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setStep('connecting');
    setError('');
    setStatus('Adding account...');

    try {
      const result = await window.api.addAccount({
        name: name || email.split('@')[0],
        emailAddress: email,
        provider: selectedProvider?.id || 'imap',
        settings: {
          imap_host: imapHost,
          imap_port: imapPort,
          imap_username: email,
          imap_password: password,
          imap_security: security,
          imap_allow_insecure_ssl: false,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_username: email,
          smtp_password: password,
          smtp_security: security,
          smtp_allow_insecure_ssl: false,
        },
      });

      if (result.success) {
        finishSetup();
      } else {
        setError(result.error || 'Failed to add account');
        setStep('imap');
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed');
      setStep('imap');
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-bg-primary">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <IoMailOutline size={32} className="text-accent" />
          </div>
          <h1 className="text-xl font-bold text-text-primary">Welcome to Mailautumn</h1>
          <p className="text-sm text-text-secondary mt-1">Connect your email account to get started</p>
        </div>

        {step === 'choose' && (
          <div className="space-y-3">
            {/* OAuth buttons */}
            <button
              onClick={() => handleOAuth('gmail')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white hover:bg-gray-50 transition-colors cursor-pointer text-left border border-gray-200"
            >
              <IoLogoGoogle size={20} className="text-[#4285f4] shrink-0" />
              <span className="text-sm font-medium text-gray-800">Sign in with Google</span>
            </button>

            <button
              onClick={() => handleOAuth('outlook')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#0078d4] hover:bg-[#106ebe] transition-colors cursor-pointer text-left"
            >
              <svg viewBox="0 0 21 21" width={20} height={20} className="shrink-0">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              <span className="text-sm font-medium text-white">Sign in with Microsoft</span>
            </button>

            {/* Separator */}
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1 h-px bg-border-primary" />
              <span className="text-xxs text-text-tertiary uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-border-primary" />
            </div>

            {/* IMAP options */}
            {imapProviders.map(p => (
              <button
                key={p.id}
                onClick={() => selectImapProvider(p)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border-primary bg-bg-secondary hover:bg-bg-hover transition-colors cursor-pointer text-left"
              >
                <IoServerOutline size={18} className="text-text-tertiary shrink-0" />
                <span className="text-sm font-medium text-text-primary">{p.label}</span>
              </button>
            ))}

            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                {error}
              </div>
            )}
          </div>
        )}

        {step === 'oauth-waiting' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <IoShieldCheckmarkOutline size={24} className="text-accent" />
              </div>
              <p className="text-sm text-text-primary font-medium">{status}</p>
              <p className="text-xs text-text-tertiary mt-1">Sign in via your browser, then return here</p>
            </div>

            {/* Auth URL actions */}
            <div className="flex gap-2">
              <button
                onClick={openAuthUrl}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-accent-text text-sm font-medium hover:bg-accent-hover transition-colors cursor-pointer"
              >
                <IoOpenOutline size={16} />
                Open in Browser
              </button>
              <button
                onClick={copyAuthUrl}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border-primary text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
                title="Copy link"
              >
                {copied ? <IoCheckmarkOutline size={16} /> : <IoCopyOutline size={16} />}
                {copied ? 'Copied' : 'Copy Link'}
              </button>
            </div>

            <button
              onClick={cancelOAuth}
              className="w-full px-4 py-2 rounded-lg text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                {error}
              </div>
            )}
          </div>
        )}

        {step === 'imap' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50"
              />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50"
                autoFocus
              />
              <input
                type="password"
                placeholder="Password (or app password)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent/50"
              />

              {selectedProvider?.id === 'imap' && (
                <>
                  <div className="border-t border-border-secondary pt-3 mt-3">
                    <span className="text-xxs text-text-tertiary uppercase tracking-wider">Server Settings</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="IMAP host" value={imapHost} onChange={e => setImapHost(e.target.value)}
                      className="col-span-2 px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none" />
                    <input type="number" placeholder="Port" value={imapPort} onChange={e => setImapPort(Number(e.target.value))}
                      className="px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="SMTP host" value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                      className="col-span-2 px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary placeholder:text-text-tertiary outline-none" />
                    <input type="number" placeholder="Port" value={smtpPort} onChange={e => setSmtpPort(Number(e.target.value))}
                      className="px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none" />
                  </div>
                  <select value={security} onChange={e => setSecurity(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-primary outline-none cursor-pointer">
                    <option value="SSL / TLS">SSL / TLS</option>
                    <option value="STARTTLS">STARTTLS</option>
                    <option value="none">None</option>
                  </select>
                </>
              )}
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setStep('choose'); setError(''); }}
                className="px-4 py-2.5 rounded-lg border border-border-primary text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer">
                Back
              </button>
              <button onClick={handleImapConnect}
                className="flex-1 px-4 py-2.5 rounded-lg bg-accent text-accent-text text-sm font-medium hover:bg-accent-hover transition-colors cursor-pointer">
                Connect Account
              </button>
            </div>
          </div>
        )}

        {step === 'connecting' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <IoShieldCheckmarkOutline size={24} className="text-accent" />
            </div>
            <p className="text-sm text-text-primary font-medium">{status}</p>
            <p className="text-xs text-text-tertiary mt-1">This may take a moment...</p>
          </div>
        )}
      </div>
    </div>
  );
}
