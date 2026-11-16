import { makeDriver } from '../db';
import { dayKey } from './dates';
import {
  parseConfig,
  parseData,
  type Tracker,
  type TrackerConfig,
  type TrackerEntry,
  type TrackerField,
  type TrackerSchedule,
  type TrackerTemplate,
} from './types';

export function newId(prefix = 'trk'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapTracker(row: Record<string, unknown>): Tracker {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    icon: String(row.icon ?? 'ellipse'),
    color: String(row.color ?? '#8B5CF6'),
    template_key: row.template_key ? String(row.template_key) : null,
    status: (String(row.status ?? 'active') as Tracker['status']) || 'active',
    show_on_dashboard: Number(row.show_on_dashboard ?? 1),
    config: parseConfig(row.config),
    sort_order: Number(row.sort_order ?? 0),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function mapField(row: Record<string, unknown>): TrackerField {
  let options: string[] = [];
  try {
    const parsed = JSON.parse(String(row.options ?? '[]'));
    if (Array.isArray(parsed)) options = parsed.map(String);
  } catch {
    options = [];
  }
  return {
    id: String(row.id),
    tracker_id: String(row.tracker_id),
    key: String(row.key),
    label: String(row.label ?? ''),
    type: String(row.type ?? 'text') as TrackerField['type'],
    unit: row.unit ? String(row.unit) : null,
    options,
    required: Number(row.required ?? 0),
    position: Number(row.position ?? 0),
    archived: Number(row.archived ?? 0),
    config: parseConfig(row.config),
  };
}

function mapEntry(row: Record<string, unknown>): TrackerEntry {
  return {
    id: String(row.id),
    tracker_id: String(row.tracker_id),
    occurred_at: Number(row.occurred_at ?? row.created_at ?? 0),
    day: String(row.day ?? ''),
    data: parseData(row.data),
    note: String(row.note ?? ''),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? row.created_at ?? 0),
  };
}

export async function listTrackers(includeArchived = false): Promise<Tracker[]> {
  const d = makeDriver();
  const rows = await d.getAllAsync<Record<string, unknown>>(
    includeArchived
      ? 'SELECT * FROM trackers ORDER BY sort_order, created_at'
      : "SELECT * FROM trackers WHERE status != 'archived' ORDER BY sort_order, created_at",
  );
  return rows.map(mapTracker);
}

export async function getTracker(id: string): Promise<Tracker | null> {
  const d = makeDriver();
  const row = await d.getFirstAsync<Record<string, unknown>>('SELECT * FROM trackers WHERE id = ?', [id]);
  return row ? mapTracker(row) : null;
}

export async function createTrackerFromTemplate(template: TrackerTemplate): Promise<string> {
  const d = makeDriver();
  const id = newId('trk');
  const now = Date.now();
  const existing = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM trackers');
  const sortOrder = Number(existing?.n ?? 0);
  const draft = template.draft;
  await d.withTransactionAsync(async () => {
    await d.runAsync(
      `INSERT INTO trackers
        (id, name, description, icon, color, template_key, status, show_on_dashboard, config, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      [
        id,
        draft.name,
        draft.description,
        draft.icon,
        draft.color,
        template.key,
        draft.showOnDashboard ? 1 : 0,
        JSON.stringify(draft.config),
        sortOrder,
        now,
        now,
      ],
    );
    for (let i = 0; i < draft.fields.length; i += 1) {
      const f = draft.fields[i];
      await d.runAsync(
        `INSERT INTO tracker_fields
          (id, tracker_id, key, label, type, unit, options, required, position, archived, config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          newId('fld'),
          id,
          f.key,
          f.label,
          f.type,
          f.unit ?? null,
          JSON.stringify(f.options ?? []),
          f.required ? 1 : 0,
          i,
          JSON.stringify(f.config ?? {}),
        ],
      );
    }
  });
  return id;
}

export async function createCustomTracker(name: string, description = ''): Promise<string> {
  const d = makeDriver();
  const id = newId('trk');
  const now = Date.now();
  const existing = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM trackers');
  await d.runAsync(
    `INSERT INTO trackers
      (id, name, description, icon, color, template_key, status, show_on_dashboard, config, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 'ellipse', '#8B5CF6', NULL, 'active', 1, '{}', ?, ?, ?)`,
    [id, name.trim(), description.trim(), Number(existing?.n ?? 0), now, now],
  );
  return id;
}

