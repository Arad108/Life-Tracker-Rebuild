import type { Presentation, TrackerConfig, TrackerField } from './types';

/**
 * Presentation detection and one-tap helpers, transcribed from the shipped
 * bundle (decompiled2.js:400528-401133).
 */

export interface TrackerShape {
  config: TrackerConfig;
  fields: TrackerField[];
}

function activeFields(tracker: TrackerShape): TrackerField[] {
  return tracker.fields.filter((f) => !f.archived);
}

/** First required non-notes field, else the first non-notes field. */
export function primaryField(tracker: TrackerShape): TrackerField | undefined {
  const active = activeFields(tracker);
  const required = active.find((f) => f.required && f.type !== 'notes');
  if (required) return required;
  return active.find((f) => f.type !== 'notes');
}

/** Required text field used as the subject of a timed card. */
export function subjectField(tracker: TrackerShape): TrackerField | undefined {
  return activeFields(tracker).find((f) => f.type === 'text' && f.required);
}

export function durationField(tracker: TrackerShape): TrackerField | undefined {
  return activeFields(tracker).find((f) => f.type === 'duration');
}

/** True when the tracker is a "subject + live timer" layout. */
export function isSubjectTracker(tracker: TrackerShape): boolean {
  const subject = subjectField(tracker);
  const duration = durationField(tracker);
  if (!subject || !duration) return false;
  const defaults = tracker.config.defaults ?? {};
  const active = activeFields(tracker);
  const extraRequired = active.some(
    (f) => f.required && f.key !== subject.key && f.key !== duration.key && !(f.key in defaults),
  );
  if (extraRequired) return false;
  return active.filter((f) => f.type !== 'notes').length <= 4;
}

/** A tracker needs a form when the main field is required and has no default. */
export function needsMoreThanOneTap(tracker: TrackerShape): boolean {
  const main = primaryField(tracker);
  if (!main) return true;
  const defaults = tracker.config.defaults ?? {};
  return activeFields(tracker).some((f) => f.required && f.key !== main.key && !(f.key in defaults));
}

export function detectPresentation(tracker: TrackerShape): Presentation {
  const explicit = tracker.config.presentation;
  if (explicit) return explicit;
  if (isSubjectTracker(tracker)) return 'subjects';

  const main = primaryField(tracker);
  if (!main) return 'log';

  const defaults = tracker.config.defaults ?? {};
  const active = activeFields(tracker);
  const extraRequired = active.some((f) => f.required && f.key !== main.key && !(f.key in defaults));
  if (extraRequired) return 'log';

  const quickAdd = tracker.config.quickAdd;
  if (quickAdd && quickAdd.fieldKey === main.key) return 'quantity';

  if (active.filter((f) => f.type !== 'notes').length > 3) return 'log';

  switch (main.type) {
    case 'boolean':
      return 'check';
    case 'duration':
      return 'session';
    case 'rating':
      return 'rating';
    case 'number':
      return main.unit ? 'quantity' : 'count';
    case 'decimal':
      return main.unit ? 'quantity' : 'log';
    default:
      return 'log';
  }
}

/** config.defaults limited to fields that still exist. */
export function liveDefaults(tracker: TrackerShape): Record<string, unknown> {
  const keys = new Set(activeFields(tracker).map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tracker.config.defaults ?? {})) {
    if (keys.has(key)) out[key] = value;
  }
  return out;
}

export interface OneTap {
  label: string;
  values: Record<string, unknown>;
}

/** The single tap action for a tracker, or null when a form is needed. */
export function oneTap(tracker: TrackerShape, presentation: Presentation, minutes?: number): OneTap | null {
  if (needsMoreThanOneTap(tracker)) return null;
  const main = primaryField(tracker);
  if (!main) return null;
  const values = liveDefaults(tracker);

  switch (presentation) {
    case 'check':
      return { label: 'Done', values: { ...values, [main.key]: true } };
    case 'count':
      return { label: '+1', values: { ...values, [main.key]: 1 } };
    case 'session': {
      const mins = minutes && minutes > 0 ? minutes : 15;
      return { label: `${mins} min`, values: { ...values, [main.key]: mins } };
    }
    default:
      return null;
  }
}

export function mainValue(tracker: TrackerShape, data: Record<string, unknown>): unknown {
  const main = primaryField(tracker);
  return main ? data[main.key] : undefined;
}
