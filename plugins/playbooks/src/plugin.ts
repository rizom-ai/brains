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
import { z } from "@brains/utils";
import { createActor, createMachine } from "xstate";
import packageJson from "../package.json";
import {
  PlaybookRunStore,
  createPlaybookRun,
  type PlaybookRun,
  type PlaybookRunEntityRef,
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

const recordEntityInputSchema = {
  runId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  purpose: z.string().min(1).optional(),
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

export class PlaybooksPlugin extends ServicePlugin<PlaybooksConfig> {
  private store: PlaybookRunStore;
  private ctx: ServicePluginContext | undefined;

  constructor(config: Partial<PlaybooksConfig> = {}) {
    super("playbooks", packageJson, config, playbooksConfigSchema);
    this.store = new PlaybookRunStore(this.config.storageDir);
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
          const result = this.transitionRun(
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
            context: { ...run.data.context, ...(parsed.context ?? {}) },
          });
          const data = await this.getStatus({ runId: nextRun.id });
          return { success: true, data };
        },
      },
      {
        name: "playbook_record_entity",
        description:
          "Record an entity created or updated as an important result of a playbook run.",
        inputSchema: recordEntityInputSchema,
        visibility: "anchor",
        handler: async (
          input: unknown,
          toolContext: ToolContext,
        ): Promise<ToolResponse> => {
          const parsed = z.object(recordEntityInputSchema).parse(input);
          const run = await this.resolveScopedRunResponse({
            runId: parsed.runId,
            conversationId: parsed.conversationId,
            channelId: toolContext.channelId,
          });
          if (!run.success) return run;
          const ref: PlaybookRunEntityRef = {
            entityType: parsed.entityType,
            entityId: parsed.entityId,
            ...(parsed.purpose ? { purpose: parsed.purpose } : {}),
          };
          const alreadyRecorded = run.data.createdEntities.some(
            (entity) =>
              entity.entityType === ref.entityType &&
              entity.entityId === ref.entityId,
          );
          const nextRun = await this.store.upsert({
            ...run.data,
            createdEntities: alreadyRecorded
              ? run.data.createdEntities
              : [...run.data.createdEntities, ref],
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
    const machine = this.buildMachine(input.playbookId, input.body, []);
    const actor = createActor(machine);
    actor.start();
    const snapshot = actor.getPersistedSnapshot();
    actor.stop();
    return this.store.upsert(
      createPlaybookRun({
        playbookId: input.playbookId,
        initialState: input.body.initialState,
        lifecycle: input.lifecycle,
        conversationId: input.conversationId,
        snapshot,
      }),
    );
  }

  private transitionRun(
    run: PlaybookRun,
    body: PlaybookBody,
    event: string,
  ):
    | { success: true; currentState: string; snapshot: unknown }
    | { success: false; error: string } {
    const machine = this.buildMachine(
      run.playbookId,
      body,
      run.createdEntities,
    );
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
    };
  }

  private buildMachine(
    playbookId: string,
    body: PlaybookBody,
    createdEntities: PlaybookRunEntityRef[],
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
                          ...(this.transitionRequiresRecordedEntities(
                            state,
                            transition.event,
                          )
                            ? {
                                guard: (): boolean =>
                                  this.hasRequiredEntities(
                                    state,
                                    createdEntities,
                                  ),
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
    const validEvents = currentState?.transitions ?? [];

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

  private transitionRequiresRecordedEntities(
    state: PlaybookState,
    event: string,
  ): boolean {
    return (
      event === "NEXT" &&
      state.expectedEntities.some((expected) => expected.required === true)
    );
  }

  private hasRequiredEntities(
    state: PlaybookState,
    createdEntities: PlaybookRunEntityRef[],
  ): boolean {
    return state.expectedEntities
      .filter((expected) => expected.required === true)
      .every((expected) =>
        createdEntities.some(
          (entity) => entity.entityType === expected.entityType,
        ),
      );
  }

  private getState(
    body: PlaybookBody,
    stateId: string,
  ): PlaybookState | undefined {
    return body.states.find((state) => state.id === stateId);
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

    const validEvents = state.transitions
      .map((transition) =>
        transition.description
          ? `- ${transition.event} -> ${transition.target}: ${transition.description}`
          : `- ${transition.event} -> ${transition.target}`,
      )
      .join("\n");

    return {
      id: run.id,
      source: "active-playbook",
      title: `${playbook.entity.metadata.title} — state: ${state.id}`,
      content: `Current playbook: ${playbook.entity.metadata.title}
Current state: ${state.id} (${state.title})

State instructions:
${state.instructions.map((instruction) => `- ${instruction}`).join("\n")}

Completion criteria:
${state.completionCriteria.map((criterion) => `- ${criterion}`).join("\n")}

Valid events:
${validEvents || "- none"}`,
      provenance: {
        playbookId: run.playbookId,
        runId: run.id,
        currentState: run.currentState,
        validEvents: state.transitions.map((transition) => transition.event),
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
Follow the playbook's current state instructions, operating rules, and completion criteria.
Do not set arbitrary current states. Advance by calling playbook_send_event with a valid event.
Do not behave like a form. Ask one question at a time unless the playbook state says otherwise.
Teach by doing real actions with existing tools.
After meaningful tool actions, explain what happened and why it matters.
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts.
Call playbook_record_entity when a tool-created entity is important to the run.
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

export function playbooksPlugin(
  config: Partial<PlaybooksConfig> = {},
): PlaybooksPlugin {
  return new PlaybooksPlugin(config);
}
