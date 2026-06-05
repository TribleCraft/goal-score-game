import type { CycleInfo } from "../types";

const BERLIN_TIME_ZONE = "Europe/Berlin";

function getBerlinDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

export function getCycleInfo(date = new Date()): CycleInfo {
  const { year, month, day } = getBerlinDateParts(date);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayKey = `${year}-${pad(month)}-${pad(day)}`;
  const monthKey = `${year}-${pad(month)}`;
  const phase = day <= 21 ? "grind" : day <= 28 ? "ticket" : "reset";
  const phaseLabel =
    phase === "grind"
      ? "Daily Grind"
      : phase === "ticket"
        ? "Studio-Ticket"
        : "Monatsreset";
  const daysRemaining = Math.max(0, (phase === "grind" ? 21 : phase === "ticket" ? 28 : daysInMonth) - day);

  return {
    dayKey,
    monthKey,
    dayOfMonth: day,
    daysInMonth,
    phase,
    phaseLabel,
    daysRemaining,
  };
}

export function getPreviousDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function calculateNextStreak(lastRunDayKey: string | undefined, currentDayKey: string, currentStreak: number) {
  if (!lastRunDayKey) {
    return 1;
  }

  return lastRunDayKey === getPreviousDayKey(currentDayKey) ? currentStreak + 1 : 1;
}

export function calculateXp(score: number, streak: number) {
  const cleanScore = Math.max(0, Math.min(6, score));
  const streakBonus = Math.min(40, Math.max(0, streak - 1) * 5);

  return cleanScore * 25 + 10 + streakBonus;
}
