import {
  AGENT_ACTION_REQUEST_CHANNEL,
  AGENT_CONTEXT_REQUEST_CHANNEL,
  ENTITY_CHANNELS,
  PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
  agentActionRequestSchema,
  agentContextRequestSchema,
  lifecycleStarterRegistrationSchema,
  type AgentActionRequest,
  type AgentContextItem,
  type AgentResponse,
  type ActionsCard,
} from "@brains/contracts";
import {
  assertValidPlaybookBody,
  parsePlaybookBody,
  playbookEntity,
  type PlaybookBody,
  type PlaybookState,
  type PlaybookTransition,
} from "./entity";
import {
  defineServicePlugin,
  defineSubscription,
  defineTool,
  z,
  type AnyServiceToolDefinition,
  type ServiceCorpusHit,
  type ServiceCorpusSearch,
  type ServiceJudge,
  type ServicePackageDefinition,
  type ToolContext,
} from "@brains/sdk/services";
import type { LoggerContract } from "@brains/utils/logger";

import type { EntityReads } from "@brains/sdk/entities";

import { computeContentHash } from "@brains/utils/hash";
import {
  getBlockedTransitions,
  getState,
  getValidTransitions,
} from "./lib/run-machine";
import {
  buildInstructions,
  buildStateGuidance,
  renderAgentContextItem,
} from "./lib/render";
import {
  LifecycleStarterRegistry,
  lifecycleConfigSchema,
  type LifecyclePlaybookConfig,
} from "./lib/lifecycle-starters";

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
  LifecycleStarterRegistrationResponse,
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

export interface LifecyclePlaybookConfigInput {
  trigger: string;
  playbookId: string;
  once?: boolean | undefined;
  starterText: string;
  description?: string | undefined;
  starterPrompt: string;
}

export interface PlaybooksConfig {
  lifecycle: Record<string, LifecyclePlaybookConfig>;
  triggers: Record<string, boolean>;
}

export interface PlaybooksConfigInput {
  lifecycle?: Record<string, LifecyclePlaybookConfigInput> | undefined;
  triggers?: Record<string, boolean> | undefined;
}

interface LifecycleStartersRequest {
  lifecycle?: string | undefined;
  interfaceType: string;
  userPermissionLevel: "admin" | "trusted" | "public";
}

export interface PlaybookEntityMetadata extends Record<string, unknown> {
  title: string;
  status: "draft" | "active" | "archived";
  audience: "admin" | "trusted" | "public";
  trigger?: string | undefined;
  lifecycle?: string | undefined;
  once?: boolean | undefined;
  starterText?: string | undefined;
  description?: string | undefined;
  starterPrompt?: string | undefined;
  completionMode: "agent-confirmed" | "manual";
}

export interface PlaybookEntity extends Record<string, unknown> {
  id: string;
  entityType: "playbook";
  content: string;
  metadata: PlaybookEntityMetadata;
}

const playbooksConfigSchema: z.ZodType<PlaybooksConfig, PlaybooksConfigInput> =
  z
    .object({
      lifecycle: z.record(z.string(), lifecycleConfigSchema).default({}),
      triggers: z.record(z.string(), z.boolean()).default({}),
    })
    .strict();

const lifecycleStartersRequestSchema: z.ZodType<
  LifecycleStartersRequest,
  LifecycleStartersRequest
> = z
  .object({
    lifecycle: z.string().min(1).optional(),
    interfaceType: z.string().min(1),
    userPermissionLevel: z.enum(["admin", "trusted", "public"]),
  })
  .strict();

const playbookEntitySchema: z.ZodType<PlaybookEntity, unknown> = z
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

