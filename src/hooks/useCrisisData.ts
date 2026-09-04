import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrisisDataState, CrisisSnapshot, LocationAccessState } from '../types';
import { fetchCrisisFeatures } from '../services/crisisSources';
import { getCurrentPosition, LocationPermissionDeniedError } from '../services/location';
import { useTodoListAgent } from './useTodoListAgent';

type UseCrisisDataConfig = {
  sessionId?: string;
};

export function useCrisisData({ sessionId }: UseCrisisDataConfig = {}): CrisisDataState {
  const [snapshot, setSnapshot] = useState<CrisisSnapshot | null>(null);
  const [previousSnapshot, setPreviousSnapshot] = useState<CrisisSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationAccess, setLocationAccess] = useState<LocationAccessState>('checking');
  const mounted = useRef(true);
  const committedSnapshot = useRef<CrisisSnapshot | null>(null);
  const refreshRequestId = useRef(0);
  const todoListAgent = useTodoListAgent();
  const { getTodoListAgentResponse } = todoListAgent;

  const refresh = useCallback(async () => {
    const currentRequestId = refreshRequestId.current + 1;
    refreshRequestId.current = currentRequestId;
    const previousCommittedSnapshot = committedSnapshot.current;

    setLoading(true);
    setLocationAccess('checking');
    setPreviousSnapshot(previousCommittedSnapshot);

    try {
      const location = await getCurrentPosition();
      if (mounted.current && refreshRequestId.current === currentRequestId) {
        setLocationAccess('granted');
        setSnapshot(previous => previous
          ? { ...previous, location }
          : {
              location,
              fetchedAt: new Date().toISOString(),
              features: [],
              sourceHealth: {
                nws: { status: 'error', checkedAt: new Date().toISOString(), message: 'Refreshing' },
                wfigs: { status: 'error', checkedAt: new Date().toISOString(), message: 'Refreshing' },
              },
              stale: true,
            });
      }
      const result = await fetchCrisisFeatures(location);
      const sourceFailed = Object.values(result.sourceHealth).some(s => s.status === 'error');
      const retained = previousCommittedSnapshot?.features.filter(feature =>
        (feature.id.startsWith('nws:') && result.sourceHealth.nws.status === 'error') ||
        (feature.id.startsWith('wfigs:') && result.sourceHealth.wfigs.status === 'error'),
      ) ?? [];
      const features = [...result.features, ...retained].filter(
        (feature, index, all) => all.findIndex(candidate => candidate.id === feature.id) === index,
      );
      const nextSnapshot = {
        location,
        fetchedAt: new Date().toISOString(),
        ...result,
        features,
        stale: sourceFailed,
      };

      if (mounted.current && refreshRequestId.current === currentRequestId) {
        committedSnapshot.current = nextSnapshot;
        setSnapshot(nextSnapshot);
        setLocationError(null);
        setLoading(false);

        if (sessionId) {
          getTodoListAgentResponse({
            sessionId,
            crisisSnapshot: nextSnapshot,
            previousSnapshot: previousCommittedSnapshot,
          }).catch(() => undefined);
        }
      }
    } catch (error) {
      if (mounted.current && refreshRequestId.current === currentRequestId) {
        setLocationAccess(error instanceof LocationPermissionDeniedError ? 'denied' : 'error');
        setLocationError(error instanceof Error ? error.message : 'Refresh failed.');
        setSnapshot(previous => previous ? { ...previous, stale: true } : previous);
      }
    } finally {
      if (mounted.current && refreshRequestId.current === currentRequestId) setLoading(false);
    }
  }, [getTodoListAgentResponse, sessionId]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  return { snapshot, previousSnapshot, loading, locationError, locationAccess, refresh, todoListAgent };
}
