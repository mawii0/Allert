# Email confirmation setup

The signup endpoint now uses Supabase Auth `signUp` and returns `pending_verification` without an app session. Login rejects users whose email is not confirmed. The `/verify-email` page accepts a confirmation code when the email template includes one, and also supports the standard confirmation-link flow by directing users back to Sign In after they follow the link.

For the hosted Supabase project, enable **Authentication → Providers → Email → Confirm email** and configure a working email sender. Set the Auth Site URL to the app's `/verify-email` page and allow that URL as a redirect. Deploy the updated `make-server-a473accf` edge function before testing registration against the hosted project. The `supabase/config.toml` setting covers local Supabase only.

Verify with a real inbox: register, confirm that no app session is returned, confirm via the email link or code, then sign in. Registration deliberately returns an error if the connected Supabase project auto-confirms email.
