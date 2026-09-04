import type { ChatAgentRequest, ChatAgentResponse } from '../types';
import { buildTodoListDisasterWeatherData } from './todoListAgent';
import { postAgentPrompt } from './agentClient';

export const CHAT_AGENT_PATH = '/agents/chat/invocations';

export function buildChatAgentPrompt({
  prompt,
  disasterSnapshot,
  previousSnapshot,
  disasterWriteup,
  todoWriteup,
}: Omit<ChatAgentRequest, 'sessionId'>) {
  const snapshotJson = JSON.stringify(buildTodoListDisasterWeatherData(disasterSnapshot, previousSnapshot));

  return (
    `User question: ${prompt}\n\n` +
    `disaster_snapshot: ${snapshotJson}\n\n` +
    `disaster_writeup: ${disasterWriteup}\n\n` +
    `todo_writeup: ${todoWriteup}`
  );
}

function assertChatAgentResponse(value: unknown): ChatAgentResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ChatAgent response is missing or invalid.');
  }

  const response = value as Partial<ChatAgentResponse>;
  if (
    !Array.isArray(response.citations) ||
    typeof response.answer !== 'string' ||
    !Array.isArray(response.follow_up_questions)
  ) {
    throw new Error('ChatAgent response does not match the expected shape.');
  }

  return response as ChatAgentResponse;
}

export async function fetchChatAgentResponse({
  sessionId,
  ...promptInput
}: ChatAgentRequest): Promise<ChatAgentResponse> {
  return postAgentPrompt({
    path: CHAT_AGENT_PATH,
    sessionId,
    prompt: buildChatAgentPrompt(promptInput),
    agentName: 'ChatAgent',
    assertResponse: assertChatAgentResponse,
  });
}
