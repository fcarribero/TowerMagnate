/**
 * Outside customers of 54 venues over one weekday, against the same day without them.
 * Run with `pnpm bench:customers`. Exits with 1 when customers add 0.1 ms or more per step.
 */
import { MAX_CUSTOMER_STEP_MS, customerStepMillis } from '@tower-magnate/engine/testing';

const { withCustomers, without, added } = customerStepMillis();

console.log(`With customers: ${withCustomers.toFixed(4)} ms per step`);
console.log(`Without: ${without.toFixed(4)} ms per step`);
console.log(
  `Added by customers: ${added.toFixed(4)} ms per step (budget ${MAX_CUSTOMER_STEP_MS} ms)`,
);

const inBudget = added < MAX_CUSTOMER_STEP_MS;
if (!inBudget) console.error('Customers are over budget.');
process.exitCode = inBudget ? 0 : 1;
