import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTodoListAgentResponse } from '../services/todoListAgent';
import type { TodoListAgentRequest, TodoListAgentResponse } from '../types';

export function useTodoListAgent() {
  const [data, setData] = useState<TodoListAgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const getTodoListAgentResponse = useCallback(async (params: TodoListAgentRequest) => {
    if (mounted.current) {
      setLoading(true);
      setError(null);
      setSuccess(false);
    }

    try {
      const response = await fetchTodoListAgentResponse(params);
      if (mounted.current) {
        setData(response);
        setSuccess(true);
      }
      return response;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'TodoListAgent request failed.';
      if (mounted.current) {
        setError(message);
        setSuccess(false);
      }
      throw caught;
    } finally {
      if (mounted.current) {
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
