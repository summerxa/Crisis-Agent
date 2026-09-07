import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SUGGESTED_PROMPTS } from '../constants';
import type { ChatMessage, CrisisDataState, SessionChatState } from '../types';
import { useChatAgent } from './useChatAgent';

const CHAT_HISTORY_STORAGE_KEY_PREFIX = 'crisisAgent.chatHistory';

const DEFAULT_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 0,
    role: 'assistant',
    text: "I'm your crisis assistant. I can answer questions about your current local disaster context, what to do, or what changed since your last update.",
  },
];

type StoredSessionChatState = {
  messages: ChatMessage[];
  followUpPrompts: string[];
  input: string;
};

function chatHistoryStorageKey(sessionId: string) {
  return `${CHAT_HISTORY_STORAGE_KEY_PREFIX}.${sessionId}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'number' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.text === 'string' &&
    (message.usedPreviousContext === undefined || typeof message.usedPreviousContext === 'boolean') &&
    (message.citations === undefined || isStringArray(message.citations))
  );
}

function parseStoredChatState(value: string | null): StoredSessionChatState | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredSessionChatState>;
    if (
      !Array.isArray(parsed.messages) ||
      !parsed.messages.every(isChatMessage) ||
      !isStringArray(parsed.followUpPrompts) ||
      typeof parsed.input !== 'string'
    ) {
      return null;
    }

    return {
      messages: parsed.messages,
      followUpPrompts: parsed.followUpPrompts,
      input: parsed.input,
    };
  } catch {
    return null;
  }
}

function nextMessageId(messages: ChatMessage[]) {
  return messages.reduce((maxId, message) => Math.max(maxId, message.id), -1) + 1;
}

function chatStatusText(crisisData: CrisisDataState) {
  if (crisisData.loading || crisisData.todoListAgent.loading) {
    return 'Refreshing current crisis context';
  }
  if (!crisisData.snapshot || !crisisData.todoListAgent.data) return 'Refresh status to start chat';
  if (crisisData.refreshError) return 'Refresh failed · Using previous context';

  return 'Current context ready';
}

function missingContextMessage(crisisData: CrisisDataState) {
  if (crisisData.loading || crisisData.todoListAgent.loading) {
    return 'I am refreshing your current crisis context. Try again when the refresh finishes.';
  }
  return 'Refresh status first so I can answer with current crisis context.';
}

function inputPlaceholder(crisisData: CrisisDataState, ready: boolean) {
  if (ready) return 'Ask about this crisis...';
  if (crisisData.loading) return 'Refreshing crisis context...';
  if (crisisData.todoListAgent.loading) return 'Preparing chat context...';
  return 'Refresh status before asking...';
}

export function useSessionChat({
  sessionId,
  crisisData,
}: {
  sessionId: string;
  crisisData: CrisisDataState;
}): SessionChatState {
  const chatAgent = useChatAgent();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [followUpPrompts, setFollowUpPrompts] = useState<string[]>(SUGGESTED_PROMPTS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const idRef = useRef(0);
  const mounted = useRef(true);
  const todoData = crisisData.todoListAgent.data;
  const latestSnapshot = useRef(crisisData.snapshot);
  useEffect(() => { latestSnapshot.current = crisisData.snapshot; }, [crisisData.snapshot]);
  const chatReady = !!crisisData.snapshot && !!todoData && !crisisData.loading && !crisisData.todoListAgent.loading;
  const disabled = !hydrated || !chatReady || isSubmitting || chatAgent.loading;
  const statusText = chatStatusText(crisisData);
  const contextMessage = missingContextMessage(crisisData);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setHydrated(false);
    setMessages([]);
    setInput('');
    setFollowUpPrompts(SUGGESTED_PROMPTS);
    idRef.current = 0;

    AsyncStorage.getItem(chatHistoryStorageKey(sessionId))
      .then(storedValue => {
        if (cancelled || !mounted.current) return;

        const storedState = parseStoredChatState(storedValue);
        const nextMessages = storedState?.messages.length
          ? storedState.messages
          : DEFAULT_CHAT_MESSAGES;
        setMessages(nextMessages);
        setFollowUpPrompts(storedState?.followUpPrompts ?? SUGGESTED_PROMPTS);
        setInput(storedState?.input ?? '');
        idRef.current = nextMessageId(nextMessages);
        setHydrated(true);
      })
      .catch(error => {
        console.error('Could not load chat history.', error);
        if (cancelled || !mounted.current) return;

        setMessages(DEFAULT_CHAT_MESSAGES);
        setFollowUpPrompts(SUGGESTED_PROMPTS);
        setInput('');
        idRef.current = nextMessageId(DEFAULT_CHAT_MESSAGES);
        setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!hydrated) return;

    AsyncStorage.setItem(
      chatHistoryStorageKey(sessionId),
      JSON.stringify({ messages, followUpPrompts, input }),
    ).catch(error => {
      console.error('Could not save chat history.', error);
    });
  }, [followUpPrompts, hydrated, input, messages, sessionId]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }

    setMessages(prev => [
      ...prev,
      { id: idRef.current++, role: 'user', text: trimmed },
    ]);
    setInput('');
    setIsSubmitting(true);
    const requestSnapshot = crisisData.snapshot!;

    try {
      const response = await chatAgent.getChatAgentResponse({
        sessionId,
        prompt: trimmed,
        disasterSnapshot: requestSnapshot,
        previousSnapshot: crisisData.previousSnapshot,
        disasterWriteup: todoData!.disaster_state_writeup,
        todoWriteup: todoData!.disaster_response_writeup,
      });
      if (!mounted.current) return;
      setMessages(prev => [
        ...prev,
        {
          id: idRef.current++,
          role: 'assistant',
          text: response.answer,
          citations: response.citations,
          usedPreviousContext: latestSnapshot.current !== requestSnapshot,
        },
      ]);
      setFollowUpPrompts(response.follow_up_questions.filter(Boolean));
    } catch (caught) {
      if (!mounted.current) return;
      const message = caught instanceof Error ? caught.message : 'ChatAgent request failed.';
      setMessages(prev => [
        ...prev,
        {
          id: idRef.current++,
          role: 'assistant',
          text: message,
        },
      ]);
    } finally {
      if (mounted.current) {
        setIsSubmitting(false);
      }
    }
  }, [chatAgent, crisisData.previousSnapshot, crisisData.snapshot, disabled, sessionId, todoData]);

  return {
    messages,
    input,
    setInput,
    followUpPrompts,
    isSubmitting,
    hydrated,
    chatReady,
    disabled,
    statusText,
    inputPlaceholder: inputPlaceholder(crisisData, chatReady),
    contextMessage,
    sendMessage,
  };
}
