import { deriveToolImpactRollups } from '@usage-observer/domain';

import { createRollupStore } from '../rollup-store/index.js';

import type { RollupPipeline } from './rollupPipelineTypes.js';

export const toolImpactPipeline: RollupPipeline = async (input) => {
  const toolImpactRows = deriveToolImpactRollups(input.promptFacts, input.rawEvents);
  const rollupStore = createRollupStore(input.database);

  await rollupStore.replaceToolImpact(toolImpactRows, input.affectedDateBuckets);

  return { pipelineName: 'tool-impact', rowCount: toolImpactRows.length };
};
