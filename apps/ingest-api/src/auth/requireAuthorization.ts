import type { FastifyReply, FastifyRequest } from 'fastify';

export function createRequireAuthorization(authToken: string | null) {
  return async function requireAuthorization(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (typeof authToken !== 'string') {
      return;
    }

    const authorizationHeader = request.headers.authorization;

    if (typeof authorizationHeader !== 'string') {
      reply.code(401).send({
        message: 'Missing Authorization header'
      });
      return;
    }

    const expectedHeaderValue = `Bearer ${authToken}`;

    if (authorizationHeader !== expectedHeaderValue) {
      reply.code(401).send({
        message: 'Invalid Authorization header'
      });
      return;
    }
  };
}
