import { pointToPolygonDistance } from '@turf/point-to-polygon-distance';
import type { CrisisFeature, CrisisSnapshot, Position } from '../types';
import { distanceMiles } from './geometry';

export type SpatialContext = {
  relationship: 'inside' | 'outside' | 'unknown';
  distanceMiles: number | null;
};

export type CompactFeature = Pick<CrisisFeature,
  'id' | 'kind' | 'title' | 'status' | 'severity' | 'description' |
  'sourceName' | 'sourceUrl' | 'updatedAt' | 'expiresAt'
> & { spatial: SpatialContext };

const substantiveFields = ['title', 'kind', 'status', 'severity', 'description', 'expiresAt'] as const;
type SubstantiveField = typeof substantiveFields[number];
type PreviousValues = Partial<Record<SubstantiveField | 'sourceName' | 'sourceUrl', string | null>>;
type UpdatedFeature = {
  id: string;
  previousValues?: PreviousValues;
  previousUpdatedAt?: string;
  geometryChanged?: true;
  previousSpatial?: SpatialContext;
};
type UncomparableFeature = { id: string; reason: 'missing-source-id' | 'ambiguous-id' };

export type AgentContext = ReturnType<typeof snapshotMetadata> & {
  features: CompactFeature[];
  comparison: {
    baseline: 'none' | 'available';
    previous: ReturnType<typeof snapshotMetadata> | null;
    locationChanged: boolean;
    added: string[];
    removed: CompactFeature[];
    updated: UpdatedFeature[];
    uncomparable: {
      current: (UncomparableFeature & { index: number })[];
      previous: (UncomparableFeature & { feature: CompactFeature })[];
    };
  };
};

// Included in both requests as well as the backend prompts, so existing deployments
// can interpret the new compact format during a rolling frontend/backend update.
export const AGENT_CONTEXT_GUIDANCE =
  'Context contains each current feature once, without map geometry. Spatial distanceMiles is approximate ' +
  'distance to the mapped area (zero inside/on its boundary), or to a point; unknown is not outside. ' +
  'comparison compares retrieved records with the last successful update: added IDs refer to current features, ' +
  'removed contains prior records, and updated contains only previous changed values plus separate source-time, ' +
  'geometry, and spatial changes. Missing optional previous values are null. Previous spatial values use the ' +
  'previous user location; locationChanged is distinct from changes in source records. A geometry change does ' +
  'not establish expansion or worsening. Added/removed IDs do not establish incident onset/resolution or ' +
  'replacement identity. baseline=none means no comparison; uncomparable records cannot be reliably matched.';

function snapshotMetadata(snapshot: CrisisSnapshot) {
  return {
    location: snapshot.location,
    fetchedAt: snapshot.fetchedAt,
    stale: snapshot.stale,
    sourceHealth: snapshot.sourceHealth,
  };
}

const unknownSpatial: SpatialContext = { relationship: 'unknown', distanceMiles: null };
const roundedMiles = (distance: number) => Math.round(distance * 10) / 10;

