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

import { matchHttpRoute } from "@brains/utils/http-utils";
import {
  sdkErrorSchema,
  toSdkError,
  type SdkErrorCode,
} from "@brains/contracts";
export { SdkError, sdkErrorCodeSchema, sdkErrorSchema } from "@brains/plugins";
export type { SdkErrorCode, SdkErrorData } from "@brains/plugins";
import {
  createPluginHarness,
  declaredToolLocalName,
} from "@brains/plugins/test";
import {
  instantiatePluginPackageDefinition,
  type WebRouteDefinition,
  type Template,
  type SubscriptionRequester,
} from "@brains/plugins";

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
  /** The exact name in the author's declaration. */
  readonly localName: string;
  /** The name the runtime scoped it to. */
  readonly name: string;
  readonly description: string;
  /**
   * Call it, and read what it answered.
   *
   * Like a schema-bearing bus request, this discriminates on `ok`. Tools
   * report a human-readable `error`; requests report a stable failure `code`.
   * Pending approvals return `ok: false` with `confirmation`, not `error`.
   * Replay the confirmation args with the named tool to approve it.
   * A bare-topic bus request remains an untyped envelope.
   */
  call(input: unknown, caller?: TestCaller): Promise<ToolCallResult>;
}

/** What a tool answered: completed data, a refusal, or a pending approval. */
export type ToolCallResult =
  | { readonly ok: true; readonly data: unknown }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code: SdkErrorCode;
      /** Original thrown value for diagnostics; undefined for a non-thrown refusal. */
      readonly cause: unknown;
    }
  | { readonly ok: false; readonly confirmation: TestToolConfirmation };

/** An approval, not a refusal. Replay its args with the named tool to confirm. */
export interface TestToolConfirmation {
  readonly toolName: string;
  readonly summary: string;
  readonly args: unknown;
  readonly completionSummary?: string | undefined;
  readonly preview?: string | undefined;
}

/** What a package declared, once it is installed. */
export interface InstalledPackage {
  readonly tools: readonly InstalledTool[];
  tool(localName: string): InstalledTool;
  job(localName: string): InstalledPackage["jobs"][number];
  /** Registered jobs; run validates and executes one attempt, not queue retries. */
  readonly jobs: readonly {
    readonly name: string;
    readonly localName: string;
    run(input: unknown): Promise<unknown>;
  }[];
  readonly instructions: string | undefined;
}

/** A brain a test drives: install a package, seed records, ask it things. */
export interface BrainTestHarness {
  /**
   * Install what a package exports, configured the way a brain would.
   *
   * Takes the definition rather than a built plugin: instantiating one is
   * the runtime's job, and an author should not import the runtime to do it.
   * Failure rolls back all children from this installation, not earlier packages.
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
  /** Ask with a schema-bearing contract for parsed data or a coded failure. */
  readonly request: SubscriptionRequester;
  /** Announce over the bus, as the runtime would. */
  publish(topic: string, payload: unknown): Promise<void>;
  /** Put records in the brain for the package under test to read. */
  addEntities(entities: readonly SeededEntity[]): void;
  /** One record back, as the brain stores it. */
  getEntity(
    entityType: string,
    id: string,
  ): Promise<Record<string, unknown> | null>;
  /**
   * Make a request against what the installed packages serve.
   *
   * The route answers as it would in a running brain: its own security is
   * applied, its body and response are validated, and what comes back is the
   * parsed answer — or a `Response`, for a route that writes one itself.
   * A path nothing serves throws, rather than looking like an empty answer.
   */
  fetch(
    method: string,
    path: string,
    init?: {
      readonly body?: unknown;
      readonly headers?: Record<string, string> | undefined;
    },
  ): Promise<unknown>;
  /** Validate a value and format it with a registered text template. */
  formatTemplate(name: string, value: unknown): string;
  /** The scoped names of every template registered so far. */
  templateNames(): readonly string[];
  /** Tear down what the test installed. */
  reset(): Promise<void>;
}

/** How the brain a test drives is set up. */
export interface BrainTestHarnessOptions {
  /** The brain's domain, for a package whose routes or links depend on it. */
  readonly domain?: string | undefined;
  /** The declared profile kind selected by the brain; resolved at finalization. */
  readonly profileKind?: string | undefined;
}

function byLocalName<T extends { readonly localName: string }>(
  items: readonly T[],
  name: string,
  kind: string,
): T {
  const matches = items.filter((item) => item.localName === name);
  const item = matches[0];
  if (item && matches.length === 1) return item;
  const available =
    [...new Set(items.map((candidate) => candidate.localName))]
      .sort()
      .join(", ") || "(none)";
  throw new Error(
    `${matches.length ? "Ambiguous" : "No"} ${kind} "${name}". Available local names: ${available}`,
  );
}

