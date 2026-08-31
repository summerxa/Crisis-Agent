import logging
import os
from urllib.parse import urlparse

import botocore.auth
import botocore.awsrequest
import botocore.session
import httpx
from mcp.client.streamable_http import streamablehttp_client
from strands.tools.mcp.mcp_client import MCPClient

logger = logging.getLogger(__name__)

GATEWAY_ENV_PREFIX = "AGENTCORE_GATEWAY_DISASTER_RESPONSE_SEARCH"
GATEWAY_URL_ENV = f"{GATEWAY_ENV_PREFIX}_URL"
GATEWAY_AUTH_TYPE_ENV = f"{GATEWAY_ENV_PREFIX}_AUTH_TYPE"
AGENTCORE_SERVICE = "bedrock-agentcore"


class SigV4Auth(httpx.Auth):
    requires_request_body = True

    def __init__(self, service: str, region: str):
        self.service = service
        self.region = region
        self.session = botocore.session.get_session()

    def auth_flow(self, request: httpx.Request):
        credentials = self.session.get_credentials()
        if credentials is None:
            raise RuntimeError("AWS credentials are required for AgentCore Gateway authentication")

        aws_request = botocore.awsrequest.AWSRequest(
            method=request.method,
            url=str(request.url),
            data=request.content,
            headers=dict(request.headers),
        )
        botocore.auth.SigV4Auth(
            credentials.get_frozen_credentials(),
            self.service,
            self.region,
        ).add_auth(aws_request)

        request.headers.update(dict(aws_request.headers.items()))
        yield request


def _region_from_url(url: str) -> str | None:
    host = urlparse(url).hostname or ""
    parts = host.split(".")
    for index, part in enumerate(parts):
        if part == AGENTCORE_SERVICE and index + 1 < len(parts):
            return parts[index + 1]
    return None


def _aws_region(gateway_url: str) -> str:
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or _region_from_url(gateway_url)
    if not region:
        raise RuntimeError("AWS region is required for AgentCore Gateway authentication")
    return region


def get_web_search_mcp_client() -> MCPClient | None:
    """Return the deployed AgentCore web-search gateway as a Strands MCP client."""
    gateway_url = os.environ.get(GATEWAY_URL_ENV)
    if not gateway_url:
        logger.info("%s is not set; web search MCP client is disabled", GATEWAY_URL_ENV)
        return None

    auth_type = os.environ.get(GATEWAY_AUTH_TYPE_ENV, "AWS_IAM").upper()
    auth = None
    if auth_type == "AWS_IAM":
        auth = SigV4Auth(AGENTCORE_SERVICE, _aws_region(gateway_url))
    elif auth_type not in {"NONE", ""}:
        raise RuntimeError(f"Unsupported AgentCore Gateway auth type: {auth_type}")

    return MCPClient(lambda: streamablehttp_client(gateway_url, auth=auth))
