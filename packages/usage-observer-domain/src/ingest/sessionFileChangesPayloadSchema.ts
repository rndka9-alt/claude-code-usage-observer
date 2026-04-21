import { z } from 'zod';

const fileChangeSchema = z.object({
  file_path: z.string().min(1),
  file_name: z.string().min(1),
  version: z.number().int().positive(),
  backup_time: z.string().datetime({ offset: true })
});

export const sessionFileChangesPayloadSchema = z.object({
  session_id: z.string().min(1),
  files: z.array(fileChangeSchema).min(1)
});

export type SessionFileChangesPayload = z.infer<typeof sessionFileChangesPayloadSchema>;