const manageInputSchema = {
  action: z.enum(["status", "start", "send-event"]),
  runId: z.string().min(1).optional(),
  playbookId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "For action=status, this field is REQUIRED whenever the user's request names a specific playbook. Pass that playbook's stable slug/id; omit only when the user asks for conversation-wide status without naming one.",
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

export interface ParsedPlaybook {
  entity: PlaybookEntity;
  body: PlaybookBody;
  version: string;
}

export interface PlaybookStatusResponse {
  runs: PlaybookRun[];
  activeRun?: PlaybookRun | undefined;
  playbook?: PlaybookEntity | undefined;
  body?: PlaybookBody | undefined;
  currentState?: PlaybookState | undefined;
  validEvents?: PlaybookTransition[] | undefined;
  operatorActions?: PlaybookTransition[] | undefined;
  blockedEvents?: PlaybookTransition[] | undefined;
  guidance?: string | undefined;
  cards?: ActionsCard[] | undefined;
  lifecycle: Record<string, LifecyclePlaybookConfig>;
}

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

/**
 * What one management call answers with.
 *
 * Its own type rather than the runtime's `ToolResponse`: these handlers ran
 * inside the tool when the tool was hand-registered, and the runtime's
 * response shape also carries confirmations, which none of them produce.
 */
export type ManageResult =
  | { success: true; data: PlaybookStatusResponse }
  | { success: false; error: string };

/** The two reads the package makes of its own type. */
export type PlaybookEntityReader = EntityReads;

export interface PlaybookOperationsDeps {
  readonly config: PlaybooksConfig;
  readonly logger: LoggerContract;
  readonly entities: PlaybookEntityReader;
  readonly runs: PlaybookRunStore;
  /** Replaced in tests, where a real model call would be the thing measured. */
  readonly goalCheck: GoalCheck;
}

/**
 * Everything the playbooks package does, minus how it is registered.
 *
 * This was the plugin class. What it holds — a run store, a run engine, the
 * per-run locks — is state that outlives any one call, and separating it
 * from the declaration is what lets the declaration stay a description of
 * surfaces rather than a place work happens.
 */
export class PlaybookOperations {
  private readonly config: PlaybooksConfig;
  private readonly logger: LoggerContract;
  private readonly entities: PlaybookEntityReader;
  private readonly store: PlaybookRunStore;
  private readonly goalCheck: GoalCheck;
  private readonly startLocks = new Map<string, Promise<ManageResult>>();
  private readonly runLocks = new Map<string, Promise<void>>();
  public readonly lifecycleStarters: LifecycleStarterRegistry;
  public readonly runs: RunEngine;

  constructor(deps: PlaybookOperationsDeps) {
    this.config = deps.config;
    this.logger = deps.logger;
    this.entities = deps.entities;
    this.goalCheck = deps.goalCheck;
    this.store = deps.runs;
    this.runs = new RunEngine({
      store: this.store,
      goalCheck: this.goalCheck,
      getPlaybook: (playbookId): Promise<ParsedPlaybook | undefined> =>
        this.getPlaybook(playbookId),
      withRunLock: <T>(
        runId: string,
        operation: () => Promise<T>,
      ): Promise<T> => this.withRunLock(runId, operation),
    });
    this.lifecycleStarters = new LifecycleStarterRegistry({
      logger: this.logger,
      configuredLifecycle: this.config.lifecycle,
      triggers: this.config.triggers,
      findRunByLifecycle: (lifecycle): Promise<PlaybookRun | undefined> =>
        this.store.findByLifecycle(lifecycle),
      getPlaybook: (playbookId): Promise<ParsedPlaybook | undefined> =>
        this.getPlaybook(playbookId),
      listPlaybooks: (): Promise<ParsedPlaybook[]> => this.listPlaybooks(),
    });
  }

  public async evaluateGoal(input: unknown): Promise<GoalCheckResult> {
    return this.goalCheck.evaluate(goalCheckInputSchema.parse(input));
  }

  public async manage(
    input: unknown,
    toolContext: ToolContext,
  ): Promise<ManageResult> {
    const parsed = playbookManageInputSchema.parse(input);
    if (parsed.action === "status") {
      return this.handleStatus(parsed, toolContext);
    }
    if (parsed.action === "start") {
      return this.handleStart(parsed, toolContext);
    }
    return this.handleSendEvent(parsed, toolContext);
  }

  private async handleStatus(
    input: {
      runId?: string | undefined;
      playbookId?: string | undefined;
      lifecycle?: string | undefined;
    },
    toolContext: ToolContext,
  ): Promise<ManageResult> {
    try {
      const data = await this.getStatus({
        ...input,
        conversationId: toolContext.conversationId,
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  }

  private async handleStart(
    input: { playbookId: string; lifecycle?: string | undefined },
    toolContext: ToolContext,
  ): Promise<ManageResult> {
    const conversationId = toolContext.conversationId;
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
      const data = await this.getStatus({ runId: run.id });
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
    toolContext: ToolContext,
  ): Promise<ManageResult> {
    const run = await this.resolveScopedRunResponse({
      runId: input.runId,
      conversationId: toolContext.conversationId,
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

  public async handleAgentAction(
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
        toolResults: [{ toolName: "playbooks_manage", args }],
        usage: zeroUsage(),
      };
    }

    const state = this.getCurrentRunState(result.data);
    return {
      text: formatActionResponseText(state),
      ...(result.data.cards ? { cards: result.data.cards } : {}),
      toolResults: [{ toolName: "playbooks_manage", args, data: result.data }],
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
        error: `Stale playbook event '${event}': it was issued from state '${options.fromState}' but the run has advanced to state '${run.currentState}'. Call playbooks_manage with action=status and act on the current state.`,
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
    const data = await this.getStatus({ runId: nextRun.id });
    return {
      success: true,
      data:
        sourceState && selectedTransition?.operatorAction === true
          ? withOperatorActionGuidance(data, sourceState, selectedTransition)
          : data,
    };
  }

  private async listPlaybooks(): Promise<ParsedPlaybook[]> {
    // Read wide and parse below: `playbookEntitySchema` describes the subset
    // this plugin cares about, not a whole entity, so it cannot stand as the
    // read's proof — the `safeParse` that follows is where it belongs.
    const entities = await this.entities.listEntities({
      entityType: "playbook",
    });

    return entities.flatMap((entity): ParsedPlaybook[] => {
      const parsed = playbookEntitySchema.safeParse(entity);
      if (!parsed.success) return [];
      const body = parsePlaybookBody(parsed.data.content);
      return [
        {
          entity: parsed.data,
          body,
          version: computeContentHash(parsed.data.content),
        },
      ];
    });
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
    const guidance =
      currentState && activeRun && parsedPlaybook
        ? buildStateGuidance(activeRun, parsedPlaybook.body, currentState)
        : undefined;

    const actionsCard =
      activeRun && parsedPlaybook && operatorActions.length > 0
        ? buildPlaybookActionsCard({
            run: activeRun,
            title: parsedPlaybook.entity.metadata.title,
            transitions: operatorActions,
          })
        : undefined;

    return {
      runs: (input.conversationId ? conversationRuns : runs).map(
        sanitizeRunForModelOutput,
      ),
      ...(activeRun ? { activeRun: sanitizeRunForModelOutput(activeRun) } : {}),
      ...(parsedPlaybook ? { playbook: parsedPlaybook.entity } : {}),
      ...(parsedPlaybook ? { body: parsedPlaybook.body } : {}),
      ...(currentState ? { currentState } : {}),
      ...(validEvents.length > 0 ? { validEvents } : {}),
      ...(operatorActions.length > 0 ? { operatorActions } : {}),
      ...(blockedEvents.length > 0 ? { blockedEvents } : {}),
      ...(guidance ? { guidance } : {}),
      ...(actionsCard ? { cards: [actionsCard] } : {}),
      lifecycle: this.config.lifecycle,
    };
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
    const entity = await this.entities.getEntity({
      entityType: "playbook",
      id: playbookId,
    });
    const parsed = playbookEntitySchema.safeParse(entity);
    if (!parsed.success) return undefined;
    const body = parsePlaybookBody(parsed.data.content);
    return {
      entity: parsed.data,
      body,
      version: computeContentHash(parsed.data.content),
    };
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

  public async buildAgentContextItem(
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
  return {
    ...status,
    guidance: status.guidance
      ? `${actionGuidance}\n\n${status.guidance}`
      : actionGuidance,
  };
}

function sanitizeRunForModelOutput(run: PlaybookRun): PlaybookRun {
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
    ["entityType", "entityId", "operation"].flatMap((key) =>
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

/**
 * Whether a run's stated outcome actually holds.
 *
 * The evidence is what the brain recorded, not what the agent said it did —
 * which is why this searches the corpus rather than reading the run. A
 * playbook is excluded from its own evidence: finding the document that
 * states the goal is not finding the goal met.
 */
function createJudgeGoalCheck(context: {
  corpus: ServiceCorpusSearch;
  judge: ServiceJudge;
}): GoalCheck {
  return {
    async evaluate(input): Promise<GoalCheckResult> {
      const searchResults = await context.corpus.search({
        query: input.goal.join("\n"),
        limit: 8,
        excludeTypes: ["playbook"],
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
  searchResults: readonly ServiceCorpusHit[],
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

function formatSearchResult(index: number, result: ServiceCorpusHit): string {
  return [
    `${index}. ${result.entityType}/${result.id} (score ${result.score})`,
    `Excerpt: ${result.excerpt}`,
    `Content: ${truncate(result.content, 1200)}`,
    `Metadata: ${safeJson(result.metadata)}`,
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

export const playbookManageTool = (
  operations: PlaybookOperations,
): AnyServiceToolDefinition =>
  defineTool({
    name: "manage",
    description:
      "Named status rule: action=status MUST include playbookId whenever the user's request names a specific playbook; for example, an onboarding playbook status request requires playbookId=onboarding. Omit playbookId only for a conversation-wide status request that names no playbook. Manage playbook runs with an action discriminator: status gets compact lifecycle/run state, start starts or resumes a run, and send-event advances a run with a valid event. Use action=status whenever the user asks for a playbook's status, lifecycle, run state, current step, or valid events, even if you believe no run is active or the playbook is unavailable; use the tool to verify instead of answering from memory. After meaningful tool actions, use the reported current state as source of truth. Do not send an extra NEXT after runtime evidence already advanced the run. Do not claim the playbook is finished unless the run has reached a final state. For send-event, always pass fromState set to the current state id you are acting on.",
    input: z.object(manageInputSchema),
    output: z.unknown(),
    permission: "admin",
    sideEffects: "writes",
    execute: async ({ input, caller }) => {
      // A run belongs to a conversation, and which conversation is a fact
      // about the caller — so an unattributed call has nothing to manage.
      if (!caller) throw new Error("Playbook management requires a caller");
      const answer = await operations.manage(input, caller);
      if (!answer.success) throw new Error(answer.error);
      return answer.data;
    },
  });

/**
 * Playbooks, as one declaration.
 *
 * The class this replaces did its own registration in `onRegister`: six bus
 * subscriptions, an eval handler, agent instructions, and a tool, all
 * threaded through a context it held. Declared, the registration is the
 * runtime's and what stays here is the engine those surfaces call.
 */
const playbooksPackage: ServicePackageDefinition<typeof playbooksConfigSchema> =
  defineServicePlugin({
    id: "playbooks",
    config: playbooksConfigSchema,
    entities: [playbookEntity],

    // The goal check is the reason this package needs the corpus and the
    // model: deciding whether a run's stated outcome holds means looking for
    // evidence of it and putting that evidence to a judge.
    setup: ({ config, logger, entities, state, corpus, judge }) =>
      new PlaybookOperations({
        config,
        logger,
        entities,
        runs: new PlaybookRunStore(state),
        goalCheck: createJudgeGoalCheck({ corpus, judge }),
      }),

    instructions: ({ config }) => buildInstructions(config.lifecycle),

    evals: ({ state }) => ({
      goalCheck: async (payload: unknown) => state.evaluateGoal(payload),
    }),

    tools: ({ state }) => [playbookManageTool(state)],

    subscriptions: ({ state }) => [
      defineSubscription({
        topic: PLAYBOOKS_LIFECYCLE_STARTERS,
        payload: lifecycleStartersRequestSchema,
        handle: async ({ payload }) => ({
          starters: await state.lifecycleStarters.resolveStarters(payload),
        }),
      }),
      defineSubscription({
        topic: PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
        payload: lifecycleStarterRegistrationSchema,
        handle: async ({ payload, source }) =>
          state.lifecycleStarters.register(payload, source),
      }),
      defineSubscription({
        topic: AGENT_CONTEXT_REQUEST_CHANNEL,
        payload: agentContextRequestSchema,
        handle: async ({ payload }) => {
          const item = await state.buildAgentContextItem(
            payload.conversationId,
          );
          return { items: item ? [item] : [] };
        },
      }),
      defineSubscription({
        topic: AGENT_ACTION_REQUEST_CHANNEL,
        payload: agentActionRequestSchema,
        handle: async ({ payload }) => state.handleAgentAction(payload),
      }),
      // A playbook advances on what actually happened, not on the agent
      // saying it happened, so entity writes are evidence.
      defineSubscription({
        topic: ENTITY_CHANNELS.created,
        payload: z.record(z.string(), z.unknown()),
        handle: async ({ payload }) =>
          state.runs.recordEntityEventEvidence("created", payload),
      }),
      defineSubscription({
        topic: ENTITY_CHANNELS.updated,
        payload: z.record(z.string(), z.unknown()),
        handle: async ({ payload }) =>
          state.runs.recordEntityEventEvidence("updated", payload),
      }),
    ],
  });

export default playbooksPackage;
