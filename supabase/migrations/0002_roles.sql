-- MDvoro Phase 2 role vocabulary. Keep this migration separate because enum values must commit before dependent policies/functions use them.
alter type public.user_role add value if not exists 'editor';
alter type public.user_role add value if not exists 'reviewer';
alter type public.user_role add value if not exists 'support';
