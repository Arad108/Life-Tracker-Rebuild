import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, Modal, Alert } from 'react-native';
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

function formatDate(d: string | null): string {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

function isOverdue(date: string | null): boolean {
  if (!date) return false;
  return date < new Date().toISOString().slice(0, 10);
}

function isDueToday(date: string | null): boolean {
  if (!date) return false;
  return date === new Date().toISOString().slice(0, 10);
}

export default function Social() {
  const t = useTheme();
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [search, setSearch] = useState('');
  const [personSheetOpen, setPersonSheetOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editName, setEditName] = useState('');
  const [editCircle, setEditCircle] = useState('Friends');
  const [editMetContext, setEditMetContext] = useState('');
  const [editCadence, setEditCadence] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [factKind, setFactKind] = useState('birthday');
  const [factText, setFactText] = useState('');
  const [factDate, setFactDate] = useState('');

  const [interactionKind, setInteractionKind] = useState('talked');
  const [interactionNote, setInteractionNote] = useState('');

  const [noteText, setNoteText] = useState('');
  const [noteKind, setNoteKind] = useState('reflection');

  const [showFactForm, setShowFactForm] = useState(false);
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);

  const loadPeople = async () => {
    const d = makeDriver();
    setPeople(await d.getAllAsync<Person>('SELECT * FROM so_people ORDER BY name'));
  };

  const loadPersonDetail = async (person: Person) => {
    const d = makeDriver();
    setSelectedPerson(person);
    setFacts(await d.getAllAsync<Fact>('SELECT * FROM so_facts WHERE person_id = ? ORDER BY position, rowid', [person.id]));
    const interactionRows = await d.getAllAsync<Interaction>(
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

  const filteredPeople = people.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.circle.toLowerCase().includes(search.toLowerCase()) ||
    p.met_context.toLowerCase().includes(search.toLowerCase()),
  );

  const openPersonSheet = (person?: Person) => {
    if (person) {
      setEditingPerson(person);
      setEditName(person.name);
      setEditCircle(person.circle);
      setEditMetContext(person.met_context);
      setEditCadence(person.cadence_days ? String(person.cadence_days) : '');
      setEditNotes('');
    } else {
      setEditingPerson(null);
      setEditName('');
      setEditCircle('Friends');
      setEditMetContext('');
      setEditCadence('');
      setEditNotes('');
    }
    setPersonSheetOpen(true);
  };

  const savePersonSheet = async () => {
    if (!editName.trim()) return;
    const d = makeDriver();
    const now = Date.now();
    const cadence = editCadence.trim() ? Number(editCadence) : null;
    if (editingPerson) {
      await d.runAsync(
        'UPDATE so_people SET name = ?, circle = ?, met_context = ?, cadence_days = ?, updated_at = ? WHERE id = ?',
        [editName.trim(), editCircle, editMetContext.trim(), cadence, now, editingPerson.id],
      );
    } else {
      const id = now.toString();
      await d.runAsync(
        'INSERT INTO so_people (id, name, circle, met_context, photo_uri, cadence_days, extra, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)',
        [id, editName.trim(), editCircle, editMetContext.trim(), cadence, '{}', now, now],
      );
    }
    setPersonSheetOpen(false);
    await loadPeople();
  };

  const deletePerson = (id: string) => {
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
    setShowFactForm(false);
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
    setShowInteractionForm(false);
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
    setShowNoteForm(false);
    await loadPersonDetail(selectedPerson);
  };

  // Person detail view
  if (selectedPerson) {
    const personFacts = facts;
    const birthdays = personFacts.filter((f) => f.kind === 'birthday');
    const gifts = personFacts.filter((f) => f.kind === 'gift idea');
    const promises = personFacts.filter((f) => f.kind === 'promise');
    const likes = personFacts.filter((f) => f.kind === 'like' || f.kind === 'dislike');
    const convIdeas = personFacts.filter((f) => f.kind === 'conversation idea');
    const otherFacts = personFacts.filter((f) => !['birthday', 'gift idea', 'promise', 'like', 'dislike', 'conversation idea'].includes(f.kind));

    return (
      <ScrollView style={{ flex: 1, padding: 16, backgroundColor: '#F6F5F2' }}>
        <Pressable onPress={() => setSelectedPerson(null)} style={{ marginBottom: 12 }}>
          <Text style={{ color: '#4F46E5', fontSize: 16 }}>← Back to people</Text>
        </Pressable>

        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: '700' }}>{selectedPerson.name}</Text>
          <Text style={{ color: '#6B6B6B', fontSize: 14, marginTop: 2 }}>
            {selectedPerson.circle}{selectedPerson.met_context ? ` · Met: ${selectedPerson.met_context}` : ''}
          </Text>
          {selectedPerson.cadence_days ? (
            <Text style={{ color: '#6B6B6B', fontSize: 12, marginTop: 2 }}>
              Reach out every {selectedPerson.cadence_days} days
            </Text>
          ) : null}
        </View>

        {/* Facts sections */}
        {[
          { title: 'Birthdays', items: birthdays, color: '#E08A1E' },
          { title: 'Gift ideas', items: gifts, color: '#C2738A' },
          { title: 'Promises', items: promises, color: '#7C5CE0' },
          { title: 'Likes & dislikes', items: likes, color: '#16A34A' },
          { title: 'Conversation ideas', items: convIdeas, color: '#4C6FFF' },
          { title: 'Other facts', items: otherFacts, color: '#6B6D73' },
        ].map(({ title, items, color }) =>
          items.length > 0 ? (
            <View key={title} style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8, color }}>{title}</Text>
              {items.map((f) => (
                <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
                  <Pressable onPress={() => toggleFact(f)} style={{ marginRight: 8 }}>
                    <Text style={{ fontSize: 18, color: f.done_at ? '#3DD598' : '#9A9CA3' }}>
                      {f.done_at ? '✓' : '○'}
                    </Text>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={{ textDecorationLine: f.done_at ? 'line-through' : 'none', color: f.done_at ? '#9A9CA3' : '#16171A' }}>
                      {f.text}
                    </Text>
                    {f.date ? (
                      <Text style={{ fontSize: 12, color: isOverdue(f.date) && !f.done_at ? '#F07272' : isDueToday(f.date) && !f.done_at ? '#E9B44C' : '#6B6D73' }}>
                        {isOverdue(f.date) && !f.done_at ? 'overdue' : isDueToday(f.date) && !f.done_at ? 'due today' : ''} {f.date ? `· ${formatDate(f.date)}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => deleteFact(f.id)}>
                    <Text style={{ color: '#DC2626', fontSize: 18 }}>×</Text>
                  </Pressable>
                </View>
              ))}
              {showFactForm && (
                <View style={{ marginTop: 8, gap: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput placeholder="Kind" value={factKind} onChangeText={setFactKind} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 6, flex: 1, fontSize: 13 }} />
                    <TextInput placeholder="Date (opt)" value={factDate} onChangeText={setFactDate} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 6, flex: 1, fontSize: 13 }} />
                  </View>
                  <TextInput placeholder="Fact text" value={factText} onChangeText={setFactText} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 6, fontSize: 13 }} />
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable onPress={() => setShowFactForm(false)} style={{ flex: 1, padding: 8, backgroundColor: '#E3E1DB', borderRadius: 8 }}>
                      <Text style={{ textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={addFact} style={{ flex: 1, padding: 8, backgroundColor: '#4F46E5', borderRadius: 8 }}>
                      <Text style={{ color: '#fff', textAlign: 'center', fontSize: 13 }}>Add</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {!showFactForm ? (
                <Pressable onPress={() => { setFactKind(title === 'Birthdays' ? 'birthday' : title === 'Gift ideas' ? 'gift idea' : title === 'Promises' ? 'promise' : title === 'Likes & dislikes' ? 'like' : title === 'Conversation ideas' ? 'conversation idea' : 'fact'); setShowFactForm(true); }} style={{ marginTop: 8 }}>
                  <Text style={{ color: '#4F46E5', fontSize: 13 }}>+ Add {title.toLowerCase()}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null,
        )}

        {/* Interactions */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#4C6FFF' }}>Interactions</Text>
          {interactions.map((i) => (
            <View key={i.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
              <Text style={{ fontWeight: '600', fontSize: 14 }}>{i.kind} · {i.day}</Text>
              <Text style={{ color: '#6B6B6B', fontSize: 12 }}>{i.note}</Text>
            </View>
          ))}
          {interactions.length === 0 ? (
            <Text style={{ color: '#9A9CA3', fontSize: 13, fontStyle: 'italic' }}>No interactions logged yet.</Text>
          ) : null}
          {showInteractionForm ? (
            <View style={{ marginTop: 8, gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TextInput placeholder="Kind" value={interactionKind} onChangeText={setInteractionKind} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 6, flex: 1, fontSize: 13 }} />
                <TextInput placeholder="Note" value={interactionNote} onChangeText={setInteractionNote} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 6, flex: 2, fontSize: 13 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable onPress={() => setShowInteractionForm(false)} style={{ flex: 1, padding: 8, backgroundColor: '#E3E1DB', borderRadius: 8 }}>
                  <Text style={{ textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={addInteraction} style={{ flex: 1, padding: 8, backgroundColor: '#4F46E5', borderRadius: 8 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontSize: 13 }}>Log</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setShowInteractionForm(true)} style={{ marginTop: 8 }}>
              <Text style={{ color: '#4F46E5', fontSize: 13 }}>+ Log a conversation</Text>
            </Pressable>
          )}
        </View>

        {/* Notes */}
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#6B6D73' }}>Notes</Text>
          {notes.map((n) => (
            <View key={n.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
              <Text style={{ fontWeight: '600', fontSize: 13 }}>{n.kind}</Text>
              <Text style={{ color: '#6B6B6B', fontSize: 12 }}>{n.text}</Text>
            </View>
          ))}
          {notes.length === 0 ? (
            <Text style={{ color: '#9A9CA3', fontSize: 13, fontStyle: 'italic' }}>No notes yet.</Text>
          ) : null}
          {showNoteForm ? (
            <View style={{ marginTop: 8, gap: 6 }}>
              <TextInput placeholder="Kind" value={noteKind} onChangeText={setNoteKind} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 6, fontSize: 13 }} />
              <TextInput placeholder="Note" value={noteText} onChangeText={setNoteText} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 6, fontSize: 13 }} />
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable onPress={() => setShowNoteForm(false)} style={{ flex: 1, padding: 8, backgroundColor: '#E3E1DB', borderRadius: 8 }}>
                  <Text style={{ textAlign: 'center', fontSize: 13 }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={addNote} style={{ flex: 1, padding: 8, backgroundColor: '#4F46E5', borderRadius: 8 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontSize: 13 }}>Add</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setShowNoteForm(true)} style={{ marginTop: 8 }}>
              <Text style={{ color: '#4F46E5', fontSize: 13 }}>+ Add note</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    );
  }

  // People list view
  return (
    <ScrollView style={{ flex: 1, padding: 16, backgroundColor: '#F6F5F2' }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12, color: '#16171A' }}>Social</Text>
      <TextInput
        placeholder="Search people..."
        value={search}
        onChangeText={setSearch}
        style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginBottom: 8, backgroundColor: '#FFFFFF' }}
      />
      <Pressable onPress={() => openPersonSheet()} style={{ marginBottom: 12, padding: 10, backgroundColor: '#7C5CE0', borderRadius: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>+ Add person</Text>
      </Pressable>
      {filteredPeople.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => loadPersonDetail(p)}
          style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 16, color: '#16171A' }}>{p.name}</Text>
            <Text style={{ color: '#6B6D73', fontSize: 13, marginTop: 2 }}>
              {p.circle}{p.met_context ? ` · ${p.met_context}` : ''}{p.cadence_days ? ` · every ${p.cadence_days}d` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Pressable onPress={() => openPersonSheet(p)} style={{ paddingVertical: 6 }}>
              <Text style={{ color: '#7C5CE0', fontSize: 14, fontWeight: '600' }}>Edit</Text>
            </Pressable>
            <Pressable onPress={() => deletePerson(p.id)}>
              <Text style={{ color: '#DC2626', fontSize: 14, fontWeight: '600' }}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      ))}
      {filteredPeople.length === 0 ? (
        <Text style={{ color: '#6B6D73', marginTop: 24, textAlign: 'center' }}>
          {people.length === 0 ? 'No people yet. Add someone to get started.' : 'No people found.'}
        </Text>
      ) : null}

      <Modal visible={personSheetOpen} transparent animationType="fade" onRequestClose={() => setPersonSheetOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }} onPress={() => setPersonSheetOpen(false)}>
          <Pressable style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16 }} onPress={() => {}}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#16171A' }}>{editingPerson ? 'Edit person' : 'New person'}</Text>
            <TextInput placeholder="Name" value={editName} onChangeText={setEditName} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginBottom: 8, color: '#16171A' }} />
            <TextInput placeholder="Circle" value={editCircle} onChangeText={setEditCircle} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginBottom: 8, color: '#16171A' }} />
            <TextInput placeholder="How we met" value={editMetContext} onChangeText={setEditMetContext} style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginBottom: 8, color: '#16171A' }} />
            <TextInput placeholder="Cadence (days)" value={editCadence} onChangeText={setEditCadence} keyboardType="numeric" style={{ borderWidth: 1, borderColor: '#E3E1DB', borderRadius: 8, padding: 8, marginBottom: 8, color: '#16171A' }} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable onPress={() => setPersonSheetOpen(false)} style={{ flex: 1, padding: 10, backgroundColor: '#E3E1DB', borderRadius: 8 }}>
                <Text style={{ textAlign: 'center', color: '#16171A' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={savePersonSheet} style={{ flex: 1, padding: 10, backgroundColor: '#7C5CE0', borderRadius: 8 }}>
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
