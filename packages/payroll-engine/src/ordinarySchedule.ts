import { addDays, isAfter, type LocalDate } from "./dates.js";
import { isOrdinaryWorkday } from "./holidays.js";
import { resolveLegalSnapshot } from "./legalSnapshots.js";
import type { WorkDayEntry } from "./models.js";
import type { LegalSnapshot } from "./types.js";

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Jornada 08:00 con almuerzo 12:00–13:00, para que las horas netas coincidan con dailyHours. */
export function ordinaryShiftEnd(dailyHours: number): string {
  const hours = dailyHours > 0 ? dailyHours : 8;
  const startMin = 8 * 60;
  const lunch = hours > 4 ? 60 : 0;
  return clock(startMin + hours * 60 + lunch);
}

/**
 * Días hábiles del rango, sin domingo ni festivo.
 * Sirve para liquidar un salario mensual cuando todavía no hay marcaciones.
 */
export function ordinaryWorkEntries(
  start: LocalDate,
  end: LocalDate,
  dailyHours: number,
  snapshots?: LegalSnapshot[],
  manualHolidays: Set<LocalDate> = new Set(),
): WorkDayEntry[] {
  const endClock = ordinaryShiftEnd(dailyHours);
  const entries: WorkDayEntry[] = [];
  let date = start;
  while (!isAfter(date, end)) {
    const snapshot = resolveLegalSnapshot(date, snapshots);
    if (isOrdinaryWorkday(date, snapshot, manualHolidays)) {
      entries.push({
        date,
        start: "08:00",
        end: endClock,
        dayType: "NORMAL",
      });
    }
    date = addDays(date, 1);
  }
  return entries;
}
