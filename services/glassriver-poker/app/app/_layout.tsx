import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './lib/auth';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" translucent={false} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#060816' },
            animation: 'fade',
          }}
        />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
