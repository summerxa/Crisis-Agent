import React, { Component, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

type AppTab = 'home' | 'map' | 'chat';
type HomePhase = 'crisis' | 'no-crisis' | 'refreshing' | 'updated';
type LayerKey = 'myLocation' | 'wildfire' | 'evacWarning' | 'evacOrder';
type SheetKey = 'wildfire' | 'evacWarning' | 'evacOrder' | null;
type StatusLevel = 'CLEAR' | 'AWARE' | 'PREPARE' | 'ACT' | 'RECOVER';
type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  source?: string;
};

const COLORS = {
  navy: '#1B3A5C',
  ink: '#1A1A1A',
  body: '#3A3D42',
  muted: '#9EA3AF',
  paper: '#F0EFE9',
  card: '#FFFFFF',
  line: '#E4E2DC',
  soft: '#F5F3EE',
  green: '#28775A',
  blue: '#2563EB',
  orange: '#C47B0E',
  red: '#C23535',
};

const STATUS_CONFIG: Record<StatusLevel, { bg: string; text: string }> = {
  CLEAR: { bg: '#E5F5EE', text: '#28775A' },
  AWARE: { bg: '#E6F0FB', text: '#2462A8' },
  PREPARE: { bg: '#FEF3DB', text: '#C47B0E' },
  ACT: { bg: '#FEEAEA', text: '#C23535' },
  RECOVER: { bg: '#E5F0F0', text: '#2A7070' },
};

const REFRESH_STEPS = [
  'Getting your location',
  'Checking official weather alerts',
  'Checking nearby wildfires',
  'Checking recent earthquakes',
  'Comparing with your previous update',
];

const SUGGESTED_PROMPTS = [
  'Do I need to leave?',
  'Am I in an evacuation zone?',
  'What should I pack?',
  'What changed since my last refresh?',
  'Why are you telling me to prepare?',
  'Where did this information come from?',
];

const SCRIPTED_RESPONSES: Record<string, { text: string; source?: string }> = {
  'Do I need to leave?': {
    text: 'No evacuation order currently includes your location. An evacuation warning has expanded nearby, so the current recommendation is to prepare essential items and continue monitoring official updates.',
    source: 'Santa Clara County OES · Updated 8 min ago',
  },
  'Am I in an evacuation zone?': {
    text: 'Your location in San Jose, CA falls within an Evacuation Warning zone. You are not currently in an Evacuation Order zone.',
    source: 'Santa Clara County OES · Zone B',
  },
  'What should I pack?': {
    text: 'Prioritize ID, prescription medications, chargers, a backup battery, water, non-perishable food, important documents, and a change of clothes.',
    source: 'Suggested by crisis agent · Not official guidance',
  },
  'What changed since my last refresh?': {
    text: 'The Canyon Fire grew to 4,200 acres, the evacuation warning expanded south, and a new road closure was reported on Almaden Expressway. Your personal evacuation status has not changed.',
    source: 'CAL FIRE & Santa Clara County OES',
  },
  'Why are you telling me to prepare?': {
    text: 'An official Evacuation Warning has been issued near your current location. A warning means evacuation is possible and you should be ready to leave quickly.',
    source: 'Santa Clara County Emergency Management',
  },
  'Where did this information come from?': {
    text: 'The summary checks Santa Clara County OES, CAL FIRE, NWS Bay Area, and 511 SF Bay for evacuation zones, fire status, weather, and road closures.',
    source: 'CAL FIRE, Santa Clara County OES, NWS, 511 SF Bay',
  },
};

const DEFAULT_RESPONSE = {
  text: 'Based on official data for San Jose, CA, there is an active Evacuation Warning nearby due to the Canyon Fire. No evacuation order currently covers your location.',
  source: 'Santa Clara County OES & CAL FIRE',
};

const LAYERS: { key: LayerKey; label: string; color: string }[] = [
  { key: 'myLocation', label: 'My Location', color: COLORS.blue },
  { key: 'wildfire', label: 'Wildfire', color: '#DC5012' },
  { key: 'evacWarning', label: 'Evac Warning', color: COLORS.orange },
  { key: 'evacOrder', label: 'Evac Order', color: COLORS.red },
];

