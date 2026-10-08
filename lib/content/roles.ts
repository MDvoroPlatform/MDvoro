export const ROLE_LABELS = {
    super_admin: 'Super administrator',
    admin: 'Administrator',
    editor: 'Content editor',
    reviewer: 'Medical reviewer',
    support: 'Support',
    student: 'Student',
} as const;
export const ROLE_HELP = {
    super_admin: 'Full platform control, including security, users, revenue and system operations.',
    admin: 'Full product, content and team control except super-administrator governance.',
    editor: 'Creates and edits drafts and reusable media.',
    reviewer: 'Reviews and publishes medical content.',
    support: 'Support access without editorial publishing rights.',
    student: 'Standard learning account.',
} as const;
export type Role = keyof typeof ROLE_LABELS;
