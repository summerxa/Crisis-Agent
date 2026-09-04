import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTodoListAgentResponse } from '../services/todoListAgent';
import type { TodoListAgentRequest, TodoListAgentResponse, TodoListAgentState } from '../types';

export function useTodoListAgent(): TodoListAgentState {
  const [data, setData] = useState<TodoListAgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const getTodoListAgentResponse = useCallback(async (params: TodoListAgentRequest) => {
    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;

    if (mounted.current) {
      setLoading(true);
      setError(null);
      setSuccess(false);
    }

    try {
      const response = await fetchTodoListAgentResponse(params);
      if (mounted.current && requestId.current === currentRequestId) {
        setData(response);
        setSuccess(true);
      }
      return response;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'TodoListAgent request failed.';
      if (mounted.current && requestId.current === currentRequestId) {
        setError(message);
        setSuccess(false);
      }
      throw caught;
    } finally {
      if (mounted.current && requestId.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, []);

  return {
    data,
    loading,
    error,
    success,
    getTodoListAgentResponse,
  };
}
