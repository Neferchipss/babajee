# Babajee database setup

The site talks to Supabase straight from the browser (no server needed), so it
works on GitHub Pages and on any other host. What a visitor can do is decided
by row-level security in the database, not by the site code.

## One-time setup (with the client's Gmail)

1. Sign in to supabase.com with the client's Google account and create a
   project (region: Mumbai / `ap-south-1`). Save the database password.
2. **SQL editor:** paste and run `migrations/0001_profiles.sql`, then run the
   three "Verify" queries at the bottom of that file and check the results.
3. **Authentication > URL configuration:**
   - Site URL: the live site address.
   - Redirect URLs: add `http://localhost:3300/**` and the live site address
     with `/**` (for the Pages preview, `https://<owner>.github.io/babajee/**`).
4. **Authentication > Sign in / Providers > Email:** keep "Confirm email" on
   for launch, set the minimum password length to 8.
   Supabase's built-in email sender is limited to a few emails an hour, so
   before launch add a custom SMTP sender (Authentication > Emails > SMTP).
5. **Project settings > API:** copy the Project URL and the publishable (or
   anon) key. Both are public by design. Never put the service-role key in the
   site or in chat.
   - Local: copy `.env.example` to `.env.local` and fill in both values.
   - GitHub Pages: repository Settings > Secrets and variables > Actions >
     Variables tab, add `NEXT_PUBLIC_SUPABASE_URL` and
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then re-run the Deploy Pages workflow.
6. Sign up on the site, then make that person the first admin in the SQL editor:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'owner@example.com');
   ```

## What is in the database so far

| Table | Purpose |
| --- | --- |
| `auth.users` | Supabase's own login table (email, password hash). |
| `public.profiles` | One row per user: name, phone, `role` (`customer` or `admin`), `age_verified_at`. Created automatically at sign-up. |

A customer can read their own row and change only their name and phone. Only
the SQL editor or the service role can change `role`, so nobody can promote
themselves. `public.is_admin()` is ready for the catalogue and order policies.

Catalogue, cart and orders come next, as further numbered files in `migrations/`.
