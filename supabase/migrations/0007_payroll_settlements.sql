-- Liquidación guardada al cerrar un período. El nombre y el documento
-- quedan copiados para que el cierre no cambie si luego se edita el empleado.

create table public.payroll_settlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period_id uuid not null references public.payroll_periods (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  full_name text not null,
  document_id text not null,
  job_title text not null default '',
  gross_total bigint not null,
  deduction_total bigint not null,
  net_total bigint not null,
  ibc_total bigint not null,
  worked_days int not null default 0,
  basis text not null check (basis in ('attendance', 'ordinary')),
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (period_id, employee_id)
);

create index payroll_settlements_period_idx
  on public.payroll_settlements (period_id);

alter table public.payroll_settlements enable row level security;

create policy settlements_select on public.payroll_settlements
  for select to authenticated
  using (public.is_company_member(company_id));

create policy settlements_write on public.payroll_settlements
  for all to authenticated
  using (
    public.has_company_role(
      company_id,
      array['owner'::public.company_role, 'accountant'::public.company_role]
    )
  )
  with check (
    public.has_company_role(
      company_id,
      array['owner'::public.company_role, 'accountant'::public.company_role]
    )
  );

grant select, insert, update, delete on public.payroll_settlements
  to anon, authenticated, service_role;
