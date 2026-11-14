import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { makeDriver } from '../src/db';

interface Entry { id: string; day: string; title: string; body: string; mood: number }

export default function Journal() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    const d = makeDriver();
    const q = search.trim() ? `%${search.trim()}%` : '%';
    setEntries(await d.getAllAsync<Entry>('SELECT id, day, title, body, mood FROM journal_entries WHERE title LIKE ? OR body LIKE ? ORDER BY day DESC', [q, q]));
  };
  useEffect(() => { load(); }, [search]);

  const add = async () => {
    if (!body.trim() && !title.trim()) return;
    const d = makeDriver();
    const now = Date.now();
    const day = new Date().toISOString().slice(0, 10);
    await d.runAsync('INSERT INTO journal_entries (id, day, title, body, mood, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [now.toString(), day, title.trim(), body.trim(), 3, now, now]);
    setTitle(''); setBody('');
    await load();
  };

  const remove = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM journal_entries WHERE id = ?', [id]);
    await load();
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Journal</Text>
      <TextInput placeholder="Search" value={search} onChangeText={setSearch} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginBottom: 8 }} />
      <TextInput placeholder="Title" value={title} onChangeText={setTitle} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8 }} />
      <TextInput placeholder="Body" value={body} onChangeText={setBody} multiline style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginTop: 4, minHeight: 80 }} />
      <Pressable onPress={add} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Save entry</Text>
      </Pressable>
      {entries.map((e) => (
        <View key={e.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <Text style={{ fontWeight: '600' }}>{e.title || '(untitled)'} · {e.day}</Text>
          <Text>{e.body}</Text>
          <Pressable onPress={() => remove(e.id)}><Text style={{ color: '#DC2626', marginTop: 4 }}>Delete</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
