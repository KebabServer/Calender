# Daymark security review — 2026-11-17

Scope: public GitHub Pages build, repository history at f77587a and current local edits, installed dependencies, live Supabase table policies/permissions, public authentication configuration, storage metadata, and browser account transitions. This is a focused review, not a guarantee that every vulnerability has been found.

## Findings

1. **Account-switch isolation (fixed in this release).** Application data and pending requests previously shared state across authentication changes. A refresh started under an old account could complete after another account signed in and populate the new workspace with old data. The workspace now remounts on user-ID changes, cancels pending note timers on unmount, and cloud queries explicitly filter by the captured user ID in addition to RLS. A browser regression with two mocked sessions and a delayed old response passes. No real credentials or personal content were used.
2. **Leaked-password protection disabled (live, advisory).** Supabase security advisor reports this is disabled. Supabase documents the feature as requiring Pro or above. Configure in Auth password settings if the plan supports it. Do not upgrade billing automatically. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
3. **Public registration enabled (live, deployment choice).** Email confirmation is required and anonymous sign-ins are disabled. Anyone can create their own isolated account. For a personal-only service, disable new signups in Supabase after creating the owner's account. Registration was not disabled during this audit.
4. **Browser hardening (partially addressed locally).** Added a no-referrer HTML policy. GitHub Pages currently supplies HSTS but no Content-Security-Policy, Referrer-Policy header, or X-Content-Type-Options header. A CSP is an additional defense worth adding and testing; its absence alone does not demonstrate an exploit. GitHub Pages does not support arbitrary custom response headers. Markdown remote images can contact their hosting sites; treat external images as third-party network requests.

## Checks passed

- npm audit: zero known vulnerabilities for the locally installed dependency tree. Remote main currently lacks a committed lockfile, so this does not prove every historical deployment resolved identical versions; the local work includes a lockfile and npm ci workflow.
- Scanned reachable local Git history for private-key material, service-role JWTs, Supabase secret-key strings, and common GitHub token formats: no matches. This is pattern-based scanning, not proof that every possible secret format is absent.
- Public bundle: no private-key, Supabase secret-key, or GitHub token patterns detected. It contains the intended Supabase project URL and publishable key, which are public by design.
- Deployed .env, .env.local, .git/config and the tested source-map URL return 404. Local .env.local is ignored by Git.
- Anonymous REST requests for notes/events return 401 with PostgreSQL insufficient_privilege (42501), without returning record data.
- Both exposed tables have RLS, ownership checks for SELECT/DELETE, and USING plus WITH CHECK for UPDATE. Event INSERT/UPDATE also require ownership of linked notes.
- No Supabase Storage buckets. The existing privileged RLS event-trigger function is not executable by anon/authenticated roles.
- No raw-HTML rendering or eval-based execution in app source. Markdown injection regression covers script tags, event attributes and javascript URLs.
- Production builds and TypeScript checks pass. Browser smoke tests cover notes and calendar at four viewport widths.

## Limits

A transaction containing temporary account fixtures was not executed because its tool confirmation expired. Live two-account authenticated CRUD/Realtime testing is therefore unverified; policy definitions and anonymous access were checked, and browser account switching was tested with mocks. No personal note/event rows were retrieved. No new real accounts, emails, or persistent audit fixtures were created.

Auth redirect allowlists, password length requirements, rate limits, SMTP configuration, backup settings and breached-password configuration cannot be changed or fully inspected with the currently connected project tools. The app's Supabase session is persisted in browser storage by the SDK; it is accessible to same-origin JavaScript and should not be treated as protection against an attacker who controls the browser/device. Cloud notes are not end-to-end encrypted. Exported backups are plaintext JSON.

At review time, the security fixes and calendar-first UI were local only. This release includes those changes; publication is verified separately through the GitHub Pages deployment.
