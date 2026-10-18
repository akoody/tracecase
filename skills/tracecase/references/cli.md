# Local evidence tools

The CLI is included at `scripts/tracecase.mjs` next to this skill's SKILL.md. It needs Node.js 20.19 or newer. All library dependencies are bundled; it runs offline without pnpm, npm packages, a source checkout, or a global `tracecase` executable.

Resolve the installed skill directory from the SKILL.md path provided by the host. In the commands below, replace `/absolute/path/to/tracecase` with that directory. Do not assume the skill lives in the affected repository and do not change into the skill directory: input and output paths remain relative to the affected project's working directory. Quotes are necessary for paths containing spaces. If Node or the packaged runtime is unavailable, use native tools rather than installing software automatically.

Example from the affected repository root:

```sh
node "/absolute/path/to/tracecase/scripts/tracecase.mjs" collect \
  --root . --log logs/api.jsonl --log logs/worker.jsonl \
  --order ord_482 --code src/worker.ts:20:48 --out .tracecase/evidence.json
node "/absolute/path/to/tracecase/scripts/tracecase.mjs" verify \
  --root . --bundle .tracecase/evidence.json
node "/absolute/path/to/tracecase/scripts/tracecase.mjs" report \
  --bundle .tracecase/evidence.json \
  --input .tracecase/report.json --out investigation.md
```

Use a new output filename for each collection; tools refuse overwrites. `collect` does not diagnose. It filters a bounded set of supplied files and correlates orderId, requestId and traceId transitively. `--order`, `--trace`, and `--request` are union seeds, not AND filters. Values must match exactly.

JSONL event fields: `timestamp` (ISO 8601 with timezone), `level` (`debug|info|warn|error`), `service`, `event`; optional `message`, `orderId`, `traceId`, `requestId`, `release`, `data` (JSON object). Unknown top-level fields are rejected and counted as diagnostics. Adapt a copy explicitly when the source uses another schema; retain original provenance.

Defaults: 64 MiB total log bytes, 100,000 retained valid input events, 256 KiB per log line, earliest 200 correlated output events, 64 log files, 20 code ranges of at most 100 lines each. Flags: `--max-bytes`, `--max-events`, `--max-output`, `--max-line-bytes`. Hard limits: 1,000,000 input lines, JSON depth 32 and 20,000 nodes per event, 4 MiB of formatted log evidence and 8 MiB of combined excerpts. A skipped invalid line or a log budget limit makes collection incomplete. Excessively large requested code excerpts fail rather than silently truncate. Completeness concerns only supplied files, not system-wide telemetry.

Evidence IDs identify source location and SHA-256 of the original decoded line or range. Newlines are normalized and CRLF terminators removed. `verify` detects changed cited lines within its 64 MiB-per-file verification budget. Hashes are consistency checks, not signatures; bundles remain editable local files. Automatic redaction is best effort and is not a guarantee that personal data or every secret has been removed.

Add code ranges once the relevant implementation is known, then use the new bundle consistently. The report validator checks structure and evidence ID existence. It does not verify the meaning of a claim, automatically re-read sources, or certify the diagnosis. Run `verify` separately before delivery.
