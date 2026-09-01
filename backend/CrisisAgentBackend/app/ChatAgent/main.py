from typing import Any
from collections import OrderedDict
from strands import Agent
import json
from pydantic import AliasChoices, BaseModel, Field
from strands.agent.conversation_manager.sliding_window_conversation_manager import SlidingWindowConversationManager
from strands.hooks import (
    AfterToolCallEvent,
    AfterToolsEvent,
    BeforeModelCallEvent,
    BeforeToolsEvent,
    HookOrder,
    HookRegistry,
)
from bedrock_agentcore.gateway.integrations.strands.plugins import AgentCoreToolSearchPlugin
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from model.load import load_model
from mcp_client.client import get_web_search_mcp_client

app = BedrockAgentCoreApp()
log = app.logger

# Define MCP clients used by the model.
mcp_clients = [get_web_search_mcp_client()]
log.info("Configured MCP clients: %d", sum(1 for mcp_client in mcp_clients if mcp_client))

DEFAULT_SYSTEM_PROMPT = """
You are a crisis assistant chatbot helping a user scan and prepare for nearby disasters.
Use the supplied disaster snapshot, disaster writeup, and to-do writeup as local context for the user's question.
Fact-check important claims with external sources when current guidance, official status, or response steps matter.
Prefer official emergency-management and high-authority sources.
Keep response concise (1 paragraph max). Do not use Markdown formatting besides bullet points.

Output:
- citations: non-empty list of cited external source names. All factual guidance must be verified by these sources.
- answer: direct answer to the user's question.
- follow_up_questions: useful follow-up questions the user could ask.

"""


class ChatOutput(BaseModel):
    citations: list[str] = Field(min_length=1)
    answer: str
    follow_up_questions: list[str] = Field(max_length=5)


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


# Define a collection of tools used by the model
tools = []

# Add MCP client to tools if available
for mcp_client in mcp_clients:
    if mcp_client:
        tools.append(mcp_client)
log.info("Configured static tools/providers: %d", len(tools))

_INLINE_FUNCTION_NAMES = set()
REQUIRED_TOOL_NAMES = {"DisasterWebSearch___WebSearch"}
STRUCTURED_OUTPUT_TOOL_NAME = ChatOutput.__name__


def _make_conversation_manager():
    return SlidingWindowConversationManager(window_size=20, should_truncate_results=True)


def _make_plugins():
    gateway_plugins = [AgentCoreToolSearchPlugin(mcp_client=mcp_client) for mcp_client in mcp_clients if mcp_client]
    log.info("Configured AgentCore tool-search plugins: %d", len(gateway_plugins))
    return gateway_plugins


def _registered_tool_names(agent: Agent) -> set[str]:
    return set(agent.tool_registry.registry) | set(agent.tool_registry.dynamic_tools)


class RequiredToolAssertion:
    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeModelCallEvent, self.assert_required_tools, order=HookOrder.SDK_LAST)

    def assert_required_tools(self, event: BeforeModelCallEvent) -> None:
        registered_tool_names = _registered_tool_names(event.agent)
        missing_tool_names = REQUIRED_TOOL_NAMES - registered_tool_names
        invocation_state = event.invocation_state
        observed_required_tools = invocation_state.get("chat_required_tools_observed", False)
        structured_output_only = registered_tool_names == {ChatOutput.__name__}

        log.info(
            "Required tool assertion: required=%s available=%s observed=%s structured_output_only=%s projected_input_tokens=%s",
            sorted(REQUIRED_TOOL_NAMES),
            sorted(registered_tool_names),
            observed_required_tools,
            structured_output_only,
            event.projected_input_tokens,
        )

        if not missing_tool_names:
            invocation_state["chat_required_tools_observed"] = True
            return

        if observed_required_tools and structured_output_only:
            log.info("Skipping required tool assertion during structured-output-only model pass")
            return

        raise RuntimeError(
            "Required tool(s) are not registered: "
            f"{sorted(missing_tool_names)}. Available tools: {sorted(registered_tool_names)}"
        )


class StructuredOutputTerminator:
    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolsEvent, self.keep_first_structured_output_call, order=HookOrder.SDK_FIRST)
        registry.add_callback(AfterToolCallEvent, self.mark_structured_output_complete)
        registry.add_callback(AfterToolsEvent, self.end_after_structured_output)

    def keep_first_structured_output_call(self, event: BeforeToolsEvent) -> None:
        content = event.message.get("content", [])
        if not isinstance(content, list):
            return

        if not any(
            isinstance(block, dict)
            and isinstance(block.get("toolUse"), dict)
            and block["toolUse"].get("name") == STRUCTURED_OUTPUT_TOOL_NAME
            for block in content
        ):
            return

        kept_content = []
        saw_structured_output = False
        dropped_tool_names = []

        for block in content:
            tool_use = block.get("toolUse") if isinstance(block, dict) else None
            if not isinstance(tool_use, dict):
                kept_content.append(block)
                continue

            tool_name = tool_use.get("name")
            if tool_name == STRUCTURED_OUTPUT_TOOL_NAME:
                if not saw_structured_output:
                    kept_content.append(block)
                    saw_structured_output = True
                else:
                    dropped_tool_names.append(tool_name)
                continue

            dropped_tool_names.append(tool_name)

        if saw_structured_output and len(kept_content) != len(content):
            event.message["content"] = kept_content
            log.warning(
                "ChatOutput requested; dropped other tool calls before terminating: %s",
                dropped_tool_names,
            )

    def mark_structured_output_complete(self, event: AfterToolCallEvent) -> None:
        if event.tool_use.get("name") != STRUCTURED_OUTPUT_TOOL_NAME:
            return
        event.invocation_state["chat_structured_output_complete"] = True
        log.info("ChatOutput returned status=%s; marking invocation complete", event.result.get("status"))

    def end_after_structured_output(self, event: AfterToolsEvent) -> None:
        if event.invocation_state.get("chat_structured_output_complete"):
            event.end_turn = "ChatOutput returned; ending turn."
            log.info("Ending ChatAgent turn immediately after ChatOutput")


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
        log.info("Creating ChatAgent for session_id=%s with %d static tools/providers", session_id, len(tools))
        cache[session_id] = Agent(
            model=load_model(),
            system_prompt=DEFAULT_SYSTEM_PROMPT,
            structured_output_model=ChatOutput,
            tools=tools,
            plugins=_make_plugins(),
            conversation_manager=_make_conversation_manager(),
            hooks=[
                RequiredToolAssertion(),
                StructuredOutputTerminator(),
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
