import { useState } from 'react';
import { Text, View, ScrollView, Pressable } from 'react-native';
import { runFinancialMigrations } from '../fin-core/src/db';
import { makeDriver } from '../src/db';
import { fullBackup } from '../src/backup';
import * as Sharing from 'expo-sharing';

export default function Settings() {
  const [status, setStatus] = useState('');

  const backup = async () => {
    try {
      const uri = await fullBackup();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
      setStatus('Backup created: ' + uri);
    } catch (e) {
      setStatus(String(e));
    }
  };

  const migrate = async () => {
    try {
      const driver = makeDriver();
      const report = await runFinancialMigrations(driver, { now: () => Date.now() });
      setStatus(`Migrations applied: ${report.applied.join(', ') || 'none'}`);
    } catch (e) {
      setStatus(String(e));
    }
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Settings & data</Text>
      <Pressable onPress={backup} style={{ padding: 12, backgroundColor: '#4F46E5', borderRadius: 8, marginBottom: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Export full backup (ZIP, incl. photos)</Text>
      </Pressable>
      <Pressable onPress={migrate} style={{ padding: 12, backgroundColor: '#10B981', borderRadius: 8, marginBottom: 8 }}>
        <Text style={{ color: '#fff', textAlign: 'center' }}>Run financial migrations</Text>
      </Pressable>
      {status ? <Text style={{ marginTop: 12 }}>{status}</Text> : null}
      <Text style={{ marginTop: 24, color: '#6B6B6B', fontSize: 12 }}>
        Photos are stored on device and are included in the ZIP backup.
      </Text>
    </ScrollView>
  );
}

