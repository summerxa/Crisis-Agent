import { initialMapLifecycle, mapLifecycleLabel, reduceMapLifecycle } from '../src/services/mapLifecycle';

test('moves from initialization through ready to loaded', () => {
  const ready = reduceMapLifecycle(initialMapLifecycle, { type: 'ready' });
  expect(ready.phase).toBe('ready');
  expect(reduceMapLifecycle(ready, { type: 'loaded' }).phase).toBe('loaded');
});

test('uses the compatibility renderer once after a tile timeout', () => {
  const latestReady = reduceMapLifecycle(initialMapLifecycle, { type: 'ready' });
  const fallback = reduceMapLifecycle(latestReady, { type: 'loadTimeout' });
  expect(fallback).toMatchObject({ phase: 'initializing', renderer: 'LEGACY', fallbackAttempted: true, mount: 1 });
  expect(mapLifecycleLabel(fallback)).toBe('Retrying with compatibility renderer');

  const legacyReady = reduceMapLifecycle(fallback, { type: 'ready' });
  const failed = reduceMapLifecycle(legacyReady, { type: 'loadTimeout' });
  expect(failed).toMatchObject({ phase: 'failed', renderer: 'LEGACY', fallbackAttempted: true, mount: 1 });
  expect(reduceMapLifecycle(failed, { type: 'loadTimeout' })).toBe(failed);
});

test('ignores stale ready and timeout events after tiles load', () => {
  const loaded = reduceMapLifecycle(initialMapLifecycle, { type: 'loaded' });
  expect(reduceMapLifecycle(loaded, { type: 'ready' })).toBe(loaded);
  expect(reduceMapLifecycle(loaded, { type: 'loadTimeout' })).toBe(loaded);
});
