import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { makeDriver } from '../src/db';

const SPACES = [
  { key: 'finance', label: 'Finance', route: '/finance' },
  { key: 'workout', label: 'Workout', route: '/workout' },
  { key: 'wardrobe', label: 'Wardrobe', route: '/wardrobe' },
  { key: 'social', label: 'Social', route: '/social' },
  { key: 'trackers', label: 'Trackers', route: '/trackers' },
];

export default function Home() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const d = makeDriver();
      const rows = await d.getAllAsync<{ key: string; enabled: number }>('SELECT key, enabled FROM spaces');
      setEnabled(rows.filter((r) => r.enabled === 1).map((r) => r.key));
    })();
  }, []);

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', marginBottom: 4 }}>Life Tracker</Text>
      <Text style={{ color: '#6B6B6B', marginBottom: 16 }}>Your spaces</Text>
      {SPACES.filter((s) => enabled.includes(s.key)).map((s) => (
        <Pressable
          key={s.key}
          onPress={() => router.push(s.route as any)}
          style={{ padding: 16, marginBottom: 10, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E1DB' }}
        >
          <Text style={{ fontSize: 18, fontWeight: '600' }}>{s.label}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => router.push('/settings' as any)}
        style={{ padding: 16, marginTop: 8, borderRadius: 10, backgroundColor: '#F0F0F0' }}
      >
        <Text style={{ fontSize: 16 }}>Settings & data</Text>
      </Pressable>
    </ScrollView>
  );
}
