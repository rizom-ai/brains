import {
  AGENT_ACTION_REQUEST_CHANNEL,
  AGENT_CONTEXT_REQUEST_CHANNEL,
  agentActionRequestSchema,
  agentContextRequestSchema,
  type AgentActionRequest,
  type AgentContextItem,
  type AgentContextResponse,
  type AgentResponse,
  type ActionsCard,
} from "@brains/contracts";
import {
  assertValidPlaybookBody,
  playbookAdapter,
  type PlaybookBody,
  type PlaybookEntity as RegisteredPlaybookEntity,
  type PlaybookState,
  type PlaybookTransition,
} from "@brains/playbook";
import type {
  ServicePluginContext,
  Tool,
  ToolContext,
  ToolResponse,
} from "@brains/plugins";
import { ServicePlugin, permissionToVisibilityScope } from "@brains/plugins";
import { createPrefixedId, z } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import { createActor, createMachine } from "xstate";
import packageJson from "../package.json";
import {
  PlaybookRunStore,
  createPlaybookRun,
  playbookRunEvidenceSchema,
  playbookRunSchema,
  type PlaybookGateVerdict,
  type PlaybookRun,
  type PlaybookRunEvidence,
} from "./run-store";

export const PLAYBOOKS_LIFECYCLE_STARTERS = "playbooks:lifecycle-starters";

const lifecycleConfigSchema = z
  .object({
    trigger: z.string().min(1),
    playbookId: z.string().min(1),
    once: z.boolean().default(true),
    starterText: z.string().min(1),
    description: z.string().min(1).optional(),
    starterPrompt: z.string().min(1),
  })
  .strict();

const playbooksConfigSchema = z
  .object({
    lifecycle: z.record(z.string(), lifecycleConfigSchema).default({}),
  })
  .strict();

const lifecycleStartersRequestSchema = z
  .object({
    lifecycle: z.string().min(1).optional(),
    interfaceType: z.string().min(1),
    userPermissionLevel: z.enum(["anchor", "trusted", "public"]),
  })
  .strict();

const playbookEntitySchema = z
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
  context: z.record(z.string(), z.unknown()).optional(),
};

export type LifecyclePlaybookConfig = z.infer<typeof lifecycleConfigSchema>;
export type PlaybooksConfig = z.infer<typeof playbooksConfigSchema>;
export type PlaybookEntity = z.infer<typeof playbookEntitySchema>;

export interface ParsedPlaybook {
  entity: PlaybookEntity;
  body: PlaybookBody;
  version: string;
}

export interface PlaybookStarter {
  id: string;
  title: string;
  description?: string | undefined;
  playbookId: string;
  lifecycle: string;
  starterPrompt: string;
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

export interface LifecycleStartersResponse {
  starters: PlaybookStarter[];
}

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

export interface GoalCheck {
  evaluate(input: GoalCheckInput): Promise<GoalCheckResult>;
}

export interface PlaybooksPluginDeps {
  goalCheck?: GoalCheck | undefined;
}

export class PlaybooksPlugin extends ServicePlugin<PlaybooksConfig> {
  private store!: PlaybookRunStore;
  private ctx: ServicePluginContext | undefined;
  private goalCheck: GoalCheck;
  private readonly injectedGoalCheck: GoalCheck | undefined;
  private readonly startLocks = new Map<string, Promise<ToolResponse>>();

