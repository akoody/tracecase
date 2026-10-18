export const limits = {
  logBytes: 64 * 1024 * 1024,
  logEvents: 100_000,
  outputEvents: 200,
  logLineBytes: 256 * 1024,
  inputLines: 1_000_000,
  logFiles: 64,
  diagnostics: 100,
  jsonDepth: 32,
  jsonNodes: 20_000,
  logEvidenceBytes: 4 * 1024 * 1024,
  evidenceBytes: 8 * 1024 * 1024,
  codeRanges: 20,
  codeLines: 100,
  codeBytes: 4 * 1024 * 1024,
  codeLineBytes: 16 * 1024,
  jsonFileBytes: 32 * 1024 * 1024,
} as const;

export function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive safe integer`);
  return value;
}
