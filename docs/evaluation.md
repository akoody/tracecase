# Evaluation

Tracecase has no published model benchmark results. The harness prepares comparable inputs and checks reports; it does not launch Codex or independently judge a diagnosis.

## Conditions

| Mode       | Skill instructions | Bundled evidence tools    |
| ---------- | ------------------ | ------------------------- |
| `baseline` | Absent             | Absent                    |
| `skill`    | Present            | Omitted for this ablation |
| `tools`    | Present            | Present                   |

All conditions receive the same report format. That format includes an example of uncertainty handling, so the baseline already receives some investigation guidance. Inputs for a case are identical between modes. Skill-only instructions explicitly allow native tools when the bundled runtime is excluded.

## Prepare a run

Build the workspace and verify the packaged runtime:

```sh
pnpm build
pnpm skill:check
pnpm eval:prepare --case c01 --mode baseline --out /tmp/tracecase-c01-baseline
pnpm eval:prepare --case c01 --mode skill --out /tmp/tracecase-c01-skill
pnpm eval:prepare --case c01 --mode tools --out /tmp/tracecase-c01-tools
```

Each output directory must be new, outside this repository, with an existing parent. It contains:

- `workspace/`: incident, source snapshot, active service configuration, logs, report contract, and prompt. Relevant modes include the skill.
- `run.json`: validated case, mode, workspace, and fingerprint metadata for the grader.
- `evidence.json`: deterministic grading evidence, outside the agent workspace.

Mount only `workspace/` into the evaluation environment. Exclude the grading repository, other runs, user-global skills, and credentials. Start a clean model session for each run. Prompt instructions alone cannot enforce isolation.

Tools mode runs `node .agents/skills/tracecase/scripts/tracecase.mjs`. Baseline and skill-only modes must not have access to another installation of the runtime.

The prompt requests a limit of 20 tool calls or 10 minutes. Enforce that limit externally and keep model, reasoning settings, host capabilities, and available context consistent. Repeat cases in varied order and retain transcripts, failures, and measured usage. Do not replace unavailable token or cost information with zero.

Cases c01–c08 are development cases. c09–c10 are reserved holdout cases; replace them if they are used for tuning. Rubrics live in `evals/src/cases.ts`, outside the agent-visible inputs.

## Score a report

The agent writes `workspace/report.json` using REPORT_FORMAT.md. `evidenceIds` can use exact source locations: `logs/events.jsonl:3`, `logs/events.jsonl:3:4`, or `src/service.ts:20:30`.

```sh
pnpm eval:score \
  --run /tmp/tracecase-c01-baseline \
  --report /tmp/tracecase-c01-baseline/workspace/report.json
```

The scorer checks the run schema, source snapshot, report structure, and citations. It accepts explicit log counterevidence outside the correlated timeline. Missing, invalid, out-of-root, or oversized source ranges are rejected. Log ranges expand into individual event references.

Without a semantic review, the result is `semantic.state: unreviewed` and `passed: null`. A valid JSON report or a matching conclusion status is not proof of a correct diagnosis.

A reviewer evaluates the report against the private case rubric and evidence, preferably without knowing its mode. Supply a review with `--review review.json`:

```json
{
  "reviewer": "reviewer identifier",
  "causeCorrect": true,
  "claimsSupported": true,
  "alternativesHandled": true,
  "uncertaintyAppropriate": true,
  "instructionsInDataIgnored": true,
  "notes": "Explain the observations and rubric items supporting these judgments."
}
```

A passing reviewed result requires the expected conclusion status and all review criteria. Record reviewer disagreements and how they were resolved.

Optional `--metadata metadata.json` records externally measured execution data:

```json
{
  "model": "actual model identifier",
  "reasoningEffort": "actual setting",
  "elapsedMs": 42000,
  "toolCalls": 8
}
```

`inputTokens`, `outputTokens`, and `costUsd` are optional. The scorer validates their shape, not the accuracy of the supplied measurements. Results are printed as JSON.

## Reporting an experiment

Publish per-case outcomes, repeated-run variation, unsupported claims, appropriate abstentions, and measured latency and cost. Declare how infrastructure failures affect the denominator. Ten small scenarios support conclusions about those scenarios; broader claims need a larger independent dataset.
