import React, { Component, useRef, useState } from 'react';
import { StatusBar, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import BottomNav from './src/components/BottomNav';
import ChatScreen from './src/screens/ChatScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import { styles } from './src/styles';
import type { AppTab, HomePhase } from './src/types';
import { useCrisisData } from './src/hooks/useCrisisData';

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

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [homePhase, setHomePhase] = useState<HomePhase>('no-crisis');
  const chatAgentSessionId = useRef(uuidv4()).current;
  const todoListAgentSessionId = useRef(uuidv4()).current;
  const crisisData = useCrisisData();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={styles.app}>
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
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;
