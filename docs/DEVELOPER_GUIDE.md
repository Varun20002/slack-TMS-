# Developer Guide

This guide is the engineering reference for the TrainerOS codebase.

## 1) Tech Stack

- **Framework**: Next.js App Router (`app/`)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + custom UI primitives (`components/ui`)
- **Auth/DB**: Supabase Auth + Supabase Postgres
- **Validation**: Zod + React Hook Form
- **Charts/UX**: Recharts, Sonner toasts
- **Integrations**:
  - Slack Slash/Interactive workflows
  - Google Calendar OAuth + event sync

## 2) Repository Layout

```txt
app/
  (auth)/login/{admin,trainer}
  admin/
  trainer/
  api/
    slack/{commands,interactions}
    google/calendar/{connect,callback,disconnect}
components/
  admin/
  trainer/
  layout/
  shared/
  ui/
lib/
  actions.ts
  queries.ts
  auth.ts
  validation.ts
  google-calendar.ts
  slack.ts
  supabase/{client,server,admin,middleware,env}
supabase/
  schema.sql
  seed.sql
types/
  database.ts
middleware.ts
```

## 3) Local Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
```

## 4) Environment Variables

Create `.env.local` using `.env.example`.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `BP_CHANNEL_ID`
- `GROWTH_CHANNEL_ID`
- `OPS_CHANNEL_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

## 5) Database Source of Truth

Schema and policies are managed in:

- `supabase/schema.sql`

Seed/demo data:

- `supabase/seed.sql`

### Important entities

- `profiles`: auth-linked app role (`admin` / `trainer`)
- `trainers`: trainer master data + rating aggregates
- `webinars`: webinar records + Google sync fields
- `webinar_metrics`: registrations/attendees/rating + attendance conversion backing
- `trainer_availability`: weekly slots used by Slack scheduling
- `webinar_requests`, `audit_log`, `content_checklist`: Slack approval workflow
- `trainer_google_connections`: encrypted refresh token + calendar metadata
- `trainer_ratings`, `rating_upload_batches`: CSV rating ingestion trail

## 6) Auth and Authorization

- Route protection is handled through middleware (`middleware.ts`) + role checks in server logic.
- Utility methods in `lib/auth.ts`:
  - `getCurrentProfile()`
  - `requireRole(role)`
- Admin and trainer have separate login routes and role gates.
- Trainer first-login password reset flow is enforced via `profiles.must_change_password`.

## 7) Server Actions and Data Flow

Main server actions are in `lib/actions.ts`:

- Trainer CRUD + onboarding
- Webinar update/delete + post-link updates
- Availability create/remove
- CSV upload for ratings + metrics updates

Read/query aggregation logic is in `lib/queries.ts`.

## 8) Slack Workflow (Webinar Requests)

Endpoints:

- `POST /api/slack/commands`
- `POST /api/slack/interactions`

High-level flow:

1. User runs `/webinar` in Slack.
2. Modal collects webinar details.
3. Request is inserted into `webinar_requests`.
4. BP team receives review actions (confirm / decline / suggest alternative).
5. On approval, Growth checklist starts.
6. On growth complete, request is marked completed and webinar record is upserted.
7. Admin UI reads request lifecycle from DB.

## 9) Google Calendar Integration

Routes:

- `/api/google/calendar/connect`
- `/api/google/calendar/callback`
- `/api/google/calendar/disconnect`

Flow:

1. Trainer connects calendar via OAuth.
2. Refresh token is encrypted (`lib/google-calendar.ts`) and stored in `trainer_google_connections`.
3. On webinar create/update/delete, app attempts calendar sync.
4. Sync status is tracked in `webinars.google_event_id` and `webinars.google_calendar_sync_error`.

### OAuth redirect mismatch fix

If you see `redirect_uri_mismatch`, ensure **both** match exactly:

- Google Cloud OAuth redirect URI
- `GOOGLE_OAUTH_REDIRECT_URI`

Example:

- `https://traineros-alpha.vercel.app/api/google/calendar/callback`

## 10) Admin Dashboard Notes

Current dashboard includes:

- core KPI cards
- upcoming trainer load table
- CSV upload with completed webinar selection + required registrations/attendees input

`Attendance Conversion` (UI label) is derived from:

- `attendees_count / registrations_count`

## 11) CSV Upload Behavior

CSV upload now supports survey-report ingestion and legacy simple rating format.

Admin must choose:

1. a completed webinar not yet CSV-rated,
2. registrations count,
3. attendees count,
4. file upload.

On success:

- trainer questionnaire averages are updated
- trainer average rating is recalculated
- webinar metrics are updated for selected webinar

## 12) Common Troubleshooting

### A) Trainer calendar says “Not connected”
- Verify trainer completed OAuth from trainer portal.
- Confirm `trainer_google_connections` row exists for that trainer.
- Check `webinars.google_calendar_sync_error` for detail.

### B) Slack creates webinar but no Google event
- Ensure Slack flow reaches webinar upsert stage.
- Verify trainer has Google connection.
- Check error text in admin upcoming webinars (sync status).

### C) OAuth failure (`400 redirect_uri_mismatch`)
- Fix Google Console redirect URI and env var to exact same callback URL.

### D) Availability page client crash
- Ensure latest deployment includes availability manager fixes.
- Check browser console stack trace and server logs for exact failing component.

## 13) Deployment (Vercel)

1. Link the correct Vercel project.
2. Set all env vars in that project.
3. Deploy:

```bash
npx vercel --prod
```

4. Validate:
- admin login
- trainer login
- Slack command
- Google calendar connect

## 14) Recommended Engineering Workflow

1. Pull latest code.
2. Run `npm run typecheck`.
3. Keep schema changes in `supabase/schema.sql`.
4. Prefer server actions for mutating flows.
5. Revalidate affected routes when mutating data.
6. For integration issues, inspect DB rows first, then API route logs.

