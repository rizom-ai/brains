import type { ServicePluginContext, Tool, ToolResponse } from "@brains/plugins";
import { ServicePlugin, permissionToVisibilityScope } from "@brains/plugins";
import { z } from "@brains/utils";
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
};

const startInputSchema = {
  playbookId: z.string().min(1),
  lifecycle: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
};

const progressInputSchema = {
  runId: z.string().min(1),
  currentPhase: z.string().min(1).optional(),
  notes: z.record(z.string(), z.unknown()).optional(),
};

const recordEntityInputSchema = {
  runId: z.string().min(1),
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
  }

  protected override async getTools(): Promise<Tool[]> {
    return [
      {
        name: "playbook_status",
        description:
          "Get playbook lifecycle config, active runs, and optionally the resolved playbook content for a run/playbook/lifecycle.",
        inputSchema: statusInputSchema,
        visibility: "anchor",
        handler: async (input: unknown): Promise<ToolResponse> => {
          const parsed = z.object(statusInputSchema).parse(input);
          const data = await this.getStatus(parsed);
          return { success: true, data };
        },
      },
      {
        name: "playbook_start",
        description: "Start or resume a playbook run.",
        inputSchema: startInputSchema,
        visibility: "anchor",
        handler: async (input: unknown): Promise<ToolResponse> => {
          const parsed = z.object(startInputSchema).parse(input);
          const existing = await this.store.findActiveByPlaybook(
            parsed.playbookId,
          );
          const run = existing
            ? await this.store.upsert({
                ...existing,
                status: "active",
                ...(parsed.lifecycle ? { lifecycle: parsed.lifecycle } : {}),
                ...(parsed.conversationId
                  ? { conversationId: parsed.conversationId }
                  : {}),
                ...(existing.startedAt
                  ? {}
                  : { startedAt: new Date().toISOString() }),
              })
            : await this.store.upsert(
                createPlaybookRun({
                  playbookId: parsed.playbookId,
                  lifecycle: parsed.lifecycle,
                  conversationId: parsed.conversationId,
                }),
              );
          const data = await this.getStatus({ runId: run.id });
          return { success: true, data };
        },
      },
      {
        name: "playbook_record_progress",
        description:
          "Record current phase and transient notes for a playbook run.",
        inputSchema: progressInputSchema,
        visibility: "anchor",
        handler: async (input: unknown): Promise<ToolResponse> => {
          const parsed = z.object(progressInputSchema).parse(input);
          const run = await this.requireRun(parsed.runId);
          const nextRun = await this.store.upsert({
            ...run,
            ...(parsed.currentPhase
              ? { currentPhase: parsed.currentPhase }
              : {}),
            notes: { ...run.notes, ...(parsed.notes ?? {}) },
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
        handler: async (input: unknown): Promise<ToolResponse> => {
          const parsed = z.object(recordEntityInputSchema).parse(input);
          const run = await this.requireRun(parsed.runId);
          const ref: PlaybookRunEntityRef = {
            entityType: parsed.entityType,
            entityId: parsed.entityId,
            ...(parsed.purpose ? { purpose: parsed.purpose } : {}),
          };
          const alreadyRecorded = run.createdEntities.some(
            (entity) =>
              entity.entityType === ref.entityType &&
              entity.entityId === ref.entityId,
          );
          const nextRun = await this.store.upsert({
            ...run,
            createdEntities: alreadyRecorded
              ? run.createdEntities
              : [...run.createdEntities, ref],
          });
          const data = await this.getStatus({ runId: nextRun.id });
          return { success: true, data };
        },
      },
      {
        name: "playbook_complete",
        description: "Mark a playbook run complete.",
        inputSchema: runInputSchema,
        visibility: "anchor",
        handler: async (input: unknown): Promise<ToolResponse> => {
          const parsed = z.object(runInputSchema).parse(input);
          const run = await this.requireRun(parsed.runId);
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
      if (!playbook || playbook.metadata.status !== "active") continue;

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
  }): Promise<PlaybookStatusResponse> {
    const runs = await this.store.list();
    const activeRun = input.runId
      ? runs.find((run) => run.id === input.runId)
      : input.lifecycle
        ? runs.find((run) => run.lifecycle === input.lifecycle)
        : input.playbookId
          ? runs.find((run) => run.playbookId === input.playbookId)
          : runs.find(
              (run) => run.status === "active" || run.status === "offered",
            );

    const playbookId =
      input.playbookId ??
      activeRun?.playbookId ??
      (input.lifecycle
        ? this.config.lifecycle[input.lifecycle]?.playbookId
        : undefined);
    const playbook = playbookId
      ? await this.getPlaybook(playbookId)
      : undefined;

    return {
      runs,
      ...(activeRun ? { activeRun } : {}),
      ...(playbook ? { playbook } : {}),
      lifecycle: this.config.lifecycle,
    };
  }

  private async getPlaybook(
    playbookId: string,
  ): Promise<PlaybookEntity | undefined> {
    if (!this.ctx) return undefined;
    const entity = await this.ctx.entityService.getEntity({
      entityType: "playbook",
      id: playbookId,
      visibilityScope: permissionToVisibilityScope("anchor"),
    });
    const parsed = playbookEntitySchema.safeParse(entity);
    return parsed.success ? parsed.data : undefined;
  }

  private async requireRun(runId: string): Promise<PlaybookRun> {
    const run = await this.store.findById(runId);
    if (!run) throw new Error(`Playbook run not found: ${runId}`);
    return run;
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
Follow the playbook's purpose, operating rules, phases, and completion criteria.
Do not behave like a form. Ask one question at a time unless the playbook says otherwise.
Teach by doing real actions with existing tools.
After meaningful tool actions, explain what happened and why it matters.
Use existing entity tools for durable profile, site, notes, links, posts, projects, newsletters, and social drafts.
Call playbook_record_progress as phases advance.
Call playbook_record_entity when a tool-created entity is important to the run.
Call playbook_complete only after the playbook outcome is achieved or explicitly skipped.
Do not publish content unless the operator explicitly asks and confirms the publishing action.

Configured lifecycle playbooks:
${lifecycleSummary || "- none"}`;
  }
}

export function playbooksPlugin(
  config: Partial<PlaybooksConfig> = {},
): PlaybooksPlugin {
  return new PlaybooksPlugin(config);
}
