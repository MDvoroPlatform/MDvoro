'use client';
import { useEffect, useState } from 'react';
type Integration = {
    provider: string;
    keyPresent: boolean;
    active: boolean;
    model: string;
};
export default function IntegrationsPage() {
    const [items, setItems] = useState<Integration[]>([]);
    const [message, setMessage] = useState('Loading integration status…');
    useEffect(() => { void fetch('/api/admin/integrations', { cache: 'no-store' }).then(async (res) => { const body = await res.json(); if (!res.ok)
        throw new Error('failed'); setItems(body.ai ?? []); setMessage(''); }).catch(() => setMessage('Could not load integration status.')); }, []);
    return <div className="admin-page"><div className="admin-page-head"><div><div className="eyebrow">Infrastructure</div><h1>Integrations</h1><p className="subtitle">Server-only AI provider status. Secrets are never returned to the browser.</p></div></div>{message && <div className="card card-pad">{message}</div>}<section className="card card-pad integration-grid">{items.map((item) => <article key={item.provider} className="integration-card"><div><strong>{item.provider}</strong><span>{item.active ? `Active · ${item.model || 'model not set'}` : 'Available provider'}</span></div><b className={item.keyPresent ? 'status-good' : 'status-muted'}>{item.keyPresent ? 'API key configured' : 'API key missing'}</b></article>)}</section><section className="card card-pad admin-section-gap"><div className="panel-title">Configuration</div><p className="panel-sub">Set <code>MDVORO_AI_PROVIDER</code>, <code>MDVORO_AI_MODEL</code>, and the matching server-only provider key in your deployment secret manager. Never commit secrets or expose them as <code>NEXT_PUBLIC_*</code>.</p></section></div>;
}

