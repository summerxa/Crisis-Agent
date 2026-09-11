"""Exercise Strands' actual filtering/provider cache with an in-memory MCP response."""
import asyncio
from concurrent.futures import Future
import importlib.util
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch, sentinel

from mcp.types import ListToolsResult, Tool


APP_PATH = Path(__file__).resolve().parents[1] / "app" / "TodoListAgent"
TOOL_NAME = "DisasterWebSearch___WebSearch"
URL_ENV = "AGENTCORE_GATEWAY_DISASTER_RESPONSE_SEARCH_URL"
AUTH_ENV = "AGENTCORE_GATEWAY_DISASTER_RESPONSE_SEARCH_AUTH_TYPE"
GATEWAY_URL = "https://example.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"


def import_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


client_module = import_file("todolist_client_under_test", APP_PATH / "mcp_client" / "client.py")
with patch.dict(os.environ, {URL_ENV: ""}), patch.object(sys, "path", [str(APP_PATH), *sys.path]):
    main_module = import_file("todolist_main_under_test", APP_PATH / "main.py")


def tool(name):
    return Tool(name=name, description="Test tool", inputSchema={"type": "object", "properties": {}})


class ToolRegistrationTests(unittest.TestCase):
    def make_client(self):
        with patch.dict(os.environ, {URL_ENV: GATEWAY_URL, AUTH_ENV: "NONE"}):
            return client_module.get_web_search_mcp_client()

    def load_provider_twice(self, client, responses):
        session = SimpleNamespace(list_tools=AsyncMock(side_effect=responses))

        def background(coroutine):
            # The production SDK schedules this on its MCP thread. Run it in a
            # separate thread here, keeping its actual list/filter logic intact.
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=1) as executor:
                value = executor.submit(asyncio.run, coroutine).result()
            future = Future()
            future.set_result(value)
            return future

        async def load():
            first = await client.load_tools()
            second = await client.load_tools()
            return first, second

        with patch.object(client, "start") as start, \
                patch.object(client, "_is_session_active", return_value=True), \
                patch.object(client, "_background_thread_session", session), \
                patch.object(client, "_invoke_on_background_thread", side_effect=background):
            first, second = asyncio.run(load())
            start.assert_called_once()
        return first, second, session

    def test_exact_name_filter_excludes_discovery_and_similarly_named_tools(self):
        client = self.make_client()
        first, second, session = self.load_provider_twice(client, [ListToolsResult(tools=[
            tool("x_amz_bedrock_agentcore_search"), tool(TOOL_NAME + "Extra"),
            tool("Other___WebSearch"), tool(TOOL_NAME),
        ])])
        self.assertEqual([item.tool_name for item in first], [TOOL_NAME])
        self.assertIs(first, second)
        session.list_tools.assert_awaited_once()
        self.assertEqual(first[0].tool_spec["name"], TOOL_NAME)

    def test_pagination_finds_named_tool_after_an_empty_filtered_page(self):
        first, second, session = self.load_provider_twice(self.make_client(), [
            ListToolsResult(tools=[tool("Other")], nextCursor="page-two"),
            ListToolsResult(tools=[tool(TOOL_NAME)]),
        ])
        self.assertEqual([item.tool_name for item in first], [TOOL_NAME])
        self.assertIs(first, second)
        self.assertEqual(session.list_tools.await_count, 2)
        session.list_tools.assert_any_await(cursor="page-two")

    def test_missing_tool_still_fails_required_tool_check(self):
        selected, _, _ = self.load_provider_twice(self.make_client(), [ListToolsResult(tools=[tool("Other")])])
        self.assertEqual(selected, [])
        event = SimpleNamespace(
            agent=SimpleNamespace(tool_registry=SimpleNamespace(registry={}, dynamic_tools={})),
            invocation_state={}, projected_input_tokens=0,
        )
        with self.assertRaisesRegex(RuntimeError, "Required tool"):
            main_module.RequiredToolAssertion().assert_required_tools(event)
        event.agent.tool_registry.registry = {TOOL_NAME: Mock()}
        main_module.RequiredToolAssertion().assert_required_tools(event)
        # Preserve the existing exception for the final structured-output pass.
        event.agent.tool_registry.registry = {"TodoListOutput": Mock()}
        main_module.RequiredToolAssertion().assert_required_tools(event)

    def test_factory_retains_iam_transport_and_automatic_lifecycle(self):
        with patch.dict(os.environ, {URL_ENV: GATEWAY_URL, AUTH_ENV: "AWS_IAM", "AWS_REGION": "us-east-1"}), \
                patch.object(client_module, "SigV4Auth", return_value=sentinel.auth) as auth, \
                patch.object(client_module, "MCPClient") as managed_client, \
                patch.object(client_module, "streamablehttp_client", return_value=sentinel.transport) as transport:
            result = client_module.get_web_search_mcp_client()
            auth.assert_called_once_with("bedrock-agentcore", "us-east-1")
            self.assertIs(result, managed_client.return_value)
            self.assertEqual(managed_client.call_args.kwargs, {"tool_filters": {"allowed": [TOOL_NAME]}})
            self.assertIs(managed_client.call_args.args[0](), sentinel.transport)
            transport.assert_called_once_with(GATEWAY_URL, auth=sentinel.auth)

    def test_agent_factory_reuses_agent_without_discovery_plugin(self):
        with patch.object(main_module, "Agent") as agent, \
                patch.object(main_module, "load_model", return_value=sentinel.model), \
                patch.object(main_module, "tools", [sentinel.provider]):
            factory = main_module.agent_factory()
            first = factory("session-one")
            self.assertIs(factory("session-one"), first)
            agent.assert_called_once()
            kwargs = agent.call_args.kwargs
            self.assertEqual(kwargs["tools"], [sentinel.provider])
            self.assertNotIn("plugins", kwargs)
            self.assertEqual([type(hook).__name__ for hook in kwargs["hooks"]], [
                "RequiredToolAssertion", "WebSearchUsageLimiter", "StructuredOutputTerminator",
            ])
            self.assertEqual(main_module.MAX_WEB_SEARCH_TOOL_USES, 1)


if __name__ == "__main__":
    unittest.main()
