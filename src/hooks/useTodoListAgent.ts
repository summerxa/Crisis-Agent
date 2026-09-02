import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrisisSnapshot, TodoListAgentResponse, TodoListAgentState } from '../types';
import { invokeTodoListAgent } from '../services/todoListAgent';

export function useTodoListAgent(runtimeSessionId: string): TodoListAgentState {
  const [result, setResult] = useState<TodoListAgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const requestId = useRef(0);

  const reset = useCallback(() => {
    requestId.current += 1;
    if (mounted.current) {
      setResult(null);
      setLoading(false);
      setError(null);
    }
  }, []);

  const getTodoListAgentResponse = useCallback(
    async (snapshot: CrisisSnapshot, previousSnapshot?: CrisisSnapshot) => {
      const currentRequestId = requestId.current + 1;
      requestId.current = currentRequestId;

      if (mounted.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const response = await invokeTodoListAgent(runtimeSessionId, snapshot, previousSnapshot);
        if (mounted.current && requestId.current === currentRequestId) {
          setResult(response);
        }
        return response;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'TodoListAgent request failed.';
        if (mounted.current && requestId.current === currentRequestId) {
          setError(message);
        }
        throw caught;
      } finally {
        if (mounted.current && requestId.current === currentRequestId) {
          setLoading(false);
        }
      }
    },
    [runtimeSessionId],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
    };
  }, []);

  return { result, loading, error, getTodoListAgentResponse, reset };
}
