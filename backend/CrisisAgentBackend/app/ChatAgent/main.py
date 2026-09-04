from typing import Any
from collections import OrderedDict
from strands import Agent
from pydantic import BaseModel, Field
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
