```sql
-- Forge Migration 002: Secure organisation creation

begin;

create or replace function public.create_organization(p_name text)
returns table (
  id uuid,
  name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid;
  new_organization_id uuid;
  clean_name text;
begin
  caller_id := auth.uid();

  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  clean_name := trim(p_name);

  if clean_name is null
     or char_length(clean_name) < 2
     or char_length(clean_name) > 150 then
    raise exception
      'Organisation name must be between 2 and 150 characters';
  end if;

  insert into public.organizations (name, created_by)
  values (clean_name, caller_id)
  returning organizations.id into new_organization_id;

  return query
    select o.id, o.name
    from public.organizations as o
    where o.id = new_organization_id;
end;
$$;

revoke all on function public.create_organization(text) from public;
revoke all on function public.create_organization(text) from anon;

grant execute on function public.create_organization(text)
to authenticated;

commit;
```