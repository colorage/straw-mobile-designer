# Supabase setup

The app talks to the `pawuk-app` project (`https://unhyfeawnzcpatyhemad.supabase.co`).
Everything below is a one-time setup; the app itself needs no server.

## 1. Apply the schema

Run these migrations in order in the dashboard SQL editor (or via
`apply_migration` with the Supabase MCP server). Each is idempotent, so
re-running is safe.

1. [`migrations/0001_auth_and_projects.sql`](migrations/0001_auth_and_projects.sql)
2. [`migrations/0002_delete_own_account.sql`](migrations/0002_delete_own_account.sql)
3. [`migrations/0003_community_gallery.sql`](migrations/0003_community_gallery.sql)

`0001` creates:

- `public.profiles` — one row per user: `username` (permanent login handle) and
  `nickname` (editable display name)
- `public.projects` — saved mobiles, one row per gallery entry, snapshot in `project jsonb`
- Row Level Security on both, restricted to `auth.uid()`
- A trigger that creates the profile when an auth user is created

`0002` adds `public.delete_own_account()` so a signed-in user can permanently
delete their auth account (profiles and projects cascade).

`0003` adds the community gallery:

- `public.public_projects` — published mobiles (readable by everyone; write = owner)
- `public.project_likes` — one like per user per public project
- A trigger that keeps denormalized `likes_count` in sync
- A public-read policy on `profiles` so community cards can show nicknames

## 2. Auth settings

**Authentication → Sign In / Providers → Email**

- **Enable Email provider: ON** — username/password signup goes through this
  provider, so signup fails with "Email logins are disabled" while it is off
- **Confirm email: OFF** — accounts use a synthetic address that receives no
  mail, so leaving confirmation on means signup never returns a session

Supabase's built-in SMTP only delivers to members of the project's organization
and is capped at 2 messages/hour, so email confirmation cannot work here without
a custom SMTP provider and real user email addresses. Neither is wanted: the app
deliberately collects no email.

**Authentication → Sign In / Providers → Google: ON**

Requires a Google Cloud OAuth client (Web application):

- Authorized JavaScript origins: `https://spider.siaroza.com`,
  `https://pawuk.app`, `http://localhost:5173`
- Authorized redirect URIs: `https://unhyfeawnzcpatyhemad.supabase.co/auth/v1/callback`
  and nothing else — Google redirects to Supabase's auth server, never to the
  app, so listing app URLs here causes `redirect_uri_mismatch`

Paste the resulting Client ID and Client Secret into the Google provider page.

**Authentication → Sign In / Providers → Manual linking: ON**

Needed only for the "Connect Google" button on an existing username account.
Without it, signing in with Google still works; linking reports that it is
disabled.

**Authentication → URL Configuration**

- Site URL: `https://spider.siaroza.com`
- Redirect URLs: `https://spider.siaroza.com/**`, `https://pawuk.app/**`,
  `http://localhost:5173/**`

## How accounts work

Passwords sign up with `{username}@users.spider.siaroza.com`. The address is
derived from the username, never shown, and never receives mail — it exists only
because Supabase Auth identifies password users by email. Signing in re-derives
the same address from the username.

Google users arrive with a real email but no username, so the gallery asks them
to claim one before they can save. Usernames are permanent once claimed
(enforced by a database trigger); nicknames can be changed at any time.

Because email confirmation is off, nothing verifies that a signup is a person.
If bot signups become a problem, enable
[CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha) rather
than turning confirmation back on.

## Moving to pawuk.app

Nothing changes in Google Cloud — the origins already list it and the redirect
URI belongs to Supabase. Update the Supabase **Site URL** and, if the old domain
is retired, drop it from the redirect list. Setting up a Supabase custom auth
domain would change the callback URL and require updating Google.
