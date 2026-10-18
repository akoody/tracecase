# Investigation report contract

For native-tool investigations, deliver the following structure in Markdown, citing `path:line` or `path:start:end` for claims. For CLI validation, write this JSON object and use the evidence IDs from the collected bundle.

```json
{
  "schemaVersion": 1,
  "title": "Investigation of order ord_482",
  "symptom": "The order remains pending.",
  "conclusion": {
    "status": "insufficient",
    "summary": "The worker timed out; the provider outcome is unknown.",
    "evidenceIds": ["ev_REPLACE_WITH_REAL_ID"]
  },
  "findings": [
    { "statement": "A worker timeout was observed.", "evidenceIds": ["ev_REPLACE_WITH_REAL_ID"] }
  ],
  "hypotheses": [
    {
      "statement": "The provider committed the operation before the response was lost.",
      "outcome": "untested",
      "reasoning": "Provider ledger and request status are unavailable.",
      "evidenceIds": []
    }
  ],
  "missingData": ["Provider operation status correlated with the request ID."],
  "reproduction": ["Not executed: provider simulator is unavailable."],
  "proposedFix": ["Reconcile the external outcome before retrying."],
  "verification": ["Test both timeout before commit and timeout after commit."]
}
```

Replace every example claim and ID with actual observations. Findings and tested hypotheses need citations. An insufficient conclusion needs missing data. A supported or rejected hypothesis needs both reasoning and evidence. Include material alternative explanations; do not add a fixed number of hypotheses just to fill the report.

For controlled evaluations that require JSON but do not provide the CLI, use source references such as `logs/events.jsonl:3` or `src/service.ts:20:30` in `evidenceIds`. The evaluation scorer resolves them after the run. This keeps the report format comparable without giving the baseline extra tools.
