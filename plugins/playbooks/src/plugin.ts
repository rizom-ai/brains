import {
  AGENT_CONTEXT_REQUEST_CHANNEL,
  agentContextRequestSchema,
  type AgentContextItem,
  type AgentContextResponse,
} from "@brains/contracts";
import {
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
    storageDir: z.string().default("./data/playbooks"),
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
  conversationId: z.string().min(1).optional(),
};

const startInputSchema = {
  playbookId: z.string().min(1),
  lifecycle: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
};

const sendEventInputSchema = {
  runId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  event: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
};

const runInputSchema = {
  runId: z.string().min(1),
};

const resetInputSchema = {
  runId: z.string().min(1).optional(),
};

export type LifecyclePlaybookConfig = z.infer<typeof lifecycleConfigSchema>;
export type PlaybooksConfig = z.infer<typeof playbooksConfigSchema>;
export type PlaybookEntity = z.infer<typeof playbookEntitySchema>;

export interface ParsedPlaybook {
  entity: PlaybookEntity;
  body: PlaybookBody;
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
  lifecycle: Record<string, LifecyclePlaybookConfig>;
}

export interface LifecycleStartersResponse {
  starters: PlaybookStarter[];
}

export interface VerifyGateInput {
  run: PlaybookRun;
  state: PlaybookState;
  stateId: string;
  conditions: string[];
  evidence: PlaybookRunEvidence[];
  evidenceWatermark: string;
}

export type PendingPlaybookGateVerdict = Omit<
  PlaybookGateVerdict,
  "evaluatedAt"
> & {
  evaluatedAt?: string | undefined;
};

export interface PlaybookGateVerifier {
  verify(input: VerifyGateInput): Promise<PendingPlaybookGateVerdict[]>;
}

export interface PlaybooksPluginDeps {
  verifier?: PlaybookGateVerifier | undefined;
}

export class PlaybooksPlugin extends ServicePlugin<PlaybooksConfig> {
  private store: PlaybookRunStore;
  private ctx: ServicePluginContext | undefined;
  private readonly verifier: PlaybookGateVerifier;

