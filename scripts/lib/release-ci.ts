import { z } from "@brains/utils/zod";

const runSchema = z.object({
  id: z.number().int().positive(),
  head_sha: z.string(),
  head_branch: z.string().nullable(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
});
const runsSchema = z.object({ workflow_runs: z.array(runSchema) });

export interface ReleaseCiOperations {
  runs(): Promise<unknown>;
  mainSha(): Promise<string>;
  dispatch(): Promise<void>;
  wait(): Promise<void>;
  now(): number;
}

/** Approve the checked-out source, never the triggering run's older SHA. */
export async function verifyReleaseCi(
  sha: string,
  operations: ReleaseCiOperations,
  timeoutMs = 45 * 60_000,
): Promise<number> {
  z.string()
    .regex(/^[a-f0-9]{40}$/u)
    .parse(sha);
  const deadline = operations.now() + timeoutMs;
  let dispatched = false;
  while (operations.now() < deadline) {
    const runs = runsSchema.parse(await operations.runs()).workflow_runs;
    const latest = runs
      .filter(
        (run) =>
          run.head_sha === sha &&
          run.head_branch === "main" &&
          (run.event === "push" || run.event === "workflow_dispatch"),
      )
      .sort((a, b) => b.id - a.id)[0];
    if (latest?.status === "completed") {
      if (latest.conclusion !== "success")
        throw new Error(
          `CI run ${latest.id} for ${sha} concluded ${latest.conclusion}; refusing release`,
        );
      return latest.id;
    }
    if (!latest) {
      if ((await operations.mainSha()) !== sha)
        throw new Error(
          `main advanced beyond ${sha}; rerun release for the current source`,
        );
      if (!dispatched) {
        await operations.dispatch();
        dispatched = true;
      }
    }
    await operations.wait();
  }
  throw new Error(
    `Timed out waiting for successful CI for ${sha}; refusing release`,
  );
}
