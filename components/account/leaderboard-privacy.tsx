'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
export function LeaderboardPrivacy({ initialVisible }: { initialVisible: boolean }) {
  const [visible,setVisible]=useState(initialVisible); const [saving,setSaving]=useState(false); const supabase=createClient();
  const toggle=async()=>{setSaving(true); const next=!visible; const {data,error}=await supabase.rpc('set_leaderboard_visibility',{p_visible:next}); if(!error)setVisible(Boolean(data)); setSaving(false);};
  return <div className="leaderboard-setting"><div><strong>Leaderboard name visibility</strong><p>Choose whether your name appears publicly in the MDvoro Hall of Fame. Your learning statistics may still be used in your own private analytics.</p></div><button className="btn" onClick={toggle} disabled={saving}>{visible?'Hide my name':'Show my name'}</button></div>;
}
