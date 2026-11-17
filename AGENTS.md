# Daymark repository guidance for Codex

## Goal
Maintain a personal responsive Notes + Calendar application that runs on GitHub Pages with Supabase cloud login and sync.

## Technology
React, TypeScript, Vite, Supabase, CSS. Project paths:
- src/App.tsx — application state, authentication and autosaving
- src/components/ — notes editor, home dashboard, event forms, calendar
- src/data/repository.ts — storage adapter for local demo mode or Supabase
- supabase/schema.sql — database and row-level security
- .github/workflows/deploy.yml — GitHub Pages build and deployment

## Developer workflow
Use Node.js 20.19+ or 22.12+. Install with npm install. Run npm run dev, npm run typecheck, and npm run build before proposing release. The previous artifact environment could not access npm, so a successful production build is not yet verified.

## Priorities
1. Verify and fix the app build and desktop/mobile UI.
2. Configure secure Supabase sign-in, RLS, and cross-device note sync.
3. Verify the GitHub Pages deploy workflow and Vite base path /Calender/.
4. Improve notes and calendar usability; add cross-device refresh and conflict safeguards before advanced reminders.

## Security
Never commit .env.local, access tokens, Supabase service-role keys, or real personal notes. Supabase public/publishable key is allowed in frontend code, but all tables must have user-scoped row-level security.
