import { createClient } from '@/lib/supabase/server';
import { LibraryBrowser } from '@/components/library/library-browser';
import { getI18n } from '@/lib/i18n/server';
import Link from 'next/link';
import { Icon } from '@/components/ui/icons';
type Card = {
    id: string;
    stable_code: string;
    title: string;
    summary: string | null;
    body_md: string;
    updated_at: string;
};
export default async function LibraryPage() {
    const { messages: m } = await getI18n();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return null;
    const [{ data: cards }, { data: overview }] = await Promise.all([
        supabase.from('knowledge_cards').select('id,stable_code,title,summary,body_md,updated_at').eq('status', 'published').order('updated_at', { ascending: false }).limit(120),
        supabase.rpc('library_overview'),
    ]);
    const stats = overview?.[0] ?? null;
    return <div className="page library-page">
    <div className="page-head"><div><div className="eyebrow">{m.library.eyebrow}</div><h1>{m.library.title}</h1><p className="subtitle">{m.library.subtitle}</p></div><Link className="btn" href="/knowledge"><Icon name="brain" size={15}/>{m.library.backToKnowledge}</Link></div>
    <section className="library-hero"><div className="library-hero-card"><div className="kicker">MDvoro Reference Layer</div><div className="library-hero-title">{m.library.title}</div><p className="subtitle">{m.library.libraryNote}</p></div><div className="library-mini"><div className="library-stat"><span>{m.library.knowledgeCards}</span><strong>{cards?.length ?? 0}</strong></div><div className="library-stat"><span>{m.library.topics}</span><strong>{stats?.active_topics ?? 0}</strong></div><div className="library-stat"><span>{m.library.questions}</span><strong>{stats?.published_questions ?? 0}</strong></div></div></section>
    <LibraryBrowser cards={(cards ?? []) as Card[]}/>
  </div>;
}

