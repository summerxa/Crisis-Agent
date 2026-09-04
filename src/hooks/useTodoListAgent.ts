import { useCallback, useEffect, useRef, useState } from 'react';
import Config from 'react-native-config';
import { fetchTodoListAgentResponse } from '../services/todoListAgent';
import type { TodoListAgentRequest, TodoListAgentResponse, TodoListAgentState } from '../types';

// TODO: Just for testing, can delete later
const MOCK_TODO_LIST_AGENT_RESPONSE: TodoListAgentResponse = {
  state: 'ACT',
  subtitle: 'Suggested action plan: krill urself',
  description:
    'Look out! There is a magnitude 67 earthquake nearby.',
  change_items: [
    'More testing test',
    'Mock response plan is ready for review.',
  ],
  action_items: [
    {
      emoji: '🔥',
      short_description: 'This is a test',
      long_description:
        'Testing todo list agent output and UI stuff yayyy',
      citation: ['Mocked TodoListAgent data'],
    },
    {
      emoji: '😋',
      short_description: 'Six seven',
      long_description:
        'Six seven six seven six seven six seven six seven six seven six seven six seven',
      citation: ['Mocked TodoListAgent data'],
    },
  ],
  disaster_state_writeup:
    'Mock disaster state writeup used for testing screens and downstream chat context.',
  disaster_response_writeup:
    'Mock response writeup used for testing action lists without making network requests.',
};

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
      const response =
        Config.USE_MOCK_AGENT_RESPONSE === 'true'
          ? MOCK_TODO_LIST_AGENT_RESPONSE
          : await fetchTodoListAgentResponse(params);
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
