'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/client';

type Mode = 'loading' | 'setup' | 'verify' | 'enroll' | 'blocked';

export function AdminMfaSetup({ returnTo = '/admin' }: { returnTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('loading');
  const [factorId, setFactorId] = useState('');
  const [pendingFactorId, setPendingFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return;
      const verified = data?.all.find((factor) => factor.factor_type === 'totp' && factor.status === 'verified');
      const unverified = data?.all.find((factor) => factor.factor_type === 'totp' && factor.status === 'unverified');
      if (verified) {
        setFactorId(verified.id);
        setMode('verify');
      } else if (unverified) {
        setPendingFactorId(unverified.id);
        setMode('blocked');
        setMessage('An unfinished setup is saved, but its QR code is no longer available in this page. Remove that unverified setup to create a fresh QR code.');
      } else if (error) {
        setMode('blocked');
        setMessage('Could not check authenticator status. Refresh the page and try again.');
      } else {
        setMode('setup');
      }
    });
    return () => { active = false; };
  }, [supabase]);

  async function beginSetup() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'MDvoro administrator authenticator',
      });
      if (error || !data) {
        setMessage('Could not start authenticator setup. Refresh the page and try again.');
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setMode('enroll');
    } catch {
      setMessage('Could not start authenticator setup. Refresh the page and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function discardPendingSetup() {
    if (busy || !pendingFactorId) return;
    setBusy(true);
    setMessage('');
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setMessage('Could not verify the pending setup. Refresh the page and try again.');
        return;
      }
      const pending = data?.all.find((factor) => factor.id === pendingFactorId && factor.factor_type === 'totp' && factor.status === 'unverified');
      if (!pending) {
        setMessage('The pending setup changed. Refresh this page to check the current authenticator status.');
        return;
      }
      const { error } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
      if (error) {
        setMessage('Could not remove the unfinished setup. Refresh the page and try again.');
        return;
      }
      setPendingFactorId('');
      setFactorId('');
      setQrCode('');
      setSecret('');
      setCode('');
      setMode('setup');
      setMessage('The unfinished setup was removed. Start again to get a new QR code.');
    } catch {
      setMessage('Could not remove the unfinished setup. Refresh the page and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy || !/^\d{6}$/.test(code) || !factorId) return;
    setBusy(true);
    setMessage('');
    try {
      let error: Error | null;
      if (mode === 'enroll') {
        const challenge = await supabase.auth.mfa.challenge({ factorId });
        if (challenge.error) {
          setMessage('Could not verify the code. Check your connection and try again.');
          return;
        }
        const verification = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
        error = verification.error;
      } else {
        const verification = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
        error = verification.error;
      }
      if (error) {
        setMessage('That code did not verify. Check your authenticator clock and try the current six-digit code.');
        return;
      }
      setMessage('Authenticator verified. Opening Content Studio…');
      router.replace(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo as Route : '/admin');
      router.refresh();
    } catch {
      setMessage('Could not verify the code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad" aria-labelledby="admin-mfa-title">
      <div className="kicker">ADMIN SECURITY</div>
      <h2 className="section-heading" id="admin-mfa-title">Authenticator verification</h2>
      <p className="panel-sub">Admin tools require a time-based one-time password (TOTP) to protect your account.</p>

      {mode === 'loading' && <p className="panel-sub" role="status">Checking authenticator status…</p>}

      {mode === 'setup' && (
        <div className="form">
          <p className="panel-sub">Set up an authenticator app such as Google Authenticator, Microsoft Authenticator, or 1Password. You will scan a QR code and enter its six-digit code.</p>
          <button className="btn btn-primary" type="button" onClick={() => void beginSetup()} disabled={busy}>
            {busy ? 'Starting setup…' : 'Set up authenticator'}
          </button>
        </div>
      )}

      {mode === 'blocked' && pendingFactorId && (
        <div className="form">
          <p className="panel-sub">The previous setup was not verified, and its private QR code was lost when the page closed. Remove only that unverified setup to start over.</p>
          <button className="btn btn-primary" type="button" onClick={() => void discardPendingSetup()} disabled={busy}>
            {busy ? 'Resetting setup…' : 'Reset unfinished setup'}
          </button>
        </div>
      )}

      {mode === 'verify' && (
        <div className="form">
          <label className="field">
            <span>Six-digit authenticator code</span>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" aria-label="Six-digit authenticator code" />
          </label>
          <button className="btn btn-primary" type="button" onClick={() => void verifyCode()} disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify and continue'}
          </button>
        </div>
      )}

      {mode === 'enroll' && (
        <div className="form">
          <p className="panel-sub">Scan this code in your authenticator app. Keep it private; anyone who scans it can generate sign-in codes for your account.</p>
          {/* Supabase returns this SVG data URL only to the signed-in account during enrollment. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="Private authenticator enrollment QR code" width={220} height={220} />
          <details>
            <summary>Can’t scan the QR code?</summary>
            <p className="panel-sub">Enter this setup key manually in your authenticator app:</p>
            <code>{secret}</code>
          </details>
          <label className="field">
            <span>Six-digit code from your authenticator</span>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" aria-label="Six-digit code from your authenticator" />
          </label>
          <button className="btn btn-primary" type="button" onClick={() => void verifyCode()} disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify authenticator'}
          </button>
          <p className="panel-sub field-note">Verifying MFA will sign out your other active sessions, as required by the authentication provider.</p>
        </div>
      )}

      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}
