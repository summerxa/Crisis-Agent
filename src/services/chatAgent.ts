import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import type { CrisisFeature, CrisisSnapshot, SourceHealth, ChatAgentResponse } from '../types';

type JsonObject = Record<string, unknown>;
type SourceKey = 'nws' | 'wfigs';

type ChatAgentDisasterSnapshot = {
  location: CrisisSnapshot['location'];
  fetchedAt: string;
  stale: boolean;
  sources: Record<SourceKey, {
    health: SourceHealth | null;
    features: CrisisFeature[];
  }>;
  all_features: CrisisFeature[];
  previous_snapshot?: CrisisSnapshot;
};

const CHAT_AGENT_REGION = 'us-east-1';
const CHAT_AGENT_RUNTIME_ARN =
  'arn:aws:bedrock-agentcore:us-east-1:195663985692:runtime/CrisisAgentBackend_ChatAgent-BVT2Uk3QTp';

// TODO(summerxa): if something explodes on app, this might(emphasis might!!!) be the culprit
//    (aws credentials not set on mobile or need some way to configure it)
const client = new BedrockAgentCoreClient({ region: CHAT_AGENT_REGION });

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`ChatAgent returned malformed output: ${field} must be a string.`);
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`ChatAgent returned malformed output: ${field} must be a string array.`);
  }
  return value;
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function encodeUtf8(text: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.charCodeAt(index);

    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return new Uint8Array(bytes);
}

function extractObjectFromText(text: string): unknown {
  const parsed = parseJsonObject(text);
  if (parsed) return parsed;

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const lineParsed = parseJsonObject(line);
    if (lineParsed) return lineParsed;
  }

  return null;
}

function looksLikeChatOutput(value: unknown): value is JsonObject {
  return (
    isObject(value) &&
    Array.isArray(value.citations) &&
    typeof value.answer === 'string' &&
    Array.isArray(value.follow_up_questions)
  );
}

function findChatOutput(value: unknown): JsonObject | null {
  if (typeof value === 'string') {
    const parsed = extractObjectFromText(value);
    return parsed ? findChatOutput(parsed) : null;
  }

  if (looksLikeChatOutput(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findChatOutput(item);
      if (found) return found;
    }
    return null;
  }

  if (!isObject(value)) return null;

  const toolUse = value.toolUse;
  if (isObject(toolUse) && toolUse.name === 'ChatOutput') {
    const found = findChatOutput(toolUse.input);
    if (found) return found;
  }

  if (value.name === 'ChatOutput') {
    const found = findChatOutput(value.input ?? value.arguments ?? value.content);
    if (found) return found;
  }

  for (const child of Object.values(value)) {
    const found = findChatOutput(child);
    if (found) return found;
  }

  return null;
}

function normalizeChatOutput(output: JsonObject): ChatAgentResponse {
  return {
    citations: stringArray(output.citations, 'citations'),
    answer: stringValue(output.answer, 'answer'),
    followUpQuestions: stringArray(output.follow_up_questions, 'follow_up_questions'),
  };
}

function buildDisasterSnapshot(
  snapshot: CrisisSnapshot,
  previousSnapshot?: CrisisSnapshot,
): ChatAgentDisasterSnapshot {
  const sourceFeatures: Record<SourceKey, CrisisFeature[]> = {
    nws: [],
    wfigs: [],
  };

  for (const feature of snapshot.features) {
    if (feature.id.startsWith('nws:')) {
      sourceFeatures.nws.push(feature);
    } else if (feature.id.startsWith('wfigs:')) {
      sourceFeatures.wfigs.push(feature);
    }
  }

  return {
    location: snapshot.location,
    fetchedAt: snapshot.fetchedAt,
    stale: snapshot.stale,
    sources: {
      nws: {
        health: snapshot.sourceHealth.nws ?? null,
        features: sourceFeatures.nws,
      },
      wfigs: {
        health: snapshot.sourceHealth.wfigs ?? null,
        features: sourceFeatures.wfigs,
      },
    },
    all_features: snapshot.features,
    previous_snapshot: previousSnapshot,
  };
}

export async function invokeChatAgent(
  runtimeSessionId: string,
  prompt: string,
  snapshot: CrisisSnapshot,
  disasterWriteup: string,
  todoWriteup: string,
  previousSnapshot?: CrisisSnapshot,
): Promise<ChatAgentResponse> {
  if (runtimeSessionId.length < 33) {
    throw new Error('ChatAgent requires a runtimeSessionId of at least 33 characters.');
  }

  if (!prompt.trim()) {
    throw new Error('ChatAgent requires a prompt.');
  }

  if (!snapshot) {
    throw new Error('ChatAgent requires a crisis snapshot.');
  }

  if (!disasterWriteup.trim() || !todoWriteup.trim()) {
    throw new Error('ChatAgent requires disaster and to-do writeups.');
  }

  const payload = encodeUtf8(JSON.stringify({
    prompt,
    disasterSnapshot: buildDisasterSnapshot(snapshot, previousSnapshot),
    disasterWriteup,
    todoWriteup,
  }));

  const command = new InvokeAgentRuntimeCommand({
    runtimeSessionId,
    agentRuntimeArn: CHAT_AGENT_RUNTIME_ARN,
    payload,
  });

  let text: string;
  try {
    const response = await client.send(command);
    if (!response.response) {
      throw new Error('AgentCore returned no response stream.');
    }
    text = await response.response.transformToString();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'unknown error';
    throw new Error(`ChatAgent invocation failed: ${message}`);
  }

  const parsedBody = extractObjectFromText(text);
  const output = findChatOutput(parsedBody ?? text);
  if (!output) {
    throw new Error('ChatAgent response did not include structured ChatOutput.');
  }

  return normalizeChatOutput(output);
}
