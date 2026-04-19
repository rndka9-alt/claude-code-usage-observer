import { z } from 'zod';

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
  } catch {
    return null;
  }
}

export async function fetchRawUsageEvents(input: {
  endAt: Date;
  lokiBaseUrl: string;
  startAt: Date;
}): Promise<unknown[]> {
  const requestUrl = new URL('/loki/api/v1/query_range', input.lokiBaseUrl);
  requestUrl.searchParams.set('query', '{}');
  requestUrl.searchParams.set('direction', 'forward');
  requestUrl.searchParams.set('limit', '5000');
  requestUrl.searchParams.set('start', toNanoseconds(input.startAt));
  requestUrl.searchParams.set('end', toNanoseconds(input.endAt));

  const response = await fetch(requestUrl);

  if (response.ok === false) {
    const responseText = await response.text();
    throw new Error(`Loki query failed with ${response.status}: ${responseText}`);
  }

  const responseBody = lokiResponseSchema.parse(await response.json());
  const parsedLines: unknown[] = [];

  for (const streamResult of responseBody.data.result) {
    for (const valuePair of streamResult.values) {
      const line = valuePair[1];
      const parsedLine = parseJsonLine(line);

      if (parsedLine !== null) {
        parsedLines.push(parsedLine);
      }
    }
  }

  return parsedLines;
}
