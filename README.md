# Field Notes — Market Research Journal

A static, vanilla HTML/CSS/JS site backed by Supabase. Designed for GitHub Pages.

## Files

```
index.html              ← Public: daily logs (read-only)
notes.html              ← Public: notes & reflections (read-only)
strategies.html         ← Public: strategies + weekly/monthly snapshots (read-only)
admin-lEqo0dka.html     ← SECRET: composer for all three. Single page, three tabs.

css/styles.css          ← Design system ("Quiet Terminal")
js/supabase.js          ← Supabase client init (public anon key)
js/ui.js                ← Shared rendering / toast helpers
js/admin.js             ← Admin composer logic (only loaded by the secret page)

SETUP.sql               ← Run this once in Supabase → SQL Editor
```

## One-time setup

1. Open your Supabase project → **SQL Editor → New query**.
2. Paste the entire contents of `SETUP.sql` and run it.
3. That creates the three tables, RLS policies, and the public `log-images` storage bucket.

## Local preview

Just open `index.html` in a browser — everything is static. For a closer-to-prod feel:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Admin URL — IMPORTANT

Your admin composer is at:

```
admin-lEqo0dka.html
```

This URL is your only protection. **The site has no login.** RLS allows anonymous writes
because that was the chosen security model. Consequences:

- Don't share the URL.
- Don't paste it in chats or screenshots.
- Be aware browser history / autocomplete may surface it.
- If it ever leaks, do BOTH:
  1. Rename the file to `admin-<new-random-slug>.html` (and bookmark the new one).
  2. Optionally tighten `SETUP.sql` to require auth, then re-run it.

## Flexible entry blocks

Each daily log is a title + date + an ordered list of **blocks**. Each block has:
- `type` — `text`, `image`, or `link`
- `label` — your own label, e.g. "BTC price", "FT article", "screenshot"
- `value` — the content (text, URL, or image URL — uploads go to the `log-images` bucket)

Add as many blocks per entry as you want, in any order.

## Deploying to GitHub Pages

1. Create a new GitHub repo and push these files to the root.
2. Repo → **Settings → Pages → Deploy from branch → main / root**.
3. Done. Your site lives at `https://<you>.github.io/<repo>/`.
   Admin: `https://<you>.github.io/<repo>/admin-lEqo0dka.html`

## Changing the admin slug later

1. Rename `admin-lEqo0dka.html` to `admin-<new-slug>.html`.
2. Update the link in `README.md`.
3. Commit + push. Old URL 404s instantly.
