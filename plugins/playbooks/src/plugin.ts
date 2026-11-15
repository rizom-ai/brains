import {
  clipPublicMessage,
  agentActionContract,
  agentContextContract,
  defineBusContract,
  frontmatterRecordFields,
  lifecycleStarterRegistrationContract,
  playbookSeedContract,
  type AgentActionRequest,
  type AgentContextItem,
  type AgentResponse,
  type ActionsCard,
  type BusContract,
} from "@brains/contracts";
import type { EntityOf } from "@brains/sdk/entities";
import {
  SdkError,
  defineServicePlugin,
  z,
  type EntityReader,
  type ServicePackageDefinition,
} from "@brains/sdk/services";
import {
  entityCreatedChannel,
  entityUpdatedChannel,
  firstPartyTool,
  internalFullScope,
  serviceRuntime,
  type ServiceRuntime,
  conversationMessageAddedChannel,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { parseMarkdown } from "@brains/utils/markdown";
import { definedFields } from "@brains/utils/strip-undefined";
import {
  assertValidPlaybookBody,
  parsePlaybookBody,
  playbookEntity,
  playbookFrontmatterSchema,
  type PlaybookBody,
  type PlaybookState,
  type PlaybookTransition,
} from "./entity";
import {
  getBlockedTransitions,
  getState,
  getValidTransitions,
} from "./lib/run-machine";
import { buildInstructions, renderAgentContextItem } from "./lib/render";
import {
  LifecycleStarterRegistry,
  lifecycleConfigSchema,
} from "./lib/lifecycle-starters";

import {
  playbookStatusResponseSchema,
  type PlaybookRunSummary,
  type PlaybookStatusResponse,
  type PlaybookSummary,
} from "./lib/status";

import {
  RunEngine,
  appendUnique,
  errorMessage,
  type GoalCheck,
  type GoalCheckInput,
  type GoalCheckResult,
} from "./lib/run-engine";

export type {
  LifecyclePlaybookConfig,
  LifecyclePlaybookConfigInput,
  LifecycleStartersResponse,
  PlaybookStarter,
} from "./lib/lifecycle-starters";
export type {
  GoalCheck,
  GoalCheckInput,
  GoalCheckResult,
} from "./lib/run-engine";
import {
  PlaybookRunStore,
  playbookRunEvidenceSchema,
  playbookRunSchema,
  type PlaybookRun,
  type PlaybookRunEvidence,
} from "./run-store";

export const PLAYBOOKS_LIFECYCLE_STARTERS = "playbooks:lifecycle-starters";

const playbooksConfigSchema: z.ZodObject<
  {
    lifecycle: z.ZodDefault<
      z.ZodRecord<z.ZodString, typeof lifecycleConfigSchema>
    >;
    triggers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodBoolean>>;
  },
  z.core.$strict
> = z
  .object({
    lifecycle: z.record(z.string(), lifecycleConfigSchema).default({}),
    triggers: z.record(z.string(), z.boolean()).default({}),
  })
  .strict();

export type PlaybooksConfig = z.output<typeof playbooksConfigSchema>;
export type PlaybooksConfigInput = z.input<typeof playbooksConfigSchema>;

const lifecycleStartersRequestSchema: z.ZodObject<
  {
    lifecycle: z.ZodOptional<z.ZodString>;
    interfaceType: z.ZodString;
    userPermissionLevel: z.ZodEnum<{
      admin: "admin";
      trusted: "trusted";
      public: "public";
    }>;
  },
  z.core.$strict
> = z
  .object({
    lifecycle: z.string().min(1).optional(),
    interfaceType: z.string().min(1),
    userPermissionLevel: z.enum(["admin", "trusted", "public"]),
  })
  .strict();

const playbookStarterSchema: z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  playbookId: z.ZodString;
  lifecycle: z.ZodString;
  starterPrompt: z.ZodString;
}> = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  playbookId: z.string(),
  lifecycle: z.string(),
  starterPrompt: z.string(),
});

const lifecycleStartersResponseSchema: z.ZodObject<{
  starters: z.ZodArray<typeof playbookStarterSchema>;
}> = z.object({ starters: z.array(playbookStarterSchema) });

/**
 * The starters a lifecycle offers a caller, on the channel the class
 * answered: `playbooks:lifecycle-starters`.
 */
export const lifecycleStartersContract: BusContract<
  typeof lifecycleStartersRequestSchema,
  typeof lifecycleStartersResponseSchema,
  "request"
> = defineBusContract({
  channel: PLAYBOOKS_LIFECYCLE_STARTERS,
  request: lifecycleStartersRequestSchema,
  response: lifecycleStartersResponseSchema,
  delivery: "request",
});

