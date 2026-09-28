-- Who may hand out which role (user rule, 2026-09-28).
-- Applied as migration `role_assignment_guard`. Kept here as the reference copy.
--
-- Before: memberships_update / memberships_insert / invitations_insert /
-- invitations_update accepted any role from any owner OR admin, so an admin
-- could make themselves (or anyone) owner or admin, directly or through an
-- invitation, and could demote or remove the owner. Only the UI
-- (getAssignableRoles) said otherwise.
--
-- Now, for writes from the app (the server flows -- account setup, accepting
-- an invitation -- are SECURITY DEFINER and unaffected):
--   · LM001 -- nobody is made owner from the app; the owner is set when the
--     workspace is created.
--   · LM002 -- only an owner makes someone an admin (membership or invitation).
--   · LM003 -- the owner's membership isn't changed or removed from the app.
--   · LM004 -- only an owner changes or removes an admin.

create or replace function lp_private.trg_guard_role_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  v_owner := public.has_org_role(new.org_id, array['owner']::public.lp_role[]);

  -- Nested: invitations has no is_active, and PL/pgSQL resolves every NEW
  -- field in an expression even when an earlier AND is false.
  if tg_op = 'UPDATE' and tg_table_name = 'organization_memberships' then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      if old.role = 'owner' then
        raise exception using errcode = 'LM003',
          message = 'The owner''s membership can''t be changed';
      end if;
      if old.role = 'admin' and not v_owner then
        raise exception using errcode = 'LM004',
          message = 'Only an owner can change or remove an admin';
      end if;
    end if;
  end if;

  if new.role = 'owner'
     and (tg_op = 'INSERT' or old.role is distinct from 'owner') then
    raise exception using errcode = 'LM001',
      message = 'The owner is set when the workspace is created';
  end if;
  if new.role = 'admin' and not v_owner
     and (tg_op = 'INSERT' or old.role is distinct from 'admin') then
    raise exception using errcode = 'LM002',
      message = 'Only an owner can make someone an admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_role_assignment on public.organization_memberships;
create trigger trg_guard_role_assignment
  before insert or update on public.organization_memberships
  for each row execute function lp_private.trg_guard_role_assignment();

drop trigger if exists trg_guard_role_assignment on public.invitations;
create trigger trg_guard_role_assignment
  before insert or update of role on public.invitations
  for each row execute function lp_private.trg_guard_role_assignment();

revoke all on function lp_private.trg_guard_role_assignment() from public, anon, authenticated;
