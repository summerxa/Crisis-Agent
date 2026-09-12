import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrisisDataState, CrisisSnapshot, Position, RefreshResult } from '../types';
import { fetchCrisisFeatures } from '../services/crisisSources';
import { getCurrentPosition, LocationPermissionDeniedError } from '../services/location';
import { fetchTodoListAgentResponse } from '../services/todoListAgent';
import { reverseGeocodePosition } from '../services/reverseGeocoder';

export const REFRESH_TIMEOUT_MS = 120000;
const STEP_INTERVAL_MS = 700;
const PRESENTATION_MS = STEP_INTERVAL_MS * 3;

type RefreshState = Omit<CrisisDataState, 'refresh'>;
const initialState: RefreshState = {
  snapshot: null, previousSnapshot: null, loading: true,
  locationError: null, locationAccess: 'checking',
  refreshError: null, refreshOutcome: 'idle', showRefresh: true, refreshStep: 0,
  todoListAgent: { data: null, loading: false, error: null, success: false },
};
type ActiveRefresh = { controller: AbortController; promise: Promise<RefreshResult> };

export function useCrisisData({ sessionId, testLocation = null }: { sessionId?: string; testLocation?: Position | null } = {}): CrisisDataState {
  const [state, setState] = useState(initialState);
  const latestTestLocation = useRef(testLocation);
  useEffect(() => { latestTestLocation.current = testLocation; }, [testLocation]);
  const committedSnapshot = useRef<CrisisSnapshot | null>(null);
  const mounted = useRef(false);
  const active = useRef<ActiveRefresh | null>(null);
  const presentationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearPresentation = useCallback(() => {
    presentationTimers.current.forEach(clearTimeout);
    presentationTimers.current = [];
  }, []);

  const refresh = useCallback((): Promise<RefreshResult> => {
    if (active.current) return active.current.promise;
    if (!mounted.current) return Promise.resolve({ success: false, error: 'Refresh cancelled.' });

    clearPresentation();
    const controller = new AbortController();
    const { signal } = controller;
    const startedAt = Date.now();
    const previousSnapshot = committedSnapshot.current;
    const refreshLocation = latestTestLocation.current;
    let locationAcquired = false;
    const isCurrent = () => mounted.current && active.current?.controller === controller && !signal.aborted;
    const assertCurrent = () => {
      if (!isCurrent()) throw new Error('Refresh cancelled.');
    };

    setState(previous => ({
      ...previous, loading: true, locationAccess: 'checking', locationError: null,
      refreshError: null, refreshOutcome: 'refreshing', showRefresh: true, refreshStep: 0,
      todoListAgent: { ...previous.todoListAgent, loading: false, error: null },
    }));
    for (let step = 1; step <= 3; step++) {
      presentationTimers.current.push(setTimeout(() => {
        if (mounted.current) setState(previous => ({ ...previous, refreshStep: step }));
      }, STEP_INTERVAL_MS * step));
    }

    const deadline = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
    let removeAbortListener = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(new Error('Refresh timed out. Please try again.'));
      signal.addEventListener('abort', onAbort);
      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
    });

    // Install the active request before starting any asynchronous work.
    const work = Promise.resolve().then(async () => {
      assertCurrent();
      const location = refreshLocation ?? await getCurrentPosition(signal);
      assertCurrent();
      locationAcquired = true;
      const [result, locationPlace] = await Promise.all([
        fetchCrisisFeatures(location, signal),
        reverseGeocodePosition(location, signal),
      ]);
      assertCurrent();
      const failures = Object.entries(result.sourceHealth).filter(([, health]) => health.status !== 'ok');
      if (failures.length) {
        throw new Error(`Could not refresh ${failures.map(([name]) => name.toUpperCase()).join(' and ')}. Please try again.`);
      }
      if (!sessionId) throw new Error('Session is unavailable. Please restart the app.');
      const snapshot: CrisisSnapshot = {
        ...result, location, ...(locationPlace ? { locationPlace } : {}), fetchedAt: new Date().toISOString(), stale: false,
      };
      setState(previous => ({ ...previous, todoListAgent: { ...previous.todoListAgent, loading: true } }));
      const plan = await fetchTodoListAgentResponse({ sessionId, crisisSnapshot: snapshot, previousSnapshot }, signal);
      assertCurrent();
      return { snapshot, plan };
    });

    const promise = Promise.race([work, aborted]).then(({ snapshot, plan }): RefreshResult => {
      assertCurrent();
      committedSnapshot.current = snapshot;
      const remaining = Math.max(0, PRESENTATION_MS - (Date.now() - startedAt));
      setState(previous => ({
        ...previous, snapshot, previousSnapshot, loading: false, locationAccess: 'granted',
        refreshOutcome: 'success', showRefresh: remaining > 0,
        todoListAgent: { data: plan, loading: false, error: null, success: true },
      }));
      if (remaining > 0) {
        presentationTimers.current.push(setTimeout(() => {
          if (mounted.current) setState(previous => ({ ...previous, showRefresh: false }));
        }, remaining));
      }
      return { success: true };
    }).catch((error: unknown): RefreshResult => {
      const message = error instanceof Error && error.message ? error.message : 'Refresh failed. Please try again.';
      if (mounted.current && active.current?.controller === controller) {
        clearPresentation();
        setState(previous => ({
          ...previous, loading: false, showRefresh: false, refreshError: message, refreshOutcome: 'failure',
          locationAccess: locationAcquired ? 'granted' : error instanceof LocationPermissionDeniedError ? 'denied' : 'error',
          locationError: locationAcquired ? null : message,
          todoListAgent: { ...previous.todoListAgent, loading: false },
        }));
      }
      return { success: false, error: message };
    }).finally(() => {
      clearTimeout(deadline);
      removeAbortListener();
      if (active.current?.controller === controller) active.current = null;
    });
    active.current = { controller, promise };
    return promise;
  }, [clearPresentation, sessionId]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
      active.current?.controller.abort();
      active.current = null;
      clearPresentation();
    };
  }, [clearPresentation, refresh]);

  return { ...state, refresh };
}
