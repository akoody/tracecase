import type { Evidence, EvidenceBundle } from './schema.js';
import { validateReport } from './validate-report.js';

const clean = (text: string): string => text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
const prose = (text: string): string => clean(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
const references = (ids: string[]): string => ids.map((id) => `[${id}](#${id})`).join(', ');
const list = (items: string[]): string =>
  items.length ? items.map((item) => `- ${prose(item)}`).join('\n') : '- None recorded.';
const section = (title: string, body: string): string => `## ${title}\n\n${body}`;

function renderEvidence(item: Evidence): string {
  const path = item.source.path.split('/').map(encodeURIComponent).join('/');
  const label = prose(item.source.path).replace(/[\[\]\\]/g, '\\$&');
  const location = `${label}:${item.source.line}${item.kind === 'code' ? `–${item.endLine}` : ''}`;
  const original = item.kind === 'log' ? JSON.stringify(item.value) : item.text;
  const code = clean(original)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return [
    `<a id="${item.id}"></a>`,
    `### ${item.id}`,
    `Source: [${location}](${path}#L${item.source.line})\n\nSHA-256: \`${item.source.sha256}\``,
    code,
  ].join('\n\n');
}

export function renderReport(input: unknown, bundle: EvidenceBundle): string {
  const report = validateReport(input, bundle);
  const timeline = bundle.evidence
    .filter((item) => item.kind === 'log')
    .map(
      (item) =>
        `- ${item.value.timestamp} · ${prose(item.value.service)} · ${prose(item.value.event)} — ${references([item.id])}`,
    )
    .join('\n');
  const findings = report.findings
    .map((item) => `- ${prose(item.statement)} ${references(item.evidenceIds)}`)
    .join('\n');
  const hypotheses = report.hypotheses
    .map(
      (item) =>
        `- **${item.outcome}**: ${prose(item.statement)} — ${prose(item.reasoning)} ${references(item.evidenceIds)}`,
    )
    .join('\n');
  const collection = bundle.collection;
  const coverage = `Supplied-file collection complete: ${collection.complete}. Matched: ${collection.matchedEvents}; omitted: ${collection.omittedEvents}; diagnostics: ${collection.diagnosticCount}.`;
  const gaps = list([
    ...collection.limitations,
    ...collection.diagnostics.map((item) => `${item.path}:${item.line}: ${item.reason}`),
  ]);
  return (
    [
      `# ${prose(report.title)}`,
      prose(report.symptom),
      section(
        `Conclusion: ${report.conclusion.status}`,
        [prose(report.conclusion.summary), references(report.conclusion.evidenceIds)]
          .filter(Boolean)
          .join('\n\n'),
      ),
      section('Findings', findings || '- None recorded.'),
      section('Timeline', timeline || '- No matching events.'),
      section('Hypotheses', hypotheses),
      section('Missing data', list(report.missingData)),
      section('Reproduction', list(report.reproduction)),
      section('Proposed fix', list(report.proposedFix)),
      section('Verification', list(report.verification)),
      section(
        'Collection limits',
        [
          coverage,
          gaps,
          'Validation checks structure and references, not the truth of the diagnosis. Source links are relative to the collection root; open the report there or use the source paths above.',
        ].join('\n\n'),
      ),
      section('Evidence', bundle.evidence.map(renderEvidence).join('\n\n')),
    ].join('\n\n') + '\n'
  );
}
