from typing import Any
from collections import OrderedDict
from strands import Agent
import json
from pydantic import AliasChoices, BaseModel, Field, field_validator
from strands.agent.conversation_manager.null_conversation_manager import NullConversationManager
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from model.load import load_model
from mcp_client.client import get_web_search_mcp_client

app = BedrockAgentCoreApp()
log = app.logger

# Define MCP clients used by the model.
mcp_clients = [get_web_search_mcp_client()]

DEFAULT_SYSTEM_PROMPT = """
You are a crisis assistant chatbot helping a user scan and prepare for nearby disasters.
Use the supplied disaster snapshot, disaster writeup, and to-do writeup as local context for the user's question.
Fact-check important claims with external sources when current guidance, official status, or response steps matter.
Prefer official emergency-management and high-authority sources.

Output:
- citations: non-empty list of cited external source names. All factual guidance must be verified by these sources.
- answer: direct answer to the user's question.
- follow_up_questions: at most 5 useful follow-up questions the user could ask.

"""


class ChatOutput(BaseModel):
    citations: list[str]
    answer: str
    follow_up_questions: list[str] = Field(max_length=5)

    @field_validator("citations")
    @classmethod
    def require_citations(cls, value: list[str]) -> list[str]:
        citations = [citation.strip() for citation in value if citation and citation.strip()]
        if not citations:
            raise ValueError("citations must be non-empty")
        return citations

    @field_validator("answer")
    @classmethod
    def require_answer(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("answer must be a non-empty string")
        return value.strip()

    @field_validator("follow_up_questions")
    @classmethod
    def require_follow_up_questions_max(cls, value: list[str]) -> list[str]:
        questions = [question.strip() for question in value if question and question.strip()]
        if len(questions) > 5:
            raise ValueError("follow_up_questions must not exceed 5 items")
        return questions


class Position(BaseModel):
    latitude: float
    longitude: float
    accuracy: float
    timestamp: str


class CrisisFeature(BaseModel):
    id: str
    kind: str
    geometry: dict[str, Any]
    title: str
    status: str
    severity: str | None = None
    description: str | None = None
    sourceName: str
    sourceUrl: str
    updatedAt: str
    expiresAt: str | None = None
    rawSourceId: str


class SourceHealth(BaseModel):
    status: str
    checkedAt: str
    message: str | None = None


class SourceData(BaseModel):
    health: SourceHealth | None = None
    features: list[CrisisFeature] = Field(default_factory=list)


class CrisisSnapshot(BaseModel):
    location: Position
    fetchedAt: str
    stale: bool
    sources: dict[str, SourceData]
    all_features: list[CrisisFeature]
    previous_snapshot: dict[str, Any] | None = None


class ChatInputPayload(BaseModel):
    prompt: str = Field(validation_alias=AliasChoices("prompt", "user_prompt", "userPrompt"))
    disaster_snapshot: CrisisSnapshot = Field(
        validation_alias=AliasChoices(
            "disaster_snapshot",
            "disasterSnapshot",
            "disaster_weather_data",
            "disasterWeatherData",
            "snapshot",
        )
    )
    disaster_writeup: str = Field(validation_alias=AliasChoices("disaster_writeup", "disasterWriteup"))
    todo_writeup: str = Field(validation_alias=AliasChoices("todo_writeup", "todoWriteup", "to_do_writeup", "toDoWriteup"))

    @field_validator("prompt", "disaster_writeup", "todo_writeup")
    @classmethod
    def require_text(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("field must be a non-empty string")
        return value.strip()


# Define a collection of tools used by the model
tools = []

# Add MCP client to tools if available
for mcp_client in mcp_clients:
    if mcp_client:
        tools.append(mcp_client)

_INLINE_FUNCTION_NAMES = set()


def _make_conversation_manager():
    return NullConversationManager()

# Reuses one Agent per session_id so each session keeps its own in-process
# conversation history (best-effort; resets on cold start). The cache is bounded
# to 128 sessions with LRU eviction (least-recently-used is dropped and its
# history reset) so a single process serving many sessions cannot leak history
# between them or grow without limit. For durable history, attach a session manager.
def agent_factory():
    cache = OrderedDict()
    def get_or_create_agent(session_id):
        if session_id in cache:
            cache.move_to_end(session_id)
            return cache[session_id]
        if len(cache) >= 128:
            cache.popitem(last=False)
        cache[session_id] = Agent(
            model=load_model(),
            system_prompt=DEFAULT_SYSTEM_PROMPT,
            structured_output_model=ChatOutput,
            tools=tools,
            conversation_manager=_make_conversation_manager(),
            hooks=[
            ],
        )
        return cache[session_id]
    return get_or_create_agent
get_or_create_agent = agent_factory()


def strip_trailing_tool_use(messages: Any) -> list[dict]:
    """Strip toolUse blocks from the tail until the last message has none."""
    if not isinstance(messages, list):
        raise ValueError("messages must be a list")

    messages = list(messages)
    while messages:
        last = messages[-1]
        if not isinstance(last, dict):
            raise ValueError("each message must be an object")
        original_content = last.get("content", [])
        if not isinstance(original_content, list) or not all(isinstance(block, dict) for block in original_content):
            raise ValueError("each message content value must be a list of content blocks")

        content = [block for block in original_content if "toolUse" not in block]
        if len(content) == len(original_content):
            break
        if content:
            messages[-1] = {**last, "content": content}
            break
        messages.pop()

    return messages


def _build_structured_prompt(payload: ChatInputPayload) -> str:
    snapshot_json = json.dumps(payload.disaster_snapshot.model_dump(mode="json"), separators=(",", ":"))
    return (
        f"User question: {payload.prompt}\n\n"
        f"disaster_snapshot: {snapshot_json}\n\n"
        f"disaster_writeup: {payload.disaster_writeup}\n\n"
        f"todo_writeup: {payload.todo_writeup}"
    )


def _extract_prompt(payload: dict):
    """Accept validated harness messages, tool results, or shaped chat input."""
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")
    if "messages" in payload:
        return strip_trailing_tool_use(payload["messages"])
    if "tool_results" in payload:
        tool_results = payload["tool_results"]
        if not isinstance(tool_results, list) or not all(
            isinstance(tool_result, dict) and isinstance(tool_result.get("toolUseId"), str)
            for tool_result in tool_results
        ):
            raise ValueError("tool_results must contain objects with a toolUseId string")
        return [{"role": "user", "content": [{"toolResult": {
            "toolUseId": tr["toolUseId"],
            "status": tr.get("status", "success"),
            "content": tr.get("content", []),
        }} for tr in tool_results]}]
    prompt = payload.get("prompt", "")
    if not isinstance(prompt, str):
        raise ValueError("prompt must be a string")
    if any(
        key in payload
        for key in (
            "disaster_snapshot",
            "disasterSnapshot",
            "disaster_weather_data",
            "disasterWeatherData",
            "snapshot",
            "disaster_writeup",
            "disasterWriteup",
            "todo_writeup",
            "todoWriteup",
            "to_do_writeup",
            "toDoWriteup",
        )
    ):
        return _build_structured_prompt(ChatInputPayload.model_validate(payload))
    return prompt


def _has_inline_function_call(messages) -> bool:
    """Return True if messages contains an assistant toolUse for an inline function tool."""
    if not _INLINE_FUNCTION_NAMES or not isinstance(messages, list):
        return False
    for msg in messages:
        if msg.get("role") == "assistant":
            for block in msg.get("content", []):
                if isinstance(block, dict) and block.get("toolUse", {}).get("name") in _INLINE_FUNCTION_NAMES:
                    return True
    return False


def _is_inline_function_call(event: dict) -> bool:
    """Check if a contentBlockStart event is for an inline function tool."""
    if not _INLINE_FUNCTION_NAMES:
        return False
    cbs = event.get("contentBlockStart", {})
    start = cbs.get("start", {})
    tool_use = start.get("toolUse") if isinstance(start, dict) else None
    return tool_use is not None and tool_use.get("name") in _INLINE_FUNCTION_NAMES



@app.entrypoint
async def invoke(payload, context):
    log.info("Invoking Agent.....")


    session_id = getattr(context, 'session_id', 'default-session')
    agent = get_or_create_agent(session_id)

    prompt = _extract_prompt(payload)


    async for event in agent.stream_async(
        prompt,
    ):
        if not isinstance(event, dict) or "event" not in event:
            continue
        cbs = event["event"].get("contentBlockStart")
        if cbs is not None and not cbs.get("start"):
            continue
        yield event


if __name__ == "__main__":
    app.run()
