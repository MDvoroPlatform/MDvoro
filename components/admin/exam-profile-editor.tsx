'use client';

import { useState } from 'react';

type ExamProfile = {
  total_duration_minutes: number;
  official_max_items: number;
  product_max_items: number;
  block_duration_minutes: number;
  block_max_items: number;
  block_count: number;
  break_minutes: number;
  previous_block_review_allowed: boolean;
  enabled: boolean;
  timing_verified: boolean;
  timing_source: string;
  timing_notes: string | null;
};

type Exam = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  profile: ExamProfile | null;
};

type FormState = {
  totalDurationMinutes: number;
  officialMaxItems: number;
  productMaxItems: number;
  blockDurationMinutes: number;
  blockMaxItems: number;
  blockCount: number;
  breakMinutes: number;
  previousBlockReviewAllowed: boolean;
  enabled: boolean;
  timingVerified: boolean;
  timingSource: string;
  timingNotes: string;
};

export function ExamProfileEditor({ exam }: { exam: Exam }) {
  const profile = exam.profile;
  const [form, setForm] = useState<FormState>({
    totalDurationMinutes: profile?.total_duration_minutes ?? 60,
    officialMaxItems: profile?.official_max_items ?? 60,
    productMaxItems: Math.min(300, profile?.product_max_items ?? 60),
    blockDurationMinutes: profile?.block_duration_minutes ?? 30,
    blockMaxItems: profile?.block_max_items ?? 20,
    blockCount: profile?.block_count ?? 1,
    breakMinutes: profile?.break_minutes ?? 0,
    previousBlockReviewAllowed: profile?.previous_block_review_allowed ?? true,
    enabled: profile?.enabled ?? true,
    timingVerified: profile?.timing_verified ?? false,
    timingSource: profile?.timing_source ?? 'operator_configured',
    timingNotes: profile?.timing_notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      if (form.productMaxItems > form.officialMaxItems) {
        throw new Error('MDvoro cap cannot exceed the official item limit');
      }
      const response = await fetch('/api/admin/exams', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ examId: exam.id, ...form }),
      });
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error(String(body.error ?? 'exam_profile_update_failed'));
      setMessage('Saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad">
      <div className="panel-head">
        <div>
          <div className="panel-title">{exam.code} · {exam.name}</div>
          <div className="panel-sub">{exam.description}</div>
        </div>
        <span className={`status ${form.timingVerified ? 'status-published' : 'status-draft'}`}>
          {form.timingVerified ? 'Timing verified' : 'Operator configured'}
        </span>
      </div>

      <div className="builder-grid compact-grid">
        <label className="field">
          <span>Total exam minutes</span>
          <input type="number" min={1} max={1440} value={form.totalDurationMinutes} onChange={(event) => patch('totalDurationMinutes', Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Official max items</span>
          <input type="number" min={1} max={1000} value={form.officialMaxItems} onChange={(event) => patch('officialMaxItems', Number(event.target.value))} />
        </label>
        <label className="field">
          <span>MDvoro max items</span>
          <input type="number" min={1} max={300} value={form.productMaxItems} onChange={(event) => patch('productMaxItems', Math.min(300, Number(event.target.value)))} />
        </label>
        <label className="field">
          <span>Block minutes</span>
          <input type="number" min={1} max={180} value={form.blockDurationMinutes} onChange={(event) => patch('blockDurationMinutes', Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Questions / block</span>
          <input type="number" min={1} max={200} value={form.blockMaxItems} onChange={(event) => patch('blockMaxItems', Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Block count</span>
          <input type="number" min={1} max={64} value={form.blockCount} onChange={(event) => patch('blockCount', Number(event.target.value))} />
        </label>
        <label className="field">
          <span>Break minutes</span>
          <input type="number" min={0} max={240} value={form.breakMinutes} onChange={(event) => patch('breakMinutes', Number(event.target.value))} />
        </label>
      </div>

      <div className="check-row"><input id={`${exam.id}-review`} type="checkbox" checked={form.previousBlockReviewAllowed} onChange={(event) => patch('previousBlockReviewAllowed', event.target.checked)} /><label htmlFor={`${exam.id}-review`}>Allow review of previous blocks</label></div>
      <div className="check-row"><input id={`${exam.id}-enabled`} type="checkbox" checked={form.enabled} onChange={(event) => patch('enabled', event.target.checked)} /><label htmlFor={`${exam.id}-enabled`}>Enable exam in student QBank</label></div>
      <div className="check-row"><input id={`${exam.id}-verified`} type="checkbox" checked={form.timingVerified} onChange={(event) => patch('timingVerified', event.target.checked)} /><label htmlFor={`${exam.id}-verified`}>Timing independently verified</label></div>
      <label className="field"><span>Timing source</span><input maxLength={120} value={form.timingSource} onChange={(event) => patch('timingSource', event.target.value)} /></label>
      <label className="field"><span>Timing notes</span><textarea rows={4} maxLength={1000} value={form.timingNotes} onChange={(event) => patch('timingNotes', event.target.value)} /></label>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save exam profile'}</button>{message && <span className="form-message">{message}</span>}</div>
    </section>
  );
}
