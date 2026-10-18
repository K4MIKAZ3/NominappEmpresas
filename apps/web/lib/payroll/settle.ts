import {
  applyManualEntries,
  liquidateDateRange,
  ordinaryWorkEntries,
  resolveLegalSnapshot,
  SEED_SNAPSHOTS_2026,
  type LegalSnapshot,
  type ManualDeduction,
  type PayrollLine,
  type WorkDayEntry,
} from "@nominapp/payroll-engine";

export type SettlementBasis = "attendance" | "ordinary" | "adjusted";

export type StoredPayrollLine = {
  label: string;
  amount: number;
  code?: string;
  kind: "earning" | "deduction";
};

export type EmployeeSettlement = {
  employeeId: string;
  fullName: string;
  documentId: string;
  jobTitle: string;
  grossTotal: number;
  deductionTotal: number;
  netTotal: number;
  ibcTotal: number;
  workedDays: number;
  basis: SettlementBasis;
  lines: StoredPayrollLine[];
};

export type SettleEmployeeInput = {
  id: string;
  fullName: string;
  documentId: string;
  jobTitle: string;
  monthlySalary: number;
  dailyHours: number;
  contractType: "INDEFINIDO" | "OBRA_LABOR" | "TERMINO_DEFINIDO";
  payPeriodType: "MONTHLY" | "WEEKLY" | "BIWEEKLY" | "VENTEEN";
  pendingVacationDays: number;
  active: boolean;
  hiredAt: string | null;
};

export type StoredWorkDay = {
  employeeId: string;
  date: string;
  start: string;
  end: string;
  dayType: "NORMAL" | "FESTIVO_DOMINICAL" | "FESTIVO_NOCTURNO";
};

export type PeriodAdjustment = {
  id?: string;
  employeeId: string;
  kind: "absence" | "hours" | "bonus";
  date: string | null;
  start: string | null;
  end: string | null;
  label: string | null;
  amount: number | null;
};

function iso(value: string): string {
  return value.slice(0, 10);
}

function toLines(earnings: PayrollLine[], deductions: PayrollLine[]): StoredPayrollLine[] {
  return [
    ...earnings.map((line) => ({
      label: line.label,
      amount: line.amount,
      code: line.code,
      kind: "earning" as const,
    })),
    ...deductions.map((line) => ({
      label: line.label,
      amount: line.amount,
      code: line.code,
      kind: "deduction" as const,
    })),
  ];
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function settleEmployees(input: {
  periodStart: string;
  periodEnd: string;
  employees: SettleEmployeeInput[];
  days: StoredWorkDay[];
  adjustments?: PeriodAdjustment[];
  snapshots?: LegalSnapshot[];
  holidays?: string[];
}): EmployeeSettlement[] {
  const start = iso(input.periodStart);
  const end = iso(input.periodEnd);
  const snapshots = input.snapshots?.length ? input.snapshots : SEED_SNAPSHOTS_2026;
  const holidays = new Set((input.holidays ?? []).map(iso));
  const daysByEmployee = new Map<string, WorkDayEntry[]>();
  for (const day of input.days) {
    const date = iso(day.date);
    if (date < start || date > end) continue;
    const list = daysByEmployee.get(day.employeeId) ?? [];
    list.push({
      date,
      start: day.start.slice(0, 5),
      end: day.end.slice(0, 5),
      dayType: day.dayType,
    });
    daysByEmployee.set(day.employeeId, list);
  }

  const settlements: EmployeeSettlement[] = [];
  for (const employee of input.employees) {
    if (!employee.active) continue;
    const hired = employee.hiredAt ? iso(employee.hiredAt) : null;
    if (hired && hired > end) continue;
    const rangeStart = hired && hired > start ? hired : start;
    const recorded = (daysByEmployee.get(employee.id) ?? []).filter((day) =>
      inRange(day.date, rangeStart, end),
    );
    const ownAdjustments = (input.adjustments ?? []).filter(
      (item) => item.employeeId === employee.id,
    );
    const byDate = new Map<string, WorkDayEntry>();
    for (const day of ordinaryWorkEntries(
      rangeStart,
      end,
      Number(employee.dailyHours) || 8,
      snapshots,
      holidays,
    )) {
      byDate.set(day.date, day);
    }
    for (const day of recorded) byDate.set(day.date, day);
    for (const item of ownAdjustments) {
      const date = item.date ? iso(item.date) : "";
      if (item.kind === "absence" && inRange(date, rangeStart, end)) byDate.delete(date);
      if (
        item.kind === "hours" &&
        item.start &&
        item.end &&
        inRange(date, rangeStart, end)
      ) {
        byDate.set(date, {
          date,
          start: item.start.slice(0, 5),
          end: item.end.slice(0, 5),
          dayType: "NORMAL",
        });
      }
    }
    const entries = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    const basis: SettlementBasis = ownAdjustments.length
      ? "adjusted"
      : recorded.length
        ? "attendance"
        : "ordinary";
    let payroll = liquidateDateRange(
      {
        name: employee.fullName,
        documentId: employee.documentId,
        jobTitle: employee.jobTitle,
        monthlySalary: Number(employee.monthlySalary),
        dailyHours: Number(employee.dailyHours) || 8,
        contractType: employee.contractType,
        payPeriodType: employee.payPeriodType,
        pendingVacationDays: Number(employee.pendingVacationDays) || 0,
      },
      rangeStart,
      end,
      entries,
      holidays,
      undefined,
      undefined,
      snapshots,
    );
    const manuals: ManualDeduction[] = ownAdjustments
      .filter((item) => item.kind === "bonus" && item.label && (item.amount ?? 0) > 0)
      .map((item) => ({
        yearMonth: (item.date ? iso(item.date) : end).slice(0, 7),
        effectiveDate: item.date ? iso(item.date) : end,
        label: item.label ?? "Bono",
        amount: Number(item.amount),
        entryType: "BONUS" as const,
      }));
    if (manuals.length > 0) {
      const mid = entries[Math.floor(entries.length / 2)]?.date ?? rangeStart;
      payroll = applyManualEntries(payroll, manuals, resolveLegalSnapshot(mid, snapshots));
    }
    const deductionLines = [...payroll.legalDeductions, ...payroll.manualDeductions];
    const deductionTotal = deductionLines.reduce((sum, line) => sum + line.amount, 0);
    settlements.push({
      employeeId: employee.id,
      fullName: employee.fullName,
      documentId: employee.documentId,
      jobTitle: employee.jobTitle,
      grossTotal: payroll.grossTotal,
      deductionTotal,
      netTotal: payroll.netTotal,
      ibcTotal: payroll.ibcTotal,
      workedDays: payroll.workedDays,
      basis,
      lines: toLines([...payroll.earnings, ...payroll.manualBonuses], deductionLines),
    });
  }
  return settlements;
}

export function toSettleEmployee(employee: {
  id: string;
  full_name: string;
  document_id: string;
  job_title: string;
  monthly_salary: number;
  daily_hours: number;
  contract_type: SettleEmployeeInput["contractType"];
  pay_period_type: SettleEmployeeInput["payPeriodType"];
  pending_vacation_days: number;
  active: boolean;
  hired_at: string | null;
}): SettleEmployeeInput {
  return {
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
  };
}
