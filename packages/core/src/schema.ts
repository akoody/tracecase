import { z } from 'zod';
import { limits } from './limits.js';

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const json: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(json), z.record(json)]),
);
export const eventSchema = z
  .object({
    timestamp: z.string().datetime({ offset: true }),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    service: z.string().min(1),
    event: z.string().min(1),
    message: z.string().optional(),
    traceId: z.string().min(1).optional(),
    requestId: z.string().min(1).optional(),
    orderId: z.string().min(1).optional(),
    release: z.string().optional(),
    data: z.record(json).optional(),
  })
  .strict();
export type LogEvent = z.infer<typeof eventSchema>;

const sourceSchema = z
  .object({
    path: z.string().min(1),
    line: z.number().int().positive().max(limits.inputLines),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const logEvidenceSchema = z
  .object({
    kind: z.literal('log'),
    id: z.string().regex(/^ev_[a-f0-9]{20}$/),
    source: sourceSchema,
    value: eventSchema,
  })
  .strict();
const codeEvidenceSchema = z
  .object({
    kind: z.literal('code'),
    id: z.string().regex(/^src_[a-f0-9]{20}$/),
    source: sourceSchema,
    endLine: z.number().int().positive().max(limits.inputLines),
    text: z.string(),
  })
  .strict();
export const evidenceSchema = z.discriminatedUnion('kind', [logEvidenceSchema, codeEvidenceSchema]);
export type Evidence = z.infer<typeof evidenceSchema>;

export const bundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    createdAt: z.string().datetime(),
    subject: z
      .object({
        orderId: z.string().optional(),
        traceId: z.string().optional(),
        requestId: z.string().optional(),
      })
      .strict(),
    evidence: z.array(evidenceSchema).max(limits.logEvents + limits.codeRanges),
    collection: z
      .object({
        complete: z.boolean(),
        scannedLines: z.number().int().nonnegative(),
        validEvents: z.number().int().nonnegative(),
        matchedEvents: z.number().int().nonnegative(),
        omittedEvents: z.number().int().nonnegative(),
        diagnosticCount: z.number().int().nonnegative(),
        diagnostics: z.array(
          z
            .object({ path: z.string(), line: z.number().int().nonnegative(), reason: z.string() })
            .strict(),
        ),
        limitations: z.array(z.string()),
        files: z.array(
          z
            .object({
              path: z.string(),
              sha256: z.string(),
              bytes: z.number().int().nonnegative(),
              complete: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict()
  .superRefine((bundle, context) => {
    for (const [index, item] of bundle.evidence.entries()) {
      if (
        item.kind === 'code' &&
        (item.endLine < item.source.line || item.endLine - item.source.line >= limits.codeLines)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['evidence', index, 'endLine'],
          message: `Code range must contain 1–${limits.codeLines} lines`,
        });
      }
    }
  });
export type EvidenceBundle = z.infer<typeof bundleSchema>;

export const reportSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1),
    symptom: z.string().min(1),
    conclusion: z
      .object({
        status: z.enum(['confirmed', 'likely', 'insufficient']),
        summary: z.string().min(1),
        evidenceIds: z.array(z.string()),
      })
      .strict(),
    findings: z.array(
      z.object({ statement: z.string().min(1), evidenceIds: z.array(z.string()).min(1) }).strict(),
    ),
    hypotheses: z
      .array(
        z
          .object({
            statement: z.string().min(1),
            outcome: z.enum(['supported', 'rejected', 'untested']),
            reasoning: z.string().min(1),
            evidenceIds: z.array(z.string()),
          })
          .strict(),
      )
      .min(1),
    missingData: z.array(z.string().min(1)),
    reproduction: z.array(z.string().min(1)),
    proposedFix: z.array(z.string().min(1)),
    verification: z.array(z.string().min(1)),
  })
  .strict();
export type InvestigationReport = z.infer<typeof reportSchema>;
