from typing import Any, Literal
from collections import OrderedDict
from strands import Agent
import re
from pydantic import BaseModel, Field
from strands.agent.conversation_manager.null_conversation_manager import NullConversationManager
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
You are a disaster response planning agent invoked when the user refreshes their status.
Analyze disaster_weather_data: use snapshot as the current local hazard context and previous_snapshot (if available) to identify changes since the last refresh.

Verify factual guidance with consulted web sources. Use web search for current response guidance, official status, evacuation language, shelter/supply guidance, or recovery steps.
Prefer FEMA, Ready.gov, NOAA/NWS, CDC, local emergency management, and state/county emergency pages. Do not treat missing or stale source data as all-clear.

Classify state as exactly one of CLEAR, AWARE, PREPARE, ACT, RECOVER:
- CLEAR: no nearby disasters; no preparation needed.
- AWARE: nearby disaster; monitor, no immediate action.
- PREPARE: nearby disaster; prepare for evacuation/emergency response.
- ACT: immediate emergency, evacuation order, or danger very close.
- RECOVER: disaster passed; monitor updates, no immediate emergency.

Output:
- state: the classification.
- subtitle: a short official-status-based subtitle; if no official status exists, say so.
- description: 1-2 sentences describing the user's current state.
- change_items: disaster information that changed since previous_snapshot; if nothing changed, say so in one list item.
- action_items: practical actions, each with one relevant emoji, a short initial-view description, a longer detailed description, and the names of the source(s) that you consulted for this action item.
- disaster_state_writeup: concise context for other agents summarizing the disaster state.
- disaster_response_writeup: concise context for other agents explaining how the user should prepare or respond.

"""


EMOJI_PATTERN = re.compile(
    "["
    "\U0001F1E6-\U0001F1FF"
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "]"
)


class ActionItem(BaseModel):
    emoji: str = Field(description="A single emoji related to the action item.")
    short_description: str = Field(description="Short text for the initial action item view.")
    long_description: str = Field(description="Detailed instructions for the action item.")
    citation: list[str] = Field(description="Names of the web source(s) cited for the action item.", min_length=1)


class TodoListOutput(BaseModel):
    state: Literal["CLEAR", "AWARE", "PREPARE", "ACT", "RECOVER"]
    subtitle: str
    description: str
    change_items: list[str] = Field(min_length=1, max_length=5)
    action_items: list[ActionItem] = Field(max_length=5)
    disaster_state_writeup: str
    disaster_response_writeup: str


# Define a collection of tools used by the model
tools = []

# Add MCP client to tools if available
for mcp_client in mcp_clients:
    if mcp_client:
        tools.append(mcp_client)
log.info("Configured static tools/providers: %d", len(tools))

_INLINE_FUNCTION_NAMES = set()
REQUIRED_TOOL_NAMES = {"DisasterWebSearch___WebSearch"}
STRUCTURED_OUTPUT_TOOL_NAME = TodoListOutput.__name__


def _make_conversation_manager():
    return NullConversationManager()


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
        observed_required_tools = invocation_state.get("todo_required_tools_observed", False)
        structured_output_only = registered_tool_names == {TodoListOutput.__name__}

        log.info(
            "Required tool assertion: required=%s available=%s observed=%s structured_output_only=%s projected_input_tokens=%s",
            sorted(REQUIRED_TOOL_NAMES),
            sorted(registered_tool_names),
            observed_required_tools,
            structured_output_only,
            event.projected_input_tokens,
        )

        if not missing_tool_names:
            invocation_state["todo_required_tools_observed"] = True
            return

        if observed_required_tools and structured_output_only:
            log.info("Skipping required tool assertion during structured-output-only model pass")
            return

        if missing_tool_names:
            raise RuntimeError(
                "Required tool(s) are not registered: "
                f"{sorted(missing_tool_names)}. Available tools: {sorted(registered_tool_names)}"
            )


class StructuredOutputTerminator:
    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolsEvent, self.keep_first_structured_output_call, order=HookOrder.SDK_FIRST)
        registry.add_callback(AfterToolCallEvent, self.mark_structured_output_success)
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
                "TodoListOutput requested; dropped other tool calls before terminating: %s",
                dropped_tool_names,
            )

    def mark_structured_output_success(self, event: AfterToolCallEvent) -> None:
        if event.tool_use.get("name") != STRUCTURED_OUTPUT_TOOL_NAME:
            return
        event.invocation_state["todo_structured_output_complete"] = True
        log.info("TodoListOutput returned status=%s; marking invocation complete", event.result.get("status"))

    def end_after_structured_output(self, event: AfterToolsEvent) -> None:
        if event.invocation_state.get("todo_structured_output_complete"):
            event.end_turn = "TodoListOutput returned; ending turn."
            log.info("Ending TodoListAgent turn immediately after TodoListOutput")


# Reuses one Agent per session_id so MCP tools are loaded once per warm process.
# Message history is cleared at the start of each top-level invocation; the
# current request can still keep tool-use/tool-result continuity while it runs.
# The cache is bounded to 128 sessions with LRU eviction.
def agent_factory():
    cache = OrderedDict()
    def get_or_create_agent(session_id):
        if session_id in cache:
            cache.move_to_end(session_id)
            return cache[session_id]
        if len(cache) >= 128:
            cache.popitem(last=False)
        log.info("Creating TodoListAgent for session_id=%s with %d static tools/providers", session_id, len(tools))
        cache[session_id] = Agent(
            model=load_model(),
            system_prompt=DEFAULT_SYSTEM_PROMPT,
            structured_output_model=TodoListOutput,
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


def _extract_prompt(payload: dict):
    """Accept only a caller-provided prompt string."""
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")
    prompt = payload.get("prompt", "")
    if not isinstance(prompt, str):
        raise ValueError("prompt must be a string")
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
    agent.messages.clear() # This agent doesn't use conversation history

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
