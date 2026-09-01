import { TestLocationRequestGuard, validateTestCoordinates } from '../src/services/testLocation';

test('accepts decimal coordinates including valid boundaries', () => {
  expect(validateTestCoordinates('90', '-180').position).toMatchObject({ latitude: 90, longitude: -180 });
  expect(validateTestCoordinates(' -33.8688 ', '151.2093').position).toMatchObject({ latitude: -33.8688, longitude: 151.2093 });
});

test.each([
  ['', '10', 'Enter valid decimal'],
  ['north', '10', 'Enter valid decimal'],
  ['10', '12abc', 'Enter valid decimal'],
  ['90.1', '10', 'Latitude must be between'],
  ['10', '-180.1', 'Longitude must be between'],
])('rejects invalid coordinates', (latitude, longitude, message) => {
  const result = validateTestCoordinates(latitude, longitude);
  expect(result.position).toBeNull();
  expect(result.error).toContain(message);
});

test('only accepts the newest request and cancels pending work when leaving test mode', () => {
  const guard = new TestLocationRequestGuard();
  const first = guard.begin();
  const second = guard.begin();
  expect(guard.isCurrent(first)).toBe(false);
  expect(guard.isCurrent(second)).toBe(true);
  guard.cancel();
  expect(guard.isCurrent(second)).toBe(false);
});
