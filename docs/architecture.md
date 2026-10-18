# Architecture

Tracecase consists of an investigation skill, deterministic evidence tools, an incident laboratory, and an evaluation harness. It does not call a model API: Codex supplies reasoning and tool execution.

## Package boundaries

| Package                  | Responsibility                                  | Dependencies                 |
| ------------------------ | ----------------------------------------------- | ---------------------------- |
| `packages/core`          | Collect, correlate, verify, and render evidence | Zod, Node.js                 |
| `packages/cli`           | Parse commands and handle input/output          | Core                         |
| `examples/order-service` | Reproduce backend incidents                     | Core event types, PostgreSQL |
| `evals`                  | Prepare isolated inputs and score reports       | Core, order-service, Zod     |
| `skills/tracecase`       | Guide Codex and distribute the bundled CLI      | Node.js at runtime           |

Core does not import the CLI, scenarios, or grading rubrics. TypeScript project references enforce build order. Public exports resolve compiled code; development scripts use tsx.

## Evidence pipeline

`collect.ts` coordinates a small set of independent operations:

1. `log-reader.ts` parses bounded JSONL input and records diagnostics and collection gaps.
2. `correlate.ts` links typed request, trace, and order identifiers using union-find, then orders the matching events.
3. `source-evidence.ts` reads explicitly requested source ranges or log citations.
4. `evidence.ts` constructs source identities and calculates excerpt sizes.

`source-reader.ts` contains filesystem boundaries and byte-bounded line reading. It normalizes CRLF and decodes complete lines. Oversized or invalid log records do not prevent later valid records from being read. `limits.ts` defines collection, parsing, and excerpt budgets.

Correlation expands transitively from supplied identifiers. It is a convenience for finding related events, not proof that they are causally related. Reused IDs and clock skew require interpretation by the investigator. Output truncation and incomplete reads remain visible in the bundle.

## Validation, verification, and rendering

These operations have separate responsibilities:

- `validate-report.ts` checks the report contract and reference existence.
- `verify.ts` re-reads source content and checks fingerprints, evidence IDs, and redacted projections. Object-key order does not affect projection equality; array order does.
- `render-report.ts` renders readable Markdown sections and source excerpts.

Source hashes refer to original decoded text, before redaction. They detect changes relative to the supplied bundle, but are not signatures. Structural validation does not assess the truth of a diagnosis.

The CLI's `arguments.ts` produces a discriminated command type. `commands.ts` executes it and performs file input/output; `main.ts` only handles process exit and error reporting. The command names and JSON formats are shared with the packaged runtime.

## Incident laboratory

The API creates an order and enqueues a message. A worker claims messages and calls the simulated payment provider. The provider stores a charge before returning, allowing a lost response to leave local and external state inconsistent.

The persistence contract separates `createOrder` from `updateOrderStatus`. Creation rejects duplicate IDs; changing status preserves amount and currency. Memory and PostgreSQL adapters run the same contract tests. PostgreSQL message claims use `FOR UPDATE SKIP LOCKED` in a single statement.

Database initialization is isolated in `postgres-schema.ts`. A transaction-scoped advisory lock serializes first-use schema creation across independent processes, including parallel integration tests.

The lab intentionally contains unsafe retry and contract-handling paths. It is not a payment implementation. Worker crash recovery and a transactional outbox are not implemented.

Scenario definitions specify the active decoder, delivery sequence, and telemetry transformations. `configuration.ts` creates the service for both execution and exported reproduction. The exporter copies the source files unchanged and writes the active `src/service-config.json`; it never rewrites application source text.

## Evaluation harness

`prepare.ts` creates the agent workspace and stores grading artifacts outside it. `run-store.ts` validates persisted run metadata. `score.ts` verifies input snapshots before normalizing citations and scoring the report. `scoring.ts` returns a typed result that distinguishes an unreviewed report from a semantic review.

Explicit log citations can include counterevidence outside the automatically correlated timeline. The scorer validates those source locations against the prepared inputs rather than rejecting them because the collector filtered them out.

Workspace preparation is not a sandbox. An external runner must enforce filesystem isolation, capabilities, model settings, and execution budgets. See [evaluation](evaluation.md).

## Skill distribution

`scripts/build-skill.mjs` bundles the TypeScript CLI and Zod into `skills/tracecase/scripts/tracecase.mjs`. Only Node.js built-ins remain external. The build rejects absolute checkout paths and unexpected runtime dependencies, and includes the Zod license notice.

The generated runtime is distributed with the skill. `pnpm skill:check` compares it with a fresh in-memory build. Users resolve it relative to the loaded SKILL.md while keeping their working directory at the affected project. No source checkout or package installation is needed at investigation time.
