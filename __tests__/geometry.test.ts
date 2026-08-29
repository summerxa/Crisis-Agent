import { containsPosition, distanceMiles, parseGeometry } from '../src/services/geometry';
import type { CrisisFeature, Position } from '../src/types';

const position: Position = { latitude: 1, longitude: 1, accuracy: 5, timestamp: '2026-01-01T00:00:00Z' };
const feature: CrisisFeature = {
  id: 'official:1', kind: 'weatherAlert', title: 'Test', status: 'Actual',
  sourceName: 'Official source', sourceUrl: 'https://example.gov/1',
  updatedAt: '2026-01-01T00:00:00Z', rawSourceId: '1',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] },
};

test('validates supported GeoJSON and rejects invalid coordinates', () => {
  expect(parseGeometry(feature.geometry)).toEqual(feature.geometry);
  expect(parseGeometry({ type: 'Point', coordinates: [181, 0] })).toBeNull();
  expect(parseGeometry({ type: 'LineString', coordinates: [] })).toBeNull();
});

test('uses deterministic point-in-polygon checks', () => {
  expect(containsPosition(feature, position)).toBe(true);
  expect(containsPosition(feature, { ...position, longitude: 3 })).toBe(false);
});

test('calculates geodesic distance without a model', () => {
  expect(distanceMiles(position, [1, 2])).toBeGreaterThan(68);
  expect(distanceMiles(position, [1, 2])).toBeLessThan(70);
});
