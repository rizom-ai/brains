/**
 * Testing a package without booting a brain.
 *
 * Every package in this repository tests through the runtime's own harness.
 * An external author cannot import that, so the only way to exercise a
 * published package was to install it into a packed brain and drive that —
 * a slow way to learn that a tool returns the wrong shape.
 *
 * This is the same harness, narrowed to what an author needs. Narrowed
 * deliberately, and further than it first looks necessary: the internal
 * harness hands back the runtime's own `Plugin`, `PluginCapabilities` and
 * `Template`, and each of those reaches the shell, the queue or the entity
 * service. Publishing them would put the runtime in the declarations of the
 * one entry point whose purpose is to keep authors out of it. What crosses
 * this boundary is a package definition going in, and names and answers
 * coming back.
 */

import { createPluginHarness } from "@brains/plugins/test";
import { instantiatePluginPackageDefinition } from "@brains/plugins";

export { createTempDataDir, createTempDataDirSync } from "@brains/plugins/test";

/** A record as a test seeds it: the parts a package reads, nothing else. */
export interface SeededEntity {
  readonly id: string;
  readonly entityType: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly contentHash?: string | undefined;
  readonly visibility?: "public" | "shared" | "restricted" | undefined;
  readonly created?: string | undefined;
  readonly updated?: string | undefined;
}

/** Who a test is calling as. Defaults to an admin on a test interface. */
export interface TestCaller {
  readonly interfaceType?: string | undefined;
  readonly permission?: "public" | "trusted" | "admin" | undefined;
}

/** One tool a package declared, as a test calls it. */
export interface InstalledTool {
  /** The name the runtime scoped it to. */
  readonly name: string;
  readonly description: string;
  /**
   * Call it, and read what it answered.
   *
   * A tool that refuses throws, so a test asserting the happy path does not
   * unwrap an envelope first, and one asserting a refusal says so with
   * `expect(...).rejects`.
   */
  call(input: unknown, caller?: TestCaller): Promise<unknown>;
}

/** What a package declared, once it is installed. */
export interface InstalledPackage {
  readonly tools: readonly InstalledTool[];
  readonly instructions: string | undefined;
}

/** A brain a test drives: install a package, seed records, ask it things. */
export interface BrainTestHarness {
  /**
   * Install what a package exports, configured the way a brain would.
   *
   * Takes the definition rather than a built plugin: instantiating one is
   * the runtime's job, and an author should not import the runtime to do it.
   */
  installPackage(
    definition: unknown,
    config?: unknown,
    metadata?: { readonly name: string; readonly version: string },
  ): Promise<InstalledPackage>;
  /**
   * Finish registration, the way a booting brain does.
   *
   * A package that waits for registration to complete before doing its work
   * does nothing until this runs.
   */
  finalizeRegistration(): Promise<void>;
  /** Ask over the bus, as another package would. */
  request<TResponse = unknown>(
    topic: string,
    payload: unknown,
  ): Promise<TResponse | undefined>;
  /** Announce over the bus, as the runtime would. */
  publish(topic: string, payload: unknown): Promise<void>;
  /** Put records in the brain for the package under test to read. */
  addEntities(entities: readonly SeededEntity[]): void;
  /** One record back, as the brain stores it. */
  getEntity(
    entityType: string,
    id: string,
  ): Promise<Record<string, unknown> | null>;
  /** The scoped names of every template registered so far. */
  templateNames(): readonly string[];
  /** Tear down what the test installed. */
  reset(): Promise<void>;
}

/** How the brain a test drives is set up. */
export interface BrainTestHarnessOptions {
  /** The brain's domain, for a package whose routes or links depend on it. */
  readonly domain?: string | undefined;
}

export function createBrainTestHarness(
  options: BrainTestHarnessOptions = {},
): BrainTestHarness {
  const harness = createPluginHarness(
    options.domain === undefined ? {} : { domain: options.domain },
  );

  return {
    installPackage: async (
      definition,
      config,
      metadata,
    ): Promise<InstalledPackage> => {
      const plugins = instantiatePluginPackageDefinition(
        // Whatever the package exported: the runtime validates it, which is
        // the check a test wants to run anyway.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the definition arrives as unknown so an author never names a runtime type to install their own package; the runtime parses it on the next line
        definition as Parameters<typeof instantiatePluginPackageDefinition>[0],
        config ?? {},
        metadata ?? { name: "@fixture/package", version: "0.0.0" },
      );
      let instructions: string | undefined;
      const tools: InstalledTool[] = [];
      for (const plugin of plugins) {
        const capabilities = await harness.installPlugin(plugin);
        instructions ??= capabilities.instructions;
        for (const tool of capabilities.tools) {
          tools.push({
            name: tool.name,
            description: tool.description,
            call: async (input, caller) => {
              const answer = await tool.handler(input, {
                interfaceType: caller?.interfaceType ?? "test",
                actor: { kind: "service", serviceId: "test" },
                userPermissionLevel: caller?.permission ?? "admin",
              });
              if (!("success" in answer) || !answer.success) {
                throw new Error(
                  `Tool "${tool.name}" refused: ${JSON.stringify(answer)}`,
                );
              }
              return answer.data;
            },
          });
        }
      }
      return { tools, instructions };
    },
    finalizeRegistration: () => harness.finalizeRegistration(),
    request: async <TResponse = unknown>(
      topic: string,
      payload: unknown,
    ): Promise<TResponse | undefined> =>
      harness.sendMessage<unknown, TResponse>(topic, payload),
    publish: async (topic, payload): Promise<void> => {
      await harness.sendMessage(topic, payload, "test", true);
    },
    addEntities: (entities): void => {
      // The harness takes each optional field as present-or-absent rather
      // than possibly-undefined, so a seeded record is rebuilt with only the
      // fields the test actually gave.
      harness.addEntities(
        entities.map((entity) => ({
          id: entity.id,
          entityType: entity.entityType,
          content: entity.content,
          metadata: entity.metadata,
          ...(entity.contentHash === undefined
            ? {}
            : { contentHash: entity.contentHash }),
          ...(entity.visibility === undefined
            ? {}
            : { visibility: entity.visibility }),
          ...(entity.created === undefined ? {} : { created: entity.created }),
          ...(entity.updated === undefined ? {} : { updated: entity.updated }),
        })),
      );
    },
    getEntity: async (
      entityType,
      id,
    ): Promise<Record<string, unknown> | null> => {
      const entity = await harness
        .getEntityService()
        .getEntity({ entityType, id });
      return entity ? { ...entity } : null;
    },
    templateNames: () => [...harness.getTemplates().keys()],
    reset: () => harness.reset(),
  };
}
