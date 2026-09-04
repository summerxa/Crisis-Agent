import type {
  CrisisFeature,
  CrisisSnapshot,
  SourceHealth,
  TodoListAgentRequest,
  TodoListAgentResponse,
} from '../types';
import { AGENT_URL, postAgentPrompt } from './agentClient';

export const TODO_LIST_AGENT_PATH = '/agents/todolist/invocations';

type TodoListSourceData = {
  health: SourceHealth | null;
  features: CrisisFeature[];
};

type TodoListDisasterWeatherData = {
  location: CrisisSnapshot['location'];
  fetchedAt: string;
  stale: boolean;
  sources: Record<'nws' | 'wfigs', TodoListSourceData>;
  all_features: CrisisFeature[];
  previous_snapshot: CrisisSnapshot | null;
};

function getFeatureSources(features: CrisisFeature[]) {
  return {
    nws: features.filter(feature => feature.id.startsWith('nws:')),
    wfigs: features.filter(feature => feature.id.startsWith('wfigs:')),
  };
}

export function buildTodoListDisasterWeatherData(
  crisisSnapshot: CrisisSnapshot,
  previousSnapshot?: CrisisSnapshot | null,
): TodoListDisasterWeatherData {
  const sourceFeatures = getFeatureSources(crisisSnapshot.features);

  return {
    location: crisisSnapshot.location,
    fetchedAt: crisisSnapshot.fetchedAt,
    stale: crisisSnapshot.stale,
    sources: {
      nws: {
        health: crisisSnapshot.sourceHealth.nws ?? null,
        features: sourceFeatures.nws,
      },
      wfigs: {
        health: crisisSnapshot.sourceHealth.wfigs ?? null,
        features: sourceFeatures.wfigs,
      },
    },
    all_features: crisisSnapshot.features,
    previous_snapshot: previousSnapshot ?? null,
  };
}

export function buildTodoListAgentPrompt(
  crisisSnapshot: CrisisSnapshot,
  previousSnapshot?: CrisisSnapshot | null,
) {
  const disasterWeatherData = buildTodoListDisasterWeatherData(crisisSnapshot, previousSnapshot);

  return (
    'The user refreshed their disaster status. Analyze the current snapshot, compare it with ' +
    'previous_snapshot when present, and produce the required structured output.\n\n' +
    `disaster_weather_data: ${JSON.stringify(disasterWeatherData)}`
  );
}

function assertTodoListAgentResponse(value: unknown): TodoListAgentResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TodoListAgent response is missing or invalid.');
  }

  const response = value as Partial<TodoListAgentResponse>;
  if (
    typeof response.state !== 'string' ||
    typeof response.subtitle !== 'string' ||
    typeof response.description !== 'string' ||
    !Array.isArray(response.change_items) ||
    !Array.isArray(response.action_items) ||
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
}: TodoListAgentRequest): Promise<TodoListAgentResponse> {
  const prompt = buildTodoListAgentPrompt(crisisSnapshot, previousSnapshot);

  return postAgentPrompt({
    path: TODO_LIST_AGENT_PATH,
    sessionId,
    prompt,
    agentName: 'TodoListAgent',
    assertResponse: assertTodoListAgentResponse,
  });
}

export { AGENT_URL };
