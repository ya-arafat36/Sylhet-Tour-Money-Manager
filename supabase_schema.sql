-- Sylhet Tour Money Manager
-- Run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.members(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null unique
);

create table if not exists public.categories(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default '📌'
);

create table if not exists public.expenses(
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  amount numeric(12,2) not null check(amount>=0),
  note text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.settings(
  key text primary key,
  value text not null
);

-- Username + PIN login for members. No member email is required.
create table if not exists public.member_credentials(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete restrict,
  username text not null unique,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.settings enable row level security;
alter table public.member_credentials enable row level security;

-- Remove old policies if this script is being re-run.
drop policy if exists "read members" on public.members;
drop policy if exists "read categories" on public.categories;
drop policy if exists "read expenses" on public.expenses;
drop policy if exists "read settings" on public.settings;
drop policy if exists "admin insert expenses" on public.expenses;
drop policy if exists "admin write members" on public.members;
drop policy if exists "admin write categories" on public.categories;
drop policy if exists "admin write settings" on public.settings;
drop policy if exists "admin write member credentials" on public.member_credentials;

-- Authenticated users (including Supabase anonymous member sessions) can read trip data.
create policy "read members" on public.members for select to authenticated using (true);
create policy "read categories" on public.categories for select to authenticated using (true);
create policy "read expenses" on public.expenses for select to authenticated using (true);
create policy "read settings" on public.settings for select to authenticated using (true);

-- Only server-controlled app_metadata role=admin can write.
create policy "admin insert expenses" on public.expenses for insert to authenticated
with check ((auth.jwt()->'app_metadata'->>'role')='admin');

create policy "admin write members" on public.members for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin')
with check ((auth.jwt()->'app_metadata'->>'role')='admin');

create policy "admin write categories" on public.categories for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin')
with check ((auth.jwt()->'app_metadata'->>'role')='admin');

create policy "admin write settings" on public.settings for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin')
with check ((auth.jwt()->'app_metadata'->>'role')='admin');

create policy "admin write member credentials" on public.member_credentials for all to authenticated
using ((auth.jwt()->'app_metadata'->>'role')='admin')
with check ((auth.jwt()->'app_metadata'->>'role')='admin');

-- Member login verifier. It returns only the member identity; PIN hashes are never returned.
create or replace function public.verify_member_login(p_username text, p_pin text)
returns table(member_id uuid, member_name text, member_position int)
language sql
security definer
set search_path = public, extensions
as $$
  select m.id, m.name, m.position
  from public.member_credentials c
  join public.members m on m.id = c.member_id
  where c.active = true
    and lower(c.username) = lower(trim(p_username))
    and c.pin_hash = crypt(p_pin, c.pin_hash)
  limit 1;
$$;

revoke all on function public.verify_member_login(text,text) from public;
grant execute on function public.verify_member_login(text,text) to anon, authenticated;

create or replace function public.get_member_credentials()
returns table(id uuid, member_id uuid, username text, active boolean)
language sql
security definer
set search_path = public, extensions
as $$
  select c.id, c.member_id, c.username, c.active
  from public.member_credentials c
  where (auth.jwt()->'app_metadata'->>'role')='admin'
  order by c.username;
$$;

create or replace function public.admin_set_member_login(p_member_id uuid, p_username text, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if (auth.jwt()->'app_metadata'->>'role') <> 'admin' then
    raise exception 'Admin access required';
  end if;
  if trim(coalesce(p_username,'')) = '' then
    raise exception 'Username is required';
  end if;
  if trim(coalesce(p_pin,'')) <> '' then
    insert into public.member_credentials(member_id, username, pin_hash, active)
    values (p_member_id, lower(trim(p_username)), crypt(p_pin, gen_salt('bf')), true)
    on conflict (member_id) do update
      set username=excluded.username, pin_hash=excluded.pin_hash, active=true;
  else
    insert into public.member_credentials(member_id, username, pin_hash, active)
    values (p_member_id, lower(trim(p_username)), crypt('1234', gen_salt('bf')), true)
    on conflict (member_id) do update
      set username=excluded.username, active=true;
  end if;
end;
$$;

revoke all on function public.get_member_credentials() from public;
grant execute on function public.get_member_credentials() to authenticated;
revoke all on function public.admin_set_member_login(uuid,text,text) from public;
grant execute on function public.admin_set_member_login(uuid,text,text) to authenticated;

insert into public.settings(key,value)
values('funding','35000')
on conflict(key) do nothing;

insert into public.members(name,position) values
('Yasin',1),('Member 2',2),('Member 3',3),('Member 4',4),('Member 5',5),('Member 6',6),('Member 7',7)
on conflict(position) do nothing;

insert into public.categories(name,icon) values
('Train / Railway','🚆'),('Hotel / Accommodation','🏨'),('Food','🍽️'),('Transport','🚕'),('Tickets / Entry','🎟️'),('Shopping','🛍️'),('Drinks / Water','🥤'),('Others','📦')
on conflict(name) do nothing;

-- Default member usernames/PINs. Change these from Admin Panel before sharing the link.
insert into public.member_credentials(member_id,username,pin_hash)
select id, 'member' || position, crypt('1234', gen_salt('bf'))
from public.members
where position between 2 and 7
on conflict(member_id) do nothing;
