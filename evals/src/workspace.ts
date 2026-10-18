import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { digest } from '@tracecase/core';

export async function snapshot(workspace: string): Promise<Record<string, string>> {
  const paths = [
    'incident.json',
    'logs/events.jsonl',
    ...(await readdir(resolve(workspace, 'src'))).map((name) => `src/${name}`),
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [path, digest(await readFile(resolve(workspace, path)))]),
    ),
  );
}
export async function checkSnapshot(
  workspace: string,
  expected: Record<string, string>,
): Promise<void> {
  const actual = await snapshot(workspace);
  if (
    JSON.stringify(Object.entries(actual).sort()) !==
    JSON.stringify(Object.entries(expected).sort())
  )
    throw new Error('Evaluation inputs changed after preparation; discard this run');
}

/** Remove the runtime only in the instruction-only ablation; full installs include it. */
export async function installSkill(
  workspace: string,
  withTools: boolean,
  source: string,
): Promise<void> {
  await mkdir(resolve(workspace, '.agents/skills'), { recursive: true });
  await cp(source, resolve(workspace, '.agents/skills/tracecase'), {
    recursive: true,
    filter: (path) => withTools || path !== resolve(source, 'scripts'),
  });
}
