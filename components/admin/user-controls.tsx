'use client';
import { useState } from 'react';
export function UserControls({userId,role,status,currentUserId,isSuperAdmin=false}:{userId:string;role:string;status:string;currentUserId:string;isSuperAdmin?:boolean}){
  const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('');
  const disabled=userId===currentUserId;
  async function mutate(payload:{action:'status'|'delete';status?:'active'|'suspended'}){
    if(busy||disabled)return;setBusy(true);setMsg('');
    try{const r=await fetch('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId,...payload})});const b=await r.json().catch(()=>({}));if(!r.ok){setMsg(b.error||'Failed');return;}setMsg('Saved');window.location.reload();}catch{setMsg('Failed');}finally{setBusy(false);}
  }
  return <div className="role-editor"><span className={`status ${status==='active'?'status-published':'status-draft'}`}>{status}</span><button className="btn btn-sm" disabled={busy||disabled||role==='super_admin'} onClick={()=>void mutate({action:'status',status:status==='active'?'suspended':'active'})}>{status==='active'?'Suspend':'Reactivate'}</button>{isSuperAdmin && role!=='super_admin'&&<button className="btn btn-sm btn-danger" disabled={busy||disabled} onClick={()=>window.confirm('Permanently delete this user?')&&void mutate({action:'delete'})}>Delete</button>}{msg&&<small>{msg}</small>}</div>;
}