const SHEET_CONTENT = {
  wildfire: {
    title: 'Canyon Fire',
    rows: [
      ['Status', 'Active'],
      ['Size', '4,200 acres'],
      ['Contained', '25%'],
      ['Behavior', 'Creeping, moderate rate of spread'],
      ['Wind', 'SW 12 mph, gusting to 24'],
    ],
    source: 'CAL FIRE — Canyon Fire Incident',
    updated: '8 minutes ago',
  },
  evacWarning: {
    title: 'Evacuation Warning',
    rows: [
      ['Status', 'Active'],
      ['Zone', 'Zone B — Almaden Valley South'],
      ['Issued', 'Today at 11:42 AM'],
      ['Meaning', 'Prepare to evacuate. Leave early if you need extra time.'],
    ],
    source: 'Santa Clara County OES',
    updated: '38 minutes ago',
  },
  evacOrder: {
    title: 'Evacuation Order',
    rows: [
      ['Status', 'Active'],
      ['Zone', 'Zone A — Almaden Foothills'],
      ['Issued', 'Today at 10:18 AM'],
      ['Meaning', 'Leave immediately. Do not return until the order is lifted.'],
    ],
    source: 'Santa Clara County OES',
    updated: '38 minutes ago',
  },
};

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
  const [homePhase, setHomePhase] = useState<HomePhase>('crisis');

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
              />
            )}
            {activeTab === 'map' && <MapScreen onBack={() => setActiveTab('home')} />}
            {activeTab === 'chat' && <ChatScreen />}
          </ErrorBoundary>
        </View>

        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function HomeScreen({
  phase,
  setPhase,
  onNavigate,
}: {
  phase: HomePhase;
  setPhase: (phase: HomePhase) => void;
  onNavigate: (tab: AppTab) => void;
}) {
  if (phase === 'refreshing') {
    return <RefreshingContent onComplete={() => setPhase('updated')} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {phase === 'no-crisis' ? (
        <NoCrisisContent onRefresh={() => setPhase('refreshing')} />
      ) : (
        <CrisisContent
          phase={phase}
          onNavigate={onNavigate}
          onRefresh={() => setPhase('refreshing')}
        />
      )}
    </ScrollView>
  );
}

function Header({
  sync,
  onRefresh,
}: {
  sync: string;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.header}>
      <View>
        <View style={styles.rowCenter}>
          <Text style={styles.locationIcon}>⌖</Text>
          <Text style={styles.locationText}>San Jose, CA</Text>
        </View>
        <Text style={styles.subtleText}>{sync}</Text>
      </View>
      <Pressable onPress={onRefresh} style={styles.refreshButton}>
        <Text style={styles.refreshText}>↻ Refresh</Text>
      </Pressable>
    </View>
  );
}

