# Daymark — Notes & Calendar

A calm, responsive personal notes-and-calendar app. Made with React, TypeScript, Vite, Markdown, and optional Supabase cloud sync.

## Features

- 📒 Create, edit, search, pin, delete, and preview Markdown notes; autosave while typing
- 📅 Monthly calendar with create/edit/delete events, priorities, all-day events, and start times and durations in calendar cells
- Clone events 1–10 weeks ahead as independent events, preserving times, colors, descriptions and linked notes
- 🔗 Link notes to events and jump between them
- Calendar opens by default, with direct navigation to notes, to-do list and settings
- Add, edit, complete, reopen and delete private tasks; filter Open, All or Done
- 🌓 Light and dark themes; mobile navigation and responsive layouts
- ☁️ Optional email/password accounts, Supabase-backed storage and cross-device sync
- 💾 Download a JSON backup of notes, events and tasks
- 🚀 GitHub Pages deployment workflow included

**Not yet included:** push notifications, single-occurrence exceptions, multi-day events, simultaneous editing conflict resolution, server-side account recovery UI, importing JSON backups, full offline cloud editing, or PWA installation. Events represent a single date and wall-clock time; no timezone conversion is performed.

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

## To-do list

Open **To-do**, type a task and tap **+** (or press Enter). Use the checkbox to complete or reopen a task, the pencil to edit it, or the bin to delete it after confirmation. Tasks sync to your account through Supabase, and each user can access only their own tasks. Drafts remain when switching tabs; save or cancel a draft before updating or signing out. Tasks are included in JSON backups.

Fresh Supabase installations use `supabase/schema.sql`. Existing projects can run `supabase/tasks.sql` once; the connected production project is already upgraded.

## Compact event editor

The event form uses equal-width Start time and Duration fields with compact spacing for iPhone SE-sized screens. Optional description and linked note are under **More details**; saved values are kept even when that section is closed. Additional options can scroll inside the dialog while the action buttons remain available.

**Event priority** is ordered left to right: **High** (red), **Medium** (purple), **Low** (blue), **None** (mint). Existing event selections are preserved.

## Event duration

Timed events use **Start time + Duration**, with **1h** selected for new events. Choose a preset, enter a custom duration in minutes, or select **? Unknown**. The calendar shows the start and duration, for example `18:00 · 1h` or `18:00 · ?`. Existing events retain their duration, calculated from their stored start/end times. All-day events remain unchanged.

Durations end on the event's date (or exactly at midnight). For longer spans past midnight, split the event or use unknown duration. Existing installations must run `supabase/unknown-event-duration.sql` once before deploying this version; the connected production project is already upgraded. Unknown durations use a null end time and are preserved when cloning.

## Weekly copies

Create or edit an event and turn on **Clone to future weeks**. Choose **1–10 future copies** and select **Save & clone**. This saves the original event plus that many copies: copy 1 is seven days later, copy 2 is fourteen days later, and so on. Each has its own ID, preserves the event details, local start time and duration, and can be edited or deleted without changing any other event. Cloning is off by default whenever an event is opened, so editing a copy does not create more copies accidentally.

Source saving and copying happen in one database transaction (or one browser storage write in demo mode). Cloud saves use the authenticated `save_event_with_copies` function, which runs with the caller's permissions and existing RLS.

Fresh Supabase installations use `supabase/schema.sql`. Existing installations with the recurrence columns can run `supabase/event-copies.sql` once. Older installations must first add those columns using `supabase/weekly-events.sql`. The connected production project is already upgraded.

The owner's previous open-ended weekly series was explicitly converted to the original plus 10 copies. `supabase/convert-existing-weekly.sql` records that one-time conversion; it is not required for new installations. Legacy series from an older client remain readable and can be converted explicitly in the form. New events do not create recurring series.

## Home Screen updates

Production builds publish a `version.json` release marker. Daymark checks it with a unique URL and `no-store` on startup, focus, return from the background, restored pages, and while open. An idle calendar loads a newly published release using a fresh URL. The URL includes a release marker to prevent refresh loops during CDN propagation.

If a note or event is being edited, the app waits. **Update now** saves pending/failed note edits before refreshing; a failed save keeps the draft and pauses the update. Finish or cancel an event form first. Refreshing does not clear website data or the Supabase sign-in session. Offline or invalid version checks leave the current app usable.

A Home Screen app already running a version from before this updater was added needs one fresh load to receive it. Fully close and reopen it, or open a fresh link to the deployed site. If an old shortcut still restores the old page, replace the shortcut with one made from the freshly loaded page. Do not clear Safari website data as an update step.

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
  components/             # Notes editor, calendar, forms
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

1. Run `npm run dev` without an `.env.local` and confirm the calendar loads demo content.
2. Create a note, write some Markdown, pin it, refresh the page, and confirm it persists.
3. Create an event, choose a priority, link a note under More details, then edit and delete the event.
4. Check layout and calendar navigation on a narrow phone-sized browser window.
5. After setting up Supabase, sign in to the same account on two devices. Create a note on one and confirm it appears on the other; reload to verify persistence.
6. Confirm that a different Supabase account cannot read your notes or events.

Development verification now includes dependency installation, TypeScript checks, and a production build with `VITE_BASE_PATH=/Calender/`. Browser smoke tests cover note creation, autosave persistence, Markdown preview, month navigation, event editing, and linked notes at 320, 390, 768, and 1440 pixels. Live Supabase authentication and cross-account RLS still require a configured Supabase project.

Run the browser checks against the production output:

```bash
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_SUPABASE_ANON_KEY= VITE_BASE_PATH=/Calender/ npm run build
npx playwright install chromium
npm run test:e2e
```

To use an installed Chromium instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path.

### Pages configuration verification (2026-11-17)

The workflow uses Node 22, `npm ci` with the committed lockfile, TypeScript checks, the `dist` artifact, and the required Pages/OIDC permissions. Its generated base path is `/Calender/` for this repository.

Pages is configured to use GitHub Actions. The deployment workflow was rerun successfully after switching away from the legacy source. Keep **Settings → Pages → Build and deployment → Source** set to **GitHub Actions**.

The previous workflow also had empty Supabase URL and publishable-key variables. Set the two public Actions variables described above to enable production cloud login; otherwise the build runs in demo mode. Never supply a service-role key.
