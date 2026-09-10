import { buildAgentContext, featureSpatialContext } from '../src/services/agentContext';
import { buildTodoListAgentPrompt } from '../src/services/todoListAgent';
import { buildChatAgentPrompt } from '../src/services/chatAgent';
import type { CrisisFeature, CrisisSnapshot, GeoPolygon, Position } from '../src/types';
import { plan, snapshot } from '../testSupport/crisis';

const { TextEncoder } = require('util');

jest.mock('react-native-config', () => ({ AGENT_URL: 'https://agent.test' }));

const location: Position = { latitude: 1, longitude: 1, accuracy: 10, timestamp: snapshot.fetchedAt };
const polygon: GeoPolygon = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
const feature: CrisisFeature = {
  id: 'nws:alert-1', rawSourceId: 'alert-1', kind: 'weatherAlert', title: 'Alert one', status: 'Actual',
  severity: 'Moderate', description: 'Full official instructions. '.repeat(100),
  sourceName: 'NWS', sourceUrl: 'https://weather.gov/alert-1', updatedAt: '2026-09-09T10:00:00Z',
  expiresAt: '2026-09-09T18:00:00Z', geometry: polygon,
};
const makeSnapshot = (features: CrisisFeature[] = [feature], position = location): CrisisSnapshot => ({
  ...snapshot, features, location: position,
});
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

test('both agents receive one compact feature with complete descriptions and no geometry; original snapshots stay intact', () => {
  const current = makeSnapshot();
  const previous = clone(current);
  const original = JSON.stringify([current, previous]);
  const todoPrompt = buildTodoListAgentPrompt(current, previous);
  const chatPrompt = buildChatAgentPrompt({ prompt: 'What changed?', disasterSnapshot: current, previousSnapshot: previous,
    disasterWriteup: plan.disaster_state_writeup, todoWriteup: plan.disaster_response_writeup });
  const todoContext = JSON.parse(todoPrompt.split('disaster_weather_data: ')[1]);
  const chatContext = JSON.parse(chatPrompt.split('disaster_snapshot: ')[1].split('\n\ndisaster_writeup:')[0]);
  expect(todoContext).toEqual(chatContext);
  expect(todoContext.features).toHaveLength(1);
  expect(todoContext.features[0]).toMatchObject({
    id: feature.id, description: feature.description, sourceName: feature.sourceName, sourceUrl: feature.sourceUrl,
    spatial: { relationship: 'inside', distanceMiles: 0 },
  });
  const serialized = JSON.stringify(todoContext);
  expect(serialized).not.toContain('coordinates');
  expect(serialized).not.toContain('all_features');
  expect(serialized).not.toContain('previous_snapshot');
  expect(serialized.split(feature.description!).length - 1).toBe(1);
  expect(JSON.stringify([current, previous])).toBe(original);
});

test.each([
  ['interior', { latitude: 1, longitude: 1 }, 'inside', 0],
  ['exterior', { latitude: 1, longitude: 3 }, 'outside', 69.1],
  ['boundary', { latitude: 0, longitude: 1 }, 'inside', 0],
  ['vertex', { latitude: 0, longitude: 0 }, 'inside', 0],
] as const)('spatial context for polygon %s', (_label, point, relationship, miles) => {
  const context = featureSpatialContext(feature, { ...location, ...point });
  expect(context.relationship).toBe(relationship);
  expect(context.distanceMiles).toBeCloseTo(miles, 0);
});

test('point features have point distance without implying an affected area', () => {
  const context = featureSpatialContext({ ...feature, geometry: { type: 'Point', coordinates: [1, 2] } }, location);
  expect(context.relationship).toBe('unknown');
  expect(context.distanceMiles).toBeCloseTo(69.1, 0);
});

test('holes are outside the affected polygon and multipolygon components are considered', () => {
  const withHole: GeoPolygon = { ...polygon, coordinates: [...polygon.coordinates,
    [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]],
  ] };
  const inHole = featureSpatialContext({ ...feature, geometry: withHole }, location);
  expect(inHole.relationship).toBe('outside');
  expect(inHole.distanceMiles).toBeGreaterThan(30);
  const multi = featureSpatialContext({ ...feature, geometry: {
    type: 'MultiPolygon', coordinates: [withHole.coordinates, [[[4, 0], [6, 0], [6, 2], [4, 2], [4, 0]]]],
  } }, { ...location, longitude: 5 });
  expect(multi).toEqual({ relationship: 'inside', distanceMiles: 0 });
});

test('open rings are closed without mutating the stored geometry', () => {
  const open = { ...feature, geometry: { ...polygon, coordinates: [polygon.coordinates[0].slice(0, -1)] } };
  const before = JSON.stringify(open);
  expect(featureSpatialContext(open, location)).toEqual({ relationship: 'inside', distanceMiles: 0 });
  expect(JSON.stringify(open)).toBe(before);
});

test('invalid or unsupported geometry remains in context with unknown spatial data', () => {
  const invalid: CrisisFeature = { ...feature, geometry: { type: 'Polygon', coordinates: [[]] } };
  const context = buildAgentContext(makeSnapshot([invalid]));
  expect(context.features).toHaveLength(1);
  expect(context.features[0].spatial).toEqual({ relationship: 'unknown', distanceMiles: null });
  const crossing: CrisisFeature = { ...feature, geometry: {
    type: 'Polygon', coordinates: [[[179, 0], [-179, 0], [-179, 2], [179, 2], [179, 0]]],
  } };
  expect(featureSpatialContext(crossing, location).relationship).toBe('unknown');
});

test('first refresh is explicitly without a baseline, not an array of newly started incidents', () => {
  const context = buildAgentContext(makeSnapshot());
  expect(context.comparison).toMatchObject({ baseline: 'none', previous: null, added: [], removed: [], updated: [] });
});

