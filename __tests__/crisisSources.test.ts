import { fetchCrisisFeatures, parseWfigsFeatures } from '../src/services/crisisSources';

const now = '2026-08-31T12:00:00.000Z';
const geometry = {
  type: 'Polygon',
  coordinates: [[[-121, 37], [-120, 37], [-120, 38], [-121, 38], [-121, 37]]],
};

function perimeter(properties: Record<string, unknown>) {
  return {
    geometry,
    properties: {
      GlobalID: '{active-fire}',
      attr_IncidentName: 'Test Fire',
      attr_IncidentTypeCategory: 'WF',
      attr_ActiveFireCandidate: 1,
      attr_FireOutDateTime: null,
      ...properties,
    },
  };
}

test('maps an active wildfire with containment, acreage, source, and latest perimeter time', () => {
  const features = parseWfigsFeatures({ features: [perimeter({
    attr_PercentContained: 100,
    poly_GISAcres: 1234.4,
    poly_PolygonDateTime: '2026-08-31T10:00:00.000Z',
  })] }, now);

  expect(features).toHaveLength(1);
  expect(features[0]).toMatchObject({
    kind: 'wildfire',
    title: 'Test Fire',
    status: 'Active wildfire · 100% contained',
    description: '1,234 acres',
    sourceName: 'NIFC WFIGS Current Perimeters',
    updatedAt: '2026-08-31T10:00:00.000Z',
  });
  expect(features[0].sourceUrl).toContain('WFIGS_Interagency_Perimeters_Current');
});

test.each([
  ['prescribed fire', { attr_IncidentTypeCategory: 'RX' }],
  ['inactive fire', { attr_ActiveFireCandidate: 0 }],
  ['unknown active status', { attr_ActiveFireCandidate: null }],
  ['fire with an out time', { attr_FireOutDateTime: '2026-08-30T10:00:00.000Z' }],
])('excludes %s', (_label, properties) => {
  expect(parseWfigsFeatures({ features: [perimeter(properties)] }, now)).toEqual([]);
});

test('requests the Current service with a server-side active-wildfire filter', async () => {
  const originalFetch = globalThis.fetch;
  const mockFetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) });
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  try {
    const result = await fetchCrisisFeatures({ latitude: 37, longitude: -121, accuracy: 0, timestamp: now });
    const wfigsUrl = String(mockFetch.mock.calls[1][0]);
    const where = new URL(wfigsUrl).searchParams.get('where');
    expect(wfigsUrl).toContain('WFIGS_Interagency_Perimeters_Current');
    expect(where).toContain("attr_IncidentTypeCategory = 'WF'");
    expect(where).toContain('attr_ActiveFireCandidate = 1');
    expect(where).toContain('attr_FireOutDateTime IS NULL');
    expect(result.sourceHealth.wfigs.status).toBe('ok');
    expect(result.features).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
