import { createHash } from 'node:crypto';
export type AiSuggestionType = 'question' | 'explanation' | 'taxonomy' | 'knowledge';
export type AiProviderName = 'openai' | 'anthropic' | 'google' | 'local' | 'manual';
export type AiSuggestionRequest = {
    type: AiSuggestionType;
    input: Record<string, unknown>;
};
export type AiSuggestion = {
    type: AiSuggestionType;
    payload: Record<string, unknown>;
    provider: AiProviderName;
    model: string;
};
type ProviderConfig = {
    configured: boolean;
    provider: AiProviderName;
    model: string;
    keyPresent: boolean;
};
function providerKey(provider: AiProviderName): string {
    if (provider === 'openai')
        return process.env.MDVORO_OPENAI_API_KEY ?? process.env.MDVORO_AI_API_KEY ?? '';
    if (provider === 'anthropic')
        return process.env.MDVORO_ANTHROPIC_API_KEY ?? process.env.MDVORO_AI_API_KEY ?? '';
    if (provider === 'google')
        return process.env.MDVORO_GOOGLE_API_KEY ?? process.env.MDVORO_AI_API_KEY ?? '';
    return process.env.MDVORO_AI_API_KEY ?? '';
}
export function aiProviderConfig(): ProviderConfig {
    const provider = (process.env.MDVORO_AI_PROVIDER as AiProviderName | undefined) ?? 'manual';
    const model = process.env.MDVORO_AI_MODEL ?? '';
    const keyPresent = Boolean(providerKey(provider));
    return { configured: provider !== 'manual' && Boolean(model) && keyPresent, provider, model, keyPresent };
}
export function aiIntegrationStatus() {
    const providers: AiProviderName[] = ['openai', 'anthropic', 'google'];
    return providers.map((provider) => ({
        provider,
        keyPresent: Boolean(providerKey(provider)),
        active: aiProviderConfig().provider === provider,
        model: aiProviderConfig().provider === provider ? aiProviderConfig().model : '',
    }));
}
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
    }
    return value;
}
export function stablePromptHash(input: unknown) {
    return createHash('sha256').update(JSON.stringify(canonicalize(input))).digest('hex');
}
function extractJson(text: string): Record<string, unknown> {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
    const parsed: unknown = JSON.parse(fenced);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('ai_invalid_json');
    return parsed as Record<string, unknown>;
}
function instruction(type: AiSuggestionType, input: Record<string, unknown>) {
    return [
        'You are MDvoro content tooling. Produce a medically careful draft suggestion for human review.',
        `Suggestion type: ${type}.`,
        'Return ONLY valid JSON. Never claim a source you did not receive. Do not invent citations.',
        'The result is a draft for a licensed medical reviewer; it must never be treated as automatically approved.',
        JSON.stringify(input),
    ].join('\n');
}
async function fetchJson(url: string, init: RequestInit, timeoutMs = 30000): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }, cache: 'no-store' });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok)
            throw new Error(`ai_provider_http_${response.status}`);
        if (!body || typeof body !== 'object' || Array.isArray(body))
            throw new Error('ai_provider_invalid_response');
        return body as Record<string, unknown>;
    }
    finally {
        clearTimeout(timer);
    }
}
async function openAi(request: AiSuggestionRequest, model: string, key: string) {
    // Responses API is the current OpenAI API surface for new integrations.
    // `store: false` keeps medical-education draft inputs out of persisted Responses.
    const body = await fetchJson('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: JSON.stringify({
            model,
            store: false,
            temperature: 0.2,
            input: [
                {
                    role: 'system',
                    content: [{ type: 'input_text', text: 'Return only a JSON object. This is a medical education draft and requires human review.' }],
                },
                {
                    role: 'user',
                    content: [{ type: 'input_text', text: instruction(request.type, request.input) }],
                },
            ],
            text: {
                format: {
                    type: 'json_schema',
                    name: 'mdvoro_suggestion',
                    strict: false,
                    schema: {
                        type: 'object',
                        additionalProperties: true,
                    },
                },
            },
        }),
    });
    // Responses API exposes the normalized text as `output_text`.
    if (typeof body.output_text === 'string')
        return extractJson(body.output_text);
    // Defensive fallback for raw response payloads where output_text is absent.
    const output = Array.isArray(body.output) ? body.output : [];
    for (const item of output) {
        if (!item || typeof item !== 'object')
            continue;
        const content = (item as Record<string, unknown>).content;
        if (!Array.isArray(content))
            continue;
        for (const part of content) {
            if (!part || typeof part !== 'object')
                continue;
            const text = (part as Record<string, unknown>).text;
            if (typeof text === 'string')
                return extractJson(text);
        }
    }
    throw new Error('ai_empty_response');
}
async function anthropic(request: AiSuggestionRequest, model: string, key: string) {
    const body = await fetchJson('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 4000, temperature: 0.2, system: 'Return only valid JSON. This is a medical education draft requiring human review.', messages: [{ role: 'user', content: instruction(request.type, request.input) }] }),
    });
    const content = Array.isArray(body.content) ? body.content[0] : null;
    const text = content && typeof content === 'object' ? (content as Record<string, unknown>).text : null;
    if (typeof text !== 'string')
        throw new Error('ai_empty_response');
    return extractJson(text);
}
async function google(request: AiSuggestionRequest, model: string, key: string) {
    // Keep the credential out of the URL so it cannot leak through logs, traces or referrers.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = await fetchJson(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: instruction(request.type, request.input) }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
    });
    const candidates = Array.isArray(body.candidates) ? body.candidates : [];
    const content = candidates[0] && typeof candidates[0] === 'object' ? (candidates[0] as Record<string, unknown>).content : null;
    const rawParts: unknown = content && typeof content === 'object' ? (content as Record<string, unknown>).parts : null;
    const parts: unknown[] = Array.isArray(rawParts) ? rawParts : [];
    const text = parts[0] && typeof parts[0] === 'object' ? (parts[0] as Record<string, unknown>).text : null;
    if (typeof text !== 'string')
        throw new Error('ai_empty_response');
    return extractJson(text);
}
export async function generateSuggestion(request: AiSuggestionRequest): Promise<AiSuggestion> {
    const config = aiProviderConfig();
    if (!config.configured)
        throw new Error('ai_provider_not_configured');
    const key = providerKey(config.provider);
    let payload: Record<string, unknown>;
    if (config.provider === 'openai')
        payload = await openAi(request, config.model, key);
    else if (config.provider === 'anthropic')
        payload = await anthropic(request, config.model, key);
    else if (config.provider === 'google')
        payload = await google(request, config.model, key);
    else
        throw new Error(`ai_adapter_not_implemented:${config.provider}`);
    return { type: request.type, payload, provider: config.provider, model: config.model };
}

