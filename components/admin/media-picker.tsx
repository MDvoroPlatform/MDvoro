'use client';
import { useState } from 'react';
type Media = {
    id: string;
    kind: string;
    title: string;
    external_url: string | null;
    copyright_status: string;
    usage_count?: number;
};
export function MediaPicker({ media, selectedIds, canEdit, onChange }: {
    media: Media[];
    selectedIds: string[];
    canEdit: boolean;
    onChange: (ids: string[]) => void;
}) {
    const [results, setResults] = useState(media);
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);
    async function search() {
        setBusy(true);
        const response = await fetch(`/api/admin/media/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (response.ok) {
            const incoming = Array.isArray(body.media) ? body.media as Media[] : [];
            const selected = results.filter((asset) => selectedIds.includes(asset.id));
            setResults([...selected, ...incoming.filter((asset) => !selected.some((item) => item.id === asset.id))]);
        }
        setBusy(false);
    }
    function toggle(id: string, checked: boolean) { onChange(checked ? [...selectedIds, id] : selectedIds.filter((value) => value !== id)); }
    return <div>
    <div className="media-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ECG, X-ray, pathology…" onKeyDown={(event) => { if (event.key === 'Enter') {
        event.preventDefault();
        void search();
    } }}/><button className="btn" type="button" disabled={busy} onClick={() => void search()}>{busy ? 'Searching…' : 'Search'}</button></div>
    <div className="media-picker">{results.map((asset) => <label className="media-pick" key={asset.id}><input disabled={!canEdit} type="checkbox" checked={selectedIds.includes(asset.id)} onChange={(event) => toggle(asset.id, event.target.checked)}/><span><b>{asset.title}</b><small>{asset.kind} · used {asset.usage_count ?? 0}× · {asset.copyright_status}</small></span></label>)}</div>
  </div>;
}

