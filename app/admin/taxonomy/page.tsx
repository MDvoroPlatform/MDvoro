import { requireStaff } from '@/lib/server/authorization';
import { TaxonomyStudio } from '@/components/admin/taxonomy-studio';
import type { TaxonomyNode } from '@/types/database';
export const dynamic = 'force-dynamic';
export default async function TaxonomyPage() {
    const { supabase } = await requireStaff();
    const { data } = await supabase.rpc('admin_taxonomy_tree', { p_parent_id: null });
    return <TaxonomyStudio initialNodes={(data ?? []) as TaxonomyNode[]}/>;
}

