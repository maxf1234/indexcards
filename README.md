# IndexCards

Free flashcards with every study mode unlimited: **Flashcards, Learn, Write,
Test, Match and spaced-repetition Review**. No round limits, no ads. Accounts
are optional: sign in to back up your sets and sync them across devices, or
skip it entirely. Import from Quizlet in seconds and export whenever you like.

See [docs/PRODUCT.md](docs/PRODUCT.md) for the competitive research, feature
list, architecture and monetization plan.

## Run locally

There's no build step. Serve the folder with any static server:

```sh
npm start            # python3 -m http.server 8080
# open http://localhost:8080
```

## Turn on accounts (optional)

Create a free Supabase project, run `supabase/schema.sql` in its SQL editor,
and paste the project URL and anon key into `js/cloud-config.js`. Step-by-step
instructions are in [docs/ACCOUNTS.md](docs/ACCOUNTS.md). Until you do this, the
sign-in link stays hidden and the app works locally.

## Test

```sh
npm test             # node --test: answer grading, scheduling, import/export, share links, sync merge
```

## Deploy (free)

Push to GitHub, then go to **Settings → Pages → Deploy from branch** and pick
your branch and `/ (root)`. Netlify and Cloudflare Pages also work with zero
config.

## Moving a set over from Quizlet

On Quizlet, open the set and choose **⋯ → Export → Copy text**. Then in
IndexCards go to **Import**, paste, and click **Import**.
