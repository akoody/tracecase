import { parseArgs } from 'node:util';
import { evaluationModeSchema } from './run-store.js';
import { prepareRun } from './prepare.js';
import { scoreRun } from './score.js';

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`--${name} is required`);
  return value;
}
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'prepare': {
      const { values } = parseArgs({
        args,
        strict: true,
        options: {
          case: { type: 'string' },
          mode: { type: 'string' },
          out: { type: 'string' },
        },
      });
      return console.log(
        JSON.stringify(
          await prepareRun({
            caseId: required(values.case, 'case'),
            mode: evaluationModeSchema.parse(values.mode),
            output: required(values.out, 'out'),
          }),
          null,
          2,
        ),
      );
    }
    case 'score': {
      const { values } = parseArgs({
        args,
        strict: true,
        options: {
          run: { type: 'string' },
          report: { type: 'string' },
          review: { type: 'string' },
          metadata: { type: 'string' },
        },
      });
      return console.log(
        JSON.stringify(
          await scoreRun({
            runDirectory: required(values.run, 'run'),
            report: required(values.report, 'report'),
            ...(values.review !== undefined ? { review: values.review } : {}),
            ...(values.metadata !== undefined ? { metadata: values.metadata } : {}),
          }),
          null,
          2,
        ),
      );
    }
    default:
      throw new Error('Use prepare or score; see docs/evaluation.md');
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
