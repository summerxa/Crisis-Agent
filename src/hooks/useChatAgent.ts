import { useCallback, useEffect, useRef, useState } from 'react';
import Config from 'react-native-config';
import { fetchChatAgentResponse } from '../services/chatAgent';
import type { ChatAgentRequest, ChatAgentResponse } from '../types';

// TODO: Just for testing, can delete later
const MOCK_CHAT_AGENT_RESPONSE: ChatAgentResponse = {
  citations: ['Mocked ChatAgent data'],
  answer:
    'Test test',
  follow_up_questions: [
    'What changed since the last update?',
    'What should I do first?',
    'Where can I find official local guidance?',
  ],
};

export function useChatAgent() {
  const [data, setData] = useState<ChatAgentResponse | null>(null);
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

  const getChatAgentResponse = useCallback(async (params: ChatAgentRequest) => {
    if (mounted.current) {
      setLoading(true);
      setError(null);
      setSuccess(false);
    }

    try {
      const response =
        Config.USE_MOCK_AGENT_RESPONSE === 'true'
          ? MOCK_CHAT_AGENT_RESPONSE
          : await fetchChatAgentResponse(params);
      if (mounted.current) {
        setData(response);
        setSuccess(true);
      }
      return response;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'ChatAgent request failed.';
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
    getChatAgentResponse,
  };
}
