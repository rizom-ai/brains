import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { JobQueueService } from "../../src/job-queue-service";
import { createSilentLogger } from "@brains/test-utils";

const [databaseUrl, startFile, readyFile, type, deduplicationKey] =
  Bun.argv.slice(2);
if (!databaseUrl || !startFile || !readyFile || !type || !deduplicationKey) {
  throw new Error("Missing concurrent enqueue fixture argument");
}

const service = JobQueueService.createFresh(
  { url: databaseUrl },
  createSilentLogger(),
);
service.registerHandler(type, {
  validateAndParse: (data): unknown => data,
  process: async (): Promise<void> => {},
});

try {
  await service.initialize();
  await writeFile(readyFile, "ready");
  while (!existsSync(startFile)) await Bun.sleep(2);

  const ids = await Promise.all(
    Array.from({ length: 10 }, () =>
      service.enqueue({
        type,
        data: {},
        options: {
          source: "cross-process-test",
          metadata: { operationType: "data_processing" },
          deduplication: "skip",
          deduplicationKey,
        },
      }),
    ),
  );
  process.stdout.write(JSON.stringify(ids));
} finally {
  service.close();
}
