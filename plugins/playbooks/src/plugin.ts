import {
  AGENT_ACTION_REQUEST_CHANNEL,
  AGENT_CONTEXT_REQUEST_CHANNEL,
  PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
  agentActionRequestSchema,
  agentContextRequestSchema,
  lifecycleStarterRegistrationSchema,
  type AgentActionRequest,
  type AgentContextItem,
  type AgentContextResponse,
  type AgentResponse,
  type ActionsCard,
  type LifecycleStarterRegistration,
} from "@brains/contracts";
import {
  assertValidPlaybookBody,
  playbookAdapter,
  type PlaybookBody,
  type PlaybookEntity as RegisteredPlaybookEntity,
  type PlaybookState,
  type PlaybookTransition,
} from "./entity";
import type {
  ServicePluginContext,
  Tool,
  ToolContext,
  ToolResponse,
} from "@brains/plugins";
import { ServicePlugin, permissionToVisibilityScope } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { computeContentHash } from "@brains/utils/hash";
import packageJson from "../package.json";
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
  type LifecycleStarterRegistrationResponse,
  type LifecycleStartersResponse,
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
  userPermissionLevel: "anchor" | "trusted" | "public";
}

export interface PlaybookEntityMetadata extends Record<string, unknown> {
  title: string;
  status: "draft" | "active" | "archived";
  audience: "anchor" | "trusted" | "public";
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
    userPermissionLevel: z.enum(["anchor", "trusted", "public"]),
  })
  .strict();

