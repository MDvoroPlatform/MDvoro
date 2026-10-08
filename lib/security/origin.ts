const configuredOrigin = process.env.MDVORO_APP_ORIGIN?.trim();

function normalizeOrigin(value: string | null) {
    if (!value) return null;
    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url.origin;
    } catch {
        return null;
    }
}

export function assertSameOrigin(request: Request) {
    const requestOrigin = normalizeOrigin(request.url);
    const trustedOrigin = normalizeOrigin(configuredOrigin ?? null);

    // Production must have an explicit canonical origin. Falling back to the
    // request URL would allow a forged Host header to become the trust anchor.
    if (process.env.NODE_ENV === 'production' && !trustedOrigin) return false;
    const expected = trustedOrigin ?? requestOrigin;
    if (!expected) return false;

    const origin = normalizeOrigin(request.headers.get('origin'));
    if (origin) return origin === expected;

    const referer = request.headers.get('referer');
    if (referer) return normalizeOrigin(referer) === expected;

    // Browser state-changing requests should carry Origin or Referer.
    return false;
}
