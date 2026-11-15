/**
 * Tracker engine types, transcribed from the shipped app.
 *
 * Field catalogue: decompiled2.js:621828-621908 (18 field types, 6 families).
 * Presentations: decompiled2.js:401152-401166.
 * Template drafts: decompiled2.js:616826-617369.
 * Schedule kinds: decompiled2.js:640044-640055.
 * Goal config: decompiled2.js:371716.
 */

export type FieldType =
  | 'text'
  | 'notes'
  | 'number'
  | 'decimal'
  | 'amount'
  | 'percentage'
  | 'counter'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'rating'
  | 'checklist'
  | 'duration'
  | 'date'
  | 'time'
  | 'photo'
  | 'file'
  | 'person';

export type FieldFamily = 'text' | 'number' | 'choice' | 'time' | 'media' | 'people';

export interface FieldTypeDef {
  id: FieldType;
  family: FieldFamily;
  label: string;
  example: string;
  storage: string;
  unit?: string;
  needsOptions?: boolean;
  customUnit?: boolean;
  config?: Record<string, unknown>;
  suggestNames: string[];
}

export const FIELD_TYPES: FieldTypeDef[] = [
  { id: 'text', family: 'text', label: 'Short text', example: 'Book title', storage: 'text', suggestNames: ['Title', 'Topic', 'Exercise', 'Place'] },
  { id: 'notes', family: 'text', label: 'Long text', example: 'What I learned', storage: 'notes', suggestNames: ['Notes', 'What I learned', 'Thoughts'] },
  { id: 'number', family: 'number', label: 'Whole number', example: 'Pages: 24', storage: 'number', customUnit: true, suggestNames: ['Pages', 'Reps', 'Sets', 'New words'] },
  { id: 'decimal', family: 'number', label: 'Decimal', example: 'Weight: 62.5', storage: 'decimal', customUnit: true, suggestNames: ['Weight', 'Distance', 'Hours'] },
  { id: 'amount', family: 'number', label: 'Amount (₹)', example: '₹499', storage: 'decimal', unit: '₹', config: { style: 'amount' }, suggestNames: ['Amount', 'Cost', 'Price'] },
  { id: 'percentage', family: 'number', label: 'Percentage', example: 'Confidence 80%', storage: 'number', unit: '%', config: { style: 'percentage', min: 0, max: 100 }, suggestNames: ['Confidence', 'Progress', 'Energy'] },
  { id: 'counter', family: 'number', label: 'Counter', example: 'Push-ups: 20', storage: 'number', config: { style: 'counter' }, suggestNames: ['Count', 'Cups', 'Reps'] },
  { id: 'select', family: 'choice', label: 'Choose one', example: 'Type: Walk / Run', storage: 'select', needsOptions: true, suggestNames: ['Type', 'Category', 'Mood'] },
  { id: 'multiselect', family: 'choice', label: 'Choose many', example: 'Tags', storage: 'multiselect', needsOptions: true, suggestNames: ['Tags', 'Areas', 'Equipment'] },
  { id: 'boolean', family: 'choice', label: 'Yes / No', example: 'Completed?', storage: 'boolean', suggestNames: ['Completed', 'Done', 'Taken'] },
  { id: 'rating', family: 'choice', label: 'Rating', example: 'Mood ★★★☆☆', storage: 'rating', suggestNames: ['Rating', 'Mood', 'Confidence', 'Quality'] },
  { id: 'checklist', family: 'choice', label: 'Checklist', example: 'Packing list', storage: 'multiselect', needsOptions: true, config: { style: 'checklist' }, suggestNames: ['Checklist', 'Steps', 'Items'] },
  { id: 'duration', family: 'time', label: 'Duration', example: '25 min', storage: 'duration', suggestNames: ['Duration', 'Time studied', 'Time spent'] },
  { id: 'date', family: 'time', label: 'Date', example: '12 Oct', storage: 'date', suggestNames: ['Date', 'Deadline'] },
  { id: 'time', family: 'time', label: 'Time of day', example: '7:30 AM', storage: 'time', suggestNames: ['Time', 'Bedtime', 'Wake up'] },
  { id: 'photo', family: 'media', label: 'Photo', example: 'Before / after', storage: 'photo', suggestNames: ['Photo', 'Before', 'After'] },
  { id: 'file', family: 'media', label: 'File', example: 'A PDF or recording', storage: 'file', suggestNames: ['File', 'Recording', 'Document'] },
  { id: 'person', family: 'people', label: 'Person', example: 'Who I met', storage: 'person', suggestNames: ['Who', 'Person', 'With'] },
];

