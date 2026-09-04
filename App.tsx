import "react-native-get-random-values";

import React, { Component, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StatusBar, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import BottomNav from './src/components/BottomNav';
import ChatScreen from './src/screens/ChatScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import { styles } from './src/styles';
import type { AppTab, HomePhase } from './src/types';
import { useCrisisData } from './src/hooks/useCrisisData';
import { getOrCreateSessionId } from './src/services/sessionStorage';
import { COLORS } from './src/constants';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Render error</Text>
          <Text style={styles.errorText}>{this.state.error}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function AppBody({ sessionId, isDarkMode }: { sessionId: string, isDarkMode: boolean }) {
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [homePhase, setHomePhase] = useState<HomePhase>('no-crisis');
  const crisisData = useCrisisData();

  if (crisisData.locationAccess === 'denied') {
    return <LocationPermissionWarning isDarkMode={isDarkMode} />;
  }

  return (
    <>
      <View style={styles.screen}>
        <ErrorBoundary>
          {activeTab === 'home' && (
            <HomeScreen
              phase={homePhase}
              setPhase={setHomePhase}
              onNavigate={setActiveTab}
              crisisData={crisisData}
            />
          )}
          {activeTab === 'map' && (
            <MapScreen
              onBack={() => setActiveTab('home')}
              onNavigate={setActiveTab}
              crisisData={crisisData}
            />
          )}
          {activeTab === 'chat' && <ChatScreen />}
        </ErrorBoundary>
      </View>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getOrCreateSessionId()
      .then(nextSessionId => {
        if (!cancelled) {
          setSessionId(nextSessionId);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setSessionError(error instanceof Error ? error.message : 'Could not load session.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={styles.app}>
        {sessionError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Session error</Text>
            <Text style={styles.errorText}>{sessionError}</Text>
          </View>
        ) : sessionId ? (
          <AppBody sessionId={sessionId} isDarkMode={isDarkMode} />
        ) : (
          <View style={styles.refreshingScreen}>
            <ActivityIndicator color={COLORS.navy} size="large" />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export function LocationPermissionWarning({ isDarkMode }: { isDarkMode: boolean }) {
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const openSettings = async () => {
    setSettingsError(null);
    try {
      await Linking.openSettings();
    } catch {
      setSettingsError('Unable to open Settings. Please open your device settings manually.');
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={styles.permissionScreen}>
        <View accessibilityRole="alert" style={styles.permissionCard}>
          <Text style={styles.permissionIcon}>⌖</Text>
          <Text style={styles.permissionTitle}>Location permission required</Text>
          <Text style={styles.permissionMessage}>
            Crisis Agent needs your location to provide location-specific crisis information.{' '}
            Please enable Location in Settings, then restart the app.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={openSettings}
            style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </Pressable>
          {settingsError && (
            <Text accessibilityLiveRegion="assertive" style={styles.permissionError}>
              {settingsError}
            </Text>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;
