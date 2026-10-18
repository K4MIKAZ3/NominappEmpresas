import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { settleEmployees, type SettleEmployeeInput } from "./settle";

const employee: SettleEmployeeInput = {
  id: "e1",
  fullName: "Ana",
  documentId: "1",
  jobTitle: "Operaria",
  monthlySalary: 1_750_905,
  dailyHours: 8,
  contractType: "INDEFINIDO",
  payPeriodType: "MONTHLY",
  pendingVacationDays: 0,
  active: true,
  hiredAt: null,
};

const period = {
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
  employees: [employee],
  days: [],
};

describe("settleEmployees", () => {
  it("quita un día de ausencia y suma un bono", () => {
    const base = settleEmployees(period)[0];
    const absent = settleEmployees({
      ...period,
      adjustments: [
        {
          employeeId: "e1",
          kind: "absence",
          date: "2026-03-02",
          start: null,
          end: null,
          label: null,
          amount: null,
        },
      ],
    })[0];
    const withBonus = settleEmployees({
      ...period,
      adjustments: [
        {
          employeeId: "e1",
          kind: "bonus",
          date: "2026-03-15",
          start: null,
          end: null,
          label: "Bono de productividad",
          amount: 100_000,
        },
      ],
    })[0];

    assert.equal(absent.workedDays, base.workedDays - 1);
    assert.ok(absent.grossTotal < base.grossTotal);
    assert.equal(withBonus.grossTotal, base.grossTotal + 100_000);
    assert.equal(withBonus.basis, "adjusted");
    assert.ok(withBonus.lines.some((line) => line.label === "Bono de productividad"));
  });
});
