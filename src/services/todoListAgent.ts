import Config from 'react-native-config';
import { AGENT_CONTEXT_GUIDANCE, buildAgentContext } from './agentContext';
import type {
  CrisisSnapshot,
  TodoListAgentRequest,
  TodoListAgentResponse,
} from '../types';
import { AGENT_URL, postAgentPrompt } from './agentClient';

const MOCK_TODO_LIST_AGENT_RESPONSE: TodoListAgentResponse = {
  state: 'ACT',
  subtitle: 'This is a test. Here is a placeholder suggested action plan.',
  description:
    'This is a test. Natural disaster info goes here.',
  change_items: [
    'Mock response plan is ready for review.',
    'Mock data goes here',
  ],
  action_items: [
    {
      emoji: '🔥',
      short_description: 'This is a test',
      long_description:
        'Testing todo list agent output and UI',
      citation: ['Mocked TodoListAgent data'],
    },
    {
      emoji: '🍎',
      short_description: 'Testing',
      long_description:
        'Here is a description. It might be long. The UI should support long descriptions.',
      citation: ['Mocked TodoListAgent data'],
    },
  ],
  disaster_state_writeup:
    'Mock disaster state writeup used for testing screens and downstream chat context.',
  disaster_response_writeup:
    'Mock response writeup used for testing action lists without making network requests.',
};

export const TODO_LIST_AGENT_PATH = '/agents/todolist/invocations';

export function buildTodoListAgentPrompt(
  crisisSnapshot: CrisisSnapshot,
  previousSnapshot?: CrisisSnapshot | null,
) {
  const disasterWeatherData = buildAgentContext(crisisSnapshot, previousSnapshot);

  return (
    'The user refreshed their disaster status. Analyze the current snapshot, compare it with ' +
    'the supplied comparison when available, and produce the required structured output.\n\n' +
    AGENT_CONTEXT_GUIDANCE + '\n\n' +
    `disaster_weather_data: ${JSON.stringify(disasterWeatherData)}`
  );
}

function assertTodoListAgentResponse(value: unknown): TodoListAgentResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TodoListAgent response is missing or invalid.');
  }

  const response = value as Partial<TodoListAgentResponse>;
  if (
    !['CLEAR', 'AWARE', 'PREPARE', 'ACT', 'RECOVER'].includes(response.state ?? '') ||
    typeof response.subtitle !== 'string' ||
    typeof response.description !== 'string' ||
    !Array.isArray(response.change_items) ||
    !response.change_items.every(item => typeof item === 'string') ||
    !Array.isArray(response.action_items) ||
    !response.action_items.every(item => item &&
      typeof item.emoji === 'string' &&
      typeof item.short_description === 'string' &&
      typeof item.long_description === 'string' &&
      Array.isArray(item.citation) && item.citation.every(citation => typeof citation === 'string')) ||
    typeof response.disaster_state_writeup !== 'string' ||
    typeof response.disaster_response_writeup !== 'string'
  ) {
    throw new Error('TodoListAgent response does not match the expected shape.');
  }

  return response as TodoListAgentResponse;
}

export async function fetchTodoListAgentResponse({
  sessionId,
  crisisSnapshot,
  previousSnapshot,
}: TodoListAgentRequest, signal?: AbortSignal): Promise<TodoListAgentResponse> {
  if (Config.USE_MOCK_AGENT_RESPONSE === 'true') return MOCK_TODO_LIST_AGENT_RESPONSE;
  const prompt = buildTodoListAgentPrompt(crisisSnapshot, previousSnapshot);

  return postAgentPrompt({
    path: TODO_LIST_AGENT_PATH,
    sessionId,
    prompt,
    agentName: 'TodoListAgent',
    assertResponse: assertTodoListAgentResponse,
    signal,
  });
}

export { AGENT_URL };
