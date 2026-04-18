# signal.log — vanilla static market-research journal

Three pages backed by Supabase. Public read, single-admin write
(`7withak@gmail.com`). Hosts cleanly on GitHub Pages — no build step.

## 1. One-time Supabase setup

1. In your Supabase project, open **SQL Editor → New query**.
2. Paste the entire contents of [`SETUP.sql`](./SETUP.sql) and click **Run**.
   This creates the tables, RLS policies, and the `log-images` storage bucket.
3. Open **Authentication → Providers → Email**: confirm the **Email** provider
   is enabled. Magic links are on by default.
4. Open **Authentication → URL Configuration**:
   - **Site URL** → your GitHub Pages URL, e.g. `https://USER.github.io/REPO/`
   - **Redirect URLs** → add the same URL plus `http://localhost:5500/` if you
     plan to preview locally.

## 2. Deploy to GitHub Pages

1. Create a repo and copy every file in this folder into it (keeping paths).
2. Push to `main`.
3. **Settings → Pages → Source = `main` / root**. Wait for the green check.
4. Visit `https://USER.github.io/REPO/`.

## 3. Local preview (optional)

Any static server works. Easiest:

```bash
npx serve .
# or
python3 -m http.server 5500
```

Then open `http://localhost:5500/`. (Don't open the HTML files directly with
`file://` — ES modules and Supabase auth need an HTTP origin.)

## 4. How to use

- **Public visitors** see all logs, notes, and strategies. No login UI shown.
- **Admin** (`7withak@gmail.com`) clicks **Admin login** in the footer, gets a
  magic link, and after returning sees the composer forms inline on each page.
- Image uploads land in the `log-images` storage bucket and are inserted into
  the entry as public URLs.
- The Strategies page has tabs: **Strategies** (timeless), **Weekly**,
  **Monthly**. Weekly/Monthly composers have a **Seed from daily logs** button
  that auto-pastes a summary of the last 7/30 days of daily logs.

## 5. File layout

```
index.html         Daily logs (home)
notes.html         Notes & reflections
strategies.html    Strategies + weekly/monthly snapshots
login.html         Magic-link sign-in
css/styles.css     Design system ("Quiet Terminal")
js/supabase.js     Supabase client + admin email constant
js/ui.js           Header/footer chrome, image upload, helpers
SETUP.sql          One-shot DB + RLS + storage setup
```

## 6. Changing the admin

If you ever change emails:
1. Edit `ADMIN_EMAIL` in `js/supabase.js`.
2. Edit the four `'7withak@gmail.com'` strings in `SETUP.sql` and re-run the
   policy `create` blocks (or `alter policy`).

## 7. Security notes

- The anon key in `js/supabase.js` is **public-safe** — every Supabase web app
  ships it. Your data is protected by the RLS policies installed in step 1.
- Never put the `service_role` key in this repo.
