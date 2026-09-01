import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { LAYERS } from '../constants';
import { layerChipStyles, layerDotStyles, layerTextStyles, styles } from '../styles';
import type { AppTab, CrisisDataState, CrisisFeature, LayerKey, Position, SourceHealth } from '../types';
import CrisisMap from '../components/CrisisMap';
import ChatPrompt from '../components/ChatPrompt';
import { fetchCrisisFeatures } from '../services/crisisSources';
import { TestLocationRequestGuard, validateTestCoordinates } from '../services/testLocation';

type TestData = {
  position: Position | null;
  features: CrisisFeature[];
  sourceHealth: Record<'nws' | 'wfigs', SourceHealth> | null;
  loading: boolean;
  stale: boolean;
  message: string | null;
};

const initialTestData: TestData = {
  position: null,
  features: [],
  sourceHealth: null,
  loading: false,
  stale: false,
  message: null,
};

export default function MapScreen({
  onBack,
  onNavigate,
  crisisData,
}: {
  onBack: () => void;
  onNavigate: (tab: AppTab) => void;
  crisisData: CrisisDataState;
}) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    myLocation: true,
    weatherAlerts: true,
    wildfires: true,
    evacWarning: false,
    evacOrder: false,
  });
  const [selected, setSelected] = useState<CrisisFeature | null>(null);
  const [locationTestMode, setLocationTestMode] = useState(false);
  const [latitudeText, setLatitudeText] = useState('');
  const [longitudeText, setLongitudeText] = useState('');
  const [testData, setTestData] = useState<TestData>(initialTestData);
  const testRequestGuard = useRef(new TestLocationRequestGuard());
  const snapshot = crisisData.snapshot;
  const activeLocation = locationTestMode ? testData.position : snapshot?.location ?? null;
  const locationLabel = activeLocation
    ? `${activeLocation.latitude.toFixed(4)}, ${activeLocation.longitude.toFixed(4)}`
    : locationTestMode ? 'Enter a test location' : 'Waiting for location';

  const exitTestMode = () => {
    testRequestGuard.current.cancel();
    setLocationTestMode(false);
    setSelected(null);
    setTestData(initialTestData);
  };

  const applyTestLocation = async () => {
    const validation = validateTestCoordinates(latitudeText, longitudeText);
    if (!validation.position) {
      setTestData(previous => ({ ...previous, message: validation.error }));
      return;
    }
    const position = validation.position;
    const requestId = testRequestGuard.current.begin();
    setSelected(null);
    setTestData(previous => ({ ...previous, position, loading: true, message: null }));
    try {
      const result = await fetchCrisisFeatures(position);
      if (!testRequestGuard.current.isCurrent(requestId)) return;
      const failedSources = Object.values(result.sourceHealth).filter(source => source.status === 'error').length;
      const allFailed = failedSources === 2;
      const message = allFailed
        ? 'Live official sources are unavailable. This is not an all-clear.'
        : failedSources === 1
          ? 'One official source failed. Results may be incomplete.'
          : result.features.length === 0
            ? 'Official sources returned no mapped threats for this test point.'
            : `${result.features.length} official map feature${result.features.length === 1 ? '' : 's'} found.`;
      setTestData({ position, features: result.features, sourceHealth: result.sourceHealth, loading: false, stale: failedSources > 0, message });
    } catch (error) {
      if (!testRequestGuard.current.isCurrent(requestId)) return;
      setTestData(previous => ({
        ...previous,
        loading: false,
        stale: true,
        message: error instanceof Error ? error.message : 'Unable to check this test location.',
      }));
    }
  };

  return (
    <View style={styles.mapScreen}>
      <View style={styles.mapToolbar}>
        <Pressable onPress={onBack} style={styles.roundButton}>
          <Text style={styles.roundButtonText}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.toolbarTitle}>Live crisis map</Text>
          <Text style={styles.subtleText}>{locationLabel}{(locationTestMode ? testData.stale : snapshot?.stale) ? ' · Data may be incomplete' : ''}</Text>
        </View>
        {__DEV__ && <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: locationTestMode }}
          onPress={() => locationTestMode ? exitTestMode() : (setLocationTestMode(true), setSelected(null))}
          style={[styles.testModeToggle, locationTestMode && styles.testModeToggleActive]}>
          <View style={[styles.testModeDot, locationTestMode && styles.testModeDotActive]} />
          <Text style={[styles.testModeText, locationTestMode && styles.testModeTextActive]}>{locationTestMode ? 'Use GPS' : 'Test location'}</Text>
        </Pressable>}
      </View>
      {__DEV__ && locationTestMode && (
        <View style={styles.testLocationControls}>
          <Text style={styles.testLocationWarning}>TEST LOCATION — not your current position</Text>
          <View style={styles.testLocationInputRow}>
            <TextInput accessibilityLabel="Test latitude" value={latitudeText} onChangeText={setLatitudeText} placeholder="Latitude" keyboardType="numbers-and-punctuation" style={styles.testLocationInput} />
            <TextInput accessibilityLabel="Test longitude" value={longitudeText} onChangeText={setLongitudeText} placeholder="Longitude" keyboardType="numbers-and-punctuation" style={styles.testLocationInput} />
            <Pressable accessibilityRole="button" onPress={applyTestLocation} style={[styles.testLocationApply, testData.loading && styles.testLocationApplyDisabled]}>
              <Text style={styles.testLocationApplyText}>{testData.loading ? 'Checking…' : 'Apply location'}</Text>
            </Pressable>
          </View>
          {testData.message && <Text accessibilityLiveRegion="polite" style={[styles.testLocationMessage, testData.stale && styles.testLocationMessageWarning]}>{testData.message}</Text>}
        </View>
      )}
      <View style={styles.fullMapArea}>
        <CrisisMap
          layers={layers}
          location={activeLocation}
          simulatedPosition={locationTestMode}
          features={locationTestMode ? testData.features : snapshot?.features ?? []}
          loading={locationTestMode ? testData.loading : crisisData.loading}
          stale={locationTestMode ? testData.stale : snapshot?.stale}
          statusMessage={locationTestMode ? 'Live test results may be incomplete' : undefined}
          onSelectFeature={setSelected}
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
        {!selected && (
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>Tap map elements for details</Text>
          </View>
        )}
      </View>

      {selected && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{selected.title}</Text>
            <Pressable onPress={() => setSelected(null)} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          {[
            ['Status', selected.status],
            ['Type', selected.kind === 'wildfire' ? 'Wildfire' : 'Weather alert'],
            ...(selected.severity ? [['Severity', selected.severity]] : []),
            ...(selected.description ? [['Details', selected.description]] : []),
          ].map(([label, value]) => (
            <View key={label} style={styles.sheetRow}>
              <Text style={styles.sheetLabel}>{label}</Text>
              <Text style={styles.sheetValue}>{value}</Text>
            </View>
          ))}
          <View style={styles.sheetSource}>
            <Text style={styles.sheetSourceText}>ⓘ {selected.sourceName}</Text>
            <Text style={styles.sheetSourceText}>Updated {new Date(selected.updatedAt).toLocaleString()}</Text>
          </View>
        </View>
      )}
      <ChatPrompt onPress={() => onNavigate('chat')} /> 
    </View>
  );
}
