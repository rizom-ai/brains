import type { PlaybookBody } from "./schemas/playbook";

export interface PlaybookValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePlaybookBody(
  body: PlaybookBody,
): PlaybookValidationResult {
  const errors: string[] = [];
  const stateIds = new Set<string>();
  const duplicateStateIds = new Set<string>();

  for (const state of body.states) {
    if (stateIds.has(state.id)) {
      duplicateStateIds.add(state.id);
    }
    stateIds.add(state.id);
  }

  if (!stateIds.has(body.initialState)) {
    errors.push(
      `Playbook initial state '${body.initialState}' is not defined.`,
    );
  }

  for (const stateId of duplicateStateIds) {
    errors.push(`Duplicate playbook state id '${stateId}'.`);
  }

  for (const finalState of body.finalStates) {
    if (!stateIds.has(finalState)) {
      errors.push(`Playbook final state '${finalState}' is not defined.`);
    }
  }

  for (const state of body.states) {
    for (const transition of state.transitions) {
      if (!stateIds.has(transition.target)) {
        errors.push(
          `Playbook transition '${state.id}' -> '${transition.target}' targets an undefined state.`,
        );
      }
    }
  }

  for (const stateId of getUnreachableStateIds(body, stateIds)) {
    errors.push(`Playbook state '${stateId}' is unreachable.`);
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidPlaybookBody(body: PlaybookBody): void {
  const result = validatePlaybookBody(body);
  if (!result.valid) {
    throw new Error(result.errors.join("\n"));
  }
}

function getUnreachableStateIds(
  body: PlaybookBody,
  stateIds: Set<string>,
): string[] {
  if (!stateIds.has(body.initialState)) {
    return [];
  }

  const visited = new Set<string>();
  const queue = [body.initialState];

  while (queue.length > 0) {
    const stateId = queue.shift();
    if (!stateId || visited.has(stateId)) continue;
    visited.add(stateId);

    const state = body.states.find((candidate) => candidate.id === stateId);
    if (!state) continue;
    for (const transition of state.transitions) {
      if (stateIds.has(transition.target) && !visited.has(transition.target)) {
        queue.push(transition.target);
      }
    }
  }

  return body.states
    .map((state) => state.id)
    .filter((stateId) => !visited.has(stateId));
}
