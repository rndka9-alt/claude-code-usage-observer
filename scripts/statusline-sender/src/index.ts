#!/usr/bin/env node
import { readContextCommandInput, runContextCommand } from './context/index.js';
import { postJson } from './http/index.js';

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === 'context') {
    const contextCommandInput = readContextCommandInput(process.argv.slice(3), process.env);
    const contextPayload = await runContextCommand(contextCommandInput);
    await postJson(contextCommandInput.apiUrl, '/v1/context-snapshots', contextPayload, contextCommandInput.authToken);
    process.stdout.write(`${JSON.stringify({ accepted: true, contributor_count: contextPayload.contributors.length })}\n`);
    return;
  }

  throw new Error(`Unknown command: ${command ?? '(none)'}`);
}

async function readAllStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }

    chunks.push(Buffer.from(chunk));
  }

  const output = Buffer.concat(chunks).toString('utf8').trim();

  if (output.length === 0) {
    throw new Error('Expected JSON on stdin');
  }

  return output;
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error('Unknown statusline sender error');
    console.error(error);
  }

  process.exitCode = 1;
});
