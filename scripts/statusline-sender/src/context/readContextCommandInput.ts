import { z } from 'zod';

type ParsedArgumentMap = Map<string, string[]>;

const environmentSchema = z.object({
  USAGE_OBSERVER_API_URL: z.string().url().optional(),
  USAGE_OBSERVER_AUTH_TOKEN: z.string().min(1).optional()
});

function parseArguments(argumentsList: string[]): ParsedArgumentMap {
  const parsedArguments = new Map<string, string[]>();

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (typeof argument !== 'string' || argument.startsWith('--') === false) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const value = argumentsList[index + 1];

    if (typeof value !== 'string' || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }

    const existingValues = parsedArguments.get(argument);

    if (existingValues instanceof Array) {
      existingValues.push(value);
    } else {
      parsedArguments.set(argument, [value]);
    }

    index += 1;
  }

  return parsedArguments;
}

function readRequiredValue(parsedArguments: ParsedArgumentMap, key: string): string {
  const values = parsedArguments.get(key);
  const value = values?.[0];

  if (typeof value !== 'string') {
    throw new Error(`Missing required argument ${key}`);
  }

  return value;
}

function readOptionalValue(parsedArguments: ParsedArgumentMap, key: string): string | null {
  const values = parsedArguments.get(key);
  const value = values?.[0];

  if (typeof value !== 'string') {
    return null;
  }

  return value;
}

function readRepeatedValues(parsedArguments: ParsedArgumentMap, key: string): string[] {
  const values = parsedArguments.get(key);

  if (values instanceof Array) {
    return values;
  }

  return [];
}

export function readContextCommandInput(
  argumentsList: string[],
  environment: NodeJS.ProcessEnv
): {
  apiUrl: string;
  authToken: string | null;
  autoMemoryEnabled: boolean;
  autoMemoryPath: string | null;
  capturedAt: Date;
  claudeMdPaths: string[];
  gitBranch: string | null;
  mcpServers: string[];
  modelName: string | null;
  observedMcpServers: string[];
  outputStyle: string | null;
  projectRoot: string | null;
  rulePaths: string[];
  sessionId: string;
  skillNames: string[];
  transcriptPath: string | null;
} {
  const parsedArguments = parseArguments(argumentsList);
  const parsedEnvironment = environmentSchema.parse(environment);
  const capturedAtValue = readOptionalValue(parsedArguments, '--captured-at');
  const autoMemoryEnabledValue = readOptionalValue(parsedArguments, '--auto-memory-enabled');

  if (
    autoMemoryEnabledValue !== null &&
    autoMemoryEnabledValue !== 'true' &&
    autoMemoryEnabledValue !== 'false'
  ) {
    throw new Error('--auto-memory-enabled must be true or false');
  }

  return {
    apiUrl:
      typeof parsedEnvironment.USAGE_OBSERVER_API_URL === 'string'
        ? parsedEnvironment.USAGE_OBSERVER_API_URL
        : 'http://127.0.0.1:8080',
    authToken:
      typeof parsedEnvironment.USAGE_OBSERVER_AUTH_TOKEN === 'string'
        ? parsedEnvironment.USAGE_OBSERVER_AUTH_TOKEN
        : null,
    autoMemoryEnabled: autoMemoryEnabledValue === 'true',
    autoMemoryPath: readOptionalValue(parsedArguments, '--auto-memory-path'),
    capturedAt:
      typeof capturedAtValue === 'string'
        ? new Date(
            z
              .string()
              .datetime({
                offset: true
              })
              .parse(capturedAtValue)
          )
        : new Date(),
    claudeMdPaths: readRepeatedValues(parsedArguments, '--claude-md-path'),
    gitBranch: readOptionalValue(parsedArguments, '--git-branch'),
    mcpServers: readRepeatedValues(parsedArguments, '--mcp-server'),
    modelName: readOptionalValue(parsedArguments, '--model-name'),
    observedMcpServers: readRepeatedValues(parsedArguments, '--observed-mcp-server'),
    outputStyle: readOptionalValue(parsedArguments, '--output-style'),
    projectRoot: readOptionalValue(parsedArguments, '--project-root'),
    rulePaths: readRepeatedValues(parsedArguments, '--rule-path'),
    sessionId: readRequiredValue(parsedArguments, '--session-id'),
    skillNames: readRepeatedValues(parsedArguments, '--skill-name'),
    transcriptPath: readOptionalValue(parsedArguments, '--transcript-path')
  };
}
