'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function QuestionDeleteButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function remove() {
    if (busy || !window.confirm('Permanently delete this question? This cannot be undone.')) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/questions/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(body.error === 'question_in_use'
          ? 'This question has saved attempts or sessions. Archive it instead to preserve history.'
          : body.error === 'question_delete_failed' ? 'Could not delete the question.' : body.error);
        return;
      }
      router.push('/admin/questions');
      router.refresh();
    } catch {
      setMessage('Could not delete the question.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="question-delete-control">
    <button className="btn btn-danger" disabled={busy} onClick={() => void remove()} type="button">{busy ? 'Deleting…' : 'Delete question'}</button>
    {message && <small role="status">{message}</small>}
  </div>;
}