const playbookEntitySchema: z.ZodType<PlaybookEntity> = z
  .object({
    id: z.string().min(1),
    entityType: z.literal("playbook"),
    content: z.string().min(1),
    metadata: z
      .object({
        title: z.string().min(1),
        status: z.enum(["draft", "active", "archived"]),
        audience: z.enum(["anchor", "trusted", "public"]),
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

const statusInputSchema = {
  runId: z.string().min(1).optional(),
  playbookId: z.string().min(1).optional(),
  lifecycle: z.string().min(1).optional(),
};

const startInputSchema = {
  playbookId: z.string().min(1),
  lifecycle: z.string().min(1).optional(),
};

const sendEventInputSchema = {
  runId: z.string().min(1).optional(),
  event: z.string().min(1),
  fromState: z.string().min(1).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
};

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

export interface PlaybooksPluginDeps {
  goalCheck?: GoalCheck | undefined;
}

export class PlaybooksPlugin extends ServicePlugin<
  PlaybooksConfig,
  PlaybooksConfigInput
> {
  private store!: PlaybookRunStore;
  private ctx: ServicePluginContext | undefined;
  private goalCheck: GoalCheck;
  private readonly injectedGoalCheck: GoalCheck | undefined;
  private readonly startLocks = new Map<string, Promise<ToolResponse>>();
  private readonly runLocks = new Map<string, Promise<void>>();
  private lifecycleStarters!: LifecycleStarterRegistry;
  private runs!: RunEngine;

  constructor(
    config: PlaybooksConfigInput = {},
    deps: PlaybooksPluginDeps = {},
  ) {
    super("playbooks", packageJson, config, playbooksConfigSchema);
    this.injectedGoalCheck = deps.goalCheck;
    this.goalCheck = deps.goalCheck ?? defaultGoalCheck;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.ctx = context;
    this.store = new PlaybookRunStore(context.runtimeState);
    this.goalCheck = this.injectedGoalCheck ?? createJudgeGoalCheck(context);
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

    context.registerInstructions(buildInstructions(this.config.lifecycle));
    context.eval.registerHandler("goalCheck", async (input: unknown) =>
      this.goalCheck.evaluate(goalCheckInputSchema.parse(input)),
    );

    context.messaging.subscribe<
      LifecycleStartersRequest,
      LifecycleStartersResponse
    >(PLAYBOOKS_LIFECYCLE_STARTERS, async (message) => {
      const input = lifecycleStartersRequestSchema.parse(message.payload);
      const starters = await this.lifecycleStarters.resolveStarters(input);
      return { success: true, data: { starters } };
    });

    context.messaging.subscribe<
      LifecycleStarterRegistration,
      LifecycleStarterRegistrationResponse
    >(PLAYBOOKS_REGISTER_LIFECYCLE_STARTER, async (message) => {
      const registration = lifecycleStarterRegistrationSchema.parse(
        message.payload,
      );
      const result = this.lifecycleStarters.register(
        registration,
        message.source,
      );
      return { success: true, data: result };
    });

    context.messaging.subscribe<unknown, AgentContextResponse>(
      AGENT_CONTEXT_REQUEST_CHANNEL,
      async (message) => {
        const request = agentContextRequestSchema.parse(message.payload);
        const item = await this.buildAgentContextItem(request.conversationId);
        return { success: true, data: { items: item ? [item] : [] } };
      },
    );

    context.messaging.subscribe<unknown, AgentResponse>(
      AGENT_ACTION_REQUEST_CHANNEL,
      async (message) => {
        const request = agentActionRequestSchema.parse(message.payload);
        const response = await this.handleAgentAction(request);
        return response
          ? { success: true, data: response }
          : { success: false };
      },
    );

    context.messaging.subscribe<Record<string, unknown>, { recorded: boolean }>(
      "entity:created",
      async (message) => ({
        success: true,
        data: await this.runs.recordEntityEventEvidence(
          "created",
          message.payload,
        ),
      }),
    );
    context.messaging.subscribe<Record<string, unknown>, { recorded: boolean }>(
      "entity:updated",
      async (message) => ({
        success: true,
        data: await this.runs.recordEntityEventEvidence(
          "updated",
          message.payload,
        ),
      }),
    );
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      {
        name: "playbook_status",
        description:
          "Get playbook lifecycle config, active runs, current state, valid events, and parsed playbook body. After meaningful tool actions, use the reported current state as source of truth. Do not send an extra NEXT after runtime evidence already advanced the run. Do not claim the playbook is finished unless the run has reached a final state.",
        inputSchema: statusInputSchema,
        visibility: "anchor",
        sideEffects: "none",
        handler: async (
          input: unknown,
          toolContext: ToolContext,
        ): Promise<ToolResponse> => {
          const parsed = z.object(statusInputSchema).parse(input);
          try {
            const data = await this.getStatus({
              ...parsed,
              conversationId: toolContext.conversationId,
            });
            return { success: true, data };
          } catch (error) {
            return { success: false, error: errorMessage(error) };
          }
        },
      },
      {
        name: "playbook_start",
        description:
          "Start a playbook run, or resume an existing active run. If the operator asks to start a playbook by title, use the stable slug/id form when known (for example lowercase words joined by hyphens) instead of claiming it is unavailable without calling this tool. Do not call this to continue an already active playbook; use playbook_status and playbook_send_event with a valid event instead.",
        inputSchema: startInputSchema,
        visibility: "anchor",
        sideEffects: "writes",
        handler: async (
          input: unknown,
          toolContext: ToolContext,
        ): Promise<ToolResponse> => {
          const parsed = z.object(startInputSchema).parse(input);
          const conversationId = toolContext.conversationId;
          const lockKey = conversationId
            ? `${conversationId}:${parsed.playbookId}`
            : `playbook:${parsed.playbookId}`;
          return this.withStartLock(lockKey, async () => {
            const playbook = await this.requirePlaybook(parsed.playbookId);
            assertValidPlaybookBody(playbook.body);
            const lifecycle =
              playbook.entity.metadata.lifecycle ?? parsed.lifecycle;
            const existing = conversationId
              ? (
                  await this.store.listActiveByConversation(conversationId)
                ).find((run) => run.playbookId === parsed.playbookId)
              : await this.store.findActiveByPlaybook(parsed.playbookId);
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
                  playbookId: parsed.playbookId,
                  playbookVersion: playbook.version,
                  body: playbook.body,
                  lifecycle,
                  conversationId,
                });
            const data = await this.getStatus({ runId: run.id });
            return { success: true, data };
          });
        },
      },
      {
        name: "playbook_send_event",
        description:
          "Send an event to a playbook run state machine and persist the resulting state. Invalid events return an error. Always pass fromState set to the current state id you are acting on (from playbook_status or the active-playbook context); if the run has advanced past that state, the event is rejected as stale and you must call playbook_status and act on the current state instead. Only use this when the operator positively selects a valid event/action or when a gated Done When condition is actually met. For durable gated states, user-provided details are not enough; do not send NEXT until the required system_create/system_update/system_delete tool has succeeded or current run evidence already shows the Done When condition is met. Operator actions and choices are not generic continuation events; do not use this for generic next/continue to select an operator action, even if only one operator action is currently valid. Do not use this when the operator explicitly says they have not chosen, selected, asked for, or used the available action. Skip-style events require a positive request to skip. This tool only changes playbook state; it does not retrieve, show, save, create, update, or transform domain entities. When the operator message only selects a playbook action, call this tool without unrelated domain mutation tools such as system_create or system_update. If the operator also asks to find/show/retrieve content, call system_get or system_search before answering.",
        inputSchema: sendEventInputSchema,
        visibility: "anchor",
        sideEffects: "writes",
        handler: async (
          input: unknown,
          toolContext: ToolContext,
        ): Promise<ToolResponse> => {
          const parsed = z.object(sendEventInputSchema).parse(input);
          const run = await this.resolveScopedRunResponse({
            runId: parsed.runId,
            conversationId: toolContext.conversationId,
          });
          if (!run.success) return run;
          const result = await this.sendEventForRun(run.data.id, parsed.event, {
            context: parsed.context,
            fromState: parsed.fromState,
          });
          return result.success
            ? { success: true, data: result.data }
            : { success: false, error: result.error };
        },
      },
    ];
  }

  private async withStartLock(
    key: string,
    task: () => Promise<ToolResponse>,
  ): Promise<ToolResponse> {
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
    if (request.userPermissionLevel !== "anchor") return undefined;

    const scopedRun = await this.resolveScopedRunResponse({
      conversationId: request.conversationId,
    });
    if (!scopedRun.success) return undefined;

    const args = {
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
        toolResults: [{ toolName: "playbook_send_event", args }],
        usage: zeroUsage(),
      };
    }

    const state = this.getCurrentRunState(result.data);
    return {
      text: formatActionResponseText(state),
      ...(result.data.cards ? { cards: result.data.cards } : {}),
      toolResults: [
        { toolName: "playbook_send_event", args, data: result.data },
      ],
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
        error: `Stale playbook event '${event}': it was issued from state '${options.fromState}' but the run has advanced to state '${run.currentState}'. Call playbook_status and act on the current state.`,
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
    if (!this.ctx) return [];
    const entities =
      await this.ctx.entityService.listEntities<RegisteredPlaybookEntity>({
        entityType: "playbook",
      });

    return entities.flatMap((entity): ParsedPlaybook[] => {
      const parsed = playbookEntitySchema.safeParse(entity);
      if (!parsed.success) return [];
      const { body } = playbookAdapter.parsePlaybookContent(
        parsed.data.content,
      );
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
    if (!this.ctx) return undefined;
    const entity =
      await this.ctx.entityService.getEntity<RegisteredPlaybookEntity>({
        entityType: "playbook",
        id: playbookId,
        visibilityScope: permissionToVisibilityScope("anchor"),
      });
    const parsed = playbookEntitySchema.safeParse(entity);
    if (!parsed.success) return undefined;
    const { body } = playbookAdapter.parsePlaybookContent(parsed.data.content);
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

function createJudgeGoalCheck(context: ServicePluginContext): GoalCheck {
  return {
    async evaluate(input): Promise<GoalCheckResult> {
      const query = input.goal.join("\n");
      const searchResults = await context.entityService.search({
        query,
        options: {
          limit: 8,
          excludeTypes: ["playbook"],
          visibilityScope: permissionToVisibilityScope("anchor"),
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

const defaultGoalCheck: GoalCheck = {
  async evaluate() {
    return {
      met: false,
      reason: "No playbook goal check is configured.",
    };
  },
};

export function playbooksPlugin(
  config: PlaybooksConfigInput = {},
  deps: PlaybooksPluginDeps = {},
): PlaybooksPlugin {
  return new PlaybooksPlugin(config, deps);
}
