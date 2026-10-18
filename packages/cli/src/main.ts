#!/usr/bin/env node
import { run } from './commands.js';

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error(
    JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }),
  );
  process.exitCode = 1;
}
