import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { runFinancialMigrations } from '../../fin-core/src/db';
import { makeDriver } from '../src/db';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const driver = makeDriver();
        await runFinancialMigrations(driver, { now: () => Date.now() });
        setReady(true);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  if (error) {
    return null;
  }
  if (!ready) {
    return null;
  }
  return <Stack screenOptions={{ headerShown: true }} />;
}
