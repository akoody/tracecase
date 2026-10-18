import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseCommand } from './arguments.js';
import { bundleSchema, collect, limits, renderReport, verifyBundle } from '@tracecase/core';

export const help = `Tracecase — evidence collection for incident investigations

collect --root DIR --log FILE [--log FILE] --order ID|--trace ID|--request ID
        [--code FILE:START:END] [--max-events N] [--max-output N]
        [--max-bytes N] [--max-line-bytes N] --out FILE
verify  --root DIR --bundle FILE
report  --bundle FILE --input REPORT.json --out FILE.md

Sources must resolve inside --root. File paths are relative to that root.
collect and report refuse to overwrite existing output files.
verify exits 1 if any cited source has changed. No command diagnoses the cause.
`;

export async function readJson(file: string): Promise<unknown> {
  if ((await stat(file)).size > limits.jsonFileBytes) throw new Error('JSON input exceeds 32 MiB');
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}
export async function writeNew(file: string, content: string): Promise<void> {
  await mkdir(dirname(resolve(file)), { recursive: true });
  await writeFile(file, content, { flag: 'wx', mode: 0o600 });
}
export async function run(
  args: string[],
  output: (text: string) => void = console.log,
): Promise<number> {
  const command = parseCommand(args);
  switch (command.name) {
    case 'help':
      output(help);
      return 0;
    case 'collect': {
      const bundle = await collect(command.options);
      await writeNew(command.output, `${JSON.stringify(bundle, null, 2)}\n`);
      output(
        JSON.stringify({
          output: resolve(command.output),
          evidence: bundle.evidence.length,
          complete: bundle.collection.complete,
          matched: bundle.collection.matchedEvents,
          omitted: bundle.collection.omittedEvents,
          diagnostics: bundle.collection.diagnosticCount,
        }),
      );
      return 0;
    }
    case 'verify': {
      const bundle = bundleSchema.parse(await readJson(command.bundle));
      const results = await verifyBundle(bundle, command.root);
      const valid = results.every((item) => item.valid);
      output(JSON.stringify({ valid, results }, null, 2));
      return valid ? 0 : 1;
    }
    case 'report': {
      const bundle = bundleSchema.parse(await readJson(command.bundle));
      const report = await readJson(command.input);
      await writeNew(command.output, renderReport(report, bundle));
      output(
        JSON.stringify({
          output: resolve(command.output),
          validated: 'structure-and-evidence-references-only',
        }),
      );
      return 0;
    }
  }
}
