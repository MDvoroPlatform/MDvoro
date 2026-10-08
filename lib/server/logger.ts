type LogLevel = 'info' | 'warn' | 'error';
function safeValue(value: unknown) {
    if (value instanceof Error)
        return { name: value.name, message: value.message };
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null)
        return value;
    return '[redacted]';
}
export function requestId() {
    return crypto.randomUUID();
}
export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
    const entry = { timestamp: new Date().toISOString(), level, event, ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, safeValue(value)])) };
    const line = JSON.stringify(entry);
    if (level === 'error')
        console.error(line);
    else if (level === 'warn')
        console.warn(line);
    else
        console.info(line);
}

