import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Screen, AppText, Button, Chip, ChipRow, useToast } from '../../src/ui/components';
import { useTheme, space, radius, TOUCH } from '../../src/ui/theme';
import {
  getTracker,
  listFields,
  updateTracker,
  deleteTracker,
  saveField,
  setFieldArchived,
  deleteField,
  moveField,
  listEntries,
} from '../../src/tracker/repository';
import { makeDriver } from '../../src/db';
import { PRESENTATIONS } from '../../src/tracker/types';
import type { Tracker, TrackerField } from '../../src/tracker/types';

const ICONS = ['star', 'book', 'water', 'fitness', 'heart', 'leaf', 'cafe', 'bicycle', 'musical-notes', 'code-slash'];
const COLORS = ['#2B8EF0', '#1F9D6B', '#E5533D', '#C2738A', '#7C5CE0', '#4C6FFF', '#16A34A', '#E08A1E', '#F07272', '#3DD598'];

export default function TrackerEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();

  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [fields, setFields] = useState<TrackerField[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('star');
  const [color, setColor] = useState('#2B8EF0');
  const [presentation, setPresentation] = useState('check');
  const [showOnToday, setShowOnToday] = useState(true);
  const [status, setStatus] = useState('active');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');

  const load = useCallback(async () => {
    if (!id) return;
    const tr = await getTracker(String(id));
    if (!tr) return;
    setTracker(tr);
    setName(tr.name);
    setIcon(tr.icon);
    setColor(tr.color);
    setPresentation((tr.config?.presentation as string) ?? 'check');
    setShowOnToday(!!tr.show_on_dashboard);
    setStatus(tr.status);
    const f = await listFields(tr.id, true);
    setFields(f);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!tracker) return;
    if (!name.trim()) {
      toast.show('Name is required');
      return;
    }
    await updateTracker(tracker.id, {
      name: name.trim(),
      icon,
      color,
      status: status as 'active' | 'paused' | 'archived',
      show_on_dashboard: showOnToday ? 1 : 0,
      config: { ...tracker.config, presentation: presentation as never },
    });
    toast.show('Saved');
    await load();
  };

  const archive = async () => {
    if (!tracker) return;
    await updateTracker(tracker.id, { status: 'archived' });
    router.back();
  };

  const restore = async () => {
    if (!tracker) return;
    await updateTracker(tracker.id, { status: 'active' });
    await load();
  };

  const remove = () => {
    if (!tracker) return;
    Alert.alert('Delete permanently?', `This erases "${tracker.name}" and all its entries.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete forever',
        style: 'destructive',
        onPress: async () => {
          await deleteTracker(tracker.id);
          router.back();
        },
      },
    ]);
  };

  const addField = async () => {
    if (!tracker || !newFieldName.trim()) return;
    await saveField(tracker.id, {
      label: newFieldName.trim(),
      type: newFieldType as never,
    });
    setNewFieldName('');
    await load();
  };

  const toggleArchiveField = async (field: TrackerField) => {
    await setFieldArchived(field.id, !field.archived);
    await load();
  };

  const removeField = async (field: TrackerField) => {
    if (!tracker) return;
    const entries = await listEntries(tracker.id, 1);
    if (entries.length > 0) {
      Alert.alert('Cannot delete', 'Field types cannot be changed or deleted once history exists.');
      return;
    }
    await deleteField(field.id);
    await load();
  };

  const moveUp = async (field: TrackerField, index: number) => {
    if (index === 0) return;
    await moveField(tracker!.id, field.id, -1);
    await load();
  };

  const moveDown = async (field: TrackerField, index: number) => {
    if (index === fields.length - 1) return;
    await moveField(tracker!.id, field.id, 1);
    await load();
  };

  if (!tracker) {
    return (
      <Screen>
        <AppText muted>Loading…</AppText>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable onPress={() => router.back()} style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-back" size={24} color={t.text} />
        </Pressable>
        <AppText size={24} weight="600" style={{ flex: 1 }}>
          Edit Space
        </AppText>
      </View>

      <View style={{ gap: space.sm }}>
        <AppText size={13} weight="500" muted>
          Name
        </AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt }]}
        />
      </View>

      <View style={{ gap: space.xs }}>
        <AppText size={13} weight="500" muted>
          Icon
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {ICONS.map((ic) => (
            <Pressable
              key={ic}
              onPress={() => setIcon(ic)}
              style={{
                width: TOUCH,
                height: TOUCH,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: icon === ic ? color : t.surfaceAlt,
              }}
            >
              <Ionicons name={ic as never} size={22} color={icon === ic ? '#fff' : t.text} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: space.xs }}>
        <AppText size={13} weight="500" muted>
          Colour
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{
                width: TOUCH,
                height: TOUCH,
                borderRadius: TOUCH / 2,
                backgroundColor: c,
                borderWidth: color === c ? 3 : 0,
                borderColor: t.text,
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: space.xs }}>
        <AppText size={13} weight="500" muted>
          Layout
        </AppText>
        <ChipRow>
          {PRESENTATIONS.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              selected={presentation === p.key}
              onPress={() => setPresentation(p.key)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={{ gap: space.xs }}>
        <AppText size={13} weight="500" muted>
          Show on Today
        </AppText>
        <Pressable
          onPress={() => setShowOnToday(!showOnToday)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
        >
          <Ionicons name={showOnToday ? 'checkbox' : 'square-outline'} size={24} color={t.primary} />
          <AppText size={15}>{showOnToday ? 'Visible' : 'Hidden'}</AppText>
        </Pressable>
      </View>

      <View style={{ gap: space.xs }}>
        <AppText size={13} weight="500" muted>
          Status
        </AppText>
        <ChipRow>
          {['active', 'paused', 'archived'].map((s) => (
            <Chip
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              selected={status === s}
              onPress={() => setStatus(s)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={{ gap: space.sm }}>
        <AppText size={13} weight="500" muted>
          Fields
        </AppText>
        {fields.map((field, index) => (
          <View
            key={field.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              padding: space.sm,
              borderRadius: radius.md,
              backgroundColor: t.surfaceAlt,
            }}
          >
            <View style={{ flex: 1 }}>
              <AppText size={15} weight="600">
                {field.label}
              </AppText>
              <AppText size={12} muted>
                {field.type} {field.archived ? '(hidden)' : ''}
              </AppText>
            </View>
            <Pressable onPress={() => moveUp(field, index)} style={{ padding: 4 }}>
              <Ionicons name="chevron-up" size={20} color={t.text} />
            </Pressable>
            <Pressable onPress={() => moveDown(field, index)} style={{ padding: 4 }}>
              <Ionicons name="chevron-down" size={20} color={t.text} />
            </Pressable>
            <Pressable onPress={() => toggleArchiveField(field)} style={{ padding: 4 }}>
              <Ionicons name={field.archived ? 'eye' : 'eye-off'} size={20} color={t.text} />
            </Pressable>
            <Pressable onPress={() => removeField(field)} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={20} color={t.danger} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={{ gap: space.xs }}>
        <AppText size={13} weight="500" muted>
          Add field
        </AppText>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <TextInput
            value={newFieldName}
            onChangeText={setNewFieldName}
            placeholder="Field name"
            placeholderTextColor={t.textMuted}
            style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt, flex: 1 }]}
          />
          <TextInput
            value={newFieldType}
            onChangeText={setNewFieldType}
            placeholder="type"
            placeholderTextColor={t.textMuted}
            style={[styles.input, { borderColor: t.border, color: t.text, backgroundColor: t.surfaceAlt, width: 80 }]}
          />
          <Button label="Add" onPress={addField} style={{ minHeight: TOUCH }} />
        </View>
      </View>

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Button label="Save changes" onPress={save} />
        {status !== 'archived' ? (
          <Button label="Archive" icon="archive-outline" variant="secondary" onPress={archive} />
        ) : (
          <Button label="Restore" icon="refresh" variant="secondary" onPress={restore} />
        )}
        <Button label="Delete permanently" icon="trash-outline" variant="ghost" color={t.danger} onPress={remove} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    fontSize: 16,
  },
});