function CrisisContent({
  phase,
  onNavigate,
  onRefresh,
}: {
  phase: 'crisis' | 'updated';
  onNavigate: (tab: AppTab) => void;
  onRefresh: () => void;
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const isUpdated = phase === 'updated';
  const acres = isUpdated ? '4,200' : '3,100';
  const contained = isUpdated ? '25%' : '15%';
  const changes = isUpdated
    ? [
        'Fire grew by 1,100 acres (now 4,200 total)',
        'Evacuation warning expanded south',
        'New road closure reported on Almaden Expwy',
        'Your evacuation status is unchanged',
      ]
    : [
        'Canyon Fire reported by CAL FIRE',
        'Evacuation warning issued for nearby zones',
        'Wind shift reported — monitoring conditions',
        'No road closures affecting your area yet',
      ];

  return (
    <View>
      <Header
        sync={`${isUpdated ? 'Updated' : 'Last synced'} ${
          isUpdated ? 'Just now' : '2:14 PM'
        }`}
        onRefresh={onRefresh}
      />

      <CrisisMap compact onExpandMap={() => onNavigate('map')} />

      <View style={styles.card}>
        <View style={styles.cardPadded}>
          <StatusBadge level="PREPARE" />
          <Text style={styles.bodyText}>
            An evacuation warning has been issued nearby. Your current location
            is not under an evacuation order.
          </Text>
        </View>
        <Divider />
        <InfoBlock
          accent={COLORS.navy}
          title="Official Status"
          body="Evacuation warning nearby"
          caption="Source: Santa Clara County Emergency Management"
        />
        <Divider />
        <InfoBlock
          accent="#6366F1"
          title="Suggested action plan"
          body="Generated by your crisis agent"
          caption="Not official guidance"
        />
        <View style={styles.fireStrip}>
          <View>
            <Text style={styles.fireTitle}>Canyon Fire</Text>
            <Text style={styles.subtleText}>
              {acres} acres · {contained} contained
            </Text>
          </View>
          <View>
            <Text style={styles.distanceText}>8.4 mi away</Text>
            <Text style={styles.subtleText}>NE of your location</Text>
          </View>
        </View>
      </View>

      <SectionLabel>What to do now</SectionLabel>
      <View style={styles.card}>
        {[
          'Gather identification and essential medications',
          'Charge your phone and backup battery',
          'Keep essential belongings ready to go',
          'Continue monitoring evacuation updates',
        ].map((text, index) => (
          <ActionItem key={text} text={text} index={index} />
        ))}
      </View>

      <SectionLabel>Since your last refresh</SectionLabel>
      <View style={styles.card}>
        {changes.map(text => (
          <ChangeItem key={text} text={text} />
        ))}
      </View>

      <Pressable
        onPress={() => setSourcesOpen(open => !open)}
        style={[styles.card, styles.sourcesButton]}>
        <Text style={styles.sourceButtonText}>ⓘ Sources & attribution</Text>
        <Text style={styles.chevron}>{sourcesOpen ? '⌃' : '⌄'}</Text>
      </Pressable>
      {sourcesOpen && (
        <View style={[styles.card, styles.sourcesList]}>
          <SourceTag name="Santa Clara County OES" time="8 min ago" />
          <SourceTag name="CAL FIRE — Canyon Fire" time="8 min ago" />
          <SourceTag name="NWS Bay Area" time="12 min ago" />
          <SourceTag name="511 SF Bay — Road Closures" time="22 min ago" />
        </View>
      )}
    </View>
  );
}

function NoCrisisContent({ onRefresh }: { onRefresh: () => void }) {
  return (
    <View>
      <Header sync="Last checked 2:14 PM" onRefresh={onRefresh} />
      <CrisisMap
        compact
        layers={{
          myLocation: true,
          wildfire: false,
          evacWarning: false,
          evacOrder: false,
        }}
      />
      <View style={[styles.card, styles.clearCard]}>
        <View style={styles.clearIcon}>
          <Text style={styles.clearCheck}>✓</Text>
        </View>
        <View style={styles.flex}>
          <StatusBadge level="CLEAR" />
          <Text style={styles.clearText}>No immediate threats found near you</Text>
        </View>
      </View>
      <SectionLabel>Nearby activity</SectionLabel>
      <View style={styles.card}>
        {[
          ['M3.1 earthquake — 47 miles away', 'No action needed · 38 min ago'],
          ['Red flag warning — high fire risk', 'Dry winds through Thursday · NWS'],
          ['Minor coastal flooding advisory', 'Santa Cruz area · Not near you'],
        ].map(([title, sub]) => (
          <View key={title} style={styles.activityItem}>
            <Text style={styles.activityMark}>•</Text>
            <View style={styles.flex}>
              <Text style={styles.activityTitle}>{title}</Text>
              <Text style={styles.subtleText}>{sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function RefreshingContent({ onComplete }: { onComplete: () => void }) {
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timings = [400, 900, 1500, 2100, 2700];
    const timers = timings.map((delay, index) =>
      setTimeout(() => {
        setVisibleSteps(index + 1);
        setCurrentStep(index);
      }, delay),
    );
    const doneTimer = setTimeout(onComplete, 3600);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <View style={styles.refreshingScreen}>
      <View style={styles.refreshLocation}>
        <Text style={styles.locationIcon}>⌖</Text>
        <Text style={styles.locationText}>San Jose, CA</Text>
      </View>
      <View style={styles.bigSpinner}>
        <ActivityIndicator color={COLORS.navy} size="large" />
      </View>
      <Text style={styles.refreshTitle}>Checking your area</Text>
      <Text style={styles.refreshCaption}>
        Your crisis agent is consulting official sources
      </Text>

      <View style={styles.steps}>
        {REFRESH_STEPS.slice(0, visibleSteps).map((step, index) => {
          const done = index < currentStep;
          const active = index === currentStep;

          return (
            <View key={step} style={styles.stepRow}>
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDone,
                  active && styles.stepActive,
                ]}>
                {done && <Text style={styles.stepCheck}>✓</Text>}
              </View>
              <Text style={[styles.stepText, active && styles.stepTextActive]}>
                {step}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MapScreen({ onBack }: { onBack: () => void }) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    myLocation: true,
    wildfire: true,
    evacWarning: true,
    evacOrder: true,
  });
  const [sheet, setSheet] = useState<SheetKey>(null);
  const content = sheet ? SHEET_CONTENT[sheet] : null;

  return (
    <View style={styles.mapScreen}>
      <View style={styles.mapToolbar}>
        <Pressable onPress={onBack} style={styles.roundButton}>
          <Text style={styles.roundButtonText}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.toolbarTitle}>Canyon Fire — Map</Text>
          <Text style={styles.subtleText}>San Jose, CA · Updated 8 min ago</Text>
        </View>
      </View>
      <View style={styles.fullMapArea}>
        <CrisisMap
          layers={layers}
          onTapWildfire={() => setSheet('wildfire')}
          onTapEvacWarning={() => setSheet('evacWarning')}
          onTapEvacOrder={() => setSheet('evacOrder')}
        />
        <View style={styles.layerWrap}>
          {LAYERS.map(layer => {
            const active = layers[layer.key];
            return (
              <Pressable
                key={layer.key}
                onPress={() =>
                  setLayers(prev => ({ ...prev, [layer.key]: !prev[layer.key] }))
                }
                style={[
                  styles.layerChip,
                  active ? layerChipStyles[layer.key] : styles.layerChipInactive,
                ]}>
                <View
                  style={[
                    styles.layerDot,
                    active ? layerDotStyles[layer.key] : styles.layerDotInactive,
                  ]}
                />
                <Text
                  style={[
                    styles.layerText,
                    active ? layerTextStyles[layer.key] : styles.layerTextInactive,
                  ]}>
                  {layer.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!sheet && (
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>Tap map elements for details</Text>
          </View>
        )}
      </View>

      {content && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{content.title}</Text>
            <Pressable onPress={() => setSheet(null)} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          {content.rows.map(([label, value]) => (
            <View key={label} style={styles.sheetRow}>
              <Text style={styles.sheetLabel}>{label}</Text>
              <Text style={styles.sheetValue}>{value}</Text>
            </View>
          ))}
          <View style={styles.sheetSource}>
            <Text style={styles.sheetSourceText}>ⓘ {content.source}</Text>
            <Text style={styles.sheetSourceText}>Updated {content.updated}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function CrisisMap({
  compact = false,
  layers = {
    myLocation: true,
    wildfire: true,
    evacWarning: true,
    evacOrder: true,
  },
  onExpandMap,
  onTapWildfire,
  onTapEvacWarning,
  onTapEvacOrder,
}: {
  compact?: boolean;
  layers?: Record<LayerKey, boolean>;
  onExpandMap?: () => void;
  onTapWildfire?: () => void;
  onTapEvacWarning?: () => void;
  onTapEvacOrder?: () => void;
}) {
  return (
    <View style={[styles.crisisMap, compact ? styles.compactMap : styles.largeMap]}>
      <View style={styles.mapBlockA} />
      <View style={styles.mapBlockB} />
      <View style={styles.mapBlockC} />
      <View style={styles.mapParkOne} />
      <View style={styles.mapParkTwo} />
      <View style={styles.creek} />
      {[48, 84, 138, 176, 216, 240, 260].map(top => (
        <View key={`h-${top}`} style={[styles.roadH, { top }]} />
      ))}
      {[55, 96, 150, 200, 235, 320, 365].map(left => (
        <View key={`v-${left}`} style={[styles.roadV, { left }]} />
      ))}
      <View style={styles.diagonalRoad} />

      {layers.evacWarning && (
        <Pressable
          onPress={onTapEvacWarning}
          style={[styles.zone, styles.warningZone]}
        />
      )}
      {layers.evacOrder && (
        <Pressable onPress={onTapEvacOrder} style={[styles.zone, styles.orderZone]} />
      )}
      {layers.wildfire && (
        <Pressable onPress={onTapWildfire} style={styles.firePerimeter}>
          <Text style={styles.fireMarker}>▲</Text>
        </Pressable>
      )}
      {layers.wildfire && layers.myLocation && (
        <>
          <View style={styles.distanceLine} />
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceBadgeText}>8.4 mi</Text>
          </View>
        </>
      )}
      {layers.myLocation && (
        <View style={styles.myLocation}>
          <View style={styles.myLocationInner} />
        </View>
      )}

      {compact && (
        <View style={styles.legend}>
          <LegendRow color={COLORS.orange} label="Evac Warning" />
          <LegendRow color={COLORS.red} label="Evac Order" />
          <LegendRow color="#DC5012" label="Fire Perimeter" />
          <LegendRow color={COLORS.blue} label="Your Location" />
        </View>
      )}
      {compact && onExpandMap && (
        <Pressable onPress={onExpandMap} style={styles.expandButton}>
          <Text style={styles.expandText}>⛶ Full map</Text>
        </Pressable>
      )}
      <Text style={styles.attribution}>© OpenStreetMap</Text>
    </View>
  );
}

function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 0,
      role: 'assistant' as const,
      text: "I'm your crisis assistant for the Canyon Fire situation near San Jose. I can answer questions about your evacuation status, what to do, or what changed since your last update.",
      source: 'Grounded in: CAL FIRE, Santa Clara County OES, NWS Bay Area',
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const idRef = useRef(1);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) {
      return;
    }

    setMessages(prev => [
      ...prev,
      { id: idRef.current++, role: 'user' as const, text: trimmed },
    ]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const response = SCRIPTED_RESPONSES[trimmed] ?? DEFAULT_RESPONSE;
      setMessages(prev => [
        ...prev,
        {
          id: idRef.current++,
          role: 'assistant' as const,
          text: response.text,
          source: response.source,
        },
      ]);
      setIsTyping(false);
    }, 1100);
  };

  return (
    <View style={styles.chatScreen}>
      <View style={styles.chatHeader}>
        <Text style={styles.chatTitle}>Ask about this crisis</Text>
        <Text style={styles.onlineText}>● Canyon Fire · San Jose, CA</Text>
      </View>
      <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {messages.map(message => (
          <View
            key={message.id}
            style={[
              styles.messageRow,
              message.role === 'user' && styles.messageRowUser,
            ]}>
            {message.role === 'assistant' && (
              <View style={styles.assistantAvatar}>
                <Text style={styles.avatarText}>i</Text>
              </View>
            )}
            <View
              style={[
                styles.messageBubble,
                message.role === 'user'
                  ? styles.userBubble
                  : styles.assistantBubble,
              ]}>
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user' && styles.userMessageText,
                ]}>
                {message.text}
              </Text>
              {message.role === 'assistant' && message.source && (
                <Text style={styles.messageSource}>ⓘ {message.source}</Text>
              )}
            </View>
          </View>
        ))}
        {isTyping && (
          <View style={styles.typingRow}>
            <View style={styles.assistantAvatar}>
              <Text style={styles.avatarText}>i</Text>
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator color={COLORS.muted} />
            </View>
          </View>
        )}
      </ScrollView>

      {messages.length <= 1 && (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionTitle}>Suggested questions</Text>
          <View style={styles.promptWrap}>
            {SUGGESTED_PROMPTS.map(prompt => (
              <Pressable
                key={prompt}
                onPress={() => sendMessage(prompt)}
                style={styles.promptChip}>
                <Text style={styles.promptText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage(input)}
          placeholder="Ask about the Canyon Fire..."
          placeholderTextColor="#C0BDB7"
          style={styles.input}
        />
        <Pressable
          disabled={!input.trim() || isTyping}
          onPress={() => sendMessage(input)}
          style={[
            styles.sendButton,
            !!input.trim() && !isTyping && styles.sendButtonReady,
          ]}>
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}) {
  const tabs: { key: AppTab; label: string; icon: string }[] = [
    { key: 'home', label: 'Home', icon: '⌂' },
    { key: 'map', label: 'Map', icon: '⌖' },
    { key: 'chat', label: 'Ask', icon: '◌' },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map(tab => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            style={styles.navItem}>
            <Text style={[styles.navIcon, active && styles.navActive]}>
              {tab.icon}
            </Text>
            <Text style={[styles.navLabel, active && styles.navActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusBadge({ level }: { level: StatusLevel }) {
  const config = STATUS_CONFIG[level];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: config.text }]} />
      <Text style={[styles.badgeText, { color: config.text }]}>{level}</Text>
    </View>
  );
}

function InfoBlock({
  accent,
  title,
  body,
  caption,
}: {
  accent: string;
  title: string;
  body: string;
  caption: string;
}) {
  return (
    <View style={styles.infoBlock}>
      <Text style={[styles.infoTitle, { color: accent }]}>■ {title}</Text>
      <Text style={styles.infoBody}>{body}</Text>
      <Text style={styles.subtleText}>{caption}</Text>
    </View>
  );
}

function ActionItem({ text, index }: { text: string; index: number }) {
  const icons = ['ID', 'BAT', 'GO', 'SIG'];
  return (
    <View style={styles.actionItem}>
      <View style={styles.actionIcon}>
        <Text style={styles.actionIconText}>{icons[index] ?? '•'}</Text>
      </View>
      <Text style={styles.actionText}>{text}</Text>
    </View>
  );
}

function ChangeItem({ text }: { text: string }) {
  return (
    <View style={styles.changeItem}>
      <View style={styles.changeDot} />
      <Text style={styles.changeText}>{text}</Text>
    </View>
  );
}

function SourceTag({ name, time }: { name: string; time: string }) {
  return (
    <View style={styles.sourceTag}>
      <Text style={styles.sourceName}>ⓘ {name}</Text>
      <Text style={styles.subtleText}>{time}</Text>
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  scrollContent: {
    paddingBottom: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationIcon: {
    color: COLORS.blue,
    fontSize: 14,
    fontWeight: '800',
  },
  locationText: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  subtleText: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 3,
  },
  refreshButton: {
    backgroundColor: COLORS.navy,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  refreshText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEEAE3',
    overflow: 'hidden',
  },
  cardPadded: {
    padding: 16,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bodyText: {
    color: COLORS.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 9,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0EDE8',
    marginHorizontal: 16,
  },
  infoBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  infoBody: {
    color: COLORS.body,
    fontSize: 12,
    fontWeight: '700',
  },
  fireStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FDF7EE',
    borderTopWidth: 1,
    borderTopColor: '#F0EDE8',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  fireTitle: {
    color: COLORS.orange,
    fontSize: 13,
    fontWeight: '800',
  },
  distanceText: {
    color: COLORS.body,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  sectionLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 2,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDE8',
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.soft,
  },
  actionIconText: {
    color: COLORS.body,
    fontSize: 10,
    fontWeight: '800',
  },
  actionText: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 13,
    lineHeight: 18,
    paddingTop: 5,
  },
  changeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  changeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.orange,
    marginTop: 7,
  },
  changeText: {
    flex: 1,
    color: COLORS.body,
    fontSize: 13,
    lineHeight: 18,
  },
  sourcesButton: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceButtonText: {
    color: COLORS.body,
    fontSize: 12,
    fontWeight: '800',
  },
  chevron: {
    color: COLORS.muted,
    fontSize: 16,
  },
  sourcesList: {
    marginTop: 4,
    paddingHorizontal: 16,
  },
  sourceTag: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDE8',
  },
  sourceName: {
    color: COLORS.body,
    fontSize: 12,
    fontWeight: '700',
  },
  clearCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  clearIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F5EE',
  },
  clearCheck: {
    color: COLORS.green,
    fontSize: 20,
    fontWeight: '900',
  },
  clearText: {
    color: COLORS.body,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  activityItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDE8',
  },
  activityMark: {
    color: COLORS.orange,
    fontSize: 22,
    lineHeight: 22,
  },
  activityTitle: {
    color: COLORS.body,
    fontSize: 13,
    fontWeight: '700',
  },
  flex: {
    flex: 1,
  },
  refreshingScreen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  refreshLocation: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 36,
  },
  bigSpinner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EBF0F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  refreshTitle: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  refreshCaption: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 28,
  },
  steps: {
    width: '100%',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDE8',
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDone: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  stepActive: {
    borderColor: COLORS.navy,
  },
  stepCheck: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  stepText: {
    color: COLORS.body,
    fontSize: 13,
  },
  stepTextActive: {
    color: COLORS.ink,
    fontWeight: '700',
  },
  mapScreen: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  mapToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  roundButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.soft,
  },
  roundButtonText: {
    color: COLORS.ink,
    fontSize: 24,
    lineHeight: 26,
  },
  toolbarTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  fullMapArea: {
    flex: 1,
    position: 'relative',
  },
  layerWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  layerChipInactive: {
    borderColor: COLORS.line,
  },
  layerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  layerDotInactive: {
    backgroundColor: '#D0CCC4',
  },
  layerText: {
    fontSize: 11,
    fontWeight: '800',
  },
  layerTextInactive: {
    color: COLORS.muted,
  },
  tapHint: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tapHintText: {
    color: '#5A5E68',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomSheet: {
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.line,
    marginVertical: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetTitle: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.soft,
  },
  closeText: {
    color: COLORS.muted,
    fontSize: 20,
    lineHeight: 22,
  },
  sheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 5,
  },
  sheetLabel: {
    color: COLORS.muted,
    fontSize: 12,
  },
  sheetValue: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  sheetSource: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0EDE8',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  sheetSourceText: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 10,
  },
  crisisMap: {
    width: '100%',
    backgroundColor: '#DED9CF',
    overflow: 'hidden',
    position: 'relative',
  },
  compactMap: {
    height: 192,
  },
  largeMap: {
    flex: 1,
  },
  mapBlockA: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '38%',
    height: '45%',
    backgroundColor: '#D8D3C9',
  },
  mapBlockB: {
    position: 'absolute',
    left: '40%',
    top: 0,
    width: '28%',
    height: '70%',
    backgroundColor: '#D8D3C9',
  },
  mapBlockC: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '32%',
    height: '48%',
    backgroundColor: '#D8D3C9',
  },
  mapParkOne: {
    position: 'absolute',
    left: 18,
    top: 18,
    width: 72,
    height: 64,
    backgroundColor: '#C2D9A8',
    transform: [{ rotate: '2deg' }],
  },
  mapParkTwo: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 68,
    height: 54,
    backgroundColor: '#C2D9A8',
  },
  creek: {
    position: 'absolute',
    left: '41%',
    top: 36,
    width: 4,
    height: '72%',
    borderRadius: 2,
    backgroundColor: '#A4C4DA',
    transform: [{ rotate: '4deg' }],
  },
  roadH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#F0EDE5',
  },
  roadV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#F0EDE5',
  },
  diagonalRoad: {
    position: 'absolute',
    left: -30,
    bottom: 80,
    width: '120%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EDE8DF',
    transform: [{ rotate: '-32deg' }],
  },
  zone: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  warningZone: {
    top: -20,
    right: -40,
    width: '76%',
    height: '96%',
    borderColor: COLORS.orange,
    backgroundColor: 'rgba(201,123,14,0.09)',
    transform: [{ rotate: '-4deg' }],
  },
  orderZone: {
    top: 30,
    right: 28,
    width: '31%',
    height: '29%',
    borderColor: COLORS.red,
    backgroundColor: 'rgba(196,53,53,0.1)',
    transform: [{ rotate: '9deg' }],
  },
  firePerimeter: {
    position: 'absolute',
    top: 46,
    right: 52,
    width: 66,
    height: 52,
    borderRadius: 28,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#DC5012',
    backgroundColor: 'rgba(220,80,18,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireMarker: {
    color: '#DC5012',
    fontSize: 24,
    fontWeight: '900',
  },
  distanceLine: {
    position: 'absolute',
    left: '38%',
    top: '41%',
    width: '42%',
    height: 1,
    borderTopWidth: 1,
    borderTopColor: '#8A8E96',
    transform: [{ rotate: '-38deg' }],
    opacity: 0.55,
  },
  distanceBadge: {
    position: 'absolute',
    left: '53%',
    top: '43%',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  distanceBadgeText: {
    color: '#5A5E68',
    fontSize: 9,
    fontWeight: '800',
  },
  myLocation: {
    position: 'absolute',
    left: '36%',
    top: '70%',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.blue,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLocationInner: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  legend: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 6,
    padding: 7,
    gap: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 6,
    borderRadius: 1,
  },
  legendText: {
    color: '#5A5E68',
    fontSize: 8,
    fontWeight: '700',
  },
  expandButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  expandText: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  attribution: {
    position: 'absolute',
    right: 10,
    bottom: 6,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 9,
    fontWeight: '700',
  },
  chatScreen: {
    flex: 1,
    backgroundColor: COLORS.paper,
  },
  chatHeader: {
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  chatTitle: {
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  onlineText: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 14,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubble: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: COLORS.navy,
    borderBottomRightRadius: 4,
  },
  messageText: {
    color: COLORS.ink,
    fontSize: 13,
    lineHeight: 19,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  messageSource: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 7,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingBubble: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  suggestions: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  suggestionTitle: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  promptWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  promptChip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  promptText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    minHeight: 40,
    backgroundColor: COLORS.soft,
    borderRadius: 20,
    paddingHorizontal: 14,
    color: COLORS.ink,
    fontSize: 13,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonReady: {
    backgroundColor: COLORS.navy,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  bottomNav: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingBottom: 14,
    paddingTop: 8,
  },
  navItem: {
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 3,
  },
  navIcon: {
    color: COLORS.muted,
    fontSize: 21,
    fontWeight: '800',
  },
  navLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  navActive: {
    color: COLORS.navy,
  },
  errorBox: {
    margin: 16,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  errorTitle: {
    color: COLORS.red,
    fontWeight: '900',
    marginBottom: 4,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 12,
  },
});

const layerChipStyles = StyleSheet.create<Record<LayerKey, { borderColor: string }>>({
  myLocation: { borderColor: COLORS.blue },
  wildfire: { borderColor: '#DC5012' },
  evacWarning: { borderColor: COLORS.orange },
  evacOrder: { borderColor: COLORS.red },
});

const layerDotStyles = StyleSheet.create<Record<LayerKey, { backgroundColor: string }>>({
  myLocation: { backgroundColor: COLORS.blue },
  wildfire: { backgroundColor: '#DC5012' },
  evacWarning: { backgroundColor: COLORS.orange },
  evacOrder: { backgroundColor: COLORS.red },
});

const layerTextStyles = StyleSheet.create<Record<LayerKey, { color: string }>>({
  myLocation: { color: COLORS.blue },
  wildfire: { color: '#DC5012' },
  evacWarning: { color: COLORS.orange },
  evacOrder: { color: COLORS.red },
});

export default App;
