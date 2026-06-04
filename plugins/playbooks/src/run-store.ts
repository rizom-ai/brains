import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createPrefixedId, z } from "@brains/utils";

export const playbookRunStatusSchema = z.enum([
  "offered",
  "active",
  "completed",
  "dismissed",
]);

export const playbookRunEntityRefSchema = z
  .object({
    entityType: z.string().min(1),
    entityId: z.string().min(1),
    purpose: z.string().min(1).optional(),
  })
  .strict();

export const playbookRunSchema = z
  .object({
    id: z.string().min(1),
    playbookId: z.string().min(1),
    lifecycle: z.string().min(1).optional(),
    status: playbookRunStatusSchema,
    conversationId: z.string().min(1).optional(),
    currentPhase: z.string().min(1).optional(),
    notes: z.record(z.string(), z.unknown()).default({}),
    createdEntities: z.array(playbookRunEntityRefSchema).default([]),
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
export type PlaybookRunEntityRef = z.infer<typeof playbookRunEntityRefSchema>;

export class PlaybookRunStore {
  private readonly filePath: string;

  constructor(storageDir: string) {
    this.filePath = join(storageDir, "runs.json");
  }

  async list(): Promise<PlaybookRun[]> {
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

  async upsert(run: PlaybookRun): Promise<PlaybookRun> {
    const file = await this.readFile();
    const nextRun = playbookRunSchema.parse({
      ...run,
      updatedAt: new Date().toISOString(),
    });
    const existingIndex = file.runs.findIndex(
      (existing) => existing.id === run.id,
    );
    const runs =
      existingIndex === -1
        ? [...file.runs, nextRun]
        : file.runs.map((existing, index) =>
            index === existingIndex ? nextRun : existing,
          );
    await this.writeFile({ runs });
    return nextRun;
  }

  async reset(runId?: string): Promise<void> {
    if (!runId) {
      await this.writeFile({ runs: [] });
      return;
    }
    const file = await this.readFile();
    await this.writeFile({
      runs: file.runs.filter((run) => run.id !== runId),
    });
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
  lifecycle?: string | undefined;
  conversationId?: string | undefined;
  status?: PlaybookRunStatus | undefined;
}): PlaybookRun {
  const now = new Date().toISOString();
  return playbookRunSchema.parse({
    id: createPrefixedId("playbook_run"),
    playbookId: input.playbookId,
    ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
    status: input.status ?? "active",
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    notes: {},
    createdEntities: [],
    ...(input.status === "active" || input.status === undefined
      ? { startedAt: now }
      : {}),
    updatedAt: now,
  });
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
