/**
 * Run Machine
 *
 * Pure state-machine semantics for playbook runs: building the xstate
 * machine for a playbook body, transition validity (including Done When
 * gate verdicts), evidence scoping, and the small formatting helpers
 * that render transitions and verifier status for operators.
 *
 * Everything here is a pure function over (body, run) — no store or
 * plugin context access.
 */

import { createActor, createMachine } from "xstate";
import type {
  PlaybookBody,
  PlaybookState,
  PlaybookTransition,
} from "../entity";
import type { PlaybookRun, PlaybookRunEvidence } from "../run-store";

export function sameGoal(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** A NEXT out of a state with Done When conditions needs a gate verdict. */
export function transitionRequiresGateVerdict(
  state: PlaybookState,
  event: string,
): boolean {
  return event === "NEXT" && state.doneWhen.length > 0;
}

/** Whether the run already holds a met verdict for this state's goal. */
export function hasSatisfiedGateVerdicts(
  state: PlaybookState,
  run: PlaybookRun,
): boolean {
  return run.gateVerdicts.some(
    (verdict) =>
      verdict.stateId === state.id &&
      sameGoal(verdict.goal, state.doneWhen) &&
      verdict.met,
  );
}

export function buildMachine(
  playbookId: string,
  body: PlaybookBody,
  run: PlaybookRun,
): ReturnType<typeof createMachine> {
  return createMachine({
    id: playbookId,
    initial: body.initialState,
    states: Object.fromEntries(
      body.states.map((state) => {
        const isFinal = body.finalStates.includes(state.id);
        return [
          state.id,
          {
            ...(isFinal ? { type: "final" as const } : {}),
            ...(isFinal
              ? {}
              : {
                  on: Object.fromEntries(
                    state.transitions.map((transition) => [
                      transition.event,
                      {
                        target: transition.target,
                        ...(transitionRequiresGateVerdict(
                          state,
                          transition.event,
                        )
                          ? {
                              guard: (): boolean =>
                                hasSatisfiedGateVerdicts(state, run),
                            }
                          : {}),
                      },
                    ]),
                  ),
                }),
          },
        ];
      }),
    ),
  });
}

/**
 * An actor for the run's machine, resolved at the run's current state.
 *
 * The run's currentState is the single source of truth for machine state;
 * the actor is rehydrated from it on every call. Legacy persisted snapshots
 * are ignored entirely (they could be corrupt or disagree with currentState).
 */
export function createRunActor(
  body: PlaybookBody,
  run: PlaybookRun,
): ReturnType<typeof createActor> {
  const machine = buildMachine(run.playbookId, body, run);
  return createActor(machine, {
    snapshot: machine.resolveState({ value: run.currentState }),
  });
}

export function canTransition(
  run: PlaybookRun,
  body: PlaybookBody,
  event: string,
): boolean {
  const actor = createRunActor(body, run);
  actor.start();
  const allowed = actor.getSnapshot().can({ type: event });
  actor.stop();
  return allowed;
}

export function getValidTransitions(
  run: PlaybookRun,
  body: PlaybookBody,
  state: PlaybookState,
): PlaybookTransition[] {
  return state.transitions.filter((transition) =>
    canTransition(run, body, transition.event),
  );
}

export function getBlockedTransitions(
  run: PlaybookRun,
  body: PlaybookBody,
  state: PlaybookState,
): PlaybookTransition[] {
  const validKeys = new Set(
    getValidTransitions(run, body, state).map(
      (transition) => `${transition.event}\u0000${transition.target}`,
    ),
  );
  return state.transitions.filter(
    (transition) =>
      !validKeys.has(`${transition.event}\u0000${transition.target}`),
  );
}

/** Evidence that is unscoped or scoped to the given state. */
export function evidenceForState(
  run: PlaybookRun,
  stateId: string,
): PlaybookRunEvidence[] {
  return run.evidence.filter(
    (evidence) => !evidence.stateId || evidence.stateId === stateId,
  );
}

export function getState(
  body: PlaybookBody,
  stateId: string,
): PlaybookState | undefined {
  return body.states.find((state) => state.id === stateId);
}

export function formatTransition(transition: PlaybookTransition): string {
  const description =
    transition.operatorDescription ??
    transition.description ??
    transition.label;
  return description
    ? `- ${transition.event} -> ${transition.target}: ${description}`
    : `- ${transition.event} -> ${transition.target}`;
}

export function formatVerifierStatus(
  run: PlaybookRun,
  state: PlaybookState,
): string {
  if (state.doneWhen.length === 0) return "- no gated Done When conditions";
  const verdict = run.gateVerdicts.find(
    (candidate) =>
      candidate.stateId === state.id &&
      sameGoal(candidate.goal, state.doneWhen),
  );
  if (!verdict) {
    return `- Not yet met: ${state.doneWhen.join("; ")}`;
  }
  return verdict.met
    ? `- Met: ${verdict.reason}`
    : `- Not yet met: ${verdict.reason}`;
}
