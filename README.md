![Flashlang](./assets/brand.svg)

Flashlang is a calm, confidence-based flashcard app for building knowledge a little at a time. Organize what you want to learn into classes and decks, then study with short sessions that bring the cards you find difficult back sooner.

The app is a progressive web app (PWA): use it in a browser or install it on a phone. A guest library works without an account and is saved in that browser. Signing in is optional and enables private library sync across devices through the configured Supabase project.

**Try it:** [andsumm.github.io/flashlang](https://andsumm.github.io/flashlang/)

## ✨ What you can do

- **Organize a study library** into classes, decks, and question-and-answer cards.
- **Study at your own pace.** Rate each answer from 1 to 5; confident cards get longer review intervals, while tricky cards return sooner. Smart sessions prioritize due and unseen cards, and the play button remembers your last class or deck.
- **See your progress** with review and study-time totals, mastery, streaks, daily goals, and activity charts.
- **Bring your own cards.** Import CSV, TSV, text, or JSON files, paste spreadsheet rows or `Q:` / `A:` blocks, or import from a public card pack. Export decks as CSV or back up and restore your full library as JSON.
- **Make it yours** with a theme that follows your device’s light or dark setting (or a manual override), English and Italian interface text, and optional locally generated sound cues.
- **Keep learning offline.** After the first successful online load, the app shell and guest library are available offline on that device. Public courses are saved on that device when you open them.

## 🧭 How the app is structured

Flashlang is a static frontend built with browser-native HTML, CSS, and JavaScript modules. It has no bundler or package-install step. The app can run as a guest without a backend; Supabase is an optional service for account authentication, private cloud libraries, public courses, and public pack importing.

The main data model is a **library → classes → decks → cards** hierarchy. Each card stores its question, answer, confidence, review schedule, and optional starred state. Study activity and preferences live with the library.

| Area | Files | Responsibility |
| --- | --- | --- |
| App and interface | `index.html`, `src/app.js`, `src/icons.js` | Page entry point, app state, navigation, library and study views, and interactions |
| Library and study logic | `src/data.js`, `src/study.js`, `src/stats.js` | Example data, validation, review scheduling, card selection, and progress calculations |
| Import, language, and sound | `src/importer.js`, `src/i18n.js`, `src/sounds.js` | Card file parsing and export, public pack URL validation, English/Italian interface copy, and sound feedback |
| Cloud and offline support | `src/cloud.js`, `config.js`, `sw.js`, `manifest.webmanifest` | Optional Supabase access, public app-shell caching, and install metadata |
| Presentation | `styles.css`, `design.css`, `themes.css` | Layout, visual design, and theme styles |
| Backend and publishing | `supabase/`, `scripts/build.py`, `.github/workflows/` | Database schema and import function, packaging, and deployment |
| Samples and checks | `samples/`, `tests/` | Example import files and automated/browser tests |

## 🛠️ Run locally

Serve the project over HTTP so the browser can load JavaScript modules:

```sh
npm run dev
```

Open [localhost:5173](http://localhost:5173). You can also run `python3 -m http.server 5173 --bind 127.0.0.1`. Opening `index.html` directly as a file will not work correctly.

Run the automated tests with Node.js 22 or later:

```sh
npm test
```

No `npm install` is needed. With the local server running, the browser-native check page is at [localhost:5173/tests/run.html](http://localhost:5173/tests/run.html).

## 📥 Import and export

The import screen accepts CSV, TSV, semicolon- or pipe-separated text, JSON, and `Q:` / `A:` blocks. You can upload a file or paste content. Imports are previewed before they are added; CSV and TSV samples are in [`samples/`](./samples/). Each import can contain up to 10,000 cards, and each card side can contain up to 20,000 characters.

To import text from a public Brainscape pack, paste its shared flashcard-pack URL. This optional feature uses a Supabase Edge Function because browsers cannot fetch the source page directly across origins. Only readable text is imported; images, audio, and private packs are not supported. Deploy the function to the Supabase project configured in `config.js`:

```sh
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy
```

Use Settings to export or restore a full JSON library backup. Individual decks can be exported as CSV.

## 📱 Install and use offline

Open the [live site](https://andsumm.github.io/flashlang/) once while online. In Android Chrome, choose **Install app** or **Add to Home screen** from the browser menu. On iPhone, open the site in Safari and choose **Share → Add to Home Screen**.

After the first successful online load, the app shell is available offline. You can reopen Flashlang and use the guest library saved on that device, including imports, edits, and study. Public courses are saved to this device when you open their course page. Their review and star progress is saved locally immediately; when signed in, it syncs per card to your private account after the connection returns and merges with progress from your other devices. Guests keep progress on the current device. Signing in, loading a private cloud library, and syncing require an internet connection. External fonts are optional; system fonts are used when they are unavailable.

The service worker caches only public interface files from this site's own path. Opened public courses are stored separately in browser storage; private account data, authentication responses, and Supabase requests are never cached. New deployments receive a content-derived cache version so the offline shell can update.

## ☁️ Optional accounts and cloud sync

Guest mode stores the library in browser storage on the current device. To enable accounts for another deployment, connect a Supabase project:

1. Run [`supabase/schema.sql`](./supabase/schema.sql) in the project's SQL Editor. It creates a private library table with row-level security, a separate public-course listing, and a private per-user course-progress table. A course is private by default; its owner can make it available to anyone, including visitors who are not signed in. Only courses explicitly marked public are copied to the listing. Re-run the schema after app updates to apply schema changes.
2. Enable the Email provider in Supabase Authentication and configure the site's URL and allowed redirect URLs for your deployment and local development.
3. Add the project URL and its public publishable key (or legacy anon public key) to `config.js`:

   ```js
   window.APP_CONFIG = {
     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
     supabaseAnonKey: 'YOUR-PUBLISHABLE-OR-ANON-KEY',
   };
   ```

The URL and public key are intended for browser use. **Never** put a `service_role` key, secret API key, database password, or account access token in `config.js`. The database policies—not just the interface—enforce library privacy. See [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

The Supabase JavaScript SDK is loaded only when cloud features are configured. Email confirmations and password-reset delivery depend on the authentication and email settings of the Supabase project.

Each account's library is stored as one JSON document. Updates to that library are saved as a whole; simultaneous library edits from multiple devices use last-write-wins rather than collaborative merging. Public-course study progress is stored separately per user and per card, so studying a public course never changes its owner's content. Signed-in progress saved offline is queued on the device and synchronized when the connection returns. Browser storage is specific to a device and browser profile, so keep a JSON backup before clearing browser data or changing devices.

## 🚀 Build and publish

The app is published to GitHub Pages from this repository. Changes pushed to `main` are checked and deployed by the GitHub Actions workflow. To package and preview the public files locally:

```sh
python3 scripts/build.py
python3 -m http.server 4173 --directory _site
```

Open [localhost:4173](http://localhost:4173). The packaging script copies only public app files and assets into `_site`, then stamps the service worker with a content-derived version. It does not bundle, minify, or download dependencies. The relative asset paths allow the app to run at a domain root or under a repository path.
