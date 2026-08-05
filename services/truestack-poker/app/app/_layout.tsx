import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './lib/auth';
import { TablePreferencesProvider } from './lib/tablePreferences';

export default function RootLayout() {
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
