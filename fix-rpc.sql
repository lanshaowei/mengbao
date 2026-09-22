-- ==============================================
-- 萌宝成长记 - 重建 SECURITY DEFINER 函数与 RLS 策略
-- 必须先删除依赖函数的所有策略，再重建
-- ==============================================

-- 1. 删除依赖 get_my_family_id 的所有 RLS 策略
drop policy if exists "family_select" on public.families;
drop policy if exists "profile_select" on public.profiles;
drop policy if exists "profile_insert" on public.profiles;
drop policy if exists "profile_update" on public.profiles;
drop policy if exists "baby_all" on public.babies;
drop policy if exists "record_all" on public.records;

-- 2. 删除旧函数
drop function if exists public.create_family(text, uuid, text);
drop function if exists public.join_family(text, uuid, text);
drop function if exists public.get_my_family_id();

-- 3. 创建家庭（管理员）
create or replace function public.create_family(
  p_name text,
  p_user_id uuid,
  p_display_name text
)
returns table(family_id uuid, family_invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_invite text;
begin
  insert into public.families (name, created_by)
  values (p_name, p_user_id)
  returning id, public.families.invite_code into v_family_id, v_invite;

  update public.profiles
  set family_id = v_family_id, role = 'admin', display_name = p_display_name
  where id = p_user_id;

  return query select v_family_id, v_invite;
end;
$$;

-- 4. 加入家庭（成员）
create or replace function public.join_family(
  p_invite_code text,
  p_user_id uuid,
  p_display_name text
)
returns table(family_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  select id into v_family_id
  from public.families
  where public.families.invite_code = p_invite_code;

  if v_family_id is null then
    raise exception '邀请码不正确';
  end if;

  update public.profiles
  set family_id = v_family_id, role = 'member', display_name = p_display_name
  where id = p_user_id;

  return query select v_family_id;
end;
$$;

-- 5. 获取当前用户家庭 ID（绕过 RLS）
create or replace function public.get_my_family_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select family_id from public.profiles where id = auth.uid() limit 1;
$$;

-- 6. 重建 RLS 策略
create policy "family_select" on public.families
  for select using (id = get_my_family_id());

create policy "profile_select" on public.profiles
  for select using (family_id = get_my_family_id());

create policy "profile_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profile_update" on public.profiles
  for update using (auth.uid() = id);

create policy "baby_all" on public.babies
  for all using (family_id = get_my_family_id());

create policy "record_all" on public.records
  for all using (family_id = get_my_family_id());
