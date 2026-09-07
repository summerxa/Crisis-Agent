import Config from 'react-native-config';

export const AGENT_URL = Config.AGENT_URL;

type AgentWrapperBody = {
  sessionId?: unknown;
  response?: unknown;
  error?: unknown;
};

type AgentWrapperResponse = {
  statusCode?: unknown;
  body?: unknown;
  error?: unknown;
};

type AgentRequestLogContext = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};

function responseHeaders(response: Response) {
  const headers: Record<string, string> = {};
  response.headers?.forEach?.((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function parseJson(value: string, context: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${context} returned malformed JSON.`);
  }
}

function parseBody(body: unknown, agentName: string): AgentWrapperBody {
  const parsedBody = typeof body === 'string' ? parseJson(body, `${agentName} body`) : body;
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    throw new Error(`${agentName} response body is missing or invalid.`);
  }
  return parsedBody as AgentWrapperBody;
}

export function extractAgentResponse(
  payload: unknown,
  agentName: string,
  assertResponse: (value: unknown) => unknown,
  request?: AgentRequestLogContext,
) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${agentName} returned an invalid response.`);
  }

  const wrapper = payload as AgentWrapperResponse;
  if (typeof wrapper.statusCode === 'number' && wrapper.statusCode !== 200) {
    const body = wrapper.body ? parseBody(wrapper.body, agentName) : null;
    const message = typeof body?.error === 'string' ? body.error : `${agentName} returned status ${wrapper.statusCode}.`;
    console.error(`${agentName} returned an error status code.`, {
      request,
      response: {
        statusCode: wrapper.statusCode,
        body: wrapper.body,
        error: wrapper.error,
      },
    });
    throw new Error(message);
  }

  const body = 'body' in wrapper ? parseBody(wrapper.body, agentName) : (wrapper as AgentWrapperBody);
  if (!('response' in body)) {
    throw new Error(`${agentName} response body did not include a response field.`);
  }

  return assertResponse(body.response);
}

export async function postAgentPrompt<TResponse>({
  path,
  sessionId,
  prompt,
  agentName,
  assertResponse,
  signal,
}: {
  path: string;
  sessionId: string;
  prompt: string;
  agentName: string;
  assertResponse: (value: unknown) => TResponse;
  signal?: AbortSignal;
}) {
  if (!AGENT_URL) {
    throw new Error('AGENT_URL is not configured.');
  }

  const requestBody = JSON.stringify({ sessionId, prompt });
  const url = `${AGENT_URL}${path}`;
  const request = {
    url,
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: requestBody,
  };

  const response = await fetch(url, { ...request, signal });

  const responseText = await response.text();
  if (!response.ok) {
    console.error(`${agentName} HTTP request returned an error status code.`, {
      request,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders(response),
        body: responseText,
      },
    });
    throw new Error(`${agentName} request failed with status ${response.status}.`);
  }
  if (!responseText.trim()) {
    throw new Error(`${agentName} returned an empty response.`);
  }

  return extractAgentResponse(parseJson(responseText, agentName), agentName, assertResponse, request) as TResponse;
}
