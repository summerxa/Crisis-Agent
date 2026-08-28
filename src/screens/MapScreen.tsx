import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LAYERS, SHEET_CONTENT } from '../constants';
import { layerChipStyles, layerDotStyles, layerTextStyles, styles } from '../styles';
import type { AppTab, LayerKey, SheetKey } from '../types';
import CrisisMap from '../components/CrisisMap';
import ChatPrompt from '../components/ChatPrompt';

export default function MapScreen({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate: (tab: AppTab) => void;
}) {
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
      <ChatPrompt onPress={() => onNavigate('chat')} /> 
    </View>
  );
}
