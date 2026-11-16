import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  AppText,
  Button,
  Chip,
  ChipRow,
  Screen,
  SwitchRow,
  useToast,
} from '../../src/ui/components';
import { useTheme, space, radius, TOUCH } from '../../src/ui/theme';
import {
  getTracker,
  listFields,
  listEntries,
  saveEntry,
  updateTracker,
  deleteTracker,
  deleteEntry,
  restoreEntry,
  newId,
  getScheduleForTracker,
  getSetting,
  setSetting,
  removeSetting,
} from '../../src/tracker/repository';
import { makeDriver } from '../../src/db';
import { dayKey, addDays } from '../../src/tracker/dates';
import { detectPresentation, primaryField, liveDefaults } from '../../src/tracker/presentation';
import {
  PRESENTATIONS,
  SESSION_PRESETS,
  type Tracker,
  type TrackerEntry,
  type TrackerField,
  type TrackerSchedule,
} from '../../src/tracker/types';
import {
  aggregate,
  computeSummary,
  currentStreak,
  dailySeries,
  formatDuration,
  formatFieldValue,
  formatHHMM,
  formatQuantity,
  formatTime,
  goalViews,
  metricValue,
  viewsOf,
  type GoalRow,
  type TrackerWithFields,
} from '../../src/tracker/format';
import { Bars, EntryTimeline, GoalsStrip, Insights, Ring } from '../../src/tracker/space';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describeTrackerSchedule(tracker: Tracker): string {
  const schedule = tracker.config?.schedule as
    | { kind?: string; days?: number[]; count?: number }
    | undefined;
  if (!schedule || schedule.kind === 'none' || !schedule.kind) return 'No set frequency';
  if (schedule.kind === 'daily') return 'Every day';
  if (schedule.kind === 'days') {
    const days = schedule.days ?? [];
    return `On ${days.map((d) => WEEKDAYS[d]).join(', ')}`;
  }
  if (schedule.kind === 'weekly_count') return `${schedule.count ?? 0} times per week`;
  return 'No set frequency';
}

