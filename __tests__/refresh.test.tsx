import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCrisisData, REFRESH_TIMEOUT_MS } from '../src/hooks/useCrisisData';
import { useSessionChat } from '../src/hooks/useSessionChat';
import { getCurrentPosition, LocationPermissionDeniedError } from '../src/services/location';
import { reverseGeocodePosition } from '../src/services/reverseGeocoder';
import { fetchCrisisFeatures } from '../src/services/crisisSources';
import { fetchTodoListAgentResponse } from '../src/services/todoListAgent';
import { fetchChatAgentResponse } from '../src/services/chatAgent';
import type { ChatAgentResponse, CrisisDataState, RefreshResult, SessionChatState, TodoListAgentResponse } from '../src/types';
import { deferred, plan, position, sources } from '../testSupport/crisis';

jest.mock('react-native-config', () => ({ USE_MOCK_AGENT_RESPONSE: 'false' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/location', () => ({
  getCurrentPosition: jest.fn(),
  LocationPermissionDeniedError: class extends Error {},
}));
jest.mock('../src/services/crisisSources', () => ({ fetchCrisisFeatures: jest.fn() }));
jest.mock('../src/services/reverseGeocoder', () => ({ reverseGeocodePosition: jest.fn().mockResolvedValue(null) }));
jest.mock('../src/services/todoListAgent', () => ({ fetchTodoListAgentResponse: jest.fn() }));
jest.mock('../src/services/chatAgent', () => ({ fetchChatAgentResponse: jest.fn() }));

const locate = jest.mocked(getCurrentPosition);
const fetchSources = jest.mocked(fetchCrisisFeatures);
const generate = jest.mocked(fetchTodoListAgentResponse);
const ask = jest.mocked(fetchChatAgentResponse);
let data: CrisisDataState;
let chat: SessionChatState;
let renderer: Renderer.ReactTestRenderer;
let renderCount: number;
let sessionId: string | undefined;
let testLocation: typeof position | null;

function Harness() {
  data = useCrisisData({ sessionId, testLocation });
  chat = useSessionChat({ sessionId: sessionId ?? 'test-session', crisisData: data });
  renderCount++;
  return null;
}
async function mount() {
  await act(async () => { renderer = Renderer.create(<Harness />); });
}
async function advance(ms: number) {
  await act(async () => { jest.advanceTimersByTime(ms); });
}
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'setImmediate', 'nextTick'] });
  jest.clearAllMocks();
  renderCount = 0;
  sessionId = 'test-session';
  testLocation = null;
  locate.mockReset().mockResolvedValue(position);
  fetchSources.mockReset().mockResolvedValue(sources);
  generate.mockReset().mockResolvedValue(plan);
  ask.mockReset().mockResolvedValue({ answer: 'Answer', citations: ['NWS'], follow_up_questions: ['Next question'] });
});

test('uses the latest applied location only on refresh and returns to GPS when cleared', async () => {
  await mount();
  testLocation = { ...position, latitude: 12, longitude: 34 };
  await act(async () => renderer.update(<Harness />));
  expect(fetchSources).toHaveBeenCalledTimes(1);
  await act(async () => { await data.refresh(); });
  expect(locate).toHaveBeenCalledTimes(1);
  expect(fetchSources).toHaveBeenLastCalledWith(testLocation, expect.any(AbortSignal));
  expect(reverseGeocodePosition).toHaveBeenLastCalledWith(testLocation, expect.any(AbortSignal));
  expect(data.snapshot?.location).toEqual(testLocation);
  expect(generate).toHaveBeenLastCalledWith(expect.objectContaining({
    crisisSnapshot: expect.objectContaining({ location: testLocation }),
  }), expect.any(AbortSignal));
  testLocation = null;
  await act(async () => renderer.update(<Harness />));
  expect(fetchSources).toHaveBeenCalledTimes(2);
  await act(async () => { await data.refresh(); });
  expect(locate).toHaveBeenCalledTimes(2);
  expect(data.snapshot?.location).toEqual(position);
});

test('an active refresh keeps its captured test location when the override changes', async () => {
  testLocation = { ...position, latitude: 12, longitude: 34 };
  const original = testLocation;
  const pending = deferred<typeof sources>();
  fetchSources.mockReturnValueOnce(pending.promise);
  await mount();
  const activeRefresh = data.refresh();
  testLocation = { ...position, latitude: 56, longitude: 78 };
  await act(async () => renderer.update(<Harness />));
  expect(data.refresh()).toBe(activeRefresh);
  await act(async () => { pending.resolve(sources); await activeRefresh; });
  expect(data.snapshot?.location).toEqual(original);
  await act(async () => { await data.refresh(); });
  expect(data.snapshot?.location).toEqual(testLocation);
  expect(locate).not.toHaveBeenCalled();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  jest.useRealTimers();
});

