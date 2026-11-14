import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { makeDriver } from '../src/db';

interface Person { id: string; name: string; circle: string; notes: string }

export default function Social() {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState('');
  const [circle, setCircle] = useState('Friends');

  const load = async () => {
    const d = makeDriver();
    setPeople(await d.getAllAsync<Person>('SELECT id, name, circle, notes FROM so_people ORDER BY name'));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const d = makeDriver();
    await d.runAsync('INSERT INTO so_people (id, name, circle, notes, created_at) VALUES (?, ?, ?, ?, ?)', [Date.now().toString(), name.trim(), circle, '', Date.now()]);
    setName('');
    await load();
  };

  const remove = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM so_people WHERE id = ?', [id]);
    await load();
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Social</Text>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8 }} />
      <TextInput placeholder="Circle" value={circle} onChangeText={setCircle} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginTop: 4 }} />
      <Pressable onPress={add} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Add person</Text>
      </Pressable>
      {people.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <Text>{p.name} — {p.circle}</Text>
          <Pressable onPress={() => remove(p.id)}><Text style={{ color: '#DC2626' }}>Delete</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
