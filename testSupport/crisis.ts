import type { CrisisSnapshot, Position, TodoListAgentResponse } from '../src/types';

export const position: Position = {
  latitude: 37.3, longitude: -121.9, accuracy: 5, timestamp: '2026-09-07T12:00:00.000Z',
};
export const sources = {
  features: [],
  sourceHealth: {
    nws: { status: 'ok' as const, checkedAt: position.timestamp },
    wfigs: { status: 'ok' as const, checkedAt: position.timestamp },
  },
};
export const snapshot: CrisisSnapshot = {
  ...sources, location: position, fetchedAt: position.timestamp, stale: false,
};
export const plan: TodoListAgentResponse = {
  state: 'CLEAR', subtitle: 'Stay informed', description: 'No mapped threats found.',
  change_items: ['No previous update'],
  action_items: [{ emoji: 'i', short_description: 'Check updates', long_description: 'Check official updates.', citation: ['NWS'] }],
  disaster_state_writeup: 'Current disaster context', disaster_response_writeup: 'Current action context',
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
