export type CompanyRole = "owner" | "accountant" | "employee";
export type ContractType = "INDEFINIDO" | "OBRA_LABOR" | "TERMINO_DEFINIDO";
export type PayPeriodType = "MONTHLY" | "WEEKLY" | "BIWEEKLY" | "VENTEEN";
export type PayrollPeriodStatus = "draft" | "open" | "closed";

export interface Company {
  id: string;
  name: string;
  nit: string;
  city: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyRole;
}

export interface Employee {
  id: string;
  company_id: string;
  full_name: string;
  document_id: string;
  job_title: string;
  monthly_salary: number;
  daily_hours: number;
  contract_type: ContractType;
  pay_period_type: PayPeriodType;
  pending_vacation_days: number;
  active: boolean;
  hired_at: string | null;
}

export interface PayrollPeriod {
  id: string;
  company_id: string;
  label: string;
  period_start: string;
  period_end: string;
  status: PayrollPeriodStatus;
  created_at: string;
  closed_at: string | null;
}

export interface PayrollLineRecord {
  label: string;
  amount: number;
  code?: string;
  kind: "earning" | "deduction";
}

export interface PayrollSettlement {
  id: string;
  company_id: string;
  period_id: string;
  employee_id: string | null;
  full_name: string;
  document_id: string;
  job_title: string;
  gross_total: number;
  deduction_total: number;
  net_total: number;
  ibc_total: number;
  worked_days: number;
  basis: "attendance" | "ordinary";
  lines: PayrollLineRecord[];
}

export interface LegalParameterSet {
  id: string;
  valid_from: string;
  valid_to: string | null;
  smmlv: number;
  transport_subsidy: number;
  weekly_hours_limit: number;
  dominical_factor: number;
}

export interface OfficialHoliday {
  id: string;
  holiday_date: string;
  label: string;
  legal_basis: string | null;
}