export const FIELD_FAMILIES: { key: FieldFamily; label: string; example: string }[] = [
  { key: 'text', label: 'Text', example: 'a note, a name' },
  { key: 'number', label: 'Number', example: 'pages, kg, ₹' },
  { key: 'choice', label: 'Choice', example: 'type, mood, yes/no' },
  { key: 'time', label: 'Time', example: 'how long, when' },
  { key: 'media', label: 'Media', example: 'photo, file' },
  { key: 'people', label: 'People', example: 'who was there' },
];

export function fieldTypeDef(type: FieldType): FieldTypeDef | undefined {
  return FIELD_TYPES.find((f) => f.id === type);
}

export type Presentation = 'check' | 'count' | 'quantity' | 'session' | 'subjects' | 'rating' | 'log';

export const PRESENTATIONS: { key: Presentation; label: string; blurb: string }[] = [
  { key: 'check', label: 'Done / not done', blurb: 'One big button, plus your recent days' },
  { key: 'count', label: 'Counter', blurb: 'Tap + each time' },
  { key: 'quantity', label: 'Amount with quick buttons', blurb: 'A ring and one-tap amounts, like Water' },
  { key: 'session', label: 'Timed sessions', blurb: 'One-tap durations and time totals' },
  { key: 'subjects', label: 'Subjects with a timer', blurb: 'A card per subject, with a live timer' },
  { key: 'rating', label: 'Rating', blurb: 'Tap a star for today' },
  { key: 'log', label: 'Full log', blurb: 'A timeline of detailed entries' },
];

export const SESSION_PRESETS = [5, 10, 15, 30, 45, 60];

export type SummaryAgg = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface TrackerSummary {
  agg: SummaryAgg;
  fieldKey: string | null;
  label: string;
  unit?: string;
}

export interface QuickAddConfig {
  fieldKey: string;
  values: number[];
}

export type ScheduleKind = 'daily' | 'weekdays' | 'interval' | 'once' | 'yearly';

export interface ScheduleRef {
  kind: ScheduleKind | 'none';
}

export type GoalMetric = 'sum' | 'count' | 'duration' | 'avg';

export interface TrackerGoalConfig {
  metric: GoalMetric;
  target: number;
  unit: string;
  period: 'day' | 'week' | 'month';
}

export interface TrackerConfig {
  presentation?: Presentation;
  summaries?: TrackerSummary[];
  quickAdd?: QuickAddConfig | null;
  schedule?: ScheduleRef;
  titleFieldKey?: string | null;
  defaults?: Record<string, unknown>;
  goal?: TrackerGoalConfig;
  [key: string]: unknown;
}

export interface Tracker {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  template_key: string | null;
  status: 'active' | 'paused' | 'archived';
  show_on_dashboard: number;
  config: TrackerConfig;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface TrackerField {
  id: string;
  tracker_id: string;
  key: string;
  label: string;
  type: FieldType;
  unit: string | null;
  options: string[];
  required: number;
  position: number;
  archived: number;
  config: Record<string, unknown>;
}

export interface TrackerEntry {
  id: string;
  tracker_id: string;
  occurred_at: number;
  day: string;
  data: Record<string, unknown>;
  note: string;
  created_at: number;
  updated_at: number;
}

export interface TrackerSchedule {
  id: string;
  tracker_id: string;
  kind: ScheduleKind;
  time: string;
  days: number[];
  interval_minutes: number;
  window_start: string;
  window_end: string;
  start_day: string | null;
  message: string;
  only_if_not_done: number;
  enabled: number;
  created_at: number;
}

/** A field inside a template draft (same shape as the shipped drafts). */
export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
  required?: boolean;
  config?: Record<string, unknown>;
}

/** The installed-tracker draft carried by each template. */
export interface TemplateDraft {
  name: string;
  description: string;
  icon: string;
  color: string;
  showOnDashboard: boolean;
  fields: TemplateField[];
  config: TrackerConfig;
}

export interface TrackerTemplate {
  key: string;
  title: string;
  blurb: string;
  category: 'Health' | 'Money' | 'Mind' | 'Social' | 'Lifestyle';
  tags?: string[];
  suggestAfter?: string[];
  draft: TemplateDraft;
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = FIELD_TYPES.reduce(
  (acc, def) => ({ ...acc, [def.id]: def.label }),
  {} as Record<FieldType, string>,
);

export const PRESENTATION_LABELS: Record<Presentation, string> = PRESENTATIONS.reduce(
  (acc, def) => ({ ...acc, [def.key]: def.label }),
  {} as Record<Presentation, string>,
);

export const SCHEDULE_KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'daily', label: 'Every day' },
  { kind: 'weekdays', label: 'Certain days' },
  { kind: 'interval', label: 'Every few hours' },
  { kind: 'once', label: 'Once' },
  { kind: 'yearly', label: 'Every year' },
];

export function parseConfig(raw: unknown): TrackerConfig {
  if (typeof raw === 'object' && raw !== null) return raw as TrackerConfig;
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as TrackerConfig) : {};
  } catch {
    return {};
  }
}

export function parseData(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
