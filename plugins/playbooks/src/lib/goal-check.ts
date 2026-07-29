import type { ServicePluginContext } from "@brains/plugins";
import { permissionToVisibilityScope } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { GoalCheck, GoalCheckInput, GoalCheckResult } from "./run-engine";
import {
  playbookRunEvidenceSchema,
  playbookRunSchema,
  type PlaybookRunEvidence,
} from "../run-store";

const goalCheckResultSchema = z
  .object({
    met: z.boolean(),
    reason: z.string().min(1),
  })
  .strict();

const goalCheckTransitionSchema = z
  .object({
    event: z.string().min(1),
    target: z.string().min(1),
    operatorAction: z.boolean().optional(),
    label: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    operatorDescription: z.string().min(1).optional(),
  })
  .strict();

const goalCheckStateSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    instructions: z.array(z.string().min(1)),
    requiredDetails: z.array(z.string().min(1)).default([]),
    doneWhen: z.array(z.string().min(1)).default([]),
    transitions: z.array(goalCheckTransitionSchema).default([]),
  })
  .passthrough();

export const goalCheckInputSchema: z.ZodType<GoalCheckInput> = z
  .object({
    run: playbookRunSchema,
    state: goalCheckStateSchema,
    goal: z.array(z.string().min(1)),
    evidence: z.array(playbookRunEvidenceSchema).default([]),
  })
  .strict();

export function createJudgeGoalCheck(context: ServicePluginContext): GoalCheck {
  return {
    async evaluate(input): Promise<GoalCheckResult> {
      const query = input.goal.join("\n");
      const searchResults = await context.entityService.search({
        query,
        options: {
          limit: 8,
          excludeTypes: ["playbook"],
          visibilityScope: permissionToVisibilityScope("admin"),
        },
      });
      const material = buildGoalCheckMaterial(input, searchResults);
      const { verdict } = await context.judge({
        instruction:
          "Decide whether the playbook goal is satisfied by the supplied current-run runtime evidence and KB excerpts. Current-run runtime evidence is authoritative for playbook completion; use KB excerpts as supporting context, not to override clear runtime evidence from this run. Return met=true only when the outcome clearly holds. If evidence is missing or ambiguous, return met=false with a short reason.",
        material,
        schema: goalCheckResultSchema,
      });
      return verdict;
    },
  };
}

function buildGoalCheckMaterial(
  input: GoalCheckInput,
  searchResults: Array<{
    entity: {
      id: string;
      entityType: string;
      content: string;
      metadata: unknown;
    };
    excerpt: string;
    score: number;
  }>,
): string {
  return [
    "## Playbook run",
    `runId: ${input.run.id}`,
    `playbookId: ${input.run.playbookId}`,
    `currentState: ${input.state.id} (${input.state.title})`,
    "",
    "## State instructions",
    ...input.state.instructions.map((instruction) => `- ${instruction}`),
    "",
    "## Done When goal",
    ...input.goal.map((goal) => `- ${goal}`),
    "",
    "## Runtime evidence",
    ...(input.evidence.length > 0
      ? input.evidence.map((evidence, index) =>
          formatEvidence(index + 1, evidence),
        )
      : ["No runtime evidence collected for this state."]),
    "",
    "## KB excerpts",
    ...(searchResults.length > 0
      ? searchResults.map((result, index) =>
          formatSearchResult(index + 1, result),
        )
      : ["No relevant KB excerpts found."]),
  ].join("\n");
}

function formatEvidence(index: number, evidence: PlaybookRunEvidence): string {
  return `${index}. ${evidence.kind} at ${evidence.observedAt}: ${safeJson(evidence.data)}`;
}

function formatSearchResult(
  index: number,
  result: {
    entity: {
      id: string;
      entityType: string;
      content: string;
      metadata: unknown;
    };
    excerpt: string;
    score: number;
  },
): string {
  return [
    `${index}. ${result.entity.entityType}/${result.entity.id} (score ${result.score})`,
    `Excerpt: ${result.excerpt}`,
    `Content: ${truncate(result.entity.content, 1200)}`,
    `Metadata: ${safeJson(result.entity.metadata)}`,
  ].join("\n");
}

function safeJson(value: unknown): string {
  try {
    return truncate(JSON.stringify(value), 1200);
  } catch {
    return "[unserializable]";
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

export const defaultGoalCheck: GoalCheck = {
  async evaluate() {
    return {
      met: false,
      reason: "No playbook goal check is configured.",
    };
  },
};
