import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page-shell">
      <section className="card card-pad empty">
        <div className="eyebrow">MDvoro</div>
        <h1>Page not found</h1>
        <p className="subtitle">The page you requested does not exist or is no longer available.</p>
        <Link className="btn btn-primary" href="/">Back to MDvoro</Link>
      </section>
    </main>
  );
}
