'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/components/i18n/provider';
type Card = {
    id: string;
    stable_code: string;
    title: string;
    summary: string | null;
    body_md: string;
    updated_at: string;
};
function excerpt(text: string | null) { return (text ?? '').replace(/[#*_>`\[\]()-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 185); }
export function LibraryBrowser({ cards }: {
    cards: Card[];
}) {
    const { messages: m } = useI18n();
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => { const q = query.trim().toLowerCase(); if (!q)
        return cards; return cards.filter(c => `${c.title} ${c.summary ?? ''} ${c.body_md}`.toLowerCase().includes(q)); }, [cards, query]);
    return <>
    <div className="library-toolbar"><div className="library-toolbar-main"><div className="panel-title">{m.library.browse}</div><div className="panel-sub">{m.library.libraryNote}</div></div><div className="library-toolbar-search"><Icon name="search" size={16}/><input value={query} onChange={e => setQuery(e.target.value)} aria-label={m.common.search} placeholder={m.library.searchPlaceholder}/></div><span className="library-result-count">{filtered.length} / {cards.length}</span></div>
    {filtered.length ? <div className="library-grid">{filtered.map(card => <Link key={card.id} href={`/library/${card.id}`} className="library-card"><div className="library-card-top"><span>{m.library.knowledgeCards}</span><Icon name="arrow" size={14}/></div><h2>{card.title}</h2><p>{excerpt(card.summary || card.body_md)}</p><div className="library-card-footer"><span>{new Date(card.updated_at).toLocaleDateString()}</span><span className="library-read">{m.library.read}</span></div></Link>)}</div> : <section className="card library-empty"><div className="empty-icon"><Icon name="search" size={19}/></div><h2>{m.common.noResults}</h2><p>{m.library.noCardsDesc}</p></section>}
  </>;
}

