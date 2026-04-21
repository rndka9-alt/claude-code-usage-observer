export const EVENT_TYPES = {
  PROMPT_STARTED: 'prompt.started',
  PROMPT_FINISHED: 'prompt.finished',
  API_REQUEST: 'api.request',
  TOOL_EXECUTED: 'tool.executed',
  SKILL_ACTIVATED: 'skill.activated',
  MCP_SERVER_CONNECTION: 'mcp.server_connection'
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
