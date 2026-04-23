create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'trainer')),
  full_name text not null,
  phone text,
  email text not null unique,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  experience integer not null default 0,
  investing_trading_persona text not null,
  strengths text not null,
  product_categories text[] not null default '{}',
  nature_of_business text not null,
  phone_number text not null,
  email text not null unique,
  languages_spoken text not null,
  base_city text not null,
  credentials_or_claim_to_fame text,
  certifications text,
  social_media_handles jsonb,
  profile_image_url text,
  temporary_password text,
  session_rating_avg numeric(4,2) not null default 0,
  speaker_rating_avg numeric(4,2) not null default 0,
  coverage_rating_avg numeric(4,2) not null default 0,
  average_rating numeric(4,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webinars (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  source_request_id uuid,
  slack_requester_id text,
  slack_requester_name text,
  title text not null,
  requirements text,
  target_user_base text,
  webinar_timing timestamptz not null,
  duration_minutes integer not null default 60,
  pre_webinar_link text,
  post_webinar_link text,
  google_calendar_embed_url text,
  google_event_id text,
  google_calendar_sync_error text,
  status text not null check (status in ('upcoming', 'completed', 'cancelled')) default 'upcoming',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.webinars
add column if not exists duration_minutes integer not null default 60;
alter table public.webinars
add column if not exists source_request_id uuid;
alter table public.webinars
add column if not exists slack_requester_id text;
alter table public.webinars
add column if not exists slack_requester_name text;
alter table public.webinars
add column if not exists google_event_id text;
alter table public.webinars
add column if not exists google_calendar_sync_error text;
alter table public.trainers
add column if not exists profile_image_url text;
alter table public.trainers
add column if not exists temporary_password text;
alter table public.trainers
add column if not exists session_rating_avg numeric(4,2) not null default 0;
alter table public.trainers
add column if not exists speaker_rating_avg numeric(4,2) not null default 0;
alter table public.trainers
add column if not exists coverage_rating_avg numeric(4,2) not null default 0;
alter table public.profiles
add column if not exists must_change_password boolean not null default false;

create table if not exists public.webinar_requests (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  trainer_name text not null,
  requested_date timestamptz not null,
  attendees_est integer not null,
  state text not null default 'RAISED',
  employee_slack_id text not null,
  employee_name text not null,
  bp_slack_id text,
  growth_slack_id text,
  rejection_reason text,
  alt_date timestamptz,
  bp_channel_id text,
  bp_message_ts text,
  growth_channel_id text,
  growth_message_ts text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_webinar_requests_state on public.webinar_requests(state);
create index if not exists idx_webinar_requests_requested_date on public.webinar_requests(requested_date);
create index if not exists idx_webinar_requests_created_at on public.webinar_requests(created_at);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.webinar_requests(id) on delete cascade,
  actor_id text not null,
  actor_name text not null,
  from_state text,
  to_state text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_request_id on public.audit_log(request_id);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at);
create index if not exists idx_audit_log_action on public.audit_log(action);

create table if not exists public.content_checklist (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.webinar_requests(id) on delete cascade,
  item text not null,
  completed boolean not null default false,
  file_url text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_checklist_request_id on public.content_checklist(request_id);

create table if not exists public.webinar_metrics (
  id uuid primary key default gen_random_uuid(),
  webinar_id uuid not null unique references public.webinars(id) on delete cascade,
  registrations_count integer not null default 0,
  attendees_count integer not null default 0,
  first_time_future_traders_count integer not null default 0,
  rating numeric(4,2),
  highest_audience_count integer,
  success_rate numeric(6,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_availability (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_availability_time_valid check (start_time < end_time)
);

create table if not exists public.trainer_activation_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create table if not exists public.trainer_google_connections (
  trainer_id uuid primary key references public.trainers(id) on delete cascade,
  encrypted_refresh_token text not null,
  calendar_id text not null default 'primary',
  google_email text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text
);

create table if not exists public.rating_upload_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trainer_ratings (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  webinar_id uuid references public.webinars(id) on delete set null,
  upload_batch_id uuid references public.rating_upload_batches(id) on delete set null,
  rating numeric(4,2) not null check (rating >= 0 and rating <= 5),
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists public.trainer_badges (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (trainer_id, badge_id)
);

create table if not exists public.incentives (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  title text not null,
  description text,
  amount_or_reward text not null,
  awarded_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_trainers_profile_id on public.trainers(profile_id);
create index if not exists idx_webinars_trainer_id on public.webinars(trainer_id);
create index if not exists idx_webinars_timing on public.webinars(webinar_timing);
create index if not exists idx_ratings_trainer_id on public.trainer_ratings(trainer_id);
create index if not exists idx_availability_trainer_day on public.trainer_availability(trainer_id, day_of_week);
create index if not exists idx_activation_links_profile on public.trainer_activation_links(profile_id);
create index if not exists idx_activation_links_trainer on public.trainer_activation_links(trainer_id);
create index if not exists idx_google_connections_trainer on public.trainer_google_connections(trainer_id);
create unique index if not exists idx_activation_links_active_profile
on public.trainer_activation_links(profile_id)
where consumed_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_trainers_updated_at on public.trainers;
create trigger set_trainers_updated_at before update on public.trainers for each row execute function public.set_updated_at();
drop trigger if exists set_webinars_updated_at on public.webinars;
create trigger set_webinars_updated_at before update on public.webinars for each row execute function public.set_updated_at();
drop trigger if exists set_webinar_metrics_updated_at on public.webinar_metrics;
create trigger set_webinar_metrics_updated_at before update on public.webinar_metrics for each row execute function public.set_updated_at();
drop trigger if exists set_trainer_availability_updated_at on public.trainer_availability;
create trigger set_trainer_availability_updated_at before update on public.trainer_availability for each row execute function public.set_updated_at();
drop trigger if exists trg_webinar_requests_updated on public.webinar_requests;
create trigger trg_webinar_requests_updated before update on public.webinar_requests for each row execute function public.set_updated_at();
drop trigger if exists trg_content_checklist_updated on public.content_checklist;
create trigger trg_content_checklist_updated before update on public.content_checklist for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated;

create or replace function public.current_trainer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.trainers t
  where t.profile_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_trainer_id() to authenticated;

create or replace function public.compute_success_rate(reg integer, att integer, first_ft integer)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(reg, 0) = 0 then 0
    else round((coalesce(att, 0)::numeric / reg::numeric), 4)
  end;
$$;

create or replace function public.refresh_trainer_average_rating(target_trainer_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  avg_rating numeric;
begin
  select coalesce(avg(r.rating), 0) into avg_rating
  from public.trainer_ratings r
  where r.trainer_id = target_trainer_id;

  update public.trainers
  set average_rating = round(avg_rating, 2)
  where id = target_trainer_id;
end;
$$;

create or replace function public.handle_rating_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_trainer_average_rating(old.trainer_id);
    return old;
  end if;
  perform public.refresh_trainer_average_rating(new.trainer_id);
  return new;
end;
$$;

drop trigger if exists trigger_handle_rating_change on public.trainer_ratings;
create trigger trigger_handle_rating_change
after insert or update or delete on public.trainer_ratings
for each row execute function public.handle_rating_change();

create or replace function public.handle_metrics_success_rate()
returns trigger
language plpgsql
as $$
begin
  new.success_rate = public.compute_success_rate(new.registrations_count, new.attendees_count, new.first_time_future_traders_count);
  return new;
end;
$$;

drop trigger if exists trigger_metrics_success_rate on public.webinar_metrics;
create trigger trigger_metrics_success_rate
before insert or update on public.webinar_metrics
for each row execute function public.handle_metrics_success_rate();

alter table public.profiles enable row level security;
alter table public.trainers enable row level security;
alter table public.webinars enable row level security;
alter table public.webinar_metrics enable row level security;
alter table public.trainer_availability enable row level security;
alter table public.trainer_activation_links enable row level security;
alter table public.trainer_google_connections enable row level security;
alter table public.rating_upload_batches enable row level security;
alter table public.trainer_ratings enable row level security;
alter table public.badges enable row level security;
alter table public.trainer_badges enable row level security;
alter table public.incentives enable row level security;
alter table public.webinar_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.content_checklist enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
for update to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin')
with check (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists profiles_insert_admin_only on public.profiles;
create policy profiles_insert_admin_only on public.profiles
for insert to authenticated
with check (public.current_user_role() = 'admin');

drop policy if exists trainers_read_all_authenticated on public.trainers;
create policy trainers_read_all_authenticated on public.trainers
for select to authenticated
using (true);

drop policy if exists trainers_admin_manage on public.trainers;
create policy trainers_admin_manage on public.trainers
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists trainers_trainer_update_self on public.trainers;
create policy trainers_trainer_update_self on public.trainers
for update to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists webinars_read_all_authenticated on public.webinars;
create policy webinars_read_all_authenticated on public.webinars
for select to authenticated
using (true);

drop policy if exists webinars_admin_manage on public.webinars;
create policy webinars_admin_manage on public.webinars
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists webinar_metrics_read_all_authenticated on public.webinar_metrics;
create policy webinar_metrics_read_all_authenticated on public.webinar_metrics
for select to authenticated
using (true);

drop policy if exists webinar_metrics_admin_manage on public.webinar_metrics;
create policy webinar_metrics_admin_manage on public.webinar_metrics
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists availability_read_all_authenticated on public.trainer_availability;
create policy availability_read_all_authenticated on public.trainer_availability
for select to authenticated
using (true);

drop policy if exists availability_admin_manage on public.trainer_availability;
create policy availability_admin_manage on public.trainer_availability
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists availability_trainer_manage_own on public.trainer_availability;
create policy availability_trainer_manage_own on public.trainer_availability
for all to authenticated
using (trainer_id = public.current_trainer_id())
with check (trainer_id = public.current_trainer_id());

drop policy if exists activation_links_admin_manage on public.trainer_activation_links;
create policy activation_links_admin_manage on public.trainer_activation_links
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists google_connections_admin_manage on public.trainer_google_connections;
create policy google_connections_admin_manage on public.trainer_google_connections
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists batches_admin_only on public.rating_upload_batches;
create policy batches_admin_only on public.rating_upload_batches
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists trainer_ratings_read_all_authenticated on public.trainer_ratings;
create policy trainer_ratings_read_all_authenticated on public.trainer_ratings
for select to authenticated
using (true);

drop policy if exists trainer_ratings_admin_manage on public.trainer_ratings;
create policy trainer_ratings_admin_manage on public.trainer_ratings
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists badges_read_all_authenticated on public.badges;
create policy badges_read_all_authenticated on public.badges
for select to authenticated
using (true);

drop policy if exists badges_admin_manage on public.badges;
create policy badges_admin_manage on public.badges
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists trainer_badges_read_all_authenticated on public.trainer_badges;
create policy trainer_badges_read_all_authenticated on public.trainer_badges
for select to authenticated
using (true);

drop policy if exists trainer_badges_admin_manage on public.trainer_badges;
create policy trainer_badges_admin_manage on public.trainer_badges
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists incentives_read_all_authenticated on public.incentives;
create policy incentives_read_all_authenticated on public.incentives
for select to authenticated
using (true);

drop policy if exists incentives_admin_manage on public.incentives;
create policy incentives_admin_manage on public.incentives
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists webinar_requests_read_all_authenticated on public.webinar_requests;
create policy webinar_requests_read_all_authenticated on public.webinar_requests
for select to authenticated
using (true);

drop policy if exists webinar_requests_admin_manage on public.webinar_requests;
create policy webinar_requests_admin_manage on public.webinar_requests
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists audit_log_read_all_authenticated on public.audit_log;
create policy audit_log_read_all_authenticated on public.audit_log
for select to authenticated
using (true);

drop policy if exists audit_log_admin_manage on public.audit_log;
create policy audit_log_admin_manage on public.audit_log
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists content_checklist_read_all_authenticated on public.content_checklist;
create policy content_checklist_read_all_authenticated on public.content_checklist
for select to authenticated
using (true);

drop policy if exists content_checklist_admin_manage on public.content_checklist;
create policy content_checklist_admin_manage on public.content_checklist
for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');
