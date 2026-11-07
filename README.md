# Flashlang

A simple Brainscape-inspired study app with classes and decks, card importing, confidence-based study, and optional email/password accounts. The frontend is plain HTML, CSS, and JavaScript. There is no package installation or paid API requirement.

The site is published at [andsumm.github.io/flashlang](https://andsumm.github.io/flashlang/) from the [andsumm/flashlang repository](https://github.com/andsumm/flashlang). Email/password accounts and private library storage are connected to the Supabase project configured in `config.js`.

## Run locally

```sh
python3 -m http.server 5173
```

Open [localhost:5173](http://localhost:5173). Serve the files over HTTP; opening `index.html` directly will not load JavaScript modules correctly.

Dark mode is the default. Phone navigation stays within thumb reach, study cards flip on tap, and large confidence buttons keep sessions quick. Each card reviewed earns 10 XP, with levels every 500 XP and a daily quest based on your study goal. Rewards depend on practice, so ratings can stay honest.

The Progress screen shows total reviews, study time, active days, strong cards, a 14-day activity chart, 12-week calendar, confidence distribution, and cards due or ready to learn. These statistics are calculated from the activity and card progress already saved with your library, including in your private account.

The guest library starts with example decks. Create a class and deck, or use **Import cards** to upload CSV, TSV, TXT, or JSON (up to 5 MB), paste spreadsheet rows, or paste `Q:` / `A:` blocks. Choose a delimiter manually if detection reports an ambiguous file. The preview shows parsed cards before importing; duplicates already in the target deck are not added again. Sample files are in `samples/`.

Study sessions prioritize due cards and unseen cards. Reveal an answer and rate your confidence from 1 to 5; weak cards return sooner. Study progress is saved after each rating. In Settings, you can set your daily goal, add the example classes, export a full JSON backup, or restore a backup. Individual decks can be exported as CSV.

## Install on your phone

Open the [live site](https://andsumm.github.io/flashlang/) once while online. In Android Chrome, use **Install app** or **Add to Home screen** from the browser menu. On iPhone, open the site in Safari and use **Share → Add to Home Screen**. Flashlang then launches from its own icon in a standalone window.

After the first successful online load, the app shell is available offline. You can reopen the app and use the guest library saved on that device, including imports, edits, and study. Signing in, loading an account library, and cloud synchronization require an internet connection. External web fonts are optional; system fonts are used when unavailable offline.

The service worker caches only public interface files from this site's own path. Supabase requests, authentication responses, and other external requests are never cached by it. HTML, modules, CSS, and `config.js` use the network first, with cached files used when offline. Each packaged app version has a content-derived cache version, so a new deployment replaces its previous offline shell. See [MDN's PWA installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Checks and project files

With Node.js 22 or later installed, run the automated parser and scheduling checks with:

```sh
npm test
```

No `npm install` is needed. An additional browser-native check page is available at [localhost:5173/tests/run.html](http://localhost:5173/tests/run.html) while the local server is running. The GitHub deployment workflow checks JavaScript syntax and runs the automated tests before publishing.

The app entry point is `src/app.js`, data validation and examples are in `src/data.js`, import/export handling is in `src/importer.js`, spaced repetition is in `src/study.js`, and dashboard calculations are in `src/stats.js`. The cloud adapter is `src/cloud.js`; all presentation styles are in `styles.css`. Install metadata lives in `manifest.webmanifest`; `sw.js` provides the offline public shell. To regenerate the PNG icons from the existing flower geometry, run `python3 scripts/generate_icons.py` (no extra packages required).

## Accounts and private storage

The current site uses `https://noehfvtxghfpeyberpdb.supabase.co`. Email/password signup is enabled and **Confirm email** is off, so a new account can sign in immediately. Users' libraries are private database records protected by row-level security, independent of the client interface.

To deploy a separate copy with your own backend:

1. Create a project on [Supabase Free](https://supabase.com/pricing).
2. Open the project's SQL Editor, paste the contents of `supabase/schema.sql`, and run it. It creates one library record per user, with row-level security restricting access to the signed-in owner.
3. In Supabase Authentication, enable the Email provider. For the simplest personal setup, turn **Confirm email** off; users can create an account and sign in immediately with their email and password. If email confirmations are desired, keep them on and configure custom SMTP first.
4. In Authentication → URL Configuration, set **Site URL** to your deployed URL, including the repository path and trailing slash. This deployment uses `https://andsumm.github.io/flashlang/`. Add the deployed URL and `http://localhost:5173/` to the allowed redirect URLs.
5. Copy your project URL and **publishable key** (or legacy **anon public** key) into `config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR-PUBLISHABLE-OR-ANON-KEY',
};
```

The project URL and public key are intended to appear in browser code. Never use a `service_role` key, secret API key, database password, or account access token here. The SQL policies enforce access independently of the client UI. See [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

The Supabase JavaScript SDK is pinned and downloaded from esm.sh only when cloud accounts are configured. It manages persisted login sessions and token refresh. See [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords).

### Confirmation and password-reset email

Custom SMTP is not configured for the current site, so public password-reset email delivery is unavailable. Immediate email/password signup works because Confirm email is off. Supabase's default sender is limited to project team members and is intended for testing; confirmations and password resets for other addresses require [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Configure a provider's free allowance before enabling reset email for public users.

## Publish free on GitHub Pages

The current source repository is [andsumm/flashlang](https://github.com/andsumm/flashlang), with the GitHub Pages site at [andsumm.github.io/flashlang](https://andsumm.github.io/flashlang/). Changes pushed to `main` are checked and published by `.github/workflows/deploy.yml`.

To publish a separate copy:

1. Create a **public** repository on GitHub, for example `flashlang`, with `main` as its default branch. Public repositories support GitHub Pages on GitHub Free.
2. Upload or push all the source files, including `.github/workflows/deploy.yml`. You can use GitHub's **Add file → Upload files**, or Git from a terminal.
3. In the repository's **Settings → Pages**, select **GitHub Actions** as the source.
4. Open **Actions → Deploy to GitHub Pages** and run it, or push another commit to `main`. The workflow packages the public files into `_site` and publishes them.
5. Use the deployment URL shown in Actions or Settings → Pages. Set that URL in Supabase's Site URL and redirect allowlist as described above.

All application asset and module paths are relative, so the same source works at a domain root and at `/<repository-name>/`. No custom domain is required. See [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

To inspect exactly what is published:

```sh
python3 scripts/build.py
python3 -m http.server 4173 --directory _site
```

The packaging script copies only the public app files and assets and injects the current public-file hash into `sw.js`. SQL, docs, tests, and local environment files are excluded. It does not bundle, minify, or download dependencies. Preview `_site` to check the exact production worker and manifest.

## Cost and storage

GitHub Pages hosts the static interface. Supabase Free provides the database and authentication, currently including 500 MB of database storage and 50,000 monthly active users. Free projects can pause after a week of inactivity; resume the project in Supabase if login or sync stops after a long break. Current allowances are documented on the [Supabase pricing page](https://supabase.com/pricing).

Each account's complete library is saved as one JSON document. A write is atomic, but simultaneous edits from different devices use last-write-wins rather than collaborative merging. Use one active editing session at a time. GitHub hosts source code and the interface; private cards live in Supabase, not in the public repository.

Guest libraries and account save recovery use local browser storage. Browser data is specific to the device and browser profile, so export a backup before clearing it or changing devices. The service worker's public shell cache contains no flashcards or account data.
