import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';
import { SignatureV4 } from '@smithy/signature-v4';
import { awsCredentials } from '../api/awsCredentials';

export const AGENT_URL = 'https://lp1aspew00.execute-api.us-east-1.amazonaws.com';

const AWS_REGION = 'us-east-1';
const AWS_SERVICE = 'execute-api';

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

function headersToFetchHeaders(headers: Record<string, string | string[] | undefined>) {
  return Object.entries(headers).reduce<Record<string, string>>((result, [key, value]) => {
    if (value === undefined) {
      return result;
    }
    result[key] = Array.isArray(value) ? value.join(',') : value;
    return result;
  }, {});
}

async function signAgentRequest(path: string, body: string) {
  const endpoint = new URL(`${AGENT_URL}${path}`);
  const signer = new SignatureV4({
    credentials: awsCredentials,
    region: AWS_REGION,
    service: AWS_SERVICE,
    sha256: Sha256,
  });

  const request = new HttpRequest({
    protocol: endpoint.protocol,
    hostname: endpoint.hostname,
    method: 'POST',
    path: `${endpoint.pathname}${endpoint.search}`,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      host: endpoint.hostname,
    },
    body,
  });

  return signer.sign(request);
}

export function extractAgentResponse(
  payload: unknown,
  agentName: string,
  assertResponse: (value: unknown) => unknown,
) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${agentName} returned an invalid response.`);
  }

  const wrapper = payload as AgentWrapperResponse;
  if (typeof wrapper.statusCode === 'number' && wrapper.statusCode !== 200) {
    const body = wrapper.body ? parseBody(wrapper.body, agentName) : null;
    const message = typeof body?.error === 'string' ? body.error : `${agentName} returned status ${wrapper.statusCode}.`;
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
}: {
  path: string;
  sessionId: string;
  prompt: string;
  agentName: string;
  assertResponse: (value: unknown) => TResponse;
}) {
  const requestBody = JSON.stringify({ sessionId, prompt });
  const signedRequest = await signAgentRequest(path, requestBody);

  const response = await fetch(`${AGENT_URL}${path}`, {
    method: 'POST',
    headers: headersToFetchHeaders(signedRequest.headers),
    body: requestBody,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${agentName} request failed with status ${response.status}.`);
  }
  if (!responseText.trim()) {
    throw new Error(`${agentName} returned an empty response.`);
  }

  return extractAgentResponse(parseJson(responseText, agentName), agentName, assertResponse) as TResponse;
}
