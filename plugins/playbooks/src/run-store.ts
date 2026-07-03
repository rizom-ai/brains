import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/runtime-state";
import { z } from "@brains/utils/zod";
import { createPrefixedId } from "@brains/utils/id";

export const playbookRunStatusSchema = z.enum([
  "offered",
  "active",
  "completed",
  "dismissed",
]);

export const playbookRunEvidenceSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["entity_event"]),
    stateId: z.string().min(1).optional(),
    observedAt: z.string().datetime(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

export const playbookGateVerdictSchema = z
  .object({
    stateId: z.string().min(1),
    goal: z.array(z.string().min(1)),
    met: z.boolean(),
    reason: z.string().min(1),
    evaluatedAt: z.string().datetime(),
  })
  .strict();

export const playbookRunSchema = z
  .object({
    id: z.string().min(1),
    playbookId: z.string().min(1),
    playbookVersion: z.string().min(1),
    lifecycle: z.string().min(1).optional(),
    status: playbookRunStatusSchema,
    conversationId: z.string().min(1).optional(),
    currentState: z.string().min(1),
    completedStates: z.array(z.string().min(1)).default([]),
    snapshot: z.unknown().optional(),
    context: z.record(z.string(), z.unknown()).default({}),
    evidence: z.array(playbookRunEvidenceSchema).default([]),
    gateVerdicts: z.array(playbookGateVerdictSchema).default([]),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type PlaybookRun = z.infer<typeof playbookRunSchema>;
export type PlaybookRunStatus = z.infer<typeof playbookRunStatusSchema>;
export type PlaybookRunEvidence = z.infer<typeof playbookRunEvidenceSchema>;
export type PlaybookGateVerdict = z.infer<typeof playbookGateVerdictSchema>;

const playbookRunsNamespace = "playbooks.runs";
const playbookRunStorageSchema = playbookRunSchema as z.ZodType<PlaybookRun>;

export class PlaybookRunStore {
  private readonly store: IRuntimeStateStore<PlaybookRun>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(runtimeState: IRuntimeStateNamespace) {
    this.store = runtimeState.scoped<PlaybookRun>({
      namespace: playbookRunsNamespace,
      schema: playbookRunStorageSchema,
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
    const previous = this.writeQueue;
    let release: () => void = () => {};
    this.writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async waitForWrites(): Promise<void> {
    await this.writeQueue;
  }
}

export function createPlaybookRun(input: {
  playbookId: string;
  playbookVersion: string;
  initialState: string;
  lifecycle?: string | undefined;
  conversationId?: string | undefined;
  status?: PlaybookRunStatus | undefined;
  snapshot?: unknown;
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
    ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
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