  constructor(
    config: Partial<PlaybooksConfig> = {},
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

    context.registerInstructions(this.buildInstructions());
    context.eval.registerHandler("goalCheck", async (input: unknown) =>
      this.goalCheck.evaluate(goalCheckInputSchema.parse(input)),
    );

    context.messaging.subscribe<
      z.infer<typeof lifecycleStartersRequestSchema>,
      LifecycleStartersResponse
    >(PLAYBOOKS_LIFECYCLE_STARTERS, async (message) => {
      const input = lifecycleStartersRequestSchema.parse(message.payload);
      const starters = await this.resolveLifecycleStarters(input);
      return { success: true, data: { starters } };
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
        data: await this.recordEntityEventEvidence("created", message.payload),
      }),
    );
    context.messaging.subscribe<Record<string, unknown>, { recorded: boolean }>(
      "entity:updated",
      async (message) => ({
        success: true,
        data: await this.recordEntityEventEvidence("updated", message.payload),
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
          "Start a playbook run, or resume an existing active run. Do not call this to continue an already active playbook; use playbook_status and playbook_send_event with a valid event instead.",
        inputSchema: startInputSchema,
        visibility: "anchor",
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
            const existing = conversationId
              ? (
                  await this.store.listActiveByConversation(conversationId)
                ).find((run) => run.playbookId === parsed.playbookId)
              : await this.store.findActiveByPlaybook(parsed.playbookId);
            const run = existing
              ? await this.store.upsert({
                  ...existing,
                  status: "active",
                  ...(conversationId ? { conversationId } : {}),
                  ...(existing.startedAt
                    ? {}
                    : { startedAt: new Date().toISOString() }),
                })
              : await this.createStartedRun({
                  playbookId: parsed.playbookId,
                  playbookVersion: playbook.version,
                  body: playbook.body,
                  lifecycle: parsed.lifecycle,
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
          "Send an event to a playbook run state machine and persist the resulting state. Invalid events return an error. Only use this when the operator positively selects a valid event/action or when a gated Done When condition is actually met. Operator actions and choices are not generic continuation events; do not use this for generic next/continue to select an operator action, even if only one operator action is currently valid. Do not use this when the operator explicitly says they have not chosen, selected, asked for, or used the available action. Skip-style events require a positive request to skip. This tool only changes playbook state; it does not retrieve, show, save, create, update, or transform domain entities. If the operator also asks to find/show/retrieve content, call system_get or system_search before answering.",
        inputSchema: sendEventInputSchema,
        visibility: "anchor",
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
          const result = await this.sendEventForRun(
            run.data,
            parsed.event,
            parsed.context,
          );
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

  private async handleAgentAction(
    request: AgentActionRequest,
  ): Promise<AgentResponse | undefined> {
    if (request.userPermissionLevel !== "anchor") return undefined;

    const scopedRun = await this.resolveScopedRunResponse({
      conversationId: request.conversationId,
    });
    if (!scopedRun.success) return undefined;

    const result = await this.sendEventForRun(
      scopedRun.data,
      request.action.event,
    );
    if (!result.success) {
      return {
        text: `I couldn't continue the playbook: ${result.error}`,
        toolResults: [
          {
            toolName: "playbook_send_event",
            args: { runId: scopedRun.data.id, event: request.action.event },
          },
        ],
        usage: zeroUsage(),
      };
    }

    const state = this.getCurrentRunState(result.data);
    return {
      text: formatActionResponseText(state),
      ...(result.data.cards ? { cards: result.data.cards } : {}),
      toolResults: [
        {
          toolName: "playbook_send_event",
          args: { runId: scopedRun.data.id, event: request.action.event },
          data: result.data,
        },
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
    run: PlaybookRun,
    event: string,
    context?: Record<string, unknown>,
  ): Promise<
    | { success: true; data: PlaybookStatusResponse }
    | { success: false; error: string }
  > {
    const playbook = await this.requirePlaybook(run.playbookId);
    if (run.playbookVersion !== playbook.version) {
      return {
        success: false,
        error: `Playbook definition changed for '${run.playbookId}'. Run version ${run.playbookVersion} does not match current version ${playbook.version}.`,
      };
    }
    const result = await this.transitionRun(run, playbook.body, event);
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
      snapshot: result.snapshot,
      gateVerdicts: result.gateVerdicts,
      context: { ...run.context, ...(context ?? {}) },
      ...(reachedFinalState
        ? {
            status: "completed" as const,
            completedAt: new Date().toISOString(),
          }
        : {}),
    });
    const data = await this.getStatus({ runId: nextRun.id });
    return { success: true, data };
  }

  private async createStartedRun(input: {
    playbookId: string;
    playbookVersion: string;
    body: PlaybookBody;
    lifecycle?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<PlaybookRun> {
    const run = createPlaybookRun({
      playbookId: input.playbookId,
      playbookVersion: input.playbookVersion,
      initialState: input.body.initialState,
      lifecycle: input.lifecycle,
      conversationId: input.conversationId,
    });
    const machine = this.buildMachine(input.playbookId, input.body, run);
    const actor = createActor(machine);
    actor.start();
    const snapshot = actor.getPersistedSnapshot();
    actor.stop();
    return this.store.upsert({ ...run, snapshot });
  }

  private async transitionRun(
    run: PlaybookRun,
    body: PlaybookBody,
    event: string,
  ): Promise<
    | {
        success: true;
        currentState: string;
        snapshot: unknown;
        gateVerdicts: PlaybookGateVerdict[];
      }
    | { success: false; error: string; gateVerdicts?: PlaybookGateVerdict[] }
  > {
    const state = this.getState(body, run.currentState);
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
    const machine = this.buildMachine(run.playbookId, body, candidateRun);
    const actor = createActor(machine, {
      ...(run.snapshot ? { snapshot: run.snapshot as never } : {}),
    });
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
    const nextSnapshot = actor.getSnapshot();
    const nextState = String(nextSnapshot.value);
    const expectedTarget = state.transitions.find(
      (transition) => transition.event === event,
    )?.target;
    if (expectedTarget && nextState !== expectedTarget) {
      actor.stop();
      return {
        success: false,
        error: `Playbook event '${event}' is blocked from state '${run.currentState}'. Complete the state's Done When conditions before sending this event.`,
        gateVerdicts: gateResult.gateVerdicts,
      };
    }
    const persistedSnapshot = actor.getPersistedSnapshot();
    actor.stop();
    return {
      success: true,
      currentState: nextState,
      snapshot: persistedSnapshot,
      gateVerdicts: gateResult.gateVerdicts,
    };
  }

  private async prepareGateVerdicts(
    run: PlaybookRun,
    state: PlaybookState,
    event: string,
  ): Promise<
    | { success: true; gateVerdicts: PlaybookGateVerdict[] }
    | { success: false; error: string }
  > {
    if (!this.transitionRequiresGateVerdict(state, event)) {
      return { success: true, gateVerdicts: run.gateVerdicts };
    }
    if (this.hasSatisfiedGateVerdicts(state, run)) {
      return { success: true, gateVerdicts: run.gateVerdicts };
    }

    const evidence = this.evidenceForState(run, state.id);
    let result: GoalCheckResult;
    try {
      result = await this.goalCheck.evaluate({
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

  private evidenceForState(
    run: PlaybookRun,
    stateId: string,
  ): PlaybookRunEvidence[] {
    return run.evidence.filter(
      (evidence) => !evidence.stateId || evidence.stateId === stateId,
    );
  }

  private buildMachine(
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
                          ...(this.transitionRequiresGateVerdict(
                            state,
                            transition.event,
                          )
                            ? {
                                guard: (): boolean =>
                                  this.hasSatisfiedGateVerdicts(state, run),
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

  private async resolveLifecycleStarters(input: {
    lifecycle?: string | undefined;
    interfaceType: string;
    userPermissionLevel: "anchor" | "trusted" | "public";
  }): Promise<PlaybookStarter[]> {
    if (
      input.interfaceType !== "web-chat" ||
      input.userPermissionLevel !== "anchor"
    ) {
      return [];
    }

    const entries = Object.entries(this.config.lifecycle).filter(
      ([id]) => !input.lifecycle || id === input.lifecycle,
    );
    const starters: PlaybookStarter[] = [];

    for (const [id, lifecycle] of entries) {
      const existingRun = await this.store.findByLifecycle(id);
      if (
        lifecycle.once &&
        (existingRun?.status === "completed" ||
          existingRun?.status === "dismissed")
      ) {
        continue;
      }

      const playbook = await this.getPlaybook(lifecycle.playbookId);
      if (playbook?.entity.metadata.status !== "active") continue;

      starters.push({
        id,
        title: lifecycle.starterText,
        ...(lifecycle.description
          ? { description: lifecycle.description }
          : {}),
        playbookId: lifecycle.playbookId,
        lifecycle: id,
        starterPrompt: lifecycle.starterPrompt,
      });
    }

    return starters;
  }

  private async getStatus(input: {
    runId?: string | undefined;
    playbookId?: string | undefined;
    lifecycle?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<PlaybookStatusResponse> {
    const runs = await this.store.list();
    const conversationRuns = input.conversationId
      ? runs.filter(
          (run) =>
            run.conversationId === input.conversationId &&
            (run.status === "active" || run.status === "offered"),
        )
      : [];
    const activeRun = input.runId
      ? runs.find((run) => run.id === input.runId)
      : input.conversationId && input.lifecycle
        ? conversationRuns.find((run) => run.lifecycle === input.lifecycle)
        : input.conversationId && input.playbookId
          ? conversationRuns.find((run) => run.playbookId === input.playbookId)
          : input.conversationId
            ? await this.requireScopedRun({
                conversationId: input.conversationId,
              })
            : input.lifecycle
              ? runs.find((run) => run.lifecycle === input.lifecycle)
              : input.playbookId
                ? runs.find((run) => run.playbookId === input.playbookId)
                : undefined;

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
        ? this.getState(parsedPlaybook.body, activeRun.currentState)
        : undefined;
    const allValidTransitions =
      currentState && activeRun && parsedPlaybook
        ? this.getValidTransitions(activeRun, parsedPlaybook.body, currentState)
        : (currentState?.transitions ?? []);
    const validEvents = allValidTransitions.filter(
      (transition) => transition.operatorAction !== true,
    );
    const operatorActions = allValidTransitions.filter(
      (transition) => transition.operatorAction === true,
    );
    const blockedEvents =
      currentState && activeRun && parsedPlaybook
        ? this.getBlockedTransitions(
            activeRun,
            parsedPlaybook.body,
            currentState,
          )
        : [];
    const guidance =
      currentState && activeRun && parsedPlaybook
        ? this.buildStateGuidance(activeRun, parsedPlaybook.body, currentState)
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

  private buildStateGuidance(
    run: PlaybookRun,
    body: PlaybookBody,
    state: PlaybookState,
  ): string {
    const allValidTransitions = this.getValidTransitions(run, body, state);
    const validTransitions = allValidTransitions.filter(
      (transition) => transition.operatorAction !== true,
    );
    const operatorActions = allValidTransitions.filter(
      (transition) => transition.operatorAction === true,
    );
    const blockedTransitions = this.getBlockedTransitions(run, body, state);
    const verdict = run.gateVerdicts.find(
      (candidate) =>
        candidate.stateId === state.id &&
        sameGoal(candidate.goal, state.doneWhen),
    );
    return [
      `Current state: ${state.id} (${state.title})`,
      "Instructions:",
      ...state.instructions.map((instruction) => `- ${instruction}`),
      "Done When:",
      ...(state.doneWhen.length > 0
        ? state.doneWhen.map((condition) => `- ${condition}`)
        : ["- none"]),
      "Goal status:",
      verdict
        ? `- ${verdict.met ? "Met" : "Not yet met"}: ${verdict.reason}`
        : "- Not checked yet.",
      "Current-state information rules:",
      "- If this state asks the operator for information, ask the operator for the missing current-run information.",
      "- Do not answer the state's operator-facing prompt from memory, existing durable records, profile data, search, or retrieval tools.",
      "- Setup facts must come from current-run evidence or current operator input, not ambient records.",
      "Event selection rules:",
      "- If the operator explicitly says they have not chosen, selected, asked for, or used one of the available actions, do not send any event.",
      '- Operator actions and choices are not generic continuation events; even if only one operator action is available, generic continuation like "yes", "next", or "continue" is not a valid selection.',
      "- If multiple events are available, ask the operator to pick one labeled action.",
      "- A Skip-style operator action is never a default continuation; send it only when the operator positively selects or asks to skip.",
      "Valid continuation events:",
      ...(validTransitions.length > 0
        ? validTransitions.map((transition) =>
            this.formatTransition(transition),
          )
        : ["- none"]),
      "Available operator actions:",
      ...(operatorActions.length > 0
        ? operatorActions.map((transition) => this.formatTransition(transition))
        : ["- none"]),
      "Blocked events:",
      ...(blockedTransitions.length > 0
        ? blockedTransitions.map((transition) =>
            this.formatTransition(transition),
          )
        : ["- none"]),
    ].join("\n");
  }

  private async recordEntityEventEvidence(
    operation: "created" | "updated",
    payload: Record<string, unknown>,
  ): Promise<{ recorded: boolean }> {
    const entityType = stringFromPayload(payload, "entityType");
    const entityId = stringFromPayload(payload, "entityId");
    if (!entityType || !entityId) return { recorded: false };

    const explicitRunId = stringFromPayload(payload, "runId");
    const conversationId = stringFromPayload(payload, "conversationId");
    const run = explicitRunId
      ? await this.store.findById(explicitRunId)
      : conversationId
        ? await this.store.findActiveByConversation(conversationId)
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
    const updatedRun = await this.store.appendEvidence(run.id, evidence);
    await this.evaluateGateAfterEvidence(updatedRun);
    return { recorded: true };
  }

  private async evaluateGateAfterEvidence(run: PlaybookRun): Promise<void> {
    if (this.hasSatisfiedGateForCurrentState(run)) return;
    const playbook = await this.getPlaybook(run.playbookId);
    if (run.playbookVersion !== playbook?.version) return;
    const state = this.getState(playbook.body, run.currentState);
    if (!state?.doneWhen.length) return;
    const nextTransitions = state.transitions.filter(
      (transition) => transition.event === "NEXT",
    );
    if (nextTransitions.length !== 1) return;

    const result = await this.prepareGateVerdicts(run, state, "NEXT");
    if (!result.success) return;

    const candidateRun = { ...run, gateVerdicts: result.gateVerdicts };
    if (!this.hasSatisfiedGateVerdicts(state, candidateRun)) {
      await this.store.upsert(candidateRun);
      return;
    }

    const transitioned = await this.transitionRun(
      candidateRun,
      playbook.body,
      "NEXT",
    );
    if (!transitioned.success) {
      await this.store.upsert(candidateRun);
      return;
    }

    const reachedFinalState = playbook.body.finalStates.includes(
      transitioned.currentState,
    );
    await this.store.upsert({
      ...candidateRun,
      currentState: transitioned.currentState,
      completedStates: appendUnique(
        candidateRun.completedStates,
        candidateRun.currentState,
      ),
      snapshot: transitioned.snapshot,
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

  private transitionRequiresGateVerdict(
    state: PlaybookState,
    event: string,
  ): boolean {
    return event === "NEXT" && state.doneWhen.length > 0;
  }

  private hasSatisfiedGateVerdicts(
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

  private getValidTransitions(
    run: PlaybookRun,
    body: PlaybookBody,
    state: PlaybookState,
  ): PlaybookTransition[] {
    return state.transitions.filter((transition) =>
      this.canTransition(run, body, transition.event),
    );
  }

  private getBlockedTransitions(
    run: PlaybookRun,
    body: PlaybookBody,
    state: PlaybookState,
  ): PlaybookTransition[] {
    const validKeys = new Set(
      this.getValidTransitions(run, body, state).map(
        (transition) => `${transition.event}\u0000${transition.target}`,
      ),
    );
    return state.transitions.filter(
      (transition) =>
        !validKeys.has(`${transition.event}\u0000${transition.target}`),
    );
  }

  private canTransition(
    run: PlaybookRun,
    body: PlaybookBody,
    event: string,
  ): boolean {
    const machine = this.buildMachine(run.playbookId, body, run);
    const actor = createActor(machine, {
      ...(run.snapshot ? { snapshot: run.snapshot as never } : {}),
    });
    actor.start();
    const canTransition = actor.getSnapshot().can({ type: event });
    actor.stop();
    return canTransition;
  }

  private formatTransition(transition: PlaybookTransition): string {
    const description =
      transition.operatorDescription ??
      transition.description ??
      transition.label;
    return description
      ? `- ${transition.event} -> ${transition.target}: ${description}`
      : `- ${transition.event} -> ${transition.target}`;
  }

  private getState(
    body: PlaybookBody,
    stateId: string,
  ): PlaybookState | undefined {
    return body.states.find((state) => state.id === stateId);
  }

  private formatVerifierStatus(run: PlaybookRun, state: PlaybookState): string {
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

  private async buildAgentContextItem(
    conversationId: string,
  ): Promise<AgentContextItem | undefined> {
    const run = await this.store.findActiveByConversation(conversationId);
    if (!run) return undefined;
    const playbook = await this.getPlaybook(run.playbookId);
    if (!playbook) return undefined;
    const state = this.getState(playbook.body, run.currentState);
    if (!state) return undefined;

    const allValidTransitions = this.getValidTransitions(
      run,
      playbook.body,
      state,
    );
    const validTransitions = allValidTransitions.filter(
      (transition) => transition.operatorAction !== true,
    );
    const operatorActions = allValidTransitions.filter(
      (transition) => transition.operatorAction === true,
    );
    const validTransitionKeys = new Set(
      allValidTransitions.map(
        (transition) => `${transition.event}\u0000${transition.target}`,
      ),
    );
    const blockedTransitions = state.transitions.filter(
      (transition) =>
        !validTransitionKeys.has(
          `${transition.event}\u0000${transition.target}`,
        ),
    );
    const validEvents = validTransitions
      .map((transition) => this.formatTransition(transition))
      .join("\n");
    const operatorActionEvents = operatorActions
      .map((transition) => this.formatTransition(transition))
      .join("\n");
    const blockedEvents = blockedTransitions
      .map((transition) => this.formatTransition(transition))
      .join("\n");
    const doneWhen = state.doneWhen
      .map((condition) => `- ${condition}`)
      .join("\n");
    const completedStates = run.completedStates
      .map((stateId) => `- ${stateId}`)
      .join("\n");
    const goalStatus = this.formatVerifierStatus(run, state);

    return {
      id: run.id,
      source: "active-playbook",
      title: `${playbook.entity.metadata.title} — state: ${state.title}`,
      content: `Current playbook: ${playbook.entity.metadata.title}
Run ID: ${run.id}
Current state title: ${state.title}
Current state id (tool use only): ${state.id}
${state.prompt ? `Operator-facing prompt: ${state.prompt}\n` : ""}
Use this run ID for run-scoped playbook tools when explicit run identity is needed.
Treat this current state as the source of truth. Do not redo completed states or ask for evidence already captured; ask only for what is missing in the current state.
Do not mention raw playbook state IDs to the operator; use the state title or natural-language task description instead.
Avoid state-machine phrasing like stage, state, or run progress in operator-facing chat; describe the task or outcome in natural language instead.
Call playbook tools silently; never write tool names like playbook_status or playbook_send_event in operator-facing text.
After meaningful tool actions, refresh playbook_status before your final answer when the run may have advanced, then end the turn with the next immediate question or action for the current state. If runtime evidence already advanced the run, do not send an extra NEXT for the new state.
If exactly one non-operator continuation event is available and the operator clearly accepts it, send that event instead of starting the playbook again. Operator actions and choices are not generic continuation events; even if only one operator action is available, generic continuation like "yes", "next", or "continue" is not a valid selection. If multiple events are available, ask the operator to pick one labeled action. If the operator explicitly says they have not chosen, selected, asked for, or used one of the available actions, do not send any event.
A Skip-style operator action is never a default continuation. Send a Skip event only when the operator positively selects or asks to skip.
If the operator names or selects a valid event label or operator action (for example, "Use the X action"), call playbook_send_event for that matching event before doing related work or answering.
A playbook event does not replace ordinary domain tools requested in the same operator message. If the operator also asks to find, show, retrieve, save, create, update, or transform something, call the relevant non-playbook tool before the final answer; do not claim that work happened from conversation memory, playbook evidence, or a playbook event alone. For find/show/retrieve requests, use system_get or system_search.
After a playbook event advances the run, call playbook_status and answer from the refreshed current state. If the same operator message includes a concrete request with the necessary content and target details for the new state, satisfy that request in the same turn instead of waiting for another message. Do not infer missing setup details from memory or existing profile data just because the event reached a setup state.
If the operator gives an ambiguous continuation like 'go ahead' after you offered a next playbook action, continue that offered action or ask which option they mean; do not start unrelated maintenance tasks.
Do not set arbitrary current states or claim a state is complete yourself. Advance by calling playbook_send_event with a valid event; the runtime goal check decides whether gated transitions are allowed.
Treat setup facts as current-run evidence: unless the operator provided them in this run or they appear in active-run evidence, do not fill missing playbook requirements from ambient memory or existing durable records.
When the current playbook state asks the operator for information, ask the operator; do not answer the prompt yourself from memory, knowledge search, or existing durable records. If the operator explicitly selects a valid event or operator action such as Skip, send that event instead of asking for the missing information.
Do not behave like a form. Ask one question at a time unless the playbook state says otherwise.
Teach by doing real actions with existing tools.
After meaningful tool actions, explain what happened and why it matters.
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts. Runtime evidence from those actions is attached to the active run automatically where supported.
Do not publish content unless the operator explicitly asks and confirms the publishing action.

Completed states:
${completedStates || "- none"}

State instructions:
${state.instructions.map((instruction) => `- ${instruction}`).join("\n")}

Done when:
${doneWhen || "- none"}

Goal status:
${goalStatus}

Valid continuation events:
${validEvents || "- none"}

Available operator actions:
${operatorActionEvents || "- none"}

Blocked events:
${blockedEvents || "- none"}`,
      provenance: {
        playbookId: run.playbookId,
        runId: run.id,
        currentState: run.currentState,
        validEvents: validTransitions.map((transition) => transition.event),
        operatorActions: operatorActions.map((transition) => transition.event),
      },
    };
  }

  private buildInstructions(): string {
    const lifecycleSummary = Object.entries(this.config.lifecycle)
      .map(
        ([id, config]) =>
          `- ${id}: playbookId=${config.playbookId}, trigger=${config.trigger}`,
      )
      .join("\n");

    return `When the operator asks to start a configured playbook or lifecycle, call playbook_start with the configured playbookId and lifecycle before continuing.
When active-playbook context is present, follow its current state instructions, Done When conditions, valid events, and operating guidance.
A playbook event does not replace ordinary domain tools requested in the same operator message; if the operator also asks to find, show, retrieve, save, create, update, or transform something, call the relevant non-playbook tool before the final answer.
Do not publish content unless the operator explicitly asks and confirms the publishing action.

Configured lifecycle playbooks:
${lifecycleSummary || "- none"}`;
  }
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

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameGoal(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
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
          "Decide whether the playbook goal is satisfied by the supplied KB excerpts and runtime evidence. Return met=true only when the outcome clearly holds. If evidence is missing or ambiguous, return met=false with a short reason.",
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
  config: Partial<PlaybooksConfig> = {},
  deps: PlaybooksPluginDeps = {},
): PlaybooksPlugin {
  return new PlaybooksPlugin(config, deps);
}
