# Limitations

## Evidence

The collector accepts the documented JSONL schema. Unknown top-level fields and malformed records are reported as gaps. Other formats require an explicit adapter with preserved provenance.

Completeness concerns only supplied files and budgets. It cannot establish full service coverage, deployed versions, or the absence of an event across a production system. Files may change during or after collection; immutable exports are preferable for repeatable work.

Identifiers can be reused, and timestamps can reflect clock skew. Neither correlation nor sorted order establishes causality.

Redaction is heuristic. Unknown credential formats and personal or business-sensitive data can remain. Inspect artifacts before sharing them. Source fingerprints check consistency with original decoded text, not authenticity or chain of custody.

## Diagnosis

Report validation checks structure and references. Source verification checks consistency. Neither assesses whether a cited event proves a claim. The model and reviewer remain responsible for causal reasoning.

Skill instructions do not enforce permissions or reliably contain every prompt injection. Capabilities and filesystem boundaries must be enforced by the host.

## Laboratory and evaluation

The order service is a local incident laboratory with an emulated payment provider. It deliberately reproduces unsafe processing paths and must not be deployed as a real payment service. Queue crash recovery and an outbox are absent.

The evaluation harness prepares inputs, checks snapshots, resolves citations, and applies supplied reviews. It does not launch models, implement a sandbox, enforce model budgets, or measure usage automatically. No comparative model results are included.

The reserved cases are small and related to the development cases. They provide limited evidence about generalization, even when kept separate from tuning.
