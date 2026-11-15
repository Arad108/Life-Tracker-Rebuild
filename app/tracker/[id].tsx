import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Screen, ScreenHeader, AppText, Card, Button, Chip, ChipRow, IconBadge, ProgressBar, SwitchRow, useToast } from '../../src/ui/components';
import { useTheme, space, radius, TOUCH, GUTTER } from '../../src/ui/theme';
import {
  getTracker,
  listFields,
  listEntries,
  saveEntry,
  updateTracker,
  deleteTracker,
  getScheduleForTracker,
  getSetting,
  setSetting,
  removeSetting,
} from '../../src/tracker/repository';
import { makeDriver } from '../../src/db';
import { dayKey, daysBack } from '../../src/tracker/dates';
import { detectPresentation, primaryField } from '../../src/tracker/presentation';
import { PRESENTATIONS, type Tracker, type TrackerField } from '../../src/tracker/types';

function Ring({ size = 216, stroke = 16, progress, color, trackColor, children }: {
  size?: number; stroke?: number; progress: number; color: string; trackColor: string; children?: React.ReactNode;
}) {
  const half = size / 2;
  const p = Math.max(0, Math.min(1, progress));
  const angle = p * 360;
  const rightRotate = angle <= 180 ? angle : 180;
  const leftRotate = angle > 180 ? angle - 180 : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: trackColor }} />
      <View style={{ position: 'absolute', top: 0, left: half, width: half, height: size, overflow: 'hidden' }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: color, marginLeft: -half, transform: [{ rotate: `${rightRotate}deg` }] }} />
      </View>
      {angle > 180 ? (
        <View style={{ position: 'absolute', top: 0, left: 0, width: half, height: size, overflow: 'hidden' }}>
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: color, transform: [{ rotate: `${leftRotate}deg` }] }} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

