import json
import os
import boto3

agentcore = boto3.client(
    "bedrock-agentcore",
    region_name=os.environ["AWS_REGION"]
)

TODOLIST_AGENT_RUNTIME_ARN = os.environ["TODOLIST_AGENT_RUNTIME_ARN"]
CHAT_AGENT_RUNTIME_ARN = os.environ["CHAT_AGENT_RUNTIME_ARN"]

VALID_AGENTS = ["todolist", "chat"]
MIN_SESSION_ID_LENGTH = 33
STRUCTURED_OUTPUT_TOOL_NAMES = {
    "chat": "ChatOutput",
    "todolist": "TodoListOutput",
}


def get_runtime_arn(agent):
    agent = agent.lower()
    if agent == "todolist":
        return TODOLIST_AGENT_RUNTIME_ARN
    return CHAT_AGENT_RUNTIME_ARN


def bad_request(message):
    return {
        "statusCode": 400,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps({
            "error": message
        }),
    }


def get_client_session_id(body):
    session_id = body.get("sessionId") or body.get("runtimeSessionId")
    if not isinstance(session_id, str) or not session_id.strip():
        raise ValueError("sessionId must be a non-empty string")

    session_id = session_id.strip()
    if len(session_id) < MIN_SESSION_ID_LENGTH:
        raise ValueError(f"sessionId must be at least {MIN_SESSION_ID_LENGTH} characters")

    return session_id


def parse_response_body(response_body):
    if isinstance(response_body, bytes):
        response_text = response_body.decode("utf-8")
    else:
        response_text = str(response_body)

    try:
        return json.loads(response_text), response_text
    except json.JSONDecodeError:
        return response_text, response_text


def parse_event_body(event):
    body = event.get("body") or {}
    if isinstance(body, dict):
        return body
    if isinstance(body, str):
        return json.loads(body or "{}")
    raise ValueError("body must be a JSON object")


def iter_stream_json_events(response_text):
    for line in response_text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            data = line.removeprefix("data:").strip()
        else:
            data = line

        if not data or data[0] not in "{[":
            continue

        try:
            yield json.loads(data)
        except json.JSONDecodeError:
            continue


def extract_structured_output_from_sse(response_text, tool_name):
    tool_inputs_by_index = {}
    active_tool_by_index = {}

    for item in iter_stream_json_events(response_text):
        event = item.get("event") if isinstance(item, dict) else None
        if not isinstance(event, dict):
            continue

        block_start = event.get("contentBlockStart")
        if isinstance(block_start, dict):
            index = block_start.get("contentBlockIndex")
            start = block_start.get("start")
            tool_use = start.get("toolUse", {}) if isinstance(start, dict) else {}
            if tool_use.get("name") == tool_name and index is not None:
                active_tool_by_index[index] = tool_name
                tool_inputs_by_index[index] = []
            continue

        block_delta = event.get("contentBlockDelta")
        if isinstance(block_delta, dict):
            index = block_delta.get("contentBlockIndex")
            if active_tool_by_index.get(index) != tool_name:
                continue

            delta = block_delta.get("delta")
            tool_use_delta = delta.get("toolUse", {}) if isinstance(delta, dict) else {}
            input_delta = tool_use_delta.get("input")
            if isinstance(input_delta, str):
                tool_inputs_by_index[index].append(input_delta)
            continue

        block_stop = event.get("contentBlockStop")
        if isinstance(block_stop, dict):
            index = block_stop.get("contentBlockIndex")
            if active_tool_by_index.get(index) != tool_name:
                continue

            raw_input = "".join(tool_inputs_by_index.get(index, []))
            try:
                return json.loads(raw_input)
            except json.JSONDecodeError:
                return raw_input

    return None


def parse_json_string(value):
    if not isinstance(value, str):
        return value

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def extract_structured_output_from_value(value, tool_name):
    if isinstance(value, str):
        try:
            return extract_structured_output_from_value(json.loads(value), tool_name)
        except json.JSONDecodeError:
            return None

    if isinstance(value, list):
        for item in value:
            found = extract_structured_output_from_value(item, tool_name)
            if found is not None:
                return found
        return None

    if not isinstance(value, dict):
        return None

    if tool_name in value:
        return parse_json_string(value[tool_name])

    tool_use = value.get("toolUse")
    if isinstance(tool_use, dict) and tool_use.get("name") == tool_name:
        return parse_json_string(tool_use.get("input") or tool_use.get("arguments") or tool_use.get("content"))

    if value.get("name") == tool_name:
        return parse_json_string(value.get("input") or value.get("arguments") or value.get("content"))

    for child in value.values():
        found = extract_structured_output_from_value(child, tool_name)
        if found is not None:
            return found

    return None


def extract_structured_output(agent, agent_result, response_text):
    tool_name = STRUCTURED_OUTPUT_TOOL_NAMES[agent]

    found = extract_structured_output_from_value(agent_result, tool_name)
    if found is not None:
        return found

    if isinstance(response_text, str):
        return extract_structured_output_from_sse(response_text, tool_name)

    return None


def handler(event, context):
    try:
        try:
            body = parse_event_body(event)
        except (json.JSONDecodeError, ValueError) as exc:
            return bad_request(str(exc))

        prompt = body.get("prompt")

        if not isinstance(prompt, str) or not prompt.strip():
            return bad_request("prompt must be a non-empty string")

        agent = event["pathParameters"]["agent"]
        if not isinstance(agent, str) or agent.strip().lower() not in VALID_AGENTS:
            return bad_request(f"agent must be one of: {VALID_AGENTS}")

        try:
            session_id = get_client_session_id(body)
        except ValueError as exc:
            return bad_request(str(exc))

        payload = json.dumps({
            "prompt": prompt
        }).encode("utf-8")

        response = agentcore.invoke_agent_runtime(
            agentRuntimeArn=get_runtime_arn(agent),
            runtimeSessionId=session_id,
            payload=payload,
            qualifier="DEFAULT",
        )

        response_body = response["response"].read()

        agent_result, response_text = parse_response_body(response_body)
        agent_output = extract_structured_output(agent.strip().lower(), agent_result, response_text)

        body = {
            "sessionId": session_id
        }
        if agent_output is not None:
            body["response"] = agent_output

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps(body),
        }

    except Exception as exc:
        print(f"Agent invocation failed: {exc}")

        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "error": "Agent invocation failed"
            }),
        }
