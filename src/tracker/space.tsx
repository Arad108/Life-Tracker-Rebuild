import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { AppText, Card, Chip, ChipRow, IconBadge, SectionHeader } from '../ui/components';
import { useTheme, space } from '../ui/theme';
import {
  activeDayCount,
  aggregate,
  breakdown,
  dailySeries,
  formatDayLabel,
  formatDayShort,
  formatSummaryValue,
  formatTime,
  entryDetails,
  entryTitle,
  periodRange,
  type EntryView,
  type GoalRow,
  type GoalView,
  type SummarySpec,
  type TrackerWithFields,
  goalViews,
} from './format';
import type { TrackerEntry } from './types';
import { dayKey } from './dates';

/* ---------------------------------------------------------------------- Ring */

export function Ring({
  size = 120,
  stroke = 12,
  progress,
  color,
  children,
}: {
  size?: number;
  stroke?: number;
  progress: number;
  color: string;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const half = size / 2;
  const p = Math.max(0, Math.min(1, progress));
  const angle = p * 360;
  const rightRotate = angle <= 180 ? angle : 180;
  const leftRotate = angle > 180 ? angle - 180 : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: stroke,
          borderColor: t.surfaceAlt,
        }}
      />
      {p > 0 ? (
        <>
          <View style={{ position: 'absolute', top: 0, left: half, width: half, height: size, overflow: 'hidden' }}>
            <View
              style={{
                width: size,
                height: size,
                borderRadius: half,
                borderWidth: stroke,
                borderColor: color,
                marginLeft: -half,
                transform: [{ rotate: `${rightRotate}deg` }],
              }}
            />
          </View>
          {angle > 180 ? (
            <View style={{ position: 'absolute', top: 0, left: 0, width: half, height: size, overflow: 'hidden' }}>
              <View
                style={{
                  width: size,
                  height: size,
                  borderRadius: half,
                  borderWidth: stroke,
                  borderColor: color,
                  transform: [{ rotate: `${leftRotate}deg` }],
                }}
              />
            </View>
          ) : null}
        </>
      ) : null}
      {children}
    </View>
  );
}

/* ---------------------------------------------------------------------- Bars */

export function Bars({
  values,
  color,
  height = 88,
  goal,
  highlightLast,
}: {
  values: number[];
  color: string;
  height?: number;
  goal?: number | null;
  highlightLast?: boolean;
}) {
  const t = useTheme();
  const max = Math.max(0, ...values, goal ?? 0, 1);
  const gap = values.length > 14 ? 2 : 6;
  const lastIndex = values.length - 1;
  return (
    <View style={{ height }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap }}>
        {values.map((value, index) => {
          const filled = value > 0;
          const barHeight = filled ? Math.max(3, (value / max) * height) : 3;
          const dim = !!highlightLast && index === lastIndex && filled;
          return (
            <View key={index} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              <View
                style={{
                  height: barHeight,
                  borderRadius: 3,
                  backgroundColor: filled ? color : t.surfaceAlt,
                  opacity: dim ? 0.55 : 1,
                }}
              />
            </View>
          );
        })}
      </View>
      {goal != null && goal > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: (goal / max) * height,
            borderTopWidth: 1,
            borderStyle: 'dashed',
            borderColor: t.textMuted,
            opacity: 0.6,
          }}
        />
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- GoalsStrip */

