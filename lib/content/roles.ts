export const ROLE_LABELS = {
    admin: 'Administrator',
    editor: 'Content editor',
    reviewer: 'Medical reviewer',
    support: 'Support',
    student: 'Student',
} as const;
export const ROLE_HELP = {
    admin: 'Highest product administrator with full content, team, user, exam, system and platform permissions.',
    editor: 'Creates and edits drafts and reusable media.',
    reviewer: 'Reviews and publishes medical content.',
    support: 'Support access without editorial publishing rights.',
    student: 'Standard learning account.',
} as const;
export type Role = keyof typeof ROLE_LABELS;
