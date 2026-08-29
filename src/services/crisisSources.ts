import type { CrisisFeature, Position, SourceHealth } from '../types';
import { parseGeometry } from './geometry';

type Json = Record<string, any>;
const WFIGS_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query';

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function iso(value: unknown, fallback: string) {
  const date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : fallback;
}

async function fetchNws(position: Position): Promise<CrisisFeature[]> {
  const url = `https://api.weather.gov/alerts/active?point=${position.latitude},${position.longitude}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/geo+json', 'User-Agent': 'CrisisAgent/0.0.1' },
  });
  if (!response.ok) throw new Error(`NWS returned ${response.status}`);
  const body = (await response.json()) as Json;
  const now = new Date().toISOString();
  return (Array.isArray(body.features) ? body.features : []).flatMap((item: Json) => {
    const geometry = parseGeometry(item.geometry);
    const p = item.properties ?? {};
    if (!geometry || !text(item.id) || !text(p.event)) return [];
    return [{
      id: `nws:${item.id}`,
      kind: 'weatherAlert' as const,
      geometry,
      title: text(p.headline, p.event),
      status: text(p.status, 'Actual'),
      severity: text(p.severity) || undefined,
      description: text(p.description) || undefined,
      sourceName: text(p.senderName, 'National Weather Service'),
      sourceUrl: text(p['@id'], text(item.id)),
      updatedAt: iso(p.sent ?? p.effective, now),
      expiresAt: p.expires ? iso(p.expires, now) : undefined,
      rawSourceId: text(item.id),
    }];
  });
}

async function fetchWfigs(position: Position): Promise<CrisisFeature[]> {
  const radius = 1.5;
  const envelope = [
    position.longitude - radius,
    position.latitude - radius,
    position.longitude + radius,
    position.latitude + radius,
  ].join(',');
  const params = new URLSearchParams({
    where: '1=1', geometry: envelope, geometryType: 'esriGeometryEnvelope',
    inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: '*', returnGeometry: 'true', f: 'geojson',
  });
  const response = await fetch(`${WFIGS_URL}?${params}`);
  if (!response.ok) throw new Error(`WFIGS returned ${response.status}`);
  const body = (await response.json()) as Json;
  const now = new Date().toISOString();
  return (Array.isArray(body.features) ? body.features : []).flatMap((item: Json, index: number) => {
    const geometry = parseGeometry(item.geometry);
    const p = item.properties ?? {};
    const rawId = text(p.GlobalID ?? p.OBJECTID ?? item.id, String(index));
    const title = text(p.IncidentName ?? p.poly_IncidentName, 'Wildfire perimeter');
    if (!geometry) return [];
    return [{
      id: `wfigs:${rawId}`,
      kind: 'wildfire' as const,
      geometry,
      title,
      status: text(p.IncidentTypeCategory ?? p.poly_IncidentTypeCategory, 'Active'),
      description: p.GISAcres ? `${Math.round(Number(p.GISAcres)).toLocaleString()} acres` : undefined,
      sourceName: 'NIFC WFIGS',
      sourceUrl: WFIGS_URL.replace('/query', ''),
      updatedAt: iso(p.DateCurrent ?? p.poly_DateCurrent ?? p.EditDate, now),
      rawSourceId: rawId,
    }];
  });
}

export async function fetchCrisisFeatures(position: Position) {
  const checkedAt = new Date().toISOString();
  const settled = await Promise.allSettled([fetchNws(position), fetchWfigs(position)]);
  const health = (result: PromiseSettledResult<CrisisFeature[]>): SourceHealth =>
    result.status === 'fulfilled'
      ? { status: 'ok', checkedAt }
      : { status: 'error', checkedAt, message: String(result.reason?.message ?? result.reason) };
  return {
    features: settled.flatMap(result => result.status === 'fulfilled' ? result.value : []),
    sourceHealth: { nws: health(settled[0]), wfigs: health(settled[1]) },
  };
}
