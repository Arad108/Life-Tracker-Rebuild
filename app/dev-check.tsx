import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { getDb } from '../src/db';

type CheckState = 'idle' | 'running' | 'pass' | 'fail';

function Row({ label, state, detail }: { label: string; state: CheckState; detail: string }) {
  const color = state === 'pass' ? '#3DD598' : state === 'fail' ? '#FF6B6B' : '#9A9AA5';
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowState, { color }]}>
          {state === 'running' ? 'running…' : state === 'pass' ? 'PASS' : state === 'fail' ? 'FAIL' : 'idle'}
        </Text>
      </View>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
    </View>
  );
}

/**
 * Developer-only environment check. Not linked from the product UI.
 * Verifies that the native SQLite module can write and read on device and that
 * the notification permission prompt can actually be requested.
 */
export default function DevCheck() {
  const [sqlite, setSqlite] = useState<CheckState>('idle');
  const [sqliteDetail, setSqliteDetail] = useState('');
  const [notif, setNotif] = useState<CheckState>('idle');
  const [notifDetail, setNotifDetail] = useState('');

  const runSqlite = useCallback(async () => {
    setSqlite('running');
    setSqliteDetail('');
    try {
      const db = getDb();
      await db.execAsync('CREATE TABLE IF NOT EXISTS __env_check (id INTEGER PRIMARY KEY, note TEXT)');
      await db.runAsync('DELETE FROM __env_check');
      await db.runAsync('INSERT INTO __env_check (note) VALUES (?)', ['round-trip']);
      const row = await db.getFirstAsync<{ note: string }>('SELECT note FROM __env_check LIMIT 1');
      const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM __env_check');
      await db.execAsync('DROP TABLE __env_check');
      if (row?.note === 'round-trip' && count?.n === 1) {
        setSqlite('pass');
        setSqliteDetail('Wrote and read back 1 row, then dropped the scratch table.');
      } else {
        setSqlite('fail');
        setSqliteDetail(`Unexpected read: ${JSON.stringify(row)}`);
      }
    } catch (e) {
      setSqlite('fail');
      setSqliteDetail(String(e));
    }
  }, []);

  const checkNotif = useCallback(async () => {
    setNotif('running');
    try {
      const current = await Notifications.getPermissionsAsync();
      setNotif(current.status === 'granted' ? 'pass' : 'idle');
      setNotifDetail(`Current status: ${current.status}`);
    } catch (e) {
      setNotif('fail');
      setNotifDetail(String(e));
    }
  }, []);

  const requestNotif = useCallback(async () => {
    setNotif('running');
    try {
      const result = await Notifications.requestPermissionsAsync();
      setNotif(result.status === 'granted' ? 'pass' : 'fail');
      setNotifDetail(`After request: ${result.status}`);
    } catch (e) {
      setNotif('fail');
      setNotifDetail(String(e));
    }
  }, []);

  useEffect(() => {
    runSqlite();
    checkNotif();
  }, [runSqlite, checkNotif]);

  const runtime = `${Constants.executionEnvironment ?? 'unknown'} · ${Constants.appOwnership ?? 'n/a'}`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Environment check</Text>
      <Text style={styles.subtitle}>{runtime}</Text>

      <Row label="SQLite write + read" state={sqlite} detail={sqliteDetail} />
      <Pressable style={styles.button} onPress={runSqlite}>
        <Text style={styles.buttonText}>Run SQLite check again</Text>
      </Pressable>

      <Row label="Notification permission" state={notif} detail={notifDetail} />
      <Pressable style={styles.button} onPress={requestNotif}>
        <Text style={styles.buttonText}>Request notification permission</Text>
      </Pressable>

      {sqlite === 'running' || notif === 'running' ? <ActivityIndicator color="#8B5CF6" /> : null}

      <Text style={styles.footer}>
        Dev-only route. The product UI never links here.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F1012' },
  content: { padding: 20, gap: 12 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#8E8E99', fontSize: 13, marginBottom: 8 },
  row: {
    backgroundColor: '#1B1B1D',
    borderColor: '#2A2C33',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  rowState: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  rowDetail: { color: '#B8B8C2', fontSize: 13, lineHeight: 18 },
  button: { backgroundColor: '#2A2C33', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  footer: { color: '#5F5F6A', fontSize: 12, marginTop: 12 },
});
