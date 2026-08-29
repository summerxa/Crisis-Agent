/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

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
  requestAuthorization: (success: () => void) => success(),
  getCurrentPosition: (_success: unknown, error: (value: { message: string }) => void) => error({ message: 'Location unavailable in test' }),
}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