const playbookEntitySchema: z.ZodObject<
  {
    id: z.ZodString;
    entityType: z.ZodLiteral<"playbook">;
    content: z.ZodString;
    metadata: z.ZodObject<
      {
        title: z.ZodString;
        status: z.ZodEnum<{
          draft: "draft";
          active: "active";
          archived: "archived";
        }>;
        audience: z.ZodEnum<{
          admin: "admin";
          trusted: "trusted";
          public: "public";
        }>;
        trigger: z.ZodOptional<z.ZodString>;
        lifecycle: z.ZodOptional<z.ZodString>;
        once: z.ZodOptional<z.ZodBoolean>;
        starterText: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        starterPrompt: z.ZodOptional<z.ZodString>;
        completionMode: z.ZodEnum<{
          "agent-confirmed": "agent-confirmed";
          manual: "manual";
        }>;
      },
      z.core.$loose
    >;
  },
  z.core.$loose
> = z
  .object({
    id: z.string().min(1),
    entityType: z.literal("playbook"),
    content: z.string().min(1),
    metadata: z
      .object({
        title: z.string().min(1),
        status: z.enum(["draft", "active", "archived"]),
        audience: z.enum(["admin", "trusted", "public"]),
        trigger: z.string().min(1).optional(),
        lifecycle: z.string().min(1).optional(),
        once: z.boolean().optional(),
        starterText: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        starterPrompt: z.string().min(1).optional(),
        completionMode: z.enum(["agent-confirmed", "manual"]),
      })
      .passthrough(),
  })
  .passthrough();

export type PlaybookEntity = z.output<typeof playbookEntitySchema>;
export type PlaybookEntityMetadata = PlaybookEntity["metadata"];

const manageInputSchema = {
  action: z.enum(["status", "start", "send-event"]),
  runId: z.string().min(1).optional(),
  playbookId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The playbook's stable slug/id. REQUIRED for action=start. For action=status, this field is REQUIRED whenever the user's request names a specific playbook; omit only when the user asks for conversation-wide status without naming one.",
    ),
  lifecycle: z.string().min(1).optional(),
  event: z.string().min(1).optional(),
  fromState: z.string().min(1).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
};

const playbookManageInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    runId: z.string().min(1).optional(),
    playbookId: z.string().min(1).optional(),
    lifecycle: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("start"),
    playbookId: z.string().min(1),
    lifecycle: z.string().min(1).optional(),
  }),
  z.object({
    action: z.literal("send-event"),
    runId: z.string().min(1).optional(),
    event: z.string().min(1),
    fromState: z.string().min(1).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  }),
]);

/**
 * A readable answer for input the action union rejects, so the model can
 * correct its call instead of reading a raw Zod issue list.
 */
function formatManageInputError(input: unknown, error: z.ZodError): string {
  const provided = z.looseObject({ action: z.string() }).safeParse(input);
  const issues = error.issues.map((issue) => {
    const field = issue.path.join(".");
    const [key] = issue.path;
    if (
      provided.success &&
      issue.path.length === 1 &&
      typeof key === "string" &&
      provided.data[key] === undefined
    ) {
      return `${field} is required for action=${provided.data.action}`;
    }
    return field ? `${field}: ${issue.message}` : issue.message;
  });
  return `Invalid playbook_manage input: ${issues.join("; ")}.`;
}

export interface ParsedPlaybook {
  entity: PlaybookEntity;
  body: PlaybookBody;
  version: string;
}

export type { PlaybookStatusResponse } from "./lib/status";

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

const goalCheckInputSchema = z
  .object({
    run: playbookRunSchema,
    state: goalCheckStateSchema,
    goal: z.array(z.string().min(1)),
    evidence: z.array(playbookRunEvidenceSchema).default([]),
  })
  .strict();

/** A playbook_manage call's outcome, as the class's handlers answered it. */
type ManageResult =
  | { success: true; data: PlaybookStatusResponse }
  | { success: false; error: string };

/** What the operations read playbooks with, and where they keep runs. */
interface PlaybookOperationsDeps {
  readonly config: PlaybooksConfig;
  readonly store: PlaybookRunStore;
  readonly goalCheck: GoalCheck;
  readonly logger: Logger;
  /** One playbook, read at every visibility, as the runner reads its definition. */
  readonly readPlaybook: (
    playbookId: string,
  ) => Promise<ParsedPlaybook | undefined>;
  /** The public playbooks, as the class listed them. */
  readonly listPlaybooks: () => Promise<ParsedPlaybook[]>;
}

/**
 * Playbook runs: starting, resuming and advancing them, their status, the
 * agent's context and actions, the evidence that moves them on, and the
 * lifecycle starters that offer them. One per package, built once its
 * runtime is reached.
 */
