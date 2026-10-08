import Link from 'next/link';
export default function AccountSuspendedPage(){
  return <main className="standalone-page"><section className="card card-pad standalone-card"><div className="eyebrow">Account status</div><h1>Account suspended</h1><p className="subtitle">Your account is currently suspended. Contact MDvoro support if you believe this is a mistake.</p><Link className="btn btn-primary" href="/login">Return to sign in</Link></section></main>;
}
