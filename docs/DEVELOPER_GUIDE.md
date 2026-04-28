# Developer Guide

This guide is the engineering reference for the Trainer Management System (TMS) codebase.

## 1) Tech Stack

- **Framework**: Next.js 15 (App Router, Server Components, Server Actions)
- **Language**: TypeScript 5
- **UI**: React 19, Tailwind CSS 3, custom shadcn-style primitives in `components/ui`
- **State / forms**: React Hook Form + Zod (`lib/validation.ts`)
- **Charts / UX**: Recharts, Sonner (toasts), Lucide icons, `next-themes`
- **Auth / DB**: Supabase Auth + Supabase Postgres + Row Level Security (`@supabase/ssr`)
- **CSV parsing**: PapaParse
- **Integrations**:
  - Slack slash commands & block-kit interactivity (`/webinar`, BP / growth approval flow)
  - Google Calendar OAuth 2.0 with encrypted refresh tokens
- **Testing**: Vitest (`__tests__/`)

## 2) Repository Layout

```txt
app/
  (auth)/login/{admin,trainer}            login pages per role
  admin/
    dashboard/                            KPIs, calendar, CSV upload
    webinars/                             upcoming + past lists; [id] detail
    trainers/                             trainer directory + onboarding
    leaderboard/
    achievements/
    calendar/
    profile/
    layout.tsx                            requireRole("admin") + AppShell
  trainer/
    dashboard/                            UpcomingWebinarCard + leaderboard preview
    webinars/                             list + [id] detail (own webinars only)
    availability/                         weekly slot manager + own calendar
    calendar/
    leaderboard/
    achievements/
    profile/
    first-login/                          forced password reset
    layout.tsx                            requireRole("trainer") + AppShell
  api/
    slack/{commands,interactions}         Slack webhook endpoints
    google/calendar/{connect,callback,disconnect}
components/
  admin/                                  csv-upload, past/upcoming managers, trainer dir, webinar form
  trainer/                                availability manager, upcoming-webinar-card
  shared/                                 webinar-calendar, webinar-detail-view, time-remaining-badge
  layout/                                 app-shell, stat-card, growth-stat-card, theme-toggle, profile-form, empty-state, logout-button
  leaderboard/                            sortable table + rating chart
  charts/                                 recharts wrappers
  ui/                                     button, card, badge, input, label, select, table, skeleton, textarea
  providers.tsx                           ThemeProvider + Toaster
lib/
  actions.ts                              Server Actions (mutations)
  queries.ts                              Server-side reads + autoCompletePastWebinars()
  auth.ts                                 getCurrentUser/Profile, requireRole
  validation.ts                           Zod schemas (webinar, trainer, availability, etc.)
  csv-helpers.ts                          Survey CSV row parsing helpers
  google-calendar.ts                      OAuth + event create/update/delete + token enc/dec
  slack.ts                                slackApi wrapper
  utils.ts                                cn, formatDate, buildGoogleCalendarEventUrl
  supabase/{client,server,admin,middleware,env}.ts
supabase/
  schema.sql                              Single source of truth: tables, RLS, functions, triggers
  seed.sql                                Demo data
types/database.ts                         Generated table typings
__tests__/lib/                            vitest specs (admin-dashboard, leaderboard, csv-helpers, validation, utils)
middleware.ts                             Route protection / session refresh
```

## 3) Local Development

```bash
npm install
npm run dev            # http://localhost:3000
```

Quality gates:

```bash
npm run typecheck
npm run lint
npm run test           # vitest run (CI-friendly)
npm run test:watch     # interactive
npm run test:coverage
```

## 4) Environment Variables

