# IndexCards

Free flashcards with every study mode unlimited: **Flashcards, Learn, Write,
Test, Match and spaced-repetition Review**. No round limits, no ads, no
account. Import from Quizlet in seconds and export whenever you like.

See [docs/PRODUCT.md](docs/PRODUCT.md) for the competitive research, feature
list, architecture and monetization plan.

## Run locally

There's no build step. Serve the folder with any static server:

```sh
npm start            # python3 -m http.server 8080
# open http://localhost:8080
```

## Test

```sh
npm test             # node --test: answer grading, scheduling, import/export, share links
```

## Deploy (free)

Push to GitHub, then go to **Settings → Pages → Deploy from branch** and pick
your branch and `/ (root)`. Netlify and Cloudflare Pages also work with zero
config.

## Moving a set over from Quizlet

On Quizlet, open the set and choose **⋯ → Export → Copy text**. Then in
IndexCards go to **Import**, paste, and click **Import**.
