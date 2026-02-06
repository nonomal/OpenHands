"""Utilities for loading hooks for V1 conversations.

This module provides functions to load hooks from the agent-server,
which centralizes all hook loading logic. The app-server acts as a
thin proxy that calls the agent-server's /api/hooks endpoint.

All hook loading is handled by the agent-server.
"""

import logging

import httpx

from openhands.sdk.hooks import HookConfig

_logger = logging.getLogger(__name__)


async def load_hooks_from_agent_server(
    agent_server_url: str,
    session_api_key: str | None,
    project_dir: str,
) -> HookConfig | None:
    """Load hooks from the agent-server.

    This function makes a single API call to the agent-server's /api/hooks
    endpoint to load hooks from the workspace's .openhands/hooks.json file.

    Args:
        agent_server_url: URL of the agent server (e.g., 'http://localhost:8000')
        session_api_key: Session API key for authentication (optional)
        project_dir: Workspace directory path for project hooks

    Returns:
        HookConfig if hooks.json exists and is valid, None otherwise.
    """
    try:
        # Build request payload
        payload = {
            'project_dir': project_dir,
        }

        # Build headers
        headers = {'Content-Type': 'application/json'}
        if session_api_key:
            headers['X-Session-API-Key'] = session_api_key

        # Make API request
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f'{agent_server_url}/api/hooks',
                json=payload,
                headers=headers,
                timeout=30.0,
            )
            response.raise_for_status()

            data = response.json()

        # Extract hook_config from response
        hook_config_data = data.get('hook_config')
        if hook_config_data is None:
            _logger.debug('No hooks found in workspace')
            return None

        # Convert response to HookConfig
        hook_config = HookConfig.from_dict(hook_config_data)

        if hook_config.is_empty():
            _logger.debug('Hooks config is empty')
            return None

        _logger.info(f'Loaded hooks from agent-server for {project_dir}')
        return hook_config

    except httpx.HTTPStatusError as e:
        _logger.warning(
            f'Agent-server returned error status {e.response.status_code}: '
            f'{e.response.text}'
        )
        return None
    except httpx.RequestError as e:
        _logger.warning(f'Failed to connect to agent-server: {e}')
        return None
    except Exception as e:
        _logger.warning(f'Failed to load hooks from agent-server: {e}')
        return None
