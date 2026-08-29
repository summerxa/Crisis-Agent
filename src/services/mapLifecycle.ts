export type MapRenderer = 'LATEST' | 'LEGACY';
export type MapPhase = 'initializing' | 'ready' | 'loaded' | 'failed';

export type MapLifecycle = {
  phase: MapPhase;
  renderer: MapRenderer;
  fallbackAttempted: boolean;
  mount: number;
};

export type MapLifecycleEvent =
  | { type: 'ready' }
  | { type: 'loaded' }
  | { type: 'loadTimeout' };

export const initialMapLifecycle: MapLifecycle = {
  phase: 'initializing',
  renderer: 'LATEST',
  fallbackAttempted: false,
  mount: 0,
};

export function reduceMapLifecycle(
  state: MapLifecycle,
  event: MapLifecycleEvent,
): MapLifecycle {
  if (event.type === 'ready' && state.phase === 'initializing') {
    return { ...state, phase: 'ready' };
  }

  if (event.type === 'loaded') {
    return { ...state, phase: 'loaded' };
  }

  if (event.type === 'loadTimeout' && state.phase === 'ready') {
    if (!state.fallbackAttempted && state.renderer === 'LATEST') {
      return {
        phase: 'initializing',
        renderer: 'LEGACY',
        fallbackAttempted: true,
        mount: state.mount + 1,
      };
    }
    return { ...state, phase: 'failed' };
  }

  return state;
}

export function mapLifecycleLabel(state: MapLifecycle) {
  if (state.phase === 'loaded') return 'Google map loaded';
  if (state.phase === 'failed') return 'Map tiles could not load';
  if (state.renderer === 'LEGACY') return 'Retrying with compatibility renderer';
  if (state.phase === 'ready') return 'Loading map tiles';
  return 'Starting Google Maps';
}
