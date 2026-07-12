# MC Punch List

Mobile-friendly punch-list PWA built with Next.js and Firebase.

## Features

- Contractor account (real Firebase email/password login) creates projects
- Contractor dashboard: search projects by customer name/address, see
  progress % per project
- Customer opens the project via a shared link — no account needed
- Customer adds individual punch-list items (title, description, room,
  category, priority) and photos
- Contractor assessment field, status (Open / In progress / Completed)
- Contractor completion photos
- Contractor can close a punch list — customer can still view it, but can no
  longer add items or photos (enforced in Firestore rules, not just the UI)
- Final report page (`/project/[id]/report`) with before/after photos per
  item, contractor evaluation, and on-screen signature capture for both
  customer and contractor — "Generate PDF" uses the browser's print dialog
  ("Save as PDF"), no extra service required
- Live updates through Firestore
- Change history per item (status changes, evaluation updates, photo
  additions) — visible from a "History" toggle on each item card
- Installable PWA: real icons, offline fallback page, and a service worker
  that caches the app shell (data itself still requires a connection)

## 1. Install

```bash
npm install
```

## 2. Firebase setup

1. Create a Firebase project.
2. Add a Web App, copy the config into `.env.local` (based on `.env.local.example`).
3. Authentication > Sign-in method: enable **Anonymous** (for customers) and
   **Email/Password** (for the contractor).
4. Create a Firestore database.
5. Enable Firebase Storage.

## 3. Publish rules

Copy `firestore.rules` into Firestore Rules and `storage.rules` into Storage Rules.

The dashboard's project list (Firestore console → Indexes, or `firebase deploy
--only firestore:indexes` if you use the CLI) needs the composite index
described in `firestore.indexes.json` (`contractorUid` + `createdAt`). If you
skip this, the first dashboard load will show an error in the browser console
with a direct link to auto-create it — just click it.

## 4. Create the first contractor account

There is no public sign-up screen for contractors — accounts are provisioned by
you, on purpose, so a stranger can never grant themselves contractor access.

1. Firebase console → Authentication → Add user → enter your email/password.
2. Copy the new user's UID.
3. Firestore console → start collection `contractors` → document ID = that UID →
   any single field, e.g. `{ addedAt: <timestamp> }`. The document just needs to
   exist; its content isn't read.

That account can now log in at `/login` and will land in the contractor dashboard.
Repeat for each teammate who needs contractor access.

## 5. Run locally

```bash
npm run dev
```

Open http://localhost:3000 — you'll be sent to `/login`.

## 6. Deploy

The easiest options are Vercel for Next.js and Firebase for database/storage.

## Security notes

- The contractor PIN from earlier versions is gone. Contractor access is now a
  real Firebase Auth account, checked both in the UI and in `firestore.rules` /
  `storage.rules` — a customer can no longer edit the assessment or status by
  calling the Firestore API directly.
- Customers never sign up; opening a project link signs them in anonymously.
  They can only *fetch* a project if they already know its ID (the link) —
  Firestore rules block anonymous users from *listing* the `projects`
  collection, so a customer can't enumerate other people's projects.
- Firebase Storage download URLs carry their own access token once generated;
  by design, a URL you've already shared stays fetchable even if you later
  tighten `storage.rules`. Treat completion/customer photo links as
  effectively permanent once shared.

## PWA notes

- The service worker only registers in production builds (`npm run build &&
  npm start`, or your deployed site) — it's intentionally skipped in
  `npm run dev` to avoid caching issues while you're developing.
- It caches the app shell and static assets so navigation doesn't hit a raw
  browser error when offline; it shows `offline.html` instead. It does
  **not** cache Firestore/Storage data — punch lists still require a live
  connection to load or save. Real offline data access would need Firestore's
  IndexedDB persistence (`enableIndexedDbPersistence`), which is a separate,
  larger change.
- Icons live in `public/icons/`; replace them any time with your own artwork
  at the same file names/sizes.

## Still ahead

- Emailing the customer link automatically (currently copy/paste by the
  contractor) — would need an email-sending service such as Firebase
  Extensions + SendGrid, since there's no backend in this project yet.
