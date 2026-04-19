import { z } from 'zod';

const environmentSchema = z.object({
  USAGE_OBSERVER_API_URL: z.string().url().optional(),
  USAGE_OBSERVER_AUTH_TOKEN: z.string().min(1).optional()
});

export function readStatuslineCommandInput(
  argumentsList: string[],
  environment: NodeJS.ProcessEnv
): {
  apiUrl: string;
  authToken: string | null;
  now: Date;
} {
  if (argumentsList.length > 0) {
    throw new Error('statusline command does not accept positional arguments');
  }

  const parsedEnvironment = environmentSchema.parse(environment);

  return {
    apiUrl:
      typeof parsedEnvironment.USAGE_OBSERVER_API_URL === 'string'
        ? parsedEnvironment.USAGE_OBSERVER_API_URL
        : 'http://127.0.0.1:8080',
    authToken:
      typeof parsedEnvironment.USAGE_OBSERVER_AUTH_TOKEN === 'string'
        ? parsedEnvironment.USAGE_OBSERVER_AUTH_TOKEN
        : null,
    now: new Date()
  };
}
