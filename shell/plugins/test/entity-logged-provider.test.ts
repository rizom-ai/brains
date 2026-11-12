import { describe, expect, it } from "bun:test";
import {
  publishRegisterContract,
  type PublishProvider,
} from "@brains/contracts";
import { caughtError } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import { SYSTEM_CHANNELS } from "../src/system-channels";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
  loggedProvider,
} from "../src";

/**
 * A first-party publish provider built with the plugin's logger, as an
 * entity plugin class built its LinkedIn client with a child of its own
 * logger: the runtime builds it when it hands the provider to the publish
 * pipeline, so a provider bound from config logs where the plugin logs.
 */

interface Logged {
  readonly path: readonly string[];
  readonly message: string;
}

/** A logger that records each message with the child contexts it came through. */
function recordingLogger(
  logged: Logged[],
  path: readonly string[] = [],
): Logger {
  const record =
    (): ((message: string) => void) =>
    (message: string): void => {
      logged.push({ path, message });
    };
  return {
    silly: record(),
    verbose: record(),
    debug: record(),
    info: record(),
    warn: record(),
    error: record(),
    child: (context: string): Logger =>
      recordingLogger(logged, [...path, context]),
    setUseStderr: (): void => undefined,
  };
}

const ledger = loggedProvider("ledger", (logger) => {
  const client = logger.child("LedgerClient");
  return {
    name: "ledger",
    publish: async (content): Promise<{ id: string }> => {
      client.info(`published ${content}`);
      return { id: "ledger-1" };
    },
  };
});

const entry = defineEntity({
  type: "entry",
  purpose: "An entry published to a ledger.",
  metadata: z.object({ title: z.string() }),
  publish: { provider: ledger },
});

const registration = z.looseObject({
  entityType: z.string(),
  provider: z.custom<PublishProvider>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      "publish" in value,
  ),
});

describe("a publish provider built with the plugin's logger", () => {
  it("is built when it is handed to the publish pipeline, and logs as the plugin", async () => {
    const logged: Logged[] = [];
    const harness = createPluginHarness({ logger: recordingLogger(logged) });
    const [plugin] = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "ledgers", entities: [entry] }),
      {},
      { name: "@fixture/ledgers", version: "0.1.0" },
    );
    if (!plugin) throw new Error("No ledger plugin");
    await harness.installPlugin(plugin);
    const heard: Array<z.output<typeof registration>> = [];
    harness.subscribe(publishRegisterContract.name, async (message) => {
      heard.push(registration.parse(message.payload));
      return { success: true };
    });
    await harness.sendMessage(
      SYSTEM_CHANNELS.pluginsRegistered,
      { timestamp: new Date().toISOString(), pluginCount: 1 },
      "shell",
      true,
    );

    const [registered] = heard;
    expect(registered?.provider.name).toBe("ledger");
    expect(await registered?.provider.publish("Entry one", {})).toEqual({
      id: "ledger-1",
    });
    expect(logged).toContainEqual({
      path: expect.arrayContaining(["LedgerClient"]),
      message: "published Entry one",
    });
    const published = logged.find(
      ({ message }) => message === "published Entry one",
    );
    expect(published?.path.length).toBeGreaterThan(1);
  });

  it("refuses to publish before the runtime builds it", async () => {
    expect(ledger.name).toBe("ledger");
    const refused = await ledger.publish("Entry", {}).then(
      () => undefined,
      (error: unknown) => caughtError(error),
    );
    expect(refused?.message).toBe(
      'Publish provider "ledger" is built by the brain\'s runtime',
    );
  });
});
