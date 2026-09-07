import Config from 'react-native-config';
import { fetchTodoListAgentResponse } from '../src/services/todoListAgent';
import { plan, snapshot } from '../testSupport/crisis';

jest.mock('react-native-config', () => ({ AGENT_URL: 'https://agent.test', USE_MOCK_AGENT_RESPONSE: 'false' }));

const originalFetch = globalThis.fetch;
const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
  Config.USE_MOCK_AGENT_RESPONSE = 'false';
});
afterEach(() => { globalThis.fetch = originalFetch; });
function respond(response: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ body: { response } }) });
}

test('real request includes current and previous snapshots, and propagates abort signal', async () => {
  respond(plan);
  const controller = new AbortController();
  await expect(fetchTodoListAgentResponse({ sessionId: 'session', crisisSnapshot: snapshot, previousSnapshot: snapshot }, controller.signal)).resolves.toEqual(plan);
  const [url, request] = mockFetch.mock.calls[0];
  expect(url).toBe('https://agent.test/agents/todolist/invocations');
  expect(request.signal).toBe(controller.signal);
  const body = JSON.parse(request.body);
  expect(body.sessionId).toBe('session');
  expect(body.prompt).toContain('previous_snapshot');
  expect(body.prompt).toContain(snapshot.fetchedAt);
});

test.each([
  null,
  { ...plan, state: 'INVALID' },
  { ...plan, change_items: [null] },
  { ...plan, action_items: [null] },
  { ...plan, action_items: [{ ...plan.action_items[0], citation: [123] }] },
  { ...plan, disaster_state_writeup: undefined },
])('rejects malformed agent output: %j', async response => {
  respond(response);
  await expect(fetchTodoListAgentResponse({ sessionId: 'session', crisisSnapshot: snapshot })).rejects.toThrow();
});

test('rejects malformed JSON and transport failure', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, text: async () => 'not JSON' });
  await expect(fetchTodoListAgentResponse({ sessionId: 'session', crisisSnapshot: snapshot })).rejects.toThrow('malformed JSON');
  mockFetch.mockRejectedValueOnce(new Error('Offline'));
  await expect(fetchTodoListAgentResponse({ sessionId: 'session', crisisSnapshot: snapshot })).rejects.toThrow('Offline');
});

test('explicit mock mode remains available without a network request', async () => {
  Config.USE_MOCK_AGENT_RESPONSE = 'true';
  await expect(fetchTodoListAgentResponse({ sessionId: 'session', crisisSnapshot: snapshot })).resolves.toHaveProperty('action_items');
  expect(mockFetch).not.toHaveBeenCalled();
});

test('missing agent URL fails before any network request', async () => {
  Config.AGENT_URL = '';
  try {
    let request!: typeof fetchTodoListAgentResponse;
    jest.isolateModules(() => {
      request = require('../src/services/todoListAgent').fetchTodoListAgentResponse;
    });
    await expect(request({ sessionId: 'session', crisisSnapshot: snapshot })).rejects.toThrow('AGENT_URL is not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  } finally {
    Config.AGENT_URL = 'https://agent.test';
  }
});
