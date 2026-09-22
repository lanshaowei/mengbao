-- ==============================================
-- 萌宝成长记 - SECURITY DEFINER 函数
-- 避免因列名歧义和 RLS 限制导致的失败
-- ==============================================

-- 创建家庭（管理员）
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

-- 加入家庭（成员）
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

-- 获取当前用户家庭 ID（绕过 RLS）
create or replace function public.get_my_family_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select family_id from public.profiles where id = auth.uid() limit 1;
$$;
