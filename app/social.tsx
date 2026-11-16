import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, Alert } from 'react-native';
import { makeDriver } from '../src/db';
import { Screen, AppText, Button, Card } from '../src/ui/components';
import { useTheme, space, radius, TOUCH } from '../src/ui/theme';

interface Person {
  id: string;
  name: string;
  circle: string;
  met_context: string;
  photo_uri: string | null;
  cadence_days: number | null;
  extra: string;
  created_at: number;
  updated_at: number;
}

interface Fact {
  id: string;
  person_id: string;
  kind: string;
  text: string;
  date: string | null;
  done_at: number | null;
  position: number;
}

interface Interaction {
  id: string;
  day: string;
  occurred_at: number;
  kind: string;
  note: string;
}

interface Note {
  id: string;
  kind: string;
  text: string;
  tags: string;
  person_id: string | null;
  created_at: number;
}

const CIRCLES = ['Friends', 'Family', 'Work', 'Acquaintance', 'Other'];
const FACT_KINDS = ['birthday', 'gift idea', 'promise', 'conversation idea', 'like', 'dislike', 'fact'];
const INTERACTION_KINDS = ['talked', 'met', 'called', 'texted', 'video'];

export default function Social() {
  const t = useTheme();
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  // Add person form
  const [name, setName] = useState('');
  const [circle, setCircle] = useState('Friends');
  const [metContext, setMetContext] = useState('');

  // Fact form
  const [factKind, setFactKind] = useState('birthday');
  const [factText, setFactText] = useState('');
  const [factDate, setFactDate] = useState('');

  // Interaction form
  const [interactionKind, setInteractionKind] = useState('talked');
  const [interactionNote, setInteractionNote] = useState('');

  // Note form
  const [noteText, setNoteText] = useState('');
  const [noteKind, setNoteKind] = useState('reflection');

  const loadPeople = async () => {
    const d = makeDriver();
    setPeople(await d.getAllAsync<Person>('SELECT * FROM so_people ORDER BY name'));
  };

  const loadPersonDetail = async (person: Person) => {
    const d = makeDriver();
    setSelectedPerson(person);
    setFacts(await d.getAllAsync<Fact>('SELECT * FROM so_facts WHERE person_id = ? ORDER BY position, rowid', [person.id]));
    const interactionRows = await d.getAllAsync<{ id: string; day: string; occurred_at: number; kind: string; note: string }>(
      `SELECT i.id, i.day, i.occurred_at, i.kind, i.note FROM so_interactions i
       JOIN so_interaction_people ip ON ip.interaction_id = i.id
       WHERE ip.person_id = ? ORDER BY i.occurred_at DESC`,
      [person.id],
    );
    setInteractions(interactionRows);
    setNotes(await d.getAllAsync<Note>('SELECT * FROM so_notes WHERE person_id = ? ORDER BY created_at DESC', [person.id]));
  };

  useEffect(() => {
    loadPeople();
  }, []);

  const addPerson = async () => {
    if (!name.trim()) return;
    const d = makeDriver();
    const now = Date.now();
    const id = now.toString();
    await d.runAsync(
      'INSERT INTO so_people (id, name, circle, met_context, photo_uri, cadence_days, extra, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)',
      [id, name.trim(), circle, metContext.trim(), '{}', now, now],
    );
    setName('');
    setMetContext('');
    await loadPeople();
  };

  const deletePerson = async (id: string) => {
    Alert.alert('Delete person?', 'This removes them and their facts, interactions and notes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const d = makeDriver();
          await d.runAsync('DELETE FROM so_people WHERE id = ?', [id]);
          if (selectedPerson?.id === id) setSelectedPerson(null);
          await loadPeople();
        },
      },
    ]);
  };

  const addFact = async () => {
    if (!selectedPerson || !factText.trim()) return;
    const d = makeDriver();
    const id = Date.now().toString();
    await d.runAsync(
      'INSERT INTO so_facts (id, person_id, kind, text, date, done_at, position) VALUES (?, ?, ?, ?, ?, NULL, ?)',
      [id, selectedPerson.id, factKind, factText.trim(), factDate.trim() || null, 0],
    );
    setFactText('');
    setFactDate('');
    await loadPersonDetail(selectedPerson);
  };

  const toggleFact = async (fact: Fact) => {
    const d = makeDriver();
    await d.runAsync('UPDATE so_facts SET done_at = ? WHERE id = ?', [fact.done_at ? null : Date.now(), fact.id]);
    if (selectedPerson) await loadPersonDetail(selectedPerson);
  };

  const deleteFact = async (id: string) => {
    const d = makeDriver();
    await d.runAsync('DELETE FROM so_facts WHERE id = ?', [id]);
    if (selectedPerson) await loadPersonDetail(selectedPerson);
  };

  const addInteraction = async () => {
    if (!selectedPerson || !interactionNote.trim()) return;
    const d = makeDriver();
    const now = Date.now();
    const day = new Date().toISOString().slice(0, 10);
    const id = now.toString();
    await d.runAsync(
      'INSERT INTO so_interactions (id, day, occurred_at, kind, note, is_new_person, is_challenging) VALUES (?, ?, ?, ?, ?, 0, 0)',
      [id, day, now, interactionKind, interactionNote.trim()],
    );
    await d.runAsync('INSERT INTO so_interaction_people (interaction_id, person_id) VALUES (?, ?)', [id, selectedPerson.id]);
    setInteractionNote('');
    await loadPersonDetail(selectedPerson);
  };

  const addNote = async () => {
    if (!selectedPerson || !noteText.trim()) return;
    const d = makeDriver();
    const id = Date.now().toString();
    await d.runAsync(
      'INSERT INTO so_notes (id, kind, text, tags, person_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, noteKind, noteText.trim(), '[]', selectedPerson.id, Date.now()],
    );
    setNoteText('');
    await loadPersonDetail(selectedPerson);
  };

  if (selectedPerson) {
    return (
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <Pressable onPress={() => setSelectedPerson(null)} style={{ marginBottom: 12 }}>
          <Text style={{ color: '#4F46E5' }}>← Back to people</Text>
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 4 }}>{selectedPerson.name}</Text>
        <Text style={{ color: '#6B6B6B', marginBottom: 12 }}>{selectedPerson.circle}{selectedPerson.met_context ? ` · ${selectedPerson.met_context}` : ''}</Text>

        <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 8, marginBottom: 4 }}>Facts</Text>
        {facts.map((f) => (
          <View key={f.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
            <Pressable onPress={() => toggleFact(f)} style={{ flex: 1 }}>
              <Text style={{ textDecorationLine: f.done_at ? 'line-through' : 'none' }}>
                {f.kind}: {f.text}{f.date ? ` (${f.date})` : ''}
              </Text>
            </Pressable>
            <Pressable onPress={() => deleteFact(f.id)}><Text style={{ color: '#DC2626' }}>×</Text></Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TextInput placeholder="Kind" value={factKind} onChangeText={setFactKind} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 1 }} />
          <TextInput placeholder="Fact text" value={factText} onChangeText={setFactText} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 2 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <TextInput placeholder="Date (optional)" value={factDate} onChangeText={setFactDate} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 1 }} />
          <Pressable onPress={addFact} style={{ padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
            <Text style={{ color: '#fff' }}>Add fact</Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 4 }}>Interactions</Text>
        {interactions.map((i) => (
          <View key={i.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
            <Text style={{ fontWeight: '600' }}>{i.kind} · {i.day}</Text>
            <Text style={{ color: '#6B6B6B', fontSize: 12 }}>{i.note}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TextInput placeholder="Kind" value={interactionKind} onChangeText={setInteractionKind} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 1 }} />
          <TextInput placeholder="Note" value={interactionNote} onChangeText={setInteractionNote} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 2 }} />
          <Pressable onPress={addInteraction} style={{ padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
            <Text style={{ color: '#fff' }}>Log</Text>
          </Pressable>
        </View>

        <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 4 }}>Notes</Text>
        {notes.map((n) => (
          <View key={n.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
            <Text style={{ fontWeight: '600' }}>{n.kind}</Text>
            <Text style={{ color: '#6B6B6B', fontSize: 12 }}>{n.text}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TextInput placeholder="Kind" value={noteKind} onChangeText={setNoteKind} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 1 }} />
          <TextInput placeholder="Note" value={noteText} onChangeText={setNoteText} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 2 }} />
          <Pressable onPress={addNote} style={{ padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
            <Text style={{ color: '#fff' }}>Add</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Social</Text>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8 }} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <TextInput placeholder="Circle" value={circle} onChangeText={setCircle} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 1 }} />
        <TextInput placeholder="How we met" value={metContext} onChangeText={setMetContext} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, flex: 1 }} />
      </View>
      <Pressable onPress={addPerson} style={{ marginTop: 8, padding: 10, backgroundColor: '#4F46E5', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Add person</Text>
      </Pressable>
      {people.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <Pressable onPress={() => loadPersonDetail(p)} style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600' }}>{p.name}</Text>
            <Text style={{ color: '#6B6B6B', fontSize: 12 }}>{p.circle}{p.met_context ? ` · ${p.met_context}` : ''}</Text>
          </Pressable>
          <Pressable onPress={() => deletePerson(p.id)}><Text style={{ color: '#DC2626' }}>Delete</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}
