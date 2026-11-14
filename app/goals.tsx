import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { makeDriver } from '../src/db';

interface Goal { id: string; title: string; target: number; status: string; deadline: string | null }

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');

  const load = async () => {
    const d = makeDriver();
    setGoals(await d.getAllAsync<Goal>('SELECT id, title, target, status, deadline FROM goals ORDER BY created_at DESC'));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!title.trim()) return;
    const d = makeDriver();
    const now = Date.now();
    await d.runAsync('INSERT INTO goals (id, title, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [now.toString(), title.trim(), Number(target) || 0, now, now]);
    setTitle(''); setTarget('');
    await load();
  };

  const toggle = async (g: Goal) => {
    const d = makeDriver();
    await d.runAsync('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?', [g.status === 'active' ? 'completed' : 'active', Date.now(), g.id]);
    await load();
  };

  const remove = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM goals WHERE id = ?', [id]);
    await load();
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Goals</Text>
      <TextInput placeholder="Goal title" value={title} onChangeText={setTitle} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8 }} />
      <TextInput placeholder="Target (number)" value={target} onChangeText={setTarget} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginTop: 4 }} />
      <Pressable onPress={add} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Add goal</Text>
      </Pressable>
      {goals.map((g) => (
        <View key={g.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <View>
            <Text style={{ fontWeight: '600', textDecorationLine: g.status === 'completed' ? 'line-through' : 'none' }}>{g.title}</Text>
            <Text style={{ color: '#6B6B6B', fontSize: 12 }}>Target: {g.target} · {g.status}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={() => toggle(g)}><Text style={{ color: '#4F46E5' }}>{g.status === 'active' ? 'Complete' : 'Reactivate'}</Text></Pressable>
            <Pressable onPress={() => remove(g.id)}><Text style={{ color: '#DC2626' }}>Delete</Text></Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
