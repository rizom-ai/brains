import type { ActionsCard, AgentResponse } from "@brains/contracts";
import type { PlaybookState, PlaybookTransition } from "../entity";
import type { PlaybookRun } from "../run-store";
import type { PlaybookStatusResponse } from "./contracts";

export function withOperatorActionGuidance(
  status: PlaybookStatusResponse,
  sourceState: PlaybookState,
  transition: PlaybookTransition,
): PlaybookStatusResponse {
  const sourceInstructions = sourceState.instructions
    .map((instruction) => `- ${instruction}`)
    .join("\n");
  const actionGuidance = [
    `Selected operator action: ${transition.label ?? transition.event}`,
    `Source state: ${sourceState.title}`,
    "Complete any domain work requested by the selected action or same user message before final answering.",
    "Source-state instructions for the selected action:",
    sourceInstructions || "- none",
  ].join("\n");
  return {
    ...status,
    guidance: status.guidance
      ? `${actionGuidance}\n\n${status.guidance}`
      : actionGuidance,
  };
}

export function sanitizeRunForModelOutput(run: PlaybookRun): PlaybookRun {
  return {
    ...run,
    evidence: run.evidence.map((evidence) => ({
      ...evidence,
      data: sanitizeEvidenceData(evidence.data),
    })),
  };
}

export function sanitizeEvidenceData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    ["entityType", "entityId", "operation"].flatMap((key) =>
      data[key] !== undefined ? [[key, data[key]]] : [],
    ),
  );
}

export function buildPlaybookActionsCard(input: {
  run: PlaybookRun;
  title: string;
  transitions: PlaybookTransition[];
}): ActionsCard {
  return {
    kind: "actions",
    id: `actions:playbook:${input.run.id}`,
    title: input.title,
    defaultOpen: true,
    actions: input.transitions.map((transition) => ({
      type: "event",
      id: `playbook:${input.run.id}:${transition.event}`,
      label:
        transition.label ??
        transition.operatorDescription ??
        transition.description ??
        transition.event,
      event: transition.event,
      fromState: input.run.currentState,
      ...((transition.operatorDescription ?? transition.description)
        ? {
            description:
              transition.operatorDescription ?? transition.description,
          }
        : {}),
    })),
  };
}

export function formatActionResponseText(
  state: PlaybookState | undefined,
): string {
  if (!state) return "Continuing.";
  return state.prompt ?? `Continuing to ${state.title}.`;
}

export function zeroUsage(): AgentResponse["usage"] {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export function preferActiveRun(
  runs: PlaybookRun[],
  predicate: (run: PlaybookRun) => boolean,
): PlaybookRun | undefined {
  const matching = runs.filter(predicate);
  const active = matching.filter(
    (run) => run.status === "active" || run.status === "offered",
  );
  return latestRun(active) ?? latestRun(matching);
}

export function latestRun(runs: PlaybookRun[]): PlaybookRun | undefined {
  return [...runs].sort((a, b) =>
    (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt),
  )[0];
}
