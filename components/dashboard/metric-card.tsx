export function MetricCard({ label, value, note }: {
    label: string;
    value: string;
    note: string;
}) {
    return <article className="card metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>;
}

