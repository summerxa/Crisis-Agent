/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Linking, PermissionsAndroid, Text } from 'react-native';
import Config from 'react-native-config';
import { deferred, plan } from '../testSupport/crisis';
import type { TodoListAgentResponse } from '../src/types';

let mockAuthorizationGranted = true;
let mockPositionAvailable = false;
const mockConfig = { USE_MOCK_AGENT_RESPONSE: 'false', TEST_LOCATION_COORDINATES: '' };

jest.mock('react-native-get-random-values', () => ({}), { virtual: true });
jest.mock('react-native-url-polyfill/auto', () => ({}), { virtual: true });
jest.mock('react-native-config', () => ({ default: mockConfig, ...mockConfig }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/sessionStorage', () => ({ getOrCreateSessionId: jest.fn().mockResolvedValue('test-session') }));
jest.mock('../src/services/todoListAgent', () => ({ fetchTodoListAgentResponse: jest.fn() }));
jest.mock('../src/hooks/useSessionChat', () => ({
  useSessionChat: jest.fn(() => ({
    messages: [],
    input: '',
    setInput: jest.fn(),
    followUpPrompts: [],
    showSuggestedQuestions: false,
    isSubmitting: false,
    hydrated: true,
    chatReady: false,
    disabled: true,
    statusText: '',
    inputPlaceholder: '',
    contextMessage: '',
    sendMessage: jest.fn(),
  })),
}));
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
import { fetchTodoListAgentResponse } from '../src/services/todoListAgent';
import HomeScreen from '../src/screens/HomeScreen';
import BottomNav from '../src/components/BottomNav';
import CrisisMap from '../src/components/CrisisMap';

const mockFetchCrisisFeatures = fetchCrisisFeatures as jest.MockedFunction<typeof fetchCrisisFeatures>;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate', 'nextTick'] });
  mockAuthorizationGranted = true;
  mockPositionAvailable = false;
  mockConfig.TEST_LOCATION_COORDINATES = '';
  (Config as unknown as typeof mockConfig).TEST_LOCATION_COORDINATES = '';
  jest.restoreAllMocks();
  mockFetchCrisisFeatures.mockClear();
  jest.mocked(fetchTodoListAgentResponse).mockReset().mockResolvedValue(plan);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  jest.spyOn(PermissionsAndroid, 'request').mockImplementation(async () =>
    mockAuthorizationGranted
      ? PermissionsAndroid.RESULTS.GRANTED
      : PermissionsAndroid.RESULTS.DENIED,
  );
});

afterEach(() => { jest.useRealTimers(); });

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
    node.props.children === 'Situation unavailable',
  )).toBe(true);
  expect(denied.root.findAllByType(Text).some(node => node.props.children === 'CLEAR')).toBe(false);
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

test('tab switches and rerenders preserve progress; final step waits for the plan', async () => {
  mockPositionAvailable = true;
  const pending = deferred<TodoListAgentResponse>();
  jest.mocked(fetchTodoListAgentResponse).mockReturnValueOnce(pending.promise);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
  const texts = () => renderer.root.findAllByType(Text).map(node => node.props.children);
  expect(texts()).toContain('Getting your location');
  expect(texts()).toContain('Checking your location');
  expect(texts()).not.toContain('San Jose, CA');
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(1400); });
  expect(texts()).toContain('Comparing with your previous update');
  await ReactTestRenderer.act(async () => renderer.root.findByType(BottomNav).props.onTabChange('chat'));
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(700); });
  await ReactTestRenderer.act(async () => renderer.root.findByType(BottomNav).props.onTabChange('home'));
  expect(texts()).toContain('Generating action plan');
  await ReactTestRenderer.act(async () => renderer.update(<App />));
  expect(mockFetchCrisisFeatures).toHaveBeenCalledTimes(1);
  expect(fetchTodoListAgentResponse).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => pending.resolve(plan));
  expect(texts()).not.toContain('Checking your area');
  expect(renderer.root.findByType(HomeScreen).props.crisisData.snapshot).not.toBeNull();
  expect(texts()).toContain('37.3000, -121.9000');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a refresh failure renders retained information and a working Retry button', async () => {
  mockPositionAvailable = true;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(2100); });
  const saved = renderer.root.findByType(HomeScreen).props.crisisData.snapshot;
  expect(renderer.root.findByType(CrisisMap).props.location).toBe(saved.location);
  expect(renderer.root.findAllByProps({ showsUserLocation: false }).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByProps({ title: 'Your location' })[0].props.coordinate).toBe(saved.location);
  jest.mocked(fetchTodoListAgentResponse).mockRejectedValueOnce(new Error('Agent unavailable'));
  const pressWithText = (text: string) => renderer.root.findAll(node =>
    typeof node.props.onPress === 'function' && node.findAllByType(Text).some(child => child.props.children === text),
  )[0].props.onPress();
  await ReactTestRenderer.act(async () => { pressWithText('↻ Refresh'); });
  expect(renderer.root.findByType(HomeScreen).props.crisisData.snapshot).toBe(saved);
  expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Refresh failed · Showing previous information')).toBe(true);
  await ReactTestRenderer.act(async () => { pressWithText('Retry'); });
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(2100); });
  expect(renderer.root.findByType(HomeScreen).props.crisisData.refreshError).toBeNull();
  expect(fetchTodoListAgentResponse).toHaveBeenCalledTimes(3);
  await ReactTestRenderer.act(async () => renderer.unmount());
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

test('configured test location drives startup and refresh without map controls', async () => {
  mockConfig.TEST_LOCATION_COORDINATES = '12,34';
  (Config as unknown as typeof mockConfig).TEST_LOCATION_COORDINATES = '12,34';
  mockPositionAvailable = false;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<App />); });
  const navigate = async (tab: string) => {
    await ReactTestRenderer.act(async () => renderer.root.findByType(BottomNav).props.onTabChange(tab));
  };
  const press = async (label: string) => {
    await ReactTestRenderer.act(async () => renderer.root.findAll(node =>
      typeof node.props.onPress === 'function' && node.findAllByType(Text).some(child => child.props.children === label),
    )[0].props.onPress());
  };
  await ReactTestRenderer.act(async () => { jest.advanceTimersByTime(2100); });
  expect(mockFetchCrisisFeatures).toHaveBeenCalledWith(
    expect.objectContaining({ latitude: 12, longitude: 34 }),
    expect.any(AbortSignal),
  );
  expect(renderer.root.findByType(HomeScreen).props.crisisData.snapshot.location)
    .toMatchObject({ latitude: 12, longitude: 34 });

  await navigate('map');
  expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Test location')).toBe(false);
  expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'Use GPS')).toBe(false);
  expect(renderer.root.findAllByProps({ title: 'Your location' })[0].props.coordinate)
    .toMatchObject({ latitude: 12, longitude: 34 });

  await navigate('home');
  await press('↻ Refresh');
  expect(renderer.root.findByType(HomeScreen).props.crisisData.snapshot.location)
    .toMatchObject({ latitude: 12, longitude: 34 });
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
