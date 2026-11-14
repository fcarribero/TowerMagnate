import type { QueuedCommand, TowerState } from '@tower-magnate/shared';
import type { StepResult } from '../step';

type StepFunction = (
  state: TowerState,
  commands: readonly QueuedCommand[],
  steps: number,
) => StepResult;

/**
 * Runs `steps` steps the way a player who accepts every new-rating message at once would: the
 * clock holds at each promotion, and an `acceptStars` command lets the rest of the steps run.
 */
export function stepAcceptingStars(
  step: StepFunction,
  state: TowerState,
  commands: readonly QueuedCommand[],
  steps: number,
): StepResult {
  const target = state.step + steps;
  let outcome = step(state, commands, steps);
  const results = [...outcome.results];
  const events = [...outcome.events];
  let accepted = 0;
  while (outcome.state.starsPending === true) {
    accepted += 1;
    const accept: QueuedCommand = { id: `accept-stars-${accepted}`, command: { type: 'acceptStars' } };
    outcome = step(outcome.state, [accept], target - outcome.state.step);
    events.push(...outcome.events);
  }
  return { ...outcome, results, events };
}
