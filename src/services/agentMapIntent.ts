import type { CrisisFeature, LayerKey } from '../types';

export type AgentMapIntent = {
  focusFeatureIds?: string[];
  visibleLayerIds?: LayerKey[];
  explanation?: string;
};

export function resolveAgentMapIntent(intent: AgentMapIntent, features: CrisisFeature[]) {
  const byId = new Map(features.map(feature => [feature.id, feature]));
  const allowedLayers = new Set<LayerKey>(['myLocation', 'weatherAlerts', 'wildfires', 'evacWarning', 'evacOrder']);
  return {
    focusFeatures: (intent.focusFeatureIds ?? []).flatMap(id => {
      const feature = byId.get(id);
      return feature ? [feature] : [];
    }),
    visibleLayerIds: (intent.visibleLayerIds ?? []).filter(layer => allowedLayers.has(layer)),
    explanation: typeof intent.explanation === 'string' ? intent.explanation : '',
  };
}
