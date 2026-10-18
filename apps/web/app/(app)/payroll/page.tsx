import Link from "next/link";
import {
  addPayrollAdjustmentAction,
  closePayrollPeriodAction,
  createPayrollPeriodAction,
  deletePayrollAdjustmentAction,
  reopenPayrollPeriodAction,
  updatePayrollPeriodAction,
} from "@/app/actions";
import { AppShell } from "@/components/layout/AppShell";
import { formatCop } from "@/lib/format";
import { settleEmployees, toSettleEmployee, type EmployeeSettlement } from "@/lib/payroll/settle";
import {
  getActiveCompany,
  listCompanies,
  listEmployees,
  listLegalContext,
  listPayrollAdjustments,
  listPayrollPeriods,
  listPayrollSettlements,
  listWorkDays,
} from "@/lib/supabase/data";
import type { PayrollAdjustment, PayrollLineRecord, PayrollSettlement } from "@/lib/types";

export const metadata = { title: "Nómina" };
export const dynamic = "force-dynamic";

type Row = {
  key: string;
  name: string;
  jobTitle: string;
  gross: number;
  deductions: number;
  net: number;
  basis: "attendance" | "ordinary" | "adjusted" | "stored";
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
  let adjustments: PayrollAdjustment[] = [];
  if (company && selected) {
    if (selected.status === "closed") {
      frozen = true;
      const stored = await listPayrollSettlements(selected.id);
      rows = stored.map(fromStored);
    } else {
      const [days, legal, loaded] = await Promise.all([
        listWorkDays(company.id, selected.period_start, selected.period_end),
        listLegalContext(),
        listPayrollAdjustments(selected.id),
      ]);
      adjustments = loaded;
      rows = settleEmployees({
        periodStart: selected.period_start,
        periodEnd: selected.period_end,
        employees: employees.map(toSettleEmployee),
        days: days.map((day) => ({
          employeeId: day.employee_id,
          date: day.work_date,
          start: day.start_time,
          end: day.end_time,
          dayType: day.day_type,
        })),
        adjustments: adjustments.map((item) => ({
          id: item.id,
          employeeId: item.employee_id,
          kind: item.kind,
          date: item.work_date,
          start: item.start_time,
          end: item.end_time,
          label: item.label,
          amount: item.amount == null ? null : Number(item.amount),
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
          {selected && selected.status === "closed" ? (
            <form action={reopenPayrollPeriodAction}>
              <input type="hidden" name="periodId" value={selected.id} />
              <button type="submit" className="btn">
                Reabrir período
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
              {selected && !frozen ? (
                <p className="callout">
                  {usesOrdinary
                    ? "Parte de la jornada ordinaria. En el detalle puedes marcar una ausencia, cambiar horas o agregar un bono. Al guardar, el desglose se vuelve a calcular."
                    : "Los ajustes de este período ya entran en el desglose. Se conservan al cerrarlo."}
                </p>
              ) : null}
              {frozen ? (
                <p className="callout">
                  Período cerrado. Los valores quedaron guardados. Reabrirlo borra esa copia para
                  poder corregirlo.
                </p>
              ) : null}

              {selected && !frozen ? (
                <section className="panel">
                  <div className="label-caps" style={{ marginBottom: 12 }}>
                    Este período
                  </div>
                  <form action={updatePayrollPeriodAction} className="stack">
                    <input type="hidden" name="periodId" value={selected.id} />
                    <div className="grid-3">
                      <div className="field">
                        <label htmlFor="edit_label">Etiqueta</label>
                        <input id="edit_label" name="label" required defaultValue={selected.label} />
                      </div>
                      <div className="field">
                        <label htmlFor="edit_period_start">Inicio</label>
                        <input
                          id="edit_period_start"
                          name="period_start"
                          type="date"
                          required
                          defaultValue={selected.period_start}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="edit_period_end">Fin</label>
                        <input
                          id="edit_period_end"
                          name="period_end"
                          type="date"
                          required
                          defaultValue={selected.period_end}
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn" style={{ justifySelf: "start" }}>
                      Guardar período
                    </button>
                  </form>
                </section>
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
                                : row.basis === "adjusted"
                                  ? "Ajustada"
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
                  {!frozen && selected ? (
                    <AdjustmentEditor
                      periodId={selected.id}
                      employeeId={detail.key}
                      periodStart={selected.period_start}
                      periodEnd={selected.period_end}
                      items={adjustments.filter((item) => item.employee_id === detail.key)}
                    />
                  ) : null}
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

function adjustmentText(item: PayrollAdjustment): string {
  const date = item.work_date?.slice(0, 10);
  if (item.kind === "absence") return `Ausencia ${date}`;
  if (item.kind === "hours") {
    return `Horario ${date} ${item.start_time?.slice(0, 5)}–${item.end_time?.slice(0, 5)}`;
  }
  return `${item.label} ${formatCop(Number(item.amount ?? 0))}`;
}

function AdjustmentEditor({
  periodId,
  employeeId,
  periodStart,
  periodEnd,
  items,
}: {
  periodId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  items: PayrollAdjustment[];
}) {
  return (
    <div className="stack" style={{ marginTop: 18 }}>
      <div className="group-title">Ajustes de este empleado</div>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Todavía no hay ausencias, horas ni bonos.
        </p>
      ) : (
        items.map((item) => (
          <form key={item.id} action={deletePayrollAdjustmentAction} className="line">
            <input type="hidden" name="periodId" value={periodId} />
            <input type="hidden" name="employeeId" value={employeeId} />
            <input type="hidden" name="adjustmentId" value={item.id} />
            <span>{adjustmentText(item)}</span>
            <button type="submit" className="btn">
              Quitar
            </button>
          </form>
        ))
      )}
      <form action={addPayrollAdjustmentAction} className="stack">
        <input type="hidden" name="periodId" value={periodId} />
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="kind" value="absence" />
        <div className="field">
          <label htmlFor={`absence-${employeeId}`}>Ausencia</label>
          <input
            id={`absence-${employeeId}`}
            name="work_date"
            type="date"
            required
            min={periodStart}
            max={periodEnd}
          />
        </div>
        <button type="submit" className="btn" style={{ justifySelf: "start" }}>
          Marcar ausencia
        </button>
      </form>
      <form action={addPayrollAdjustmentAction} className="stack">
        <input type="hidden" name="periodId" value={periodId} />
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="kind" value="hours" />
        <div className="field">
          <label htmlFor={`hours-date-${employeeId}`}>Día con otro horario</label>
          <input
            id={`hours-date-${employeeId}`}
            name="work_date"
            type="date"
            required
            min={periodStart}
            max={periodEnd}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor={`hours-start-${employeeId}`}>Desde</label>
            <input id={`hours-start-${employeeId}`} name="start_time" type="time" required defaultValue="08:00" />
          </div>
          <div className="field">
            <label htmlFor={`hours-end-${employeeId}`}>Hasta</label>
            <input id={`hours-end-${employeeId}`} name="end_time" type="time" required defaultValue="18:00" />
          </div>
        </div>
        <button type="submit" className="btn" style={{ justifySelf: "start" }}>
          Guardar horario
        </button>
      </form>
      <form action={addPayrollAdjustmentAction} className="stack">
        <input type="hidden" name="periodId" value={periodId} />
        <input type="hidden" name="employeeId" value={employeeId} />
        <input type="hidden" name="kind" value="bonus" />
        <div className="field">
          <label htmlFor={`bonus-label-${employeeId}`}>Bono</label>
          <input id={`bonus-label-${employeeId}`} name="label" required placeholder="Bono de productividad" />
        </div>
        <div className="field">
          <label htmlFor={`bonus-amount-${employeeId}`}>Valor</label>
          <input id={`bonus-amount-${employeeId}`} name="amount" type="number" min={1} required />
        </div>
        <button type="submit" className="btn" style={{ justifySelf: "start" }}>
          Agregar bono
        </button>
      </form>
    </div>
  );
}
