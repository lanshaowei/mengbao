-- ==============================================
-- 修复方案：用 SECURITY DEFINER 函数绕过 RLS
-- 直接一站式创建家庭 / 加入家庭
-- ==============================================

-- 创建家庭（管理员）
create or replace function public.create_family(
  p_name text,
  p_user_id uuid,
  p_display_name text
)
returns table(family_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_invite text;
begin
  -- 创建家庭
  insert into public.families (name, created_by)
  values (p_name, p_user_id)
  returning id, invite_code into v_family_id, v_invite;

  -- 关联管理员 profile
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
  -- 查找家庭
  select id into v_family_id from public.families where invite_code = p_invite_code;
  if v_family_id is null then
    raise exception '邀请码不正确';
  end if;

  -- 关联成员 profile
  update public.profiles
  set family_id = v_family_id, role = 'member', display_name = p_display_name
  where id = p_user_id;

  return query select v_family_id;
end;
$$;
