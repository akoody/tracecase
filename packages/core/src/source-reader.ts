import { createHash } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const digest = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

export async function sourcePath(
  root: string,
  file: string,
): Promise<{ absolute: string; path: string }> {
  const base = await realpath(root);
  const absolute = await realpath(resolve(base, file));
  const path = relative(base, absolute);
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`Source must be a file inside the root: ${file}`);
  }
  if (!(await stat(absolute)).isFile()) throw new Error(`Not a regular file: ${file}`);
  return { absolute, path: path.split(sep).join('/') };
}

export interface Line {
  number: number;
  text: string | null;
}
export interface ReadSummary {
  sha256: string;
  bytes: number;
  complete: boolean;
}

/** Bytes are bounded before decoding; a single adversarial line cannot grow memory indefinitely. */
export async function readLines(
  file: string,
  limits: { maxBytes: number; maxLineBytes: number; signal?: AbortSignal },
  visit: (line: Line) => boolean | void,
): Promise<ReadSummary> {
  const handle = await open(file, 'r');
  const before = await handle.stat();
  const hash = createHash('sha256');
  let bytes = 0;
  let pending = Buffer.alloc(0);
  let oversized = false;
  let number = 0;
  let stopped = false;
  const emit = (): void => {
    number++;
    const raw =
      pending.length && pending[pending.length - 1] === 13 ? pending.subarray(0, -1) : pending;
    if (visit({ number, text: oversized ? null : raw.toString('utf8') }) === false) stopped = true;
    pending = Buffer.alloc(0);
    oversized = false;
  };
  try {
    while (bytes < limits.maxBytes && !stopped) {
      limits.signal?.throwIfAborted();
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, limits.maxBytes - bytes));
      const result = await handle.read(buffer, 0, buffer.length, bytes);
      if (!result.bytesRead) break;
      const chunk = buffer.subarray(0, result.bytesRead);
      hash.update(chunk);
      bytes += result.bytesRead;
      let start = 0;
      for (let i = 0; i <= chunk.length; i++) {
        if (i !== chunk.length && chunk[i] !== 10) continue;
        const part = chunk.subarray(start, i);
        if (!oversized) {
          if (pending.length + part.length > limits.maxLineBytes) {
            oversized = true;
            pending = Buffer.alloc(0);
          } else pending = Buffer.concat([pending, part]);
        }
        if (i !== chunk.length) emit();
        start = i + 1;
        if (stopped) break;
      }
    }
    const after = await handle.stat();
    const reachedEnd = bytes === after.size;
    if (!stopped && reachedEnd && (pending.length > 0 || oversized)) emit();
    return {
      sha256: hash.digest('hex'),
      bytes,
      complete:
        !stopped && reachedEnd && before.size === after.size && before.mtimeMs === after.mtimeMs,
    };
  } finally {
    await handle.close();
  }
}
