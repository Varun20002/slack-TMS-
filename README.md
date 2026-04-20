# Trainer Management System (Next.js + Supabase)

Production-ready Trainer Management System built for restricted environments:
- no local PostgreSQL
- no Prisma/Sequelize
- no Docker
- no OS-level services

This project uses Next.js App Router + Supabase only, so setup is:
1. `npm install`
2. configure env vars
3. run

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS
- Supabase Auth + Supabase Postgres
- Supabase RLS
- React Hook Form + Zod
- PapaParse (CSV import)
- Recharts
- Vercel deployment friendly

## Features

### Auth & Access
- Separate login routes:
  - `/login/admin`
  - `/login/trainer`
- Role-based access using `profiles.role`
- Middleware route protection
- Session persistence (Supabase SSR cookies)
- Logout flow

### Admin
- Dashboard KPIs and charts
- Trainer onboarding form (full metadata)
- Trainer directory table
- Webinar scheduling
- Upcoming and past webinars with metrics
- CSV ratings upload (`trainer_email, webinar_id, rating`)
- Google Calendar embed preview
- Leaderboard analytics
- Admin profile editing

### Trainer
- Dashboard (upcoming webinar, rating, attendance metrics, badges)
- Webinars (upcoming + past)
- Achievements (badges + incentives)
- Leaderboard with rank comparison
- Profile editing
- Availability slot management (overlap prevention)

## Project Structure

```txt
.
├── app
│   ├── (auth)/login/admin
│   ├── (auth)/login/trainer
│   ├── admin
│   └── trainer
├── components
│   ├── admin
│   ├── auth
│   ├── charts
│   ├── layout
│   ├── trainer
│   └── ui
├── lib
│   ├── supabase
│   ├── actions.ts
│   ├── auth.ts
│   ├── queries.ts
│   └── validation.ts
├── types
├── supabase
│   ├── schema.sql
│   └── seed.sql
├── middleware.ts
└── .env.example
```

## Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SLACK_BOT_TOKEN="xoxb-..."
SLACK_SIGNING_SECRET="your-slack-signing-secret"
```

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run:
   - [`supabase/schema.sql`](/Users/debjit.saha/Documents/TMS/supabase/schema.sql)
3. In Auth > Users, create:
   - `admin@traineros.com`
   - `trainer1@traineros.com`
   - `trainer2@traineros.com`
4. Copy their UUIDs and replace placeholders in:
   - [`supabase/seed.sql`](/Users/debjit.saha/Documents/TMS/supabase/seed.sql)
5. Run `seed.sql`.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Vercel Deployment

1. Push repo to GitHub.
2. Import project in Vercel.
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`
4. Deploy.

No custom server needed.

## RLS Policy Summary

Implemented in [`supabase/schema.sql`](/Users/debjit.saha/Documents/TMS/supabase/schema.sql):
- `admin` can manage trainer/webinar/rating/badge/incentive data.
- `trainer` can:
  - read leaderboard-relevant data
  - update own `profiles` row
  - update own linked `trainers` row
  - manage own `trainer_availability`
- Trainers cannot modify other trainers’ records.

## Leaderboard Formula

Current ranking score is:

`score = (average_rating * 0.5) + (completed_webinars * 0.3) + ((total_attendees / 100) * 0.2)`

This is computed in app logic (`lib/queries.ts`) and is intentionally easy to change.

## CSV Format

Ratings upload expects columns:

```csv
trainer_email,webinar_id,rating
trainer1@traineros.com,c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1,4.6
trainer2@traineros.com,,4.4
```

`webinar_id` is optional.

## Slack Webinar Scheduling

This repo supports scheduling webinars directly from Slack while keeping the admin web form.

Routes:
- `/api/slack/commands`
- `/api/slack/interactions`

Suggested Slack app setup:
1. Create slash command: `/webinar`
   - Request URL: `https://<your-domain>/api/slack/commands`
2. Interactivity Request URL:
   - `https://<your-domain>/api/slack/interactions`
3. Bot scopes:
   - `commands`
   - `chat:write`
   - `im:write`
4. Install app to workspace.

Current Slack flow captures all webinar form details except duration (defaults to 60 minutes for now).

### Integration With `internal-slack-bot-main` Dataset

To unify with your existing Slackbot workflow schema, this app now supports these additional tables:
- `webinar_requests`
- `audit_log`
- `content_checklist`

Slack-created webinars write:
1. `webinar_requests` row (state = `CONFIRMED` for direct scheduling flow)
2. `audit_log` row (`action = slack_schedule_direct`)
3. `webinars` row linked by `webinars.source_request_id`

Additional columns on `webinars` for traceability:
- `source_request_id`
- `slack_requester_id`
- `slack_requester_name`

Run the latest [`supabase/schema.sql`](/Users/debjit.saha/Documents/TMS/supabase/schema.sql) to apply these integration changes.
