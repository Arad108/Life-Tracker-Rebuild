import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { makeDriver } from '../src/db';

interface Routine { id: string; name: string; time_window: string; days: string }

export default function Routines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [name, setName] = useState('');

  const load = async () => {
    const d = makeDriver();
    setRoutines(await d.getAllAsync<Routine>('SELECT id, name, time_window, days FROM routines ORDER BY name'));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const d = makeDriver();
    await d.runAsync('INSERT INTO routines (id, name, time_window, days, created_at) VALUES (?, ?, ?, ?, ?)', [Date.now().toString(), name.trim(), '', '[]', Date.now()]);
    setName('');
    await load();
  };

  const remove = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM routines WHERE id = ?', [id]);
    await load();
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Routines</Text>
      <TextInput placeholder="Routine name" value={name} onChangeText={setName} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8 }} />
      <Pressable onPress={add} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Add routine</Text>
      </Pressable>
      {routines.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <Text>{r.name}</Text>
          <Pressable onPress={() => remove(r.id)}><Text style={{ color: '#DC2626' }}>Delete</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
