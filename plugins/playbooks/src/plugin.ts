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
  type AgentContextResponse,
  type AgentResponse,
  type LifecycleStarterRegistration,
} from "@brains/contracts";
import {
  assertValidPlaybookBody,
  playbookAdapter,
  type PlaybookEntity as RegisteredPlaybookEntity,
  type PlaybookState,
} from "./entity";
import type { ServicePluginContext, Tool, ToolResult } from "@brains/plugins";
import { ServicePlugin, permissionToVisibilityScope } from "@brains/plugins";
import { buildPlaybookTools } from "./lib/tools";
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
  type LifecycleStarterRegistrationResponse,
  type LifecycleStartersResponse,
} from "./lib/lifecycle-starters";
import {
  lifecycleStartersRequestSchema,
  playbookStatusEntitySchema,
  playbooksConfigSchema,
  type LifecycleStartersRequest,
  type ParsedPlaybook,
  type PlaybooksConfig,
  type PlaybooksConfigInput,
  type PlaybookStatusResponse,
} from "./lib/contracts";

import { RunEngine, appendUnique, type GoalCheck } from "./lib/run-engine";
import { getErrorMessage } from "@brains/utils/error";
import {
  buildPlaybookActionsCard,
  formatActionResponseText,
  latestRun,
  preferActiveRun,
  sanitizeRunForModelOutput,
  withOperatorActionGuidance,
  zeroUsage,
} from "./lib/run-presentation";
import {
  createJudgeGoalCheck,
  defaultGoalCheck,
  goalCheckInputSchema,
} from "./lib/goal-check";

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
import { PlaybookRunStore, type PlaybookRun } from "./run-store";

export const PLAYBOOKS_LIFECYCLE_STARTERS = "playbooks:lifecycle-starters";

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
  private readonly startLocks = new Map<string, Promise<ToolResult<unknown>>>();
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
      ENTITY_CHANNELS.created,
      async (message) => ({
        success: true,
        data: await this.runs.recordEntityEventEvidence(
          "created",
          message.payload,
        ),
      }),
    );
    context.messaging.subscribe<Record<string, unknown>, { recorded: boolean }>(
      ENTITY_CHANNELS.updated,
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
    return buildPlaybookTools(this.id, {
      getStatus: async (input): Promise<PlaybookStatusResponse> =>
        this.getStatus(input),
      startRun: async (input): Promise<ToolResult<unknown>> =>
        this.startRun(input),
      sendEvent: async (input): Promise<ToolResult<unknown>> =>
        this.sendEventFromTool(input),
    });
  }

  private async startRun(input: {
    playbookId: string;
    lifecycle?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<ToolResult<unknown>> {
    const conversationId = input.conversationId;
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

  private async sendEventFromTool(input: {
    runId?: string | undefined;
    event: string;
    fromState?: string | undefined;
    context?: Record<string, unknown> | undefined;
    conversationId?: string | undefined;
  }): Promise<ToolResult<unknown>> {
    const run = await this.resolveScopedRunResponse({
      runId: input.runId,
      conversationId: input.conversationId,
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
    task: () => Promise<ToolResult<unknown>>,
  ): Promise<ToolResult<unknown>> {
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
      const parsed = playbookStatusEntitySchema.safeParse(entity);
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
        visibilityScope: permissionToVisibilityScope("admin"),
      });
    const parsed = playbookStatusEntitySchema.safeParse(entity);
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
      return { success: false, error: getErrorMessage(error) };
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

export function playbooksPlugin(
  config: PlaybooksConfigInput = {},
  deps: PlaybooksPluginDeps = {},
): PlaybooksPlugin {
  return new PlaybooksPlugin(config, deps);
}
