import { parseTestLocationCoordinates, validateTestCoordinates } from '../src/services/testLocation';

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

test('parses configured test coordinates and ignores blank values', () => {
  expect(parseTestLocationCoordinates('12,34')).toMatchObject({ latitude: 12, longitude: 34 });
  expect(parseTestLocationCoordinates('')).toBeNull();
});
