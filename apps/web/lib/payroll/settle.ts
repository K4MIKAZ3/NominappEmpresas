import {
  liquidateDateRange,
  ordinaryWorkEntries,
  SEED_SNAPSHOTS_2026,
  type LegalSnapshot,
  type PayrollLine,
  type WorkDayEntry,
} from "@nominapp/payroll-engine";

export type SettlementBasis = "attendance" | "ordinary";

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

export function settleEmployees(input: {
  periodStart: string;
  periodEnd: string;
  employees: SettleEmployeeInput[];
  days: StoredWorkDay[];
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
    const recorded = daysByEmployee.get(employee.id) ?? [];
    const inRange = recorded.filter((day) => day.date >= rangeStart && day.date <= end);
    const basis: SettlementBasis = inRange.length > 0 ? "attendance" : "ordinary";
    const entries =
      basis === "attendance"
        ? inRange
        : ordinaryWorkEntries(
            rangeStart,
            end,
            Number(employee.dailyHours) || 8,
            snapshots,
            holidays,
          );
    const payroll = liquidateDateRange(
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
