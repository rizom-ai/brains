/**
 * Run Engine
 *
 * Playbook run mutation: starting runs, applying events (with Done When
 * gate verdicts from the injected goal check), recording entity-event
 * evidence, and auto-advancing a run when fresh evidence satisfies the
 * current state's gate. Store and playbook-catalog access are injected;
 * run locks are owned by the plugin and passed in.
 */

import { createPrefixedId } from "@brains/utils/id";
import type { PlaybookBody, PlaybookState } from "../entity";
import {
  createPlaybookRun,
  type PlaybookRunStore,
  type PlaybookGateVerdict,
  type PlaybookRun,
  type PlaybookRunEvidence,
} from "../run-store";
import {
  createRunActor,
  evidenceForState,
  getState,
  hasSatisfiedGateVerdicts,
  transitionRequiresGateVerdict,
} from "./run-machine";

export interface GoalCheckInput {
  run: PlaybookRun;
  state: PlaybookState;
  goal: string[];
  evidence: PlaybookRunEvidence[];
}

export interface GoalCheckResult {
  met: boolean;
  reason: string;
}

export interface GoalCheck {
  evaluate(input: GoalCheckInput): Promise<GoalCheckResult>;
}

export interface RunEngineDeps {
  store: PlaybookRunStore;
  goalCheck: GoalCheck;
  getPlaybook: (
    playbookId: string,
  ) => Promise<{ version: string; body: PlaybookBody } | undefined>;
  /** Serializes run mutations; owned by the plugin. */
  withRunLock: <T>(runId: string, operation: () => Promise<T>) => Promise<T>;
}

export type TransitionRunResult =
  | {
      success: true;
      currentState: string;
      gateVerdicts: PlaybookGateVerdict[];
    }
  | { success: false; error: string; gateVerdicts?: PlaybookGateVerdict[] };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function upsertGateVerdicts(
  existing: PlaybookGateVerdict[],
  next: PlaybookGateVerdict[],
): PlaybookGateVerdict[] {
  const nextKeys = new Set(next.map(gateVerdictKey));
  return [
    ...existing.filter((verdict) => !nextKeys.has(gateVerdictKey(verdict))),
    ...next,
  ];
}

function gateVerdictKey(verdict: PlaybookGateVerdict): string {
  return [verdict.stateId, ...verdict.goal].join("\u0000");
}

function stringFromPayload(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function entityEvidenceDetails(
  payload: Record<string, unknown>,
): Record<string, string> {
  const entity = recordFromUnknown(payload["entity"]);
  if (!entity) return {};

  const metadata = recordFromUnknown(entity["metadata"]);
  const title = firstNonEmptyString(
    metadata?.["title"],
    metadata?.["name"],
    entity["title"],
  );
  const content = firstNonEmptyString(entity["content"]);
  const contentPreview = content ? previewText(content) : undefined;

  return {
    ...(title ? { title } : {}),
    ...(contentPreview ? { contentPreview } : {}),
  };
}

function recordFromUnknown(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values
    .find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    ?.trim();
}

function previewText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 500
    ? `${normalized.slice(0, 497)}...`
    : normalized;
}

export class RunEngine {
  private readonly deps: RunEngineDeps;

  constructor(deps: RunEngineDeps) {
    this.deps = deps;
  }