function describeScheduleRow(row: TrackerSchedule): string {
  const time = formatHHMM(row.time || '09:00');
  if (row.kind === 'interval') {
    const every =
      row.interval_minutes % 60 === 0
        ? row.interval_minutes === 60
          ? 'Every hour'
          : `Every ${row.interval_minutes / 60} hours`
        : `Every ${row.interval_minutes} minutes`;
    const window =
      row.window_start && row.window_end
        ? `, ${formatHHMM(row.window_start)} to ${formatHHMM(row.window_end)}`
        : '';
    return `${every}${window}`;
  }
  if (row.kind === 'weekdays') {
    const days = row.days ?? [];
    let label: string;
    if (days.length === 7) label = 'Every day';
    else if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) label = 'Weekdays';
    else if (days.length === 2 && days.includes(0) && days.includes(6)) label = 'Weekends';
    else label = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => WEEKDAYS[d]).join(', ');
    return `${label} at ${time}`;
  }
  if (row.kind === 'once') return `Once at ${time}`;
  if (row.kind === 'yearly') return `Every year at ${time}`;
  return `Every day at ${time}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <AppText size={13} weight="500" muted>
      {children}
    </AppText>
  );
}

export default function TrackerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();

  const [tracker, setTracker] = useState<TrackerWithFields | null>(null);
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [schedule, setSchedule] = useState<TrackerSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [goalMetric, setGoalMetric] = useState('count');
  const [goalKind, setGoalKind] = useState<'rate' | 'limit' | 'total' | 'manual'>('rate');
  const [goalUnit, setGoalUnit] = useState('');
  const [goalPeriod, setGoalPeriod] = useState<'day' | 'week' | 'month' | 'none'>('day');
  const [goalDeadline, setGoalDeadline] = useState<string | null>(null);
  const [goalPriority, setGoalPriority] = useState(0);
  const [goalNotes, setGoalNotes] = useState('');
  const [goalName, setGoalName] = useState('');

  const [newSubject, setNewSubject] = useState('');
  const [savedSubjects, setSavedSubjects] = useState<string[]>([]);
  const [timers, setTimers] = useState<Record<string, { start: number; running: boolean }>>({});
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    const tr = await getTracker(String(id));
    if (!tr) {
      setTracker(null);
      setLoading(false);
      return;
    }
    const f = await listFields(tr.id, false);
    const withFields: TrackerWithFields = { ...tr, fields: f };
    setTracker(withFields);
    const e = await listEntries(tr.id, 200);
    setEntries(e);
    const d = makeDriver();
    const g = await d.getAllAsync<GoalRow>(
      'SELECT * FROM goals WHERE space_key = ? AND status = ?',
      [`tracker:${tr.id}`, 'active'],
    );
    setGoals(g || []);
    setSchedule(await getScheduleForTracker(tr.id));
    const subjRaw = await getSetting(`subjects:${tr.id}`);
    if (subjRaw) {
      try {
        const parsed = JSON.parse(subjRaw);
        if (Array.isArray(parsed)) setSavedSubjects(parsed.filter((x: unknown) => typeof x === 'string'));
      } catch {}
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!tracker) return;
    const subs = Array.from(
      new Set([
        ...entries
          .map((e) => String(e.data?.[tracker.config.titleFieldKey ?? 'subject'] ?? ''))
          .filter(Boolean),
        ...savedSubjects,
      ]),
    );
    (async () => {
      const out: Record<string, { start: number; running: boolean }> = {};
      for (const s of subs) {
        const v = await getSetting(`timer:${tracker.id}:${s}`);
        if (v) {
          try {
            out[s] = JSON.parse(v);
          } catch {}
        }
      }
      setTimers(out);
    })();
  }, [tracker?.id, entries.length, savedSubjects.length]);

  if (loading || !tracker) {
    return (
      <Screen>
        <AppText muted>Loading…</AppText>
      </Screen>
    );
  }

  const presentation = detectPresentation(tracker);
  const primary = primaryField(tracker);
  const primaryKey = primary?.key ?? '';
  const unit = primary?.unit ?? '';
  const defaults = liveDefaults(tracker);
  const today = dayKey();
  const views = viewsOf(entries);
  const todays = views.filter((v) => v.day === today);
  const active = tracker.status === 'active';

  const dayRateGoal = (metric: string) =>
    goals.find((g) => g.kind === 'rate' && g.period === 'day' && g.metric === metric);

  const window14 = { from: addDays(today, -13), to: today };
  const window7 = { from: addDays(today, -6), to: today };

  const addEntry = async (data: Record<string, unknown>) => {
    const entryId = await saveEntry({
      trackerId: tracker.id,
      data,
      occurredAt: Date.now(),
      fields: tracker.fields,
    });
    await load();
    return entryId;
  };

  const removeToday = async (entry: TrackerEntry, label: string) => {
    await deleteEntry(entry.id);
    await load();
    toast.show({
      message: `Removed ${label}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await restoreEntry(entry, tracker.fields);
        await load();
      },
    });
  };

  /* ------------------------------------------------------------- shared bits */

  const onSetShowOnToday = async (next: boolean) => {
    await updateTracker(tracker.id, { show_on_dashboard: next ? 1 : 0 });
    await load();
  };

  const onLayoutChange = async (key: string) => {
    await updateTracker(tracker.id, { config: { ...tracker.config, presentation: key as never } });
    await load();
  };

  const onPause = async () => {
    await updateTracker(tracker.id, { status: 'paused' });
    await load();
  };

  const onResume = async () => {
    await updateTracker(tracker.id, { status: 'active' });
    await load();
  };

  const onArchive = () => {
    Alert.alert(
      'Archive this Space?',
      'It disappears from Today and stops reminders. All history is kept and you can restore it any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            await updateTracker(tracker.id, { status: 'archived' });
            router.back();
          },
        },
      ],
    );
  };

  const onDelete = () => {
    Alert.alert(
      'Delete permanently?',
      `This erases "${tracker.name}" and all ${entries.length} of its entries. This cannot be undone. Archive it instead if you might want it later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: async () => {
            await deleteTracker(tracker.id);
            router.back();
          },
        },
      ],
    );
  };

  const openGoalSheet = (metric?: string) => {
    setGoalMetric(metric ?? (primaryKey ? `sum:${primaryKey}` : 'count'));
    setGoalInput('');
    setGoalKind('rate');
    setGoalUnit(unit);
    setGoalPeriod('day');
    setGoalDeadline(null);
    setGoalPriority(0);
    setGoalNotes('');
    setGoalName('');
    setGoalOpen(true);
  };

  const saveGoal = async () => {
    const n = Number(goalInput);
    const isManual = goalKind === 'manual';
    if (!isManual && (!Number.isFinite(n) || n <= 0)) {
      toast.show('Enter a positive number');
      return;
    }
    const d = makeDriver();
    await d.runAsync('DELETE FROM goals WHERE space_key = ?', [`tracker:${tracker.id}`]);
    await d.runAsync(
      `INSERT INTO goals (id, title, space_key, kind, metric, target, unit, period, start_day, deadline, priority, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        newId('goal'),
        goalName.trim() || `${tracker.name}: ${isManual ? 'milestone' : `${goalKind} ${n} ${goalUnit || unit}`.trim()}`,
        `tracker:${tracker.id}`,
        goalKind,
        isManual ? 'count' : goalMetric,
        isManual ? 0 : n,
        isManual ? null : (goalUnit || unit || null),
        goalPeriod,
        dayKey(),
        goalDeadline,
        goalPriority,
        goalNotes.trim(),
        Date.now(),
        Date.now(),
      ],
    );
    setGoalOpen(false);
    await load();
  };

  const addCustom = async () => {
    const n = Number(customValue);
    if (!Number.isFinite(n)) {
      toast.show('Enter a number');
      return;
    }
    const entryId = await addEntry({ ...defaults, [primaryKey]: n });
    setCustomOpen(false);
    setCustomValue('');
    toast.show({
      message: `Added ${formatFieldValue(primary, n)}`,
      actionLabel: 'Undo',
      onAction: async () => {
        await deleteEntry(entryId);
        await load();
      },
    });
  };

  /* ----------------------------------------------------------- check branch */

  const renderCheck = () => {
    const done = todays.length > 0;
    const streak = currentStreak(entries.map((e) => e.day), today);
    const last14 = dailySeries({ agg: 'count', fieldKey: undefined, label: '' }, views, window14.from, today);
    const toggle = async () => {
      if (done) {
        const removed = todays.map((v) => v.entry!).filter(Boolean);
        await Promise.all(removed.map((e) => deleteEntry(e.id)));
        await load();
        toast.show({
          message: 'Marked not done',
          actionLabel: 'Undo',
          onAction: async () => {
            await Promise.all(removed.map((e) => restoreEntry(e, tracker.fields)));
            await load();
          },
        });
      } else {
        const entryId = await addEntry({ ...defaults, [primaryKey]: true });
        toast.show({
          message: `${tracker.name}: done`,
          actionLabel: 'Undo',
          onAction: async () => {
            await deleteEntry(entryId);
            await load();
          },
        });
      }
    };

    return (
      <View style={{ gap: space.xl }}>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.md }}>
          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={done ? `${tracker.name} done today. Tap to undo` : `Mark ${tracker.name} done`}
            style={{
              width: 168,
              height: 168,
              borderRadius: 84,
              backgroundColor: done ? tracker.color : 'transparent',
              borderWidth: done ? 0 : 3,
              borderColor: tracker.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="checkmark" size={56} color={done ? '#fff' : tracker.color} />
            <AppText size={17} weight="600" color={done ? '#fff' : tracker.color}>
              {done ? 'Done today' : 'Mark done'}
            </AppText>
          </Pressable>
          {tracker.config.showStreak && streak > 0 ? (
            <AppText size={13} weight="500" muted>
              {`${streak} day${streak === 1 ? '' : 's'} in a row`}
            </AppText>
          ) : null}
        </View>

        <View style={{ gap: space.sm }}>
          <SectionLabel>Last 14 days</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {last14.map((day) => {
              const isDone = day.value > 0;
              const dim = day.day === today && day.value === 0;
              return (
                <View
                  key={day.day}
                  accessibilityLabel={`${WEEKDAYS[new Date(day.day).getDay()]}: ${isDone ? 'done' : 'not done'}`}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: isDone ? tracker.color : t.surfaceAlt,
                    opacity: dim ? 0.5 : 1,
                  }}
                />
              );
            })}
          </View>
        </View>

        <SwitchRow
          label="Show streak"
          hint="Optional. Counts consecutive days."
          value={!!tracker.config.showStreak}
          onChange={async (next) => {
            await updateTracker(tracker.id, { config: { ...tracker.config, showStreak: next } });
            await load();
          }}
        />

        <GoalsStrip
          tracker={tracker}
          goals={goals}
          views={views}
          onAdd={openGoalSheet}
          onOpen={() => openGoalSheet()}
          suggestMetric="count"
        />

        <View style={{ gap: space.sm }}>
          <SectionLabel>History</SectionLabel>
          <EntryTimeline tracker={tracker} entries={entries} />
        </View>
      </View>
    );
  };

  /* ----------------------------------------------------------- count branch */

  const renderCount = () => {
    const metric = `sum:${primaryKey}`;
    const value = metricValue(metric, todays);
    const goal = dayRateGoal(metric);
    const series = dailySeries(
      { agg: 'sum', fieldKey: primaryKey, label: '' },
      views,
      window14.from,
      today,
    );

    const add = async () => {
      const entryId = await addEntry({ ...defaults, [primaryKey]: 1 });
      toast.show({
        message: `${tracker.name} +1`,
        actionLabel: 'Undo',
        onAction: async () => {
          await deleteEntry(entryId);
          await load();
        },
      });
    };

    const subtract = async () => {
      const entry = todays[0]?.entry;
      if (!entry) return;
      await deleteEntry(entry.id);
      await load();
      toast.show({
        message: `${tracker.name} −1`,
        actionLabel: 'Undo',
        onAction: async () => {
          await restoreEntry(entry, tracker.fields);
          await load();
        },
      });
    };

    return (
      <View style={{ gap: space.xl }}>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.md }}>
          <AppText size={40} weight="700" numeric style={{ fontSize: 72, lineHeight: 78 }}>
            {Math.round(value)}
          </AppText>
          <AppText size={13} weight="500" muted>
            {goal ? `of ${goal.target} today` : 'today'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.xl, marginTop: space.md }}>
            <Pressable
              onPress={subtract}
              accessibilityRole="button"
              accessibilityLabel="Subtract one"
              disabled={todays.length === 0}
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderColor: t.border,
                opacity: todays.length === 0 ? 0.4 : 1,
              }}
            >
              <Ionicons name="remove" size={36} color={t.text} />
            </Pressable>
            <Pressable
              onPress={add}
              accessibilityRole="button"
              accessibilityLabel="Add one"
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tracker.color,
                borderWidth: 1,
                borderColor: t.border,
              }}
            >
              <Ionicons name="add" size={40} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <SectionLabel>Last 14 days</SectionLabel>
          <Bars
            values={series.map((s) => s.value)}
            color={tracker.color}
            goal={goal?.target}
            highlightLast
          />
        </View>

        <GoalsStrip
          tracker={tracker}
          goals={goals}
          views={views}
          onAdd={openGoalSheet}
          onOpen={() => openGoalSheet()}
          suggestMetric={tracker.config.summaries?.[0]?.fieldKey ? metric : 'count'}
        />

        <View style={{ gap: space.sm }}>
          <SectionLabel>History</SectionLabel>
          <EntryTimeline tracker={tracker} entries={entries} />
        </View>
      </View>
    );
  };

  /* -------------------------------------------------------- quantity branch */

  const renderQuantity = () => {
    const metric = `sum:${primaryKey}`;
    const total = metricValue(metric, todays);
    const goal = dayRateGoal(metric);
    const progress = goal && goal.target > 0 ? total / goal.target : 0;
    const week = dailySeries(
      { agg: 'sum', fieldKey: primaryKey, label: '' },
      views,
      window7.from,
      today,
    );
    const quickValues = tracker.config.quickAdd?.values ?? [];

    const quickAdd = async (value: number) => {
      const entryId = await addEntry({ ...defaults, [primaryKey]: value });
      toast.show({
        message: `Added ${formatFieldValue(primary, value)}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await deleteEntry(entryId);
          await load();
        },
      });
    };

    return (
      <View style={{ gap: space.xl }}>
        <View style={{ alignItems: 'center', paddingTop: space.md }}>
          <Ring size={216} stroke={16} progress={progress} color={tracker.color}>
            <AppText size={40} weight="700" numeric>
              {formatQuantity(total, unit)}
            </AppText>
            <AppText size={13} weight="500" muted>
              {goal ? `of ${formatQuantity(goal.target, unit)} today` : 'today'}
            </AppText>
          </Ring>
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {quickValues.map((value) => (
            <Pressable
              key={value}
              onPress={() => quickAdd(value)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${formatFieldValue(primary, value)}`}
              style={{
                flex: 1,
                minHeight: 60,
                borderRadius: radius.lg,
                backgroundColor: tracker.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText size={17} weight="600" color="#fff" numeric>
                {`+${formatQuantity(value, unit)}`}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: '/entry/[trackerId]', params: { trackerId: tracker.id } })}
            accessibilityRole="button"
            accessibilityLabel="Custom amount"
            style={{
              flex: 1,
              minHeight: 60,
              borderRadius: radius.lg,
              borderWidth: 1.5,
              borderColor: t.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText size={17} weight="600">
              Other
            </AppText>
          </Pressable>
        </View>

        <View style={{ gap: space.sm }}>
          <SectionLabel>Today</SectionLabel>
          {todays.length > 0 ? (
            todays.map((view) => (
              <View
                key={view.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: TOUCH,
                  borderBottomWidth: 0.5,
                  borderBottomColor: t.border,
                }}
              >
                <AppText size={12} muted numeric style={{ width: 70 }}>
                  {formatTime(view.occurredAt)}
                </AppText>
                <Pressable
                  style={{ flex: 1, minHeight: TOUCH, justifyContent: 'center' }}
                  onPress={() =>
                    router.push({
                      pathname: '/entry/[trackerId]',
                      params: { trackerId: tracker.id, entryId: view.id ?? '' },
                    })
                  }
                >
                  <AppText size={15} numeric>
                    {formatFieldValue(primary, view.values[primaryKey])}
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() =>
                    view.entry &&
                    removeToday(view.entry, formatFieldValue(primary, view.values[primaryKey]) || 'entry')
                  }
                  accessibilityLabel="Remove this entry"
                  style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: space.sm }}
                >
                  <AppText size={13} weight="500" muted>
                    Remove
                  </AppText>
                </Pressable>
              </View>
            ))
          ) : (
            <AppText size={15} muted>
              Nothing yet today.
            </AppText>
          )}
        </View>

        <View style={{ gap: space.sm }}>
          <SectionLabel>This week</SectionLabel>
          <Bars
            values={week.map((w) => w.value)}
            color={tracker.color}
            goal={goal?.target}
            highlightLast
          />
        </View>

        <GoalsStrip
          tracker={tracker}
          goals={goals}
          views={views}
          onAdd={openGoalSheet}
          onOpen={() => openGoalSheet()}
          suggestMetric={metric}
        />
      </View>
    );
  };

  /* ------------------------------------------------------------- log branch */

  const renderLog = () => {
    const summaries = tracker.config.summaries ?? [];
    const summaryMetric = summaries[0]?.fieldKey ? `sum:${summaries[0].fieldKey}` : 'count';
    return (
      <View style={{ gap: space.xl }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xl, paddingTop: space.md }}>
          {summaries.map((spec, index) => {
            const summary = computeSummary(tracker, spec as never, todays);
            return (
              <View key={spec.label ?? index} style={{ gap: 2 }}>
                {index === 0 ? (
                  <AppText size={40} weight="700" numeric color={tracker.color}>
                    {summary.text}
                  </AppText>
                ) : (
                  <AppText size={24} weight="600" numeric>
                    {summary.text}
                  </AppText>
                )}
                <AppText size={13} weight="500" muted>
                  {`${summary.label} today`}
                </AppText>
              </View>
            );
          })}
        </View>

        {active ? (
          <Button
            label={`Log ${tracker.name}`}
            icon="add"
            color={tracker.color}
            onPress={() =>
              router.push({ pathname: '/entry/[trackerId]', params: { trackerId: tracker.id } })
            }
          />
        ) : null}

        {entries.length > 0 ? <Insights tracker={tracker} views={views} summaries={summaries as never} /> : null}

        <GoalsStrip
          tracker={tracker}
          goals={goals}
          views={views}
          onAdd={openGoalSheet}
          onOpen={() => openGoalSheet()}
          suggestMetric={summaryMetric}
        />

        <View style={{ gap: space.sm }}>
          <SectionLabel>History</SectionLabel>
          <EntryTimeline
            tracker={tracker}
            entries={entries}
            empty="Your history for this tracker will show up here."
          />
        </View>
      </View>
    );
  };

  /* ---------------------------------------------------------- rating branch */

  const renderRating = () => {
    const current = todays.length > 0 ? Number(todays[0].values[primaryKey]) || 0 : 0;
    const series = dailySeries(
      { agg: 'avg', fieldKey: primaryKey, label: '' },
      views,
      window14.from,
      today,
    );

    const rate = async (value: number) => {
      const existing = todays[0];
      if (existing?.entry) {
        await saveEntry({
          id: existing.entry.id,
          trackerId: tracker.id,
          data: { ...existing.values, [primaryKey]: value },
          occurredAt: existing.occurredAt,
          fields: tracker.fields,
        });
      } else {
        await addEntry({ ...defaults, [primaryKey]: value });
      }
      await load();
    };

    return (
      <View style={{ gap: space.xl }}>
        <View style={{ alignItems: 'center', gap: space.sm, paddingTop: space.md }}>
          <AppText size={13} weight="500" muted>
            {current > 0 ? `Today: ${current} of 5` : 'How is today?'}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => rate(star)}
                accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
                style={{
                  width: TOUCH + 8,
                  height: TOUCH + 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={star <= current ? 'star' : 'star-outline'}
                  size={44}
                  color={star <= current ? tracker.color : t.textMuted}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <SectionLabel>Last 14 days</SectionLabel>
          <Bars values={series.map((s) => s.value)} color={tracker.color} height={96} highlightLast />
        </View>

        <GoalsStrip
          tracker={tracker}
          goals={goals}
          views={views}
          onAdd={openGoalSheet}
          onOpen={() => openGoalSheet()}
          suggestMetric="count"
        />

        <View style={{ gap: space.sm }}>
          <SectionLabel>History</SectionLabel>
          <EntryTimeline tracker={tracker} entries={entries} />
        </View>
      </View>
    );
  };

  /* --------------------------------------------------------- session branch */

  const renderSession = () => {
    const metric = `sum:${primaryKey}`;
    const total = metricValue(metric, todays);
    const goal = dayRateGoal(metric);
    const series = dailySeries(
      { agg: 'sum', fieldKey: primaryKey, label: '' },
      views,
      window14.from,
      today,
    );
    const firstLogged = entries
      .map((e) => Number(e.data?.[primaryKey]))
      .find((n) => Number.isFinite(n) && n > 0);
    const chips = Array.from(
      new Set([...(firstLogged ? [firstLogged] : []), ...SESSION_PRESETS]),
    ).slice(0, 6);

    const logSession = async (minutes: number) => {
      const entryId = await addEntry({ ...defaults, [primaryKey]: minutes });
      toast.show({
        message: `${tracker.name}: ${formatDuration(minutes)}`,
        actionLabel: 'Undo',
        onAction: async () => {
          await deleteEntry(entryId);
          await load();
        },
      });
    };

    return (
      <View style={{ gap: space.xl }}>
        <View style={{ alignItems: 'center', gap: space.xs, paddingTop: space.md }}>
          <AppText size={40} weight="700" numeric>
            {total > 0 ? formatDuration(total) : '0 min'}
          </AppText>
          <AppText size={13} weight="500" muted>
            {goal ? `of ${formatDuration(goal.target)} today` : 'today'}
          </AppText>
        </View>

        <View style={{ gap: space.sm }}>
          <SectionLabel>Log a session</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {chips.map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => logSession(minutes)}
                accessibilityRole="button"
                accessibilityLabel={`Log ${formatDuration(minutes)}`}
                style={{
                  minHeight: 52,
                  minWidth: '30%',
                  flexGrow: 1,
                  borderRadius: radius.lg,
                  backgroundColor: tracker.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppText size={17} weight="600" color="#fff" numeric>
                  {formatDuration(minutes)}
                </AppText>
              </Pressable>
            ))}
            <Pressable
              onPress={() =>
                router.push({ pathname: '/entry/[trackerId]', params: { trackerId: tracker.id } })
              }
              accessibilityRole="button"
              style={{
                minHeight: 52,
                minWidth: '30%',
                flexGrow: 1,
                borderRadius: radius.lg,
                borderWidth: 1.5,
                borderColor: t.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText size={17} weight="600">
                Other
              </AppText>
            </Pressable>
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <SectionLabel>Last 14 days</SectionLabel>
          <Bars
            values={series.map((s) => s.value)}
            color={tracker.color}
            goal={goal?.target}
            highlightLast
          />
        </View>

        <GoalsStrip
          tracker={tracker}
          goals={goals}
          views={views}
          onAdd={openGoalSheet}
          onOpen={() => openGoalSheet()}
          suggestMetric={metric}
        />

        <View style={{ gap: space.sm }}>
          <SectionLabel>History</SectionLabel>
          <EntryTimeline tracker={tracker} entries={entries} />
        </View>
      </View>
    );
  };

  /* -------------------------------------------------------- subjects branch */

  const subjectFld = tracker.fields.find((f) => f.type === 'text' && f.required) ??
    tracker.fields.find((f) => f.type === 'text');
  const durationFld = tracker.fields.find((f) => f.type === 'duration');
  const subjectKey = subjectFld?.key ?? 'subject';
  const durationKey = durationFld?.key ?? 'duration';

  const subjects = Array.from(
    new Set([
      ...entries.map((e) => String(e.data?.[subjectKey] ?? '')).filter(Boolean),
      ...savedSubjects,
    ]),
  );

  const totalFor = (subject: string) =>
    entries
      .filter((e) => String(e.data?.[subjectKey]) === subject)
      .reduce((sum, e) => {
        const n = Number(e.data?.[durationKey]);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);

  const startTimer = async (subject: string) => {
    const state = { start: Date.now(), running: true };
    setTimers((prev) => ({ ...prev, [subject]: state }));
    await setSetting(`timer:${tracker.id}:${subject}`, JSON.stringify(state));
  };

  const stopTimer = async (subject: string) => {
    const state = timers[subject];
    if (!state?.running) return;
    const elapsedMin = Math.max(1, Math.round((Date.now() - state.start) / 60000));
    await addEntry({ ...defaults, [subjectKey]: subject, [durationKey]: elapsedMin });
    setTimers((prev) => ({ ...prev, [subject]: { start: 0, running: false } }));
    await removeSetting(`timer:${tracker.id}:${subject}`);
  };

  const addSubject = async () => {
    const name = newSubject.trim();
    if (!name) return;
    setNewSubject('');
    if (!subjects.includes(name)) {
      const next = [...savedSubjects, name];
      setSavedSubjects(next);
      await setSetting(`subjects:${tracker.id}`, JSON.stringify(next));
      setTimers((prev) => ({ ...prev, [name]: { start: 0, running: false } }));
    }
  };

  const renderSubjects = () => {
    const weekTotal = entries
      .filter((e) => e.day >= window7.from && e.day <= today)
      .reduce((sum, e) => {
        const n = Number(e.data?.[durationKey]);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);

    return (
      <View style={{ gap: space.xl }}>
        {subjects.length === 0 && Object.keys(timers).length === 0 ? (
          <AppText size={15} muted>
            Nothing yet.
          </AppText>
        ) : null}
        {[...new Set([...subjects, ...Object.keys(timers)])].map((subject) => {
          const state = timers[subject];
          const running = !!state?.running;
          const elapsed = running ? Math.floor((now - state.start) / 1000) : 0;
          const total = totalFor(subject);
          return (
            <View key={subject} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <AppText size={17} weight="600">{subject}</AppText>
                  <AppText size={13} muted>{`${formatDuration(total)} studied`}</AppText>
                </View>
                {running ? (
                  <View style={{ alignItems: 'center', gap: space.xs }}>
                    <AppText size={17} weight="600" numeric color={tracker.color}>
                      {`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`}
                    </AppText>
                    <Button label="Stop" color={tracker.color} onPress={() => stopTimer(subject)} style={{ minHeight: 40 }} />
                  </View>
                ) : (
                  <Button
                    label="Start"
                    icon="play"
                    color={tracker.color}
                    onPress={() => startTimer(subject)}
                    style={{ minHeight: 40 }}
                  />
                )}
              </View>
            </View>
          );
        })}

        <View style={{ gap: space.sm }}>
          <SectionLabel>New subject</SectionLabel>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <TextInput
              value={newSubject}
              onChangeText={setNewSubject}
              placeholder="Subject name"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt, flex: 1 }]}
            />
            <Button label="Start" color={tracker.color} onPress={addSubject} style={{ minHeight: TOUCH }} />
          </View>
        </View>

        <AppText size={15} muted>{`This week: ${formatDuration(weekTotal)}`}</AppText>

        <View style={{ gap: space.sm }}>
          <SectionLabel>History</SectionLabel>
          <EntryTimeline tracker={tracker} entries={entries} />
        </View>
      </View>
    );
  };

  const body =
    presentation === 'check'
      ? renderCheck()
      : presentation === 'count'
        ? renderCount()
        : presentation === 'quantity'
          ? renderQuantity()
          : presentation === 'rating'
            ? renderRating()
            : presentation === 'session'
              ? renderSession()
              : presentation === 'subjects'
                ? renderSubjects()
                : renderLog();

  return (
    <Screen padBottom={64}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          style={{
            width: TOUCH,
            height: TOUCH,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: -space.md,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={t.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText size={24} weight="600" numberOfLines={1}>
            {tracker.name}
          </AppText>
          {tracker.description ? (
            <AppText size={13} weight="500" muted numberOfLines={1}>
              {tracker.description}
            </AppText>
          ) : null}
        </View>
        <Pressable
          onPress={() => toast.show('Edit coming soon')}
          accessibilityLabel="Edit this Space"
          style={{
            width: TOUCH,
            height: TOUCH,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: -space.md,
          }}
        >
          <Ionicons name="create-outline" size={24} color={t.text} />
        </Pressable>
      </View>

      {!active ? (
        <View style={{ gap: space.sm, paddingVertical: space.sm }}>
          <AppText size={13} weight="500" color={t.warning}>
            {`${tracker.status === 'paused' ? 'Paused' : 'Archived'}. Your history is kept.`}
          </AppText>
          <Button
            label={tracker.status === 'paused' ? 'Resume tracking' : 'Restore'}
            icon="play"
            color={tracker.color}
            onPress={onResume}
          />
        </View>
      ) : null}

      {body}

      {schedule ? (
        <View style={{ gap: space.xs }}>
          <AppText size={13} weight="500" muted>
            {`Reminders${active ? '' : ' (off while not active)'}`}
          </AppText>
          <AppText size={15}>{describeScheduleRow(schedule)}</AppText>
        </View>
      ) : null}

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <AppText size={13} weight="500" muted>
          {`Manage · ${describeTrackerSchedule(tracker)}`}
        </AppText>
        <SwitchRow label="Show on Today" value={!!tracker.show_on_dashboard} onChange={onSetShowOnToday} />
        <AppText size={13} weight="500" muted>
          Layout
        </AppText>
        <ChipRow>
          {PRESENTATIONS.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={presentation === item.key}
              onPress={() => onLayoutChange(item.key)}
            />
          ))}
        </ChipRow>
        <AppText size={12} muted>
          {`${PRESENTATIONS.find((item) => item.key === presentation)?.blurb ?? ''}. The app picked this from your fields; change it any time.`}
        </AppText>
        {active ? (
          <Button label="Pause tracking" icon="pause" variant="secondary" onPress={onPause} />
        ) : null}
        {tracker.status !== 'archived' ? (
          <Button label="Archive" icon="archive-outline" variant="secondary" onPress={onArchive} />
        ) : null}
        <Button
          label="Delete permanently"
          icon="trash-outline"
          variant="ghost"
          color={t.danger}
          onPress={onDelete}
        />
      </View>

      <Modal visible={goalOpen} transparent animationType="fade" onRequestClose={() => setGoalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGoalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.surface, maxHeight: '92%' }]} onPress={() => {}}>
            <ScrollView style={{ maxHeight: 750 }}>
              <View style={{ gap: space.md }}>
                <AppText size={17} weight="700">
                  New goal
                </AppText>

                <View style={{ gap: space.xs }}>
                  <SectionLabel>Where does it belong?</SectionLabel>
                  <ChipRow>
                    <Chip label="This tracker" selected onPress={() => {}} />
                    <Chip label="Just life" selected={false} onPress={() => {}} />
                  </ChipRow>
                </View>

                <View style={{ gap: space.xs }}>
                  <SectionLabel>What kind of goal?</SectionLabel>
                  <ChipRow>
                    {(['rate', 'limit', 'total', 'manual'] as const).map((k) => (
                      <Chip
                        key={k}
                        label={k === 'rate' ? 'Reach at least' : k === 'limit' ? 'Stay under' : k === 'total' ? 'Build up to a total' : "I'll update it myself"}
                        selected={goalKind === k}
                        onPress={() => setGoalKind(k)}
                      />
                    ))}
                  </ChipRow>
                </View>

                {goalKind !== 'manual' ? (
                  <View style={{ gap: space.xs }}>
                    <SectionLabel>What should it measure?</SectionLabel>
                    <ChipRow>
                      <Chip
                        label={primaryKey ? `${primary?.label ?? primaryKey}: ${goalMetric}` : 'Count'}
                        selected={goalMetric !== null}
                        onPress={() => setGoalMetric(primaryKey ? `sum:${primaryKey}` : 'count')}
                      />
                      <Chip
                        label="I'll update it myself"
                        selected={goalMetric === null}
                        onPress={() => setGoalMetric(null as unknown as string)}
                      />
                    </ChipRow>
                  </View>
                ) : null}

                {goalKind !== 'manual' ? (
                  <View style={{ gap: space.xs }}>
                    <SectionLabel>Target</SectionLabel>
                    <TextInput
                      value={goalInput}
                      onChangeText={setGoalInput}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 3000"
                      placeholderTextColor={t.textMuted}
                      style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt }]}
                    />
                    <TextInput
                      value={goalUnit}
                      onChangeText={setGoalUnit}
                      placeholder={`Unit (optional), e.g. ${unit}`}
                      placeholderTextColor={t.textMuted}
                      style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt }]}
                    />
                  </View>
                ) : null}

                <View style={{ gap: space.xs }}>
                  <SectionLabel>How often?</SectionLabel>
                  <ChipRow>
                    {(['day', 'week', 'month', 'none'] as const).map((p) => (
                      <Chip
                        key={p}
                        label={p === 'day' ? 'Per day' : p === 'week' ? 'Per week' : p === 'month' ? 'Per month' : 'Overall'}
                        selected={goalPeriod === p}
                        onPress={() => setGoalPeriod(p)}
                      />
                    ))}
                  </ChipRow>
                </View>

                <View style={{ gap: space.xs }}>
                  <SectionLabel>Deadline (optional)</SectionLabel>
                  <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                    <TextInput
                      value={goalDeadline ?? ''}
                      onChangeText={(v) => setGoalDeadline(v || null)}
                      placeholder="YYYY-MM-DD or empty"
                      placeholderTextColor={t.textMuted}
                      style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt, flex: 1 }]}
                    />
                    {goalDeadline ? (
                      <Button label="Clear" variant="ghost" onPress={() => setGoalDeadline(null)} />
                    ) : null}
                  </View>
                </View>

                <View style={{ gap: space.xs }}>
                  <SectionLabel>Priority</SectionLabel>
                  <ChipRow>
                    {[0, 1, 2, 3, 4, 5].map((p) => (
                      <Chip
                        key={p}
                        label={String(p)}
                        selected={goalPriority === p}
                        onPress={() => setGoalPriority(p)}
                      />
                    ))}
                  </ChipRow>
                </View>

                <View style={{ gap: space.xs }}>
                  <SectionLabel>Name (optional)</SectionLabel>
                  <TextInput
                    value={goalName}
                    onChangeText={setGoalName}
                    placeholder="e.g. Drink 3 L of water"
                    placeholderTextColor={t.textMuted}
                    style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt }]}
                  />
                </View>

                <View style={{ gap: space.xs }}>
                  <SectionLabel>Notes (optional)</SectionLabel>
                  <TextInput
                    value={goalNotes}
                    onChangeText={setGoalNotes}
                    placeholder="Notes"
                    placeholderTextColor={t.textMuted}
                    multiline
                    style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt, minHeight: 80 }]}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button label="Cancel" variant="secondary" onPress={() => setGoalOpen(false)} style={{ flex: 1 }} />
                  <Button label="Save goal" onPress={saveGoal} style={{ flex: 1 }} />
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={customOpen} transparent animationType="fade" onRequestClose={() => setCustomOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCustomOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.surface }]} onPress={() => {}}>
            <AppText size={17} weight="700">
              Custom amount
            </AppText>
            <TextInput
              value={customValue}
              onChangeText={setCustomValue}
              keyboardType="numeric"
              placeholder={`Amount in ${unit}`}
              placeholderTextColor={t.textMuted}
              style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt }]}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Cancel" variant="secondary" onPress={() => setCustomOpen(false)} style={{ flex: 1 }} />
              <Button label="Add" onPress={addCustom} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  input: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
});
