import type { Position } from '../types';

export type CoordinateValidation =
  | { position: Position; error: null }
  | { position: null; error: string };

function parseDecimal(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateTestCoordinates(latitudeText: string, longitudeText: string): CoordinateValidation {
  const latitude = parseDecimal(latitudeText);
  const longitude = parseDecimal(longitudeText);
  if (latitude === null || longitude === null) {
    return { position: null, error: 'Enter valid decimal latitude and longitude values.' };
  }
  if (latitude < -90 || latitude > 90) {
    return { position: null, error: 'Latitude must be between -90 and 90.' };
  }
  if (longitude < -180 || longitude > 180) {
    return { position: null, error: 'Longitude must be between -180 and 180.' };
  }
  return {
    position: { latitude, longitude, accuracy: 0, timestamp: new Date().toISOString() },
    error: null,
  };
}

export class TestLocationRequestGuard {
  private generation = 0;

  begin() {
    this.generation += 1;
    return this.generation;
  }

  cancel() {
    this.generation += 1;
  }

  isCurrent(request: number) {
    return request === this.generation;
  }
}
