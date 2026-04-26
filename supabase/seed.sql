-- IMPORTANT:
-- 1) Create users first in Supabase Auth:
--    admin@coindcx.com, trainer1@coindcx.com, trainer2@coindcx.com
-- 2) Replace the UUID values below with actual auth.users IDs from Supabase.

-- Example UUID placeholders (replace before running):
-- admin:    11111111-1111-1111-1111-111111111111
-- trainer1: 22222222-2222-2222-2222-222222222222
-- trainer2: 33333333-3333-3333-3333-333333333333

insert into public.profiles (id, role, full_name, phone, email)
values
  ('3e5cd66f-f248-4578-a653-83c992a43cb2', 'admin', 'Admin User', '+91-9000000001', 'admin@coindcx.com'),
  ('213c9d60-8cef-4ae9-a948-549403a15072', 'trainer', 'Aman Verma', '+91-9000000002', 'trainer1@coindcx.com'),
  ('7921d55f-d71b-4728-897e-6210c323adf9', 'trainer', 'Nisha Iyer', '+91-9000000003', 'trainer2@coindcx.com')
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email;

insert into public.trainers (
  id, profile_id, name, experience, investing_trading_persona, strengths, product_categories, nature_of_business,
  phone_number, email, languages_spoken, base_city, credentials_or_claim_to_fame, certifications, social_media_handles, average_rating
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '213c9d60-8cef-4ae9-a948-549403a15072',
    'Aman Verma',
    6,
    'Swing Trader',
    'Options strategy, risk management',
    '{"Derivatives","Equity"}',
    'Independent Trainer',
    '+91-9000000002',
    'trainer1@coindcx.com',
    'English, Hindi',
    'Mumbai',
    'Frequently featured in fintech webinars',
    'NISM Certified',
    '{"x":"@amantrades","youtube":"Aman Trades"}',
    4.5
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '7921d55f-d71b-4728-897e-6210c323adf9',
    'Nisha Iyer',
    8,
    'Positional Investor',
    'Portfolio building, long-term planning',
    '{"Mutual Funds","Equity"}',
    'Consulting',
    '+91-9000000003',
    'trainer2@coindcx.com',
    'English, Tamil',
    'Bengaluru',
    'Known for beginner-friendly sessions',
    'CFP',
    '{"instagram":"@nisha.invests"}',
    4.7
  )
on conflict (id) do nothing;

insert into public.webinars (
  id, trainer_id, title, requirements, target_user_base, webinar_timing, duration_minutes, pre_webinar_link, post_webinar_link, google_calendar_embed_url, status
)
values
  (
    'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Options Risk Framework',
    'Basic understanding of options',
    'Intermediate traders',
    now() + interval '3 day',
    90,
    'https://example.com/pre/options-risk',
    null,
    'https://calendar.google.com/calendar/embed?src=en.indian%23holiday%40group.v.calendar.google.com',
    'upcoming'
  ),
  (
    'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Portfolio Rebalance Masterclass',
    'Bring your current portfolio allocation',
    'Long-term investors',
    now() - interval '10 day',
    60,
    'https://example.com/pre/rebalance',
    'https://example.com/post/rebalance',
    null,
    'completed'
  )
on conflict (id) do nothing;

insert into public.webinar_metrics (
  webinar_id, registrations_count, attendees_count, first_time_future_traders_count, rating, highest_audience_count
)
values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 120, 0, 0, null, null),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 160, 140, 38, 4.8, 145)
on conflict (webinar_id) do update
set registrations_count = excluded.registrations_count,
    attendees_count = excluded.attendees_count,
    first_time_future_traders_count = excluded.first_time_future_traders_count,
    rating = excluded.rating,
    highest_audience_count = excluded.highest_audience_count;

insert into public.trainer_availability (trainer_id, day_of_week, start_time, end_time, timezone)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, '10:00', '12:00', 'Asia/Kolkata'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4, '16:00', '18:00', 'Asia/Kolkata'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2, '11:00', '13:00', 'Asia/Kolkata')
on conflict do nothing;

insert into public.badges (id, name, description, icon)
values
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'Audience Magnet', 'Crossed 100+ attendees in a webinar', 'star'),
  ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2', 'Top Rated', 'Maintained 4.5+ rating', 'trophy')
on conflict (id) do nothing;

insert into public.trainer_badges (trainer_id, badge_id)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2')
on conflict do nothing;

insert into public.incentives (trainer_id, title, description, amount_or_reward)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Quarterly Excellence', 'High engagement and completion outcomes', 'INR 15,000 bonus')
on conflict do nothing;

insert into public.trainer_ratings (trainer_id, webinar_id, rating, source)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 4.4, 'seed'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 4.8, 'seed')
on conflict do nothing;
