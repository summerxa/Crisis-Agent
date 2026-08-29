import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LAYERS } from '../constants';
import { layerChipStyles, layerDotStyles, layerTextStyles, styles } from '../styles';
import type { AppTab, CrisisDataState, CrisisFeature, LayerKey, Position } from '../types';
import CrisisMap from '../components/CrisisMap';
import ChatPrompt from '../components/ChatPrompt';
import { getCurrentPosition } from '../services/location';
import { initialMapLifecycle, mapLifecycleLabel } from '../services/mapLifecycle';
import { getLocationTestMapData } from '../services/locationTestMap';

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
  const [testLocation, setTestLocation] = useState<Position | null>(null);
  const [testLocationLoading, setTestLocationLoading] = useState(false);
  const [testLocationError, setTestLocationError] = useState<string | null>(null);
  const [mapLifecycle, setMapLifecycle] = useState(initialMapLifecycle);
  const snapshot = crisisData.snapshot;
  const activeLocation = locationTestMode ? testLocation : snapshot?.location ?? null;
  const locationTestMapData = getLocationTestMapData(testLocation);
  const locationLabel = activeLocation
    ? `${activeLocation.latitude.toFixed(4)}, ${activeLocation.longitude.toFixed(4)}`
    : locationTestMode && testLocationError ? 'Location unavailable' : 'Waiting for location';

  const runLocationTest = useCallback(async () => {
    setTestLocationLoading(true);
    setTestLocationError(null);
    try {
      setTestLocation(await getCurrentPosition());
    } catch (error) {
      setTestLocationError(error instanceof Error ? error.message : 'Unable to get your location.');
    } finally {
      setTestLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (locationTestMode) runLocationTest();
  }, [locationTestMode, runLocationTest]);

  return (
    <View style={styles.mapScreen}>
      <View style={styles.mapToolbar}>
        <Pressable onPress={onBack} style={styles.roundButton}>
          <Text style={styles.roundButtonText}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.toolbarTitle}>Live crisis map</Text>
          <Text style={styles.subtleText}>{locationLabel}{snapshot?.stale ? ' · Data may be stale' : ''}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: locationTestMode }}
          onPress={() => {
            setLocationTestMode(enabled => !enabled);
            setSelected(null);
          }}
          style={[styles.testModeToggle, locationTestMode && styles.testModeToggleActive]}>
          <View style={[styles.testModeDot, locationTestMode && styles.testModeDotActive]} />
          <Text style={[styles.testModeText, locationTestMode && styles.testModeTextActive]}>Location test</Text>
        </Pressable>
      </View>
      <View style={styles.fullMapArea}>
        <CrisisMap
          layers={locationTestMode ? locationTestMapData.layers : layers}
          location={activeLocation}
          features={locationTestMode ? locationTestMapData.features : snapshot?.features ?? []}
          loading={locationTestMode ? locationTestMapData.loading : crisisData.loading}
          stale={locationTestMode ? locationTestMapData.stale : snapshot?.stale}
          onSelectFeature={setSelected}
          onMapLifecycleChange={setMapLifecycle}
        />
        {!locationTestMode && <View style={styles.layerWrap}>
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
        </View>}
        {locationTestMode && (
          <View style={styles.testModeBanner} pointerEvents="none">
            <Text style={styles.testModeBannerTitle}>{mapLifecycleLabel(mapLifecycle)}</Text>
            <Text style={styles.testModeBannerText}>
              {testLocationLoading
                ? 'Requesting GPS location only…'
                : testLocation
                  ? `GPS fix ±${Math.round(testLocation.accuracy)} m · no crisis data used`
                  : testLocationError ?? 'GPS location has not been requested.'}
            </Text>
          </View>
        )}
        {locationTestMode && !testLocationLoading && testLocationError && (
          <Pressable onPress={runLocationTest} style={styles.locationRetryButton}>
            <Text style={styles.locationRetryText}>Retry location</Text>
          </Pressable>
        )}
        {!locationTestMode && !selected && (
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>Tap map elements for details</Text>
          </View>
        )}
      </View>

      {!locationTestMode && selected && (
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
