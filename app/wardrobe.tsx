import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { makeDriver } from '../src/db';

interface Item { id: string; name: string; category: string; color: string; brand: string }

export default function Wardrobe() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('tops');

  const load = async () => {
    const d = makeDriver();
    setItems(await d.getAllAsync<Item>('SELECT id, name, category, color, brand FROM wd_items ORDER BY name'));
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    const d = makeDriver();
    await d.runAsync('INSERT INTO wd_items (id, name, category, color, brand, created_at) VALUES (?, ?, ?, ?, ?, ?)', [Date.now().toString(), name.trim(), category, '', '', Date.now()]);
    setName('');
    await load();
  };

  const remove = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM wd_items WHERE id = ?', [id]);
    await load();
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Wardrobe</Text>
      <TextInput placeholder="Item name" value={name} onChangeText={setName} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8 }} />
      <TextInput placeholder="Category (tops/bottoms/shoes)" value={category} onChangeText={setCategory} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginTop: 4 }} />
      <Pressable onPress={add} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Add item</Text>
      </Pressable>
      {items.map((i) => (
        <View key={i.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <Text>{i.name} — {i.category}</Text>
          <Pressable onPress={() => remove(i.id)}><Text style={{ color: '#DC2626' }}>Delete</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
