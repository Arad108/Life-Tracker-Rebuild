import { useEffect, useState } from 'react';
import { Text, View, ScrollView } from 'react-native';
import { runFinancialMigrations, loadAccounts, loadTransactions, balanceOf } from '../fin-core/src';
import { makeDriver } from '../src/db';

export default function Finance() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const driver = makeDriver();
      await runFinancialMigrations(driver);
      const accs = await loadAccounts(driver);
      const txs = await loadTransactions(driver);
      setAccounts(accs);
      setTransactions(txs);
    })();
  }, []);

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Finance</Text>
      <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 8 }}>Accounts</Text>
      {accounts.map((a) => (
        <View key={a.id} style={{ paddingVertical: 6 }}>
          <Text>{a.name} ({a.type}) — {balanceOf(a, transactions).value} paise</Text>
        </View>
      ))}
      <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 12 }}>Recent transactions</Text>
      {transactions.slice(0, 20).map((t) => (
        <View key={t.id} style={{ paddingVertical: 4 }}>
          <Text>{t.day} · {t.kind} · {t.amountMinor} paise · {t.note}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

