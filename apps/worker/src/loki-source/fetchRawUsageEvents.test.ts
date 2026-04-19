import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchRawUsageEvents } from './fetchRawUsageEvents.js';

function createSuccessResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('fetchRawUsageEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('queries Loki with a non-empty selector and parses JSON log lines only', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const requestUrl =
        input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);

      expect(requestUrl.searchParams.get('query')).toBe('{service_name=~".+"} |= "\\"event_type\\""');

      return createSuccessResponse({
        status: 'success',
        data: {
          resultType: 'streams',
          result: [
            {
              stream: {
                service_name: 'claude-code'
              },
              values: [
                [
                  '1776556800000000000',
                  '{"timestamp":"2026-04-19T00:00:00.000Z","event_type":"prompt.started","session_id":"session-alpha","prompt_id":"prompt-1"}'
                ],
                ['1776556801000000000', 'not json']
              ]
            }
          ]
        }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const rawEvents = await fetchRawUsageEvents({
      lokiBaseUrl: 'http://loki:3100',
      startAt: new Date('2026-04-19T00:00:00.000Z'),
      endAt: new Date('2026-04-19T00:01:00.000Z')
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(rawEvents).toEqual([
      {
        timestamp: '2026-04-19T00:00:00.000Z',
        event_type: 'prompt.started',
        session_id: 'session-alpha',
        prompt_id: 'prompt-1'
      }
    ]);
  });
});
