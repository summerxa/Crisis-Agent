import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';
import type { Position } from '../types';

async function requestForegroundPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  if (Platform.OS === 'ios') {
    return new Promise(resolve => {
      Geolocation.requestAuthorization(() => resolve(true), () => resolve(false));
    });
  }

  return false;
}

function acquirePosition(enableHighAccuracy: boolean, timeout: number): Promise<Position> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (result: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) =>
        resolve({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
          timestamp: new Date(result.timestamp).toISOString(),
        }),
      (error: { message?: string; code?: number }) => {
        const message = error.code === 3
          ? 'Location request timed out. Check that device location is enabled and that the emulator has a simulated location.'
          : error.message || 'Unable to get your location.';
        reject(new Error(message));
      },
      { enableHighAccuracy, timeout, maximumAge: 60000 },
    );
  });
}

export async function getCurrentPosition(): Promise<Position> {
  if (!(await requestForegroundPermission())) {
    throw new Error('Location permission was not granted.');
  }

  try {
    return await acquirePosition(true, 10000);
  } catch {
    return acquirePosition(false, 10000);
  }
}
