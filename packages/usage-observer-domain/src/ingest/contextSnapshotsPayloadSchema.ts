import { z } from 'zod';

const metadataJsonSchema = z.record(z.string(), z.unknown());

const contributorSnapshotSchema = z
  .object({
    contributor_type: z.string().min(1),
    contributor_name: z.string().min(1),
    contributor_scope: z.string().min(1),
    contributor_hash: z.string().min(1),
    file_path: z.string().min(1).nullable().optional(),
    file_size_bytes: z.number().int().nonnegative().nullable().optional(),
    line_count: z.number().int().nonnegative().nullable().optional(),
    enabled: z.boolean(),
    metadata_json: metadataJsonSchema
  })
  .strict();

export const contextSnapshotsPayloadSchema = z
  .object({
    session_id: z.string().min(1),
    captured_at: z.string().datetime({
      offset: true
    }),
    project_root: z.string().min(1).nullable().optional(),
    git_branch: z.string().min(1).nullable().optional(),
    transcript_path: z.string().min(1).nullable().optional(),
    model_name: z.string().min(1).nullable().optional(),
    source: z.string().min(1).default('context-snapshot'),
    contributors: z.array(contributorSnapshotSchema).min(1)
  })
  .strict();

export type ContextSnapshotsPayload = z.infer<typeof contextSnapshotsPayloadSchema>;
