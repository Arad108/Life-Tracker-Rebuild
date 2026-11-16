import type { Tracker, TrackerEntry, TrackerField } from './types';

export interface TrackerWithFields extends Tracker {
  fields: TrackerField[];
}
import { addDays, dayKey, parseDay, startOfMonth, startOfWeek } from './dates';

/**
 * Formatting helpers transcribed from the shipped bundle
 * (decompiled2.js 369212-371400). They are used everywhere a field value
 * is shown, so the copy matches the original app exactly.
 */

export type EntryValues = Record<string, unknown>;

export interface EntryView {
  id?: string;
  day: string;
  occurredAt: number;
  values: EntryValues;
  entry?: TrackerEntry;
}

export function viewOf(entry: TrackerEntry): EntryView {
  return { id: entry.id, day: entry.day, occurredAt: entry.occurred_at, values: entry.data, entry };
}

export function viewsOf(entries: TrackerEntry[]): EntryView[] {
  return entries.map(viewOf);
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-IN');
  return String(Math.round(n * 100) / 100);
}

const CURRENCIES = ['\u20B9', '$', '\u20AC', '\u00A3'];

export function withUnit(n: number, unit?: string | null): string {
  const text = formatNumber(n);
  if (!unit) return text;
  if (CURRENCIES.includes(unit)) return `${unit}${text}`;
  return `${text} ${unit}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.round(Number(minutes) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

export function formatQuantity(n: number, unit?: string | null): string {
  if (unit === 'ml' && Math.abs(n) >= 1000) {
    return `${Math.round(n / 100) / 10} L`;
  }
  return withUnit(n, unit);
}

export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim() !== '';
}

export function formatFieldValue(field: TrackerField | undefined, value: unknown): string {
  if (!hasValue(value)) return '';
  const type = field?.type;
  switch (type) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'duration':
      return formatDuration(Number(value));
    case 'rating':
      return `${value}/5`;
    case 'multiselect':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'photo':
      return 'Photo';
    case 'file':
      return String(value).split('/').pop() ?? String(value);
    case 'number':
    case 'decimal': {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      const text = Number.isInteger(n) ? n.toLocaleString('en-IN') : String(Math.round(n * 100) / 100);
      return field?.unit ? withUnit(n, field.unit) : text;
    }
    case 'date': {
      const s = String(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatDayShort(s) : s;
    }
    default:
      return String(value);
  }
}

function activeFields(tracker: TrackerWithFields): TrackerField[] {
  return (tracker.fields ?? []).filter((f) => !f.archived);
}

function titleField(tracker: TrackerWithFields, values: EntryValues): TrackerField | undefined {
  const active = activeFields(tracker);
  const byKey = active.find((f) => f.key === tracker.config?.titleFieldKey);
  if (byKey) return byKey;
  return active.find((f) => hasValue(values[f.key]) && f.type !== 'notes') ?? active[0];
}

export function entryTitle(tracker: TrackerWithFields, entry: TrackerEntry | EntryView): string {
  const values = 'values' in entry ? entry.values : entry.data;
  const field = titleField(tracker, values);
  if (!field) return tracker.name;
  return formatFieldValue(field, values[field.key]) || tracker.name;
}

export function entryDetails(tracker: TrackerWithFields, entry: TrackerEntry | EntryView): string {
  const values = 'values' in entry ? entry.values : entry.data;
  const active = activeFields(tracker);
  const title = titleField(tracker, values);
  const parts: string[] = [];
  for (const field of active) {
    if (title && field.key === title.key) continue;
    const formatted = formatFieldValue(field, values[field.key]);
    if (!formatted) continue;
    if (field.type === 'text' || field.type === 'notes') parts.push(`${field.label}: ${formatted}`);
    else parts.push(formatted);
  }
  return parts.join(' \u00B7 ');
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const hours = d.getHours();
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${pad2(d.getMinutes())} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function toHHMM(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatHHMM(value: string): string {
  const [h, m] = value.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m || 0)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatDayShort(day: string): string {
  const date = parseDay(day);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function formatDayLabel(day: string): string {
  const today = dayKey();
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const date = parseDay(day);
  const yearPrefix = date.getFullYear() !== new Date().getFullYear() ? `${date.getFullYear()} ` : '';
  return `${WEEKDAY_SHORT[date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}${yearPrefix}`;
}

/* ---------------------------------------------------------------- analytics */

export interface SummarySpec {
  agg: 'count' | 'sum' | 'avg' | 'max';
  fieldKey?: string;
  label: string;
  unit?: string | null;
  where?: { fieldKey: string; equals: unknown };
}

function numericValues(views: EntryView[], fieldKey: string): number[] {
  return views
    .map((v) => Number(v.values[fieldKey]))
    .filter((n) => Number.isFinite(n));
}

export function aggregate(spec: SummarySpec, views: EntryView[]): number {
  let list = views;
  if (spec.where) list = list.filter((v) => v.values[spec.where!.fieldKey] === spec.where!.equals);
  if (spec.agg === 'count' || !spec.fieldKey) return list.length;
  const nums = numericValues(list, spec.fieldKey);
  if (spec.agg === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (spec.agg === 'max') return nums.length ? Math.max(...nums) : 0;
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function metricValue(metric: string, views: EntryView[]): number {
  if (metric === 'count') return views.length;
  if (metric.startsWith('sum:')) {
    const key = metric.slice(4);
    return views.reduce((total, v) => {
      const n = Number(v.values[key]);
      return total + (Number.isFinite(n) ? n : 0);
    }, 0);
  }
  return 0;
}

export function dailySeries(spec: SummarySpec, views: EntryView[], from: string, to: string) {
  const byDay = new Map<string, EntryView[]>();
  for (const v of views) {
    const list = byDay.get(v.day) ?? [];
    list.push(v);
    byDay.set(v.day, list);
  }
  const out: Array<{ day: string; value: number }> = [];
  let day = from;
  let guard = 0;
  while (day <= to && guard < 4000) {
    out.push({ day, value: aggregate(spec, byDay.get(day) ?? []) });
    day = addDays(day, 1);
    guard += 1;
  }
  return out;
}

export function breakdown(views: EntryView[], spec: SummarySpec, byFieldKey: string) {
  const groups = new Map<string, EntryView[]>();
  const list = spec.where
    ? views.filter((v) => v.values[spec.where!.fieldKey] === spec.where!.equals)
    : views;
  for (const v of list) {
    const raw = v.values[byFieldKey];
    const labels = Array.isArray(raw) ? raw : typeof raw === 'boolean' ? (raw ? [raw] : []) : [raw];
    for (const label of labels) {
      const key = String(label ?? '(none)');
      const bucket = groups.get(key) ?? [];
      bucket.push(v);
      groups.set(key, bucket);
    }
  }
  return Array.from(groups.entries())
    .map(([label, bucket]) => ({ label, value: aggregate(spec, bucket) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function activeDayCount(views: EntryView[]): number {
  return new Set(views.map((v) => v.day)).size;
}

export type Period = '7d' | '30d';

export function periodRange(period: Period, today: string) {
  const days = period === '7d' ? 7 : 30;
  return { from: addDays(today, -(days - 1)), to: today, days };
}

export function currentStreak(days: string[], today: string): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function formatSummaryValue(tracker: TrackerWithFields, spec: SummarySpec, value: number): string {
  const field = (tracker.fields ?? []).find((f) => f.key === spec.fieldKey);
  if (field?.type === 'duration') return formatDuration(value);
  return withUnit(value, spec.unit ?? field?.unit ?? null);
}

export function computeSummary(tracker: TrackerWithFields, spec: SummarySpec, views: EntryView[]) {
  const value = aggregate(spec, views);
  return { value, label: spec.label, text: formatSummaryValue(tracker, spec, value) };
}

/* -------------------------------------------------------------------- goals */

export interface GoalRow {
  id: string;
  title: string;
  metric: string;
  target: number;
  period: 'day' | 'week' | 'month';
  kind: string;
  unit?: string | null;
  space_key: string;
}

export interface GoalView {
  goal: GoalRow;
  progress: { fraction: number; over: number; behind: boolean };
  line: string;
}

function startOfGoalWeek(day: string): string {
  return startOfWeek(day);
}

function startOfGoalMonth(day: string): string {
  return startOfMonth(day);
}

/** Hour of day the shipped app starts counting goal progress from. */
const GOAL_START_HOUR = 7;

/**
 * expectedFraction() from the shipped bundle (decompiled2.js 371012-371170).
 * Day goals assume progress accrues evenly between 07:00 and 22:00.
 */
export function expectedFraction(goal: GoalRow, now: Date = new Date()): number | null {
  const hours = now.getHours() + now.getMinutes() / 60;
  const todayFraction = Math.max(0, Math.min(1, (hours - GOAL_START_HOUR) / 15));
  if (goal.period === 'day') return todayFraction;
  if (goal.period === 'week') {
    const weekday = (now.getDay() + 6) % 7;
    return (weekday + todayFraction) / 7;
  }
  if (goal.period === 'month') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return (now.getDate() - 1 + todayFraction) / daysInMonth;
  }
  return null;
}

export function goalViews(tracker: TrackerWithFields, goals: GoalRow[], views: EntryView[], today: string): GoalView[] {
  const now = new Date();
  return goals.map((goal) => {
    let from = today;
    if (goal.period === 'week') from = startOfGoalWeek(today);
    if (goal.period === 'month') from = startOfGoalMonth(today);
    const inPeriod = views.filter((v) => v.day >= from && v.day <= today);
    const value = metricValue(goal.metric, inPeriod);
    const target = Number(goal.target) || 0;
    const fraction = target > 0 ? value / target : 0;
    const over = Math.max(0, value - target);
    const remaining = Math.max(0, target - value);
    const fieldKey = goal.metric.startsWith('sum:') ? goal.metric.slice(4) : undefined;
    const field = (tracker.fields ?? []).find((f) => f.key === fieldKey);
    const unit = goal.unit ?? field?.unit ?? null;
    const line = over > 0
      ? `${withUnit(over, unit)} over`
      : `${withUnit(remaining, unit)} to go`;
    // computeProgress() in the shipped bundle: rate/total goals are "behind"
    // until they are complete, or when they trail the expected pace by 20%.
    const expected = expectedFraction(goal, now);
    const behind =
      expected != null && expected > 0.1 &&
      (goal.kind === 'limit'
        ? over > 0 || fraction > expected * 1.2
        : goal.kind === 'rate' || goal.kind === 'total'
          ? fraction < expected * 0.8 || fraction < 1
          : false);
    return { goal, progress: { fraction, over, behind }, line };
  });
}

