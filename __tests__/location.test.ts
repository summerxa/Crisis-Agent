import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';
import { getCurrentPosition, LocationPermissionDeniedError } from '../src/services/location';

jest.mock('@react-native-community/geolocation', () => ({
  requestAuthorization: jest.fn(),
  getCurrentPosition: jest.fn(),
}));

const geolocation = Geolocation as jest.Mocked<typeof Geolocation>;

function mockPosition() {
  geolocation.getCurrentPosition.mockImplementation((success: any) => success({
    coords: { latitude: 37.3, longitude: -121.9, accuracy: 5 },
    timestamp: 1000,
  }));
}

describe('getCurrentPosition', () => {
  afterEach(() => jest.restoreAllMocks());

  test.each([
    PermissionsAndroid.RESULTS.DENIED,
    PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
  ])('reports Android permission result %s as denied', async result => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(result);

    await expect(getCurrentPosition()).rejects.toBeInstanceOf(LocationPermissionDeniedError);
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  test('uses an existing Android grant without showing the prompt again', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    const request = jest.spyOn(PermissionsAndroid, 'request');
    mockPosition();

    await expect(getCurrentPosition()).resolves.toMatchObject({ latitude: 37.3, longitude: -121.9 });
    expect(request).not.toHaveBeenCalled();
    expect(geolocation.getCurrentPosition).toHaveBeenLastCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ maximumAge: 0 }));
  });

  test('accepts an Android grant returned by the prompt', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    mockPosition();

    await expect(getCurrentPosition()).resolves.toMatchObject({ latitude: 37.3, longitude: -121.9 });
  });

  test('handles iOS authorization success and rejection', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    geolocation.requestAuthorization.mockImplementation((success: any) => success());
    mockPosition();
    await expect(getCurrentPosition()).resolves.toMatchObject({ latitude: 37.3 });

    geolocation.requestAuthorization.mockImplementation((_success: any, error: any) => error());
    await expect(getCurrentPosition()).rejects.toBeInstanceOf(LocationPermissionDeniedError);
  });

  test('keeps GPS failures distinct from permission denial', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    geolocation.requestAuthorization.mockImplementation((success: any) => success());
    geolocation.getCurrentPosition.mockImplementation((_success: any, error: any) => error({ code: 3 }));

    await expect(getCurrentPosition()).rejects.toMatchObject({
      message: expect.stringContaining('timed out'),
      name: 'Error',
    });
  });

  test('ignores a cancelled GPS result without starting the fallback request', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    geolocation.requestAuthorization.mockImplementation((success: any) => success());
    let rejectPosition!: (error: any) => void;
    let started!: () => void;
    const nativeRequestStarted = new Promise<void>(resolve => { started = resolve; });
    geolocation.getCurrentPosition.mockClear().mockImplementation((_success: any, error: any) => {
      rejectPosition = error;
      started();
    });
    const controller = new AbortController();
    const pending = getCurrentPosition(controller.signal);
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await nativeRequestStarted;
    controller.abort();
    rejectPosition({ code: 3 });
    await rejected;
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  test('rejects invalid device coordinates', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    geolocation.requestAuthorization.mockImplementation((success: any) => success());
    geolocation.getCurrentPosition.mockImplementation((success: any) => success({
      coords: { latitude: 100, longitude: -121, accuracy: 5 }, timestamp: 1000,
    }));
    await expect(getCurrentPosition()).rejects.toThrow('invalid location');
  });
});
