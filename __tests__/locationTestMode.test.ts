import { getLocationTestMapData } from '../src/services/locationTestMap';
import type { Position } from '../src/types';

test('location test map data contains only the GPS location', () => {
  const location: Position = {
    latitude: 34.0522,
    longitude: -118.2437,
    accuracy: 8,
    timestamp: '2026-08-29T12:00:00.000Z',
  };
  const mapData = getLocationTestMapData(location);
  expect(mapData.location).toBe(location);
  expect(mapData.features).toEqual([]);
  expect(mapData.loading).toBe(false);
  expect(mapData.stale).toBe(false);
  expect(mapData.layers).toEqual({
    myLocation: true,
    weatherAlerts: false,
    wildfires: false,
    evacWarning: false,
    evacOrder: false,
  });
});