export function featureSpatialContext(feature: CrisisFeature, position: Position): SpatialContext {
  try {
    if (!Number.isFinite(position.latitude) || Math.abs(position.latitude) > 90 ||
        !Number.isFinite(position.longitude) || Math.abs(position.longitude) > 180) return { ...unknownSpatial };
    if (feature.geometry.type === 'Point') {
      const [longitude, latitude] = feature.geometry.coordinates;
      if (!Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
          !Number.isFinite(latitude) || Math.abs(latitude) > 90) return { ...unknownSpatial };
      const distance = distanceMiles(position, feature.geometry.coordinates);
      return Number.isFinite(distance)
        ? { relationship: 'unknown', distanceMiles: roundedMiles(distance) }
        : { ...unknownSpatial };
    }
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    // Close rings on a copy; the map snapshot must never be mutated. Turf's
    // containment check is planar: do not guess for antimeridian-crossing rings.
    const closed = polygons.map(polygon => polygon.map(ring => {
      if (ring.length < 3) throw new Error('Invalid ring');
      for (let index = 0; index < ring.length; index++) {
        const point = ring[index];
        const previous = ring[(index + ring.length - 1) % ring.length];
        if (!point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90 ||
            Math.abs(point[0] - previous[0]) > 180) throw new Error('Unsupported ring');
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
    }));
    const distance = pointToPolygonDistance([position.longitude, position.latitude], {
      type: 'MultiPolygon', coordinates: closed,
    }, { units: 'miles', method: 'geodesic' });
    if (!Number.isFinite(distance)) return { ...unknownSpatial };
    return {
      relationship: distance <= 0 ? 'inside' : 'outside',
      distanceMiles: roundedMiles(Math.max(0, distance)),
    };
  } catch {
    return { ...unknownSpatial };
  }
}

function compactFeature(feature: CrisisFeature, position: Position): CompactFeature {
  const { id, kind, title, status, severity, description, sourceName, sourceUrl, updatedAt, expiresAt } = feature;
  return { id, kind, title, status, severity, description, sourceName, sourceUrl, updatedAt, expiresAt,
    spatial: featureSpatialContext(feature, position) };
}

function identityCounts(features: CrisisFeature[]) {
  const counts = new Map<string, number>();
  features.forEach(feature => counts.set(feature.id, (counts.get(feature.id) ?? 0) + 1));
  return counts;
}

export function buildAgentContext(current: CrisisSnapshot, previous?: CrisisSnapshot | null): AgentContext {
  const currentCounts = identityCounts(current.features);
  const previousCounts = identityCounts(previous?.features ?? []);
  const uncertainIds = new Set([...current.features, ...previous?.features ?? []]
    .filter(feature => !feature.rawSourceId.trim()).map(feature => feature.id));
  const identityProblem = (feature: CrisisFeature): UncomparableFeature['reason'] | null => {
    if (!feature.id.trim() || !feature.rawSourceId.trim()) return 'missing-source-id';
    if (uncertainIds.has(feature.id) || (currentCounts.get(feature.id) ?? 0) > 1 ||
        (previousCounts.get(feature.id) ?? 0) > 1) return 'ambiguous-id';
    return null;
  };
  const features = current.features.map(feature => compactFeature(feature, current.location));
  const comparison: AgentContext['comparison'] = {
    baseline: previous ? 'available' : 'none', previous: previous ? snapshotMetadata(previous) : null,
    locationChanged: !!previous && (previous.location.latitude !== current.location.latitude ||
      previous.location.longitude !== current.location.longitude),
    added: [], removed: [], updated: [], uncomparable: { current: [], previous: [] },
  };
  current.features.forEach((feature, index) => {
    const reason = identityProblem(feature);
    if (reason) comparison.uncomparable.current.push({ id: feature.id, index, reason });
  });
  if (!previous) return { ...snapshotMetadata(current), features, comparison };

  const oldById = new Map(previous.features.filter(feature => !identityProblem(feature)).map(feature => [feature.id, feature]));
  current.features.forEach((feature, index) => {
    if (identityProblem(feature)) return;
    const old = oldById.get(feature.id);
    if (!old) {
      comparison.added.push(feature.id);
      return;
    }
    const previousValues: PreviousValues = {};
    for (const field of [...substantiveFields, 'sourceName', 'sourceUrl'] as const) {
      if (feature[field] !== old[field]) previousValues[field] = old[field] ?? null;
    }
    const update: UpdatedFeature = { id: feature.id };
    if (Object.keys(previousValues).length) update.previousValues = previousValues;
    if (feature.updatedAt !== old.updatedAt) update.previousUpdatedAt = old.updatedAt;
    if (JSON.stringify(feature.geometry) !== JSON.stringify(old.geometry)) update.geometryChanged = true;
    const previousSpatial = featureSpatialContext(old, previous.location);
    if (JSON.stringify(previousSpatial) !== JSON.stringify(features[index].spatial)) update.previousSpatial = previousSpatial;
    if (Object.keys(update).length > 1) comparison.updated.push(update);
  });
  previous.features.forEach(feature => {
    const reason = identityProblem(feature);
    if (reason) {
      comparison.uncomparable.previous.push({ id: feature.id, reason, feature: compactFeature(feature, previous.location) });
    } else if (!currentCounts.has(feature.id)) {
      comparison.removed.push(compactFeature(feature, previous.location));
    }
  });
  return { ...snapshotMetadata(current), features, comparison };
}