test('runs location, both sources, and the plan in order; commits nothing before the plan resolves', async () => {
  const location = deferred<typeof position>();
  const sourceResult = deferred<typeof sources>();
  const agent = deferred<TodoListAgentResponse>();
  locate.mockReturnValueOnce(location.promise);
  fetchSources.mockReturnValueOnce(sourceResult.promise);
  generate.mockReturnValueOnce(agent.promise);
  await mount();
  expect(locate).toHaveBeenCalledTimes(1);
  expect(fetchSources).not.toHaveBeenCalled();
  await act(async () => location.resolve(position));
  expect(fetchSources).toHaveBeenCalledWith(position, expect.any(AbortSignal));
  expect(generate).not.toHaveBeenCalled();
  await act(async () => sourceResult.resolve(sources));
  expect(data.snapshot).toBeNull();
  expect(data.todoListAgent.data).toBeNull();
  expect(data.loading).toBe(true);
  await advance(10000);
  expect(data.refreshStep).toBe(3);
  expect(data.showRefresh).toBe(true);
  await act(async () => agent.resolve(plan));
  expect(data.snapshot?.location).toEqual(position);
  expect(data.todoListAgent.data).toBe(plan);
  expect(data.loading).toBe(false);
  expect(data.showRefresh).toBe(false);
  expect(chat.chatReady).toBe(true);
  expect(ask).not.toHaveBeenCalled();
});

test('fast success completes the timer sequence without repeating the request', async () => {
  await mount();
  expect(data.refreshOutcome).toBe('success');
  expect(data.refreshStep).toBe(0);
  expect(data.showRefresh).toBe(true);
  await advance(700);
  expect(data.refreshStep).toBe(1);
  await advance(700);
  expect(data.refreshStep).toBe(2);
  await advance(699);
  expect(data.showRefresh).toBe(true);
  await advance(1);
  expect(data.refreshStep).toBe(3);
  expect(data.showRefresh).toBe(false);
  expect(locate).toHaveBeenCalledTimes(1);
});

test('coalesces simultaneous refresh requests and ignores rerenders', async () => {
  const pending = deferred<typeof position>();
  locate.mockReturnValueOnce(pending.promise);
  await mount();
  const first = data.refresh();
  expect(data.refresh()).toBe(first);
  await act(async () => renderer.update(<Harness />));
  expect(locate).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(position); await first; });
  await expect(first).resolves.toEqual({ success: true });
});

test.each(['permission', 'location', 'nws', 'wfigs', 'sources', 'plan'])(
  '%s failure retains the complete successful result and comparison history, then supports retry', async stage => {
    await mount();
    await act(async () => { await data.refresh(); });
    const saved = data.snapshot;
    const savedPrevious = data.previousSnapshot;
    const savedPlan = data.todoListAgent.data;
    if (stage === 'permission') locate.mockRejectedValueOnce(new LocationPermissionDeniedError());
    if (stage === 'location') locate.mockRejectedValueOnce(new Error('No GPS'));
    if (stage === 'sources') fetchSources.mockRejectedValueOnce(new Error('Invalid source response'));
    if (stage === 'nws' || stage === 'wfigs') {
      fetchSources.mockResolvedValueOnce({ ...sources, sourceHealth: {
        ...sources.sourceHealth, [stage]: { status: 'error', checkedAt: position.timestamp },
      } });
    }
    if (stage === 'plan') generate.mockRejectedValueOnce(new Error('Invalid agent response'));
    let result!: RefreshResult;
    await act(async () => { result = await data.refresh(); });
    expect(result.success).toBe(false);
    expect(data.snapshot).toBe(saved);
    expect(data.previousSnapshot).toBe(savedPrevious);
    expect(data.todoListAgent.data).toBe(savedPlan);
    expect(data.refreshError).toBeTruthy();
    expect(data.showRefresh).toBe(false);
    expect(chat.chatReady).toBe(true);
    expect(chat.statusText).toContain('Using previous context');
    await act(async () => { await data.refresh(); });
    expect(data.previousSnapshot).toBe(saved);
    expect(data.refreshError).toBeNull();
    expect(data.refreshOutcome).toBe('success');
  },
);

test('first-load failure leaves context unavailable and does not wait for cosmetic timers', async () => {
  locate.mockRejectedValueOnce(new Error('No GPS'));
  await mount();
  expect(data.snapshot).toBeNull();
  expect(data.todoListAgent.data).toBeNull();
  expect(data.showRefresh).toBe(false);
  expect(chat.chatReady).toBe(false);
  expect(chat.statusText).toBe('Refresh status to start chat');
  expect(jest.getTimerCount()).toBe(0);
});

