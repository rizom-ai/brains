import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  CallbackProgressReporter,
  type ProgressNotification,
} from "@brains/utils/progress";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineJob,
  defineServicePlugin,
  firstPartyJobHandler,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withJobHandlers,
  type PluginPackageDefinition,
  type ServicePackageDefinition,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service converted from a class runs the jobs its class
 * handled, as written: under the types its class registered, taking the
 * data its class queued (and other packages queue by type, and a queue
 * already holds at an upgrade) as the class's schema reads it, and running
 * as the package, as the class's handlers ran.
 */

const config = z.object({ size: z.number().default(3) });
const selection = z.object({
  photoId: z.string(),
  title: z.string().optional(),
});

async function register(
  definition: PluginPackageDefinition,
): Promise<ReturnType<typeof createMockShell>> {
  const shell = createMockShell();
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin was created");
  await plugin.register(shell);
  return shell;
}

describe("withJobHandlers", () => {
  it("runs its class's job under its type, on the data its class queued", async () => {
    const calls: unknown[] = [];
    let reached: ServiceRuntime | undefined;
    const service = withJobHandlers<typeof config, { size: number }>(
      defineServicePlugin({
        id: "probe",
        config,
        setup: ({ config: parsed }) => ({ size: parsed.size }),
      }),
      (context) => {
        reached = serviceRuntime(context);
        return [
          firstPartyJobHandler({
            type: "select-photo",
            input: selection,
            executionTimeoutMs: 60_000,
            exclusive: true,
            process: async ({ input, jobId, progress }) => {
              calls.push({
                input,
                jobId,
                size: context.state.size,
                call: reached?.toolCall(),
              });
              await progress.report({
                progress: 50,
                total: 100,
                message: "Half",
              });
              return { done: input.photoId };
            },
          }),
        ];
      },
    );
    const shell = await register(service);
    const handler = shell.getJobQueueService().getHandler("probe:select-photo");
    if (!handler) throw new Error("No handler under probe:select-photo");

    expect(handler.executionTimeoutMs).toBe(60_000);
    expect(handler.exclusive).toBe(true);
    // As written, with no requester beside it.
    const data = handler.validateAndParse({ photoId: "abc" });
    expect(data).toEqual({ photoId: "abc" });
    expect(handler.validateAndParse({ title: "no id" })).toBeNull();
    expect(
      handler.validateAndParse({ authority: {}, input: { photoId: "abc" } }),
    ).toBeNull();

    const reported: ProgressNotification[] = [];
    const progress = CallbackProgressReporter.from(async (notification) => {
      reported.push(notification);
    });
    if (!progress) throw new Error("No progress reporter");
    expect(
      await handler.process(
        data,
        "job-7",
        progress,
        new AbortController().signal,
      ),
    ).toEqual({ done: "abc" });
    expect(calls).toEqual([
      { input: { photoId: "abc" }, jobId: "job-7", size: 3, call: undefined },
    ]);
    expect(reported).toEqual([{ progress: 50, total: 100, message: "Half" }]);
  });

  it("refuses a type the definition's jobs already declare", async () => {
    const declared = defineJob({
      name: "select-photo",
      input: selection,
      output: z.object({}),
    });
    const service = withJobHandlers(
      defineServicePlugin(
        { id: "probe", config },
        { jobs: () => [declared.handle(async () => ({}))] },
      ),
      () => [
        {
          type: "select-photo",
          input: selection,
          process: async (): Promise<void> => {},
        },
      ],
    );
    expect(register(service)).rejects.toThrow(
      'Service "probe" registers job "select-photo" more than once',
    );
  });

  it("is declared once, on a definition defineServicePlugin returned", () => {
    const service = withJobHandlers(
      defineServicePlugin({ id: "probe", config }),
      () => [],
    );
    expect(() => withJobHandlers(service, () => [])).toThrow(
      'Service "probe" declares its job handlers more than once',
    );
    const forged: ServicePackageDefinition<typeof config> = {
      ...defineServicePlugin({ id: "probe", config }),
    };
    expect(() => withJobHandlers(forged, () => [])).toThrow(
      'withJobHandlers takes a definition defineServicePlugin returned; "probe" is not one',
    );
  });
});
