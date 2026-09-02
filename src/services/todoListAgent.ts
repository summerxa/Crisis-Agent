import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import type { CrisisSnapshot, StatusLevel, TodoListAgentResponse } from '../types';

type JsonObject = Record<string, unknown>;

const TODO_LIST_AGENT_REGION = 'us-east-1';
const TODO_LIST_AGENT_RUNTIME_ARN =
  'arn:aws:bedrock-agentcore:us-east-1:195663985692:runtime/CrisisAgentBackend_TodoListAgent-KumH8T9OZN';

// TODO(summerxa): if something explodes on app, this might(emphasis might!!!) be the culprit
//    (aws credentials not set on mobile or need some way to configure it)
const client = new BedrockAgentCoreClient({ region: TODO_LIST_AGENT_REGION });

const VALID_STATES = new Set<StatusLevel>(['CLEAR', 'AWARE', 'PREPARE', 'ACT', 'RECOVER']);

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`TodoListAgent returned malformed output: ${field} must be a string.`);
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`TodoListAgent returned malformed output: ${field} must be a string array.`);
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

function looksLikeTodoListOutput(value: unknown): value is JsonObject {
  return (
    isObject(value) &&
    typeof value.state === 'string' &&
    typeof value.subtitle === 'string' &&
    typeof value.description === 'string' &&
    Array.isArray(value.change_items) &&
    Array.isArray(value.action_items) &&
    typeof value.disaster_state_writeup === 'string' &&
    typeof value.disaster_response_writeup === 'string'
  );
}

function findTodoListOutput(value: unknown): JsonObject | null {
  if (typeof value === 'string') {
    const parsed = extractObjectFromText(value);
    return parsed ? findTodoListOutput(parsed) : null;
  }

  if (looksLikeTodoListOutput(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTodoListOutput(item);
      if (found) return found;
    }
    return null;
  }

  if (!isObject(value)) return null;

  const toolUse = value.toolUse;
  if (isObject(toolUse) && toolUse.name === 'TodoListOutput') {
    const input = toolUse.input;
    const found = findTodoListOutput(input);
    if (found) return found;
  }

  if (value.name === 'TodoListOutput') {
    const found = findTodoListOutput(value.input ?? value.arguments ?? value.content);
    if (found) return found;
  }

  for (const child of Object.values(value)) {
    const found = findTodoListOutput(child);
    if (found) return found;
  }

  return null;
}

function normalizeTodoListOutput(output: JsonObject): TodoListAgentResponse {
  const state = stringValue(output.state, 'state');
  if (!VALID_STATES.has(state as StatusLevel)) {
    throw new Error(`TodoListAgent returned malformed output: unsupported state "${state}".`);
  }

  const actionItems = output.action_items;
  if (!Array.isArray(actionItems)) {
    throw new Error('TodoListAgent returned malformed output: action_items must be an array.');
  }

  return {
    state: state as StatusLevel,
    subtitle: stringValue(output.subtitle, 'subtitle'),
    description: stringValue(output.description, 'description'),
    changeItems: stringArray(output.change_items, 'change_items'),
    actionItems: actionItems.map((item, index) => {
      if (!isObject(item)) {
        throw new Error(`TodoListAgent returned malformed output: action_items[${index}] must be an object.`);
      }
      return {
        emoji: stringValue(item.emoji, `action_items[${index}].emoji`),
        shortDescription: stringValue(
          item.short_description,
          `action_items[${index}].short_description`,
        ),
        longDescription: stringValue(
          item.long_description,
          `action_items[${index}].long_description`,
        ),
        citation: stringArray(item.citation, `action_items[${index}].citation`),
      };
    }),
    disasterStateWriteup: stringValue(output.disaster_state_writeup, 'disaster_state_writeup'),
    disasterResponseWriteup: stringValue(
      output.disaster_response_writeup,
      'disaster_response_writeup',
    ),
  };
}

export async function invokeTodoListAgent(
  runtimeSessionId: string,
  snapshot: CrisisSnapshot,
  previousSnapshot?: CrisisSnapshot,
): Promise<TodoListAgentResponse> {
  if (runtimeSessionId.length < 33) {
    throw new Error('TodoListAgent requires a runtimeSessionId of at least 33 characters.');
  }

  if (!snapshot) {
    throw new Error('TodoListAgent requires a crisis snapshot.');
  }

  const payload = encodeUtf8(JSON.stringify({
    crisisSnapshot: snapshot,
    previousSnapshot,
  }));

  const command = new InvokeAgentRuntimeCommand({
    runtimeSessionId,
    agentRuntimeArn: TODO_LIST_AGENT_RUNTIME_ARN,
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
    throw new Error(`TodoListAgent invocation failed: ${message}`);
  }

  const parsedBody = extractObjectFromText(text);

  const output = findTodoListOutput(parsedBody ?? text);
  if (!output) {
    throw new Error('TodoListAgent response did not include structured TodoListOutput.');
  }

  return normalizeTodoListOutput(output);
}
