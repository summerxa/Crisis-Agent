/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Linking, PermissionsAndroid, Text } from 'react-native';

let mockAuthorizationGranted = true;
let mockPositionAvailable = false;

jest.mock('react-native-get-random-values', () => ({}), { virtual: true });
jest.mock('react-native-url-polyfill/auto', () => ({}), { virtual: true });
jest.mock('react-native-safe-area-context', () => {
  const ReactNative = require('react-native');
  return {
    SafeAreaProvider: ReactNative.View,
    SafeAreaView: ReactNative.View,
  };
});

jest.mock('react-native-maps', () => {
  const ReactNative = require('react-native');
  return {
    __esModule: true,
    default: ReactNative.View,
    Marker: ReactNative.View,
    Polygon: ReactNative.View,
    PROVIDER_GOOGLE: 'google',
  };
});

jest.mock('@react-native-community/geolocation', () => ({
  requestAuthorization: (success: () => void, error: () => void) => mockAuthorizationGranted ? success() : error(),
  getCurrentPosition: (success: (value: unknown) => void, error: (value: { message: string }) => void) => mockPositionAvailable
    ? success({ coords: { latitude: 37.3, longitude: -121.9, accuracy: 5 }, timestamp: 1000 })
    : error({ message: 'Location unavailable in test' }),
}));

jest.mock('../src/services/crisisSources', () => ({
  fetchCrisisFeatures: jest.fn().mockResolvedValue({
    features: [],
    sourceHealth: {
      nws: { status: 'ok', checkedAt: '2026-01-01T00:00:00.000Z' },
      wfigs: { status: 'ok', checkedAt: '2026-01-01T00:00:00.000Z' },
    },
  }),
}));

import App, { LocationPermissionWarning } from '../App';
import { fetchCrisisFeatures } from '../src/services/crisisSources';

const mockFetchCrisisFeatures = fetchCrisisFeatures as jest.MockedFunction<typeof fetchCrisisFeatures>;

beforeEach(() => {
  mockAuthorizationGranted = true;
  mockPositionAvailable = false;
  jest.restoreAllMocks();
  mockFetchCrisisFeatures.mockClear();
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  jest.spyOn(PermissionsAndroid, 'request').mockImplementation(async () =>
    mockAuthorizationGranted
      ? PermissionsAndroid.RESULTS.GRANTED
      : PermissionsAndroid.RESULTS.DENIED,
  );
});

test('blocks the app when location permission is denied', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<LocationPermissionWarning isDarkMode={false} />);
  });

  expect(renderer.root.findAllByType(Text).some(node =>
    node.props.children === 'Location permission required',
  )).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('picks up a later grant on a fresh app mount', async () => {
  mockAuthorizationGranted = false;
  let denied!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    denied = ReactTestRenderer.create(<App />);
  });
  expect(denied.root.findAllByType(Text).some(node =>
    node.props.children === 'Location permission required',
  )).toBe(true);
  expect(mockFetchCrisisFeatures).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => denied.unmount());

  mockAuthorizationGranted = true;
  mockPositionAvailable = true;
  let granted!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    granted = ReactTestRenderer.create(<App />);
  });

  expect(granted.root.findAllByProps({ accessibilityRole: 'alert' })).toHaveLength(0);
  expect(granted.root.findAllByType(Text).some(node =>
    node.props.children === 'Location permission required',
  )).toBe(false);
  expect(mockFetchCrisisFeatures).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => granted.unmount());
});

test('opens device settings from the permission warning', async () => {
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<LocationPermissionWarning isDarkMode={false} />);
  });

  await ReactTestRenderer.act(async () => {
    await renderer.root.find(node => typeof node.props.onPress === 'function').props.onPress();
  });
  expect(openSettings).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('keeps instructions visible when device settings cannot be opened', async () => {
  jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('Unavailable'));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<LocationPermissionWarning isDarkMode={false} />);
  });

  await ReactTestRenderer.act(async () => {
    await renderer.root.find(node => typeof node.props.onPress === 'function').props.onPress();
  });
  expect(renderer.root.findAllByType(Text).some(node =>
    typeof node.props.children === 'string' && node.props.children.includes('Unable to open Settings'),
  )).toBe(true);
  expect(renderer.root.findAllByType(Text).some(node =>
    node.props.children === 'Location permission required',
  )).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
