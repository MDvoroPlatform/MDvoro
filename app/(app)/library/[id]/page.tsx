import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getI18n } from '@/lib/i18n/server';
import { Icon } from '@/components/ui/icons';
function blocks(markdown: string) {
    return markdown.split(/\r?\n\r?\n+/).map((block, i) => { const s = block.trim(); if (!s)
        return null; if (/^###\s/.test(s))
        return <h3 key={i}>{s.replace(/^###\s+/, '')}</h3>; if (/^##\s/.test(s))
        return <h2 key={i}>{s.replace(/^##\s+/, '')}</h2>; if (/^#\s/.test(s))
        return <h2 key={i}>{s.replace(/^#\s+/, '')}</h2>; if (s.split('\n').every(line => /^[-*]\s+/.test(line)))
        return <ul key={i}>{s.split('\n').map((line, j) => <li key={j}>{line.replace(/^[-*]\s+/, '')}</li>)}</ul>; return <p key={i}>{s}</p>; });
}
export default async function LibraryArticle({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const { id } = await params;
    const { messages: m } = await getI18n();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return null;
    const { data: card } = await supabase.from('knowledge_cards').select('id,stable_code,title,summary,body_md,updated_at').eq('id', id).eq('status', 'published').maybeSingle();
    if (!card)
        notFound();
    return <div className="page"><div className="page-head"><div><div className="eyebrow">{m.library.knowledgeCards}</div><h1>{card.title}</h1><p className="subtitle">{card.summary ?? ''}</p></div><Link className="btn" href="/library"><Icon name="arrow" size={15}/>{m.common.back}</Link></div><article className="card card-pad library-article"><div className="library-article-meta"><span>{card.stable_code}</span><span>{m.common.updated} {new Date(card.updated_at).toLocaleDateString()}</span></div><div className="library-body">{blocks(card.body_md)}</div><footer className="library-note">{m.library.libraryNote}</footer></article></div>;
}

