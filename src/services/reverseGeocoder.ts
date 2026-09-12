import { NativeModules } from 'react-native';
import type { LocationPlace, Position } from '../types';

type NativeReverseGeocoder = {
  reverseGeocode(latitude: number, longitude: number): Promise<LocationPlace | null>;
};

const nativeReverseGeocoder = NativeModules.ReverseGeocoder as NativeReverseGeocoder | undefined;

function validText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePlace(value: unknown): LocationPlace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const place = value as Partial<LocationPlace>;
  const city = validText(place.city);
  const country = validText(place.country);
  if (!city || !country) return null;

  return { city, country, label: `${city}, ${country}` };
}

export async function reverseGeocodePosition(
  position: Position,
  signal?: AbortSignal,
): Promise<LocationPlace | null> {
  if (signal?.aborted || !nativeReverseGeocoder) return null;

  try {
    const place = await nativeReverseGeocoder.reverseGeocode(position.latitude, position.longitude);
    if (signal?.aborted) return null;
    return normalizePlace(place);
  } catch {
    return null;
  }
}