export async function updateTracker(
  id: string,
  patch: Partial<Pick<Tracker, 'name' | 'description' | 'icon' | 'color' | 'status' | 'show_on_dashboard'>> & {
    config?: TrackerConfig;
  },
): Promise<void> {
  const d = makeDriver();
  const current = await getTracker(id);
  if (!current) return;
  await d.runAsync(
    `UPDATE trackers SET name = ?, description = ?, icon = ?, color = ?, status = ?,
       show_on_dashboard = ?, config = ?, updated_at = ? WHERE id = ?`,
    [
      patch.name ?? current.name,
      patch.description ?? current.description,
      patch.icon ?? current.icon,
      patch.color ?? current.color,
      patch.status ?? current.status,
      patch.show_on_dashboard ?? current.show_on_dashboard,
      JSON.stringify(patch.config ?? current.config),
      Date.now(),
      id,
    ],
  );
}

export async function deleteTracker(id: string): Promise<void> {
  const d = makeDriver();
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM tracker_fields WHERE tracker_id = ?', [id]);
    await d.runAsync('DELETE FROM tracker_entries WHERE tracker_id = ?', [id]);
    await d.runAsync("DELETE FROM schedules WHERE target_type = 'tracker' AND target_id = ?", [id]);
    await d.runAsync('DELETE FROM trackers WHERE id = ?', [id]);
  });
}

export async function listFields(trackerId: string, includeArchived = true): Promise<TrackerField[]> {
  const d = makeDriver();
  const rows = await d.getAllAsync<Record<string, unknown>>(
    includeArchived
      ? 'SELECT * FROM tracker_fields WHERE tracker_id = ? ORDER BY position, rowid'
      : 'SELECT * FROM tracker_fields WHERE tracker_id = ? AND archived = 0 ORDER BY position, rowid',
    [trackerId],
  );
  return rows.map(mapField);
}

export async function getField(id: string): Promise<TrackerField | null> {
  const d = makeDriver();
  const row = await d.getFirstAsync<Record<string, unknown>>('SELECT * FROM tracker_fields WHERE id = ?', [id]);
  return row ? mapField(row) : null;
}

function slugKey(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || `field_${Math.random().toString(36).slice(2, 6)}`
  );
}

export async function saveField(
  trackerId: string,
  field: Partial<TrackerField> & { label: string; type: TrackerField['type'] },
): Promise<string> {
  const d = makeDriver();
  const now = Date.now();
  if (field.id) {
    await d.runAsync(
      `UPDATE tracker_fields SET label = ?, type = ?, unit = ?, options = ?, required = ?,
        archived = ?, config = ? WHERE id = ?`,
      [
        field.label,
        field.type,
        field.unit ?? null,
        JSON.stringify(field.options ?? []),
        field.required ? 1 : 0,
        field.archived ? 1 : 0,
        JSON.stringify(field.config ?? {}),
        field.id,
      ],
    );
    return field.id;
  }
  const existing = await listFields(trackerId, true);
  let key = field.key || slugKey(field.label);
  if (existing.some((f) => f.key === key)) key = `${key}_${existing.length + 1}`;
  const id = newId('fld');
  await d.runAsync(
    `INSERT INTO tracker_fields
      (id, tracker_id, key, label, type, unit, options, required, position, archived, config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      trackerId,
      key,
      field.label,
      field.type,
      field.unit ?? null,
      JSON.stringify(field.options ?? []),
      field.required ? 1 : 0,
      existing.length,
      field.archived ? 1 : 0,
      JSON.stringify(field.config ?? {}),
    ],
  );
  return id;
}

export async function moveField(trackerId: string, fieldId: string, direction: -1 | 1): Promise<void> {
  const fields = await listFields(trackerId, true);
  const index = fields.findIndex((f) => f.id === fieldId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= fields.length) return;
  const d = makeDriver();
  await d.withTransactionAsync(async () => {
    await d.runAsync('UPDATE tracker_fields SET position = ? WHERE id = ?', [target, fields[index].id]);
    await d.runAsync('UPDATE tracker_fields SET position = ? WHERE id = ?', [index, fields[target].id]);
  });
}

export async function setFieldArchived(fieldId: string, archived: boolean): Promise<void> {
  const d = makeDriver();
  await d.runAsync('UPDATE tracker_fields SET archived = ? WHERE id = ?', [archived ? 1 : 0, fieldId]);
}

export async function deleteField(fieldId: string): Promise<void> {
  const d = makeDriver();
  await d.runAsync('DELETE FROM tracker_fields WHERE id = ?', [fieldId]);
}

export async function listEntries(trackerId: string, limit = 200): Promise<TrackerEntry[]> {
  const d = makeDriver();
  const rows = await d.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM tracker_entries WHERE tracker_id = ? ORDER BY occurred_at DESC, created_at DESC LIMIT ?',
    [trackerId, limit],
  );
  return rows.map(mapEntry);
}

export async function getEntry(id: string): Promise<TrackerEntry | null> {
  const d = makeDriver();
  const row = await d.getFirstAsync<Record<string, unknown>>('SELECT * FROM tracker_entries WHERE id = ?', [id]);
  return row ? mapEntry(row) : null;
}

function numericSummary(fields: TrackerField[], data: Record<string, unknown>): number {
  const primary =
    fields.find((f) => ['number', 'decimal', 'amount', 'percentage', 'counter', 'duration'].includes(f.type)) ?? null;
  if (!primary) return 0;
  const raw = data[primary.key];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function noteValue(data: Record<string, unknown>): string {
  for (const key of ['notes', 'note', 'thoughts', 'learned', 'what', 'liked', 'context']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export async function saveEntry(input: {
  id?: string;
  trackerId: string;
  data: Record<string, unknown>;
  occurredAt: number;
  day?: string;
  fields: TrackerField[];
}): Promise<string> {
  const d = makeDriver();
  const now = Date.now();
  const day = input.day ?? dayKey(new Date(input.occurredAt));
  const json = JSON.stringify(input.data);
  const value = numericSummary(input.fields, input.data);
  const note = noteValue(input.data);
  if (input.id) {
    await d.runAsync(
      `UPDATE tracker_entries SET occurred_at = ?, day = ?, data = ?, value = ?, note = ?, updated_at = ? WHERE id = ?`,
      [input.occurredAt, day, json, value, note, now, input.id],
    );
    return input.id;
  }
  const id = newId('ent');
  await d.runAsync(
    `INSERT INTO tracker_entries
      (id, tracker_id, occurred_at, day, data, value, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.trackerId, input.occurredAt, day, json, value, note, now, now],
  );
  return id;
}

