import Link from "next/link";
import {
  closePayrollPeriodAction,
  createPayrollPeriodAction,
} from "@/app/actions";
import { AppShell } from "@/components/layout/AppShell";
import { formatCop } from "@/lib/format";
import { settleEmployees, type EmployeeSettlement } from "@/lib/payroll/settle";
import {
  getActiveCompany,
  listCompanies,
  listEmployees,
  listLegalContext,
  listPayrollPeriods,
  listPayrollSettlements,
  listWorkDays,
} from "@/lib/supabase/data";
import type { PayrollLineRecord, PayrollSettlement } from "@/lib/types";

export const metadata = { title: "Nómina" };
export const dynamic = "force-dynamic";

type Row = {
  key: string;
  name: string;
  jobTitle: string;
  gross: number;
  deductions: number;
  net: number;
  basis: "attendance" | "ordinary" | "stored";
  lines: PayrollLineRecord[];
};

function fromPreview(row: EmployeeSettlement): Row {
  return {
    key: row.employeeId,
    name: row.fullName,
    jobTitle: row.jobTitle,
    gross: row.grossTotal,
    deductions: row.deductionTotal,
    net: row.netTotal,
    basis: row.basis,
    lines: row.lines,
  };
}

function fromStored(row: PayrollSettlement): Row {
  return {
    key: row.employee_id ?? row.id,
    name: row.full_name,
    jobTitle: row.job_title,
    gross: Number(row.gross_total),
    deductions: Number(row.deduction_total),
    net: Number(row.net_total),
    basis: "stored",
    lines: row.lines ?? [],
  };
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams?: { period?: string; employee?: string; error?: string };
}) {
  const companies = await listCompanies();
  const company = await getActiveCompany();
  const periods = company ? await listPayrollPeriods(company.id) : [];
  const employees = company ? await listEmployees(company.id) : [];
  const formError = searchParams?.error?.slice(0, 200);

  const selected =
    periods.find((period) => period.id === searchParams?.period) ??
    periods.find((period) => period.status !== "closed") ??
    periods[0];

  let rows: Row[] = [];
  let frozen = false;
  if (company && selected) {
    if (selected.status === "closed") {
      frozen = true;
      const stored = await listPayrollSettlements(selected.id);
      rows = stored.map(fromStored);
    } else {
      const [days, legal] = await Promise.all([
        listWorkDays(company.id, selected.period_start, selected.period_end),
        listLegalContext(),
      ]);
      rows = settleEmployees({
        periodStart: selected.period_start,
        periodEnd: selected.period_end,
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
      }).map(fromPreview);
    }
  }

  const detail = rows.find((row) => row.key === searchParams?.employee) ?? rows[0];
  const gross = rows.reduce((sum, row) => sum + row.gross, 0);
  const deductions = rows.reduce((sum, row) => sum + row.deductions, 0);
  const net = rows.reduce((sum, row) => sum + row.net, 0);
  const usesOrdinary = rows.some((row) => row.basis === "ordinary");

  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const defaultEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const defaultLabel = now.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  const openCount = periods.filter((period) => period.status !== "closed").length;
  const periodQuery = selected ? `period=${selected.id}` : "";

  return (
    <AppShell
      active="/payroll"
      company={company}
      companies={companies}
      counts={{ employees: employees.length, periods: periods.length }}
    >
      <header className="page-head">
        <div>
          <div className="crumb">
            Nómina
            {selected ? ` / ${selected.label}` : ""}
          </div>
          <h1>
            {selected
              ? `${selected.label} · ${selected.period_start} al ${selected.period_end}`
              : "Períodos de liquidación"}
          </h1>
        </div>
        <div className="actions">
          {openCount > 0 ? (
            <span className="chip chip-warn">Borrador · {openCount} abiertos</span>
          ) : (
            <span className="chip chip-ok">Al día</span>
          )}
          {selected && selected.status !== "closed" ? (
            <form action={closePayrollPeriodAction}>
              <input type="hidden" name="periodId" value={selected.id} />
              <button type="submit" className="btn btn-primary">
                Cerrar período
              </button>
            </form>
          ) : null}
        </div>
      </header>

      {!company ? (
        <div className="content-pad">
          <p className="muted">Crea una empresa para gestionar períodos.</p>
        </div>
      ) : (
        <>
          <section className="stats">
            <div className="stat">
              <span>Devengado</span>
              <b className="m">{rows.length ? formatCop(gross) : "—"}</b>
            </div>
            <div className="stat">
              <span>Deducciones</span>
              <b className="m">{rows.length ? formatCop(deductions) : "—"}</b>
            </div>
            <div className="stat strong">
              <span>Neto a pagar</span>
              <b className="m">{rows.length ? formatCop(net) : "—"}</b>
            </div>
            <div className="stat">
              <span>Empleados</span>
              <b className="m">{rows.length}</b>
            </div>
          </section>

          <div className="content-split">
            <div className="table-wrap content-pad stack">
              {formError ? (
                <p role="alert" className="callout">
                  {formError}
                </p>
              ) : null}
              {selected && !frozen && usesOrdinary ? (
                <p className="callout">
                  Sin marcaciones se liquida la jornada ordinaria del período. Esas cifras se
                  guardan al cerrarlo.
                </p>
              ) : null}
              {frozen ? (
                <p className="callout">
                  Período cerrado. Los valores son los que quedaron guardados y no se recalculan.
                </p>
              ) : null}

              <section className="panel">
                <div className="label-caps" style={{ marginBottom: 12 }}>
                  Nuevo período
                </div>
                <form action={createPayrollPeriodAction} className="stack">
                  <input type="hidden" name="companyId" value={company.id} />
                  <div className="grid-3">
                    <div className="field">
                      <label htmlFor="label">Etiqueta</label>
                      <input id="label" name="label" required defaultValue={defaultLabel} />
                    </div>
                    <div className="field">
                      <label htmlFor="period_start">Inicio</label>
                      <input
                        id="period_start"
                        name="period_start"
                        type="date"
                        required
                        defaultValue={defaultStart}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="period_end">Fin</label>
                      <input
                        id="period_end"
                        name="period_end"
                        type="date"
                        required
                        defaultValue={defaultEnd}
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ justifySelf: "start" }}>
                    Crear período
                  </button>
                </form>
              </section>

              <section className="panel">
                {rows.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    {selected?.status === "closed"
                      ? "Este período se cerró sin una liquidación guardada."
                      : "Agrega un empleado activo para liquidar este período. "}
                    {selected?.status === "closed" ? null : (
                      <Link href="/employees">Ir a empleados</Link>
                    )}
                  </p>
                ) : (
                  <table className="table-html">
                    <thead>
                      <tr>
                        <th>Empleado</th>
                        <th>Cargo</th>
                        <th>Devengado</th>
                        <th>Neto</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className={detail?.key === row.key ? "is-selected" : undefined}>
                          <td>
                            <b>
                              <Link
                                href={`/payroll?${periodQuery}&employee=${row.key}`}
                              >
                                {row.name}
                              </Link>
                            </b>
                          </td>
                          <td>{row.jobTitle || "—"}</td>
                          <td className="m">{formatCop(row.gross)}</td>
                          <td className="m">{formatCop(row.net)}</td>
                          <td>
                            <span className={row.basis === "stored" ? "chip chip-ok" : "chip chip-warn"}>
                              {row.basis === "stored"
                                ? "Guardada"
                                : row.basis === "attendance"
                                  ? "Marcaciones"
                                  : "Ordinaria"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {periods.length > 0 ? (
                <section className="panel">
                  <div className="label-caps" style={{ marginBottom: 8 }}>
                    Historial
                  </div>
                  <table className="table-html">
                    <thead>
                      <tr>
                        <th>Período</th>
                        <th>Rango</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((run) => (
                        <tr key={run.id} className={selected?.id === run.id ? "is-selected" : undefined}>
                          <td>
                            <b>
                              <Link href={`/payroll?period=${run.id}`}>{run.label}</Link>
                            </b>
                          </td>
                          <td className="m">
                            {run.period_start} → {run.period_end}
                          </td>
                          <td>
                            <span
                              className={
                                run.status === "closed" ? "chip chip-ok" : "chip chip-warn"
                              }
                            >
                              {run.status === "closed" ? "Cerrado" : "Borrador"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ) : null}
            </div>

            <aside className="detail">
              {detail ? (
                <>
                  <div className="label-caps">Detalle</div>
                  <h2>{detail.name}</h2>
                  <div className="sub">{detail.jobTitle || "Empleado"}</div>
                  <div className="group-title">Devengado</div>
                  {detail.lines
                    .filter((line) => line.kind === "earning")
                    .map((line) => (
                      <div className="line" key={`${line.kind}-${line.code}-${line.label}`}>
                        <span>{line.label}</span>
                        <span className="m">{formatCop(line.amount)}</span>
                      </div>
                    ))}
                  <div className="group-title">Deducciones</div>
                  {detail.lines
                    .filter((line) => line.kind === "deduction")
                    .map((line) => (
                      <div className="line" key={`${line.kind}-${line.code}-${line.label}`}>
                        <span>{line.label}</span>
                        <span className="m">−{formatCop(line.amount)}</span>
                      </div>
                    ))}
                  <div className="net">
                    <b>Neto</b>
                    <span className="m">{formatCop(detail.net)}</span>
                  </div>
                  <div className="detail-actions">
                    <Link href="/employees" className="btn">
                      Empleados
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="label-caps">Detalle</div>
                  <h2>Sin liquidación</h2>
                  <div className="sub">Agrega un empleado para ver el desglose.</div>
                  <div className="detail-actions">
                    <Link href="/employees" className="btn btn-accent">
                      Agregar empleado
                    </Link>
                  </div>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </AppShell>
  );
}