  constructor(
    config: Partial<PlaybooksConfig> = {},
    deps: PlaybooksPluginDeps = {},
  ) {
    super("playbooks", packageJson, config, playbooksConfigSchema);
    this.store = new PlaybookRunStore(this.config.storageDir);
    this.verifier = deps.verifier ?? defaultGateVerifier;
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    this.ctx = context;
    this.store = new PlaybookRunStore(this.config.storageDir);

    context.registerInstructions(this.buildInstructions());

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
          "Get playbook lifecycle config, active runs, current state, valid events, and parsed playbook body.",
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
              conversationId: parsed.conversationId ?? toolContext.channelId,
            });
            return { success: true, data };
          } catch (error) {
            return { success: false, error: errorMessage(error) };
          }
        },
      },
      {
        name: "playbook_start",
        description: "Start or resume a playbook run.",
        inputSchema: startInputSchema,
        visibility: "anchor",
        handler: async (
          input: unknown,
          toolContext: ToolContext,
        ): Promise<ToolResponse> => {
          const parsed = z.object(startInputSchema).parse(input);
          const conversationId = parsed.conversationId ?? toolContext.channelId;
          const playbook = await this.requirePlaybook(parsed.playbookId);
          this.assertValidPlaybookBody(playbook.body);
          const existing = await this.store.findActiveByPlaybook(
            parsed.playbookId,
          );
          const run = existing
            ? await this.store.upsert({
                ...existing,
                status: "active",
                ...(parsed.lifecycle ? { lifecycle: parsed.lifecycle } : {}),
                ...(conversationId ? { conversationId } : {}),
                ...(existing.startedAt
                  ? {}
                  : { startedAt: new Date().toISOString() }),
              })
            : await this.createStartedRun({
                playbookId: parsed.playbookId,
                body: playbook.body,
                lifecycle: parsed.lifecycle,
                conversationId,
              });
          const data = await this.getStatus({ runId: run.id });
          return { success: true, data };
        },
      },
      {
        name: "playbook_send_event",
        description:
          "Send an event to a playbook run state machine and persist the resulting state. Invalid events return an error.",
        inputSchema: sendEventInputSchema,
        visibility: "anchor",
        handler: async (
          input: unknown,
          toolContext: ToolContext,
        ): Promise<ToolResponse> => {
          const parsed = z.object(sendEventInputSchema).parse(input);
          const run = await this.resolveScopedRunResponse({
            runId: parsed.runId,
            conversationId: parsed.conversationId,
            channelId: toolContext.channelId,
          });
          if (!run.success) return run;
          const playbook = await this.requirePlaybook(run.data.playbookId);
          const result = await this.transitionRun(
            run.data,
            playbook.body,
            parsed.event,
          );
          if (!result.success) return result;

          const nextRun = await this.store.upsert({
            ...run.data,
            currentState: result.currentState,
            completedStates: appendUnique(
              run.data.completedStates,
              run.data.currentState,
            ),
            snapshot: result.snapshot,
            gateVerdicts: result.gateVerdicts,
            context: { ...run.data.context, ...(parsed.context ?? {}) },
          });
          const data = await this.getStatus({ runId: nextRun.id });
          return { success: true, data };
        },
      },
      {
        name: "playbook_complete",
        description:
          "Mark a playbook run complete when it is in a final state.",
        inputSchema: runInputSchema,
        visibility: "anchor",
        handler: async (input: unknown): Promise<ToolResponse> => {
          const parsed = z.object(runInputSchema).parse(input);
          const run = await this.requireRun(parsed.runId);
          const playbook = await this.requirePlaybook(run.playbookId);
          if (!playbook.body.finalStates.includes(run.currentState)) {
            return {
              success: false,
              error: `Cannot complete playbook from non-final state '${run.currentState}'.`,
            };
          }
          const nextRun = await this.store.upsert({
            ...run,
            status: "completed",
            completedAt: new Date().toISOString(),
          });
          const data = await this.getStatus({ runId: nextRun.id });
          return { success: true, data };
        },
      },
      {
        name: "playbook_dismiss",
        description: "Dismiss a playbook run without deleting progress.",
        inputSchema: runInputSchema,
        visibility: "anchor",
        handler: async (input: unknown): Promise<ToolResponse> => {
          const parsed = z.object(runInputSchema).parse(input);
          const run = await this.requireRun(parsed.runId);
          const nextRun = await this.store.upsert({
            ...run,
            status: "dismissed",
          });
          const data = await this.getStatus({ runId: nextRun.id });
          return { success: true, data };
        },
      },
      {
        name: "playbook_reset_run",
        description:
          "Reset one playbook run, or all runs when no runId is supplied.",
        inputSchema: resetInputSchema,
        visibility: "anchor",
        handler: async (input: unknown): Promise<ToolResponse> => {
          const parsed = z.object(resetInputSchema).parse(input);
          await this.store.reset(parsed.runId);
          const data = await this.getStatus({});
          return { success: true, data };
        },
      },
    ];
  }

  private async createStartedRun(input: {
    playbookId: string;
    body: PlaybookBody;
    lifecycle?: string | undefined;
    conversationId?: string | undefined;
  }): Promise<PlaybookRun> {
    const run = createPlaybookRun({
      playbookId: input.playbookId,
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
    | { success: false; error: string }
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
      };
    }

    actor.send(eventObject);
    const nextSnapshot = actor.getSnapshot();
    const persistedSnapshot = actor.getPersistedSnapshot();
    actor.stop();
    return {
      success: true,
      currentState: String(nextSnapshot.value),
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

    const evidence = this.evidenceForState(run, state.id);
    const evidenceWatermark = computeEvidenceWatermark(evidence);
    const cached = state.doneWhen.map((condition) =>
      run.gateVerdicts.find(
        (verdict) =>
          verdict.stateId === state.id &&
          verdict.conditionHash === conditionHash(condition) &&
          verdict.evidenceWatermark === evidenceWatermark &&
          verdict.satisfied,
      ),
    );
    if (cached.every((verdict) => verdict !== undefined)) {
      return { success: true, gateVerdicts: run.gateVerdicts };
    }

    let pendingVerdicts: PendingPlaybookGateVerdict[];
    try {
      pendingVerdicts = await this.verifier.verify({
        run,
        state,
        stateId: state.id,
        conditions: state.doneWhen,
        evidence,
        evidenceWatermark,
      });
    } catch (error) {
      return {
        success: false,
        error: `Playbook verifier failed: ${errorMessage(error)}`,
      };
    }

    const evaluatedAt = new Date().toISOString();
    const validated = state.doneWhen.map((condition) =>
      this.validateGateVerdict(
        pendingVerdicts.find((verdict) => verdict.condition === condition),
        {
          condition,
          stateId: state.id,
          evidence,
          evidenceWatermark,
          evaluatedAt,
        },
      ),
    );
    const nextVerdicts = upsertGateVerdicts(run.gateVerdicts, validated);
    return { success: true, gateVerdicts: nextVerdicts };
  }

  private validateGateVerdict(
    verdict: PendingPlaybookGateVerdict | undefined,
    input: {
      condition: string;
      stateId: string;
      evidence: PlaybookRunEvidence[];
      evidenceWatermark: string;
      evaluatedAt: string;
    },
  ): PlaybookGateVerdict {
    const base: PlaybookGateVerdict = {
      stateId: input.stateId,
      condition: input.condition,
      conditionHash: conditionHash(input.condition),
      evidenceWatermark: input.evidenceWatermark,
      satisfied: verdict?.satisfied ?? false,
      source: verdict?.source ?? "llm-judge",
      evidenceIds: verdict?.evidenceIds ?? [],
      claims: verdict?.claims ?? [],
      ...(verdict?.missing ? { missing: verdict.missing } : {}),
      ...(verdict?.reasoning ? { reasoning: verdict.reasoning } : {}),
      evaluatedAt: verdict?.evaluatedAt ?? input.evaluatedAt,
    };

    if (!base.satisfied) return base;
    const evidenceById = new Map(input.evidence.map((row) => [row.id, row]));
    if (base.evidenceIds.length === 0) {
      return markVerdictUnsatisfied(
        base,
        "Satisfied verdict cited no evidence.",
      );
    }
    if (base.evidenceIds.some((id) => !evidenceById.has(id))) {
      return markVerdictUnsatisfied(
        base,
        "Satisfied verdict cited missing evidence.",
      );
    }
    if (
      base.claims.some((claim) => {
        const row = evidenceById.get(claim.evidenceId);
        return !row || !evidenceSupportsClaim(row, claim);
      })
    ) {
      return markVerdictUnsatisfied(
        base,
        "Satisfied verdict made an unsupported typed evidence claim.",
      );
    }
    return base;
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

  private assertValidPlaybookBody(body: PlaybookBody): void {
    const stateIds = new Set(body.states.map((state) => state.id));
    if (!stateIds.has(body.initialState)) {
      throw new Error(
        `Playbook initial state '${body.initialState}' is not defined.`,
      );
    }
    for (const finalState of body.finalStates) {
      if (!stateIds.has(finalState)) {
        throw new Error(`Playbook final state '${finalState}' is not defined.`);
      }
    }
    for (const state of body.states) {
      for (const transition of state.transitions) {
        if (!stateIds.has(transition.target)) {
          throw new Error(
            `Playbook transition '${state.id}' -> '${transition.target}' targets an undefined state.`,
          );
        }
      }
    }
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
    const activeRun = input.runId
      ? runs.find((run) => run.id === input.runId)
      : input.lifecycle
        ? runs.find((run) => run.lifecycle === input.lifecycle)
        : input.playbookId
          ? runs.find((run) => run.playbookId === input.playbookId)
          : input.conversationId
            ? await this.requireScopedRun({
                conversationId: input.conversationId,
              })
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
    const validEvents =
      currentState && activeRun && parsedPlaybook
        ? this.getValidTransitions(activeRun, parsedPlaybook.body, currentState)
        : (currentState?.transitions ?? []);

    return {
      runs,
      ...(activeRun ? { activeRun } : {}),
      ...(parsedPlaybook ? { playbook: parsedPlaybook.entity } : {}),
      ...(parsedPlaybook ? { body: parsedPlaybook.body } : {}),
      ...(currentState ? { currentState } : {}),
      ...(validEvents.length > 0 ? { validEvents } : {}),
      lifecycle: this.config.lifecycle,
    };
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
        ...(conversationId ? { conversationId } : {}),
        ...(stringFromPayload(payload, "toolCallId")
          ? { toolCallId: stringFromPayload(payload, "toolCallId") }
          : {}),
      },
    };
    await this.store.upsert({ ...run, evidence: [...run.evidence, evidence] });
    return { recorded: true };
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
    return { entity: parsed.data, body };
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
    channelId?: string | undefined;
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
    channelId?: string | undefined;
  }): Promise<PlaybookRun> {
    if (input.runId) return this.requireRun(input.runId);
    const conversationId = input.conversationId ?? input.channelId;
    if (!conversationId) {
      throw new Error("Missing runId and no active conversation channel.");
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
    const evidenceWatermark = computeEvidenceWatermark(
      this.evidenceForState(run, state.id),
    );
    return state.doneWhen.every((condition) =>
      run.gateVerdicts.some(
        (verdict) =>
          verdict.stateId === state.id &&
          verdict.conditionHash === conditionHash(condition) &&
          verdict.evidenceWatermark === evidenceWatermark &&
          verdict.satisfied,
      ),
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
    return transition.description
      ? `- ${transition.event} -> ${transition.target}: ${transition.description}`
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
    const evidenceWatermark = computeEvidenceWatermark(
      this.evidenceForState(run, state.id),
    );
    return state.doneWhen
      .map((condition) => {
        const verdict = run.gateVerdicts.find(
          (candidate) =>
            candidate.stateId === state.id &&
            candidate.conditionHash === conditionHash(condition) &&
            candidate.evidenceWatermark === evidenceWatermark,
        );
        if (!verdict) return `- Not yet satisfied: ${condition}`;
        if (verdict.satisfied) return `- Satisfied: ${condition}`;
        const missing = verdict.missing?.join("; ") ?? "missing evidence";
        return `- Not yet satisfied: ${condition} (${missing})`;
      })
      .join("\n");
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

    const validTransitions = this.getValidTransitions(
      run,
      playbook.body,
      state,
    );
    const validTransitionKeys = new Set(
      validTransitions.map(
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
    const blockedEvents = blockedTransitions
      .map((transition) => this.formatTransition(transition))
      .join("\n");
    const doneWhen = state.doneWhen
      .map((condition) => `- ${condition}`)
      .join("\n");
    const verifierStatus = this.formatVerifierStatus(run, state);

    return {
      id: run.id,
      source: "active-playbook",
      title: `${playbook.entity.metadata.title} — state: ${state.id}`,
      content: `Current playbook: ${playbook.entity.metadata.title}
Run ID: ${run.id}
Current state: ${state.id} (${state.title})

Use this run ID for run-scoped playbook tools when explicit run identity is needed.

State instructions:
${state.instructions.map((instruction) => `- ${instruction}`).join("\n")}

Done when:
${doneWhen || "- none"}

Verifier status:
${verifierStatus}

Valid events:
${validEvents || "- none"}

Blocked events:
${blockedEvents || "- none"}`,
      provenance: {
        playbookId: run.playbookId,
        runId: run.id,
        currentState: run.currentState,
        validEvents: validTransitions.map((transition) => transition.event),
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
When a playbook run is active, use playbook_status before deciding what to do next.
Follow the playbook's current state instructions, operating rules, and Done When conditions.
Do not set arbitrary current states or claim a state is complete yourself. Advance by calling playbook_send_event with a valid event; the runtime verifier decides whether gated transitions are allowed.
Do not behave like a form. Ask one question at a time unless the playbook state says otherwise.
Teach by doing real actions with existing tools.
After meaningful tool actions, explain what happened and why it matters.
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts. Runtime evidence from those actions is attached to the active run automatically where supported.
Call playbook_complete only after the current state is a final state or the tool says completion is allowed.
Do not publish content unless the operator explicitly asks and confirms the publishing action.

Configured lifecycle playbooks:
${lifecycleSummary || "- none"}`;
  }
}

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function conditionHash(condition: string): string {
  return computeContentHash(condition);
}

function computeEvidenceWatermark(evidence: PlaybookRunEvidence[]): string {
  return computeContentHash(
    JSON.stringify(
      evidence.map((row) => ({ id: row.id, observedAt: row.observedAt })),
    ),
  );
}

function markVerdictUnsatisfied(
  verdict: PlaybookGateVerdict,
  missing: string,
): PlaybookGateVerdict {
  return {
    ...verdict,
    satisfied: false,
    missing: [...(verdict.missing ?? []), missing],
  };
}

function evidenceSupportsClaim(
  evidence: PlaybookRunEvidence,
  claim: PlaybookGateVerdict["claims"][number],
): boolean {
  if (evidence.kind !== claim.kind) return false;
  return Object.entries(claim.data).every(
    ([key, value]) => evidence.data[key] === value,
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
  return `${verdict.stateId}\u0000${verdict.conditionHash}\u0000${verdict.evidenceWatermark}`;
}

function stringFromPayload(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const defaultGateVerifier: PlaybookGateVerifier = {
  async verify({ conditions, stateId, evidenceWatermark }) {
    return conditions.map((condition) => ({
      stateId,
      condition,
      conditionHash: conditionHash(condition),
      evidenceWatermark,
      satisfied: false,
      source: "llm-judge",
      evidenceIds: [],
      claims: [],
      missing: ["No playbook gate verifier is configured."],
    }));
  },
};

export function playbooksPlugin(
  config: Partial<PlaybooksConfig> = {},
  deps: PlaybooksPluginDeps = {},
): PlaybooksPlugin {
  return new PlaybooksPlugin(config, deps);
}
