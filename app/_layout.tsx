import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { runFinancialMigrations } from '../fin-core/src/db';
import { makeDriver } from '../src/db';
import { runAppMigrations } from '../src/appMigrations';
import { runExtendedMigrations } from '../src/extendedMigrations';
import { runTrackerMigrations } from '../src/tracker/migrations';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular: require('../assets/fonts/Inter-Regular.ttf'),
    Inter_500Medium: require('../assets/fonts/Inter-Medium.ttf'),
    Inter_600SemiBold: require('../assets/fonts/Inter-SemiBold.ttf'),
    Inter_700Bold: require('../assets/fonts/Inter-Bold.ttf'),
  });

  useEffect(() => {
    (async () => {
      try {
        const driver = makeDriver();
        await runFinancialMigrations(driver, { now: () => Date.now() });
        await runAppMigrations();
        await runExtendedMigrations();
        await runTrackerMigrations();
        setReady(true);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  if (error || fontError) {
    return null;
  }
  if (!ready || !fontsLoaded) {
    return null;
  }
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="tracker/new" options={{ headerShown: false }} />
      <Stack.Screen name="tracker/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}

