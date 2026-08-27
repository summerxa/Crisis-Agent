import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../constants';
import { styles } from '../styles';
import type { LayerKey } from '../types';
import { LegendRow } from './common';

export default function CrisisMap({
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
