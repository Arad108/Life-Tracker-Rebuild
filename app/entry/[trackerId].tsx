import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { AppText, Button, Card, Chip, useToast } from '../../src/ui/components';
import { useTheme, space, radius, TOUCH, GUTTER } from '../../src/ui/theme';
import { getTracker, listFields, listEntries, saveEntry, getEntry, deleteEntry } from '../../src/tracker/repository';
import { hasValue, toHHMM, formatHHMM } from '../../src/tracker/format';
import type { Tracker, TrackerEntry, TrackerField } from '../../src/tracker/types';

function Input(props: React.ComponentProps<typeof TextInput>) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.textMuted}
      {...props}
      style={[
        {
          minHeight: TOUCH,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.surface,
          color: t.text,
          paddingHorizontal: space.md,
          fontSize: 16,
        },
        props.multiline ? { minHeight: 96, textAlignVertical: 'top', paddingTop: space.md } : null,
        props.style,
      ]}
    />
  );
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="button"
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={30} color={n <= value ? t.warning : t.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

export default function EntryScreen() {
  const { trackerId, entryId } = useLocalSearchParams<{ trackerId: string; entryId?: string }>();
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();

  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [fields, setFields] = useState<TrackerField[]>([]);
  const [entry, setEntry] = useState<TrackerEntry | null>(null);
  const [recent, setRecent] = useState<TrackerEntry | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [occurredAt, setOccurredAt] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!trackerId) return;
    const tr = await getTracker(String(trackerId));
    setTracker(tr);
    if (!tr) {
      setLoading(false);
      return;
    }
    const f = await listFields(tr.id, false);
    setFields(f);
    const latest = await listEntries(tr.id, 1);
    setRecent(latest[0] ?? null);
    if (entryId) {
      const existing = await getEntry(String(entryId));
      setEntry(existing);
      if (existing) {
        setValues({ ...existing.data });
        setOccurredAt(existing.occurred_at);
      }
    } else {
      setValues({ ...(tr.config.defaults ?? {}) });
    }
    setLoading(false);
  }, [trackerId, entryId]);

  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(() => fields.filter((f) => !f.archived), [fields]);
  const primary = active.filter((f) => f.required);
  const optional = active.filter((f) => !f.required);
  const visible = showAll ? active : primary.length ? primary : active;

  const setValue = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: false }));
  };

  const sameAsLastTime = () => {
    if (!recent) return;
    setValues({ ...recent.data });
    toast.show('Filled from your last entry');
  };

  const save = async () => {
    if (!tracker) return;
    const nextErrors: Record<string, boolean> = {};
    for (const field of active) {
      if (field.required && !hasValue(values[field.key])) nextErrors[field.key] = true;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setShowAll(true);
      toast.show('Fill in the required fields');
      return;
    }
    await saveEntry({
      id: entry?.id,
      trackerId: tracker.id,
      data: values,
      occurredAt,
      fields,
    });
    toast.show(entry ? 'Entry updated' : 'Saved');
    router.back();
  };

  const remove = () => {
    if (!entry) return;
    Alert.alert('Delete this entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(entry.id);
          toast.show('Entry deleted');
          router.back();
        },
      },
    ]);
  };

  const setToday = () => {
    const now = new Date();
    const prev = new Date(occurredAt);
    now.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
    setOccurredAt(now.getTime());
  };

  const setNow = () => {
    const now = new Date();
    const prev = new Date(occurredAt);
    now.setFullYear(prev.getFullYear(), prev.getMonth(), prev.getDate());
    setOccurredAt(now.getTime());
  };

  const pickPhoto = async (field: TrackerField) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) setValue(field.key, result.assets[0].uri);
  };

  if (loading || !tracker) {
    return (
      <View style={[styles.flex, { backgroundColor: t.bg, padding: GUTTER }]}>
        <AppText muted>{tracker ? 'Loading…' : 'Not found'}</AppText>
      </View>
    );
  }

  const when = new Date(occurredAt);
  const whenLabel = `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} \u00B7 ${formatHHMM(toHHMM(when))}`;

  const renderField = (field: TrackerField) => {
    const value = values[field.key];
    const invalid = errors[field.key];
    const label = (
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <AppText size={13} muted weight="600">
          {field.label}
        </AppText>
        {field.required ? (
          <AppText size={13} color={t.danger} weight="600">
            *
          </AppText>
        ) : null}
      </View>
    );

    let control: React.ReactNode;
    switch (field.type) {
      case 'notes':
        control = (
          <Input
            value={typeof value === 'string' ? value : ''}
            onChangeText={(text) => setValue(field.key, text)}
            placeholder={field.label}
            multiline
          />
        );
        break;
      case 'boolean':
        control = (
          <Pressable
            onPress={() => setValue(field.key, !value)}
            style={{
              minHeight: TOUCH,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: t.border,
              backgroundColor: value ? `${tracker.color}26` : t.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingHorizontal: space.md,
            }}
          >
            <Ionicons
              name={value ? 'checkbox' : 'square-outline'}
              size={22}
              color={value ? tracker.color : t.textMuted}
            />
            <AppText size={16}>{value ? 'Yes' : 'No'}</AppText>
          </Pressable>
        );
        break;
      case 'rating':
        control = <Stars value={Number(value) || 0} onChange={(n) => setValue(field.key, n)} />;
        break;
      case 'select':
        control = (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {field.options.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={value === option}
                color={tracker.color}
                onPress={() => setValue(field.key, option)}
              />
            ))}
          </View>
        );
        break;
      case 'multiselect':
      case 'checklist': {
        const list = Array.isArray(value) ? (value as string[]) : [];
        control = (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {field.options.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={list.includes(option)}
                color={tracker.color}
                onPress={() =>
                  setValue(
                    field.key,
                    list.includes(option) ? list.filter((x) => x !== option) : [...list, option],
                  )
                }
              />
            ))}
          </View>
        );
        break;
      }
      case 'photo':
        control = (
          <View style={{ gap: space.sm }}>
            <Button
              label={value ? 'Change photo' : 'Choose photo'}
              variant="secondary"
              icon="image-outline"
              onPress={() => pickPhoto(field)}
            />
            {value ? (
              <AppText size={13} muted numberOfLines={1}>
                {String(value)}
              </AppText>
            ) : null}
          </View>
        );
        break;
      case 'date':
        control = (
          <View style={{ gap: space.sm }}>
            <Input
              value={typeof value === 'string' ? value : ''}
              onChangeText={(text) => setValue(field.key, text)}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Chip
                label="Today"
                color={tracker.color}
                onPress={() => setValue(field.key, new Date().toISOString().slice(0, 10))}
              />
            </View>
          </View>
        );
        break;
      case 'time':
        control = (
          <Input
            value={typeof value === 'string' ? value : ''}
            onChangeText={(text) => setValue(field.key, text)}
            placeholder="HH:MM"
            keyboardType="numbers-and-punctuation"
          />
        );
        break;
      case 'number':
      case 'decimal':
      case 'amount':
      case 'percentage':
      case 'counter':
      case 'duration':
        control = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Input
              value={value == null || value === '' ? '' : String(value)}
              onChangeText={(text) => {
                const clean = text.replace(/[^0-9.,-]/g, '').replace(',', '.');
                setValue(field.key, clean === '' ? '' : Number(clean));
              }}
              placeholder="0"
              keyboardType="decimal-pad"
              style={{ flex: 1 }}
            />
            {field.unit ? <AppText muted>{field.unit}</AppText> : null}
            {field.type === 'duration' ? <AppText muted>min</AppText> : null}
          </View>
        );
        break;
      default:
        control = (
          <Input
            value={typeof value === 'string' ? value : value == null ? '' : String(value)}
            onChangeText={(text) => setValue(field.key, text)}
            placeholder={field.label}
          />
        );
    }

    return (
      <View key={field.key} style={{ gap: space.sm }}>
        {label}
        {control}
        {invalid ? (
          <AppText size={12} color={t.danger}>
            Required
          </AppText>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <ScrollView
        contentContainerStyle={{ padding: GUTTER, paddingBottom: 40, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={t.text} />
          </Pressable>
          <AppText size={22} weight="700">
            {entry ? 'Edit' : 'Log'}
          </AppText>
        </View>

        {!entry && recent ? (
          <Button label="Same as last time" variant="secondary" icon="repeat" onPress={sameAsLastTime} />
        ) : null}

        <View style={{ gap: space.lg }}>{visible.map(renderField)}</View>

        {optional.length > 0 && !showAll ? (
          <Pressable onPress={() => setShowAll(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText size={14} color={t.text} style={{ textDecorationLine: 'underline' }}>
              More fields ({optional.length})
            </AppText>
          </Pressable>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <AppText size={15} style={{ flex: 1 }}>
            {whenLabel}
          </AppText>
          <Pressable
            onPress={setToday}
            style={styles.iconButton}
            accessibilityLabel="Set today"
          >
            <Ionicons name="calendar-outline" size={22} color={t.textMuted} />
          </Pressable>
          <Pressable onPress={setNow} style={styles.iconButton} accessibilityLabel="Set current time">
            <Ionicons name="time-outline" size={22} color={t.textMuted} />
          </Pressable>
        </View>

        <Button label={entry ? 'Save changes' : 'Save'} onPress={save} color={tracker.color} />
        {entry ? (
          <Button label="Delete entry" icon="trash-outline" variant="ghost" color={t.danger} onPress={remove} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', marginLeft: -space.md },
  iconButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
});
