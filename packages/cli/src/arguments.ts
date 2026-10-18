import { parseArgs } from 'node:util';
import type { CollectionOptions, CodeRange, EvidenceBundle } from '@tracecase/core';

export type Command =
  | { name: 'help' }
  | { name: 'collect'; options: CollectionOptions; output: string }
  | { name: 'verify'; root: string; bundle: string }
  | { name: 'report'; bundle: string; input: string; output: string };

function required(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`--${flag} is required`);
  return value;
}
function integer(value: string, flag: string): number {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`--${flag} must be a positive safe integer`);
  return Number(value);
}
function codeRange(value: string): CodeRange {
  const match = /^(.*):([1-9]\d*):([1-9]\d*)$/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) throw new Error('--code expects FILE:START:END');
  return { file: match[1], start: integer(match[2], 'code'), end: integer(match[3], 'code') };
}

export function parseCommand(args: string[]): Command {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === 'help') return { name: 'help' };
  switch (command) {
    case 'collect': {
      const { values } = parseArgs({
        args: rest,
        strict: true,
        options: {
          root: { type: 'string' },
          log: { type: 'string', multiple: true },
          order: { type: 'string' },
          trace: { type: 'string' },
          request: { type: 'string' },
          code: { type: 'string', multiple: true },
          out: { type: 'string' },
          'max-events': { type: 'string' },
          'max-output': { type: 'string' },
          'max-bytes': { type: 'string' },
          'max-line-bytes': { type: 'string' },
        },
      });
      const subject: EvidenceBundle['subject'] = {};
      if (values.order !== undefined) subject.orderId = values.order;
      if (values.trace !== undefined) subject.traceId = values.trace;
      if (values.request !== undefined) subject.requestId = values.request;
      const budgets: Pick<
        CollectionOptions,
        'maxEvents' | 'maxOutputEvents' | 'maxBytes' | 'maxLineBytes'
      > = {};
      if (values['max-events'] !== undefined)
        budgets.maxEvents = integer(values['max-events'], 'max-events');
      if (values['max-output'] !== undefined)
        budgets.maxOutputEvents = integer(values['max-output'], 'max-output');
      if (values['max-bytes'] !== undefined)
        budgets.maxBytes = integer(values['max-bytes'], 'max-bytes');
      if (values['max-line-bytes'] !== undefined)
        budgets.maxLineBytes = integer(values['max-line-bytes'], 'max-line-bytes');
      return {
        name: 'collect',
        output: required(values.out, 'out'),
        options: {
          root: required(values.root, 'root'),
          logs: values.log ?? [],
          subject,
          code: (values.code ?? []).map(codeRange),
          ...budgets,
        },
      };
    }
    case 'verify': {
      const { values } = parseArgs({
        args: rest,
        strict: true,
        options: { root: { type: 'string' }, bundle: { type: 'string' } },
      });
      return {
        name: 'verify',
        root: required(values.root, 'root'),
        bundle: required(values.bundle, 'bundle'),
      };
    }
    case 'report': {
      const { values } = parseArgs({
        args: rest,
        strict: true,
        options: { bundle: { type: 'string' }, input: { type: 'string' }, out: { type: 'string' } },
      });
      return {
        name: 'report',
        bundle: required(values.bundle, 'bundle'),
        input: required(values.input, 'input'),
        output: required(values.out, 'out'),
      };
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
