"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { settleEmployees, toSettleEmployee, type PeriodAdjustment } from "@/lib/payroll/settle";
import {
  ACTIVE_COMPANY_COOKIE,
  listEmployees,
  listLegalContext,
  listPayrollAdjustments,
  listWorkDays,
  requireUser,
} from "@/lib/supabase/data";
import type { ContractType, PayPeriodType, PayrollAdjustment } from "@/lib/types";

function toAdjustment(row: PayrollAdjustment): PeriodAdjustment {
  return {
    id: row.id,
    employeeId: row.employee_id,
    kind: row.kind,
    date: row.work_date,
    start: row.start_time,
    end: row.end_time,
    label: row.label,
    amount: row.amount == null ? null : Number(row.amount),
  };
}

function backToPeriod(periodId: string, employeeId?: string, error?: string): never {
  const params = new URLSearchParams({ period: periodId });
  if (employeeId) params.set("employee", employeeId);
  if (error) params.set("error", error);
  redirect(`/payroll?${params.toString()}`);
}

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
  if (error) {
    console.error(error);
    const message =
      error.code === "23505"
        ? "Ya existe una empresa con ese NIT."
        : "No se pudo crear la empresa. Intenta de nuevo.";
    redirect(`/companies?error=${encodeURIComponent(message)}`);
  }

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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const job_title = String(formData.get("job_title") ?? "").trim();
  const monthly_salary = Number(formData.get("monthly_salary") ?? 0);
  const daily_hours = Number(formData.get("daily_hours") ?? 8);
  const contract_type = String(formData.get("contract_type") ?? "INDEFINIDO") as ContractType;
  const pay_period_type = String(formData.get("pay_period_type") ?? "MONTHLY") as PayPeriodType;

  if (!companyId || !full_name || !document_id || monthly_salary <= 0 || !email.includes("@")) {
    redirect("/employees?error=" + encodeURIComponent("Completa nombre, documento, correo y salario."));
  }

  const { error } = await supabase.from("employees").insert({
    company_id: companyId,
    full_name,
    document_id,
    email,
    job_title,
    monthly_salary,
    daily_hours,
    contract_type,
    pay_period_type,
  });
  if (error) {
    console.error(error);
    const duplicate = error.code === "23505";
    const message = duplicate
      ? error.message.toLowerCase().includes("email") || error.details?.toLowerCase().includes("email")
        ? "Ese correo ya está en esta empresa."
        : "Ese documento ya está en esta empresa."
      : "No se pudo guardar el empleado.";
    redirect("/employees?error=" + encodeURIComponent(message));
  }
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

  const [employees, days, legal, adjustments] = await Promise.all([
    listEmployees(period.company_id),
    listWorkDays(period.company_id, period.period_start, period.period_end),
    listLegalContext(),
    listPayrollAdjustments(period.id),
  ]);
  const settlements = settleEmployees({
    periodStart: period.period_start,
    periodEnd: period.period_end,
    employees: employees.map(toSettleEmployee),
    days: days.map((day) => ({
      employeeId: day.employee_id,
      date: day.work_date,
      start: day.start_time,
      end: day.end_time,
      dayType: day.day_type,
    })),
    adjustments: adjustments.map(toAdjustment),
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

async function openPeriodOrRedirect(periodId: string) {
  const { supabase } = await requireUser();
  const { data: period, error } = await supabase
    .from("payroll_periods")
    .select("id,company_id,period_start,period_end,status")
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw error;
  if (!period) backToPeriod("", undefined, "No encontramos ese período.");
  if (period.status === "closed") backToPeriod(period.id, undefined, "El período está cerrado.");
  return { supabase, period };
}

export async function updatePayrollPeriodAction(formData: FormData) {
  const periodId = String(formData.get("periodId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const periodStart = String(formData.get("period_start") ?? "");
  const periodEnd = String(formData.get("period_end") ?? "");
  const { supabase, period } = await openPeriodOrRedirect(periodId);
  if (!label || !periodStart || !periodEnd || periodEnd < periodStart) {
    backToPeriod(period.id, undefined, "Revisa la etiqueta y las fechas.");
  }
  const { error } = await supabase
    .from("payroll_periods")
    .update({ label, period_start: periodStart, period_end: periodEnd })
    .eq("id", period.id);
  if (error) {
    console.error(error);
    backToPeriod(period.id, undefined, "No se pudo guardar el período.");
  }
  revalidatePath("/payroll");
  backToPeriod(period.id);
}

export async function reopenPayrollPeriodAction(formData: FormData) {
  const { supabase } = await requireUser();
  const periodId = String(formData.get("periodId") ?? "");
  const { data: period, error } = await supabase
    .from("payroll_periods")
    .select("id,status")
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw error;
  if (!period) backToPeriod("", undefined, "No encontramos ese período.");
  if (period.status !== "closed") backToPeriod(period.id);
  const { error: deleteError } = await supabase
    .from("payroll_settlements")
    .delete()
    .eq("period_id", period.id);
  if (deleteError) {
    console.error(deleteError);
    backToPeriod(period.id, undefined, "No se pudo reabrir el período.");
  }
  const { error: updateError } = await supabase
    .from("payroll_periods")
    .update({ status: "draft", closed_at: null })
    .eq("id", period.id);
  if (updateError) {
    console.error(updateError);
    backToPeriod(period.id, undefined, "No se pudo reabrir el período.");
  }
  revalidatePath("/payroll");
  revalidatePath("/dashboard");
  backToPeriod(period.id);
}

export async function addPayrollAdjustmentAction(formData: FormData) {
  const periodId = String(formData.get("periodId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const { supabase, period } = await openPeriodOrRedirect(periodId);
  if (!employeeId) backToPeriod(period.id, undefined, "Elige un empleado.");

  const row: {
    company_id: string;
    period_id: string;
    employee_id: string;
    kind: "absence" | "hours" | "bonus";
    work_date?: string;
    start_time?: string;
    end_time?: string;
    label?: string;
    amount?: number;
  } = {
    company_id: period.company_id,
    period_id: period.id,
    employee_id: employeeId,
    kind: "absence",
  };

  if (kind === "absence") {
    const workDate = String(formData.get("work_date") ?? "");
    if (workDate < period.period_start || workDate > period.period_end) {
      backToPeriod(period.id, employeeId, "La ausencia tiene que caer dentro del período.");
    }
    row.kind = "absence";
    row.work_date = workDate;
  } else if (kind === "hours") {
    const workDate = String(formData.get("work_date") ?? "");
    const start = String(formData.get("start_time") ?? "");
    const end = String(formData.get("end_time") ?? "");
    if (workDate < period.period_start || workDate > period.period_end || !start || !end || end <= start) {
      backToPeriod(period.id, employeeId, "Revisa el día y el horario.");
    }
    row.kind = "hours";
    row.work_date = workDate;
    row.start_time = start;
    row.end_time = end;
  } else if (kind === "bonus") {
    const label = String(formData.get("label") ?? "").trim();
    const amount = Number(formData.get("amount") ?? 0);
    if (!label || amount <= 0) {
      backToPeriod(period.id, employeeId, "El bono necesita un nombre y un valor.");
    }
    row.kind = "bonus";
    row.label = label;
    row.amount = Math.round(amount);
    row.work_date = period.period_end;
  } else {
    backToPeriod(period.id, employeeId, "Ese ajuste no es válido.");
  }

  const { error } = await supabase.from("payroll_adjustments").insert(row);
  if (error) {
    console.error(error);
    backToPeriod(period.id, employeeId, "No se pudo guardar el ajuste.");
  }
  revalidatePath("/payroll");
  backToPeriod(period.id, employeeId);
}

export async function deletePayrollAdjustmentAction(formData: FormData) {
  const periodId = String(formData.get("periodId") ?? "");
  const employeeId = String(formData.get("employeeId") ?? "");
  const adjustmentId = String(formData.get("adjustmentId") ?? "");
  const { supabase, period } = await openPeriodOrRedirect(periodId);
  const { error } = await supabase
    .from("payroll_adjustments")
    .delete()
    .eq("id", adjustmentId)
    .eq("period_id", period.id);
  if (error) {
    console.error(error);
    backToPeriod(period.id, employeeId, "No se pudo quitar el ajuste.");
  }
  revalidatePath("/payroll");
  backToPeriod(period.id, employeeId);
}
