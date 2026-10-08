import { requireContentEditor } from '@/lib/server/authorization';
import { MediaForm } from '@/components/admin/media-form';
type MediaRow = {
    id: string;
    kind: string;
    title: string;
    license_name: string | null;
    copyright_status: string;
    usage_count: number;
};
export default async function MediaLibraryPage({ searchParams }: {
    searchParams: Promise<{
        q?: string;
        kind?: string;
    }>;
}) {
    const { supabase } = await requireContentEditor();
    const params = await searchParams;
    const { data: media } = await supabase.rpc('admin_search_media', { p_search: params.q ?? null, p_kind: params.kind ?? null, p_limit: 200, p_offset: 0 });
    return <div className="admin-page">
    <div className="admin-page-head"><div><div className="eyebrow">Reusable assets</div><h1>Media library</h1><p className="subtitle">One medical image, ECG, diagram or video reference. Reuse it everywhere instead of uploading duplicates.</p></div></div>
    <div className="editor-grid">
      <MediaForm />
      <section className="card admin-table-wrap">
        <div className="card-pad"><form className="admin-filter-form"><input name="q" defaultValue={params.q ?? ''} placeholder="Search asset title or license…"/><select name="kind" defaultValue={params.kind ?? ''}><option value="">All types</option>{['image', 'ecg', 'xray', 'ct', 'mri', 'pathology', 'diagram', 'video', 'audio', 'document'].map((kind) => <option key={kind}>{kind}</option>)}</select><button type="submit" className="btn btn-primary">Filter</button></form></div>
        {media?.length ? <table className="admin-table"><thead><tr><th>Asset</th><th>Type</th><th>Usage</th><th>License</th><th>Status</th></tr></thead><tbody>{(media as MediaRow[]).map((asset) => <tr key={asset.id}><td><div className="table-title">{asset.title}</div><small>{asset.id}</small></td><td>{asset.kind}</td><td>{asset.usage_count} questions</td><td>{asset.license_name || '—'}</td><td><span className={`status ${asset.copyright_status === 'review_required' ? 'status-draft' : 'status-published'}`}>{asset.copyright_status}</span></td></tr>)}</tbody></table> : <div className="empty"><h2>No assets found</h2><p>Add your first licensed or original medical asset.</p></div>}
      </section>
    </div>
  </div>;
}