export async function deleteEntry(id: string): Promise<void> {
  const d = makeDriver();
  await d.runAsync('DELETE FROM tracker_entries WHERE id = ?', [id]);
}

/** Re-inserts a removed entry (the "Undo" action on the removal toast). */
export async function restoreEntry(entry: TrackerEntry, fields: TrackerField[]): Promise<void> {
  const d = makeDriver();
  await d.runAsync(
    `INSERT OR REPLACE INTO tracker_entries
      (id, tracker_id, occurred_at, day, data, value, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.tracker_id,
      entry.occurred_at,
      entry.day,
      JSON.stringify(entry.data),
      numericSummary(fields, entry.data),
      entry.note ?? '',
      entry.created_at,
      entry.updated_at,
    ],
  );
}

export async function countEntriesOnDay(trackerId: string, day: string): Promise<number> {
  const d = makeDriver();
  const row = await d.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM tracker_entries WHERE tracker_id = ? AND day = ?',
    [trackerId, day],
  );
  return Number(row?.n ?? 0);
}

export async function entriesSince(trackerId: string, fromDay: string): Promise<TrackerEntry[]> {
  const d = makeDriver();
  const rows = await d.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM tracker_entries WHERE tracker_id = ? AND day >= ? ORDER BY day, occurred_at',
    [trackerId, fromDay],
  );
  return rows.map(mapEntry);
}

export async function getSetting(key: string): Promise<string | null> {
  const d = makeDriver();
  const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const d = makeDriver();
  await d.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export async function removeSetting(key: string): Promise<void> {
  const d = makeDriver();
  await d.runAsync('DELETE FROM settings WHERE key = ?', [key]);
}

function mapSchedule(row: Record<string, unknown>): TrackerSchedule {
  let days: number[] = [0, 1, 2, 3, 4, 5, 6];
  try {
    const parsed = JSON.parse(String(row.days ?? '[]'));
    if (Array.isArray(parsed)) days = parsed.map(Number);
  } catch {
    days = [0, 1, 2, 3, 4, 5, 6];
  }
  return {
    id: String(row.id),
    tracker_id: String(row.target_id ?? ''),
    kind: String(row.kind ?? 'daily') as TrackerSchedule['kind'],
    time: String(row.time ?? '09:00'),
    days,
    interval_minutes: Number(row.interval_minutes ?? 120),
    window_start: String(row.window_start ?? '09:00'),
    window_end: String(row.window_end ?? '21:00'),
    start_day: row.start_day ? String(row.start_day) : null,
    message: String(row.message ?? ''),
    only_if_not_done: Number(row.only_if_not_done ?? 0),
    enabled: Number(row.enabled ?? 1),
    created_at: Number(row.created_at ?? 0),
  };
}

export async function getScheduleForTracker(trackerId: string): Promise<TrackerSchedule | null> {
  const d = makeDriver();
  const row = await d.getFirstAsync<Record<string, unknown>>(
    "SELECT * FROM schedules WHERE target_type = 'tracker' AND target_id = ? ORDER BY created_at DESC LIMIT 1",
    [trackerId],
  );
  return row ? mapSchedule(row) : null;
}

export async function saveSchedule(
  trackerId: string,
  schedule: Omit<TrackerSchedule, 'id' | 'tracker_id' | 'created_at'> & { id?: string },
): Promise<string> {
  const d = makeDriver();
  const existing = await getScheduleForTracker(trackerId);
  const id = schedule.id ?? existing?.id ?? newId('sch');
  await d.runAsync(
    `INSERT INTO schedules
      (id, target_type, target_id, kind, time, days, interval_minutes, window_start, window_end, start_day,
       message, only_if_not_done, enabled, created_at)
     VALUES (?, 'tracker', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, time = excluded.time, days = excluded.days,
       interval_minutes = excluded.interval_minutes, window_start = excluded.window_start,
       window_end = excluded.window_end, start_day = excluded.start_day,
       message = excluded.message, only_if_not_done = excluded.only_if_not_done, enabled = excluded.enabled`,
    [
      id,
      trackerId,
      schedule.kind,
      schedule.time,
      JSON.stringify(schedule.days),
      schedule.interval_minutes,
      schedule.window_start,
      schedule.window_end,
      schedule.start_day,
      schedule.message,
      schedule.only_if_not_done ? 1 : 0,
      schedule.enabled ? 1 : 0,
      existing?.created_at ?? Date.now(),
    ],
  );
  return id;
}

export async function deleteScheduleForTracker(trackerId: string): Promise<void> {
  const d = makeDriver();
  await d.runAsync("DELETE FROM schedules WHERE target_type = 'tracker' AND target_id = ?", [trackerId]);
}

export async function listEnabledTrackerSchedules(): Promise<TrackerSchedule[]> {
  const d = makeDriver();
  const rows = await d.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM schedules WHERE target_type = 'tracker' AND enabled = 1",
  );
  return rows.map(mapSchedule);
}


export interface GoalMilestone {
  id: string;
  goal_id: string;
  title: string;
  due_day: string | null;
  position: number;
  done_at: number | null;
}

export async function listMilestones(goalId: string): Promise<GoalMilestone[]> {
  const d = makeDriver();
  const rows = await d.getAllAsync<Record<string, unknown>>(
    'SELECT * FROM goal_milestones WHERE goal_id = ? ORDER BY position, rowid',
    [goalId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    goal_id: String(r.goal_id),
    title: String(r.title),
    due_day: r.due_day ? String(r.due_day) : null,
    position: Number(r.position) || 0,
    done_at: r.done_at ? Number(r.done_at) : null,
  }));
}

export async function addMilestone(goalId: string, title: string, dueDay?: string | null): Promise<string> {
  const d = makeDriver();
  const maxRow = await d.getFirstAsync<{ m: number | null }>(
    'SELECT MAX(position) AS m FROM goal_milestones WHERE goal_id = ?',
    [goalId],
  );
  const pos = (maxRow?.m ?? 0) + 1;
  const id = newId('ms');
  await d.runAsync(
    'INSERT INTO goal_milestones (id, goal_id, title, due_day, position) VALUES (?, ?, ?, ?, ?)',
    [id, goalId, title, dueDay ?? null, pos],
  );
  return id;
}

export async function toggleMilestone(id: string, done: boolean): Promise<void> {
  const d = makeDriver();
  await d.runAsync('UPDATE goal_milestones SET done_at = ? WHERE id = ?', [done ? Date.now() : null, id]);
}

export async function deleteMilestone(id: string): Promise<void> {
  const d = makeDriver();
  await d.runAsync('DELETE FROM goal_milestones WHERE id = ?', [id]);
}
