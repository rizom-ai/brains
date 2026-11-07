import { describe, expect, it, mock } from "bun:test";
import type { CallerPrincipal } from "@brains/content-service";
import { SdkError, toSdkError } from "@brains/contracts";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import type { ServiceJobs } from "../src/service/service-definition-contract";
import {
  defineJob,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
  type ToolContext,
} from "../src";

const SECRET = "the private body of tide-1";

const lookup = defineJob({
  name: "lookup",
  input: z.object({ outcome: z.enum(["missing", "crash", "malformed", "ok"]) }),
  output: z.object({ found: z.boolean() }),
});

const admin: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_admin" },
  userPermissionLevel: "admin",
};

async function install(shell: MockShell): Promise<{
  jobs: ServiceJobs;
  start: (outcome: z.input<typeof lookup.input>["outcome"]) => Promise<string>;
}> {
  let captured: ServiceJobs | undefined;
  const definition = defineServicePlugin(
    { id: "lookups", config: z.object({}) },
    {
      jobs: () => [
        lookup.handle(async ({ input }) => {
          if (input.outcome === "missing") {
            throw new SdkError("not_found", { message: SECRET });
          }
          if (input.outcome === "crash") throw new Error(SECRET);
          if (input.outcome === "malformed") {
            // A handler answering outside its output schema, untyped.
            return JSON.parse(`{"found":"${SECRET}"}`);
          }
          return { found: true };
        }),
      ],
      tools: ({ jobs }) => {
        captured = jobs;
        return [
          defineTool({
            name: "start",
            description: "Start a lookup",
            input: lookup.input,
            output: z.object({ jobId: z.string() }),
            execute: async ({ input }) => ({
              jobId: (await jobs.enqueue(lookup, input)).id,
            }),
          }),
        ];
      },
    },
  );
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name: "@fixture/lookups",
      version: "0.1.0",
    },
  );
  if (!plugin) throw new Error("No service plugin");
  const capabilities = await plugin.register(shell);
  const tool = capabilities.tools[0];
  if (!tool || !captured) throw new Error("No tool registered");
  return {
    jobs: captured,
    start: async (outcome) =>
      z
        .object({ data: z.object({ jobId: z.string() }) })
        .parse(await tool.handler({ outcome }, admin)).data.jobId,
  };
}

/** Runs a queued job as the worker does and returns how it failed. */
async function failureOf(shell: MockShell, jobId: string): Promise<SdkError> {
  const queue = shell.getJobQueueService();
  const job = await queue.getStatus(jobId);
  const handler = job && queue.getHandler(job.type);
  if (!job || !handler) throw new Error(`No job ${jobId}`);
  const data = handler.validateAndParse(JSON.parse(job.data));
  if (data === null) throw new Error("Refused job data");
  return handler
    .process(
      data,
      job.id,
      createMockProgressReporter(),
      new AbortController().signal,
    )
    .then(
      () => {
        throw new Error("Expected the job to fail");
      },
      (error: unknown) => toSdkError(error),
    );
}

function adminShell(): MockShell {
  return createMockShell({
    resolvePrincipal: mock(async (): Promise<CallerPrincipal | null> => ({
      userId: "usr_admin",
      permissionLevel: "admin",
    })),
  });
}

describe("a service job's failure is reported as a code", () => {
  it("keeps the code a handler throws", async () => {
    const shell = adminShell();
    const { start } = await install(shell);
    expect((await failureOf(shell, await start("missing"))).code).toBe(
      "not_found",
    );
    expect((await failureOf(shell, await start("crash"))).code).toBe(
      "handler_failed",
    );
  });

  it("reports an answer outside the output schema as an invalid response", async () => {
    const shell = adminShell();
    const { start } = await install(shell);
    expect((await failureOf(shell, await start("malformed"))).code).toBe(
      "invalid_response",
    );
  });

  it("reports a requester whose account is gone as denied", async () => {
    const resolvePrincipal = mock(
      async (): Promise<CallerPrincipal | null> => ({
        userId: "usr_admin",
        permissionLevel: "admin",
      }),
    );
    const shell = createMockShell({ resolvePrincipal });
    const { start } = await install(shell);
    const jobId = await start("ok");
    resolvePrincipal.mockResolvedValue(null);
    expect((await failureOf(shell, jobId)).code).toBe("permission_denied");
  });

  it("tells a status reader the failure's public form, never the diagnostic", async () => {
    const shell = adminShell();
    const { jobs, start } = await install(shell);
    const queue = shell.getJobQueueService();
    const recorded = async (error: Error): Promise<string> => {
      const jobId = await start("missing");
      await queue.fail(jobId, error);
      return jobId;
    };

    // An SdkError's public message is safe to publish, so it survives.
    const explained = await recorded(
      new SdkError("not_found", {
        message: SECRET,
        publicMessage: "Save the bookmark first",
      }),
    );
    const status = await jobs.status(lookup, explained);
    expect(status).toMatchObject({
      code: "not_found",
      error: "Save the bookmark first",
    });
    expect(JSON.stringify(status)).not.toContain(SECRET);

    // A plain error's message is diagnostic, so its code's wording stands in.
    const crashed = await recorded(new Error(SECRET));
    const crashStatus = await jobs.status(lookup, crashed);
    expect(crashStatus).toMatchObject({
      code: "handler_failed",
      error: "The operation failed",
    });
    expect(JSON.stringify(crashStatus)).not.toContain(SECRET);

    // A failure recorded before the public form was kept reads as a failed
    // handler, and a malformed one is not trusted.
    const job = await queue.getStatus(explained);
    if (!job) throw new Error("Missing job");
    for (const stored of [null, { code: "teapot", message: SECRET }]) {
      Object.assign(job, { lastErrorPublic: stored });
      const read = await jobs.status(lookup, explained);
      expect(read).toMatchObject({
        code: "handler_failed",
        error: "The operation failed",
      });
      expect(JSON.stringify(read)).not.toContain(SECRET);
    }
  });

  it("reports no code for a job that has not failed", async () => {
    const shell = adminShell();
    const { jobs, start } = await install(shell);
    const status = await jobs.status(lookup, await start("ok"));
    expect(status?.status).toBe("pending");
    expect(status).not.toHaveProperty("code");
    expect(status).not.toHaveProperty("error");
  });
});