test('missing session fails before requesting a plan', async () => {
  sessionId = undefined;
  await mount();
  expect(data.refreshOutcome).toBe('failure');
  expect(data.refreshError).toContain('Session');
  expect(generate).not.toHaveBeenCalled();
});

test.each(['location', 'sources', 'plan'])('120-second deadline aborts %s and late results cannot overwrite a retry', async stage => {
  await mount();
  const saved = data.snapshot;
  const lateLocation = deferred<typeof position>();
  const lateSources = deferred<typeof sources>();
  const latePlan = deferred<TodoListAgentResponse>();
  if (stage === 'location') locate.mockReturnValueOnce(lateLocation.promise);
  if (stage === 'sources') fetchSources.mockReturnValueOnce(lateSources.promise);
  if (stage === 'plan') generate.mockReturnValueOnce(latePlan.promise);
  let result!: Promise<RefreshResult>;
  await act(async () => { result = data.refresh(); });
  const signal = locate.mock.calls[locate.mock.calls.length - 1][0]!;
  await advance(REFRESH_TIMEOUT_MS);
  await expect(result).resolves.toMatchObject({ success: false, error: expect.stringContaining('timed out') });
  expect(signal.aborted).toBe(true);
  expect(data.snapshot).toBe(saved);
  expect(data.loading).toBe(false);
  const nextPlan = { ...plan, subtitle: 'New plan' };
  generate.mockResolvedValueOnce(nextPlan);
  await act(async () => { await data.refresh(); });
  const nextSnapshot = data.snapshot;
  const requests = generate.mock.calls.length;
  await act(async () => {
    lateLocation.resolve(position);
    lateSources.resolve(sources);
    latePlan.resolve({ ...plan, subtitle: 'Late obsolete plan' });
  });
  expect(data.snapshot).toBe(nextSnapshot);
  expect(data.todoListAgent.data).toBe(nextPlan);
  expect(generate).toHaveBeenCalledTimes(requests);
});

test('unmount aborts requests, clears timers, and suppresses late updates', async () => {
  const late = deferred<TodoListAgentResponse>();
  generate.mockReturnValueOnce(late.promise);
  await mount();
  const signal = generate.mock.calls[0][1]!;
  await act(async () => renderer.unmount());
  const count = renderCount;
  expect(signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  await act(async () => late.resolve(plan));
  expect(renderCount).toBe(count);
});

test('chat preserves drafts/history, blocks during refresh, and sends only committed matching context', async () => {
  await mount();
  await act(async () => chat.sendMessage('First question'));
  const history = chat.messages;
  await act(async () => chat.setInput('My draft'));
  const pending = deferred<TodoListAgentResponse>();
  generate.mockReturnValueOnce(pending.promise);
  const oldSnapshot = data.snapshot;
  await act(async () => { data.refresh(); });
  expect(chat.disabled).toBe(true);
  expect(chat.messages).toBe(history);
  expect(chat.input).toBe('My draft');
  expect(data.snapshot).toBe(oldSnapshot);
  await act(async () => chat.sendMessage('Blocked question'));
  expect(ask).toHaveBeenCalledTimes(1);
  const newPlan = { ...plan, disaster_state_writeup: 'New disasters', disaster_response_writeup: 'New actions' };
  await act(async () => pending.resolve(newPlan));
  expect(ask).toHaveBeenCalledTimes(1);
  expect(chat.input).toBe('My draft');
  await act(async () => chat.sendMessage('Next question'));
  expect(ask.mock.calls[1][0]).toMatchObject({
    disasterSnapshot: data.snapshot, previousSnapshot: oldSnapshot,
    disasterWriteup: 'New disasters', todoWriteup: 'New actions',
  });
  generate.mockRejectedValueOnce(new Error('Agent offline'));
  await act(async () => { await data.refresh(); });
  await act(async () => chat.sendMessage('After failure'));
  expect(ask.mock.calls[2][0]).toMatchObject({ disasterSnapshot: data.snapshot, disasterWriteup: 'New disasters' });
  expect(AsyncStorage.setItem).toHaveBeenCalled();
});

test('labels an in-flight chat answer when a newer context commits', async () => {
  await mount();
  const pending = deferred<ChatAgentResponse>();
  ask.mockReturnValueOnce(pending.promise);
  let answer!: Promise<void>;
  await act(async () => { answer = chat.sendMessage('Question'); });
  await act(async () => { await data.refresh(); });
  await act(async () => {
    pending.resolve({ answer: 'Older answer', citations: [], follow_up_questions: [] });
    await answer;
  });
  expect(chat.messages[chat.messages.length - 1]).toMatchObject({ text: 'Older answer', usedPreviousContext: true });
});
