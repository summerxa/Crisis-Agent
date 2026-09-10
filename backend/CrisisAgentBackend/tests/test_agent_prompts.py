"""Offline checks of the production prompt and output models, without starting AWS clients."""
import ast
from pathlib import Path
from typing import Literal
import unittest

from pydantic import BaseModel, Field


APP_ROOT = Path(__file__).resolve().parents[1] / "app"


def load_output_definitions(agent_name):
    source = APP_ROOT / agent_name / "main.py"
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    selected = [node for node in tree.body if (
        isinstance(node, ast.ClassDef) and node.name in {"ActionItem", "TodoListOutput", "ChatOutput"}
    ) or (
        isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "DEFAULT_SYSTEM_PROMPT"
            for target in node.targets
        )
    )]
    namespace = {"BaseModel": BaseModel, "Field": Field, "Literal": Literal}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(source), "exec"), namespace)
    return namespace


class AgentPromptTests(unittest.TestCase):
    def test_both_agents_explain_compact_comparison_and_unknown_spatial_context(self):
        for agent in ("TodoListAgent", "ChatAgent"):
            with self.subTest(agent=agent):
                prompt = load_output_definitions(agent)["DEFAULT_SYSTEM_PROMPT"]
                for term in ("comparison", "baseline=none", "uncomparable", "previousSpatial", "unknown", "geometryChanged"):
                    self.assertIn(term, prompt)

    def test_length_guidance_does_not_constrain_valid_output(self):
        definitions = load_output_definitions("TodoListAgent")
        prompt = definitions["DEFAULT_SYSTEM_PROMPT"]
        for target in ("12 words", "50 words", "20 words", "60 words", "80 words"):
            self.assertIn(target, prompt)
        long_text = "Important detail. " * 1000
        payload = {
            "state": "AWARE", "subtitle": long_text, "description": long_text,
            "change_items": [long_text],
            "action_items": [{"emoji": "⚠️", "short_description": long_text,
                              "long_description": long_text, "citation": ["NWS"]}],
            "disaster_state_writeup": long_text, "disaster_response_writeup": long_text,
        }
        result = definitions["TodoListOutput"](**payload)
        self.assertEqual(result.model_dump(), payload)


if __name__ == "__main__":
    unittest.main()
