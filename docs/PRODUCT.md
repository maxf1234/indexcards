# IndexCards — product plan

A free Quizlet competitor. Phase 1 is fully free and costs ~$0 to run. It is
built so paid tiers can be added later without taking anything away from users.

## 1. What people dislike about Quizlet (research, Oct 2026)

| Pain point | Evidence | Our answer |
|---|---|---|
| **Learn and Test are paywalled.** Free users get only a few Learn rounds and practice tests per set before they hit Quizlet Plus (about $36/yr or $8/mo). | Student newspapers ([Bear Creek Gator](https://bmgator.org/33901/news/changes-to-quizlet-cause-frustration-among-students/), [MA Chronicle CEO interview](https://machronicle.com/whats-up-with-quizlet-plus-an-exclusive-interview-with-the-ceo/)), App Store feedback ([Kimola report](https://kimola.com/reports/quizlet-feedback-report-insights-on-paid-features-user-views-app-store-us-140683)) | Every mode is unlimited and free, forever. This is the headline promise. |
| **The paywall shows up at the worst moment**, e.g. the night before an exam, even on sets people made themselves. | Review quotes in the reports above | No round counters exist in the code. `config.js` gates are all off. |
| **Ads on the free tier.** | [RemNote comparison](https://www.remnote.com/blog/best-quizlet-alternatives), [involve.me](https://www.involve.me/blog/quizlet-alternative) | No ads. If ads ever come, never inside a study session. |
| **Data lock-in and weak export.** | [Trustpilot reviews](https://uk.trustpilot.com/review/www.quizlet.com?page=8) (~1.4★) | One-click export to TSV (Quizlet/Anki format), CSV, JSON and printable cards, plus a full-library backup. |
| **Auto-renewing subscriptions that surprise people.** | Trustpilot | No billing exists. When it does: clear renewal reminders and one-click cancel. |
| **No real long-term memory tool.** Learn only gets you ready for tomorrow's test. | Comparisons favour Anki for spaced repetition ([unstar.app](https://unstar.app/blog/quizlet-anki-brainscape-knowt-studysmarter-flashcard-study-apps-ranked-2026)) | SM-2 spaced repetition (the algorithm family Anki uses) is built in. Cards you finish in Learn feed into Review on their own. |
| **Teachers say everything except basic flashcards is locked.** | [Common Sense teacher reviews](https://www.commonsense.org/education/reviews/3888936/teacher-reviews) | All modes are free to teachers too. Classroom management is a future paid add-on, and students never pay. |

Competitors to watch: **Anki** (free and powerful, but hard to use), **Knowt**
(AI cards from notes, free tier), **Brainscape**, **Gizmo**, **Kahoot/Quizizz**
(classroom games).

**Positioning:** "Quizlet as it used to be, plus Anki's memory science, with no
paywall in front of the basics."

## 2. What's built (MVP)

- **Sets:** create, edit, reorder, swap sides, star, folders, search, duplicate, delete
- **Study modes, all unlimited:**
  - **Review (spaced repetition):** Again/Hard/Good/Easy, each showing its next interval; 20 new cards per session
  - **Flashcards:** 3D flip, know / still-learning sorting, shuffle, text-to-speech
  - **Learn:** adaptive rounds of 7 cards, multiple choice first, then typed answers
  - **Write:** typed recall with typo tolerance and an "I was right" override; misses come back until correct
  - **Test:** you pick the question count and types (true/false, multiple choice, written); graded on the spot; best score saved
  - **Match:** timed pairing game, +1s per wrong match, best time saved
- **Answer with:** term, definition or mixed; starred-only study
- **Import:** paste Quizlet's export text (separators detected automatically), CSV, TXT or JSON files, backup restore
- **Export:** TSV, CSV, JSON, printable fold-in-half cards, full backup
- **Share links:** the set is compressed into the URL itself, so there's no server, links never expire and recipients don't need an account
- **Other:** offline PWA (installable), dark mode, keyboard shortcuts throughout, mobile layout, study streak, mastery bar, due-card counts
- **Accounts (optional, free):**
  - Email/password sign-up and sign-in, with optional Google or other OAuth providers.
  - Password reset, display name, change password.
  - Self-service account deletion.
  - Sign-out with an option to wipe the device, for shared computers.
  - Every set, with its study progress, syncs automatically across devices. See [ACCOUNTS.md](ACCOUNTS.md).

### Architecture

Static site with no build step. It runs on free GitHub Pages, Netlify or
Cloudflare Pages. Accounts use Supabase's free tier, and the app still works
completely without it.

```
index.html          app shell
css/styles.css      all styles (light and dark tokens)
js/app.js           router and views (home, set, editor, import, share, settings, about)
js/store.js         localStorage persistence; stamps every change and keeps deletion tombstones
js/cloud.js         Supabase auth and background sync (pull, merge, push)
js/sync.js          pure merge logic: the newer copy of each set wins
js/account.js       account page (sign in/up, reset, profile, delete)
js/cloud-config.js  Supabase URL and anon key (blank = accounts off)
supabase/schema.sql database table, Row Level Security policies, delete-account function
js/srs.js           spaced-repetition scheduler
js/io.js            import/export parsers and share-link encoding
js/config.js        plans, feature gates, MONETIZATION_ENABLED flag
js/modes/*.js       one file per study mode
sw.js               offline cache
tests/              node --test unit tests for grading, scheduling and parsers
```

## 3. Monetization plan (for later)

**Rule:** charge for things that cost us money to run or that add new
capability, never for the study basics. Breaking this rule is exactly how
Quizlet lost users' trust.

| Tier | Price idea | What's in it | Why people would pay |
|---|---|---|---|
| **Free** | $0 | Everything in the MVP, unlimited | The growth engine |
| **Pro** | ~$3–4/mo or ~$24/yr (below Quizlet Plus) | AI cards from notes/PDFs/slides, images and diagram (occlusion) cards, premium voices, advanced stats, custom themes | AI and media storage have real running costs |
| **Teacher** | ~$6–8/mo; school site licences | Classes, assignments, per-student progress, a live classroom game, LMS (Google Classroom/Canvas) integration | Schools pay; students never do |
| **Supporter** | Pay what you want | A badge and early access | Goodwill from users who joined over the anti-paywall message |

Other options: an affiliate shop for textbooks and exam-prep books on
exam-tagged sets, sponsored public "official" decks (clearly labelled), and a
paid API or embed for publishers. **No ads in study modes, ever.**

### How it's wired

- `js/config.js` defines `PLANS`, `can(feature)` and `limit(name)`. While
  `MONETIZATION_ENABLED = false`, every gate returns "allowed".
- New paid features should call `can('cloudSync')` (or the relevant flag)
  instead of hard-coding access checks.
- Accounts and sync are part of the free plan. Every user already has an
  account to attach a Stripe customer to, so a paid tier can be added without
  creating another identity system.

## 4. Roadmap

1. **Now:** deploy to GitHub Pages and add a custom domain.
2. **Growth:** public set library and SEO landing pages (Quizlet gets most of
   its traffic from search for "<topic> flashcards"), a one-click "Import this
   Quizlet set" guide, and a referral link on shared sets.
3. ✅ **Accounts (optional, free):** sign-in plus sync. Next: public profiles
   and publishing sets to the public library.
4. **Pro launch:** AI generation and image cards, paid with Stripe Checkout and
   managed through the customer portal (easy cancel). A `plan` column on a
   `profiles` table, set by a Stripe webhook, feeds `setPlan()`.
5. **Teacher tier:** classes, assignments, analytics, a live game.
6. **Native apps:** wrap the PWA with Capacitor for the app stores.

## 5. Metrics to track (privacy-friendly, e.g. Plausible)

Weekly active studiers, sets created, imports from Quizlet, share-link opens
and the save rate on them, review retention (the share of reviews where a card
is remembered), and day-7 / day-30 return rate.
