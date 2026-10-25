'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

type LabValue = { id: string; name: string; category: string; reference_range: string; unit: string; si_reference_range: string; si_unit: string; population: string; source_reference: string; review_note: string | null; status: 'pending'|'in_review'|'approved'|'archived' };
const categories = ['hematology','electrolytes','renal','liver','endocrine','other'] as const;
const blank = { id: null as string|null, name: '', category: 'hematology' as typeof categories[number], referenceRange: '', unit: '', siReferenceRange: '', siUnit: '', population: 'Adult', sourceReference: '', reviewNote: '', status: 'pending' as LabValue['status'] };

export function AdminLabValues({ initialValues }: { initialValues: LabValue[] }) {
  const [values, setValues] = useState(initialValues);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  function edit(value: LabValue) { setForm({ id: value.id, name: value.name, category: value.category as typeof categories[number], referenceRange: value.reference_range, unit: value.unit, siReferenceRange: value.si_reference_range, siUnit: value.si_unit, population: value.population, sourceReference: value.source_reference, reviewNote: value.review_note ?? '', status: value.status }); setMessage(''); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/lab-values', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error === 'source_required_for_approval' ? 'A source citation is required before approval.' : 'Could not save this lab value.');
      setMessage('Saved.'); window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save this lab value.'); }
    finally { setBusy(false); }
  }
  return <div className="lab-admin-layout">
    <form className="card card-pad lab-admin-form" onSubmit={(event) => void save(event)}>
      <div><div className="panel-title">{form.id ? 'Edit lab value' : 'Add lab value'}</div><p className="panel-sub">A source is required for every entry. Approved values become visible in the student reference panel.</p></div>
      <label className="field"><span>Name</span><input required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label className="field"><span>Category</span><select value={form.category} onChange={e=>setForm({...form,category:e.target.value as typeof categories[number]})}>{categories.map(c=><option key={c} value={c}>{c.replaceAll('_',' ')}</option>)}</select></label>
      <div className="lab-range-row"><label className="field"><span>Conventional range</span><input required maxLength={240} value={form.referenceRange} onChange={e=>setForm({...form,referenceRange:e.target.value})}/></label><label className="field"><span>Unit</span><input required maxLength={40} value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/></label></div>
      <div className="lab-range-row"><label className="field"><span>SI range</span><input required maxLength={240} value={form.siReferenceRange} onChange={e=>setForm({...form,siReferenceRange:e.target.value})}/></label><label className="field"><span>SI unit</span><input required maxLength={40} value={form.siUnit} onChange={e=>setForm({...form,siUnit:e.target.value})}/></label></div>
      <label className="field"><span>Population</span><input required maxLength={120} value={form.population} onChange={e=>setForm({...form,population:e.target.value})}/></label>
      <label className="field"><span>Source citation or URL</span><textarea required minLength={8} maxLength={1000} rows={3} value={form.sourceReference} onChange={e=>setForm({...form,sourceReference:e.target.value})}/></label>
      <label className="field"><span>Review note</span><textarea maxLength={1000} rows={2} value={form.reviewNote} onChange={e=>setForm({...form,reviewNote:e.target.value})}/></label>
      <label className="field"><span>Workflow</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value as LabValue['status']})}><option value="pending">Pending review</option><option value="in_review">In review</option><option value="approved">Approved for students</option><option value="archived">Archived</option></select></label>
      <div className="admin-inline-actions"><button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save lab value'}</button><button className="btn" type="button" onClick={()=>{setForm(blank);setMessage('');}}>Clear</button>{message&&<span className="panel-sub" role="status">{message}</span>}</div>
    </form>
    <section className="card card-pad"><div className="panel-head"><div><div className="panel-title">Review queue</div><div className="panel-sub">{values.length} entries · {values.filter(v=>v.status==='approved').length} approved</div></div></div>
      {values.length ? <div className="lab-admin-list">{values.map(value=><button type="button" key={value.id} className="lab-admin-item" onClick={()=>edit(value)}><strong>{value.name}</strong><span>{value.category} · {value.status.replaceAll('_',' ')}</span><small>{value.reference_range} {value.unit} · SI {value.si_reference_range} {value.si_unit}</small><small>Source: {value.source_reference}</small></button>)}</div> : <div className="empty"><h2>No lab values yet</h2><p>Add a sourced value above. It stays out of the student panel until approved.</p></div>}
    </section>
  </div>;
}