class PlaybookOperations {
  private readonly config: PlaybooksConfig;
  private readonly store: PlaybookRunStore;
  private readonly readPlaybook: PlaybookOperationsDeps["readPlaybook"];
  private readonly readPlaybooks: PlaybookOperationsDeps["listPlaybooks"];
  readonly goalCheck: GoalCheck;
  readonly runs: RunEngine;
  readonly lifecycleStarters: LifecycleStarterRegistry;
  private readonly startLocks = new Map<string, Promise<ManageResult>>();
  private readonly runLocks = new Map<string, Promise<void>>();

  constructor(deps: PlaybookOperationsDeps) {
    this.config = deps.config;
    this.store = deps.store;
    this.goalCheck = deps.goalCheck;
    this.readPlaybook = deps.readPlaybook;
    this.readPlaybooks = deps.listPlaybooks;
    this.runs = new RunEngine({
      store: deps.store,
      goalCheck: deps.goalCheck,
      getPlaybook: (playbookId): Promise<ParsedPlaybook | undefined> =>
        this.getPlaybook(playbookId),
      withRunLock: <T>(
        runId: string,
        operation: () => Promise<T>,
      ): Promise<T> => this.withRunLock(runId, operation),
    });
    this.lifecycleStarters = new LifecycleStarterRegistry({
      logger: deps.logger,
      configuredLifecycle: deps.config.lifecycle,
      triggers: deps.config.triggers,
      findRunByLifecycle: (lifecycle): Promise<PlaybookRun | undefined> =>
        deps.store.findByLifecycle(lifecycle),
      getPlaybook: (playbookId): Promise<ParsedPlaybook | undefined> =>
        this.getPlaybook(playbookId),
      listPlaybooks: (): Promise<ParsedPlaybook[]> => this.listPlaybooks(),
    });
  }

  /** A parsed playbook_manage call, as the class's tool handler ran it. */
  async manage(
    input: z.output<typeof playbookManageInputSchema>,
    conversationId: string | undefined,
  ): Promise<ManageResult> {
    if (input.action === "status") {
      return this.handleStatus(input, conversationId);
    }
    if (input.action === "start") {
      return this.handleStart(input, conversationId);
    }
    return this.handleSendEvent(input, conversationId);
  }

  /** The agent's context for a conversation's active run, if any. */
  async agentContext(conversationId: string): Promise<AgentContextItem[]> {
    const item = await this.buildAgentContextItem(conversationId);
    return item ? [item] : [];
  }

  /** An operator's action on a conversation's run, when it is an admin's. */
  async agentAction(
    request: AgentActionRequest,
  ): Promise<AgentResponse | null> {
    return (await this.handleAgentAction(request)) ?? null;
  }

