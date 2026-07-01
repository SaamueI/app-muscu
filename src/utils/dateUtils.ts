// Helpers de dates partagés : semaines ISO, formatage "YYYY-MM-DD", arithmétique de jours.

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

// Lundi de la semaine ISO donnée (ex "2026-W27" -> Date du lundi correspondant).
export function isoWeekToMonday(isoWeek: string): Date {
  const [yearStr, wStr] = isoWeek.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7; // Mon=0
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dow + (week - 1) * 7);
  return monday;
}

// Semaine ISO d'une date donnée (ex Date lundi 29 juin 2026 -> "2026-W27").
export function dateToIsoWeek(d: Date): string {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const year = tmp.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const w = 1 + Math.round(((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${year}-W${pad(w)}`;
}

export type Weekday =
  | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday'
  | 'Friday' | 'Saturday' | 'Sunday';

const WEEKDAY_OFFSET: Record<Weekday, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
};

// Date concrète (ou semaine ISO si pas de jour fixe) d'une meso_session ancrée.
// startDate = lundi de la semaine 1 ("YYYY-MM-DD"). weekIndex est 1-based.
// Si `day` est null, `date` est null et il faut utiliser `week` (bucket "sans jour fixe").
export function computeSessionSchedule(
  startDate: string,
  weekIndex: number,
  day: Weekday | null
): { date: string | null; week: string } {
  const [y, m, d] = startDate.split('-').map(Number);
  const week1Monday = new Date(y, m - 1, d);
  const weekMonday = addDays(week1Monday, (weekIndex - 1) * 7);
  const week = dateToIsoWeek(weekMonday);

  if (!day) return { date: null, week };
  const sessionDate = addDays(weekMonday, WEEKDAY_OFFSET[day]);
  return { date: toDateStr(sessionDate), week };
}
