import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LAYERS } from '../constants';
import { layerChipStyles, layerDotStyles, layerTextStyles, styles } from '../styles';
import type { AppTab, ChatPromptCorner, CrisisDataState, LayerKey } from '../types';
import CrisisMap from '../components/CrisisMap';
import ChatPrompt from '../components/ChatPrompt';

const CHAT_PROMPT_TOP_BOUNDARY = 72;

export default function MapScreen({
  onBack,
  onNavigate,
  crisisData,
  chatPromptCorner,
  onChatPromptCornerChange,
}: {
  onBack: () => void;
  onNavigate: (tab: AppTab) => void;
  crisisData: CrisisDataState;
  chatPromptCorner: ChatPromptCorner;
  onChatPromptCornerChange: (corner: ChatPromptCorner) => void;
}) {
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    myLocation: true,
    weatherAlerts: true,
    wildfires: true,
    evacWarning: false,
    evacOrder: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const snapshot = crisisData.snapshot;
  const selected = (snapshot?.features ?? [])
    .find(feature => feature.id === selectedId) ?? null;
  const activeLocation = snapshot?.location ?? null;
  const locationLabel = activeLocation
    ? snapshot?.locationPlace?.label ?? `${activeLocation.latitude.toFixed(4)}, ${activeLocation.longitude.toFixed(4)}`
    : 'Waiting for location';

  return (
    <View style={styles.mapScreen}>
      <View style={styles.mapToolbar}>
        <Pressable onPress={onBack} style={styles.roundButton}>
          <Text style={styles.roundButtonText}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.toolbarTitle}>Live crisis map</Text>
          <Text style={styles.subtleText}>{locationLabel}{snapshot?.stale ? ' · Data may be incomplete' : ''}</Text>
        </View>
      </View>
      <View style={styles.fullMapArea}>
        <CrisisMap
          layers={layers}
          location={activeLocation}
          features={snapshot?.features ?? []}
          loading={crisisData.loading}
          stale={snapshot?.stale || !!crisisData.refreshError}
          statusMessage={crisisData.refreshError
            ? snapshot ? 'Refresh failed · Showing previous information' : 'Situation unavailable · Retry from Home'
            : undefined}
          onSelectFeature={feature => setSelectedId(feature.id)}
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
            <Pressable onPress={() => setSelectedId(null)} style={styles.closeButton}>
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
      <ChatPrompt
        corner={chatPromptCorner}
        onCornerChange={onChatPromptCornerChange}
        onPress={() => onNavigate('chat')}
        topBoundaryInset={CHAT_PROMPT_TOP_BOUNDARY}
      />
    </View>
  );
}
