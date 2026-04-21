import { z } from 'zod';

const rawUsageEventsQuery = '{exporter="OTLP"}';

const lokiResponseSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    resultType: z.literal('streams'),
    result: z.array(
      z.object({
        stream: z.record(z.string(), z.string()),
        values: z.array(z.tuple([z.string(), z.string()]))
      })
    )
  })
});

function toNanoseconds(timestamp: Date): string {
  return `${BigInt(timestamp.getTime()) * 1000000n}`;
}

function parseJsonLine(line: string): unknown | null {
  const trimmedLine = line.trim();

  if (trimmedLine.startsWith('{') === false) {
    return null;
  }

  try {
    const parsedLine: unknown = JSON.parse(trimmedLine);
    return parsedLine;
  } catch (error: unknown) {
    const preview = trimmedLine.length > 120 ? `${trimmedLine.slice(0, 120)}…` : trimmedLine;
    console.warn(`Skipping malformed JSON line: ${preview}`, error);
    return null;
  }
}

const PAGE_LIMIT = 5000;

function findLatestNanosecondTimestamp(
  result: z.infer<typeof lokiResponseSchema>['data']['result']
): string | null {
  let latest: string | null = null;

  for (const streamResult of result) {
    for (const valuePair of streamResult.values) {
      const ns = valuePair[0];

      if (latest === null || BigInt(ns) > BigInt(latest)) {
        latest = ns;
      }
    }
  }

  return latest;
}

function countValues(
  result: z.infer<typeof lokiResponseSchema>['data']['result']
): number {
  let total = 0;

  for (const streamResult of result) {
    total += streamResult.values.length;
  }

  return total;
}

export async function fetchRawUsageEvents(input: {
  endAt: Date;
  lokiBaseUrl: string;
  startAt: Date;
}): Promise<unknown[]> {
  const parsedLines: unknown[] = [];
  let cursor = toNanoseconds(input.startAt);
  const endNs = toNanoseconds(input.endAt);

  for (;;) {
    const requestUrl = new URL('/loki/api/v1/query_range', input.lokiBaseUrl);
    requestUrl.searchParams.set('query', rawUsageEventsQuery);
    requestUrl.searchParams.set('direction', 'forward');
    requestUrl.searchParams.set('limit', String(PAGE_LIMIT));
    requestUrl.searchParams.set('start', cursor);
    requestUrl.searchParams.set('end', endNs);

    const response = await fetch(requestUrl);

    if (response.ok === false) {
      const responseText = await response.text();
      throw new Error(`Loki query failed with ${response.status}: ${responseText}`);
    }

    const responseBody = lokiResponseSchema.parse(await response.json());
    const pageSize = countValues(responseBody.data.result);

    for (const streamResult of responseBody.data.result) {
      for (const valuePair of streamResult.values) {
        const line = valuePair[1];
        const parsedLine = parseJsonLine(line);

        if (parsedLine !== null) {
          parsedLines.push(parsedLine);
        }
      }
    }

    if (pageSize < PAGE_LIMIT) {
      break;
    }

    const latestNs = findLatestNanosecondTimestamp(responseBody.data.result);

    if (latestNs === null) {
      break;
    }

    cursor = `${BigInt(latestNs) + 1n}`;
  }

  return parsedLines;
}
