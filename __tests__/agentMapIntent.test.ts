import { resolveAgentMapIntent } from '../src/services/agentMapIntent';
import type { CrisisFeature } from '../src/types';

const feature = { id: 'nws:official', kind: 'weatherAlert', geometry: { type: 'Point', coordinates: [0, 0] }, title: 'Official', status: 'Actual', sourceName: 'NWS', sourceUrl: 'https://weather.gov', updatedAt: '2026-01-01T00:00:00Z', rawSourceId: 'official' } as CrisisFeature;

test('agent intents can only resolve existing validated feature IDs', () => {
  const resolved = resolveAgentMapIntent({ focusFeatureIds: ['nws:official', 'invented:polygon'], visibleLayerIds: ['weatherAlerts'] }, [feature]);
  expect(resolved.focusFeatures).toEqual([feature]);
  expect(resolved.visibleLayerIds).toEqual(['weatherAlerts']);
});