export default function TrackerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();

  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [fields, setFields] = useState<TrackerField[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<string>('No set frequency');
  const [loading, setLoading] = useState(true);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const tr = await getTracker(String(id));
    setTracker(tr);
    if (!tr) { setLoading(false); return; }
    const f = await listFields(tr.id, false);
    setFields(f);
    const e = await listEntries(tr.id, 200);
    setEntries(e);
    const d = makeDriver();
    const g = await d.getAllAsync<any>('SELECT * FROM goals WHERE space_key = ? AND status = ?', [`tracker:${tr.id}`, 'active']);
    setGoals(g || []);
    const sch = await getScheduleForTracker(tr.id);
    setScheduleSummary(sch ? sch.kind : 'No set frequency');
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const [newSubject, setNewSubject] = useState('');
  const [timers, setTimers] = useState<Record<string, { start: number; running: boolean }>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading || !tracker) {
    return (
      <Screen>
        <AppText muted>Loading…</AppText>
      </Screen>
    );
  }

  const shape = { config: tracker.config, fields };
  const presentation = detectPresentation(shape as any);
  const primary = primaryField(shape as any);
  const primaryKey = primary?.key ?? '';
  const today = dayKey();
  const todays = entries.filter((e: any) => e.day === today);
  const todayTotal = todays.reduce((s: number, e: any) => {
    const v = e.data?.[primaryKey];
    const n = typeof v === 'number' ? v : Number(v);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  const weekDays = daysBack(today, 7);
  const weekValues = weekDays.map((d) => {
    const dayEntries = entries.filter((e: any) => e.day === d);
    const v = dayEntries.reduce((s: number, e: any) => {
      const val = e.data?.[primaryKey];
      const n = typeof val === 'number' ? val : Number(val);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);
    return { day: d, value: v };
  });
  const weekMax = Math.max(1, ...weekValues.map((w) => w.value));
  const goal = tracker.config.goal ?? (goals.length ? { target: goals[0].target, unit: goals[0].unit, period: goals[0].period, title: goals[0].title } : undefined);
  const goalTarget = goal ? Number(goal.target) : 0;
  const goalProgress = goalTarget > 0 ? todayTotal / goalTarget : 0;

  const quickValues = tracker.config.quickAdd?.values ?? [];

  const liveDefaults = (tracker.config.defaults ?? {}) as Record<string, unknown>;
  const subjectFld = fields.find((f) => f.key === (tracker.config.titleFieldKey ?? 'subject')) ?? fields.find((f) => f.type === 'text');
  const durationFld = fields.find((f) => f.type === 'duration');
  const subjectKey = subjectFld?.key ?? 'subject';
  const durationKey = durationFld?.key ?? 'duration';

  const subjects = Array.from(new Set(entries.map((e: any) => String(e.data?.[subjectKey] ?? '')).filter(Boolean)));

  useEffect(() => {
    // load timer states
    (async () => {
      const out: Record<string, { start: number; running: boolean }> = {};
      for (const s of subjects) {
        const v = await getSetting(`timer:${tracker.id}:${s}`);
        if (v) { try { out[s] = JSON.parse(v); } catch {} }
      }
      setTimers(out);
    })();
  }, [tracker.id, subjects.join('|')]);

  const totalFor = (subject: string) => entries
    .filter((e: any) => String(e.data?.[subjectKey]) === subject)
    .reduce((s: number, e: any) => { const n = Number(e.data?.[durationKey]); return s + (Number.isFinite(n) ? n : 0); }, 0);

  const startTimer = async (subject: string) => {
    const state = { start: Date.now(), running: true };
    setTimers((p) => ({ ...p, [subject]: state }));
    await setSetting(`timer:${tracker.id}:${subject}`, JSON.stringify(state));
  };

  const stopTimer = async (subject: string) => {
    const st = timers[subject];
    if (!st?.running) return;
    const elapsedMin = Math.max(1, Math.round((Date.now() - st.start) / 60000));
    const data: Record<string, unknown> = { ...liveDefaults, [subjectKey]: subject, [durationKey]: elapsedMin };
    await saveEntry({ trackerId: tracker.id, data, occurredAt: Date.now(), fields });
    const state = { start: 0, running: false };
    setTimers((p) => ({ ...p, [subject]: state }));
    await removeSetting(`timer:${tracker.id}:${subject}`);
    toast.show(`Logged ${elapsedMin} min for ${subject}`);
    await load();
  };

  const addSubject = async () => {
    const name = newSubject.trim();
    if (!name) return;
    setNewSubject('');
    if (!subjects.includes(name)) {
      // create a starter entry? Instead just track via timer; add to list by setting timer state placeholder
      setTimers((p) => ({ ...p, [name]: { start: 0, running: false } }));
    }
    toast.show(`Added ${name}`);
  };

  const doQuickAdd = async (value: number) => {
    const data: Record<string, unknown> = { ...liveDefaults, [primaryKey]: value };
    await saveEntry({ trackerId: tracker.id, data, occurredAt: Date.now(), fields });
    toast.show(`Added ${value} ${primary?.unit ?? ''}`.trim());
    await load();
  };

  const doCustomAdd = async () => {
    const n = Number(customValue);
    if (!Number.isFinite(n)) { toast.show('Enter a number'); return; }
    const data: Record<string, unknown> = { ...liveDefaults, [primaryKey]: n };
    await saveEntry({ trackerId: tracker.id, data, occurredAt: Date.now(), fields });
    toast.show(`Added ${n} ${primary?.unit ?? ''}`.trim());
    setCustomOpen(false);
    setCustomValue('');
    await load();
  };

  const onSetShowOnToday = async (next: boolean) => {
    await updateTracker(tracker.id, { show_on_dashboard: next ? 1 : 0 });
    await load();
  };

  const onLayoutChange = async (key: string) => {
    await updateTracker(tracker.id, { config: { ...tracker.config, presentation: key as any } });
    await load();
  };

  const onPause = async () => {
    await updateTracker(tracker.id, { status: 'paused' });
    toast.show('Paused');
    await load();
  };

  const onArchive = () => {
    Alert.alert('Archive this Space?', 'It disappears from Today and stops reminders. All history is kept and you can restore it any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', onPress: async () => { await updateTracker(tracker.id, { status: 'archived' }); router.back(); } },
    ]);
  };

  const onDelete = () => {
    Alert.alert('Delete permanently?', `This erases "${tracker.name}" and all ${entries.length} of its entries. This cannot be undone. Archive it instead if you might want it later.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete forever', style: 'destructive', onPress: async () => { await deleteTracker(tracker.id); router.back(); } },
    ]);
  };

  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const unit = primary?.unit ?? '';

  return (
    <Screen padBottom={64}>
      <ScreenHeader
        title={tracker.name}
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => toast.show('Edit coming soon')} accessibilityLabel="Edit" style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="create-outline" size={22} color={t.text} />
          </Pressable>
        }
      />

      {presentation === 'subjects' ? (
        <>
          {subjects.length === 0 && Object.keys(timers).length === 0 ? (
            <Card><AppText muted>No subjects yet. Add one below.</AppText></Card>
          ) : null}
          {[...new Set([...subjects, ...Object.keys(timers)])].map((subject) => {
            const st = timers[subject];
            const running = !!st?.running;
            const elapsed = running ? Math.floor((now - st.start) / 1000) : 0;
            const total = totalFor(subject);
            return (
              <Card key={subject} style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <IconBadge icon={tracker.icon} color={tracker.color} size={40} />
                  <View style={{ flex: 1 }}>
                    <AppText size={16} weight="700">{subject}</AppText>
                    <AppText size={13} muted>{total} min studied</AppText>
                  </View>
                  {running ? (
                    <View style={{ alignItems: 'center' }}>
                      <AppText size={13} numeric weight="600" color={tracker.color}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</AppText>
                      <Button label="Stop" variant="primary" color={tracker.color} onPress={() => stopTimer(subject)} style={{ minHeight: 40 }} />
                    </View>
                  ) : (
                    <Button label="Start" variant="primary" color={tracker.color} icon="play" onPress={() => startTimer(subject)} style={{ minHeight: 40 }} />
                  )}
                </View>
              </Card>
            );
          })}

          <Card style={{ gap: space.sm }}>
            <AppText size={13} weight="700" muted>Add a subject</AppText>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <TextInput
                value={newSubject}
                onChangeText={setNewSubject}
                placeholder="Subject name"
                placeholderTextColor={t.textMuted}
                style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt, flex: 1 }]}
              />
              <Button label="Add" onPress={addSubject} style={{ minHeight: TOUCH }} />
            </View>
          </Card>

          <Card style={{ gap: space.sm }}>
            <AppText size={13} weight="700" muted>History</AppText>
            {entries.length === 0 ? (
              <AppText size={14} muted>No sessions yet.</AppText>
            ) : (
              entries.slice(0, 20).map((e: any) => (
                <View key={e.id} style={styles.todayRow}>
                  <AppText size={13} muted numeric style={{ width: 90 }}>{new Date(e.occurred_at).toLocaleDateString()}</AppText>
                  <AppText size={15} style={{ flex: 1 }}>{e.data?.[subjectKey]}</AppText>
                  <AppText size={15} numeric>{e.data?.[durationKey]} min</AppText>
                </View>
              ))
            )}
          </Card>
        </>
      ) : presentation === 'quantity' ? (
        <>
          <View style={{ alignItems: 'center', paddingVertical: space.lg }}>
            <Ring size={216} stroke={16} progress={goalProgress || (goalTarget ? todayTotal / Math.max(goalTarget, 1) : todayTotal > 0 ? 1 : 0)} color={tracker.color} trackColor={t.surfaceAlt}>
              <View style={{ alignItems: 'center' }}>
                <AppText size={34} weight="700" numeric>{todayTotal}{unit ? ` ${unit}` : ''}</AppText>
                <AppText size={13} muted>{goalTarget > 0 ? `of ${goalTarget} ${unit} today` : 'today'}</AppText>
              </View>
            </Ring>
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {quickValues.map((v: number) => (
              <Pressable key={v} onPress={() => doQuickAdd(v)} style={[styles.quickBtn, { backgroundColor: tracker.color }]}>
                <AppText size={15} weight="700" color="#fff">{`+${v} ${unit}`}</AppText>
              </Pressable>
            ))}
            <Pressable onPress={() => setCustomOpen(true)} style={[styles.quickBtn, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: t.border }]}>
              <AppText size={15} weight="700">Other</AppText>
            </Pressable>
          </View>

          <Card style={{ gap: space.sm }}>
            <AppText size={13} weight="700" muted>Today</AppText>
            {todays.length === 0 ? (
              <AppText size={14} muted>Nothing yet today.</AppText>
            ) : (
              todays.map((e: any) => (
                <View key={e.id} style={styles.todayRow}>
                  <AppText size={13} muted numeric style={{ width: 70 }}>{formatTime(e.occurred_at)}</AppText>
                  <Pressable style={{ flex: 1, minHeight: TOUCH, justifyContent: 'center' }} onPress={() => router.push({ pathname: '/entry/[trackerId]', params: { trackerId: tracker.id, entryId: e.id } })}>
                    <AppText size={15} numeric>{e.data?.[primaryKey]} {unit}</AppText>
                  </Pressable>
                  <Pressable onPress={() => { /* remove */ }} accessibilityLabel="Remove this entry" style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: space.sm }}>
                    <AppText size={13} muted>Remove</AppText>
                  </Pressable>
                </View>
              ))
            )}
          </Card>

          <Card style={{ gap: space.sm }}>
            <AppText size={13} weight="700" muted>This week</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 }}>
              {weekValues.map((w, i) => {
                const h = weekMax > 0 ? (w.value / weekMax) * 70 : 0;
                const isToday = w.day === today;
                return (
                  <View key={w.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <View style={{ width: '100%', height: Math.max(4, h), borderRadius: 4, backgroundColor: isToday ? tracker.color : `${tracker.color}66` }} />
                    <AppText size={10} muted>{['S','M','T','W','T','F','S'][new Date(w.day).getDay()]}</AppText>
                  </View>
                );
              })}
            </View>
          </Card>

          <Card style={{ gap: space.sm }}>
            <AppText size={13} weight="700" muted>Goals</AppText>
            {goal ? (
              <>
                <AppText size={14} weight="600">{(goal as any).title || `${tracker.name}: at least ${goal.target} ${goal.unit} per ${goal.period}`}</AppText>
                <AppText size={13} muted>{todayTotal} of {goalTarget} {unit} today</AppText>
                <ProgressBar value={goalProgress} color={tracker.color} />
                <Pressable onPress={() => toast.show('Add another goal')}><AppText size={13} weight="700" color={tracker.color}>Add another goal</AppText></Pressable>
              </>
            ) : (
              <Pressable onPress={() => toast.show('Set a goal (optional)')}><AppText size={13} weight="700" color={tracker.color}>Set a goal (optional)</AppText></Pressable>
            )}
          </Card>
        </>
      ) : (
        <Card><AppText muted>Full log view coming soon.</AppText></Card>
      )}

      {/* Shared footer */}
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <AppText size={13} weight="700" muted>{`Manage · ${scheduleSummary}`}</AppText>
        <SwitchRow label="Show on Today" value={!!tracker.show_on_dashboard} onChange={onSetShowOnToday} />
        <AppText size={13} weight="700" muted>Layout</AppText>
        <ChipRow>
          {PRESENTATIONS.map((pr) => (
            <Chip key={pr.key} label={pr.label} selected={presentation === pr.key} onPress={() => onLayoutChange(pr.key)} />
          ))}
        </ChipRow>
        <AppText size={12} muted>
          {`${PRESENTATIONS.find((p) => p.key === presentation)?.blurb ?? ''}. The app picked this from your fields; change it any time.`}
        </AppText>
        {tracker.status !== 'paused' ? (
          <Button label="Pause tracking" variant="secondary" icon="pause" onPress={onPause} />
        ) : (
          <Button label="Resume tracking" variant="secondary" icon="play" onPress={async () => { await updateTracker(tracker.id, { status: 'active' }); await load(); }} />
        )}
        {tracker.status !== 'archived' ? (
          <Button label="Archive" variant="secondary" icon="archive-outline" onPress={onArchive} />
        ) : null}
        <Button label="Delete permanently" variant="ghost" icon="trash-outline" color={t.danger} onPress={onDelete} />
      </View>

      <Modal visible={customOpen} transparent animationType="fade" onRequestClose={() => setCustomOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCustomOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: t.surface }]} onPress={() => {}}>
            <AppText size={17} weight="700">Custom amount</AppText>
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
              <Button label="Add" onPress={doCustomAdd} style={{ flex: 1 }} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  quickBtn: {
    flex: 1,
    minWidth: 90,
    minHeight: 60,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2C33',
  },
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
