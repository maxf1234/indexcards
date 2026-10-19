# Accounts & sync

Accounts are optional. Without them, IndexCards saves everything in the
browser. With them, users can sign in on any device and their sets, stars and
spaced-repetition progress follow them.

The backend is [Supabase](https://supabase.com). Its free tier covers auth
and Postgres for roughly 50,000 monthly active users, so the site can still
be hosted as a static page at no cost.

## Setup (about 5 minutes)

1. **Create a project** at supabase.com and choose a region near your users.
2. **Create the database:** go to **SQL Editor → New query**, paste in
   [`supabase/schema.sql`](../supabase/schema.sql), and click **Run**.
3. **Set the URLs:** go to **Authentication → URL Configuration**.
   - **Site URL:** your live address, e.g. `https://yourname.github.io/indexcards/`
   - **Redirect URLs:** add the same address, plus `http://localhost:8080/` for
     local testing.
4. **Connect the app:** go to **Project Settings → API**. Copy the
   **Project URL** and the **anon public** key into `js/cloud-config.js`:
   ```js
   supabaseUrl: 'https://abcd1234.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi...',
   ```
   The anon key is meant to be public. Row Level Security is what protects
   the data.
5. *(Optional)* **Google sign-in:** go to **Authentication → Providers →
   Google**, enable it, and paste in your Google OAuth client ID and secret.
   Then set `oauthProviders: ['google']` in `js/cloud-config.js`.
6. *(Recommended before launch)* **Email:**
   - Under **Authentication → Emails**, set up custom SMTP (for example Resend
     or Postmark). The built-in sender is rate-limited and meant for testing.
   - Edit the confirmation and reset email templates.
   - Decide whether to keep **Confirm email** on. On is safer; off lets people
     sign up with less friction.

Commit and deploy. A **Sign in** button appears in the nav.

## How it works

- **Auth:** `js/cloud.js` loads `supabase-js` from a CDN only once accounts
  are configured, so signed-out visitors without accounts set up never
  download it. It uses the PKCE flow, so email links and OAuth return with
  `?code=` and don't clash with the app's `#/` routes.
- **Data:** each set is one row in `public.sets` (`user_id`, `id`, `data`
  jsonb, `modified_at`, `deleted`). Row Level Security restricts every
  select, insert, update and delete to `auth.uid() = user_id`.
- **When sync runs:**
  - on sign-in
  - about 1.5 seconds after any change
  - when the tab regains focus or the device comes back online
  - every 5 minutes
- **How a sync works:**
  1. Fetch rows the server changed since the last fetch. A trigger stamps
     `updated_at` with server time, so device clocks don't matter here.
  2. Merge them in.
  3. Upload local changes.
- **Conflicts:** last writer wins, per set, by `modified_at`. A deletion is
  stored as a tombstone with its own timestamp, so a deletion on one device
  and an edit on another resolve to whichever happened later. The logic is in
  `js/sync.js` and covered by `tests/sync.test.js`.
- **First sign-in:** sets already on the device are uploaded to the account.
  Nothing is lost.
- **Sign out:** pending changes are pushed first. Users can also choose to
  remove their sets from the device, which is useful on shared computers.
- **Delete account:** calls the `delete_my_account()` function. That deletes
  the auth user, and the sets cascade with it. The copy on the device is kept
  until the user removes it in Settings.

## Testing without a real backend

`tests/mock-supabase.js` is an in-browser fake of the parts of the
supabase-js API the app uses. Load it before the app (for example with
Playwright's `addInitScript`) and it also switches accounts on through
`__IC_CLOUD_CONFIG__`.
