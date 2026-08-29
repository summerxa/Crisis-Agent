import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrisisDataState, CrisisSnapshot } from '../types';
import { fetchCrisisFeatures } from '../services/crisisSources';
import { getCurrentPosition } from '../services/location';

export function useCrisisData(): CrisisDataState {
  const [snapshot, setSnapshot] = useState<CrisisSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const location = await getCurrentPosition();
      if (mounted.current) {
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
      if (mounted.current) {
        setSnapshot(previous => {
          const retained = previous?.features.filter(feature =>
            (feature.id.startsWith('nws:') && result.sourceHealth.nws.status === 'error') ||
            (feature.id.startsWith('wfigs:') && result.sourceHealth.wfigs.status === 'error'),
          ) ?? [];
          const features = [...result.features, ...retained].filter(
            (feature, index, all) => all.findIndex(candidate => candidate.id === feature.id) === index,
          );
          return { location, fetchedAt: new Date().toISOString(), ...result, features, stale: sourceFailed };
        });
        setLocationError(null);
      }
    } catch (error) {
      if (mounted.current) {
        setLocationError(error instanceof Error ? error.message : 'Refresh failed.');
        setSnapshot(previous => previous ? { ...previous, stale: true } : previous);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  return { snapshot, loading, locationError, refresh };
}
