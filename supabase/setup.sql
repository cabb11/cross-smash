-- Cross Smash database setup. Safe to run more than once.
-- Create your admin user in Authentication > Users BEFORE running this file.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  phone text,
  facebook_url text,
  address text,
  hours_note text,
  pickleball_rate int not null default 500 check (pickleball_rate >= 0),
  badminton_rate int not null default 250 check (badminton_rate >= 0),
  paddle_rate int not null default 100 check (paddle_rate >= 0),
  racket_rate int not null default 50 check (racket_rate >= 0),
  machine_rate int not null default 500 check (machine_rate >= 0)
);

create table if not exists public.sessions (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  start_hour int not null check (start_hour between 0 and 23),
  end_hour int not null check (end_hour > start_hour and end_hour <= 47),
  price int not null check (price >= 0),
  days int[] not null default '{0,1,2,3,4,5,6}',
  is_special boolean not null default false
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  link_url text,
  image_url text,
  image_path text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  expires_at timestamptz,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  caption text,
  image_url text not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.site_settings enable row level security;
alter table public.sessions enable row level security;
alter table public.events enable row level security;
alter table public.announcements enable row level security;
alter table public.photos enable row level security;

grant select on public.site_settings, public.sessions, public.events, public.announcements, public.photos to anon, authenticated;
grant insert, update, delete on public.site_settings, public.sessions, public.events, public.announcements, public.photos to authenticated;
grant select on public.admins to authenticated;

-- Admins can see their own row. No policy writes to this table, so the list
-- can only be changed from the Supabase dashboard.
drop policy if exists "read own admin row" on public.admins;
create policy "read own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "public read" on public.site_settings;
create policy "public read" on public.site_settings for select to anon, authenticated using (true);
drop policy if exists "admin write" on public.site_settings;
create policy "admin write" on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read" on public.sessions;
create policy "public read" on public.sessions for select to anon, authenticated using (true);
drop policy if exists "admin write" on public.sessions;
create policy "admin write" on public.sessions for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read" on public.photos;
create policy "public read" on public.photos for select to anon, authenticated using (true);
drop policy if exists "admin write" on public.photos;
create policy "admin write" on public.photos for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read" on public.events;
create policy "public read" on public.events for select to anon, authenticated using (published or public.is_admin());
drop policy if exists "admin write" on public.events;
create policy "admin write" on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read" on public.announcements;
create policy "public read" on public.announcements for select to anon, authenticated using (published or public.is_admin());
drop policy if exists "admin write" on public.announcements;
create policy "admin write" on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Image storage: anyone can view, only admins can change files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "media admin read" on storage.objects;
create policy "media admin read" on storage.objects
  for select to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin insert" on storage.objects;
create policy "media admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- Starting content, matching what the site already shows.
insert into public.site_settings (id, phone, facebook_url, address)
values (
  1,
  '0908 866 3295',
  'https://www.facebook.com/share/14ZNdzcMT8A/?mibextid=wwXIfr',
  'Warehouse 9 & 10, Denson Realty Corp, Parian, Calamba City, Laguna 4027'
)
on conflict (id) do nothing;

insert into public.sessions (id, name, start_hour, end_hour, price, days, is_special) values
  ('morning', 'Morning', 8, 13, 120, '{0,1,2,3,4,5,6}', false),
  ('drills', 'Ball machine drills', 8, 13, 300, '{2}', true),
  ('afternoon', 'Afternoon', 13, 18, 150, '{0,1,2,3,4,5,6}', false),
  ('evening', 'Evening', 18, 23, 250, '{0,1,2,3,4,5,6}', false),
  ('late', 'Late night', 23, 27, 200, '{0,6}', false)
on conflict (id) do nothing;

-- Makes every user that exists right now an admin, so create only your own
-- account first. Returns the admin count, which should be 1.
insert into public.admins (user_id)
select id from auth.users
on conflict (user_id) do nothing;

select count(*) as admin_accounts from public.admins;
