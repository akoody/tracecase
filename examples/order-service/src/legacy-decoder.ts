import type { PayloadDecoder } from './service.js';

// Consumer deployed before the producer renamed currency to currencyCode.
export const decodeLegacy: PayloadDecoder = (payload) => ({
  amount: payload.amount as number,
  currency: (payload.currency as string).toUpperCase(),
});
