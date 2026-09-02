import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatAgentResponse, ChatAgentState, CrisisSnapshot } from '../types';
import { invokeChatAgent } from '../services/chatAgent';

export function useChatAgent(runtimeSessionId: string): ChatAgentState {
  const [result, setResult] = useState<ChatAgentResponse | null>(null);
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

  const getChatAgentResponse = useCallback(
    async (
      prompt: string,
      snapshot: CrisisSnapshot,
      disasterWriteup: string,
      todoWriteup: string,
      previousSnapshot?: CrisisSnapshot,
    ) => {
      const currentRequestId = requestId.current + 1;
      requestId.current = currentRequestId;

      if (mounted.current) {
        setLoading(true);
        setError(null);
      }

      try {
        const response = await invokeChatAgent(
          runtimeSessionId,
          prompt,
          snapshot,
          disasterWriteup,
          todoWriteup,
          previousSnapshot,
        );
        if (mounted.current && requestId.current === currentRequestId) {
          setResult(response);
        }
        return response;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'ChatAgent request failed.';
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

  return { result, loading, error, getChatAgentResponse, reset };
}
