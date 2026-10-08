type AuthErrorLike = {
    code?: string;
    message?: string;
};

export function isEmailSendRateLimitError(error: AuthErrorLike): boolean {
    return error.code === 'over_email_send_rate_limit'
        || /email rate limit exceeded/i.test(error.message ?? '');
}
