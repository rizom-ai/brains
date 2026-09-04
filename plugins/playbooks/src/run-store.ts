import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/runtime-state";
import { createPrefixedId } from "@brains/utils/id";
import { SerialQueue } from "@brains/utils/serial-queue";
import { z } from "@brains/utils/zod";

export const playbookRunStatusSchema: z.ZodEnum<{
  offered: "offered";
  active: "active";
  completed: "completed";
  dismissed: "dismissed";
}> = z.enum(["offered", "active", "completed", "dismissed"]);

export type PlaybookRunStatus = z.output<typeof playbookRunStatusSchema>;

export const playbookRunEvidenceSchema: z.ZodObject<
  {
    id: z.ZodString;
    kind: z.ZodEnum<{ entity_event: "entity_event" }>;
    stateId: z.ZodOptional<z.ZodString>;
    observedAt: z.ZodString;
    data: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  },
  z.core.$strict
> = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["entity_event"]),
    stateId: z.string().min(1).optional(),
    observedAt: z.string().datetime(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export type PlaybookRunEvidence = z.output<typeof playbookRunEvidenceSchema>;

export const playbookGateVerdictSchema: z.ZodObject<
  {
    stateId: z.ZodString;
    goal: z.ZodArray<z.ZodString>;
    met: z.ZodBoolean;
    reason: z.ZodString;
    evaluatedAt: z.ZodString;
  },
  z.core.$strict
> = z
  .object({
    stateId: z.string().min(1),
    goal: z.array(z.string().min(1)),
    met: z.boolean(),
    reason: z.string().min(1),
    evaluatedAt: z.string().datetime(),
  })
  .strict();

export type PlaybookGateVerdict = z.output<typeof playbookGateVerdictSchema>;

export const playbookRunSchema: z.ZodObject<
  {
    id: z.ZodString;
    playbookId: z.ZodString;
    playbookVersion: z.ZodString;
    lifecycle: z.ZodOptional<z.ZodString>;
    status: typeof playbookRunStatusSchema;
    conversationId: z.ZodOptional<z.ZodString>;
    currentState: z.ZodString;
    completedStates: z.ZodDefault<z.ZodArray<z.ZodString>>;
    snapshot: z.ZodOptional<z.ZodUnknown>;
    context: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    evidence: z.ZodDefault<z.ZodArray<typeof playbookRunEvidenceSchema>>;
    gateVerdicts: z.ZodDefault<z.ZodArray<typeof playbookGateVerdictSchema>>;
    startedAt: z.ZodOptional<z.ZodString>;
    completedAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodString;
  },
  z.core.$strict
> = z
  .object({
    id: z.string().min(1),
    playbookId: z.string().min(1),
    playbookVersion: z.string().min(1),
    lifecycle: z.string().min(1).optional(),
    status: playbookRunStatusSchema,
    conversationId: z.string().min(1).optional(),
    currentState: z.string().min(1),
    completedStates: z.array(z.string().min(1)).default([]),
    /** Legacy XState snapshot. No longer read or written; kept so stored runs still parse. */
    snapshot: z.unknown().optional(),
    context: z.record(z.string(), z.unknown()).default({}),
    evidence: z.array(playbookRunEvidenceSchema).default([]),
    gateVerdicts: z.array(playbookGateVerdictSchema).default([]),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type PlaybookRun = z.output<typeof playbookRunSchema>;
export type PlaybookRunInput = z.input<typeof playbookRunSchema>;

const playbookRunsNamespace = "playbooks.runs";

export class PlaybookRunStore {
  private readonly store: IRuntimeStateStore<PlaybookRun>;
  private readonly writeQueue = new SerialQueue();

  constructor(runtimeState: IRuntimeStateNamespace) {
    this.store = runtimeState.scoped<PlaybookRun>({
      namespace: playbookRunsNamespace,
      schema: playbookRunSchema,
    });
  }

  async list(): Promise<PlaybookRun[]> {
    await this.waitForWrites();
    const records = await this.store.list();
    return records.map((record) => record.value);
  }

  async findById(runId: string): Promise<PlaybookRun | undefined> {
    return (await this.store.get(runId)) ?? undefined;
  }

  async findActiveByPlaybook(
    playbookId: string,
  ): Promise<PlaybookRun | undefined> {
    return (await this.list()).find(
      (run) =>
        run.playbookId === playbookId &&
        (run.status === "active" || run.status === "offered"),
    );
  }

  async findByLifecycle(lifecycle: string): Promise<PlaybookRun | undefined> {
    return (await this.list()).find((run) => run.lifecycle === lifecycle);
  }

  async findActiveByConversation(
    conversationId: string,
  ): Promise<PlaybookRun | undefined> {
    return (await this.listActiveByConversation(conversationId))[0];
  }

  async listActiveByConversation(
    conversationId: string,
  ): Promise<PlaybookRun[]> {
    return (await this.list()).filter(
      (run) =>
        run.conversationId === conversationId &&
        (run.status === "active" || run.status === "offered"),
    );
  }

  async upsert(run: PlaybookRun): Promise<PlaybookRun> {
    return this.enqueueMutation(async () => {
      const existing = await this.store.get(run.id);
      const nextRun = playbookRunSchema.parse({
        ...run,
        evidence: mergeEvidence(existing?.evidence ?? [], run.evidence),
        gateVerdicts: mergeGateVerdicts(
          existing?.gateVerdicts ?? [],
          run.gateVerdicts,
        ),
        updatedAt: new Date().toISOString(),
      });
      await this.store.set(nextRun.id, nextRun);
      return nextRun;
    });
  }

  async appendEvidence(
    runId: string,
    evidence: PlaybookRunEvidence,
  ): Promise<PlaybookRun> {
    return this.enqueueMutation(async () => {
      const existing = await this.store.get(runId);
      if (!existing) {
        throw new Error(`Playbook run not found: ${runId}`);
      }
      const nextRun = playbookRunSchema.parse({
        ...existing,
        evidence: mergeEvidence(existing.evidence, [evidence]),
        updatedAt: new Date().toISOString(),
      });
      await this.store.set(nextRun.id, nextRun);
      return nextRun;
    });
  }

  async reset(runId?: string): Promise<void> {
    await this.enqueueMutation(async () => {
      if (!runId) {
        await this.store.clear();
        return;
      }
      await this.store.delete(runId);
    });
  }

  private async enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    return this.writeQueue.run(operation);
  }

  private async waitForWrites(): Promise<void> {
    await this.writeQueue.idle();
  }
}

export function createPlaybookRun(input: {
  playbookId: string;
  playbookVersion: string;
  initialState: string;
  lifecycle?: string | undefined;
  conversationId?: string | undefined;
  status?: PlaybookRunStatus | undefined;
}): PlaybookRun {
  const now = new Date().toISOString();
  return playbookRunSchema.parse({
    id: createPrefixedId("playbook_run"),
    playbookId: input.playbookId,
    playbookVersion: input.playbookVersion,
    ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
    status: input.status ?? "active",
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    currentState: input.initialState,
    completedStates: [],
    context: {},
    evidence: [],
    gateVerdicts: [],
    ...(input.status === "active" || input.status === undefined
      ? { startedAt: now }
      : {}),
    updatedAt: now,
  });
}

function mergeEvidence(
  existing: PlaybookRunEvidence[],
  incoming: PlaybookRunEvidence[],
): PlaybookRunEvidence[] {
  const merged = new Map<string, PlaybookRunEvidence>();
  for (const evidence of [...existing, ...incoming]) {
    merged.set(evidence.id, evidence);
  }
  return Array.from(merged.values());
}

function mergeGateVerdicts(
  existing: PlaybookGateVerdict[],
  incoming: PlaybookGateVerdict[],
): PlaybookGateVerdict[] {
  const merged = new Map<string, PlaybookGateVerdict>();
  for (const verdict of [...existing, ...incoming]) {
    merged.set(gateVerdictKey(verdict), verdict);
  }
  return Array.from(merged.values());
}

function gateVerdictKey(verdict: PlaybookGateVerdict): string {
  return [verdict.stateId, ...verdict.goal].join("\u0000");
}
