import { describe, expect, it } from 'vitest';
import { isEmailSendRateLimitError } from '@/lib/auth/errors';

describe('isEmailSendRateLimitError', () => {
    it('recognizes the Supabase email-send rate-limit code', () => {
        expect(isEmailSendRateLimitError({ code: 'over_email_send_rate_limit' })).toBe(true);
    });

    it('recognizes the provider message when no code is supplied', () => {
        expect(isEmailSendRateLimitError({ message: '429: email rate limit exceeded' })).toBe(true);
    });

    it('does not classify unrelated authentication failures as email limits', () => {
        expect(isEmailSendRateLimitError({ code: 'captcha_failed', message: 'Invalid captcha' })).toBe(false);
    });
});
