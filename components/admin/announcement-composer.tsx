'use client';

import { FormEvent, useState } from 'react';

export function AnnouncementComposer() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('busy');
    try {
      const response = await fetch('/api/admin/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, message }) });
      if (!response.ok) throw new Error('announcement_failed');
      setTitle(''); setMessage(''); setState('sent');
    } catch { setState('error'); }
  }
  return <section className="card card-pad announcement-composer">
    <div className="kicker">Student notifications</div><h2 className="section-heading">Send a message to students</h2>
    <p className="panel-sub">Your message appears in the notification bell for all current students.</p>
    <form className="form announcement-form" onSubmit={event => void send(event)}>
      <label className="field"><span>Title</span><input value={title} maxLength={120} required onChange={event => setTitle(event.target.value)}/></label>
      <label className="field"><span>Message</span><textarea value={message} maxLength={2000} rows={3} required onChange={event => setMessage(event.target.value)}/></label>
      <button className="btn btn-primary" type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Send to students'}</button>
      {state === 'sent' && <span className="form-message">Message sent.</span>}
      {state === 'error' && <span className="form-message error" role="alert">Could not send the message. Try again.</span>}
    </form>
  </section>;
}
