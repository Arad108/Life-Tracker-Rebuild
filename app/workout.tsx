import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable, TextInput } from 'react-native';
import { makeDriver } from '../src/db';

interface Exercise { id: string; name: string; muscle: string }

export default function Workout() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<{ id: string; day: string; note: string }[]>([]);
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('');

  const load = async () => {
    const d = makeDriver();
    setExercises(await d.getAllAsync<Exercise>('SELECT id, name, muscle FROM wk_exercises ORDER BY name'));
    setSessions(await d.getAllAsync<{ id: string; day: string; note: string }>('SELECT id, day, note FROM wk_sessions ORDER BY day DESC'));
  };

  useEffect(() => { load(); }, []);

  const addExercise = async () => {
    if (!name.trim()) return;
    const d = makeDriver();
    await d.runAsync('INSERT INTO wk_exercises (id, name, muscle, created_at) VALUES (?, ?, ?, ?)', [Date.now().toString(), name.trim(), muscle.trim(), Date.now()]);
    setName(''); setMuscle('');
    await load();
  };

  const startSession = async () => {
    const d = makeDriver();
    const day = new Date().toISOString().slice(0, 10);
    await d.runAsync('INSERT INTO wk_sessions (id, day, note, created_at) VALUES (?, ?, ?, ?)', [Date.now().toString(), day, '', Date.now()]);
    await load();
  };

  const deleteExercise = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM wk_exercises WHERE id = ?', [id]);
    await load();
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Workout</Text>
      <Text style={{ fontWeight: '600', marginTop: 8 }}>New exercise</Text>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginTop: 4 }} />
      <TextInput placeholder="Muscle group" value={muscle} onChangeText={setMuscle} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginTop: 4 }} />
      <Pressable onPress={addExercise} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Add exercise</Text>
      </Pressable>
      <Pressable onPress={startSession} style={{ marginTop: 8, padding: 10, backgroundColor: '#10B981', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Start session (today)</Text>
      </Pressable>
      <Text style={{ fontWeight: '600', marginTop: 16 }}>Exercises</Text>
      {exercises.map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text>{e.name} {e.muscle ? `(${e.muscle})` : ''}</Text>
          <Pressable onPress={() => deleteExercise(e.id)}><Text style={{ color: '#DC2626' }}>Delete</Text></Pressable>
        </View>
      ))}
      <Text style={{ fontWeight: '600', marginTop: 16 }}>Sessions</Text>
      {sessions.map((s) => (
        <Text key={s.id} style={{ paddingVertical: 4 }}>{s.day} {s.note}</Text>
      ))}
    </ScrollView>
  );
}
