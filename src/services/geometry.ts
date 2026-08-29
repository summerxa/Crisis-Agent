import type { CrisisFeature, CrisisGeometry, Position } from '../types';

type Json = Record<string, unknown>;
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function validPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    isNumber(value[0]) &&
    isNumber(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

export function parseGeometry(value: unknown): CrisisGeometry | null {
  if (!value || typeof value !== 'object') return null;
  const geometry = value as Json;
  if (geometry.type === 'Point' && validPair(geometry.coordinates)) {
    return { type: 'Point', coordinates: geometry.coordinates };
  }
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const rings = geometry.coordinates.filter(Array.isArray).map(ring =>
      ring.filter(validPair),
    );
    if (rings[0]?.length >= 3) return { type: 'Polygon', coordinates: rings };
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const polygons = geometry.coordinates
      .filter(Array.isArray)
      .map(polygon =>
        polygon.filter(Array.isArray).map(ring => ring.filter(validPair)),
      )
      .filter(polygon => polygon[0]?.length >= 3);
    if (polygons.length) return { type: 'MultiPolygon', coordinates: polygons };
  }
  return null;
}

function inRing(point: [number, number], ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi === yj) continue;
    const crosses = yi > point[1] !== yj > point[1];
    if (crosses && point[0] <= ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function containsPosition(feature: CrisisFeature, position: Position) {
  const point: [number, number] = [position.longitude, position.latitude];
  if (feature.geometry.type === 'Point') return false;
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  return polygons.some(
    polygon => inRing(point, polygon[0]) && !polygon.slice(1).some(ring => inRing(point, ring)),
  );
}

export function distanceMiles(a: Position, coordinates: [number, number]) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(coordinates[1] - a.latitude);
  const dLon = radians(coordinates[0] - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(coordinates[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
