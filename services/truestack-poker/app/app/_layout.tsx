import { BarlowCondensed_700Bold, BarlowCondensed_900Black, useFonts } from '@expo-google-fonts/barlow-condensed';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { TablePreferencesProvider } from '../lib/tablePreferences';

export default function RootLayout() {
  // Fonts are bundled locally (not fetched), so this resolves in a tick or two -- a
  // blank frame is preferable to headers flashing in the system font and then swapping.
  const [fontsLoaded] = useFonts({ BarlowCondensed_700Bold, BarlowCondensed_900Black });
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <TablePreferencesProvider>
        <AuthProvider>
          <StatusBar style="light" translucent={false} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#17090D' },
              animation: 'fade',
            }}
          />
        </AuthProvider>
      </TablePreferencesProvider>
    </SafeAreaProvider>
  );
}
