import { z } from 'zod';
export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128)
});
export const signUpSchema = loginSchema.extend({
    fullName: z.string().trim().min(2).max(80)
});

