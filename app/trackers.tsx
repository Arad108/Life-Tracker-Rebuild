import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { makeDriver } from '../src/db';

interface Tracker { id: string; name: string; description: string }

export default function Trackers() {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    const d = makeDriver();
    setTrackers(await d.getAllAsync<Tracker>('SELECT id, name, description FROM trackers ORDER BY name'));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const d = makeDriver();
    const now = Date.now();
    await d.runAsync('INSERT INTO trackers (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [now.toString(), name.trim(), description.trim(), now, now]);
    setName(''); setDescription('');
    await load();
  };

  const remove = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM trackers WHERE id = ?', [id]);
    await load();
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Trackers</Text>
      <TextInput placeholder="Tracker name" value={name} onChangeText={setName} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8 }} />
      <TextInput placeholder="Description" value={description} onChangeText={setDescription} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginTop: 4 }} />
      <Pressable onPress={add} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Create tracker</Text>
      </Pressable>
      {trackers.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <View>
            <Text style={{ fontWeight: '600' }}>{t.name}</Text>
            <Text style={{ color: '#6B6B6B', fontSize: 12 }}>{t.description}</Text>
          </View>
          <Pressable onPress={() => remove(t.id)}><Text style={{ color: '#DC2626' }}>Delete</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
