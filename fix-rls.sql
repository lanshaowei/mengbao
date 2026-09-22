-- ============= 修复 profiles RLS 无限递归 =============

-- 1. 创建 SECURITY DEFINER 函数：返回当前用户的 family_id（绕过 RLS）
create or replace function public.get_my_family_id()
returns uuid
language sql
security definer
set search_path = public
stable
as 
  select family_id from public.profiles where id = auth.uid() limit 1;
;

-- 2. 删除所有有问题的策略
drop policy if exists "family_select" on public.families;
drop policy if exists "profile_select" on public.profiles;
drop policy if exists "profile_insert" on public.profiles;
drop policy if exists "profile_update" on public.profiles;
drop policy if exists "baby_all" on public.babies;
drop policy if exists "record_all" on public.records;

-- 3. 重建策略（用 SECURITY DEFINER 函数，避开递归）
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