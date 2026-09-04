import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchChatAgentResponse } from '../services/chatAgent';
import type { ChatAgentRequest, ChatAgentResponse } from '../types';

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
      const response = await fetchChatAgentResponse(params);
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