test('unchanged and reordered source records have no updates', () => {
  const second = { ...feature, id: 'nws:alert-2', rawSourceId: 'alert-2' };
  const current = makeSnapshot([second, feature]);
  const previous = makeSnapshot([clone(feature), clone(second)]);
  expect(buildAgentContext(current, previous).comparison).toMatchObject({
    baseline: 'available', added: [], removed: [], updated: [], locationChanged: false,
  });
});

test('added IDs reference current records; removed records contain only previous compact details', () => {
  const replacement = { ...feature, id: 'nws:replacement', rawSourceId: 'replacement' };
  const result = buildAgentContext(makeSnapshot([replacement]), makeSnapshot()).comparison;
  expect(result.added).toEqual(['nws:replacement']);
  expect(result.removed).toHaveLength(1);
  expect(result.removed[0]).toMatchObject({ id: feature.id, description: feature.description });
  expect(result.updated).toEqual([]);
  expect(JSON.stringify(result)).not.toContain('coordinates');
});

test('updated records contain only previous changed values, including absence as null', () => {
  const previousFeature = { ...feature, severity: undefined };
  const next = { ...feature, title: 'Changed title', status: 'Updated', kind: 'evacWarning' as const,
    description: 'New complete description', expiresAt: undefined, sourceUrl: 'https://weather.gov/new' };
  const result = buildAgentContext(makeSnapshot([next]), makeSnapshot([previousFeature]));
  expect(result.comparison.updated).toEqual([{ id: feature.id, previousValues: {
    title: feature.title, status: feature.status, kind: feature.kind, severity: null,
    description: feature.description, expiresAt: feature.expiresAt, sourceUrl: feature.sourceUrl,
  } }]);
  expect(result.features[0].description).toBe(next.description);
});

test('source timestamp updates are distinct from substantive changes', () => {
  const next = { ...feature, updatedAt: '2026-09-09T11:00:00Z' };
  expect(buildAgentContext(makeSnapshot([next]), makeSnapshot()).comparison.updated)
    .toEqual([{ id: feature.id, previousUpdatedAt: feature.updatedAt }]);
});

test('geometry and location changes are distinguished and previous spatial context uses the previous location', () => {
  const previous = makeSnapshot();
  const current = makeSnapshot([feature], { ...location, longitude: 3 });
  const moved = buildAgentContext(current, previous).comparison;
  expect(moved.locationChanged).toBe(true);
  expect(moved.updated).toEqual([{ id: feature.id, previousSpatial: { relationship: 'inside', distanceMiles: 0 } }]);
  const changedGeometry = { ...feature, geometry: { type: 'Point' as const, coordinates: [10, 10] as [number, number] } };
  const sourceChanged = buildAgentContext(makeSnapshot([changedGeometry]), previous).comparison;
  expect(sourceChanged.locationChanged).toBe(false);
  expect(sourceChanged.updated[0]).toMatchObject({ geometryChanged: true, previousSpatial: { relationship: 'inside', distanceMiles: 0 } });
  expect(sourceChanged.updated[0].previousValues).toBeUndefined();
});

test('missing IDs are uncomparable rather than matched by array position', () => {
  const missing = { ...feature, id: 'wfigs:unidentified:0', rawSourceId: '' };
  const result = buildAgentContext(makeSnapshot([missing]), makeSnapshot([missing])).comparison;
  expect(result.uncomparable.current).toEqual([{ id: missing.id, index: 0, reason: 'missing-source-id' }]);
  expect(result.uncomparable.previous[0].reason).toBe('missing-source-id');
  expect(result.added).toEqual([]);
  expect(result.removed).toEqual([]);
  expect(result.updated).toEqual([]);
});

test('duplicate IDs on either side prevent matching and retain every record', () => {
  const current = makeSnapshot([feature, { ...feature, title: 'Ambiguous second record' }]);
  const context = buildAgentContext(current, makeSnapshot());
  expect(context.features).toHaveLength(2);
  expect(context.comparison.uncomparable.current).toHaveLength(2);
  expect(context.comparison.uncomparable.previous).toHaveLength(1);
  expect(context.comparison.updated).toEqual([]);
  expect(context.comparison.added).toEqual([]);
  expect(context.comparison.removed).toEqual([]);
});

test('polygon-heavy payload benchmark compares identical snapshots without claiming model token counts', () => {
  const ring: [number, number][] = Array.from({ length: 1500 }, (_, i) => [
    -121 + Math.cos(i * 2 * Math.PI / 1500) * 0.2, 37 + Math.sin(i * 2 * Math.PI / 1500) * 0.2,
  ]);
  ring.push(ring[0]);
  const features: CrisisFeature[] = Array.from({ length: 3 }, (_, index) => ({
    ...feature, id: `wfigs:fire-${index}`, rawSourceId: `fire-${index}`, kind: 'wildfire',
    geometry: { type: 'Polygon', coordinates: [ring] },
  }));
  const current = makeSnapshot(features);
  const previous = clone(current);
  const legacy = {
    location: current.location, fetchedAt: current.fetchedAt, stale: current.stale,
    sources: { nws: { health: current.sourceHealth.nws, features: [] }, wfigs: { health: current.sourceHealth.wfigs, features } },
    all_features: features, previous_snapshot: previous,
  };
  const before = new TextEncoder().encode(JSON.stringify(legacy)).length;
  const after = new TextEncoder().encode(JSON.stringify(buildAgentContext(current, previous))).length;
  console.info(`Polygon fixture payload: ${before} -> ${after} UTF-8 bytes (${((1 - after / before) * 100).toFixed(1)}% reduction). Not model token usage.`);
  expect(after).toBeLessThan(before * 0.2);
});