Copy `.env.example` to `.env.local`.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `BP_CHANNEL_ID`        — Business Partners review channel
- `GROWTH_CHANNEL_ID`    — Growth checklist channel
- `OPS_CHANNEL_ID`       — Ops notification channel
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`  — 32-byte hex key for refresh-token AES-GCM

## 5) Database Source of Truth

Schema, RLS policies, helper functions, and triggers live in:

- `supabase/schema.sql`

Demo data:

- `supabase/seed.sql`

### Key tables

| Table                          | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `profiles`                     | Auth-linked role (`admin` / `trainer`) + `must_change_password` |
| `trainers`                     | Trainer master record + cached `average_rating`               |
| `webinars`                     | Webinar + Google sync fields + `status` (upcoming/completed/cancelled) |
| `webinar_metrics`              | Registrations, attendees, rating, success rate per webinar    |
| `trainer_availability`         | Weekly slots used by Slack scheduling                         |
| `webinar_requests`             | Slack-driven request lifecycle                                |
| `audit_log`                    | Immutable trail of Slack actions                              |
| `content_checklist`            | Growth checklist items per request                            |
| `trainer_google_connections`   | Encrypted refresh token + calendar metadata                   |
| `trainer_ratings`              | Per-question rating rows ingested from CSV                    |
| `rating_upload_batches`        | One row per CSV upload (audit)                                |

### Helper functions in `schema.sql`

- `set_updated_at()` — generic trigger to maintain `updated_at`
- `current_user_role()`, `current_trainer_id()` — used by RLS policies
- `auto_complete_past_webinars()` — flips any `upcoming` webinar whose
  `webinar_timing + duration_minutes` has passed to `completed` (see §11)
- `compute_success_rate(reg, att, first_ft)` — derives `webinar_metrics.success_rate`

## 6) Auth and Authorization

- Middleware at `middleware.ts` refreshes the Supabase session and gates routes.
- Server-side helpers in `lib/auth.ts`:
  - `getCurrentUser()` — auth user
  - `getCurrentProfile()` — `profiles` row joined to the auth user
  - `requireRole(role)` — redirect on wrong role / unauthenticated
- Each role has its own login page and layout:
  - Admin: `app/(auth)/login/admin/page.tsx` → `/admin/*` (gated by `app/admin/layout.tsx`)
  - Trainer: `app/(auth)/login/trainer/page.tsx` → `/trainer/*` (gated by `app/trainer/layout.tsx`)
- Trainer first-login password reset is enforced via `profiles.must_change_password`
  and the `/trainer/first-login` route.
- All sensitive reads (e.g. `app/trainer/webinars/[id]/page.tsx`) additionally check
  ownership at the query level — RLS plus app-level checks.

## 7) Server Actions and Data Flow

Mutations live in `lib/actions.ts` (`"use server"`):

- Trainer CRUD + onboarding + activation links
- Webinar create/update/delete + Google sync + Slack notifications
- Availability create/remove
- CSV survey upload (`uploadRatingsCsvAction`)
- Profile / first-login flows

Reads live in `lib/queries.ts`:

- `autoCompletePastWebinars()` — see §11
- `getAdminDashboardData()` — KPIs, upcoming/past lists, CSV-rated set
- `getTrainerDashboardData(profileId)` — trainer-scoped stats + leaderboard rank
- `getLeaderboardData()` — ranked trainers (rating → completed → attendees)

Pages call these from Server Components and use `revalidatePath()` after mutations.

## 8) Slack Workflow (Webinar Requests)

Endpoints:

- `POST /api/slack/commands` — slash commands (`/webinar`)
- `POST /api/slack/interactions` — block-kit button / select / modal actions

High-level flow:

1. Requester runs `/webinar` and submits the modal.
2. Row inserted into `webinar_requests`; an `audit_log` row is recorded.
3. BP channel receives review actions: confirm, decline, suggest alternative.
4. On confirm, Growth channel receives a content checklist (`content_checklist`).
5. When growth completes the checklist, the request is marked completed and a
   `webinars` row is upserted (linked via `webinars.source_request_id`).
6. Admin UI surfaces lifecycle from `webinar_requests` + `audit_log`.

Tracability columns on `webinars`:

- `source_request_id`, `slack_requester_id`, `slack_requester_name`

## 9) Google Calendar Integration

Routes:

- `/api/google/calendar/connect`
- `/api/google/calendar/callback`
- `/api/google/calendar/disconnect`

Flow:

1. Trainer connects calendar via OAuth.
2. Refresh token encrypted (`lib/google-calendar.ts`) and stored in `trainer_google_connections`.
3. Webinar create/update/delete attempts calendar sync via `withTrainerGoogleAccessToken()`.
4. Sync state stored in `webinars.google_event_id` and last error in
   `webinars.google_calendar_sync_error`.
5. UI exposes generated `webinars.google_calendar_embed_url` (Add to Calendar links).

### `redirect_uri_mismatch` checklist

Both must match exactly:

- Google Cloud Console OAuth → Authorized redirect URIs
- `GOOGLE_OAUTH_REDIRECT_URI`

Example:

```
https://your-deployment.vercel.app/api/google/calendar/callback
```

## 10) Admin Dashboard Notes

`app/admin/dashboard/page.tsx` renders:

- KPI cards (`StatCard`): trainers, upcoming, completed, top-1 trainer
- "Upcoming this week" table with View More → `#calendar`
- Rating CSV upload (`CsvUploadForm`) with per-webinar metrics input
- Full `WebinarCalendar` with clickable event tiles → `/admin/webinars/[id]`

`Attendance Conversion` (UI label) is derived from
`attendees_count / registrations_count`.

## 11) Webinar Status & Auto-Completion

Status is the column `webinars.status` with values
`upcoming` / `completed` / `cancelled` (default `upcoming`).

Auto-completion is **lazy**, not cron-based:

1. SQL function `public.auto_complete_past_webinars()` (in `schema.sql`)
   atomically flips any `upcoming` webinar where
   `webinar_timing + make_interval(mins => coalesce(duration_minutes, 60)) < now()`
   to `completed`.
2. The TypeScript helper `autoCompletePastWebinars()` in `lib/queries.ts` calls
   the RPC. If the function isn't deployed yet (Postgres `42883`), it falls back
   to a conservative `webinar_timing < now() - 60 min` update so the app keeps
   working during rollout.
3. The helper is invoked at the start of every status-sensitive entrypoint:
   - `getAdminDashboardData()`, `getTrainerDashboardData()`, `getLeaderboardData()`
   - `app/admin/webinars/page.tsx`
   - `uploadRatingsCsvAction()` (so a webinar that just ended is immediately uploadable)

`cancelled` rows are never touched. Manual admin status edits remain authoritative.

### Deploying the SQL function

After pulling changes that introduce or update the function, apply it once in
Supabase:

```bash
# Option A: re-run the canonical schema (uses CREATE OR REPLACE — safe to re-run)
supabase db reset

# Option B: paste the auto_complete_past_webinars block from
# supabase/schema.sql into the SQL editor and run it.
```

## 12) CSV Upload Behavior

`components/admin/csv-upload-form.tsx` + `uploadRatingsCsvAction`.

Admin must select:

1. A completed webinar that doesn't yet have a CSV (filtered in
   `app/admin/dashboard/page.tsx` against `csvRatedWebinarIds`).
2. Registrations count.
3. Attendees count (must be ≤ registrations).
4. The CSV file itself.

On success:

- Survey rows are parsed (`lib/csv-helpers.ts`) and per-question ratings are
  stored in `trainer_ratings` (`source = 'csv'`) tied to a
  `rating_upload_batches` row.
- `webinar_metrics` is upserted with registrations/attendees/rating + success rate.
- Trainer `average_rating` is recalculated.
- `revalidatePath` invalidates the admin dashboard and webinars pages.

## 13) UI Highlights

- `components/trainer/upcoming-webinar-card.tsx` — gradient hero card with live
  countdown ("Starts in DD HH MM"), date badge, and CTA. Used on the trainer
  dashboard.
- `components/shared/webinar-calendar.tsx` — month grid with clickable day cells
  (modal listing day's webinars) and clickable event tiles. Pass
  `detailHrefBase` (e.g. `"/admin/webinars"` or `"/trainer/webinars"`) to make
  tiles deep-link to the detail page.
- `components/shared/webinar-detail-view.tsx` — shared presentational component
  rendering a webinar's full details + metrics (used by both admin and trainer
  detail pages).
- `components/leaderboard/sortable-leaderboard-table.tsx` — column sorting +
  optional city + own-row highlighting.
- `components/layout/app-shell.tsx` — responsive sidebar + topbar with theme
  toggle and logout.
- `components/providers.tsx` — wraps `next-themes` + Sonner.

## 14) Testing

Vitest specs live in `__tests__/lib/`:

- `admin-dashboard.test.ts` — past/completed filters and `csvRatedWebinarIds` dedup.
- `queries-leaderboard.test.ts` — leaderboard ordering rules.
- `csv-helpers.test.ts` — survey CSV parsing edge cases.
- `validation.test.ts` — Zod schema invariants.
- `utils.test.ts` — `formatDate`, `cn`, calendar URL builder.

Run:

```bash
npm run test
npm run test:coverage
```

## 15) Common Troubleshooting

### A) Trainer calendar says "Not connected"
- Verify trainer completed OAuth from `/trainer/profile`.
- Confirm `trainer_google_connections` row exists for that trainer.
- Inspect `webinars.google_calendar_sync_error` for the most recent failure.

### B) Slack creates a webinar but no Google event appears
- Make sure the Slack flow reached the `webinars` upsert step
  (`audit_log` action `slack_schedule_direct` / approval completion).
- Verify the assigned trainer has a Google connection.
- Check `webinars.google_calendar_sync_error` and the upcoming-webinars
  manager UI in admin.

### C) OAuth failure (`400 redirect_uri_mismatch`)
- Align Google Console redirect URI and `GOOGLE_OAUTH_REDIRECT_URI` exactly
  (scheme, host, path, no trailing slash).

### D) "Select webinar" dropdown missing a webinar that already happened
- The dashboard filter is `status === 'completed' && !csvRated`.
- Lazy auto-completion handles time-elapsed rows on the next page load. If
  it still doesn't appear, check that `auto_complete_past_webinars()` is
  deployed in your Supabase project (see §11).

### E) Availability page client crash
- Check the browser console stack and server logs for the failing component.
- Confirm the trainer has a `trainer_availability` row shape that matches the
  `availabilitySchema` in `lib/validation.ts`.

## 16) Deployment (Vercel)

1. Link the correct Vercel project.
2. Set every env var listed in §4.
3. Apply the latest `supabase/schema.sql` to the linked Supabase project.
4. Deploy:

   ```bash
   npx vercel --prod
   ```

5. Smoke test:
   - Admin login → dashboard renders, KPIs non-zero
   - Trainer login → first-login redirect (if applicable), dashboard renders
   - `/webinar` Slack command end-to-end
   - Google Calendar connect + create a test webinar
   - CSV upload for a completed webinar

## 17) Engineering Workflow

1. Pull latest `main` and reinstall if `package.json` changed.
2. Run `npm run typecheck && npm run lint && npm run test` before committing.
3. Keep all schema changes in `supabase/schema.sql` (single source of truth).
4. Prefer **Server Actions** for mutations and **Server Components** for reads.
5. Call `revalidatePath()` (or `revalidateTag`) after mutating data so SSR
   pages refresh.
6. For integration issues, inspect the relevant DB rows first
   (`webinars`, `webinar_requests`, `audit_log`, `trainer_google_connections`),
   then API route logs.
7. When adding a new status-sensitive read path, remember to call
   `autoCompletePastWebinars()` at the top (see §11).
