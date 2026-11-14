import { useEffect, useState } from 'react';
import { Text, View, ScrollView, Pressable } from 'react-native';
import { queryTransactions, sliceSummary } from '../fin-core/src';
import { makeDriver } from '../src/db';

export default function SliceLens() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const driver = makeDriver();
      const page = await queryTransactions(driver, { source: 'slice_statement', limit: 100 });
      setRows(page.rows as any);
      const all = await queryTransactions(driver, { limit: 1000 });
      setSummary(sliceSummary(all.rows, { from: '2026-01-01', to: '2026-12-31' }));
    })();
  }, []);

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Slice Lens</Text>
      {summary && (
        <View style={{ marginBottom: 12, padding: 12, backgroundColor: '#F0F0F0', borderRadius: 8 }}>
          <Text>Outgoing: {summary.outgoing} paise</Text>
          <Text>Incoming: {summary.incoming} paise</Text>
          <Text>Transactions: {summary.count}</Text>
        </View>
      )}
      <Text style={{ fontWeight: '600', marginBottom: 8 }}>Slice transactions</Text>
      {rows.map((t) => (
        <View key={t.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: '#EFEDE8' }}>
          <Text>{t.day} · {t.amountMinor} paise · {t.note}</Text>
          <Text style={{ color: '#6B6B6B', fontSize: 12 }}>ref: {t.sourceRef ?? 'none'}</Text>
        </View>
      ))}
      {rows.length === 0 && <Text style={{ color: '#6B6B6B' }}>No Slice transactions yet. Import a statement to populate.</Text>}
    </ScrollView>
  );
}

