-- Replace the placeholder with the intended administrator's Auth user UUID.
-- Obtain it from Supabase Authentication > Users. No email or user metadata grants this role.
INSERT INTO public.allert_admin_users(user_id,active)
VALUES('2a0444be-4847-4142-8c84-122334b2eb71'::uuid,true)
ON CONFLICT(user_id) DO UPDATE SET active=true;
-- To revoke later, use that same UUID:
-- UPDATE public.allert_admin_users SET active=false WHERE user_id='REPLACE_WITH_ADMIN_AUTH_UUID'::uuid;
