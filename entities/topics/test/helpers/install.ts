import { mock } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  type PluginCapabilities,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import topicsPackage from "../../src";
import type { topicsPluginConfigSchema } from "../../src/schemas/config";

type Queue = ReturnType<
  ReturnType<PluginTestHarness["getMockShell"]>["getJobQueueService"]
>;
export const TOPIC_JOB = "@brains/topics:topics:extract";
export async function installTopics(
  options: {
    config?: z.input<typeof topicsPluginConfigSchema>;
    worker?: boolean;
    beforeInstall?: (harness: PluginTestHarness) => void;
  } = {},
): Promise<{
  harness: PluginTestHarness;
  capabilities: PluginCapabilities[];
  enqueue: ReturnType<typeof mock<Queue["enqueue"]>>;
  registerHandler: ReturnType<typeof mock<Queue["registerHandler"]>>;
}> {
  const harness = createPluginHarness({
    logContext: "ranked-topics",
    dataDir: `/tmp/topics-declarations-${randomUUID()}`,
  });
  const queue = harness.getMockShell().getJobQueueService();
  const enqueue = mock(queue.enqueue);
  const registerHandler = mock(queue.registerHandler);
  harness.getMockShell().getJobQueueService = (): Queue => ({
    ...queue,
    enqueue,
    registerHandler,
  });
  const sources = defineEntityPackage({
    id: "sources",
    entities: ["post", "note", "skill"].map((type) =>
      defineEntity({
        type,
        purpose: "Fixture source",
        metadata: z.object({}),
        config: { projectionSource: type !== "skill" },
      }),
    ),
  });
  for (const plugin of instantiatePluginPackageDefinition(
    sources,
    {},
    { name: "@fixture/topic-sources", version: "1" },
  ))
    await harness.installPlugin(plugin);
  options.beforeInstall?.(harness);
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of instantiatePluginPackageDefinition(
    topicsPackage,
    options.config ?? {},
    { name: "@brains/topics", version: "0.0.0-test" },
  )) {
    if (options.worker) {
      const register = plugin.register.bind(plugin);
      plugin.register = (shell, registration): Promise<PluginCapabilities> =>
        register(shell, { ...registration, executionOnly: true });
    }
    capabilities.push(await harness.installPlugin(plugin));
  }
  return { harness, capabilities, enqueue, registerHandler };
}
