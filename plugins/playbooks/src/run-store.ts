import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createPrefixedId, z } from "@brains/utils";

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

export const playbookRunsFileSchema = z
  .object({
    runs: z.array(playbookRunSchema).default([]),
  })
  .strict();

export type PlaybookRun = z.infer<typeof playbookRunSchema>;
export type PlaybookRunStatus = z.infer<typeof playbookRunStatusSchema>;
export type PlaybookRunEvidence = z.infer<typeof playbookRunEvidenceSchema>;
export type PlaybookGateVerdict = z.infer<typeof playbookGateVerdictSchema>;

export class PlaybookRunStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(storageDir: string) {
    this.filePath = join(storageDir, "runs.json");
  }

  async list(): Promise<PlaybookRun[]> {
    await this.waitForWrites();
    return (await this.readFile()).runs;
  }

  async findById(runId: string): Promise<PlaybookRun | undefined> {
    return (await this.list()).find((run) => run.id === runId);
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
      const file = await this.readFile();
      const existing = file.runs.find((candidate) => candidate.id === run.id);
      const nextRun = playbookRunSchema.parse({
        ...run,
        evidence: mergeEvidence(existing?.evidence ?? [], run.evidence),
        gateVerdicts: mergeGateVerdicts(
          existing?.gateVerdicts ?? [],
          run.gateVerdicts,
        ),
        updatedAt: new Date().toISOString(),
      });
      const existingIndex = file.runs.findIndex(
        (candidate) => candidate.id === run.id,
      );
      const runs =
        existingIndex === -1
          ? [...file.runs, nextRun]
          : file.runs.map((candidate, index) =>
              index === existingIndex ? nextRun : candidate,
            );
      await this.writeFile({ runs });
      return nextRun;
    });
  }

  async appendEvidence(
    runId: string,
    evidence: PlaybookRunEvidence,
  ): Promise<PlaybookRun> {
    return this.enqueueMutation(async () => {
      const file = await this.readFile();
      const existingIndex = file.runs.findIndex((run) => run.id === runId);
      const existing = file.runs[existingIndex];
      if (existingIndex === -1 || !existing) {
        throw new Error(`Playbook run not found: ${runId}`);
      }
      const nextRun = playbookRunSchema.parse({
        ...existing,
        evidence: mergeEvidence(existing.evidence, [evidence]),
        updatedAt: new Date().toISOString(),
      });
      await this.writeFile({
        runs: file.runs.map((run, index) =>
          index === existingIndex ? nextRun : run,
        ),
      });
      return nextRun;
    });
  }

  async reset(runId?: string): Promise<void> {
    await this.enqueueMutation(async () => {
      if (!runId) {
        await this.writeFile({ runs: [] });
        return;
      }
      const file = await this.readFile();
      await this.writeFile({
        runs: file.runs.filter((run) => run.id !== runId),
      });
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

  private async readFile(): Promise<{ runs: PlaybookRun[] }> {
    try {
      const content = await readFile(this.filePath, "utf8");
      return playbookRunsFileSchema.parse(JSON.parse(content));
    } catch (error) {
      if (isMissingFileError(error)) return { runs: [] };
      throw error;
    }
  }

  private async writeFile(file: { runs: PlaybookRun[] }): Promise<void> {
    const parsed = playbookRunsFileSchema.parse(file);
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
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

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
