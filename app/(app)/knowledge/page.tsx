import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EmptyPanel } from '@/components/dashboard/empty-panel';
import { getI18n } from '@/lib/i18n/server';
type GraphNode = {
    id: string;
    kind: 'taxonomy' | 'question' | 'knowledge';
    label: string;
    type: string;
    parent_id?: string | null;
    question_count?: number;
    attempts?: number;
    accuracy?: number | null;
};
type GraphEdge = {
    from: string;
    to: string;
    type: string;
};
type Graph = {
    nodes: GraphNode[];
    edges: GraphEdge[];
};
function score(node: GraphNode) { return node.accuracy == null ? null : Math.max(0, Math.min(100, Number(node.accuracy))); }
export default async function KnowledgePage() {
    const { messages: m } = await getI18n();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return null;
    const { data, error } = await supabase.rpc('learning_knowledge_graph', { p_limit: 60 });
    const graph = (data ?? null) as Graph | null;
    const nodes = graph?.nodes ?? [];
    const taxonomy = nodes.filter(n => n.kind === 'taxonomy');
    const knowledge = nodes.filter(n => n.kind === 'knowledge');
    const questions = nodes.filter(n => n.kind === 'question');
    const edges = graph?.edges ?? [];
    const linked = (id: string) => edges.filter(e => e.from === id || e.to === id).length;
    return <div className="page knowledge-page"><div className="page-head"><div><div className="eyebrow">{m.knowledge.eyebrow}</div><h1>{m.knowledge.title}</h1><p className="subtitle">{m.knowledge.subtitle}</p></div><Link className="btn btn-primary" href="/qbank">{m.knowledge.practiceWeak}</Link></div>
 {error || !graph ? <section className="card card-pad"><EmptyPanel title={m.knowledge.unavailable} description={m.library.libraryNote} action={m.common.back} href="/analytics"/></section> : nodes.length === 0 ? <section className="card card-pad"><EmptyPanel title={m.knowledge.waitingTitle} description={m.knowledge.waitingDesc} action={m.knowledge.startQbank} href="/qbank"/></section> : <>
 <div className="grid grid-3 knowledge-stats"><div className="card card-pad"><span className="metric-label">{m.knowledge.concepts}</span><strong className="metric-value">{taxonomy.length}</strong><span className="metric-note">{m.knowledge.connected}</span></div><div className="card card-pad"><span className="metric-label">{m.knowledge.cards}</span><strong className="metric-value">{knowledge.length}</strong><span className="metric-note">{m.knowledge.publishedExplanations}</span></div><div className="card card-pad"><span className="metric-label">{m.knowledge.questions}</span><strong className="metric-value">{questions.length}</strong><span className="metric-note">{m.knowledge.available}</span></div></div>
 <section className="card card-pad knowledge-map"><div className="panel-head"><div><div className="panel-title">{m.knowledge.map}</div><div className="panel-sub">{m.knowledge.mapSub}</div></div></div><div className="knowledge-columns"><div className="knowledge-column"><div className="knowledge-column-head"><span>{m.knowledge.concepts}</span><small>{taxonomy.length}</small></div>{taxonomy.slice(0, 24).map(n => { const s = score(n); return <div className="knowledge-node" key={n.id}><div><b>{n.label}</b><small>{n.type} · {n.question_count ?? 0} questions · {linked(n.id)} links</small></div><span className={s !== null && s < 60 ? 'knowledge-risk' : ''}>{s === null ? 'New' : `${s}%`}</span></div>; })}</div><div className="knowledge-column"><div className="knowledge-column-head"><span>{m.knowledge.cards}</span><small>{knowledge.length}</small></div>{knowledge.slice(0, 24).map(n => <Link href={`/library/${n.id}`} className="knowledge-node" key={n.id}><div><b>{n.label}</b><small>{m.library.knowledgeCards} · {linked(n.id)} links</small></div><span>{m.common.published}</span></Link>)}</div><div className="knowledge-column"><div className="knowledge-column-head"><span>{m.knowledge.questions}</span><small>{questions.length}</small></div>{questions.slice(0, 24).map(n => <div className="knowledge-node" key={n.id}><div><b>{n.label}</b><small>Question · {linked(n.id)} links</small></div><span>QBank</span></div>)}</div></div></section>
 <section className="card card-pad knowledge-edges"><div className="panel-head"><div><div className="panel-title">{m.knowledge.connection}</div><div className="panel-sub">{m.knowledge.connectionSub}</div></div></div><div className="knowledge-edge-list">{edges.slice(0, 40).map((e, i) => { const from = nodes.find(n => n.id === e.from); const to = nodes.find(n => n.id === e.to); if (!from || !to)
            return null; return <div className="knowledge-edge" key={`${e.from}-${e.to}-${i}`}><span>{from.label}</span><b>{e.type.replace('_', ' ')}</b><span>{to.label}</span></div>; })}</div></section>
 </>}
 </div>;
}

