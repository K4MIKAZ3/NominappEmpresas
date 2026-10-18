import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import type { LegalSnapshot } from "@nominapp/payroll-engine";
import type {
  Company,
  Employee,
  LegalParameterSet,
  OfficialHoliday,
  PayrollPeriod,
  PayrollSettlement,
} from "@/lib/types";

export const ACTIVE_COMPANY_COOKIE = "ne_active_company";

export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getActiveCompanyId(): Promise<string | null> {
  return cookies().get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
}

export async function listCompanies(): Promise<Company[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("companies")
    .select("id,name,nit,city,created_by,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Company[];
}

export async function getActiveCompany(): Promise<Company | null> {
  const companies = await listCompanies();
  if (companies.length === 0) return null;
  const activeId = await getActiveCompanyId();
  return companies.find((c) => c.id === activeId) ?? companies[0];
}

export async function listEmployees(companyId: string): Promise<Employee[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "id,company_id,full_name,document_id,job_title,monthly_salary,daily_hours,contract_type,pay_period_type,pending_vacation_days,active,hired_at",
    )
    .eq("company_id", companyId)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as Employee[];
}

export async function listPayrollPeriods(companyId: string): Promise<PayrollPeriod[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("id,company_id,label,period_start,period_end,status,created_at,closed_at")
    .eq("company_id", companyId)
    .order("period_start", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PayrollPeriod[];
}

export async function listLegalSnapshots(): Promise<LegalParameterSet[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("legal_parameter_sets")
    .select("id,valid_from,valid_to,smmlv,transport_subsidy,weekly_hours_limit,dominical_factor")
    .order("valid_from");
  if (error) throw error;
  return (data ?? []) as LegalParameterSet[];
}

export async function listHolidays(): Promise<OfficialHoliday[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("official_holidays")
    .select("id,holiday_date,label,legal_basis")
    .order("holiday_date");
  if (error) throw error;
  return (data ?? []) as OfficialHoliday[];
}

export async function listWorkDays(
  companyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<
  {
    employee_id: string;
    work_date: string;
    start_time: string;
    end_time: string;
    day_type: "NORMAL" | "FESTIVO_DOMINICAL" | "FESTIVO_NOCTURNO";
  }[]
> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("work_day_entries")
    .select("employee_id,work_date,start_time,end_time,day_type")
    .eq("company_id", companyId)
    .gte("work_date", periodStart)
    .lte("work_date", periodEnd);
  if (error) throw error;
  return data ?? [];
}

export async function listLegalContext(): Promise<{
  snapshots: LegalSnapshot[];
  holidays: string[];
}> {
  const { supabase } = await requireUser();
  const [params, holidays] = await Promise.all([
    supabase
      .from("legal_parameter_sets")
      .select(
        "id,valid_from,valid_to,smmlv,transport_subsidy,transport_salary_cap_multiplier,uvt,health_employee_rate,pension_employee_rate,reference_month_days,settlement_year_days,cesantias_interest_annual,ordinary_work_days_per_week,weekly_hours_limit,dominical_factor,night_start_hour,night_end_hour,night_ordinary_factor,extra_day_factor,extra_night_factor",
      )
      .order("valid_from"),
    supabase.from("official_holidays").select("holiday_date").order("holiday_date"),
  ]);
  if (params.error) throw params.error;
  if (holidays.error) throw holidays.error;
  const holidayDates = (holidays.data ?? []).map((row) => String(row.holiday_date).slice(0, 10));
  const snapshots: LegalSnapshot[] = (params.data ?? []).map((row) => ({
    id: row.id,
    validFrom: String(row.valid_from).slice(0, 10),
    validTo: row.valid_to ? String(row.valid_to).slice(0, 10) : null,
    smmlv: Number(row.smmlv),
    transportSubsidy: Number(row.transport_subsidy),
    transportSalaryCapMultiplier: Number(row.transport_salary_cap_multiplier),
    uvt: Number(row.uvt),
    healthEmployeeRate: Number(row.health_employee_rate),
    pensionEmployeeRate: Number(row.pension_employee_rate),
    referenceMonthDays: Number(row.reference_month_days),
    settlementYearDays: Number(row.settlement_year_days),
    cesantiasInterestAnnual: Number(row.cesantias_interest_annual),
    ordinaryWorkDaysPerWeek: Number(row.ordinary_work_days_per_week),
    weeklyHoursLimit: Number(row.weekly_hours_limit),
    dominicalFactor: Number(row.dominical_factor),
    nightStartHour: Number(row.night_start_hour),
    nightEndHour: Number(row.night_end_hour),
    nightOrdinaryFactor: Number(row.night_ordinary_factor),
    extraDayFactor: Number(row.extra_day_factor),
    extraNightFactor: Number(row.extra_night_factor),
    officialHolidays: holidayDates,
  }));
  return { snapshots, holidays: holidayDates };
}

export async function listPayrollSettlements(periodId: string): Promise<PayrollSettlement[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("payroll_settlements")
    .select(
      "id,company_id,period_id,employee_id,full_name,document_id,job_title,gross_total,deduction_total,net_total,ibc_total,worked_days,basis,lines",
    )
    .eq("period_id", periodId)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as PayrollSettlement[];
}

export async function countActiveEmployees(companyId: string): Promise<number> {
  const { supabase } = await requireUser();
  const { count, error } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("active", true);
  if (error) throw error;
  return count ?? 0;
}
