alter table public.payroll_settlements
  drop constraint if exists payroll_settlements_basis_check;

alter table public.payroll_settlements
  add constraint payroll_settlements_basis_check
  check (basis in ('attendance', 'ordinary', 'adjusted'));

-- Correo del empleado para invitarlo a la app más adelante.
alter table public.employees
  add column if not exists email text;

create unique index if not exists employees_company_email_idx
  on public.employees (company_id, email);

-- Ajustes de un período abierto: ausencia, horas o bono.
create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period_id uuid not null references public.payroll_periods (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  kind text not null check (kind in ('absence', 'hours', 'bonus')),
  work_date date,
  start_time time,
  end_time time,
  label text,
  amount bigint,
  created_at timestamptz not null default now(),
  check (
    (kind = 'absence' and work_date is not null)
    or (
      kind = 'hours'
      and work_date is not null
      and start_time is not null
      and end_time is not null
      and end_time > start_time
    )
    or (kind = 'bonus' and label is not null and amount is not null and amount > 0)
  )
);

create index payroll_adjustments_period_idx
  on public.payroll_adjustments (period_id, employee_id);

alter table public.payroll_adjustments enable row level security;

create policy adjustments_select on public.payroll_adjustments
  for select to authenticated
  using (public.is_company_member(company_id));

create policy adjustments_write on public.payroll_adjustments
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

grant select, insert, update, delete on public.payroll_adjustments
  to anon, authenticated, service_role;
