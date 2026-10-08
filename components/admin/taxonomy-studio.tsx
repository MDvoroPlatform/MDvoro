'use client';
import { useState, useTransition } from 'react';
type Node = {
    id: string;
    parent_id: string | null;
    node_type: string;
    slug: string;
    name: string;
    description: string | null;
    status: string;
    sort_order: number;
    child_count: number;
};
const types = ['subject', 'topic', 'subtopic', 'concept', 'disease', 'drug', 'procedure'];
export function TaxonomyStudio({ initialNodes }: {
    initialNodes: Node[];
}) {
    const [nodes, setNodes] = useState(initialNodes);
    const [name, setName] = useState('');
    const [type, setType] = useState('subject');
    const [slug, setSlug] = useState('');
    const [busy, start] = useTransition();
    const [message, setMessage] = useState('');
    function createNode() {
        start(async () => {
            setMessage('');
            const res = await fetch('/api/admin/taxonomy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, type, slug: slug || name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage(body.error || 'Could not save');
                return;
            }
            setNodes((current) => [...current, body.node]);
            setName('');
            setSlug('');
            setMessage('Saved');
        });
    }
    return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Knowledge architecture</div><h1>Medical taxonomy</h1><p className="subtitle">One controlled hierarchy keeps questions, explanations and future AI tools consistent.</p></div></div>
    <section className="card card-pad admin-section-gap">
      <div className="panel-head"><div><div className="panel-title">Add a classification</div><div className="panel-sub">Keep names stable. The AI and import tools will use these IDs instead of guessing taxonomy.</div></div></div>
      <div className="form-grid-3">
        <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Cardiology"/></label>
        <label className="field"><span>Type</span><select value={type} onChange={e => setType(e.target.value)}>{types.map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Slug</span><input value={slug} onChange={e => setSlug(e.target.value)} placeholder="cardiology"/></label>
      </div>
      <div className="form-actions"><button className="btn btn-primary" disabled={busy || !name.trim()} onClick={createNode}>{busy ? 'Saving…' : 'Add classification'}</button>{message && <span className="form-hint">{message}</span>}</div>
    </section>
    <section className="card card-pad">
      <div className="panel-head"><div><div className="panel-title">Top-level taxonomy</div><div className="panel-sub">Start with subjects, then topics and subtopics. Concepts can cross-link later.</div></div><span className="badge">{nodes.length}</span></div>
      <div className="admin-table">{nodes.length ? nodes.map(n => <div className="admin-row" key={n.id}><div><b>{n.name}</b><small>{n.node_type} · {n.slug}</small></div><span>{n.child_count} children</span></div>) : <div className="empty-panel"><b>No taxonomy yet</b><span>Add your first subject above.</span></div>}</div>
    </section>
  </div>;
}