  public async createStartedRun(input: {
    playbookId: string;
    playbookVersion: string;
    body: PlaybookBody;
    lifecycle?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<PlaybookRun> {
    return this.deps.store.upsert(
      createPlaybookRun({
        playbookId: input.playbookId,
        playbookVersion: input.playbookVersion,
        initialState: input.body.initialState,
        lifecycle: input.lifecycle,
        conversationId: input.conversationId,
      }),
    );
  }

  public async transitionRun(
    run: PlaybookRun,
    body: PlaybookBody,
    event: string,
  ): Promise<TransitionRunResult> {
    const state = getState(body, run.currentState);
    if (!state) {
      return {
        success: false,
        error: `Playbook state not found: ${run.currentState}`,
      };
    }

    const gateResult = await this.prepareGateVerdicts(run, state, event);
    if (!gateResult.success) return gateResult;

    const candidateRun: PlaybookRun = {
      ...run,
      gateVerdicts: gateResult.gateVerdicts,
    };
    const actor = createRunActor(body, candidateRun);
    actor.start();
    const snapshot = actor.getSnapshot();
    const eventObject = { type: event };
    if (!snapshot.can(eventObject)) {
      actor.stop();
      return {
        success: false,
        error: `Invalid playbook event '${event}' from state '${run.currentState}'.`,
        gateVerdicts: gateResult.gateVerdicts,
      };
    }

    actor.send(eventObject);
    const nextState = String(actor.getSnapshot().value);
    actor.stop();
    const expectedTarget = state.transitions.find(
      (transition) => transition.event === event,
    )?.target;
    if (expectedTarget && nextState !== expectedTarget) {
      return {
        success: false,
        error: `Playbook event '${event}' is blocked from state '${run.currentState}'. Complete the state's Done When conditions before sending this event.`,
        gateVerdicts: gateResult.gateVerdicts,
      };
    }
    return {
      success: true,
      currentState: nextState,
      gateVerdicts: gateResult.gateVerdicts,
    };
  }

  public async recordEntityEventEvidence(
    operation: "created" | "updated",
    payload: Record<string, unknown>,
  ): Promise<{ recorded: boolean }> {
    const entityType = stringFromPayload(payload, "entityType");
    const entityId = stringFromPayload(payload, "entityId");
    if (!entityType || !entityId) return { recorded: false };

    const explicitRunId = stringFromPayload(payload, "runId");
    const conversationId = stringFromPayload(payload, "conversationId");
    const run = explicitRunId
      ? await this.deps.store.findById(explicitRunId)
      : conversationId
        ? await this.deps.store.findActiveByConversation(conversationId)
        : undefined;
    if (run?.status !== "active") return { recorded: false };

    const evidence: PlaybookRunEvidence = {
      id: createPrefixedId("playbook_evidence"),
      kind: "entity_event",
      stateId: run.currentState,
      observedAt: new Date().toISOString(),
      data: {
        entityType,
        entityId,
        operation,
        ...entityEvidenceDetails(payload),
        ...(conversationId ? { conversationId } : {}),
        ...(stringFromPayload(payload, "toolCallId")
          ? { toolCallId: stringFromPayload(payload, "toolCallId") }
          : {}),
      },
    };
    const updatedRun = await this.deps.store.appendEvidence(run.id, evidence);
    await this.evaluateGateAfterEvidence(updatedRun.id);
    return { recorded: true };
  }

  public async evaluateGateAfterEvidence(runId: string): Promise<void> {
    await this.deps.withRunLock(runId, () =>
      this.evaluateGateAfterEvidenceLocked(runId),
    );
  }

  private async prepareGateVerdicts(
    run: PlaybookRun,
    state: PlaybookState,
    event: string,
  ): Promise<
    | { success: true; gateVerdicts: PlaybookGateVerdict[] }
    | { success: false; error: string }
  > {
    if (!transitionRequiresGateVerdict(state, event)) {
      return { success: true, gateVerdicts: run.gateVerdicts };
    }
    if (hasSatisfiedGateVerdicts(state, run)) {
      return { success: true, gateVerdicts: run.gateVerdicts };
    }

    const evidence = evidenceForState(run, state.id);
    let result: GoalCheckResult;
    try {
      result = await this.deps.goalCheck.evaluate({
        run,
        state,
        goal: state.doneWhen,
        evidence,
      });
    } catch (error) {
      result = {
        met: false,
        reason: `Playbook goal check failed: ${errorMessage(error)}`,
      };
    }

    const gateVerdict: PlaybookGateVerdict = {
      stateId: state.id,
      goal: state.doneWhen,
      met: result.met,
      reason: result.reason,
      evaluatedAt: new Date().toISOString(),
    };
    const nextVerdicts = upsertGateVerdicts(run.gateVerdicts, [gateVerdict]);
    return { success: true, gateVerdicts: nextVerdicts };
  }

  private async evaluateGateAfterEvidenceLocked(runId: string): Promise<void> {
    const run = await this.deps.store.findById(runId);
    if (run?.status !== "active") return;
    if (this.hasSatisfiedGateForCurrentState(run)) return;
    const playbook = await this.deps.getPlaybook(run.playbookId);
    if (run.playbookVersion !== playbook?.version) return;
    const state = getState(playbook.body, run.currentState);
    if (!state?.doneWhen.length) return;
    const nextTransitions = state.transitions.filter(
      (transition) => transition.event === "NEXT",
    );
    if (nextTransitions.length !== 1) return;

    const result = await this.prepareGateVerdicts(run, state, "NEXT");
    if (!result.success) return;

    const candidateRun = { ...run, gateVerdicts: result.gateVerdicts };
    if (!hasSatisfiedGateVerdicts(state, candidateRun)) {
      await this.deps.store.upsert(candidateRun);
      return;
    }

    const transitioned = await this.transitionRun(
      candidateRun,
      playbook.body,
      "NEXT",
    );
    if (!transitioned.success) {
      await this.deps.store.upsert(candidateRun);
      return;
    }

    const reachedFinalState = playbook.body.finalStates.includes(
      transitioned.currentState,
    );
    await this.deps.store.upsert({
      ...candidateRun,
      currentState: transitioned.currentState,
      completedStates: appendUnique(
        candidateRun.completedStates,
        candidateRun.currentState,
      ),
      gateVerdicts: transitioned.gateVerdicts,
      ...(reachedFinalState
        ? {
            status: "completed" as const,
            completedAt: new Date().toISOString(),
          }
        : {}),
    });
  }

  private hasSatisfiedGateForCurrentState(run: PlaybookRun): boolean {
    return run.gateVerdicts.some(
      (verdict) => verdict.stateId === run.currentState && verdict.met,
    );
  }
}
