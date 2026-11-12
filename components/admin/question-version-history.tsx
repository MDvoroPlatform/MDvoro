'use client';

import { useState } from 'react';

export type QuestionVersion = {
  id: string;
  version_no: number;
  stem: string;
  subject: string;
  topic: string | null;
  created_at: string;
  authoring_metadata: Record<string, unknown> | null;
};

export function QuestionVersionHistory({ questionId, versions, canRestore = false }: {
  questionId: string;
  versions: QuestionVersion[];
  canRestore?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function restore(version: QuestionVersion) {
    const hasMetadataSnapshot = Boolean(version.authoring_metadata);
    const detail = hasMetadataSnapshot
      ? 'This restores the question content and the metadata snapshot saved with that version.'
      : 'This older version has no metadata snapshot. It restores question text and answers while keeping current media and metadata.';
    if (!window.confirm(`Restore version ${version.version_no}? ${detail} The current state will remain in version history.`)) return;
    setBusyId(version.id);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/questions/${questionId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: version.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'restore_failed');
      window.location.reload();
    } catch {
      setMessage(`Could not restore version ${version.version_no}.`);
    } finally {
      setBusyId(null);
    }
  }

  return <section className="card card-pad">
    <div className="panel-head"><div><div className="panel-title">Version history</div><div className="panel-sub">Every restore creates a new version and preserves the question’s publication state.</div></div></div>
    {versions.length ? <div className="admin-mini-list">{versions.map((version, index) => <div key={version.id}>
      <span><b>Version {version.version_no}{index === 0 ? ' · Current' : ''}</b><small>{version.subject}{version.topic ? ` · ${version.topic}` : ''}</small><small>{version.stem.slice(0, 120)}{version.stem.length > 120 ? '…' : ''}</small></span>
      <div><small>{new Date(version.created_at).toLocaleString()}</small>{canRestore && index > 0 && <button className="btn" type="button" disabled={busyId !== null} onClick={() => void restore(version)}>{busyId === version.id ? 'Restoring…' : 'Restore'}</button>}</div>
    </div>)}</div> : <p className="panel-sub">No saved versions are available.</p>}
    {message && <p className="form-message" role="alert">{message}</p>}
  </section>;
}
