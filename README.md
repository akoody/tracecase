# Tracecase

Backend incident investigations for Codex.

An order is stuck in `pending`. The worker logged a timeout. The provider may already have charged it. Before retrying, you need to know which part of the operation actually completed.

Tracecase is a Codex skill for working through cases like this. It provides an investigation workflow and local tools that collect related events, attach source references, and turn findings into a report. You can follow a conclusion back to the logs and code that support it.

## Use it in your project

With Node.js 22.20 or newer:

```sh
npx skills add akoody/tracecase -a codex -g -y
```

This installs the skill and its bundled tools for Codex across your projects. There is no separate build step. For a project-only installation, run the same command from that project and omit `-g`.

Open the affected project in Codex and describe the incident:

```text
$tracecase Order ord_482 has been pending since the last release.
API and worker logs are in ./logs.
Trace the order through the processing path, check the possible causes,
and save an investigation.md with evidence. Don't change the code yet.
```

Include a request, trace, or business ID when you have one. A time window and a description of the expected behavior also help. Codex reads the skill, inspects the repository, and can use the bundled tools to collect evidence. You do not need to run the CLI yourself.

Other useful starting points:

```text
$tracecase The same webhook appears to have created two charges.
Check the retry and deduplication paths. Logs are in ./logs/payments.jsonl.
```

```text
$tracecase The worker timed out, but we don't have provider logs.
Find out what the available evidence establishes and what we need to check next.
```

The skill works with repository files and local log exports. It does not connect to your production monitoring service automatically.

## What you get

An investigation records the observed sequence, the explanations that were checked, and the evidence behind each finding. The conclusion is marked `confirmed`, `likely`, or `insufficient`. Missing data and proposed fixes are kept separate from checks that were actually performed.

A shortened example for the included `lost-response` scenario:

```text
Conclusion: confirmed

The provider committed the charge. The worker then received a timeout
before it could mark the order completed.

Evidence
  logs/events.jsonl:3   provider: charge.committed
  logs/events.jsonl:4   worker: delivery.failed

Next steps
  Reconcile the provider's operation before retrying.
  Verify that repeated deliveries use the same idempotency key.
```

The full report includes a timeline, hypotheses, source excerpts, and verification steps. Evidence bundles retain source locations and hashes so you can check whether the cited content has changed.

## What Tracecase adds

Codex can already read code and investigate bugs. Tracecase makes the process reusable: follow the operation across boundaries, check competing explanations, cite observations, and leave a record of what remains unknown.

The bundled tools handle the repetitive data work:

| Command   | Purpose                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| `collect` | Read JSONL logs, link events through order/request/trace IDs, and collect code excerpts |
| `verify`  | Check cited source content against its recorded hashes and redacted values              |
| `report`  | Validate report structure and evidence references, then render Markdown                 |

The model still has to reason about the cause. A valid reference does not prove a claim, and there are no measured results showing that this skill outperforms ordinary Codex. The repository includes an [evaluation harness](docs/evaluation.md) for testing that question.

## Try a reproducible incident

You can explore the project without bringing your own logs. The order-service example executes an API/worker/provider flow and exports the resulting logs, active configuration, and source files.

With pnpm 11.25.0 installed:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo lost-response .tracecase/first-case
```

The simulated provider records one charge, while the order remains `pending`. No external payment service is involved. Choose a new output directory for each run; existing directories are preserved.

Then ask Codex from this repository:

```text
$tracecase Investigate the incident in .tracecase/first-case.
Use incident.json, logs/, and src/ inside that directory.
Explain the cause, cite the evidence, and save a report there.
```

The repository already exposes its skill through `.agents/skills/tracecase`, so this walkthrough does not need a separate skill installation.

The lab also covers incompatible message formats, duplicate delivery, missing provider logs, unrelated errors, clock skew, malformed JSON, and instructions embedded in log data. See the [scenario definitions](examples/order-service/src/scenario-definitions.ts) for the complete set. Two cases are reserved for evaluation holdout.

## Log format and tools

The collector accepts JSONL: one event per line, using this schema:

```text
{"timestamp":"2026-01-01T00:00:00Z","level":"error","service":"worker","event":"delivery.failed","orderId":"ord_482","traceId":"t_91","message":"Provider response timed out"}
```

`timestamp`, `level`, `service`, and `event` are required. Correlation uses `orderId`, `requestId`, and `traceId`. Additional structured fields belong in `data`. Other log formats need an adapter; invalid records and truncated input are reported as collection gaps.

For direct use from this checkout:

```sh
node skills/tracecase/scripts/tracecase.mjs --help
```

The evidence tools run locally without network calls or installed package dependencies. They require Node.js 20.19+; the Skills installer has the newer Node.js requirement listed above. See the [CLI reference](skills/tracecase/references/cli.md) for commands and budgets, and the [report contract](skills/tracecase/references/report.md) for the JSON format.

Review artifacts before sharing them: credential redaction is best effort. See [limitations](docs/limitations.md) for the boundaries around data handling, source verification, and model reasoning.

## Working on Tracecase

| Directory                | Contents                                                             |
| ------------------------ | -------------------------------------------------------------------- |
| `skills/tracecase`       | Installable skill, references, and bundled CLI                       |
| `packages/core`          | Evidence collection, correlation, verification, and report rendering |
| `packages/cli`           | Command parsing and file input/output                                |
| `examples/order-service` | Incident lab with memory and PostgreSQL adapters                     |
| `evals`                  | Run preparation, source snapshots, and report scoring                |

Run the checks:

```sh
pnpm check
```

For PostgreSQL integration tests:

```sh
docker compose up -d --wait
TRACECASE_TEST_DATABASE_URL=postgres://tracecase:tracecase@127.0.0.1:55432/tracecase pnpm test
docker compose stop
```

After changing the CLI or core, run `pnpm skill:build` to regenerate the installable runtime. `pnpm check` rejects a stale bundle. `pnpm skill:install-test` checks real installation in temporary projects and runs the installed tools after deleting their original source copy.

The [architecture guide](docs/architecture.md) explains the module boundaries and the lab's intentional failure paths.
