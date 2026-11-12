import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  firstPartyJobHandler,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withJobHandlers,
  type Plugin,
} from "../src";

/**
 * A first-party service converted from a class finishes its registration
 * where the rest of its class's onRegister ran: after the job handlers it
 * declares beside its definition are registered, so a replay it runs there
 * can queue its own jobs. Awaited as the package; a failure fails the
 * package's registration, as a throwing onRegister did.
 */

function probe(
  finish: (enqueue: () => Promise<string>) => Promise<void>,
): Plugin {
  const service = defineServicePlugin({
    id: "probe",
    config: z.object({}),
    setup: (context) => {
      const runtime = serviceRuntime(context);
      runtime.registering(() =>
        finish(() =>
          runtime.jobs.enqueueBatch(
            [{ type: "replay", data: { path: "note/a.md" } }],
            {
              source: "probe-replay",
              metadata: { operationType: "file_operations" },
            },
          ),
        ),
      );
      return {};
    },
  });
  const [plugin] = instantiatePluginPackageDefinition(
    withJobHandlers(service, () => [
      firstPartyJobHandler({
        type: "replay",
        input: z.object({ path: z.string() }),
        process: async () => "replayed",
      }),
    ]),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  return plugin;
}

describe("a first-party service finishing its registration", () => {
  it("runs once its own job handlers are registered, so it can queue them", async () => {
    const shell = createMockShell();
    const steps: string[] = [];
    await probe(async (enqueue) => {
      steps.push(
        shell.getJobQueueService().getValidator("probe:replay")
          ? "handler registered"
          : "no handler",
      );
      steps.push(`queued ${typeof (await enqueue())}`);
    }).register(shell);
    expect(steps).toEqual(["handler registered", "queued string"]);
  });

  it("fails the package's registration when it fails", async () => {
    const shell = createMockShell();
    expect(
      await probe(async () => {
        throw new Error("Git broker unavailable");
      })
        .register(shell)
        .catch((error: unknown) => error),
    ).toEqual(new Error("Git broker unavailable"));
  });
});
