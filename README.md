# Sylhet Tour Money Manager — Main

Real multi-device architecture: Vite/React frontend + Supabase Auth/Postgres/Realtime + Vercel.

## Login design
- Admin: normal Supabase email/password (`arafat7636@gmail.com` can be used).
- Members: **username + PIN only; no member email is required**.
- Members use Supabase Anonymous Sign-In behind the scenes after the username/PIN is verified.
- Member writes are blocked by database RLS; they are view-only.

## First-time setup
1. Run `supabase_schema.sql` in Supabase SQL Editor. It is safe to re-run because the policies are recreated.
2. Make sure Supabase Auth → Sign In / Providers → **Anonymous Sign-Ins** is enabled.
3. Set the Admin user's `app_metadata.role` to `admin` (the SQL query supplied separately does this for `arafat7636@gmail.com`).
4. Member usernames are initially `member2` … `member7`, all with PIN `1234`. Change them from Admin Panel before sharing the site.
5. In Vercel add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then deploy.

## Permanent history
There is no delete/clear expense action. Expense RLS has insert/select only.
