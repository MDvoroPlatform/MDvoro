'use client';
import { useEffect } from 'react';
export function PresenceHeartbeat(){
  useEffect(()=>{
    const sessionId=crypto.randomUUID();
    let stopped=false;
    const ping=()=>{ if(stopped) return; void fetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId}),keepalive:true}).catch(()=>{}); };
    ping(); const id=window.setInterval(ping,60000);
    return ()=>{stopped=true;window.clearInterval(id);};
  },[]);
  return null;
}
