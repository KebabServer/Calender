# Daymark — Notes & Calendar

A calm, responsive personal notes-and-calendar app. Made with React, TypeScript, Vite, Markdown, and optional Supabase cloud sync.

## Features

- 📒 Create, edit, search, pin, delete, and preview Markdown notes; autosave while typing
- 📅 Monthly calendar with create/edit/delete events, colors, all-day and time slots
- 🔗 Link notes to events and jump between them
- 🏠 Today dashboard, upcoming events, and recently edited notes
- 🌓 Light and dark themes; mobile navigation and responsive layouts
- ☁️ Optional email/password accounts, Supabase-backed storage and cross-device sync
- 💾 Download a JSON backup of your data
- 🚀 GitHub Pages deployment workflow included

**Not yet included:** push notifications, repeating/multi-day events, simultaneous editing conflict resolution, server-side account recovery UI, importing JSON backups, full offline cloud editing, or PWA installation. Events represent a single date and wall-clock time; no timezone conversion is performed.

## Quick start — demo mode

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the URL Vite displays. Without Supabase environment variables, Daymark starts in **local demo mode** and includes sample notes and events. Data persists in this browser's `localStorage`, but is *not private account storage* and **does not sync to other devices**. Don't use demo mode for sensitive personal information, especially on a shared computer.

## Enable private cloud sync

1. Create a project at [supabase.com](https://supabase.com/).
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it (once per fresh project). This creates the notes/events tables, ownership policies and Realtime publication.
3. In **Authentication → Providers**, enable Email. Choose whether users must confirm their email.
4. In **Project Settings / Connect**, copy the **Project URL** and **publishable key** (or legacy anon key). Never use a secret or service-role key in frontend code.
5. Copy `.env.example` to `.env.local`, then set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

6. Run `npm run dev`. Your app now shows a sign-in/sign-up screen. Create an account and sign in.
7. In Supabase **Authentication → URL Configuration**, add your deployed GitHub Pages URL to allowed redirect URLs; set the Site URL to the same production URL if this is the main environment. Keep your local URL in the redirect allowlist if you use email confirmation locally. E.g. `https://USERNAME.github.io/REPO/`.

**Important:** the demo's browser-local notes are **not automatically imported** when enabling Supabase. The downloaded JSON backup is for safekeeping, not in-app import. Do not mistake the demo for cloud sync.

**Security:** SQL row-level security restricts note and calendar records to the authenticated user. GitHub Pages itself is a public static website; it contains only the frontend and public Supabase publishable key, never your notes.

## Deploy to GitHub Pages

1. Create a GitHub repository and push these files to the `main` branch.
2. In GitHub **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
3. To enable cloud login in production, add **Actions variables** in **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   These are *public browser credentials*, not confidential secrets. Keep service-role/secret keys out of the app and repository.
4. Push to `main`, or run the **Deploy Daymark to GitHub Pages** action manually.
5. Visit `https://YOUR_USERNAME.github.io/YOUR_REPO/` on any device and sign in to your account.

The workflow sets Vite's `VITE_BASE_PATH` to `/<repo-name>/` automatically for standard project-site URLs. For a username root site (`USERNAME.github.io`) or custom-domain root, change it to `/` in the workflow.

**Notes:** GitHub Pages handles static builds only; Supabase provides authentication, storage and sync. Open `design-preview.html` for a non-interactive, static visual mockup (the real app is the React project).

The app uses no client-side routes, so it works without server redirects. Supabase Realtime updates other open sessions; devices that reconnect fetch current records on page reload. For two devices editing the *same* note simultaneously, the last saved text wins. Add conflict resolution before relying on collaborative editing.

## Check the build

```bash
npm run typecheck
npm run build
npm run preview
```

## Project layout

```text
src/
  App.tsx                 # Application state, autosave, authentication
  components/             # Dashboard, notes editor, calendar, forms
  data/repository.ts      # Browser demo or Supabase storage adapter
  lib/supabase.ts         # Supabase client configuration
  types.ts                # Shared models
  styles.css              # Design system + responsive styles
supabase/schema.sql       # Private cloud database and RLS
.github/workflows/deploy.yml
```

## Private-use checklist

- Keep the GitHub repository public or private as you prefer; remember that Pages itself is public.
- Use a strong password and enable email confirmation if desired.
- Protect account ownership in Supabase with row-level security (included in `schema.sql`).
- Export data occasionally; also configure Supabase backups appropriate to your plan.
- A single-user app doesn't need a custom server. If your project's signups must be restricted, disable public registration in Supabase after making your own account.

## Manual smoke-test checklist

1. Run `npm run dev` without an `.env.local` and confirm the dashboard loads demo content.
2. Create a note, write some Markdown, pin it, refresh the page, and confirm it persists.
3. Create an event, choose a color, link a note, then edit and delete the event.
4. Check layout and calendar navigation on a narrow phone-sized browser window.
5. After setting up Supabase, sign in to the same account on two devices. Create a note on one and confirm it appears on the other; reload to verify persistence.
6. Confirm that a different Supabase account cannot read your notes or events.

The source was syntax-checked in the artifact environment, but the full `npm install` / production build and live Supabase tests must be run in an environment with npm registry access.
