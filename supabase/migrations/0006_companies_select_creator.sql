-- El insert con RETURNING exige que la fila nueva pase la policy de SELECT.
-- El membership se crea en un AFTER trigger, así que el creador todavía no
-- es miembro cuando Postgres evalúa esa policy. Sin esto, crear empresa
-- responde 42501 y no guarda nada.

create or replace function public.set_company_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.set_company_created_by() from public, anon, authenticated;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated
  using (
    public.is_company_member(id)
    or created_by = auth.uid()
  );
