import { expect, it } from "bun:test";
import { createId } from "@brains/utils/id";
import { createSilentLogger } from "@brains/test-utils";
import { createJobQueueDatabase } from "../src/db";
import { JobQueueService } from "../src/job-queue-service";
import { migrateJobQueue } from "../src/migrate";
import type { JobQueueDbConfig } from "../src/types";

const remoteUrl = process.env["JOB_QUEUE_REMOTE_TEST_URL"];
const remoteAuthToken = process.env["JOB_QUEUE_REMOTE_TEST_AUTH_TOKEN"];

it.skipIf(!remoteUrl)(
  "preserves atomic skip across two remote libSQL clients",
  async () => {
    if (!remoteUrl) throw new Error("Remote job queue test URL is missing");
    const config: JobQueueDbConfig = {
      url: remoteUrl,
      ...(remoteAuthToken ? { authToken: remoteAuthToken } : {}),
    };
    await migrateJobQueue(config, createSilentLogger());

    const type = `remote-contract:${createId()}`;
    const deduplicationKey = `remote-contract:${createId()}`;
    const first = JobQueueService.createFresh(config, createSilentLogger());
    const second = JobQueueService.createFresh(config, createSilentLogger());
    const handler = {
      validateAndParse: (data: unknown): unknown => data,
      process: async (): Promise<void> => {},
    };
    first.registerHandler(type, handler);
    second.registerHandler(type, handler);

    try {
      await Promise.all([first.initialize(), second.initialize()]);
      const ids = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          (index % 2 === 0 ? first : second).enqueue({
            type,
            data: {},
            options: {
              source: "remote-contract",
              metadata: { operationType: "data_processing" },
              deduplication: "skip",
              deduplicationKey,
            },
          }),
        ),
      );

      expect(new Set(ids).size).toBe(1);
      expect(await first.getActiveJobs([type])).toHaveLength(1);
    } finally {
      first.close();
      second.close();
      const database = createJobQueueDatabase(config);
      try {
        await database.client.execute({
          sql: "DELETE FROM `job_queue` WHERE `type` = ?",
          args: [type],
        });
      } finally {
        database.client.close();
      }
    }
  },
);
