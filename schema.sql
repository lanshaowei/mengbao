-- ============================================================
-- 萌宝成长记 数据库结构 v2
-- ============================================================

create extension if not exists "pgcrypto";

-- 家庭组
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique,
  created_by uuid references auth.users,
  created_at timestamptz default now()
);

-- 用户档案
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  family_id uuid references public.families on delete cascade,
  username text unique not null,
  display_name text,
  role text default 'member',
  created_at timestamptz default now()
);

-- 宝宝
create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  name text not null,
  birth_date date,
  gender text,
  avatar text,
  created_by uuid references auth.users,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 记录
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families on delete cascade,
  baby_id uuid not null references public.babies on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_records_baby on public.records(baby_id);
create index if not exists idx_records_type on public.records(type);
create index if not exists idx_records_family on public.records(family_id);
create index if not exists idx_records_created on public.records(created_at desc);

-- 邀请码
create or replace function generate_invite_code()
returns text language plpgsql as $$
declare
  code text;
  exists boolean;
begin
  loop
    code := upper(substring(md5(random()::text) from 1 for 6));
    select exists(select 1 from public.families where invite_code = code) into exists;
    exit when not exists;
  end loop;
  return code;
end; $$;

create or replace function set_invite_code()
returns trigger language plpgsql as $$
begin
  if new.invite_code is null then
    new.invite_code := generate_invite_code();
  end if;
  return new;
end; $$;

drop trigger if exists families_invite_code on public.families;
create trigger families_invite_code before insert on public.families
  for each row execute function set_invite_code();

-- 行级安全
alter table public.families enable row level security;
alter table public.profiles enable row level security;
alter table public.babies enable row level security;
alter table public.records enable row level security;

drop policy if exists "family_select" on public.families;
drop policy if exists "family_insert" on public.families;
drop policy if exists "profile_select" on public.profiles;
drop policy if exists "profile_insert" on public.profiles;
drop policy if exists "profile_update" on public.profiles;
drop policy if exists "baby_all" on public.babies;
drop policy if exists "record_all" on public.records;

create policy "family_select" on public.families
  for select using (
    id in (select family_id from public.profiles where id = auth.uid())
  );

create policy "family_insert" on public.families
  for insert with check (auth.uid() = created_by);

create policy "profile_select" on public.profiles
  for select using (
    family_id in (select family_id from public.profiles where id = auth.uid())
  );

create policy "profile_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profile_update" on public.profiles
  for update using (auth.uid() = id);

create policy "baby_all" on public.babies
  for all using (
    family_id in (select family_id from public.profiles where id = auth.uid())
  );

create policy "record_all" on public.records
  for all using (
    family_id in (select family_id from public.profiles where id = auth.uid())
  );

-- 新用户自动建 profile
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'display_name'
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();