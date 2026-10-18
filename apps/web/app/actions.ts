"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { settleEmployees } from "@/lib/payroll/settle";
import {
  ACTIVE_COMPANY_COOKIE,
  listEmployees,
  listLegalContext,
  listWorkDays,
  requireUser,
} from "@/lib/supabase/data";
import type { ContractType, PayPeriodType } from "@/lib/types";

export async function signOutAction() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  cookies().delete(ACTIVE_COMPANY_COOKIE);
  redirect("/login");
}

export async function setActiveCompanyAction(formData: FormData) {
  await requireUser();
  const companyId = String(formData.get("companyId") ?? "");
  if (!companyId) return;
  cookies().set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function createCompanyAction(formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const nit = String(formData.get("nit") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;
  if (!name || !nit) throw new Error("Nombre y NIT son obligatorios");

  const { data, error } = await supabase
    .from("companies")
    .insert({ name, nit, city })
    .select("id")
    .single();
  if (error) throw error;

  cookies().set(ACTIVE_COMPANY_COOKIE, data.id, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/companies");
  revalidatePath("/dashboard");
  redirect("/companies");
}

export async function createEmployeeAction(formData: FormData) {
  const { supabase } = await requireUser();
  const companyId = String(formData.get("companyId") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  const document_id = String(formData.get("document_id") ?? "").trim();
  const job_title = String(formData.get("job_title") ?? "").trim();
  const monthly_salary = Number(formData.get("monthly_salary") ?? 0);
  const daily_hours = Number(formData.get("daily_hours") ?? 8);
  const contract_type = String(formData.get("contract_type") ?? "INDEFINIDO") as ContractType;
  const pay_period_type = String(formData.get("pay_period_type") ?? "MONTHLY") as PayPeriodType;

  if (!companyId || !full_name || !document_id || monthly_salary <= 0) {
    throw new Error("Datos de empleado incompletos");
  }

  const { error } = await supabase.from("employees").insert({
    company_id: companyId,
    full_name,
    document_id,
    job_title,
    monthly_salary,
    daily_hours,
    contract_type,
    pay_period_type,
  });
  if (error) throw error;
  revalidatePath("/employees");
  revalidatePath("/dashboard");
  redirect("/employees");
}

export async function createPayrollPeriodAction(formData: FormData) {
  const { supabase } = await requireUser();
  const companyId = String(formData.get("companyId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const period_start = String(formData.get("period_start") ?? "");
  const period_end = String(formData.get("period_end") ?? "");
  if (!companyId || !label || !period_start || !period_end) {
    throw new Error("Período incompleto");
  }
  const { error } = await supabase.from("payroll_periods").insert({
    company_id: companyId,
    label,
    period_start,
    period_end,
    status: "draft",
  });
  if (error) throw error;
  revalidatePath("/payroll");
  redirect("/payroll");
}

export async function closePayrollPeriodAction(formData: FormData) {
  const { supabase } = await requireUser();
  const periodId = String(formData.get("periodId") ?? "");
  if (!periodId) return;

  const { data: period, error: periodError } = await supabase
    .from("payroll_periods")
    .select("id,company_id,period_start,period_end,status")
    .eq("id", periodId)
    .maybeSingle();
  if (periodError) throw periodError;
  if (!period) {
    redirect("/payroll?error=" + encodeURIComponent("No encontramos ese período."));
  }
  if (period.status === "closed") {
    redirect(`/payroll?period=${period.id}`);
  }

  const [employees, days, legal] = await Promise.all([
    listEmployees(period.company_id),
    listWorkDays(period.company_id, period.period_start, period.period_end),
    listLegalContext(),
  ]);
  const settlements = settleEmployees({
    periodStart: period.period_start,
    periodEnd: period.period_end,
    employees: employees.map((employee) => ({
      id: employee.id,
      fullName: employee.full_name,
      documentId: employee.document_id,
      jobTitle: employee.job_title,
      monthlySalary: employee.monthly_salary,
      dailyHours: Number(employee.daily_hours),
      contractType: employee.contract_type,
      payPeriodType: employee.pay_period_type,
      pendingVacationDays: Number(employee.pending_vacation_days),
      active: employee.active,
      hiredAt: employee.hired_at,
    })),
    days: days.map((day) => ({
      employeeId: day.employee_id,
      date: day.work_date,
      start: day.start_time,
      end: day.end_time,
      dayType: day.day_type,
    })),
    snapshots: legal.snapshots,
    holidays: legal.holidays,
  });
  if (settlements.length === 0) {
    redirect(
      `/payroll?period=${period.id}&error=` +
        encodeURIComponent("Agrega un empleado activo antes de cerrar el período."),
    );
  }

  const { error: deleteError } = await supabase
    .from("payroll_settlements")
    .delete()
    .eq("period_id", period.id);
  if (deleteError) {
    console.error(deleteError);
    redirect(
      `/payroll?period=${period.id}&error=` +
        encodeURIComponent("No se pudo guardar la liquidación."),
    );
  }

  const { error: insertError } = await supabase.from("payroll_settlements").insert(
    settlements.map((row) => ({
      company_id: period.company_id,
      period_id: period.id,
      employee_id: row.employeeId,
      full_name: row.fullName,
      document_id: row.documentId,
      job_title: row.jobTitle,
      gross_total: row.grossTotal,
      deduction_total: row.deductionTotal,
      net_total: row.netTotal,
      ibc_total: row.ibcTotal,
      worked_days: row.workedDays,
      basis: row.basis,
      lines: row.lines,
    })),
  );
  if (insertError) {
    console.error(insertError);
    redirect(
      `/payroll?period=${period.id}&error=` +
        encodeURIComponent("No se pudo guardar la liquidación."),
    );
  }

  const { error } = await supabase
    .from("payroll_periods")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", period.id);
  if (error) {
    console.error(error);
    redirect(
      `/payroll?period=${period.id}&error=` +
        encodeURIComponent("La liquidación se guardó, pero el período no quedó cerrado."),
    );
  }
  revalidatePath("/payroll");
  revalidatePath("/dashboard");
  redirect(`/payroll?period=${period.id}`);
}