export function createBrainTestHarness(
  options: BrainTestHarnessOptions = {},
): BrainTestHarness {
  const harness = createPluginHarness({
    ...(options.domain !== undefined ? { domain: options.domain } : {}),
    ...(options.profileKind !== undefined
      ? { profileKind: options.profileKind }
      : {}),
  });
  // A brain serves what every installed package declared, not only the last
  // one, so what each installs is kept as it is installed.
  const installedRoutes: WebRouteDefinition[] = [];
  const installedPluginIds = new Set<string>();
  const localTemplates = (): Array<{ localName: string; template: Template }> =>
    [...harness.getTemplates()].map(([name, template]) => {
      const owner = [...installedPluginIds].find((id) =>
        name.startsWith(`${id}:`),
      );
      return {
        localName: owner ? name.slice(owner.length + 1) : name,
        template,
      };
    });

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
      const jobs: InstalledPackage["jobs"][number][] = [];
      const installed = await harness.installPlugins(plugins);
      for (const { plugin, capabilities } of installed) {
        installedPluginIds.add(plugin.id);
        installedRoutes.push(...(plugin.getWebRoutes?.() ?? []));
        for (const type of harness
          .getMockShell()
          .getJobQueueService()
          .getRegisteredTypes()) {
          if (type.startsWith(`${plugin.id}:`)) {
            jobs.push({
              name: type,
              localName: type.slice(plugin.id.length + 1),
              run: async (input) => {
                try {
                  return await harness.runJob(type, input);
                } catch (error) {
                  throw toSdkError(error);
                }
              },
            });
          }
        }
        instructions ??= capabilities.instructions;
        for (const tool of capabilities.tools) {
          tools.push({
            name: tool.name,
            localName: declaredToolLocalName(tool),
            description: tool.description,
            call: async (input, caller) => {
              const answer = await harness.callTool(tool, input, {
                interfaceType: caller?.interfaceType ?? "test",
                actor: { kind: "service", serviceId: "test" },
                userPermissionLevel: caller?.permission ?? "admin",
              });
              if ("needsConfirmation" in answer) {
                const { needsConfirmation: _, ...confirmation } = answer;
                return { ok: false, confirmation };
              }
              if (!answer.success) {
                // This is an already-shaped tool response, not a thrown error.
                // Retain deliberate bounded messages; unknown codes still degrade safely.
                const parsed = sdkErrorSchema.safeParse({
                  code: answer.code,
                  message: answer.error,
                });
                const failure = parsed.success
                  ? parsed.data
                  : toSdkError(answer);
                return {
                  ok: false,
                  error: failure.message,
                  code: failure.code,
                  cause: harness.getToolFailureCause(answer),
                };
              }
              return { ok: true, data: answer.data };
            },
          });
        }
      }
      return {
        tools,
        jobs,
        instructions,
        tool: (name) => byLocalName(tools, name, "tool"),
        job: (name) => byLocalName(jobs, name, "job"),
      };
    },
    finalizeRegistration: () => harness.finalizeRegistration(),
    request: harness.request,
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
    fetch: async (method, path, init): Promise<unknown> => {
      const url = new URL(path, "https://test.brain");
      const route = matchHttpRoute(
        installedRoutes.filter(
          (candidate) => (candidate.method ?? "GET") === method.toUpperCase(),
        ),
        url.pathname,
        (candidate) => candidate,
      );
      if (!route) {
        throw new Error(`Nothing serves ${method} ${path}`);
      }
      const response = await route.handler(
        new Request(url, {
          method,
          headers: {
            ...(init?.body === undefined
              ? {}
              : { "content-type": "application/json" }),
            ...(init?.headers ?? {}),
          },
          ...(init?.body === undefined
            ? {}
            : { body: JSON.stringify(init.body) }),
        }),
      );
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) return response;
      return response.json();
    },
    formatTemplate: (name, value): string => {
      const { template } = byLocalName(localTemplates(), name, "template");
      if (!template.formatter)
        throw new Error(`No text formatter for "${name}"`);
      return template.formatter.format(template.schema.parse(value));
    },
    templateNames: () => localTemplates().map(({ localName }) => localName),
    reset: async (): Promise<void> => {
      installedRoutes.length = 0;
      installedPluginIds.clear();
      await harness.reset();
    },
  };
}
