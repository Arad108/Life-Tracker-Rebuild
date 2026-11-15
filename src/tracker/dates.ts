/** Local-date helpers. The original stores `day` as a local YYYY-MM-DD key. */

export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(day: string, amount: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + amount);
  return dayKey(date);
}

export function startOfWeek(day: string): string {
  const date = parseDay(day);
  const dow = date.getDay(); // 0 = Sunday
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + mondayOffset);
  return dayKey(date);
}

export function startOfMonth(day: string): string {
  const date = parseDay(day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function daysBack(from: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addDays(from, -i));
  return out;
}

export function weekdayShort(day: string): string {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][parseDay(day).getDay()];
}

export function formatDayLabel(day: string): string {
  const date = parseDay(day);
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(h || 0, m || 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function nowTimeKey(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
