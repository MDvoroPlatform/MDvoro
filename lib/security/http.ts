export const jsonHeaders = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
};
export function safeError(message = 'Something went wrong.') {
    return { error: message } as const;
}

