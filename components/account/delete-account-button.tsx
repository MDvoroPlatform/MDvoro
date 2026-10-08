'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/i18n/provider';

export function DeleteAccountButton() {
  const { messages: m } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function remove() {
    if (value !== 'DELETE' || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: value }),
      });
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        setMessage(String(body.error ?? m.common.error));
        return;
      }
      router.replace('/login');
      router.refresh();
    } catch {
      setMessage(m.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <p className="panel-sub">{m.settings.accountDeletionDescription}</p>
      <label className="field">
        <span>{m.settings.accountDeletionConfirm}</span>
        <input value={value} onChange={(event) => setValue(event.target.value.toUpperCase())} autoComplete="off" inputMode="text" />
      </label>
      <button className="btn btn-danger" disabled={busy || value !== 'DELETE'} onClick={() => void remove()} type="button">
        {busy ? m.auth.pleaseWait : m.settings.accountDeletionAction}
      </button>
      {message && <span className="form-message error">{message}</span>}
    </div>
  );
}