export function GoalsStrip({
  tracker,
  goals,
  views,
  onAdd,
  onOpen,
  suggestMetric,
  style,
}: {
  tracker: TrackerWithFields;
  goals: GoalRow[];
  views: EntryView[];
  onAdd: (suggestMetric?: string) => void;
  onOpen?: (goalId: string) => void;
  suggestMetric?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const rows: GoalView[] = goalViews(tracker, goals, views, dayKey());
  return (
    <View style={[{ gap: space.sm }, style]}>
      <AppText size={15} weight="600" muted>
        Goals
      </AppText>
      {rows.map((row) => (
        <Pressable
          key={row.goal.id}
          onPress={() => onOpen?.(row.goal.id)}
          style={{ gap: 6, paddingVertical: space.xs, minHeight: 56, justifyContent: 'center' }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <AppText size={15} numberOfLines={1} style={{ flex: 1 }}>
              {row.goal.title}
            </AppText>
            <AppText
              size={13}
              numberOfLines={1}
              color={row.progress.over > 0 ? t.danger : row.progress.behind ? t.warning : t.textMuted}
            >
              {row.line}
            </AppText>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.max(0, Math.min(1, row.progress.fraction)) * 100}%`,
                height: '100%',
                backgroundColor: row.progress.over > 0 ? t.danger : tracker.color,
              }}
            />
          </View>
        </Pressable>
      ))}
      <Pressable
        onPress={() => onAdd(suggestMetric)}
        accessibilityRole="button"
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <AppText size={15} color={t.text} style={{ textDecorationLine: 'underline' }}>
          {rows.length === 0 ? 'Set a goal (optional)' : 'Add another goal'}
        </AppText>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------- EntryTimeline */

export function EntryRow({
  tracker,
  entry,
  onPress,
}: {
  tracker: TrackerWithFields;
  entry: TrackerEntry;
  onPress?: () => void;
}) {
  const details = entryDetails(tracker, entry);
  return (
    <Card
      onPress={onPress}
      style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md }}
    >
      <IconBadge icon={tracker.icon} color={tracker.color} size={40} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="600" numberOfLines={1}>
          {entryTitle(tracker, entry)}
        </AppText>
        {details ? (
          <AppText size={13} muted numberOfLines={2}>
            {details}
          </AppText>
        ) : null}
      </View>
      <AppText size={13} muted>
        {formatTime(entry.occurred_at)}
      </AppText>
    </Card>
  );
}

export function EntryTimeline({
  tracker,
  entries,
  empty,
}: {
  tracker: TrackerWithFields;
  entries: TrackerEntry[];
  empty?: string;
}) {
  const router = useRouter();
  const groups = React.useMemo(() => {
    const map = new Map<string, TrackerEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.day) ?? [];
      list.push(entry);
      map.set(entry.day, list);
    }
    return Array.from(map.entries());
  }, [entries]);

  if (groups.length === 0) {
    return (
      <AppText size={15} muted>
        {empty ?? 'Nothing logged yet.'}
      </AppText>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {groups.map(([day, list]) => (
        <View key={day} style={{ gap: space.sm }}>
          <AppText size={13} muted>
            {formatDayLabel(day)}
          </AppText>
          {list.map((entry) => (
            <EntryRow
              key={entry.id}
              tracker={tracker}
              entry={entry}
              onPress={() =>
                router.push({ pathname: '/entry/[trackerId]', params: { trackerId: tracker.id, entryId: entry.id } })
              }
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ Insights */

function BreakdownBars({
  items,
  color,
  tracker,
  spec,
}: {
  items: { label: string; value: number }[];
  color: string;
  tracker: TrackerWithFields;
  spec: SummarySpec;
}) {
  const t = useTheme();
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <View style={{ gap: space.sm }}>
      {items.map((item) => (
        <View key={item.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <AppText size={13} numberOfLines={1} style={{ flex: 1 }}>
              {item.label}
            </AppText>
            <AppText size={13} muted>
              {formatSummaryValue(tracker, spec, item.value)}
            </AppText>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
            <View
              style={{ width: `${(item.value / max) * 100}%`, height: '100%', backgroundColor: color }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Insights({
  tracker,
  views,
  summaries,
}: {
  tracker: TrackerWithFields;
  views: EntryView[];
  summaries: SummarySpec[];
}) {
  const t = useTheme();
  const [period, setPeriod] = React.useState<'7d' | '30d'>('7d');
  const today = dayKey();
  const range = periodRange(period, today);
  const inRange = views.filter((v) => v.day >= range.from && v.day <= range.to);
  const spec = summaries[0];
  if (!spec) return null;

  const series = dailySeries(spec, inRange, range.from, range.to);
  const byField = (tracker.fields ?? []).find(
    (f) =>
      !f.archived &&
      (f.type === 'select' || f.type === 'multiselect') &&
      f.key !== spec.where?.fieldKey,
  );
  const slices = byField ? breakdown(inRange, spec, byField.key) : [];
  const loggedDays = activeDayCount(inRange);

  return (
    <View style={{ gap: space.sm }}>
      <SectionHeader title="Insights" />
      <ChipRow>
        <Chip label="Last 7 days" selected={period === '7d'} color={tracker.color} onPress={() => setPeriod('7d')} />
        <Chip label="Last 30 days" selected={period === '30d'} color={tracker.color} onPress={() => setPeriod('30d')} />
      </ChipRow>
      <Card style={{ gap: space.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xl }}>
          {summaries.map((summary) => {
            const value = aggregate(summary, inRange);
            const perDay =
              (summary.agg === 'sum' || summary.agg === 'count') && value > 0
                ? value / range.days
                : null;
            return (
              <View key={summary.label}>
                <AppText size={22} weight="700">
                  {formatSummaryValue(tracker, summary, value)}
                </AppText>
                <AppText size={12} muted>
                  {summary.label}
                  {perDay != null
                    ? ` \u00B7 ${formatSummaryValue(tracker, summary, Math.round(perDay * 10) / 10)}/day`
                    : ''}
                </AppText>
              </View>
            );
          })}
        </View>
        <View style={{ gap: 6 }}>
          <Bars values={series.map((s) => s.value)} color={tracker.color} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText size={12} muted>
              {formatDayShort(range.from)}
            </AppText>
            <AppText size={12} muted>
              {formatDayShort(range.to)}
            </AppText>
          </View>
        </View>
        <AppText size={13} muted>
          Logged on {loggedDays} of {range.days} days
        </AppText>
        {slices.length > 0 && byField ? (
          <View style={{ gap: space.sm }}>
            <AppText size={13} weight="700" muted>
              BY {byField.label.toUpperCase()}
            </AppText>
            <BreakdownBars items={slices} color={tracker.color} tracker={tracker} spec={spec} />
          </View>
        ) : null}
      </Card>
    </View>
  );
}
