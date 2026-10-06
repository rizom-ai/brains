import { expect, test } from "bun:test";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { runPackageMigrations } from "@brains/db";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { migrateJobQueue } from "../src/migrate";
import { jobQueue, jobWorkerSessions } from "../src/schema/job-queue";

const journalSchema = z.object({
  version: z.string(),
  dialect: z.string(),
  entries: z.array(
    z.object({
      idx: z.number(),
      version: z.string(),
      when: z.number(),
      tag: z.string(),
      breakpoints: z.boolean(),
    }),
  ),
});

test("upgrades exact persisted FAQ dispatch identities without replaying, rewriting payloads or changing attempts", async () => {
  const directory = await createTestDirectory("faq-job-identity");
  const config = { url: `file:${directory.dir}/jobs.db` };
  const client = createClient(config);
  try {
    const source = join(import.meta.dir, "../drizzle");
    const prior = join(directory.dir, "prior-migrations");
    await mkdir(join(prior, "meta"), { recursive: true });
    const journal = journalSchema.parse(
      await Bun.file(join(source, "meta/_journal.json")).json(),
    );
    const entries = journal.entries.filter((entry) => entry.idx < 6);
    for (const entry of entries)
      await copyFile(
        join(source, `${entry.tag}.sql`),
        join(prior, `${entry.tag}.sql`),
      );
    await writeFile(
      join(prior, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries }),
    );
    await runPackageMigrations({
      label: "job-queue",
      config,
      schema: { jobQueue, jobWorkerSessions },
      migrationsFolder: prior,
      authTokenEnv: "JOB_QUEUE_DATABASE_AUTH_TOKEN",
      logger: createSilentLogger(),
    });
    const payload =
      '{ "conversationId":"conversation", "messageId":"exact-reply", "position":7, "userPermissionLevel":"public" }';
    const originalMetadata = {
      pluginId: "faq",
      operationType: "data_processing",
      requestedByActor: { kind: "user", userId: "operator" },
      note: "preserve attribution",
    };
    for (const type of [
      "faq:faq-capture",
      "faq:faq-reconcile",
      "faq:faq-source-review",
    ]) {
      for (const status of ["pending", "processing", "completed", "failed"]) {
        await client.execute({
          sql: "INSERT INTO job_queue (id,type,data,metadata,status,createdAt,scheduledFor,retryCount,maxRetries,attemptId,workerSessionId,leaseExpiresAt,lastErrorCode,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            `${type}-${status}`,
            type,
            type === "faq:faq-source-review"
              ? '{ "sourceId":"network-piece:peer", "withdrawalId":"exact-delivery" }'
              : payload,
            JSON.stringify(originalMetadata),
            status,
            100,
            200,
            2,
            5,
            "attempt",
            "worker",
            300,
            "prior_error",
            "faq",
          ],
        });
      }
    }
    for (const [id, type, metadata, owner] of [
      ["foreign-owner", "faq:faq-capture", '{"pluginId":"another"}', "faq"],
      ["missing-owner", "faq:faq-capture", "{}", "faq"],
      ["malformed-owner", "faq:faq-capture", "not json", "faq"],
      ["foreign-source", "faq:faq-capture", '{"pluginId":"faq"}', "another"],
      ["missing-source", "faq:faq-capture", '{"pluginId":"faq"}', null],
      ["other-job", "faq:another", '{"pluginId":"faq"}', "faq"],
      [
        "foreign-review-owner",
        "faq:faq-source-review",
        '{"pluginId":"another"}',
        "faq",
      ],
      [
        "foreign-review-source",
        "faq:faq-source-review",
        '{"pluginId":"faq"}',
        "another",
      ],
      ["malformed-review-owner", "faq:faq-source-review", "not json", "faq"],
      [
        "already-qualified",
        "@brains/faq:capture:faq-capture",
        '{"pluginId":"@brains/faq:capture"}',
        "@brains/faq:capture",
      ],
    ] as const)
      await client.execute({
        sql: "INSERT INTO job_queue (id,type,data,metadata,createdAt,scheduledFor,source) VALUES (?,?,?,?,?,?,?)",
        args: [id, type, payload, metadata, 100, 200, owner],
      });
    const before = (await client.execute("SELECT * FROM job_queue ORDER BY id"))
      .rows;
    await migrateJobQueue(config, createSilentLogger());
    await migrateJobQueue(config, createSilentLogger());
    const after = (await client.execute("SELECT * FROM job_queue ORDER BY id"))
      .rows;
    expect(after).toHaveLength(before.length);
    for (const row of before) {
      const migrated = after.find((candidate) => candidate["id"] === row["id"]);
      const owned = String(row["id"]).startsWith("faq:");
      expect(migrated).toEqual(
        owned
          ? {
              ...row,
              type: String(row["type"]).replace("faq:", "@brains/faq:capture:"),
              source: "@brains/faq:capture",
              metadata: JSON.stringify({
                ...originalMetadata,
                pluginId: "@brains/faq:capture",
              }),
            }
          : row,
      );
    }
    // Also safe when the data statement committed but its migration acknowledgement did not.
    const sql = await Bun.file(join(source, "0006_scope_faq_jobs.sql")).text();
    await client.execute(sql);
    await client.execute(
      await Bun.file(join(source, "0007_scope_faq_source_review.sql")).text(),
    );
    expect(
      (await client.execute("SELECT * FROM job_queue ORDER BY id")).rows,
    ).toEqual(after);
  } finally {
    client.close();
    await directory.cleanup();
  }
});
