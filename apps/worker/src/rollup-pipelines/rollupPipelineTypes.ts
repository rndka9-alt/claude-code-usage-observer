import type { RawUsageEvent, UsageDatabase } from '@usage-observer/domain';
import type { InferInsertModel } from 'drizzle-orm';
import type { derivedPromptFacts } from '@usage-observer/domain';

export type RollupPipelineInput = {
  rawEvents: RawUsageEvent[];
  promptFacts: InferInsertModel<typeof derivedPromptFacts>[];
  affectedDateBuckets: string[];
  rangeBounds: { startAt: Date; endAt: Date };
  database: UsageDatabase;
};

export type RollupPipelineResult = {
  pipelineName: string;
  rowCount: number;
};

export type RollupPipeline = (input: RollupPipelineInput) => Promise<RollupPipelineResult>;
