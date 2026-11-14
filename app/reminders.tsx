import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { makeDriver } from '../src/db';

interface Reminder { id: string; title: string; time: string; recurrence: string; done: number }

export default function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');

  const load = async () => {
    const d = makeDriver();
    setReminders(await d.getAllAsync<Reminder>('SELECT id, title, time, recurrence, done FROM reminders ORDER BY created_at DESC'));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!title.trim()) return;
    const d = makeDriver();
    await d.runAsync('INSERT INTO reminders (id, title, time, recurrence, created_at) VALUES (?, ?, ?, ?, ?)', [Date.now().toString(), title.trim(), time, 'once', Date.now()]);
    setTitle('');
    await load();
  };

  const toggle = async (r: Reminder) => {
    const d = makeDriver();
    await d.runAsync('UPDATE reminders SET done = ? WHERE id = ?', [r.done ? 0 : 1, r.id]);
    await load();
  };

  const remove = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM reminders WHERE id = ?', [id]);
    await load();
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Reminders</Text>
      <TextInput placeholder="Title" value={title} onChangeText={setTitle} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8 }} />
      <TextInput placeholder="Time (HH:MM)" value={time} onChangeText={setTime} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginTop: 4 }} />
      <Pressable onPress={add} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Add reminder</Text>
      </Pressable>
      {reminders.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <Text style={{ textDecorationLine: r.done ? 'line-through' : 'none' }}>{r.title} · {r.time}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={() => toggle(r)}><Text style={{ color: '#4F46E5' }}>{r.done ? 'Undo' : 'Done'}</Text></Pressable>
            <Pressable onPress={() => remove(r.id)}><Text style={{ color: '#DC2626' }}>Delete</Text></Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