  private async handleStatus(
    input: {
      runId?: string | undefined;
      playbookId?: string | undefined;
      lifecycle?: string | undefined;
    },
    conversationId: string | undefined,
  ): Promise<ManageResult> {
    try {
      const data = await this.getStatus({
        ...input,
        conversationId,
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  }

  private async handleStart(
    input: { playbookId: string; lifecycle?: string | undefined },
    conversationId: string | undefined,
  ): Promise<ManageResult> {
    const lockKey = conversationId
      ? `${conversationId}:${input.playbookId}`
      : `playbook:${input.playbookId}`;
    return this.withStartLock(lockKey, async () => {
      const playbook = await this.requirePlaybook(input.playbookId);
      assertValidPlaybookBody(playbook.body);
      const lifecycle = playbook.entity.metadata.lifecycle ?? input.lifecycle;
      const existing = conversationId
        ? (await this.store.listActiveByConversation(conversationId)).find(
            (run) => run.playbookId === input.playbookId,
          )
        : await this.store.findActiveByPlaybook(input.playbookId);
      const run = existing
        ? await this.withRunLock(existing.id, async () => {
            const current =
              (await this.store.findById(existing.id)) ?? existing;
            return this.store.upsert({
              ...current,
              status: "active",
              ...(conversationId ? { conversationId } : {}),
              ...(current.startedAt
                ? {}
                : { startedAt: new Date().toISOString() }),
            });
          })
        : await this.runs.createStartedRun({
            playbookId: input.playbookId,
            playbookVersion: playbook.version,
            body: playbook.body,
            lifecycle,
            conversationId,
          });
      // Other runs are this conversation's own, as status reports them.
      const data = await this.getStatus({ runId: run.id, conversationId });
      return { success: true, data };
    });
  }

  private async handleSendEvent(
    input: {
      runId?: string | undefined;
      event: string;
      fromState?: string | undefined;
      context?: Record<string, unknown> | undefined;
    },
    conversationId: string | undefined,
  ): Promise<ManageResult> {
    const run = await this.resolveScopedRunResponse({
      runId: input.runId,
      conversationId,
    });
    if (!run.success) return run;
    const result = await this.sendEventForRun(run.data.id, input.event, {
      context: input.context,
      fromState: input.fromState,
    });
    return result.success
      ? { success: true, data: result.data }
      : { success: false, error: result.error };
  }

  private async withStartLock(
    key: string,
    task: () => Promise<ManageResult>,
  ): Promise<ManageResult> {
    const existing = this.startLocks.get(key);
    if (existing) return existing;

    const pending = task().finally(() => {
      this.startLocks.delete(key);
    });
    this.startLocks.set(key, pending);
    return pending;
  }

  /**
   * Serialize the whole read -> transition -> write cycle per run. The run
   * store only serializes individual writes; without this, the evidence
   * auto-advance path and operator-sent events can interleave their reads and
   * silently overwrite each other's state change.
   */
  private async withRunLock<T>(
    runId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.runLocks.get(runId) ?? Promise.resolve();
    const current = previous.then(task);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.runLocks.set(runId, tail);
    void tail.then(() => {
      if (this.runLocks.get(runId) === tail) {
        this.runLocks.delete(runId);
      }
    });
    return current;
  }

  private async handleAgentAction(
    request: AgentActionRequest,
  ): Promise<AgentResponse | undefined> {
    if (request.userPermissionLevel !== "admin") return undefined;

    const scopedRun = await this.resolveScopedRunResponse({
      conversationId: request.conversationId,
    });
    if (!scopedRun.success) return undefined;

    const args = {
      action: "send-event",
      runId: scopedRun.data.id,
      event: request.action.event,
      ...(request.action.fromState
        ? { fromState: request.action.fromState }
        : {}),
    };
    const result = await this.sendEventForRun(
      scopedRun.data.id,
      request.action.event,
      { fromState: request.action.fromState },
    );
    if (!result.success) {
      return {
        text: `I couldn't continue the playbook: ${result.error}`,
        toolResults: [{ toolName: "playbook_manage", args }],
        usage: zeroUsage(),
      };
    }

    const state = this.getCurrentRunState(result.data);
    return {
      text: formatActionResponseText(state),
      ...(result.data.cards ? { cards: result.data.cards } : {}),
      toolResults: [{ toolName: "playbook_manage", args, data: result.data }],
      usage: zeroUsage(),
    };
  }

  private getCurrentRunState(
    status: PlaybookStatusResponse,
  ): PlaybookState | undefined {
    return status.currentState;
  }

  private async sendEventForRun(
    runId: string,
    event: string,
    options: {
      context?: Record<string, unknown> | undefined;
      fromState?: string | undefined;
    } = {},
  ): Promise<
    | { success: true; data: PlaybookStatusResponse }
    | { success: false; error: string }
  > {
    return this.withRunLock(runId, () =>
      this.sendEventForRunLocked(runId, event, options),
    );
  }

  private async sendEventForRunLocked(
    runId: string,
    event: string,
    options: {
      context?: Record<string, unknown> | undefined;
      fromState?: string | undefined;
    },
  ): Promise<
    | { success: true; data: PlaybookStatusResponse }
    | { success: false; error: string }
  > {
    const run = await this.store.findById(runId);
    if (!run) {
      return { success: false, error: `Playbook run not found: ${runId}` };
    }
    if (options.fromState && options.fromState !== run.currentState) {
      return {
        success: false,
        error: `Stale playbook event '${event}': it was issued from state '${options.fromState}' but the run has advanced to state '${run.currentState}'. Call playbook_manage with action=status and act on the current state.`,
      };
    }
    const playbook = await this.requirePlaybook(run.playbookId);
    if (run.playbookVersion !== playbook.version) {
      return {
        success: false,
        error: `Playbook definition changed for '${run.playbookId}'. Run version ${run.playbookVersion} does not match current version ${playbook.version}.`,
      };
    }
    const sourceState = getState(playbook.body, run.currentState);
    const selectedTransition = sourceState?.transitions.find(
      (transition) => transition.event === event,
    );
    const result = await this.runs.transitionRun(run, playbook.body, event);
    if (!result.success) {
      if (result.gateVerdicts) {
        await this.store.upsert({
          ...run,
          gateVerdicts: result.gateVerdicts,
        });
      }
      return { success: false, error: result.error };
    }

    const reachedFinalState = playbook.body.finalStates.includes(
      result.currentState,
    );
    const nextRun = await this.store.upsert({
      ...run,
      currentState: result.currentState,
      completedStates: appendUnique(run.completedStates, run.currentState),
      gateVerdicts: result.gateVerdicts,
      context: { ...run.context, ...(options.context ?? {}) },
      ...(reachedFinalState
        ? {
            status: "completed" as const,
            completedAt: new Date().toISOString(),
          }
        : {}),
    });
    // Other runs are those of the run's own conversation.
    const data = await this.getStatus({
      runId: nextRun.id,
      conversationId: nextRun.conversationId,
    });
    return {
      success: true,
      data:
        sourceState && selectedTransition?.operatorAction === true
          ? withOperatorActionGuidance(data, sourceState, selectedTransition)
          : data,
    };
  }

  private async listPlaybooks(): Promise<ParsedPlaybook[]> {
    return this.readPlaybooks();
  }

  private async getStatus(input: {
    runId?: string | undefined;
    playbookId?: string | undefined;
    lifecycle?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<PlaybookStatusResponse> {
    const runs = await this.store.list();
    const conversationRuns = input.conversationId
      ? runs.filter((run) => run.conversationId === input.conversationId)
      : [];
    const activeRun = await this.resolveStatusRun(
      input,
      runs,
      conversationRuns,
    );

    if (
      input.conversationId &&
      !activeRun &&
      !input.runId &&
      !input.playbookId &&
      !input.lifecycle
    ) {
      throw new Error(
        `No active or completed playbook run for conversation '${input.conversationId}'.`,
      );
    }

    const playbookId =
      input.playbookId ??
      activeRun?.playbookId ??
      (input.lifecycle
        ? this.config.lifecycle[input.lifecycle]?.playbookId
        : undefined);
    const parsedPlaybook = playbookId
      ? await this.getPlaybook(playbookId)
      : undefined;
    const currentState =
      parsedPlaybook && activeRun
        ? getState(parsedPlaybook.body, activeRun.currentState)
        : undefined;
    const allValidTransitions =
      currentState && activeRun && parsedPlaybook
        ? getValidTransitions(activeRun, parsedPlaybook.body, currentState)
        : (currentState?.transitions ?? []);
    const validEvents = allValidTransitions.filter(
      (transition) => transition.operatorAction !== true,
    );
    const operatorActions = allValidTransitions.filter(
      (transition) => transition.operatorAction === true,
    );
    const blockedEvents =
      currentState && activeRun && parsedPlaybook
        ? getBlockedTransitions(activeRun, parsedPlaybook.body, currentState)
        : [];
    const otherRuns = (input.conversationId ? conversationRuns : runs)
      .filter((run) => run.id !== activeRun?.id)
      .map(summarizeRun);

    const actionsCard =
      activeRun && parsedPlaybook && operatorActions.length > 0
        ? buildPlaybookActionsCard({
            run: activeRun,
            title: parsedPlaybook.entity.metadata.title,
            transitions: operatorActions,
          })
        : undefined;

    return playbookStatusResponseSchema.parse({
      ...(otherRuns.length > 0 ? { otherRuns } : {}),
      ...(activeRun ? { activeRun: sanitizeRunForModelOutput(activeRun) } : {}),
      ...(parsedPlaybook
        ? { playbook: summarizePlaybook(parsedPlaybook) }
        : {}),
      ...(currentState ? { currentState } : {}),
      ...(validEvents.length > 0
        ? { validEvents: eventNames(validEvents) }
        : {}),
      ...(operatorActions.length > 0
        ? { operatorActions: eventNames(operatorActions) }
        : {}),
      ...(blockedEvents.length > 0
        ? { blockedEvents: eventNames(blockedEvents) }
        : {}),
      ...(actionsCard ? { cards: [actionsCard] } : {}),
    });
  }

  /**
   * Resolution precedence: explicit runId, then conversation-scoped lookups
   * (falling back to the latest matching run in the conversation), then
   * global lifecycle/playbookId lookups, which prefer the latest active or
   * offered run over completed ones.
   */
  private async resolveStatusRun(
    input: {
      runId?: string | undefined;
      playbookId?: string | undefined;
      lifecycle?: string | undefined;
      conversationId?: string | undefined;
    },
    runs: PlaybookRun[],
    conversationRuns: PlaybookRun[],
  ): Promise<PlaybookRun | undefined> {
    const activeConversationRuns = conversationRuns.filter(
      (run) => run.status === "active" || run.status === "offered",
    );
    const latestConversationRun = latestRun(
      conversationRuns.filter(
        (run) =>
          (!input.playbookId || run.playbookId === input.playbookId) &&
          (!input.lifecycle || run.lifecycle === input.lifecycle),
      ),
    );

    if (input.runId) {
      return (
        runs.find((run) => run.id === input.runId) ?? latestConversationRun
      );
    }
    if (input.conversationId) {
      if (input.lifecycle) {
        return (
          activeConversationRuns.find(
            (run) => run.lifecycle === input.lifecycle,
          ) ?? latestConversationRun
        );
      }
      if (input.playbookId) {
        return (
          activeConversationRuns.find(
            (run) => run.playbookId === input.playbookId,
          ) ?? latestConversationRun
        );
      }
      if (activeConversationRuns.length > 0) {
        return this.requireScopedRun({ conversationId: input.conversationId });
      }
      return latestConversationRun;
    }
    if (input.lifecycle) {
      return preferActiveRun(runs, (run) => run.lifecycle === input.lifecycle);
    }
    if (input.playbookId) {
      return preferActiveRun(
        runs,
        (run) => run.playbookId === input.playbookId,
      );
    }
    return undefined;
  }

  private async getPlaybook(
    playbookId: string,
  ): Promise<ParsedPlaybook | undefined> {
    return this.readPlaybook(playbookId);
  }

  private async requirePlaybook(playbookId: string): Promise<ParsedPlaybook> {
    const playbook = await this.getPlaybook(playbookId);
    if (!playbook) throw new Error(`Playbook not found: ${playbookId}`);
    return playbook;
  }

  private async requireRun(runId: string): Promise<PlaybookRun> {
    const run = await this.store.findById(runId);
    if (!run) throw new Error(`Playbook run not found: ${runId}`);
    return run;
  }

  private async resolveScopedRunResponse(input: {
    runId?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<
    { success: true; data: PlaybookRun } | { success: false; error: string }
  > {
    try {
      return { success: true, data: await this.requireScopedRun(input) };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  }

  private async requireScopedRun(input: {
    runId?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<PlaybookRun> {
    if (input.runId) return this.requireRun(input.runId);
    const conversationId = input.conversationId;
    if (!conversationId) {
      throw new Error("Missing runId and no active conversation id.");
    }
    const runs = await this.store.listActiveByConversation(conversationId);
    if (runs.length === 0) {
      throw new Error(
        `No active playbook run for conversation '${conversationId}'.`,
      );
    }
    if (runs.length > 1) {
      throw new Error(
        `Multiple active playbook runs for conversation '${conversationId}'. Provide runId explicitly.`,
      );
    }
    const run = runs[0];
    if (!run) {
      throw new Error(
        `No active playbook run for conversation '${conversationId}'.`,
      );
    }
    return run;
  }

  private async buildAgentContextItem(
    conversationId: string,
  ): Promise<AgentContextItem | undefined> {
    const run = await this.store.findActiveByConversation(conversationId);
    if (!run) return undefined;
    const playbook = await this.getPlaybook(run.playbookId);
    if (!playbook) return undefined;
    const state = getState(playbook.body, run.currentState);
    if (!state) return undefined;

    return renderAgentContextItem({
      run,
      body: playbook.body,
      state,
      playbookTitle: playbook.entity.metadata.title,
    });
  }
}

/** A reference to the definition; the engine keeps the full source. */
function summarizePlaybook(playbook: ParsedPlaybook): PlaybookSummary {
  const initialState = getState(playbook.body, playbook.body.initialState);
  return {
    id: playbook.entity.id,
    entityType: "playbook",
    title: playbook.entity.metadata.title,
    status: playbook.entity.metadata.status,
    audience: playbook.entity.metadata.audience,
    version: playbook.version,
    ...(initialState
      ? { initialState: { id: initialState.id, title: initialState.title } }
      : {}),
  };
}

function withOperatorActionGuidance(
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
  return { ...status, guidance: actionGuidance };
}

/** Event names, once each; the transitions themselves live in currentState. */
function eventNames(transitions: PlaybookTransition[]): string[] {
  return [...new Set(transitions.map((transition) => transition.event))];
}

function summarizeRun(run: PlaybookRun): PlaybookRunSummary {
  return {
    id: run.id,
    playbookId: run.playbookId,
    currentState: run.currentState,
    status: run.status,
  };
}

/** The run without its unread XState snapshot, with evidence reduced to references. */
function sanitizeRunForModelOutput({
  snapshot: _snapshot,
  ...run
}: PlaybookRun): PlaybookRun {
  return {
    ...run,
    evidence: run.evidence.map((evidence) => ({
      ...evidence,
      data: sanitizeEvidenceData(evidence.data),
    })),
  };
}

function sanitizeEvidenceData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    ["entityType", "entityId", "operation", "messageId"].flatMap((key) =>
      data[key] !== undefined ? [[key, data[key]]] : [],
    ),
  );
}

function buildPlaybookActionsCard(input: {
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

function formatActionResponseText(state: PlaybookState | undefined): string {
  if (!state) return "Continuing.";
  return state.prompt ?? `Continuing to ${state.title}.`;
}

function zeroUsage(): AgentResponse["usage"] {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function preferActiveRun(
  runs: PlaybookRun[],
  predicate: (run: PlaybookRun) => boolean,
): PlaybookRun | undefined {
  const matching = runs.filter(predicate);
  const active = matching.filter(
    (run) => run.status === "active" || run.status === "offered",
  );
  return latestRun(active) ?? latestRun(matching);
}

function latestRun(runs: PlaybookRun[]): PlaybookRun | undefined {
  return [...runs].sort((a, b) =>
    (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt),
  )[0];
}

function createJudgeGoalCheck(
  runtime: Pick<ServiceRuntime, "ai" | "entityReads">,
): GoalCheck {
  return {
    async evaluate(input): Promise<GoalCheckResult> {
      const query = input.goal.join("\n");
      const searchResults = await runtime.entityReads.search({
        query,
        options: {
          limit: 8,
          excludeTypes: ["playbook"],
          visibilityScope: internalFullScope(
            "goal check judges the whole brain",
          ),
        },
      });
      const material = buildGoalCheckMaterial(input, searchResults);
      const { verdict } = await runtime.ai.judge({
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
  if (evidence.kind === "assistant_reply") {
    const retrieved = Array.isArray(evidence.data["retrieved"])
      ? safeJson(evidence.data["retrieved"])
      : "[]";
    const reply =
      typeof evidence.data["reply"] === "string" ? evidence.data["reply"] : "";
    return [
      `${index}. assistant_reply at ${evidence.observedAt}: the saved reply of a turn in this step. It proves only what its text shows; saved changes need entity_event evidence.`,
      `Entities this turn read: ${retrieved}`,
      "Reply:",
      reply,
    ].join("\n");
  }
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

/** What a test hands the package in place of the brain's judge. */
export interface PlaybooksPackageDeps {
  goalCheck?: GoalCheck | undefined;
}

const PLAYBOOK_MANAGE_DESCRIPTION =
  "Named status rule: action=status MUST include playbookId whenever the user's request names a specific playbook; for example, an onboarding playbook status request requires playbookId=onboarding. Omit playbookId only for a conversation-wide status request that names no playbook. Manage playbook runs with an action discriminator: status gets compact lifecycle/run state, start starts or resumes a run, and send-event advances a run with a valid event. Use action=status whenever the user asks for a playbook's status, lifecycle, run state, current step, or valid events, even if you believe no run is active or the playbook is unavailable; use the tool to verify instead of answering from memory. After meaningful tool actions, use the reported current state as source of truth. Do not send an extra NEXT after runtime evidence already advanced the run. Do not claim the playbook is finished unless the run has reached a final state. For send-event, always pass fromState set to the current state id you are acting on. For the full authored workflow, use system_get with entityType=playbook and the returned playbook.id.";

/** One stored playbook, parsed, or none when its record is not a playbook. */
function parsedPlaybook(
  record: EntityOf<typeof playbookEntity>,
): ParsedPlaybook | undefined {
  // As a declared type reads it, the body and its metadata; as a whole
  // document, its frontmatter.
  const { fields, body } = frontmatterRecordFields(record);
  const metadata = playbookFrontmatterSchema.safeParse(fields);
  if (!metadata.success) return undefined;
  const entity = playbookEntitySchema.safeParse({
    id: record.id,
    entityType: "playbook",
    content: body,
    metadata: definedFields(metadata.data),
  });
  if (!entity.success) return undefined;
  return {
    entity: entity.data,
    body: parsePlaybookBody(body),
    // The stored document's hash, which a run pins as the class did.
    version: record.contentHash,
  };
}

/**
 * The playbooks package: the playbook type, which it stewards, and the
 * runs that walk one, through the playbook_manage tool, the agent's
 * context and actions, and the evidence the conversation and the brain's
 * entities give. A test may hand it a goal check in place of the brain's
 * judge.
 */
export function createPlaybooksPackage(
  deps: PlaybooksPackageDeps = {},
): ServicePackageDefinition<typeof playbooksConfigSchema> {
  return defineServicePlugin(
    {
      id: "playbooks",
      config: playbooksConfigSchema,
      entities: [playbookEntity],
      // One set of runs and locks per package, built once its runtime is
      // reached: every slot shares it.
      setup: ({ config }) => {
        let operations: PlaybookOperations | undefined;
        return {
          operations: (
            runtime: ServiceRuntime,
            entities: EntityReader,
          ): PlaybookOperations => {
            operations ??= new PlaybookOperations({
              config,
              store: new PlaybookRunStore(runtime.classRuntimeState),
              goalCheck: deps.goalCheck ?? createJudgeGoalCheck(runtime),
              logger: runtime.logger,
              readPlaybook: async (
                playbookId,
              ): Promise<ParsedPlaybook | undefined> => {
                const record = await entities.get(playbookEntity, playbookId);
                return record ? parsedPlaybook(record) : undefined;
              },
              // The public playbooks, as the class listed them.
              listPlaybooks: async (): Promise<ParsedPlaybook[]> =>
                (await entities.list(playbookEntity)).flatMap((record) => {
                  if (record.visibility !== "public") return [];
                  const playbook = parsedPlaybook(record);
                  return playbook ? [playbook] : [];
                }),
            });
            return operations;
          },
        };
      },
    },
    {
      instructions: ({ config }) => buildInstructions(config.lifecycle),
      subscriptions: (context) => {
        const runtime = serviceRuntime(context);
        const { entities } = context;
        const playbooks = context.state.operations(runtime, entities);

        runtime.evalHandler("goalCheck", async (input) =>
          playbooks.goalCheck.evaluate(goalCheckInputSchema.parse(input)),
        );

        // Another package plants a playbook it bundles through the type's
        // steward: only where none with that id exists at any visibility, so
        // a seed never overwrites what an owner wrote.
        runtime.answer(playbookSeedContract, async ({ request }) => {
          // Any stored record with the id, as the class looked: one whose
          // metadata no longer validates is still the owner's.
          const existing = await runtime.entityReads.getEntity({
            entityType: playbookEntity.type,
            id: request.id,
            visibilityScope: internalFullScope(
              "bundled playbook seed existence check",
            ),
          });
          if (existing) return { created: false };
          // Written as the type writes any document: its frontmatter with
          // its defaults stated, then its body, as the adapter stored it.
          const document = parseMarkdown(request.markdown);
          await entities.create(playbookEntity, {
            id: request.id,
            content: document.content,
            metadata: playbookFrontmatterSchema.parse(document.frontmatter),
          });
          return { created: true };
        });
        runtime.answer(
          lifecycleStarterRegistrationContract,
          async ({ request, sender }) =>
            playbooks.lifecycleStarters.register(request, sender),
        );
        runtime.answer(lifecycleStartersContract, async ({ request }) => ({
          starters: await playbooks.lifecycleStarters.resolveStarters(request),
        }));
        runtime.answer(agentContextContract, async ({ request }) => ({
          items: await playbooks.agentContext(request.conversationId),
        }));
        runtime.answer(agentActionContract, async ({ request }) =>
          playbooks.agentAction(request),
        );

        runtime.listen(
          conversationMessageAddedChannel,
          async ({ payload, sender }) => {
            await playbooks.runs.recordAssistantReplyEvidence(sender, payload);
          },
        );
        // Observed: an entity the worker writes for a run is evidence too.
        runtime.listen(
          entityCreatedChannel,
          async ({ payload }) => {
            await playbooks.runs.recordEntityEventEvidence("created", payload);
          },
          { mode: "observe" },
        );
        runtime.listen(
          entityUpdatedChannel,
          async ({ payload }) => {
            await playbooks.runs.recordEntityEventEvidence("updated", payload);
          },
          { mode: "observe" },
        );
        return [];
      },
      tools: (context) => {
        const runtime = serviceRuntime(context);
        const playbooks = context.state.operations(runtime, context.entities);
        return [
          firstPartyTool(
            {
              name: "playbook_manage",
              description: PLAYBOOK_MANAGE_DESCRIPTION,
              input: z.object(manageInputSchema),
              output: playbookStatusResponseSchema,
              permission: "admin",
              sideEffects: "writes",
              execute: async ({ input }) => {
                const parsed = playbookManageInputSchema.safeParse(input);
                if (!parsed.success) {
                  throw new SdkError("invalid_input", {
                    publicMessage: clipPublicMessage(
                      formatManageInputError(input, parsed.error),
                    ),
                  });
                }
                const result = await playbooks
                  .manage(parsed.data, runtime.toolCall()?.conversationId)
                  .catch((error: unknown): ManageResult => ({
                    success: false,
                    error: errorMessage(error),
                  }));
                if (!result.success) {
                  // The class answered the reason, which the agent acts on.
                  throw new SdkError("handler_failed", {
                    publicMessage: clipPublicMessage(result.error),
                  });
                }
                return result.data;
              },
            },
            { bareName: true },
          ),
        ];
      },
    },
  );
}

const playbooksPackage: ServicePackageDefinition<typeof playbooksConfigSchema> =
  createPlaybooksPackage();

export default playbooksPackage;
