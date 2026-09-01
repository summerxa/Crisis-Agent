import React, { useEffect, useMemo, useReducer, useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { COLORS } from '../constants';
import { styles } from '../styles';
import type { CrisisFeature, LayerKey, Position } from '../types';
import { LegendRow } from './common';
import { initialMapLifecycle, reduceMapLifecycle } from '../services/mapLifecycle';
import type { MapLifecycle } from '../services/mapLifecycle';

type Coordinate = { latitude: number; longitude: number };
const coordinate = ([longitude, latitude]: [number, number]): Coordinate => ({ latitude, longitude });

function FeatureOverlay({ feature, onPress }: { feature: CrisisFeature; onPress: () => void }) {
  const color = feature.kind === 'wildfire' ? '#DC5012' : COLORS.orange;
  if (feature.geometry.type === 'Point') {
    return <Marker coordinate={coordinate(feature.geometry.coordinates)} title={feature.title} onPress={onPress} pinColor={color} />;
  }
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return <>{polygons.map((polygon, index) => (
    <Polygon
      key={`${feature.id}:${index}`}
      coordinates={polygon[0].map(coordinate)}
      holes={polygon.slice(1).map(ring => ring.map(coordinate))}
      strokeColor={color}
      fillColor={feature.kind === 'wildfire' ? 'rgba(220,80,18,0.20)' : 'rgba(196,123,14,0.18)'}
      strokeWidth={2}
      tappable
      onPress={onPress}
    />
  ))}</>;
}

export default function CrisisMap({ compact = false, layers, location, simulatedPosition = false, features = [], loading = false, stale = false, statusMessage, onExpandMap, onSelectFeature, onMapLifecycleChange }: {
  compact?: boolean;
  layers: Record<LayerKey, boolean>;
  location: Position | null;
  simulatedPosition?: boolean;
  features?: CrisisFeature[];
  loading?: boolean;
  stale?: boolean;
  statusMessage?: string;
  onExpandMap?: () => void;
  onSelectFeature?: (feature: CrisisFeature) => void;
  onMapLifecycleChange?: (lifecycle: MapLifecycle) => void;
}) {
  const map = useRef<MapView>(null);
  const [mapLifecycle, dispatchMapLifecycle] = useReducer(reduceMapLifecycle, initialMapLifecycle);
  const visibleFeatures = useMemo(() => features.filter(feature =>
    (feature.kind === 'wildfire' && layers.wildfires) ||
    (feature.kind === 'weatherAlert' && layers.weatherAlerts) ||
    (feature.kind === 'evacWarning' && layers.evacWarning) ||
    (feature.kind === 'evacOrder' && layers.evacOrder),
  ), [features, layers]);

  useEffect(() => {
    onMapLifecycleChange?.(mapLifecycle);
    if (__DEV__) console.info(`[CrisisMap] ${mapLifecycle.phase}; renderer=${mapLifecycle.renderer}; fallback=${mapLifecycle.fallbackAttempted}`);
  }, [mapLifecycle, onMapLifecycleChange]);

  useEffect(() => {
    if (mapLifecycle.phase !== 'ready') return;
    const timer = setTimeout(() => dispatchMapLifecycle({ type: 'loadTimeout' }), 8000);
    return () => clearTimeout(timer);
  }, [mapLifecycle.phase, mapLifecycle.mount]);

  useEffect(() => {
    if (location && (mapLifecycle.phase === 'ready' || mapLifecycle.phase === 'loaded')) map.current?.animateToRegion({ latitude: location.latitude, longitude: location.longitude, latitudeDelta: compact ? 0.35 : 0.7, longitudeDelta: compact ? 0.35 : 0.7 }, 500);
  }, [compact, location, mapLifecycle.mount, mapLifecycle.phase]);

  return (
    <View style={[styles.crisisMap, compact ? styles.compactMap : styles.largeMap]}>
      <MapView
        key={`google-map-${mapLifecycle.mount}`}
        ref={map}
        provider={PROVIDER_GOOGLE}
        googleRenderer={Platform.OS === 'android' ? mapLifecycle.renderer : undefined}
        mapType="standard"
        style={styles.liveMap}
        initialRegion={{ latitude: location?.latitude ?? 37.0902, longitude: location?.longitude ?? -95.7129, latitudeDelta: location ? 0.35 : 45, longitudeDelta: location ? 0.35 : 45 }}
        showsUserLocation={Boolean(location && layers.myLocation && !simulatedPosition)}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        loadingEnabled
        loadingBackgroundColor="#E8E6DF"
        onMapReady={() => dispatchMapLifecycle({ type: 'ready' })}
        onMapLoaded={() => dispatchMapLifecycle({ type: 'loaded' })}>
        {visibleFeatures.map(feature => <FeatureOverlay key={feature.id} feature={feature} onPress={() => onSelectFeature?.(feature)} />)}
        {simulatedPosition && location && layers.myLocation && (
          <Marker coordinate={location} title="Test location" description="This is not your current GPS position">
            <View style={styles.testLocationMarker}><Text style={styles.testLocationMarkerText}>T</Text></View>
          </Marker>
        )}
      </MapView>
      {compact && <View style={styles.legend} pointerEvents="none">
        {layers.weatherAlerts && <LegendRow color={COLORS.orange} label="NWS Alert" />}
        {layers.wildfires && <LegendRow color="#DC5012" label="Fire Perimeter" />}
        {layers.myLocation && <LegendRow color={COLORS.blue} label="Your Location" />}
      </View>}
      {(loading || stale) && <View style={styles.mapStatus} pointerEvents="none"><Text style={styles.mapStatusText}>{loading ? 'Refreshing official data…' : statusMessage ?? 'Showing last available data'}</Text></View>}
      {compact && onExpandMap && <Pressable onPress={onExpandMap} style={styles.expandButton}><Text style={styles.expandText}>⛶ Full map</Text></Pressable>}
    </View>
  );
}
