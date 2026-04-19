import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getDrizzleMigrationFolder } from './runtime.js';

const migrationJournalSchema = z.object({
  entries: z.array(
    z.object({
      tag: z.string().min(1)
    })
  )
});

describe('getDrizzleMigrationFolder', () => {
  it('points at a drizzle migration folder with a journal and SQL files', () => {
    const migrationFolder = getDrizzleMigrationFolder();
    const journalPath = path.join(migrationFolder, 'meta', '_journal.json');

    expect(existsSync(journalPath)).toBe(true);

    const journal = migrationJournalSchema.parse(JSON.parse(readFileSync(journalPath, 'utf8')));

    expect(Array.isArray(journal.entries)).toBe(true);
    expect(journal.entries.length).toBeGreaterThan(0);

    for (const journalEntry of journal.entries) {
      const migrationPath = path.join(migrationFolder, `${journalEntry.tag}.sql`);
      expect(existsSync(migrationPath)).toBe(true);
    }
  });
});
