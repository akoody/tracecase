import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { limits } from '@tracecase/core';

export const evaluationModeSchema = z.enum(['baseline', 'skill', 'tools']);
export type EvaluationMode = z.infer<typeof evaluationModeSchema>;
export const evaluationRunSchema = z
  .object({
    caseId: z.string().min(1),
    mode: evaluationModeSchema,
    split: z.enum(['development', 'holdout']),
    workspace: z.string().refine(isAbsolute, 'Workspace must be an absolute path'),
    snapshot: z.record(z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict();
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;

export async function readJson(file: string): Promise<unknown> {
  if ((await stat(file)).size > limits.jsonFileBytes) throw new Error('JSON input exceeds 32 MiB');
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}
