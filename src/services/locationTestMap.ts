import type { CrisisFeature, LayerKey, Position } from '../types';

export function getLocationTestMapData(location: Position | null) {
  return {
    layers: {
      myLocation: true,
      weatherAlerts: false,
      wildfires: false,
      evacWarning: false,
      evacOrder: false,
    } satisfies Record<LayerKey, boolean>,
    location,
    features: [] as CrisisFeature[],
    loading: false,
    stale: false,
  };
}
