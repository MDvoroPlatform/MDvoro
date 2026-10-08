'use client';
import { useState } from 'react';

type NoticeForm = {
  reporterName: string;
  reporterEmail: string;
  reporterPhone: string;
  reporterAddress: string;
  signature: string;
  workDescription: string;
  infringingLocation: string;
  goodFaithStatement: boolean;
  accuracyStatement: boolean;
};

const emptyForm: NoticeForm = {
  reporterName: '', reporterEmail: '', reporterPhone: '', reporterAddress: '', signature: '',
  workDescription: '', infringingLocation: '', goodFaithStatement: false, accuracyStatement: false,
};

export default function CopyrightPage() {
  const [form, setForm] = useState<NoticeForm>(emptyForm);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg('');
    try {
      const response = await fetch('/api/legal/copyright-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      await response.json().catch(() => ({}));
      setMsg(response.ok ? 'Notice submitted successfully.' : 'Could not submit the notice. Please check every field.');
      if (response.ok) setForm(emptyForm);
    } catch {
      setMsg('Could not submit the notice. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="eyebrow">Copyright operations</div>
      <h1>Copyright complaint</h1>
      <p className="subtitle">Historical examination material may appear as “שחזור” (reconstruction) with a year for educational purposes. The label is not a claim that the material is public-domain, officially released, or owned by MDvoro.</p>
      <p className="subtitle">MDvoro takes intellectual-property complaints seriously. This form creates an internal notice record; it does not by itself establish that a particular legal safe-harbor regime applies.</p>
      <div className="security-note"><strong>Israel-first policy:</strong> MDvoro will assess complaints under the applicable Israeli Copyright Law and other applicable law. If a U.S. DMCA process is used, the separate designated-agent and notice requirements must also be satisfied.</div>
      <div className="form-grid-2">
        <label className="field"><span>Name</span><input value={form.reporterName} onChange={e => setForm({ ...form, reporterName: e.target.value })}/></label>
        <label className="field"><span>Email</span><input type="email" value={form.reporterEmail} onChange={e => setForm({ ...form, reporterEmail: e.target.value })}/></label>
        <label className="field"><span>Phone</span><input value={form.reporterPhone} onChange={e => setForm({ ...form, reporterPhone: e.target.value })}/></label>
        <label className="field"><span>Mailing address</span><input value={form.reporterAddress} onChange={e => setForm({ ...form, reporterAddress: e.target.value })}/></label>
        <label className="field"><span>Electronic signature</span><input value={form.signature} onChange={e => setForm({ ...form, signature: e.target.value })}/></label>
        <label className="field"><span>Location of claimed infringement</span><input value={form.infringingLocation} onChange={e => setForm({ ...form, infringingLocation: e.target.value })}/></label>
      </div>
      <label className="field"><span>Original work description</span><textarea rows={6} value={form.workDescription} onChange={e => setForm({ ...form, workDescription: e.target.value })}/></label>
      <label className="check-row"><input type="checkbox" checked={form.goodFaithStatement} onChange={e => setForm({ ...form, goodFaithStatement: e.target.checked })}/><span>I have a good-faith belief that the complained-of use is not authorized by the rights holder or the law.</span></label>
      <label className="check-row"><input type="checkbox" checked={form.accuracyStatement} onChange={e => setForm({ ...form, accuracyStatement: e.target.checked })}/><span>The information is accurate and, where required, I am authorized to act for the rights holder.</span></label>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy || !form.goodFaithStatement || !form.accuracyStatement} onClick={() => void submit()}>{busy ? 'Submitting…' : 'Submit complaint'}</button>{msg && <span className="form-message">{msg}</span>}</div>
      <p className="legal-disclaimer">Israel&apos;s Copyright Law, 2007 remains the primary Israeli copyright statute and was amended as recently as July 2026. Final enforcement procedures and any U.S. safe-harbor process should be reviewed by counsel.</p>
    </>
  );
}
