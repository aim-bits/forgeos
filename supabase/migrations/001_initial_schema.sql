
-- Forge: Migration 001
-- Foundation: profiles, organizations, memberships, and tenant isolation.

begin;

create extension if not exists pgcrypto;

-- 1. User profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 150),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Organization memberships and roles
create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'employee'
    check (role in (
      'owner',
      'org_admin',
      'operations_manager',
      'department_manager',
      'supervisor',
      'employee',
      'viewer'
    )),
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_idx
  on public.organization_members (user_id, organization_id);

create index organization_members_org_idx
  on public.organization_members (organization_id, status);

-- 4. Internal membership checks.
-- SECURITY DEFINER allows these checks to work without RLS recursion.
-- A fixed search_path limits object-resolution risks.

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('owner', 'org_admin')
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- 5. Create a profile when a Supabase Auth user is registered.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. Automatically make the creator the organization's owner.
-- Membership creation is performed by this trusted database trigger,
-- not by a client-supplied role.

create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or new.created_by <> (select auth.uid()) then
    raise exception 'Organization creator must be the authenticated user';
  end if;

  insert into public.organization_members (
    organization_id, user_id, role, status
  )
  values (new.id, new.created_by, 'owner', 'active');

  return new;
end;
$$;

create trigger on_organization_created
  after insert on public.organizations
  for each row execute procedure public.handle_new_organization();

-- 7. Enable Row Level Security on every tenant/user table.
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Profiles: users can view and edit only their own profile.
create policy "Users can view own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Organizations: members can view their organizations.
create policy "Members can view their organizations"
  on public.organizations for select to authenticated
  using (public.is_org_member(id));

-- An authenticated user can create an organization only as themselves.
-- The trigger above automatically adds them as owner.
create policy "Authenticated users can create organizations"
  on public.organizations for insert to authenticated
  with check (created_by = (select auth.uid()));

-- Only an existing owner or organization admin can update organization details.
create policy "Organization admins can update organizations"
  on public.organizations for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- Memberships: members can view membership records in their organization.
-- No direct client INSERT, UPDATE, or DELETE policies are provided.
-- Secure invitation and role-management functions will be added later.
create policy "Members can view organization memberships"
  on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id));

-- Restrict direct table access to the authenticated application role.
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select on public.organization_members to authenticated;

-- Keep updated_at accurate on profile, organization and membership changes.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute procedure public.set_updated_at();

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute procedure public.set_updated_at();

commit;
